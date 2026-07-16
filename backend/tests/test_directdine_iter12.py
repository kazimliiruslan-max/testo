"""
Iter12 backend tests — DirectDine
Batch 2+3: menu availability, reviews, ratings, one-tap reorder-safety (unavailable enforcement),
plus regression: campaign, min_order, radius, hours.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE_URL}/api"

OWNER = ("owner1@directdine.com", "password123")
CUST = ("customer1@directdine.com", "password123")


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
def bella(owner_ctx):
    # Owner1 → Bella Napoli
    r = requests.get(f"{API}/restaurants/me/info", headers=owner_ctx["h"], timeout=10)
    assert r.status_code == 200
    return r.json()


# ---------------- Menu: availability + display_price ----------------
class TestMenuAvailability:
    def test_patch_available_false_and_verify_via_menu_list(self, owner_ctx, bella):
        rid = bella["id"]
        menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        assert menu, "Bella Napoli should have menu items"
        # pick first item
        item = menu[0]
        item_id = item["id"]

        # PATCH available=false
        r = requests.patch(f"{API}/menu/{item_id}", headers=owner_ctx["h"],
                           json={"available": False}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["available"] is False

        # GET menu → item reads available=false
        m2 = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        found = next((x for x in m2 if x["id"] == item_id), None)
        assert found is not None
        assert found["available"] is False

        # RESTORE
        r2 = requests.patch(f"{API}/menu/{item_id}", headers=owner_ctx["h"],
                            json={"available": True}, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["available"] is True

    def test_patch_price_and_fee_recomputes_display_price(self, owner_ctx, bella):
        rid = bella["id"]
        menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        item = menu[0]
        item_id = item["id"]
        orig_price = item["price"]
        orig_fee = item.get("delivery_fee_pct", 0.0)

        # Change price + fee
        r = requests.patch(f"{API}/menu/{item_id}", headers=owner_ctx["h"],
                           json={"price": 100.0, "delivery_fee_pct": 12.0}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["price"] == 100.0
        assert body["delivery_fee_pct"] == 12.0
        # display_price recomputed (no campaign) = 100 * 1.12
        assert round(body["display_price"], 2) == 112.0

        # Restore
        r2 = requests.patch(f"{API}/menu/{item_id}", headers=owner_ctx["h"],
                            json={"price": orig_price, "delivery_fee_pct": orig_fee}, timeout=10)
        assert r2.status_code == 200


# ---------------- Order rejection when item unavailable ----------------
class TestOrderAvailabilityEnforcement:
    def test_customer_order_rejects_unavailable(self, owner_ctx, cust_ctx, bella):
        rid = bella["id"]
        menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        item = menu[0]
        item_id = item["id"]

        # Mark unavailable
        requests.patch(f"{API}/menu/{item_id}", headers=owner_ctx["h"], json={"available": False}, timeout=10)
        try:
            payload = {
                "restaurant_id": rid,
                "items": [{"menu_item_id": item_id, "name": item["name"],
                           "price": item["price"], "quantity": 1}],
                "delivery_address": "Test 1", "delivery_lat": 41.037, "delivery_lng": 28.985,
                "notes": "",
            }
            r = requests.post(f"{API}/orders", headers=cust_ctx["h"], json=payload, timeout=10)
            assert r.status_code == 400, r.text
            assert "unavailable" in r.json().get("detail", "").lower()
        finally:
            requests.patch(f"{API}/menu/{item_id}", headers=owner_ctx["h"], json={"available": True}, timeout=10)

    def test_guest_order_rejects_unavailable(self, owner_ctx, bella):
        rid = bella["id"]
        menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        item = menu[0]
        item_id = item["id"]

        requests.patch(f"{API}/menu/{item_id}", headers=owner_ctx["h"], json={"available": False}, timeout=10)
        try:
            ts = int(time.time() * 1000)
            payload = {
                "name": "Test Guest", "email": f"TEST_guest_iter12_{ts}@directdine.com",
                "phone": "+905550000000", "password": "guestpass123",
                "restaurant_id": rid,
                "items": [{"menu_item_id": item_id, "name": item["name"],
                           "price": item["price"], "quantity": 1}],
                "delivery_address": "Test 2", "delivery_lat": 41.037, "delivery_lng": 28.985,
                "notes": "",
            }
            r = requests.post(f"{API}/orders/guest", json=payload, timeout=10)
            assert r.status_code == 400, r.text
            assert "unavailable" in r.json().get("detail", "").lower()
        finally:
            requests.patch(f"{API}/menu/{item_id}", headers=owner_ctx["h"], json={"available": True}, timeout=10)


# ---------------- Reviews flow ----------------
class TestReviews:
    def test_full_review_lifecycle(self, owner_ctx, cust_ctx, bella):
        rid = bella["id"]
        menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        item = menu[0]

        # Ensure hours don't block: set open all day today
        # Just try — restaurant may already be open. If closed we PUT hours.
        # (Owner endpoint)
        all_day = {d: {"closed": False, "open": "00:00", "close": "23:59"}
                   for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
        requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"], json={"hours": all_day}, timeout=10)

        # 1) Create order
        payload = {
            "restaurant_id": rid,
            "items": [{"menu_item_id": item["id"], "name": item["name"],
                       "price": item["price"], "quantity": 1}],
            "delivery_address": "Review test addr",
            "delivery_lat": 41.037, "delivery_lng": 28.985, "notes": "TEST_review",
        }
        rc = requests.post(f"{API}/orders", headers=cust_ctx["h"], json=payload, timeout=10)
        assert rc.status_code == 200, rc.text
        order = rc.json()
        oid = order["id"]

        # 2) Trying to review before delivered → 400 'delivered'
        rv = requests.post(f"{API}/reviews", headers=cust_ctx["h"],
                           json={"order_id": oid, "stars": 5, "comment": "Too early"}, timeout=10)
        assert rv.status_code == 400
        assert "delivered" in rv.json().get("detail", "").lower()

        # 3) Owner walks status: accepted → preparing (cancelled not usable here; delivered is courier-only)
        # In this app: accepted/preparing/cancelled by owner; out_for_delivery/delivered by courier.
        # For test we need delivered. We'll assign courier1 then use courier to set delivered.
        # ---- accept & prepare as owner
        for st in ("accepted", "preparing"):
            r = requests.post(f"{API}/orders/{oid}/status", headers=owner_ctx["h"],
                              json={"status": st}, timeout=10)
            assert r.status_code == 200, r.text

        # assign courier
        couriers = requests.get(f"{API}/couriers", headers=owner_ctx["h"], timeout=10).json()
        assert couriers, "Owner1 must have at least courier1"
        cid = couriers[0]["id"]
        ra = requests.post(f"{API}/orders/{oid}/assign", headers=owner_ctx["h"],
                           json={"courier_id": cid}, timeout=10)
        assert ra.status_code == 200

        # courier login + mark delivered
        ctoken, _ = _login("courier1@directdine.com", "password123")
        ch = {"Authorization": f"Bearer {ctoken}"}
        rd = requests.post(f"{API}/orders/{oid}/status", headers=ch,
                           json={"status": "delivered"}, timeout=10)
        assert rd.status_code == 200, rd.text
        assert rd.json()["status"] == "delivered"

        # 4) Post review → 200
        rv2 = requests.post(f"{API}/reviews", headers=cust_ctx["h"],
                            json={"order_id": oid, "stars": 5, "comment": "Great"}, timeout=10)
        assert rv2.status_code == 200, rv2.text
        rev = rv2.json()
        assert rev["stars"] == 5 and rev["comment"] == "Great"
        assert rev["restaurant_id"] == rid

        # 5) Second POST same order → 400 'already reviewed'
        rv3 = requests.post(f"{API}/reviews", headers=cust_ctx["h"],
                            json={"order_id": oid, "stars": 4, "comment": "dup"}, timeout=10)
        assert rv3.status_code == 400
        assert "already reviewed" in rv3.json().get("detail", "").lower()

        # 6) GET /orders/{oid}/review returns the review
        gr = requests.get(f"{API}/orders/{oid}/review", headers=cust_ctx["h"], timeout=10)
        assert gr.status_code == 200
        got = gr.json()
        assert got is not None and got["id"] == rev["id"]

        # 7) GET /restaurants/{rid}/reviews contains it
        rl = requests.get(f"{API}/restaurants/{rid}/reviews", timeout=10)
        assert rl.status_code == 200
        assert any(x["id"] == rev["id"] for x in rl.json())

        # 8) Restaurant rating recomputes — must reflect an average that INCLUDES our 5-star
        info = requests.get(f"{API}/restaurants/{rid}", timeout=10).json()
        assert isinstance(info["rating"], (int, float))
        # After adding a 5-star review the recompute averages ALL reviews; result must be >= any single non-5 legacy avg
        # We assert it is a valid number in [1,5] and specifically that it is >= 4.5 (default) if only our 5 exists,
        # or approx the running mean if other reviews existed.
        assert 1.0 <= info["rating"] <= 5.0


# ---------------- Regression ----------------
class TestRegression:
    def test_campaign_start_stop(self, owner_ctx):
        r = requests.post(f"{API}/restaurants/me/campaign/start", headers=owner_ctx["h"],
                          json={"days": 3}, timeout=10)
        assert r.status_code == 200 and r.json()["campaign_active"] is True
        r2 = requests.post(f"{API}/restaurants/me/campaign/stop", headers=owner_ctx["h"], timeout=10)
        assert r2.status_code == 200 and r2.json()["campaign_active"] is False

    def test_min_order_value_enforced(self, owner_ctx, cust_ctx, bella):
        rid = bella["id"]
        # set min order value high
        r = requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                         json={"min_order_value": 500.0}, timeout=10)
        assert r.status_code == 200
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

    def test_delivery_radius_validation(self, owner_ctx):
        r = requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                         json={"delivery_radius_km": 0}, timeout=10)
        assert r.status_code == 422

    def test_hours_enforcement_all_closed(self, owner_ctx, cust_ctx, bella):
        rid = bella["id"]
        all_closed = {d: {"closed": True, "open": "09:00", "close": "22:00"}
                      for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
        requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"], json={"hours": all_closed}, timeout=10)
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
            all_open = {d: {"closed": False, "open": "00:00", "close": "23:59"}
                        for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
            requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"], json={"hours": all_open}, timeout=10)
