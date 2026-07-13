"""
DirectDine iter9 backend tests:
- Owner login + /auth/me role
- PUT /restaurants/me: min_order_value + delivery_radius_km update
- PUT /restaurants/me: delivery_radius_km=0 -> 422 (gt=0 validation)
- POST /menu with delivery_fee_pct=25, price=100 -> display_price=125
- Campaign start/stop -> during campaign display_price == price
- Customer order below min_order -> 400 with 'Minimum order value'; at/above -> 201/200
- POST /admin/cleanup-junk-restaurants idempotent
"""

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    # fall back to reading frontend/.env
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"


# --------- fixtures ---------
@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json={
        "email": "owner1@directdine.com", "password": "password123"
    }, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "restaurant_owner"
    return data["access_token"]


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{API}/auth/login", json={
        "email": "customer1@directdine.com", "password": "password123"
    }, timeout=15)
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_restaurant_id(owner_token):
    r = requests.get(
        f"{API}/restaurants/me/info",
        headers={"Authorization": f"Bearer {owner_token}"}, timeout=15,
    )
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module", autouse=True)
def _reset_campaign_after(owner_token):
    # ensure campaign is stopped after this module
    yield
    try:
        requests.post(f"{API}/restaurants/me/campaign/stop",
                      headers={"Authorization": f"Bearer {owner_token}"}, timeout=10)
    except Exception:
        pass


# --------- auth ---------
class TestAuth:
    def test_login_owner_and_me(self, owner_token):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {owner_token}"}, timeout=10)
        assert r.status_code == 200
        me = r.json()
        assert me["role"] == "restaurant_owner"
        assert me["email"] == "owner1@directdine.com"


# --------- restaurant settings ---------
class TestRestaurantSettings:
    def test_update_min_order_and_radius(self, owner_token):
        r = requests.put(
            f"{API}/restaurants/me",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"min_order_value": 200, "delivery_radius_km": 6},
            timeout=15,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        body = r.json()
        assert float(body["min_order_value"]) == 200.0
        assert float(body["delivery_radius_km"]) == 6.0

        # Verify persisted via GET
        r2 = requests.get(f"{API}/restaurants/me/info",
                          headers={"Authorization": f"Bearer {owner_token}"}, timeout=10)
        assert r2.status_code == 200
        info = r2.json()
        assert float(info["min_order_value"]) == 200.0
        assert float(info["delivery_radius_km"]) == 6.0

    def test_delivery_radius_zero_rejected(self, owner_token):
        r = requests.put(
            f"{API}/restaurants/me",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"delivery_radius_km": 0},
            timeout=10,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"


# --------- menu delivery_fee_pct + display_price ---------
class TestMenuDisplayPrice:
    created_id = None

    def test_create_item_with_fee_pct(self, owner_token, owner_restaurant_id):
        payload = {
            "name": f"TEST_FeeItem_{uuid.uuid4().hex[:6]}",
            "description": "iter9 fee test",
            "price": 100.0,
            "delivery_fee_pct": 25,
            "category": "Test",
        }
        r = requests.post(f"{API}/menu",
                          headers={"Authorization": f"Bearer {owner_token}"},
                          json=payload, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        item = r.json()
        assert item["price"] == 100.0
        assert item["delivery_fee_pct"] == 25.0
        assert item["display_price"] == 125.0
        TestMenuDisplayPrice.created_id = item["id"]

        # Verify via GET menu (public)
        r2 = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=10)
        assert r2.status_code == 200
        found = [m for m in r2.json() if m["id"] == item["id"]]
        assert len(found) == 1
        assert found[0]["display_price"] == 125.0
        assert found[0]["price"] == 100.0

    def test_campaign_start_hides_fee(self, owner_token, owner_restaurant_id):
        # start
        r = requests.post(f"{API}/restaurants/me/campaign/start",
                          headers={"Authorization": f"Bearer {owner_token}"}, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["campaign_active"] is True
        assert body.get("campaign_ends_at")
        # ends_at should be ~3 days ahead
        from datetime import datetime, timezone, timedelta
        ends = datetime.fromisoformat(body["campaign_ends_at"])
        delta = ends - datetime.now(timezone.utc)
        assert timedelta(days=2, hours=23) < delta < timedelta(days=3, hours=1), \
            f"ends_at delta unexpected: {delta}"

        # Menu now shows display_price == price
        r2 = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=10)
        assert r2.status_code == 200
        items = r2.json()
        # All items must have display_price == price
        for it in items:
            assert it["display_price"] == round(it["price"], 2), \
                f"item {it['name']} display_price={it['display_price']} vs price={it['price']}"

    def test_campaign_stop_restores_fee(self, owner_token, owner_restaurant_id):
        r = requests.post(f"{API}/restaurants/me/campaign/stop",
                          headers={"Authorization": f"Bearer {owner_token}"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["campaign_active"] is False

        # our fee item should be 125 again
        r2 = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=10)
        items = r2.json()
        cid = TestMenuDisplayPrice.created_id
        if cid:
            found = [m for m in items if m["id"] == cid]
            assert found and found[0]["display_price"] == 125.0

    def test_cleanup_created_item(self, owner_token):
        cid = TestMenuDisplayPrice.created_id
        if cid:
            r = requests.delete(f"{API}/menu/{cid}",
                                headers={"Authorization": f"Bearer {owner_token}"}, timeout=10)
            assert r.status_code == 200


# --------- min order enforcement on POST /orders ---------
class TestMinOrderEnforcement:
    def test_below_min_returns_400(self, owner_token, customer_token, owner_restaurant_id):
        # Ensure min_order_value=200 (set by earlier test but be robust)
        requests.put(f"{API}/restaurants/me",
                     headers={"Authorization": f"Bearer {owner_token}"},
                     json={"min_order_value": 200, "delivery_radius_km": 6}, timeout=10)

        # Fetch a cheap menu item
        menu = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=10).json()
        assert menu, "restaurant has no menu items"
        cheap = min(menu, key=lambda m: m["price"])
        payload = {
            "restaurant_id": owner_restaurant_id,
            "items": [{
                "menu_item_id": cheap["id"], "name": cheap["name"],
                "price": cheap["price"], "quantity": 1,
            }],
            "delivery_address": "TEST address",
            "delivery_lat": 41.0082, "delivery_lng": 28.9784,
            "notes": "TEST_below_min",
        }
        r = requests.post(f"{API}/orders",
                          headers={"Authorization": f"Bearer {customer_token}"},
                          json=payload, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "Minimum order value" in detail, f"unexpected detail: {detail}"

    def test_at_or_above_min_succeeds(self, owner_token, customer_token, owner_restaurant_id):
        # Bring min down so we can safely order
        requests.put(f"{API}/restaurants/me",
                     headers={"Authorization": f"Bearer {owner_token}"},
                     json={"min_order_value": 50, "delivery_radius_km": 6}, timeout=10)

        menu = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=10).json()
        # pick highest-priced item, single qty >=50
        item = max(menu, key=lambda m: m["price"])
        assert item["price"] >= 50
        payload = {
            "restaurant_id": owner_restaurant_id,
            "items": [{
                "menu_item_id": item["id"], "name": item["name"],
                "price": item["price"], "quantity": 1,
            }],
            "delivery_address": "TEST address",
            "delivery_lat": 41.0082, "delivery_lng": 28.9784,
            "notes": "TEST_above_min_iter9",
        }
        r = requests.post(f"{API}/orders",
                          headers={"Authorization": f"Bearer {customer_token}"},
                          json=payload, timeout=15)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert body["total"] == item["price"]
        assert body["status"] == "pending"
        # cleanup: cancel this order
        try:
            requests.post(f"{API}/orders/{body['id']}/cancel",
                          headers={"Authorization": f"Bearer {customer_token}"}, timeout=10)
        except Exception:
            pass

    def test_cleanup_min_back_to_zero(self, owner_token):
        # Reset so we don't affect subsequent testing
        r = requests.put(f"{API}/restaurants/me",
                         headers={"Authorization": f"Bearer {owner_token}"},
                         json={"min_order_value": 0, "delivery_radius_km": 4}, timeout=10)
        assert r.status_code == 200


# --------- admin cleanup idempotency ---------
class TestAdminCleanup:
    def test_cleanup_junk_idempotent(self):
        r1 = requests.post(f"{API}/admin/cleanup-junk-restaurants", timeout=15)
        assert r1.status_code == 200
        assert "deleted" in r1.json()
        r2 = requests.post(f"{API}/admin/cleanup-junk-restaurants", timeout=15)
        assert r2.status_code == 200
        # Second call should delete 0 (idempotent), first could be 0 or more
        assert r2.json()["deleted"] == 0
