"""Tests for DirectDine iteration-2 new endpoints:
- Featured restaurants
- Guest checkout (/api/orders/guest)
- Switch-to-owner (/api/auth/switch-to-owner)
- Courier invite flow (/api/couriers/invite, /invite/{token}, /accept-invite)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

OWNER1 = {"email": "owner1@directdine.com", "password": "password123"}
OWNER2 = {"email": "owner2@directdine.com", "password": "password123"}
CUSTOMER = {"email": "customer1@directdine.com", "password": "password123"}
COURIER = {"email": "courier1@directdine.com", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()


def h(auth):
    return {"Authorization": f"Bearer {auth['access_token']}"}


@pytest.fixture(scope="module")
def owner1_auth():
    return _login(OWNER1)


@pytest.fixture(scope="module")
def owner2_auth():
    return _login(OWNER2)


@pytest.fixture(scope="module")
def customer_auth():
    return _login(CUSTOMER)


@pytest.fixture(scope="module")
def courier_auth():
    return _login(COURIER)


# ---------- Featured restaurants ----------
class TestFeatured:
    def test_restaurants_have_featured_fields(self):
        r = requests.get(f"{API}/restaurants")
        assert r.status_code == 200
        rests = r.json()
        for rest in rests:
            assert 'is_featured' in rest
            assert 'featured_tagline' in rest

    def test_bella_and_sakura_featured(self):
        rests = requests.get(f"{API}/restaurants").json()
        by_name = {r['name']: r for r in rests}
        assert 'Bella Napoli Pizzeria' in by_name
        assert 'Sakura Sushi Bar' in by_name
        assert by_name['Bella Napoli Pizzeria']['is_featured'] is True
        assert by_name['Sakura Sushi Bar']['is_featured'] is True
        assert by_name['Bella Napoli Pizzeria']['featured_tagline']
        assert by_name['Sakura Sushi Bar']['featured_tagline']

    def test_smash_not_featured(self):
        rests = requests.get(f"{API}/restaurants").json()
        by_name = {r['name']: r for r in rests}
        assert by_name['Smash & Co. Burgers']['is_featured'] is False


# ---------- Guest checkout ----------
class TestGuestCheckout:
    def _get_bella_and_item(self):
        rests = requests.get(f"{API}/restaurants").json()
        bella = next(r for r in rests if r['name'] == 'Bella Napoli Pizzeria')
        menu = requests.get(f"{API}/restaurants/{bella['id']}/menu").json()
        return bella, menu[0]

    def test_guest_order_creates_user_and_order(self):
        bella, m = self._get_bella_and_item()
        email = f"TEST_guest_{uuid.uuid4().hex[:8]}@directdine.com"
        payload = {
            "name": "Guest Tester", "email": email, "phone": "+900",
            "password": "pw12345", "restaurant_id": bella['id'],
            "items": [{"menu_item_id": m['id'], "name": m['name'],
                       "price": m['price'], "quantity": 3}],
            "delivery_address": "Guest Addr", "delivery_lat": 41.0, "delivery_lng": 28.9,
            "notes": "guest note",
        }
        r = requests.post(f"{API}/orders/guest", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['access_token']
        assert data['user']['email'] == email.lower()
        assert data['user']['role'] == 'customer'

        # login with same creds must work
        li = requests.post(f"{API}/auth/login",
                           json={"email": email, "password": "pw12345"})
        assert li.status_code == 200

        # order shows up in /orders with correct total, status, payment_method
        orders = requests.get(f"{API}/orders", headers=h(li.json())).json()
        assert len(orders) == 1
        o = orders[0]
        assert o['status'] == 'pending'
        assert o['payment_method'] == 'cash_on_delivery'
        assert abs(o['total'] - m['price'] * 3) < 0.01
        assert o['restaurant_id'] == bella['id']

    def test_guest_order_existing_email_400(self, customer_auth):
        bella, m = self._get_bella_and_item()
        payload = {
            "name": "Dup", "email": CUSTOMER['email'], "phone": "+900",
            "password": "pw12345", "restaurant_id": bella['id'],
            "items": [{"menu_item_id": m['id'], "name": m['name'],
                       "price": m['price'], "quantity": 1}],
            "delivery_address": "x", "delivery_lat": 0, "delivery_lng": 0,
        }
        r = requests.post(f"{API}/orders/guest", json=payload)
        assert r.status_code == 400


# ---------- Switch to owner ----------
class TestSwitchToOwner:
    def test_customer_can_switch(self):
        # Create fresh customer via register
        email = f"TEST_switch_{uuid.uuid4().hex[:8]}@directdine.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pw12345",
            "name": "Switcher", "role": "customer",
        })
        assert r.status_code == 200
        auth = r.json()
        assert auth['user']['role'] == 'customer'

        r2 = requests.post(f"{API}/auth/switch-to-owner",
                           headers=h(auth),
                           json={"restaurant_name": "TEST Switched Diner"})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d['access_token'] and d['access_token'] != auth['access_token']
        assert d['user']['role'] == 'restaurant_owner'
        assert d['user']['restaurant_id']

        # Restaurant is retrievable
        rid = d['user']['restaurant_id']
        rr = requests.get(f"{API}/restaurants/{rid}")
        assert rr.status_code == 200
        assert rr.json()['name'] == "TEST Switched Diner"

    def test_owner_switch_fails_400(self, owner1_auth):
        r = requests.post(f"{API}/auth/switch-to-owner",
                          headers=h(owner1_auth),
                          json={"restaurant_name": "x"})
        assert r.status_code == 400

    def test_courier_switch_fails_400(self, courier_auth):
        r = requests.post(f"{API}/auth/switch-to-owner",
                          headers=h(courier_auth),
                          json={"restaurant_name": "x"})
        assert r.status_code == 400


# ---------- Courier invite flow ----------
class TestCourierInvite:
    def test_owner_creates_invite(self, owner2_auth):
        email = f"TEST_inv_{uuid.uuid4().hex[:8]}@directdine.com"
        r = requests.post(f"{API}/couriers/invite",
                          headers=h(owner2_auth),
                          json={"email": email, "name": "Invited Rider", "phone": "+900"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['invite_link'].endswith(f"/invite/{d['token']}")
        assert d['email'].lower() == email.lower()
        assert d['restaurant_name'] == "Smash & Co. Burgers"

        # GET invite info
        info = requests.get(f"{API}/couriers/invite/{d['token']}")
        assert info.status_code == 200
        ii = info.json()
        assert ii['email'].lower() == email.lower()
        assert ii['name'] == "Invited Rider"
        assert ii['restaurant_name'] == "Smash & Co. Burgers"

        # Accept invite
        acc = requests.post(f"{API}/couriers/accept-invite",
                            json={"token": d['token'], "password": "pw12345"})
        assert acc.status_code == 200, acc.text
        ad = acc.json()
        assert ad['user']['role'] == 'courier'
        assert ad['user']['restaurant_id'] == owner2_auth['user']['restaurant_id']

        # Second accept fails 404
        acc2 = requests.post(f"{API}/couriers/accept-invite",
                             json={"token": d['token'], "password": "pw12345"})
        assert acc2.status_code == 404

        # New courier can log in
        li = requests.post(f"{API}/auth/login",
                           json={"email": email, "password": "pw12345"})
        assert li.status_code == 200
        assert li.json()['user']['role'] == 'courier'

    def test_non_owner_cannot_invite(self, customer_auth):
        r = requests.post(f"{API}/couriers/invite",
                          headers=h(customer_auth),
                          json={"email": f"TEST_x_{uuid.uuid4().hex[:6]}@d.com",
                                "name": "X"})
        assert r.status_code == 403

    def test_courier_cannot_invite(self, courier_auth):
        r = requests.post(f"{API}/couriers/invite",
                          headers=h(courier_auth),
                          json={"email": f"TEST_x_{uuid.uuid4().hex[:6]}@d.com",
                                "name": "X"})
        assert r.status_code == 403

    def test_invalid_invite_token_404(self):
        r = requests.get(f"{API}/couriers/invite/nonexistent-token-abc")
        assert r.status_code == 404
