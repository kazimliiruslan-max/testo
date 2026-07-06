"""DirectDine iteration-6 tests:
- WebSocket /api/ws/orders auth (missing/invalid token -> close 4401)
- WS receives order_new when a customer posts a new order (broadcast to owner)
- WS receives order_status through full lifecycle for both customer & owner
- WS receives order_assigned for customer + courier when courier is assigned
- POST /api/register-push does not 500 with placeholder EMERGENT_PUSH_KEY
"""
import os
import asyncio
import json
import uuid
import pytest
import requests
import websockets

import websockets.exceptions as _ws_exc

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"
# ws scheme
WS_BASE = API.replace('https://', 'wss://').replace('http://', 'ws://')

OWNER1 = {"email": "owner1@directdine.com", "password": "password123"}
CUSTOMER = {"email": "customer1@directdine.com", "password": "password123"}
COURIER = {"email": "courier1@directdine.com", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def h(auth):
    return {"Authorization": f"Bearer {auth['access_token']}"}


@pytest.fixture(scope="module")
def owner_auth():
    return _login(OWNER1)


@pytest.fixture(scope="module")
def customer_auth():
    a = _login(CUSTOMER)
    assert a['user']['role'] == 'customer', (
        f"customer1 role={a['user']['role']}, expected 'customer'."
    )
    return a


@pytest.fixture(scope="module")
def courier_auth():
    return _login(COURIER)


@pytest.fixture(scope="module")
def bella():
    rests = requests.get(f"{API}/restaurants").json()
    return next(r for r in rests if r['name'] == 'Bella Napoli Pizzeria')


@pytest.fixture(scope="module")
def menu_item(bella):
    return requests.get(f"{API}/restaurants/{bella['id']}/menu").json()[0]


async def _collect(ws, timeout=2.0):
    msgs = []
    try:
        while True:
            m = await asyncio.wait_for(ws.recv(), timeout=timeout)
            msgs.append(json.loads(m))
    except asyncio.TimeoutError:
        pass
    except Exception:
        pass
    return msgs


# ---------- WS Auth ----------
class TestWSAuth:
    def test_missing_token_closes_4401(self):
        async def run():
            with pytest.raises(_ws_exc.ConnectionClosed) as exc:
                async with websockets.connect(f"{WS_BASE}/ws/orders") as ws:
                    await ws.recv()
            assert exc.value.rcvd is not None
            assert exc.value.rcvd.code == 4401
        asyncio.run(run())

    def test_invalid_token_closes_4401(self):
        async def run():
            url = f"{WS_BASE}/ws/orders?token=notavalidjwt"
            try:
                async with websockets.connect(url) as ws:
                    await asyncio.wait_for(ws.recv(), timeout=3.0)
                    assert False, "expected close"
            except _ws_exc.ConnectionClosed as e:
                assert e.rcvd is not None
                assert e.rcvd.code == 4401
        asyncio.run(run())

    def test_valid_token_connects(self, owner_auth):
        async def run():
            url = f"{WS_BASE}/ws/orders?token={owner_auth['access_token']}"
            async with websockets.connect(url) as ws:
                # No message expected immediately; but connection should stay open
                await asyncio.sleep(0.3)
                assert ws.state.name in ('OPEN', 'CONNECTING')
        asyncio.run(run())


# ---------- WS order_new + order_status + order_assigned ----------
class TestWSOrderEvents:
    def test_order_new_broadcast_to_owner(
        self, owner_auth, customer_auth, bella, menu_item
    ):
        results = {}

        async def run():
            owner_url = f"{WS_BASE}/ws/orders?token={owner_auth['access_token']}"
            async with websockets.connect(owner_url) as ows:
                await asyncio.sleep(0.3)  # let server accept

                # Post an order (from HTTP thread would block; do it in executor)
                loop = asyncio.get_event_loop()
                payload = {
                    "restaurant_id": bella['id'],
                    "items": [{
                        "menu_item_id": menu_item['id'],
                        "name": menu_item['name'],
                        "price": menu_item['price'],
                        "quantity": 1
                    }],
                    "delivery_address": "TEST_iter6 WS ordernew",
                    "delivery_lat": 41.0369,
                    "delivery_lng": 28.985,
                    "notes": "iter6-ws",
                }

                def post_order():
                    return requests.post(
                        f"{API}/orders",
                        headers=h(customer_auth),
                        json=payload,
                        timeout=30,
                    )

                resp = await loop.run_in_executor(None, post_order)
                assert resp.status_code == 200, resp.text
                results['order'] = resp.json()

                msgs = await _collect(ows, timeout=2.0)
                results['owner_msgs'] = msgs

        asyncio.run(run())

        oid = results['order']['id']
        msgs = results['owner_msgs']
        new_msgs = [m for m in msgs
                    if m.get('type') == 'order_new'
                    and m.get('order_id') == oid]
        assert new_msgs, (
            f"owner did not receive order_new for {oid}. got: {msgs}"
        )
        m = new_msgs[0]
        assert 'customer_name' in m
        assert 'total' in m
        assert 'restaurant_name' in m

        # cleanup
        requests.post(f"{API}/orders/{oid}/cancel",
                      headers=h(customer_auth))

    def test_full_lifecycle_ws_events(
        self, owner_auth, customer_auth, courier_auth, bella, menu_item
    ):
        """Verify each transition emits order_status to owner+customer,
        assign emits order_assigned to customer + courier."""
        collected = {'owner': [], 'customer': [], 'courier': []}

        async def run():
            owner_url = f"{WS_BASE}/ws/orders?token={owner_auth['access_token']}"
            cust_url = f"{WS_BASE}/ws/orders?token={customer_auth['access_token']}"
            cour_url = f"{WS_BASE}/ws/orders?token={courier_auth['access_token']}"

            async with websockets.connect(owner_url) as ows, \
                    websockets.connect(cust_url) as cws, \
                    websockets.connect(cour_url) as courws:
                await asyncio.sleep(0.4)

                loop = asyncio.get_event_loop()
                # place order
                payload = {
                    "restaurant_id": bella['id'],
                    "items": [{
                        "menu_item_id": menu_item['id'],
                        "name": menu_item['name'],
                        "price": menu_item['price'],
                        "quantity": 1
                    }],
                    "delivery_address": "TEST_iter6 lifecycle",
                    "delivery_lat": 41.03,
                    "delivery_lng": 28.98,
                }
                r = await loop.run_in_executor(
                    None,
                    lambda: requests.post(
                        f"{API}/orders",
                        headers=h(customer_auth),
                        json=payload,
                        timeout=30,
                    )
                )
                assert r.status_code == 200, r.text
                order = r.json()
                oid = order['id']

                await asyncio.sleep(0.5)

                # accepted
                await loop.run_in_executor(
                    None,
                    lambda: requests.post(
                        f"{API}/orders/{oid}/status",
                        headers=h(owner_auth),
                        json={"status": "accepted"},
                        timeout=30,
                    )
                )
                await asyncio.sleep(0.4)

                # preparing
                await loop.run_in_executor(
                    None,
                    lambda: requests.post(
                        f"{API}/orders/{oid}/status",
                        headers=h(owner_auth),
                        json={"status": "preparing"},
                        timeout=30,
                    )
                )
                await asyncio.sleep(0.4)

                # assign courier -> out_for_delivery
                me = requests.get(f"{API}/auth/me",
                                  headers=h(courier_auth)).json()
                cid = me['id']
                await loop.run_in_executor(
                    None,
                    lambda: requests.post(
                        f"{API}/orders/{oid}/assign",
                        headers=h(owner_auth),
                        json={"courier_id": cid},
                        timeout=30,
                    )
                )
                await asyncio.sleep(0.5)

                # delivered
                await loop.run_in_executor(
                    None,
                    lambda: requests.post(
                        f"{API}/orders/{oid}/status",
                        headers=h(courier_auth),
                        json={"status": "delivered"},
                        timeout=30,
                    )
                )

                # Gather remaining messages
                collected['owner'] = await _collect(ows, timeout=2.5)
                collected['customer'] = await _collect(cws, timeout=1.0)
                collected['courier'] = await _collect(courws, timeout=1.0)
                collected['oid'] = oid

        asyncio.run(run())

        oid = collected['oid']

        def types_for(role):
            return [m.get('type') for m in collected[role]
                    if m.get('order_id') == oid]

        owner_types = types_for('owner')
        cust_types = types_for('customer')
        cour_types = types_for('courier')

        # Owner should see order_status transitions (accepted/preparing/
        # out_for_delivery/delivered) and order_assigned
        for expected_status in ('accepted', 'preparing', 'delivered'):
            found = any(
                m.get('type') == 'order_status'
                and m.get('status') == expected_status
                and m.get('order_id') == oid
                for m in collected['owner']
            )
            assert found, (
                f"owner missing order_status={expected_status}. "
                f"got={collected['owner']}"
            )

        # Customer should see order_status transitions
        for expected_status in ('accepted', 'preparing', 'delivered'):
            found = any(
                m.get('type') == 'order_status'
                and m.get('status') == expected_status
                and m.get('order_id') == oid
                for m in collected['customer']
            )
            assert found, (
                f"customer missing status={expected_status}. "
                f"got={collected['customer']}"
            )

        # Assign event to customer + courier
        cust_assigned = [m for m in collected['customer']
                         if m.get('type') == 'order_assigned'
                         and m.get('order_id') == oid]
        cour_assigned = [m for m in collected['courier']
                         if m.get('type') == 'order_assigned'
                         and m.get('order_id') == oid]
        assert cust_assigned, (
            f"customer missing order_assigned. got={collected['customer']}"
        )
        assert cour_assigned, (
            f"courier missing order_assigned. got={collected['courier']}"
        )

        # Courier should see delivered status
        assert any(
            m.get('type') == 'order_status' and m.get('status') == 'delivered'
            and m.get('order_id') == oid
            for m in collected['courier']
        ), f"courier missing delivered status. got={collected['courier']}"

        # Just print summaries for debugging
        print(f"owner types for {oid}: {owner_types}")
        print(f"cust  types for {oid}: {cust_types}")
        print(f"cour  types for {oid}: {cour_types}")


# ---------- Register push ----------
class TestRegisterPush:
    def test_register_push_no_500_with_placeholder_key(self, customer_auth):
        payload = {
            "user_id": customer_auth['user']['id'],
            "platform": "ios",
            "device_token": f"TEST_iter6_{uuid.uuid4().hex[:8]}",
        }
        r = requests.post(f"{API}/register-push", json=payload, timeout=30)
        # Spec: with placeholder key, upstream returns 401/403 -> backend
        # should NOT 500; should return {status:'queued'}
        # OR if key is real: 201 {status:'registered'}
        assert r.status_code in (200, 201), (
            f"register-push returned {r.status_code}: {r.text}"
        )
        body = r.json()
        assert body.get('status') in ('queued', 'registered'), body
