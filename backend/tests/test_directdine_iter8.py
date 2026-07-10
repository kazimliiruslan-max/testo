"""
DirectDine iteration 8 backend tests.
Focus:
  * POST /api/menu image_base64 support (stored as data URL)
  * POST /api/menu still accepts image_url (regression)
  * GET /api/owner/stats?period=week|month:
      - permissions (401 unauth, 403 customer, 400 invalid)
      - defaults to 'month'
      - response shape + change_pct math
      - null change_pct when previous_total==0
  * Regression: prior iter7 flows still work
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone

# --- Mongo direct access for seeding delivered orders across time windows
from pymongo import MongoClient

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

CUSTOMER = {'email': 'customer1@directdine.com', 'password': 'password123'}
OWNER1 = {'email': 'owner1@directdine.com', 'password': 'password123'}

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

# Tiny valid 1x1 JPEG in base64 (well-known test image)
TINY_JPEG_B64 = (
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy"
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA"
    "AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA"
    "AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3"
    "ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm"
    "p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEB"
    "AAA/APn+iiigD//Z"
)


# ---------- fixtures ----------
@pytest.fixture(scope='module')
def owner_token():
    r = requests.post(f"{API}/auth/login", json=OWNER1, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()['access_token']


@pytest.fixture(scope='module')
def customer_token():
    r = requests.post(f"{API}/auth/login", json=CUSTOMER, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()['access_token']


@pytest.fixture(scope='module')
def owner_restaurant_id(owner_token):
    r = requests.get(f"{API}/restaurants/me/info", headers={'Authorization': f'Bearer {owner_token}'}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()['id']


@pytest.fixture(scope='module')
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


# =====================================================================
# 1) MENU image_base64
# =====================================================================
class TestMenuImageBase64:
    _created_ids: list = []

    def test_create_menu_with_raw_base64(self, owner_token, owner_restaurant_id):
        h = {'Authorization': f'Bearer {owner_token}'}
        payload = {'name': 'TEST_IMG_ITEM_b64', 'price': 15.5, 'image_base64': TINY_JPEG_B64}
        r = requests.post(f"{API}/menu", headers=h, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        self._created_ids.append(j['id'])
        assert j['name'] == 'TEST_IMG_ITEM_b64'
        assert j['price'] == 15.5
        assert isinstance(j['image_url'], str)
        assert j['image_url'].startswith('data:image/jpeg;base64,'), \
            f"expected data URL, got: {j['image_url'][:60]}..."
        # Payload bytes should follow the prefix
        assert TINY_JPEG_B64 in j['image_url']

    def test_create_menu_with_data_url_base64(self, owner_token):
        h = {'Authorization': f'Bearer {owner_token}'}
        data_url = f"data:image/png;base64,{TINY_JPEG_B64}"  # server should keep prefix as-is
        payload = {'name': 'TEST_IMG_ITEM_dataurl', 'price': 20.0, 'image_base64': data_url}
        r = requests.post(f"{API}/menu", headers=h, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        self._created_ids.append(j['id'])
        assert j['image_url'].startswith('data:image/png;base64,') or j['image_url'].startswith('data:image/jpeg;base64,')
        # Server logic: if already startswith 'data:' → keep as-is
        assert j['image_url'].startswith('data:')

    def test_image_url_still_works(self, owner_token):
        h = {'Authorization': f'Bearer {owner_token}'}
        payload = {'name': 'TEST_IMG_ITEM_url', 'price': 9.99, 'image_url': 'https://x.jpg'}
        r = requests.post(f"{API}/menu", headers=h, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        self._created_ids.append(j['id'])
        assert j['image_url'] == 'https://x.jpg'

    def test_data_url_appears_in_listing(self, owner_token, owner_restaurant_id):
        r = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=15)
        assert r.status_code == 200
        items = r.json()
        names = {i['name']: i for i in items}
        assert 'TEST_IMG_ITEM_b64' in names
        assert names['TEST_IMG_ITEM_b64']['image_url'].startswith('data:image/jpeg;base64,')

    def test_cleanup(self, owner_token):
        h = {'Authorization': f'Bearer {owner_token}'}
        for iid in list(self._created_ids):
            requests.delete(f"{API}/menu/{iid}", headers=h, timeout=15)
        self._created_ids.clear()


# =====================================================================
# 2) OWNER STATS — permissions & validation
# =====================================================================
class TestOwnerStatsAuth:
    def test_unauth_401(self):
        r = requests.get(f"{API}/owner/stats", timeout=15)
        assert r.status_code in (401, 403)  # FastAPI dependency may raise 401 or 403

    def test_customer_forbidden(self, customer_token):
        r = requests.get(f"{API}/owner/stats", headers={'Authorization': f'Bearer {customer_token}'}, timeout=15)
        assert r.status_code == 403, r.text

    def test_invalid_period_400(self, owner_token):
        r = requests.get(f"{API}/owner/stats?period=day",
                         headers={'Authorization': f'Bearer {owner_token}'}, timeout=15)
        assert r.status_code == 400, r.text

    def test_default_period_month(self, owner_token):
        r = requests.get(f"{API}/owner/stats", headers={'Authorization': f'Bearer {owner_token}'}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j['period'] == 'month'


# =====================================================================
# 3) OWNER STATS — seeded orders across time windows
# =====================================================================
def _seed_orders(restaurant_id, restaurant_name, customer_id, customer_name, entries):
    """entries: list of (total, days_ago, items[list of dict]). Returns list of Order docs matching schema."""
    docs = []
    now = datetime.now(timezone.utc)
    for total, days_ago, items in entries:
        created = (now - timedelta(days=days_ago)).isoformat()
        items_full = []
        for it in items:
            items_full.append({
                'menu_item_id': str(uuid.uuid4()),
                'name': it['name'],
                'quantity': it['quantity'],
                'price': it['price'],
            })
        doc = {
            'id': str(uuid.uuid4()),
            'restaurant_id': restaurant_id,
            'restaurant_name': restaurant_name,
            'customer_id': customer_id,
            'customer_name': customer_name,
            'customer_phone': '+900000000000',
            'items': items_full,
            'total': total,
            'status': 'delivered',
            'created_at': created,
            'updated_at': created,
            'delivery_address': 'TEST ADDR',
            'delivery_lat': 41.037,
            'delivery_lng': 28.985,
            'payment_method': 'cash',
            'notes': '',
            'courier_id': None,
            'courier_name': None,
            'is_test_seed': True,
        }
        docs.append(doc)
    return docs


class TestOwnerStatsShape:
    _restaurant_id: str = ''
    _restaurant_name: str = ''
    _customer_id: str = ''
    _customer_name: str = ''
    _inserted_ids: list = []

    @pytest.fixture(autouse=True, scope='class')
    def _seed(self, request, owner_token, customer_token, mongo, owner_restaurant_id):
        cls = request.cls
        cls._restaurant_id = owner_restaurant_id
        # Get restaurant name
        rlist = requests.get(f"{API}/restaurants", timeout=15).json()
        cls._restaurant_name = next((x['name'] for x in rlist if x['id'] == owner_restaurant_id), 'TEST_R')

        # Get customer id + name via /auth/me
        me = requests.get(f"{API}/auth/me", headers={'Authorization': f'Bearer {customer_token}'}, timeout=15).json()
        cls._customer_id = me['id']
        cls._customer_name = me.get('name', 'TEST_C')

        # Belt-and-suspenders cleanup any prior test seeds first
        mongo.orders.delete_many({'is_test_seed': True})

        entries = [
            (100.0, 1,  [{'name': 'Pizza',  'quantity': 5, 'price': 20.0}]),
            (150.0, 3,  [{'name': 'Pizza',  'quantity': 2, 'price': 20.0}, {'name': 'Burger', 'quantity': 3, 'price': 30.0}]),
            (200.0, 10, [{'name': 'Salad',  'quantity': 4, 'price': 50.0}]),
            (100.0, 35, [{'name': 'Soda',   'quantity': 1, 'price': 100.0}]),
            (100.0, 40, [{'name': 'Soda',   'quantity': 1, 'price': 100.0}]),
        ]
        docs = _seed_orders(cls._restaurant_id, cls._restaurant_name,
                            cls._customer_id, cls._customer_name, entries)
        mongo.orders.insert_many(docs)
        cls._inserted_ids = [d['id'] for d in docs]

        yield

        # Cleanup all test seeds
        mongo.orders.delete_many({'is_test_seed': True})

    def test_month_stats(self, owner_token):
        r = requests.get(f"{API}/owner/stats?period=month",
                         headers={'Authorization': f'Bearer {owner_token}'}, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ['period', 'current_total', 'current_orders', 'current_avg',
                  'previous_total', 'previous_orders', 'change_pct',
                  'top_item', 'top_item_count']:
            assert k in j, f"missing key {k} in {j}"
        assert j['period'] == 'month'
        # Current 30d ≥ 3 seeded delivered orders (may include prior real delivered orders)
        assert j['current_orders'] >= 3
        assert j['previous_orders'] >= 2
        assert j['current_total'] + 0.01 >= 450.0
        assert j['previous_total'] + 0.01 >= 200.0
        # change_pct math sanity: (curr-prev)/prev*100 rounded to 1 decimal
        if j['previous_total'] > 0:
            expected = round((j['current_total'] - j['previous_total']) / j['previous_total'] * 100.0, 1)
            assert j['change_pct'] == expected, f"got {j['change_pct']} expected {expected}"
        # top_item present when there are items
        assert isinstance(j['top_item'], str) and len(j['top_item']) > 0
        assert isinstance(j['top_item_count'], int) and j['top_item_count'] >= 1

    def test_week_stats(self, owner_token):
        r = requests.get(f"{API}/owner/stats?period=week",
                         headers={'Authorization': f'Bearer {owner_token}'}, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j['period'] == 'week'
        # Only 2 seeds (days_ago=1 & 3) in current-week; 1 seed (10d) in previous-week
        assert j['current_orders'] >= 2
        assert j['previous_orders'] >= 1
        assert j['current_total'] + 0.01 >= 250.0
        assert j['previous_total'] + 0.01 >= 200.0
        if j['previous_total'] > 0:
            expected = round((j['current_total'] - j['previous_total']) / j['previous_total'] * 100.0, 1)
            assert j['change_pct'] == expected

    def test_change_pct_null_when_previous_zero(self, owner_token, mongo):
        # Remove ONLY our own previous-window seeds; if no non-seed orders exist there, change_pct must be null.
        rid = self._restaurant_id
        now = datetime.now(timezone.utc)
        cutoff_start = (now - timedelta(days=60)).isoformat()
        cutoff_end = (now - timedelta(days=30)).isoformat()

        prev_seed_docs = list(mongo.orders.find(
            {'restaurant_id': rid, 'status': 'delivered',
             'created_at': {'$gte': cutoff_start, '$lt': cutoff_end},
             'is_test_seed': True}, {'_id': 0}
        ))
        prev_seed_ids = [d['id'] for d in prev_seed_docs]
        if prev_seed_ids:
            mongo.orders.delete_many({'id': {'$in': prev_seed_ids}})

        # Any non-seed delivered orders lurking in previous-month window?
        leftover = mongo.orders.count_documents(
            {'restaurant_id': rid, 'status': 'delivered',
             'created_at': {'$gte': cutoff_start, '$lt': cutoff_end}}
        )

        r = requests.get(f"{API}/owner/stats?period=month",
                         headers={'Authorization': f'Bearer {owner_token}'}, timeout=15)
        assert r.status_code == 200
        j = r.json()

        # Restore before assertions may fail
        if prev_seed_docs:
            mongo.orders.insert_many(prev_seed_docs)

        if leftover == 0:
            assert j['previous_total'] == 0.0
            assert j['change_pct'] is None, f"change_pct should be null when previous_total is 0, got {j}"
        else:
            pytest.skip(f"Cannot verify null change_pct: {leftover} non-seed delivered orders in previous window")


# =====================================================================
# 4) REGRESSION — ensure nothing broken
# =====================================================================
class TestRegression:
    def test_login_customer(self):
        r = requests.post(f"{API}/auth/login", json=CUSTOMER, timeout=15)
        assert r.status_code == 200
        assert 'access_token' in r.json()

    def test_restaurants_list(self):
        r = requests.get(f"{API}/restaurants", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3

    def test_orders_list_customer(self, customer_token):
        r = requests.get(f"{API}/orders", headers={'Authorization': f'Bearer {customer_token}'}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_owner_menu_listing(self, owner_token, owner_restaurant_id):
        r = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
