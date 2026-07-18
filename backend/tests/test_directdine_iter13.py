"""
Iter13 backend tests — DirectDine
- PUT /restaurants/me with lat/lng/address (map picker) → 200; GET /restaurants/me/info reflects it.
- Courier location POST returns {ok, lat, lng} and enhanced owner_by_rest broadcast does not crash
  even with an active order assigned to that courier.
- Regression iter12: campaign 1/3/7/14/30, min_order enforcement, delivery_radius_km validation,
  hours-closed → 400, item availability → 400, reviews lifecycle short.
Cleanup restores Bella Napoli lat=41.0369/lng=28.985 and all-days-open hours.
"""
import os
import time
import pytest
import requests

BASE_URL = (os.environ.get('EXPO_BACKEND_URL')
            or os.environ.get('EXPO_PUBLIC_BACKEND_URL', '')).rstrip('/')
assert BASE_URL, "EXPO_BACKEND_URL/EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE_URL}/api"

OWNER = ("owner1@directdine.com", "password123")
CUST = ("customer1@directdine.com", "password123")
COURIER = ("courier1@directdine.com", "password123")

DEFAULT_LAT = 41.0369
DEFAULT_LNG = 28.985
DEFAULT_ADDRESS = "Istiklal Cad. No:1, Beyoglu, Istanbul"

ALL_OPEN_HOURS = {d: {"closed": False, "open": "00:00", "close": "23:59"}
                  for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["access_token"], d["user"]


@pytest.fixture(scope="module")
def owner_ctx():
    token, user = _login(*OWNER)
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def cust_ctx():
    token, user = _login(*CUST)
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def courier_ctx():
    token, user = _login(*COURIER)
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def bella(owner_ctx):
    r = requests.get(f"{API}/restaurants/me/info", headers=owner_ctx["h"], timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module", autouse=True)
def restore_final(owner_ctx):
    """Fixture that runs AFTER all module tests to restore Bella Napoli's original state."""
    yield
    # Restore lat/lng/address + hours open all days
    requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                 json={
                     "lat": DEFAULT_LAT,
                     "lng": DEFAULT_LNG,
                     "address": DEFAULT_ADDRESS,
                     "delivery_radius_km": 5.0,
                     "min_order_value": 0.0,
                     "hours": ALL_OPEN_HOURS,
                 }, timeout=10)


# ---------------- ITER13 — Location picker ----------------
class TestRestaurantLocationUpdate:
    def test_put_restaurants_me_updates_lat_lng_address(self, owner_ctx):
        payload = {
            "lat": 41.05,
            "lng": 29.02,
            "address": "Kadikoy Test",
            "delivery_radius_km": 5.0,
            "min_order_value": 0.0,
            "hours": ALL_OPEN_HOURS,
        }
        r = requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"], json=payload, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["lat"] == 41.05
        assert body["lng"] == 29.02
        assert body["address"] == "Kadikoy Test"

        # Verify via GET /restaurants/me/info (persisted)
        g = requests.get(f"{API}/restaurants/me/info", headers=owner_ctx["h"], timeout=10)
        assert g.status_code == 200
        info = g.json()
        assert info["lat"] == 41.05
        assert info["lng"] == 29.02
        assert info["address"] == "Kadikoy Test"

    def test_restore_bella_defaults(self, owner_ctx):
        r = requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                         json={"lat": DEFAULT_LAT, "lng": DEFAULT_LNG, "address": DEFAULT_ADDRESS}, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["lat"] == DEFAULT_LAT
        assert body["lng"] == DEFAULT_LNG
        assert body["address"] == DEFAULT_ADDRESS


# ---------------- ITER13 — Courier location broadcast (owner + customer) ----------------
class TestCourierLocationBroadcast:
    def test_courier_location_endpoint_returns_ok_and_does_not_crash_with_active_order(
            self, owner_ctx, cust_ctx, courier_ctx, bella):
        """
        Create an active order assigned to courier1, then POST /couriers/me/location.
        Must return 200 with {ok:true, lat, lng}. Must not crash because of the new
        owner_by_rest broadcast path.
        """
        rid = bella["id"]
        # Ensure open
        requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                     json={"hours": ALL_OPEN_HOURS, "min_order_value": 0.0}, timeout=10)

        menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        assert menu, "Menu must have items"
        item = menu[0]

        # Create order
        payload = {
            "restaurant_id": rid,
            "items": [{"menu_item_id": item["id"], "name": item["name"],
                       "price": item["price"], "quantity": 1}],
            "delivery_address": "Iter13 loc test",
            "delivery_lat": 41.037, "delivery_lng": 28.985, "notes": "TEST_iter13_loc",
        }
        r = requests.post(f"{API}/orders", headers=cust_ctx["h"], json=payload, timeout=10)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]

        # Walk to accepted (active)
        for st in ("accepted",):
            rr = requests.post(f"{API}/orders/{oid}/status", headers=owner_ctx["h"],
                               json={"status": st}, timeout=10)
            assert rr.status_code == 200

        # Assign courier
        couriers = requests.get(f"{API}/couriers", headers=owner_ctx["h"], timeout=10).json()
        assert couriers
        cid = couriers[0]["id"]
        ra = requests.post(f"{API}/orders/{oid}/assign", headers=owner_ctx["h"],
                           json={"courier_id": cid}, timeout=10)
        assert ra.status_code == 200

        # POST courier location — this exercises the new owner_by_rest broadcast path
        rl = requests.post(f"{API}/couriers/me/location", headers=courier_ctx["h"],
                           json={"lat": 41.041, "lng": 28.993}, timeout=10)
        assert rl.status_code == 200, rl.text
        body = rl.json()
        assert body.get("ok") is True
        assert body.get("lat") == 41.041
        assert body.get("lng") == 28.993

        # GET /couriers/{cid}/location confirms persistence
        gl = requests.get(f"{API}/couriers/{cid}/location", timeout=10)
        assert gl.status_code == 200
        gd = gl.json()
        assert gd["lat"] == 41.041 and gd["lng"] == 28.993

        # Cleanup — cancel the order so we don't leave lingering active state
        requests.post(f"{API}/orders/{oid}/status", headers=owner_ctx["h"],
                      json={"status": "cancelled"}, timeout=10)

    def test_courier_location_no_active_orders_still_ok(self, courier_ctx):
        """When there are no active orders, endpoint must still return {ok,lat,lng}."""
        r = requests.post(f"{API}/couriers/me/location", headers=courier_ctx["h"],
                          json={"lat": 41.0, "lng": 29.0}, timeout=10)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("ok") is True
        assert b.get("lat") == 41.0 and b.get("lng") == 29.0


# ---------------- Regression iter12 ----------------
class TestRegressionIter12:
    @pytest.mark.parametrize("days", [1, 3, 7, 14, 30])
    def test_campaign_start_days(self, owner_ctx, days):
        r = requests.post(f"{API}/restaurants/me/campaign/start", headers=owner_ctx["h"],
                          json={"days": days}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["campaign_active"] is True
        rs = requests.post(f"{API}/restaurants/me/campaign/stop", headers=owner_ctx["h"], timeout=10)
        assert rs.status_code == 200
        assert rs.json()["campaign_active"] is False

    def test_min_order_value_enforced(self, owner_ctx, cust_ctx, bella):
        rid = bella["id"]
        requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                     json={"min_order_value": 500.0, "hours": ALL_OPEN_HOURS}, timeout=10)
        try:
            menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
            item = menu[0]
            payload = {
                "restaurant_id": rid,
                "items": [{"menu_item_id": item["id"], "name": item["name"],
                           "price": item["price"], "quantity": 1}],
                "delivery_address": "min-order test",
                "delivery_lat": 41.037, "delivery_lng": 28.985, "notes": "",
            }
            r2 = requests.post(f"{API}/orders", headers=cust_ctx["h"], json=payload, timeout=10)
            assert r2.status_code == 400
            assert "minimum order" in r2.json().get("detail", "").lower()
        finally:
            requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                         json={"min_order_value": 0.0}, timeout=10)

    def test_delivery_radius_zero_fails(self, owner_ctx):
        r = requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                         json={"delivery_radius_km": 0}, timeout=10)
        assert r.status_code == 422

    def test_hours_all_closed_rejects_order(self, owner_ctx, cust_ctx, bella):
        rid = bella["id"]
        all_closed = {d: {"closed": True, "open": "09:00", "close": "22:00"}
                      for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
        requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                     json={"hours": all_closed}, timeout=10)
        try:
            menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
            item = menu[0]
            payload = {
                "restaurant_id": rid,
                "items": [{"menu_item_id": item["id"], "name": item["name"],
                           "price": item["price"], "quantity": 1}],
                "delivery_address": "closed test",
                "delivery_lat": 41.037, "delivery_lng": 28.985, "notes": "",
            }
            r = requests.post(f"{API}/orders", headers=cust_ctx["h"], json=payload, timeout=10)
            assert r.status_code == 400
            assert "closed" in r.json().get("detail", "").lower()
        finally:
            requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                         json={"hours": ALL_OPEN_HOURS}, timeout=10)

    def test_item_availability_blocks_order(self, owner_ctx, cust_ctx, bella):
        rid = bella["id"]
        menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        item = menu[0]
        requests.patch(f"{API}/menu/{item['id']}", headers=owner_ctx["h"],
                       json={"available": False}, timeout=10)
        try:
            payload = {
                "restaurant_id": rid,
                "items": [{"menu_item_id": item["id"], "name": item["name"],
                           "price": item["price"], "quantity": 1}],
                "delivery_address": "avail test",
                "delivery_lat": 41.037, "delivery_lng": 28.985, "notes": "",
            }
            r = requests.post(f"{API}/orders", headers=cust_ctx["h"], json=payload, timeout=10)
            assert r.status_code == 400
            assert "unavailable" in r.json().get("detail", "").lower()
        finally:
            requests.patch(f"{API}/menu/{item['id']}", headers=owner_ctx["h"],
                           json={"available": True}, timeout=10)

    def test_review_before_delivered_rejected(self, cust_ctx, owner_ctx, bella):
        """Short reviews regression — just verify the 'delivered' gate on POST /reviews."""
        rid = bella["id"]
        # Ensure open
        requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                     json={"hours": ALL_OPEN_HOURS, "min_order_value": 0.0}, timeout=10)
        menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        item = menu[0]
        payload = {
            "restaurant_id": rid,
            "items": [{"menu_item_id": item["id"], "name": item["name"],
                       "price": item["price"], "quantity": 1}],
            "delivery_address": "iter13 review-gate",
            "delivery_lat": 41.037, "delivery_lng": 28.985, "notes": "TEST_review_iter13",
        }
        rc = requests.post(f"{API}/orders", headers=cust_ctx["h"], json=payload, timeout=10)
        assert rc.status_code == 200, rc.text
        oid = rc.json()["id"]
        rv = requests.post(f"{API}/reviews", headers=cust_ctx["h"],
                           json={"order_id": oid, "stars": 5, "comment": "Too early"}, timeout=10)
        assert rv.status_code == 400
        assert "delivered" in rv.json().get("detail", "").lower()
        # Cleanup by cancelling
        requests.post(f"{API}/orders/{oid}/status", headers=owner_ctx["h"],
                      json={"status": "cancelled"}, timeout=10)
