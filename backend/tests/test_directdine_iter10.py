"""
DirectDine iter10 backend tests:
- POST /api/restaurants/me/campaign/start with body {days: 7}    -> 200, ends_at ~7d
- POST /api/restaurants/me/campaign/start with body {days: 14}   -> 200, ends_at ~14d; /stop clears
- POST /api/restaurants/me/campaign/start with body {days: 100}  -> 422 (le=90)
- POST /api/restaurants/me/campaign/start with body {days: 0}    -> 422 (ge=1)
- POST /api/restaurants/me/campaign/start with NO body           -> 200, default 3d
- Regression: iter9 previously-passing endpoints still work
"""
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests


def _load_base_url() -> str:
    url = os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    if not url:
        for line in Path("/app/frontend/.env").read_text().splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                url = line.split("=", 1)[1].strip().strip('"')
                break
    return (url or "").rstrip("/")


BASE_URL = _load_base_url()
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


def _stop_campaign(owner_token):
    return requests.post(
        f"{API}/restaurants/me/campaign/stop",
        headers={"Authorization": f"Bearer {owner_token}"}, timeout=10,
    )


@pytest.fixture(autouse=True)
def _ensure_stopped_between_tests(owner_token):
    """Stop any active campaign before AND after each test to keep state clean."""
    _stop_campaign(owner_token)
    yield
    _stop_campaign(owner_token)


# --------- iter10 campaign-days feature ---------
class TestCampaignDays:
    def _start(self, owner_token, body):
        return requests.post(
            f"{API}/restaurants/me/campaign/start",
            headers={"Authorization": f"Bearer {owner_token}"},
            json=body,
            timeout=15,
        )

    def _start_no_body(self, owner_token):
        # POST with an empty body — should default days=3
        return requests.post(
            f"{API}/restaurants/me/campaign/start",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=15,
        )

    def test_start_7_days(self, owner_token):
        r = self._start(owner_token, {"days": 7})
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        body = r.json()
        assert body["campaign_active"] is True
        assert body.get("campaign_ends_at")
        ends = datetime.fromisoformat(body["campaign_ends_at"])
        delta = ends - datetime.now(timezone.utc)
        # ~7 days ± 1 hour
        assert timedelta(days=6, hours=23) < delta < timedelta(days=7, hours=1), \
            f"unexpected delta for days=7: {delta}"

    def test_start_14_days_then_stop_clears(self, owner_token):
        r = self._start(owner_token, {"days": 14})
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        body = r.json()
        assert body["campaign_active"] is True
        ends = datetime.fromisoformat(body["campaign_ends_at"])
        delta = ends - datetime.now(timezone.utc)
        assert timedelta(days=13, hours=23) < delta < timedelta(days=14, hours=1), \
            f"unexpected delta for days=14: {delta}"

        # stop clears
        r2 = _stop_campaign(owner_token)
        assert r2.status_code == 200
        stopped = r2.json()
        assert stopped["campaign_active"] is False
        assert stopped.get("campaign_ends_at") in (None, "")

    def test_start_100_days_rejected_422(self, owner_token):
        r = self._start(owner_token, {"days": 100})
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_start_zero_days_rejected_422(self, owner_token):
        r = self._start(owner_token, {"days": 0})
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_start_no_body_defaults_to_3_days(self, owner_token):
        r = self._start_no_body(owner_token)
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        body = r.json()
        assert body["campaign_active"] is True
        ends = datetime.fromisoformat(body["campaign_ends_at"])
        delta = ends - datetime.now(timezone.utc)
        assert timedelta(days=2, hours=23) < delta < timedelta(days=3, hours=1), \
            f"unexpected default-days delta: {delta}"


# --------- iter9 regression (subset that was previously passing) ---------
class TestIter9Regression:
    def test_owner_auth_me(self, owner_token):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {owner_token}"}, timeout=10)
        assert r.status_code == 200
        me = r.json()
        assert me["role"] == "restaurant_owner"
        assert me["email"] == "owner1@directdine.com"

    def test_put_restaurants_me_min_order_and_radius(self, owner_token):
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

    def test_put_restaurants_me_radius_zero_rejected(self, owner_token):
        r = requests.put(
            f"{API}/restaurants/me",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"delivery_radius_km": 0},
            timeout=10,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_menu_display_price_no_campaign(self, owner_token, owner_restaurant_id):
        # ensure campaign off (autouse fixture handles it) then check menu display prices
        r = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert items, "no menu items"
        # display_price should be price*(1+fee/100)
        for it in items:
            expected = round(it["price"] * (1 + (it.get("delivery_fee_pct") or 0) / 100.0), 2)
            assert abs(it["display_price"] - expected) < 0.02, \
                f"item {it['name']} display_price={it['display_price']} expected≈{expected}"

    def test_min_order_enforced_on_order_creation(self, owner_token, customer_token, owner_restaurant_id):
        # ensure a high min_order
        requests.put(f"{API}/restaurants/me",
                     headers={"Authorization": f"Bearer {owner_token}"},
                     json={"min_order_value": 200, "delivery_radius_km": 6}, timeout=10)
        menu = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=10).json()
        cheap = min(menu, key=lambda m: m["price"])
        payload = {
            "restaurant_id": owner_restaurant_id,
            "items": [{"menu_item_id": cheap["id"], "name": cheap["name"],
                       "price": cheap["price"], "quantity": 1}],
            "delivery_address": "TEST_iter10 address",
            "delivery_lat": 41.0082, "delivery_lng": 28.9784,
            "notes": "TEST_iter10_below_min",
        }
        r = requests.post(f"{API}/orders",
                          headers={"Authorization": f"Bearer {customer_token}"},
                          json=payload, timeout=15)
        assert r.status_code == 400
        assert "Minimum order value" in r.json().get("detail", "")

    def test_cleanup_junk_idempotent(self):
        r1 = requests.post(f"{API}/admin/cleanup-junk-restaurants", timeout=15)
        assert r1.status_code == 200
        assert "deleted" in r1.json()
        r2 = requests.post(f"{API}/admin/cleanup-junk-restaurants", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["deleted"] == 0

    def test_teardown_restore_defaults(self, owner_token):
        # Restore Bella Napoli's real defaults so we don't affect prod-seeded UX
        r = requests.put(f"{API}/restaurants/me",
                         headers={"Authorization": f"Bearer {owner_token}"},
                         json={"min_order_value": 0, "delivery_radius_km": 4},
                         timeout=10)
        assert r.status_code == 200
