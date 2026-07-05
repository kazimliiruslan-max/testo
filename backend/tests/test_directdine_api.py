"""DirectDine API backend tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://resto-delivery-app-8.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer1@directdine.com", "password": "password123"}
OWNER1 = {"email": "owner1@directdine.com", "password": "password123"}
OWNER2 = {"email": "owner2@directdine.com", "password": "password123"}
COURIER = {"email": "courier1@directdine.com", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def customer_auth():
    return _login(CUSTOMER)


@pytest.fixture(scope="session")
def owner1_auth():
    return _login(OWNER1)


@pytest.fixture(scope="session")
def owner2_auth():
    return _login(OWNER2)


@pytest.fixture(scope="session")
def courier_auth():
    return _login(COURIER)


def h(auth):
    return {"Authorization": f"Bearer {auth['access_token']}"}


# ---------- Auth ----------
class TestAuth:
    def test_register_customer(self):
        email = f"TEST_cust_{uuid.uuid4().hex[:8]}@directdine.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pw12345", "name": "Test C", "role": "customer"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "customer"
        assert data["access_token"]

    def test_register_owner_creates_restaurant(self):
        email = f"TEST_own_{uuid.uuid4().hex[:8]}@directdine.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pw12345", "name": "Test O",
            "role": "restaurant_owner", "restaurant_name": "Test Rest"
        })
        assert r.status_code == 200
        data = r.json()
        rid = data["user"]["restaurant_id"]
        assert rid
        # Verify restaurant exists
        r2 = requests.get(f"{API}/restaurants/{rid}")
        assert r2.status_code == 200
        assert r2.json()["name"] == "Test Rest"

    def test_register_courier_rejected(self):
        email = f"TEST_cour_{uuid.uuid4().hex[:8]}@directdine.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pw12345", "name": "X", "role": "courier"
        })
        assert r.status_code == 400

    def test_login_seeded(self):
        for c in (CUSTOMER, OWNER1, OWNER2, COURIER):
            r = requests.post(f"{API}/auth/login", json=c)
            assert r.status_code == 200, c["email"]
            assert "access_token" in r.json()

    def test_me_with_token(self, customer_auth):
        r = requests.get(f"{API}/auth/me", headers=h(customer_auth))
        assert r.status_code == 200
        assert r.json()["email"] == CUSTOMER["email"]

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Restaurants & Menu ----------
class TestRestaurantsMenu:
    def test_list_restaurants(self):
        r = requests.get(f"{API}/restaurants")
        assert r.status_code == 200
        names = [x["name"] for x in r.json()]
        assert "Bella Napoli Pizzeria" in names
        assert "Smash & Co. Burgers" in names

    def test_get_menu(self):
        rests = requests.get(f"{API}/restaurants").json()
        bella = next(x for x in rests if x["name"] == "Bella Napoli Pizzeria")
        r = requests.get(f"{API}/restaurants/{bella['id']}/menu")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 4
        assert any(i["name"] == "Margherita Pizza" for i in items)

    def test_create_menu_as_owner(self, owner2_auth):
        r = requests.post(f"{API}/menu", headers=h(owner2_auth), json={
            "name": "TEST_Item", "price": 10.0, "category": "Sides"
        })
        assert r.status_code == 200
        item = r.json()
        assert item["restaurant_id"] == owner2_auth["user"]["restaurant_id"]
        # cleanup
        requests.delete(f"{API}/menu/{item['id']}", headers=h(owner2_auth))

    def test_create_menu_as_customer_forbidden(self, customer_auth):
        r = requests.post(f"{API}/menu", headers=h(customer_auth), json={
            "name": "X", "price": 1.0
        })
        assert r.status_code == 403


# ---------- Couriers ----------
class TestCouriers:
    def test_create_courier_as_owner(self, owner2_auth):
        email = f"TEST_cr_{uuid.uuid4().hex[:8]}@directdine.com"
        r = requests.post(f"{API}/couriers", headers=h(owner2_auth), json={
            "email": email, "password": "pw12345", "name": "Test Courier", "phone": "+900"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["restaurant_id"] == owner2_auth["user"]["restaurant_id"]
        # Verify courier can login
        li = _login({"email": email, "password": "pw12345"})
        assert li["user"]["role"] == "courier"

    def test_courier_update_location(self, courier_auth):
        r = requests.post(f"{API}/couriers/me/location", headers=h(courier_auth),
                          json={"lat": 41.05, "lng": 28.99})
        assert r.status_code == 200
        # GET back
        cid = courier_auth["user"]["id"]
        g = requests.get(f"{API}/couriers/{cid}/location")
        assert g.status_code == 200
        loc = g.json()
        assert abs(loc["lat"] - 41.05) < 0.001
        assert abs(loc["lng"] - 28.99) < 0.001

    def test_customer_cant_update_location(self, customer_auth):
        r = requests.post(f"{API}/couriers/me/location", headers=h(customer_auth),
                          json={"lat": 1.0, "lng": 1.0})
        assert r.status_code == 403


# ---------- Orders ----------
class TestOrders:
    @pytest.fixture(scope="class")
    def order_ctx(self, customer_auth, owner1_auth):
        # Get bella menu
        rests = requests.get(f"{API}/restaurants").json()
        bella = next(x for x in rests if x["name"] == "Bella Napoli Pizzeria")
        menu = requests.get(f"{API}/restaurants/{bella['id']}/menu").json()
        m = menu[0]
        r = requests.post(f"{API}/orders", headers=h(customer_auth), json={
            "restaurant_id": bella["id"],
            "items": [{"menu_item_id": m["id"], "name": m["name"], "price": m["price"], "quantity": 2}],
            "delivery_address": "TEST addr", "delivery_lat": 41.04, "delivery_lng": 28.98,
            "notes": "test"
        })
        assert r.status_code == 200, r.text
        order = r.json()
        return {"order": order, "restaurant": bella, "menu_item": m}

    def test_create_order_and_total(self, order_ctx):
        o = order_ctx["order"]
        m = order_ctx["menu_item"]
        assert o["status"] == "pending"
        assert o["payment_method"] == "cash_on_delivery"
        assert o["total"] == m["price"] * 2

    def test_list_orders_customer_scope(self, customer_auth, order_ctx):
        r = requests.get(f"{API}/orders", headers=h(customer_auth))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert order_ctx["order"]["id"] in ids

    def test_owner_transitions(self, owner1_auth, order_ctx):
        oid = order_ctx["order"]["id"]
        r = requests.post(f"{API}/orders/{oid}/status", headers=h(owner1_auth), json={"status": "accepted"})
        assert r.status_code == 200 and r.json()["status"] == "accepted"
        r = requests.post(f"{API}/orders/{oid}/status", headers=h(owner1_auth), json={"status": "preparing"})
        assert r.status_code == 200 and r.json()["status"] == "preparing"

    def test_owner_assign_courier(self, owner1_auth, courier_auth, order_ctx):
        oid = order_ctx["order"]["id"]
        cid = courier_auth["user"]["id"]
        r = requests.post(f"{API}/orders/{oid}/assign", headers=h(owner1_auth), json={"courier_id": cid})
        assert r.status_code == 200
        data = r.json()
        assert data["courier_id"] == cid
        assert data["status"] == "out_for_delivery"

    def test_courier_delivered(self, courier_auth, order_ctx):
        oid = order_ctx["order"]["id"]
        r = requests.post(f"{API}/orders/{oid}/status", headers=h(courier_auth), json={"status": "delivered"})
        assert r.status_code == 200
        assert r.json()["status"] == "delivered"

    def test_owner_list_scope(self, owner1_auth, order_ctx):
        r = requests.get(f"{API}/orders", headers=h(owner1_auth))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert order_ctx["order"]["id"] in ids

    def test_courier_list_scope(self, courier_auth, order_ctx):
        r = requests.get(f"{API}/orders", headers=h(courier_auth))
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert order_ctx["order"]["id"] in ids


# ---------- Role scoping ----------
class TestRoleScoping:
    def test_customer_cant_assign_courier(self, customer_auth):
        r = requests.post(f"{API}/orders/nonexistent/assign",
                          headers=h(customer_auth), json={"courier_id": "x"})
        assert r.status_code == 403

    def test_customer_cant_list_couriers(self, customer_auth):
        r = requests.get(f"{API}/couriers", headers=h(customer_auth))
        assert r.status_code == 403

    def test_courier_cant_create_menu(self, courier_auth):
        r = requests.post(f"{API}/menu", headers=h(courier_auth), json={"name": "x", "price": 1})
        assert r.status_code == 403

    def test_owner_cant_create_order(self, owner1_auth):
        r = requests.post(f"{API}/orders", headers=h(owner1_auth), json={
            "restaurant_id": "x", "items": [], "delivery_address": "x",
            "delivery_lat": 0, "delivery_lng": 0
        })
        assert r.status_code == 403
