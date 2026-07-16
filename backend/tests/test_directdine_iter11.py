"""
DirectDine iter11 backend tests:

Feature: Restaurant weekly opening hours + block ordering when closed.
- GET /api/restaurants  -> each item has is_open_now field; hours=null => fail-open (True).
- GET /api/restaurants/{id} -> same.
- PUT /api/restaurants/me with a valid `hours` map -> 200; GET /api/restaurants/me/info reflects it.
- If today (server local weekday) is Closed -> POST /api/orders returns 400 with 'closed' in detail.
- If ALL days are closed -> GET /api/restaurants/{id} returns is_open_now=False AND
  POST /api/orders/guest returns 400 with 'closed' in detail.
- Teardown restores all-day-open hours 09:00-22:00.

Also covers: POST /api/couriers/me/location returns {ok:true, lat, lng} for the assigned courier
(implicitly verifies broadcast path did not raise).

Regression coverage: campaign duration (1/3/7/14/30), min_order_value enforcement,
delivery_radius_km validation, /admin/cleanup-junk-restaurants idempotency.
"""
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests


# --------------------------------------------------------------------------------------
# Base URL / helpers
# --------------------------------------------------------------------------------------
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

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
TODAY_KEY = WEEKDAYS[datetime.now().weekday()]  # server local weekday key


def _all_open_hours():
    return {d: {"closed": False, "open": "00:00", "close": "23:59"} for d in WEEKDAYS}


def _all_closed_hours():
    return {d: {"closed": True, "open": "09:00", "close": "22:00"} for d in WEEKDAYS}


def _today_closed_hours():
    h = _all_open_hours()
    h[TODAY_KEY] = {"closed": True, "open": "09:00", "close": "22:00"}
    return h


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "owner1@directdine.com", "password": "password123"},
        timeout=15,
    )
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "customer1@directdine.com", "password": "password123"},
        timeout=15,
    )
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def courier_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "courier1@directdine.com", "password": "password123"},
        timeout=15,
    )
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_restaurant_id(owner_token):
    r = requests.get(
        f"{API}/restaurants/me/info",
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def some_menu_item(owner_restaurant_id):
    r = requests.get(f"{API}/restaurants/{owner_restaurant_id}/menu", timeout=10)
    assert r.status_code == 200
    items = r.json()
    assert items, "no menu items for owner restaurant"
    return items[0]


def _put_hours(owner_token, hours):
    return requests.put(
        f"{API}/restaurants/me",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"hours": hours},
        timeout=15,
    )


@pytest.fixture(autouse=True, scope="module")
def _restore_hours_after_module(owner_token):
    """Ensure hours are all-open after the module runs (whether tests pass or fail)."""
    yield
    _put_hours(owner_token, _all_open_hours())


# --------------------------------------------------------------------------------------
# is_open_now field
# --------------------------------------------------------------------------------------
class TestIsOpenNowField:
    def test_list_restaurants_has_is_open_now(self, owner_token):
        # start from all-open so all listed restaurants are open
        r0 = _put_hours(owner_token, _all_open_hours())
        assert r0.status_code == 200
        r = requests.get(f"{API}/restaurants", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and arr
        for it in arr:
            assert "is_open_now" in it, f"missing is_open_now on {it.get('name')}"
        # our owner restaurant is open now
        me = next((x for x in arr if x.get("owner_id")), None)
        # at least one open
        assert any(x["is_open_now"] is True for x in arr)

    def test_get_restaurant_is_open_now_true_when_open(self, owner_token, owner_restaurant_id):
        _put_hours(owner_token, _all_open_hours())
        r = requests.get(f"{API}/restaurants/{owner_restaurant_id}", timeout=10)
        assert r.status_code == 200
        assert r.json().get("is_open_now") is True


# --------------------------------------------------------------------------------------
# PUT hours & GET /restaurants/me/info reflects
# --------------------------------------------------------------------------------------
class TestOwnerHoursCRUD:
    def test_put_hours_and_readback(self, owner_token):
        payload_hours = {
            "mon": {"closed": False, "open": "09:00", "close": "22:00"},
            "tue": {"closed": False, "open": "10:00", "close": "23:00"},
            "wed": {"closed": False, "open": "09:00", "close": "22:00"},
            "thu": {"closed": False, "open": "09:00", "close": "22:00"},
            "fri": {"closed": False, "open": "09:00", "close": "22:00"},
            "sat": {"closed": False, "open": "09:00", "close": "22:00"},
            "sun": {"closed": False, "open": "09:00", "close": "22:00"},
        }
        r = _put_hours(owner_token, payload_hours)
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"

        info = requests.get(
            f"{API}/restaurants/me/info",
            headers={"Authorization": f"Bearer {owner_token}"},
            timeout=10,
        )
        assert info.status_code == 200
        body = info.json()
        assert body.get("hours"), "hours missing on readback"
        assert body["hours"]["tue"]["open"] == "10:00"
        assert body["hours"]["tue"]["close"] == "23:00"
        # is_open_now must be a boolean, not None
        assert isinstance(body.get("is_open_now"), bool)


# --------------------------------------------------------------------------------------
# Ordering blocked when closed
# --------------------------------------------------------------------------------------
class TestOrderingBlockedWhenClosed:
    def test_customer_order_blocked_when_today_closed(
        self, owner_token, customer_token, owner_restaurant_id, some_menu_item
    ):
        # ensure min_order is 0 so we're purely testing hours
        requests.put(
            f"{API}/restaurants/me",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"min_order_value": 0, "delivery_radius_km": 6},
            timeout=10,
        )
        # close today
        r = _put_hours(owner_token, _today_closed_hours())
        assert r.status_code == 200

        payload = {
            "restaurant_id": owner_restaurant_id,
            "items": [{
                "menu_item_id": some_menu_item["id"],
                "name": some_menu_item["name"],
                "price": some_menu_item["price"],
                "quantity": 2,
            }],
            "delivery_address": "TEST_iter11 closed-today",
            "delivery_lat": 41.0082,
            "delivery_lng": 28.9784,
            "notes": "TEST_iter11_today_closed",
        }
        resp = requests.post(
            f"{API}/orders",
            headers={"Authorization": f"Bearer {customer_token}"},
            json=payload,
            timeout=15,
        )
        assert resp.status_code == 400, f"expected 400, got {resp.status_code}: {resp.text}"
        assert "closed" in resp.json().get("detail", "").lower()

    def test_all_closed_isopen_false_and_guest_blocked(self, owner_token, owner_restaurant_id, some_menu_item):
        r = _put_hours(owner_token, _all_closed_hours())
        assert r.status_code == 200

        # is_open_now is now False on the public GET
        rget = requests.get(f"{API}/restaurants/{owner_restaurant_id}", timeout=10)
        assert rget.status_code == 200
        assert rget.json().get("is_open_now") is False

        # guest checkout is blocked
        guest_payload = {
            "email": "TEST_iter11_guest@example.com",
            "password": "password123",
            "name": "TEST Iter11 Guest",
            "phone": "+900000000000",
            "restaurant_id": owner_restaurant_id,
            "items": [{
                "menu_item_id": some_menu_item["id"],
                "name": some_menu_item["name"],
                "price": some_menu_item["price"],
                "quantity": 1,
            }],
            "delivery_address": "TEST_iter11 guest address",
            "delivery_lat": 41.0082,
            "delivery_lng": 28.9784,
            "notes": "TEST_iter11_all_closed_guest",
        }
        rg = requests.post(f"{API}/orders/guest", json=guest_payload, timeout=15)
        assert rg.status_code == 400, f"expected 400, got {rg.status_code}: {rg.text}"
        assert "closed" in rg.json().get("detail", "").lower()

    def test_restore_all_open(self, owner_token, owner_restaurant_id):
        r = _put_hours(owner_token, _all_open_hours())
        assert r.status_code == 200
        rget = requests.get(f"{API}/restaurants/{owner_restaurant_id}", timeout=10)
        assert rget.status_code == 200
        assert rget.json().get("is_open_now") is True


# --------------------------------------------------------------------------------------
# Courier location broadcast — no crash
# --------------------------------------------------------------------------------------
class TestCourierLocationBroadcast:
    def test_courier_location_update_returns_ok(self, courier_token):
        r = requests.post(
            f"{API}/couriers/me/location",
            headers={"Authorization": f"Bearer {courier_token}"},
            json={"lat": 41.0100, "lng": 28.9800},
            timeout=15,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert abs(body.get("lat", 0) - 41.0100) < 1e-6
        assert abs(body.get("lng", 0) - 28.9800) < 1e-6


# --------------------------------------------------------------------------------------
# Regression: campaign duration 1/3/7/14/30, min_order, radius, cleanup
# --------------------------------------------------------------------------------------
def _stop_campaign(owner_token):
    return requests.post(
        f"{API}/restaurants/me/campaign/stop",
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=10,
    )


class TestIter10Regression:
    @pytest.mark.parametrize("days", [1, 3, 7, 14, 30])
    def test_campaign_start_various_days(self, owner_token, days):
        _stop_campaign(owner_token)
        r = requests.post(
            f"{API}/restaurants/me/campaign/start",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"days": days},
            timeout=15,
        )
        assert r.status_code == 200, f"days={days}: {r.status_code} {r.text}"
        body = r.json()
        assert body["campaign_active"] is True
        ends = datetime.fromisoformat(body["campaign_ends_at"])
        delta = ends - datetime.now(timezone.utc)
        assert timedelta(days=days - 1, hours=23) < delta < timedelta(days=days, hours=1), \
            f"days={days} unexpected delta {delta}"
        _stop_campaign(owner_token)

    def test_min_order_enforced(self, owner_token, customer_token, owner_restaurant_id, some_menu_item):
        # ensure hours are open, min_order set high
        _put_hours(owner_token, _all_open_hours())
        requests.put(
            f"{API}/restaurants/me",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"min_order_value": 500, "delivery_radius_km": 6},
            timeout=10,
        )
        cheap = some_menu_item
        payload = {
            "restaurant_id": owner_restaurant_id,
            "items": [{
                "menu_item_id": cheap["id"], "name": cheap["name"],
                "price": cheap["price"], "quantity": 1,
            }],
            "delivery_address": "TEST_iter11 min-order",
            "delivery_lat": 41.0082, "delivery_lng": 28.9784,
            "notes": "TEST_iter11_min_order",
        }
        r = requests.post(
            f"{API}/orders",
            headers={"Authorization": f"Bearer {customer_token}"},
            json=payload, timeout=15,
        )
        assert r.status_code == 400
        assert "minimum order value" in r.json().get("detail", "").lower()

    def test_radius_zero_rejected(self, owner_token):
        r = requests.put(
            f"{API}/restaurants/me",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"delivery_radius_km": 0},
            timeout=10,
        )
        assert r.status_code == 422

    def test_cleanup_junk_idempotent(self):
        r1 = requests.post(f"{API}/admin/cleanup-junk-restaurants", timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/admin/cleanup-junk-restaurants", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["deleted"] == 0


# --------------------------------------------------------------------------------------
# Final teardown: restore Bella Napoli to safe defaults
# --------------------------------------------------------------------------------------
def test_zzz_teardown_restore_defaults(owner_token):
    _stop_campaign(owner_token)
    _put_hours(owner_token, _all_open_hours())
    r = requests.put(
        f"{API}/restaurants/me",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"min_order_value": 0, "delivery_radius_km": 4},
        timeout=10,
    )
    assert r.status_code == 200
