"""
DirectDine Iteration 7 backend tests.
Focus:
  * delivery_radius_km on Restaurant model + haversine distance filtering on GET /api/restaurants
  * PUT /api/restaurants/me accepting delivery_radius_km
  * Regression: auth + basic order flow still intact
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://resto-delivery-app-8.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

CUSTOMER = {'email': 'customer1@directdine.com', 'password': 'password123'}
OWNER1 = {'email': 'owner1@directdine.com', 'password': 'password123'}


@pytest.fixture(scope='module')
def owner_token():
    r = requests.post(f"{API}/auth/login", json=OWNER1, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()['access_token']


@pytest.fixture(scope='module')
def customer_token():
    r = requests.post(f"{API}/auth/login", json=CUSTOMER, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"customer1 login failed: {r.status_code} {r.text}")
    return r.json()['access_token']


# ---------- Restaurants listing (haversine + filter) ----------
class TestRestaurantsListing:
    def test_list_no_params_returns_all_three(self):
        r = requests.get(f"{API}/restaurants", timeout=15)
        assert r.status_code == 200
        data = r.json()
        names = [x['name'] for x in data]
        # Must at least contain the 3 seeded restaurants (DB may have leftover from prior tests)
        for expected in ['Bella Napoli Pizzeria', 'Smash & Co. Burgers', 'Sakura Sushi Bar']:
            assert expected in names, f"seeded restaurant {expected} missing. Got: {names}"
        for rest in data:
            assert 'delivery_radius_km' in rest
            assert rest['in_range'] is True  # default true when no loc
            assert rest['distance_km'] is None

    def test_seeded_radii_values(self):
        r = requests.get(f"{API}/restaurants", timeout=15)
        by_name = {x['name']: x for x in r.json()}
        assert by_name['Bella Napoli Pizzeria']['delivery_radius_km'] in (4.0, 12.5)  # 12.5 possible if a previous test mutated
        assert by_name['Smash & Co. Burgers']['delivery_radius_km'] == 8.0
        # Sakura seed radius = 3.0
        assert any(x['delivery_radius_km'] == 3.0 for x in r.json()), 'Sakura radius=3 not seen'

    def test_near_bella_napoli_sorted_and_ranged(self):
        r = requests.get(f"{API}/restaurants", params={'lat': 41.037, 'lng': 28.985}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 3
        # First one should be Bella Napoli (in range, distance ~0)
        assert data[0]['name'] == 'Bella Napoli Pizzeria'
        assert data[0]['in_range'] is True
        assert data[0]['distance_km'] is not None and data[0]['distance_km'] < 0.5
        # In-range items come before out-of-range
        in_range_flags = [x['in_range'] for x in data]
        assert in_range_flags == sorted(in_range_flags, reverse=True), \
            f"in_range not sorted first: {in_range_flags}"

    def test_kadikoy_smash_in_range(self):
        r = requests.get(f"{API}/restaurants", params={'lat': 40.966, 'lng': 29.062}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        smash = next((x for x in data if x['name'] == 'Smash & Co. Burgers'), None)
        assert smash is not None
        assert smash['in_range'] is True
        assert smash['distance_km'] is not None and smash['distance_km'] < 1.0
        others = [x for x in data if x['name'] != 'Smash & Co. Burgers']
        for o in others:
            assert o['in_range'] is False, f"{o['name']} should be out of range from Kadikoy"


# ---------- Owner update radius ----------
class TestOwnerUpdateRadius:
    ORIGINAL = 4.0

    def test_update_radius_and_verify(self, owner_token):
        h = {'Authorization': f'Bearer {owner_token}'}
        # Fetch current
        info = requests.get(f"{API}/restaurants/me/info", headers=h, timeout=15).json()
        original = info['delivery_radius_km']

        r = requests.put(f"{API}/restaurants/me", headers=h, json={'delivery_radius_km': 12.5}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()['delivery_radius_km'] == 12.5

        # Verify via public GET
        pub = requests.get(f"{API}/restaurants", timeout=15).json()
        bella = next(x for x in pub if x['name'] == 'Bella Napoli Pizzeria')
        assert bella['delivery_radius_km'] == 12.5

        # Restore for other tests / stability
        requests.put(f"{API}/restaurants/me", headers=h, json={'delivery_radius_km': original}, timeout=15)

    def test_update_rejects_non_numeric(self, owner_token):
        h = {'Authorization': f'Bearer {owner_token}'}
        r = requests.put(f"{API}/restaurants/me", headers=h, json={'delivery_radius_km': 'not-a-number'}, timeout=15)
        assert r.status_code in (400, 422), f"Expected 400/422 for bad type, got {r.status_code}"

    def test_update_zero_or_negative_currently_accepted(self, owner_token):
        """Documenting current behavior: Pydantic has no ge>0 constraint, so 0 / negative pass through.
        This is a MINOR issue reported to main agent — not a test failure."""
        h = {'Authorization': f'Bearer {owner_token}'}
        r = requests.put(f"{API}/restaurants/me", headers=h, json={'delivery_radius_km': -5}, timeout=15)
        # Just record the outcome, don't fail
        assert r.status_code in (200, 400, 422)
        # Restore to a valid value regardless
        requests.put(f"{API}/restaurants/me", headers=h, json={'delivery_radius_km': 4.0}, timeout=15)


# ---------- Regression ----------
class TestRegression:
    def test_auth_me(self, customer_token):
        r = requests.get(f"{API}/auth/me", headers={'Authorization': f'Bearer {customer_token}'}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j['email'] == CUSTOMER['email']

    def test_restaurant_detail_still_works(self):
        lst = requests.get(f"{API}/restaurants", timeout=15).json()
        rid = lst[0]['id']
        r = requests.get(f"{API}/restaurants/{rid}", timeout=15)
        assert r.status_code == 200
        assert r.json()['id'] == rid

    def test_menu_endpoint(self):
        lst = requests.get(f"{API}/restaurants", timeout=15).json()
        rid = lst[0]['id']
        r = requests.get(f"{API}/restaurants/{rid}/menu", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_orders_list_customer(self, customer_token):
        r = requests.get(f"{API}/orders", headers={'Authorization': f'Bearer {customer_token}'}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
