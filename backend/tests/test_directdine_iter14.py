"""
Iter14 backend tests — DirectDine
Focus:
  (1) GET /api/restaurants search filter (name/cuisine/description case-insensitive)
  (2) GET /api/restaurants min_rating filter
  (3) GET /api/restaurants sort=rating / sort=name and combined with lat/lng
  (4) GET /api/owner/analytics — shape and value assertions
  (5) Regression iter12/13: campaign duration [1/3/7/14/30], min_order, delivery_radius,
      closed → 400, availability → 400, review lifecycle, restaurant location save.
Cleanup restores Bella Napoli defaults at module teardown.
"""
import os
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
    yield
    requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                 json={
                     "lat": DEFAULT_LAT,
                     "lng": DEFAULT_LNG,
                     "address": DEFAULT_ADDRESS,
                     "delivery_radius_km": 5.0,
                     "min_order_value": 0.0,
                     "hours": ALL_OPEN_HOURS,
                 }, timeout=10)


# ---------------- ITER14 — Search / Filter / Sort ----------------
class TestRestaurantSearchAndFilter:
    def test_search_by_name_pizza(self):
        r = requests.get(f"{API}/restaurants", params={"search": "pizza"}, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least one Pizza match"
        # Every returned restaurant should contain 'pizza' in name/cuisine/description (case-insensitive)
        for rest in data:
            hay = f"{rest.get('name','')} {rest.get('cuisine','')} {rest.get('description','')}".lower()
            assert "pizza" in hay, f"'pizza' not found in name/cuisine/description of {rest.get('name')}"

    def test_search_case_insensitive(self):
        r_lower = requests.get(f"{API}/restaurants", params={"search": "burger"}, timeout=10)
        r_upper = requests.get(f"{API}/restaurants", params={"search": "BURGER"}, timeout=10)
        r_mixed = requests.get(f"{API}/restaurants", params={"search": "Burger"}, timeout=10)
        assert r_lower.status_code == r_upper.status_code == r_mixed.status_code == 200
        ids_l = sorted(x["id"] for x in r_lower.json())
        ids_u = sorted(x["id"] for x in r_upper.json())
        ids_m = sorted(x["id"] for x in r_mixed.json())
        assert ids_l == ids_u == ids_m, "Search must be case-insensitive"
        assert len(ids_l) >= 1

    def test_search_matches_description(self):
        # 'wood-fired' appears in Bella Napoli description
        r = requests.get(f"{API}/restaurants", params={"search": "wood-fired"}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert any("Bella Napoli" in x["name"] for x in data), \
            "Description search 'wood-fired' should surface Bella Napoli"

    def test_min_rating_filter(self):
        r = requests.get(f"{API}/restaurants", params={"min_rating": 4.5}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for rest in data:
            assert rest["rating"] >= 4.5, f"{rest['name']} rating {rest['rating']} < 4.5"

    def test_min_rating_high_excludes(self):
        r = requests.get(f"{API}/restaurants", params={"min_rating": 4.85}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        for rest in data:
            assert rest["rating"] >= 4.85

    def test_min_rating_with_lat_lng_distance_still_computed(self):
        r = requests.get(f"{API}/restaurants",
                         params={"min_rating": 4.5, "lat": 41.04, "lng": 28.98},
                         timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        # distance_km should be populated on each entry
        for rest in data:
            assert rest.get("distance_km") is not None, "distance_km should be set when lat/lng provided"
            assert rest["rating"] >= 4.5
        # Sort by distance still applied (in_range then distance ascending)
        # Check the list is ordered by (not in_range, distance_km)
        prev_key = (False, -1.0)
        for rest in data:
            cur_key = (not rest["in_range"], rest["distance_km"])
            assert cur_key >= prev_key, f"Distance ordering broken at {rest['name']}"
            prev_key = cur_key

    def test_sort_rating_desc(self):
        r = requests.get(f"{API}/restaurants", params={"sort": "rating"}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 2
        ratings = [x["rating"] for x in data]
        assert ratings == sorted(ratings, reverse=True), f"Rating desc broken: {ratings}"

    def test_sort_name_asc(self):
        r = requests.get(f"{API}/restaurants", params={"sort": "name"}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 2
        names = [x["name"].lower() for x in data]
        assert names == sorted(names), f"Name asc broken: {names}"


# ---------------- ITER14 — Owner analytics ----------------
class TestOwnerAnalytics:
    REQUIRED_KEYS = {
        "days", "total_orders", "delivered", "cancelled", "revenue",
        "avg_order_value", "top_items", "peak_hour", "peak_weekday",
        "hour_histogram", "weekday_histogram", "avg_rating", "review_count",
    }

    def test_owner_analytics_shape(self, owner_ctx):
        r = requests.get(f"{API}/owner/analytics", headers=owner_ctx["h"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        missing = self.REQUIRED_KEYS - set(d.keys())
        assert not missing, f"Missing keys: {missing}"
        # Types
        assert isinstance(d["days"], int) and d["days"] >= 1
        assert isinstance(d["total_orders"], int)
        assert isinstance(d["delivered"], int)
        assert isinstance(d["cancelled"], int)
        assert isinstance(d["revenue"], (int, float))
        assert isinstance(d["avg_order_value"], (int, float))
        assert isinstance(d["top_items"], list)
        assert d["peak_hour"] is None or (isinstance(d["peak_hour"], int) and 0 <= d["peak_hour"] <= 23)
        assert d["peak_weekday"] is None or (isinstance(d["peak_weekday"], int) and 0 <= d["peak_weekday"] <= 6)
        assert isinstance(d["hour_histogram"], list) and len(d["hour_histogram"]) == 24
        assert isinstance(d["weekday_histogram"], list) and len(d["weekday_histogram"]) == 7
        assert d["avg_rating"] is None or isinstance(d["avg_rating"], (int, float))
        assert isinstance(d["review_count"], int)
        # top_items entries have name/qty/revenue
        for t in d["top_items"]:
            assert set(["name", "qty", "revenue"]).issubset(t.keys()), t

    def test_owner_analytics_days_param(self, owner_ctx):
        r = requests.get(f"{API}/owner/analytics", headers=owner_ctx["h"],
                         params={"days": 7}, timeout=15)
        assert r.status_code == 200
        assert r.json()["days"] == 7

    def test_owner_analytics_days_clamped(self, owner_ctx):
        # days is clamped to [1, 365]
        r = requests.get(f"{API}/owner/analytics", headers=owner_ctx["h"],
                         params={"days": 5000}, timeout=15)
        assert r.status_code == 200
        assert r.json()["days"] == 365

    def test_owner_analytics_requires_owner_role(self, cust_ctx):
        r = requests.get(f"{API}/owner/analytics", headers=cust_ctx["h"], timeout=15)
        assert r.status_code == 403

    def test_owner_analytics_unauth(self):
        r = requests.get(f"{API}/owner/analytics", timeout=15)
        assert r.status_code == 401


# ---------------- Regression iter12/13 ----------------
class TestRegression:
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
        rid = bella["id"]
        requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                     json={"hours": ALL_OPEN_HOURS, "min_order_value": 0.0}, timeout=10)
        menu = requests.get(f"{API}/restaurants/{rid}/menu", timeout=10).json()
        item = menu[0]
        payload = {
            "restaurant_id": rid,
            "items": [{"menu_item_id": item["id"], "name": item["name"],
                       "price": item["price"], "quantity": 1}],
            "delivery_address": "iter14 review-gate",
            "delivery_lat": 41.037, "delivery_lng": 28.985, "notes": "TEST_review_iter14",
        }
        rc = requests.post(f"{API}/orders", headers=cust_ctx["h"], json=payload, timeout=10)
        assert rc.status_code == 200, rc.text
        oid = rc.json()["id"]
        rv = requests.post(f"{API}/reviews", headers=cust_ctx["h"],
                           json={"order_id": oid, "stars": 5, "comment": "Too early"}, timeout=10)
        assert rv.status_code == 400
        assert "delivered" in rv.json().get("detail", "").lower()
        requests.post(f"{API}/orders/{oid}/status", headers=owner_ctx["h"],
                      json={"status": "cancelled"}, timeout=10)

    def test_restaurant_location_save_persists(self, owner_ctx):
        payload = {"lat": 41.05, "lng": 29.02, "address": "Kadikoy Iter14"}
        r = requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"], json=payload, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["lat"] == 41.05 and body["lng"] == 29.02 and body["address"] == "Kadikoy Iter14"
        g = requests.get(f"{API}/restaurants/me/info", headers=owner_ctx["h"], timeout=10)
        assert g.status_code == 200
        info = g.json()
        assert info["lat"] == 41.05 and info["lng"] == 29.02 and info["address"] == "Kadikoy Iter14"
        # Restore
        requests.put(f"{API}/restaurants/me", headers=owner_ctx["h"],
                     json={"lat": DEFAULT_LAT, "lng": DEFAULT_LNG, "address": DEFAULT_ADDRESS},
                     timeout=10)
