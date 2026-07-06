"""DirectDine iteration-4 tests:
- Resend email flag on courier invite (email_sent boolean)
- Address book CRUD (GET/POST/DELETE /api/addresses) with role gates
- Order cancel (POST /api/orders/{id}/cancel) with status + role gates
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
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.text}"
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
    a = _login(CUSTOMER)
    assert a['user']['role'] == 'customer', (
        f"customer1 role is {a['user']['role']}, expected 'customer'. "
        "Reset DB: mongosh test_database --eval 'db.users.updateOne(...)'"
    )
    return a


@pytest.fixture(scope="module")
def courier_auth():
    return _login(COURIER)


# ---------- Resend email flag ----------
class TestResendInviteEmail:
    def test_invite_returns_email_sent_false_for_sandbox_reject(self, owner1_auth):
        # Random @directdine.com will be rejected by Resend sandbox
        email = f"TEST_inv_{uuid.uuid4().hex[:8]}@directdine.com"
        r = requests.post(f"{API}/couriers/invite",
                          headers=h(owner1_auth),
                          json={"email": email, "name": "Rider", "phone": "+900"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert 'email_sent' in d, "response must include email_sent boolean"
        assert isinstance(d['email_sent'], bool)
        # Sandbox will refuse this address; ensure endpoint still returns 200 + link
        assert d['invite_link'].endswith(f"/invite/{d['token']}")
        assert d['email_sent'] is False

    def test_invite_never_500s(self, owner1_auth):
        # A well-formed email that will fail Resend sandbox delivery — must
        # still return 200 with invite payload (email_sent False), never 500.
        email = f"TEST_never500_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/couriers/invite",
                          headers=h(owner1_auth),
                          json={"email": email, "name": "Rider"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['invite_link']
        assert d['email_sent'] is False


# ---------- Address book ----------
class TestAddressBook:
    def test_guest_get_401(self):
        r = requests.get(f"{API}/addresses")
        assert r.status_code in (401, 403)  # unauth

    def test_owner_get_403(self, owner1_auth):
        r = requests.get(f"{API}/addresses", headers=h(owner1_auth))
        assert r.status_code == 403

    def test_courier_get_403(self, courier_auth):
        r = requests.get(f"{API}/addresses", headers=h(courier_auth))
        assert r.status_code == 403

    def test_customer_get_returns_list(self, customer_auth):
        r = requests.get(f"{API}/addresses", headers=h(customer_auth))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_owner_post_403(self, owner1_auth):
        r = requests.post(f"{API}/addresses",
                          headers=h(owner1_auth),
                          json={"label": "Home", "address": "x",
                                "extra": "", "lat": 41.0, "lng": 28.9})
        assert r.status_code == 403

    def test_customer_post_and_get(self, customer_auth):
        payload = {"label": "Home", "address": "TEST_addr_home",
                   "extra": "Apt 1", "lat": 41.01, "lng": 28.98}
        r = requests.post(f"{API}/addresses", headers=h(customer_auth),
                          json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['id'] and d['label'] == 'Home'
        assert d['address'] == 'TEST_addr_home'
        assert d['extra'] == 'Apt 1'
        assert abs(d['lat'] - 41.01) < 1e-6
        # verify persistence
        lst = requests.get(f"{API}/addresses", headers=h(customer_auth)).json()
        assert any(a['id'] == d['id'] for a in lst)

    def test_customer_cannot_delete_other_customers_address(self, customer_auth):
        # Create a fresh customer B, insert address, try delete as customer1
        email = f"TEST_cust_{uuid.uuid4().hex[:8]}@directdine.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pw12345",
            "name": "Cust B", "role": "customer",
        })
        assert reg.status_code == 200
        b_auth = reg.json()
        b_addr = requests.post(f"{API}/addresses", headers=h(b_auth),
                               json={"label": "Work", "address": "TEST_b",
                                     "extra": "", "lat": 41.0, "lng": 28.9}).json()
        # Try delete as customer1 -> 404 (scoped to own user_id)
        r = requests.delete(f"{API}/addresses/{b_addr['id']}",
                            headers=h(customer_auth))
        assert r.status_code in (403, 404)
        # Verify still exists for B
        b_list = requests.get(f"{API}/addresses", headers=h(b_auth)).json()
        assert any(a['id'] == b_addr['id'] for a in b_list)
        # Cleanup
        requests.delete(f"{API}/addresses/{b_addr['id']}", headers=h(b_auth))

    def test_customer_delete_own(self, customer_auth):
        # Create then delete
        d = requests.post(f"{API}/addresses", headers=h(customer_auth),
                          json={"label": "Other", "address": "TEST_del",
                                "extra": "", "lat": 41, "lng": 29}).json()
        r = requests.delete(f"{API}/addresses/{d['id']}",
                            headers=h(customer_auth))
        assert r.status_code == 200
        # verify gone
        lst = requests.get(f"{API}/addresses", headers=h(customer_auth)).json()
        assert not any(a['id'] == d['id'] for a in lst)

    def test_addresses_scoped_per_user(self, customer_auth):
        # customer1 shouldn't see other users' addresses. Create fresh cust and
        # ensure customer1 list doesn't include their address.
        email = f"TEST_iso_{uuid.uuid4().hex[:8]}@directdine.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pw12345",
            "name": "Iso", "role": "customer",
        }).json()
        addr = requests.post(f"{API}/addresses", headers=h(reg),
                             json={"label": "Home", "address": "TEST_iso_addr",
                                   "extra": "", "lat": 1, "lng": 2}).json()
        my_list = requests.get(f"{API}/addresses",
                               headers=h(customer_auth)).json()
        assert not any(a['id'] == addr['id'] for a in my_list)


# ---------- Order Cancel ----------
class TestOrderCancel:
    def _create_order_as_customer(self, customer_auth):
        rests = requests.get(f"{API}/restaurants").json()
        bella = next(r for r in rests if r['name'] == 'Bella Napoli Pizzeria')
        menu = requests.get(f"{API}/restaurants/{bella['id']}/menu").json()
        m = menu[0]
        payload = {
            "restaurant_id": bella['id'],
            "items": [{"menu_item_id": m['id'], "name": m['name'],
                       "price": m['price'], "quantity": 1}],
            "delivery_address": "TEST_cancel_addr",
            "delivery_lat": 41.0, "delivery_lng": 28.9,
            "notes": "cancel-test",
        }
        r = requests.post(f"{API}/orders", headers=h(customer_auth),
                          json=payload)
        assert r.status_code == 200, r.text
        return r.json(), bella

    def test_cancel_pending_success(self, customer_auth):
        order, _ = self._create_order_as_customer(customer_auth)
        assert order['status'] == 'pending'
        r = requests.post(f"{API}/orders/{order['id']}/cancel",
                          headers=h(customer_auth))
        assert r.status_code == 200, r.text
        assert r.json()['status'] == 'cancelled'

    def test_cancel_accepted_success(self, customer_auth, owner1_auth):
        order, _ = self._create_order_as_customer(customer_auth)
        # owner accepts
        r = requests.post(f"{API}/orders/{order['id']}/status",
                        headers=h(owner1_auth),
                        json={"status": "accepted"})
        assert r.status_code == 200
        # customer cancels
        c = requests.post(f"{API}/orders/{order['id']}/cancel",
                          headers=h(customer_auth))
        assert c.status_code == 200
        assert c.json()['status'] == 'cancelled'

    def test_cancel_preparing_400(self, customer_auth, owner1_auth):
        order, _ = self._create_order_as_customer(customer_auth)
        for st in ('accepted', 'preparing'):
            r = requests.post(f"{API}/orders/{order['id']}/status",
                            headers=h(owner1_auth), json={"status": st})
            assert r.status_code == 200
        r = requests.post(f"{API}/orders/{order['id']}/cancel",
                          headers=h(customer_auth))
        assert r.status_code == 400

    def test_cancel_already_cancelled_400(self, customer_auth):
        order, _ = self._create_order_as_customer(customer_auth)
        r1 = requests.post(f"{API}/orders/{order['id']}/cancel",
                           headers=h(customer_auth))
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/orders/{order['id']}/cancel",
                           headers=h(customer_auth))
        assert r2.status_code == 400

    def test_cancel_other_customer_403(self, customer_auth):
        # customer1 creates order; different customer tries to cancel -> 403
        order, _ = self._create_order_as_customer(customer_auth)
        email = f"TEST_other_{uuid.uuid4().hex[:8]}@directdine.com"
        other = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pw12345",
            "name": "Other", "role": "customer",
        }).json()
        r = requests.post(f"{API}/orders/{order['id']}/cancel",
                          headers=h(other))
        assert r.status_code == 403
        # cleanup: cancel with real owner
        requests.post(f"{API}/orders/{order['id']}/cancel",
                      headers=h(customer_auth))

    def test_cancel_owner_403(self, customer_auth, owner1_auth):
        order, _ = self._create_order_as_customer(customer_auth)
        r = requests.post(f"{API}/orders/{order['id']}/cancel",
                          headers=h(owner1_auth))
        assert r.status_code == 403

    def test_cancel_courier_403(self, customer_auth, courier_auth):
        order, _ = self._create_order_as_customer(customer_auth)
        r = requests.post(f"{API}/orders/{order['id']}/cancel",
                          headers=h(courier_auth))
        assert r.status_code == 403

    def test_cancel_unknown_404(self, customer_auth):
        r = requests.post(f"{API}/orders/nonexistent-xyz/cancel",
                          headers=h(customer_auth))
        assert r.status_code == 404
