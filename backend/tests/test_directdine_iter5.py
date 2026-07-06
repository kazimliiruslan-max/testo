"""DirectDine iteration-5 tests:
- Lat/lng flows through /api/orders (auth + guest) and is preserved on GET
- Full order lifecycle transitions (pending → accepted → preparing → assign courier
  → out_for_delivery → delivered) succeed with correct actors
- Assignment of a courier auto-transitions status to out_for_delivery
- No schema drift on Order model (fields present and typed correctly)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

OWNER1 = {"email": "owner1@directdine.com", "password": "password123"}
CUSTOMER = {"email": "customer1@directdine.com", "password": "password123"}
COURIER = {"email": "courier1@directdine.com", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def h(auth):
    return {"Authorization": f"Bearer {auth['access_token']}"}


@pytest.fixture(scope="module")
def owner_auth():
    return _login(OWNER1)


@pytest.fixture(scope="module")
def customer_auth():
    a = _login(CUSTOMER)
    assert a['user']['role'] == 'customer', (
        f"customer1 role={a['user']['role']}, expected 'customer'. "
        "Reset via mongosh."
    )
    return a


@pytest.fixture(scope="module")
def courier_auth():
    return _login(COURIER)


@pytest.fixture(scope="module")
def bella():
    rests = requests.get(f"{API}/restaurants").json()
    return next(r for r in rests if r['name'] == 'Bella Napoli Pizzeria')


@pytest.fixture(scope="module")
def menu_item(bella):
    menu = requests.get(f"{API}/restaurants/{bella['id']}/menu").json()
    return menu[0]


LAT = 41.0369
LNG = 28.9850
ADDR = "TEST_iter5 42 Ap 3 — 3rd floor"


class TestLatLngFlow:
    def test_customer_post_order_persists_lat_lng(
        self, customer_auth, bella, menu_item, owner_auth
    ):
        payload = {
            "restaurant_id": bella['id'],
            "items": [{"menu_item_id": menu_item['id'],
                       "name": menu_item['name'],
                       "price": menu_item['price'],
                       "quantity": 1}],
            "delivery_address": ADDR,
            "delivery_lat": LAT,
            "delivery_lng": LNG,
            "notes": "iter5-lat-lng",
        }
        r = requests.post(f"{API}/orders", headers=h(customer_auth),
                          json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['delivery_address'] == ADDR
        assert abs(d['delivery_lat'] - LAT) < 1e-6
        assert abs(d['delivery_lng'] - LNG) < 1e-6
        assert d['status'] == 'pending'

        # Owner GET /api/orders must include exact same fields
        owner_orders = requests.get(f"{API}/orders",
                                    headers=h(owner_auth)).json()
        me = next((o for o in owner_orders if o['id'] == d['id']), None)
        assert me is not None, "order not in owner list"
        assert me['delivery_address'] == ADDR
        assert abs(me['delivery_lat'] - LAT) < 1e-6
        assert abs(me['delivery_lng'] - LNG) < 1e-6

        # cancel for cleanup
        requests.post(f"{API}/orders/{d['id']}/cancel",
                      headers=h(customer_auth))

    def test_guest_post_order_persists_lat_lng(self, bella, menu_item,
                                               owner_auth):
        payload = {
            "restaurant_id": bella['id'],
            "items": [{"menu_item_id": menu_item['id'],
                       "name": menu_item['name'],
                       "price": menu_item['price'],
                       "quantity": 2}],
            "delivery_address": ADDR + " (guest)",
            "delivery_lat": LAT,
            "delivery_lng": LNG,
            "name": "TEST Guest",
            "email": f"TEST_guest_{uuid.uuid4().hex[:8]}@example.com",
            "phone": "+900000000",
            "password": "pw12345",
        }
        r = requests.post(f"{API}/orders/guest", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        # /orders/guest returns AuthResponse (token + user), not the order
        assert 'access_token' in d and 'user' in d
        assert d['user']['role'] == 'customer'

        # Owner sees it — find by delivery_address
        owner_orders = requests.get(f"{API}/orders",
                                    headers=h(owner_auth)).json()
        me = next((o for o in owner_orders
                   if o.get('delivery_address') == ADDR + " (guest)"
                   and o.get('customer_id') == d['user']['id']), None)
        assert me is not None, "guest order not visible to owner"
        assert abs(me['delivery_lat'] - LAT) < 1e-6
        assert abs(me['delivery_lng'] - LNG) < 1e-6

    def test_order_schema_no_drift(self, customer_auth, bella, menu_item):
        payload = {
            "restaurant_id": bella['id'],
            "items": [{"menu_item_id": menu_item['id'],
                       "name": menu_item['name'],
                       "price": menu_item['price'],
                       "quantity": 1}],
            "delivery_address": ADDR,
            "delivery_lat": LAT,
            "delivery_lng": LNG,
        }
        r = requests.post(f"{API}/orders", headers=h(customer_auth),
                          json=payload)
        assert r.status_code == 200
        d = r.json()
        # All expected fields must be present
        for f in ('id', 'restaurant_id', 'status', 'items', 'total',
                  'delivery_address', 'delivery_lat', 'delivery_lng',
                  'created_at'):
            assert f in d, f"missing field: {f}"
        assert isinstance(d['delivery_lat'], (float, int))
        assert isinstance(d['delivery_lng'], (float, int))
        # cleanup
        requests.post(f"{API}/orders/{d['id']}/cancel",
                      headers=h(customer_auth))


class TestFullLifecycle:
    def test_pending_to_delivered_with_courier_assignment(
        self, customer_auth, owner_auth, courier_auth, bella, menu_item
    ):
        # 1. customer places order
        payload = {
            "restaurant_id": bella['id'],
            "items": [{"menu_item_id": menu_item['id'],
                       "name": menu_item['name'],
                       "price": menu_item['price'],
                       "quantity": 1}],
            "delivery_address": ADDR,
            "delivery_lat": LAT,
            "delivery_lng": LNG,
            "notes": "iter5-lifecycle",
        }
        r = requests.post(f"{API}/orders", headers=h(customer_auth),
                          json=payload)
        assert r.status_code == 200, r.text
        order = r.json()
        oid = order['id']
        assert order['status'] == 'pending'

        # 2. owner accepts
        r = requests.post(f"{API}/orders/{oid}/status",
                          headers=h(owner_auth),
                          json={"status": "accepted"})
        assert r.status_code == 200, r.text
        assert r.json()['status'] == 'accepted'

        # 3. owner preparing
        r = requests.post(f"{API}/orders/{oid}/status",
                          headers=h(owner_auth),
                          json={"status": "preparing"})
        assert r.status_code == 200
        assert r.json()['status'] == 'preparing'

        # 4. owner assigns courier — expect auto-set to out_for_delivery
        # courier user id
        me = requests.get(f"{API}/auth/me",
                          headers=h(courier_auth)).json()
        courier_uid = me['id']
        r = requests.post(f"{API}/orders/{oid}/assign",
                          headers=h(owner_auth),
                          json={"courier_id": courier_uid})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get('courier_id') == courier_uid
        assert d['status'] == 'out_for_delivery', (
            f"expected out_for_delivery after assignment, got {d['status']}"
        )

        # 5. courier marks delivered
        r = requests.post(f"{API}/orders/{oid}/status",
                          headers=h(courier_auth),
                          json={"status": "delivered"})
        assert r.status_code == 200, r.text
        assert r.json()['status'] == 'delivered'

        # 6. GET verifies persistence + lat/lng preserved through lifecycle
        owner_orders = requests.get(f"{API}/orders",
                                    headers=h(owner_auth)).json()
        me_o = next((o for o in owner_orders if o['id'] == oid), None)
        assert me_o is not None
        assert me_o['status'] == 'delivered'
        assert abs(me_o['delivery_lat'] - LAT) < 1e-6
        assert abs(me_o['delivery_lng'] - LNG) < 1e-6
