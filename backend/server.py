from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import secrets
import jwt
import bcrypt
import resend
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'directdine-dev-secret-change-in-prod-8f7d2a')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_HOURS = 24 * 7

RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
RESEND_FROM = os.environ.get('RESEND_FROM', 'DirectDine <onboarding@resend.dev>')
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

app = FastAPI(title="DirectDine API")
api_router = APIRouter(prefix="/api")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

Role = Literal['customer', 'restaurant_owner', 'courier']

# ---------- Models ----------
def now_iso():
    return datetime.now(timezone.utc).isoformat()

class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    phone: Optional[str] = None
    restaurant_id: Optional[str] = None  # for owner/courier
    created_at: str

class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Role
    phone: Optional[str] = None
    restaurant_name: Optional[str] = None  # if owner registering, auto-create restaurant

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic

class Restaurant(BaseModel):
    id: str
    owner_id: str
    name: str
    description: str = ""
    cuisine: str = "Other"
    image_url: str = ""
    rating: float = 4.5
    address: str = ""
    lat: float = 41.0082
    lng: float = 28.9784
    delivery_minutes: int = 30
    subscription_active: bool = True
    is_featured: bool = False
    featured_tagline: str = ""
    created_at: str

class RestaurantCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    cuisine: Optional[str] = "Other"
    image_url: Optional[str] = ""
    address: Optional[str] = ""
    lat: Optional[float] = 41.0082
    lng: Optional[float] = 28.9784
    delivery_minutes: Optional[int] = 30

class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cuisine: Optional[str] = None
    image_url: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    delivery_minutes: Optional[int] = None

class MenuItem(BaseModel):
    id: str
    restaurant_id: str
    name: str
    description: str = ""
    price: float
    category: str = "Main"
    image_url: str = ""
    available: bool = True
    created_at: str

class MenuItemCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    price: float
    category: Optional[str] = "Main"
    image_url: Optional[str] = ""
    available: Optional[bool] = True

class CourierInfo(BaseModel):
    id: str  # user id
    name: str
    phone: Optional[str] = None
    restaurant_id: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    available: bool = True

class CourierCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None

class CourierInvite(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None

class CourierInviteInfo(BaseModel):
    email: EmailStr
    name: str
    restaurant_name: str
    token: str

class CourierAcceptInvite(BaseModel):
    token: str
    password: str

class CourierInviteResponse(BaseModel):
    invite_link: str
    email: EmailStr
    token: str
    restaurant_name: str
    email_sent: bool = False

class GuestOrderCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    restaurant_id: str
    items: List['OrderItem']
    delivery_address: str
    delivery_lat: float
    delivery_lng: float
    notes: Optional[str] = ""

class CourierLocation(BaseModel):
    lat: float
    lng: float

class OrderItem(BaseModel):
    menu_item_id: str
    name: str
    price: float
    quantity: int

class OrderCreate(BaseModel):
    restaurant_id: str
    items: List[OrderItem]
    delivery_address: str
    delivery_lat: float
    delivery_lng: float
    notes: Optional[str] = ""

class Order(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    restaurant_id: str
    restaurant_name: str
    courier_id: Optional[str] = None
    courier_name: Optional[str] = None
    items: List[OrderItem]
    total: float
    delivery_address: str
    delivery_lat: float
    delivery_lng: float
    notes: str = ""
    status: str = "pending"  # pending, accepted, preparing, out_for_delivery, delivered, cancelled
    payment_method: str = "cash_on_delivery"
    created_at: str
    updated_at: str

class OrderStatusUpdate(BaseModel):
    status: str

class AssignCourierInput(BaseModel):
    courier_id: str


# ---------- Address Book ----------
class AddressCreate(BaseModel):
    label: str  # "Home" / "Work" / "Other" or custom
    address: str
    extra: Optional[str] = ""
    lat: float
    lng: float

class Address(BaseModel):
    id: str
    user_id: str
    label: str
    address: str
    extra: str = ""
    lat: float
    lng: float
    created_at: str


# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def create_token(user_id: str, role: str) -> str:
    payload = {
        'sub': user_id,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def user_to_public(u: dict) -> UserPublic:
    return UserPublic(
        id=u['id'],
        email=u['email'],
        name=u['name'],
        role=u['role'],
        phone=u.get('phone'),
        restaurant_id=u.get('restaurant_id'),
        created_at=u['created_at'],
    )

async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('sub')
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def require_roles(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if user['role'] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker


# ---------- Auth Routes ----------
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(data: RegisterInput):
    existing = await db.users.find_one({'email': data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if data.role == 'courier':
        raise HTTPException(status_code=400, detail="Couriers can only be added by their restaurant owner")

    user_id = str(uuid.uuid4())
    restaurant_id = None
    if data.role == 'restaurant_owner':
        restaurant_id = str(uuid.uuid4())
        rest_doc = {
            'id': restaurant_id,
            'owner_id': user_id,
            'name': data.restaurant_name or f"{data.name}'s Restaurant",
            'description': '',
            'cuisine': 'Other',
            'image_url': 'https://images.pexels.com/photos/8177890/pexels-photo-8177890.jpeg',
            'rating': 5.0,
            'address': '',
            'lat': 41.0082,
            'lng': 28.9784,
            'delivery_minutes': 30,
            'subscription_active': True,
            'created_at': now_iso(),
        }
        await db.restaurants.insert_one(rest_doc)

    user_doc = {
        'id': user_id,
        'email': data.email.lower(),
        'password_hash': hash_password(data.password),
        'name': data.name,
        'role': data.role,
        'phone': data.phone,
        'restaurant_id': restaurant_id,
        'created_at': now_iso(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id, data.role)
    return AuthResponse(access_token=token, user=user_to_public(user_doc))


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(data: LoginInput):
    user = await db.users.find_one({'email': data.email.lower()}, {'_id': 0})
    if not user or not verify_password(data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user['id'], user['role'])
    return AuthResponse(access_token=token, user=user_to_public(user))


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return user_to_public(user)


# ---------- Restaurant Routes ----------
@api_router.get("/restaurants", response_model=List[Restaurant])
async def list_restaurants(cuisine: Optional[str] = None):
    q = {'subscription_active': True}
    if cuisine and cuisine != 'All':
        q['cuisine'] = cuisine
    docs = await db.restaurants.find(q, {'_id': 0}).to_list(500)
    return [Restaurant(**d) for d in docs]

@api_router.get("/restaurants/{rid}", response_model=Restaurant)
async def get_restaurant(rid: str):
    doc = await db.restaurants.find_one({'id': rid}, {'_id': 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return Restaurant(**doc)

@api_router.put("/restaurants/me", response_model=Restaurant)
async def update_my_restaurant(data: RestaurantUpdate, user: dict = Depends(require_roles('restaurant_owner'))):
    update = {k: v for k, v in data.dict().items() if v is not None}
    if update:
        await db.restaurants.update_one({'id': user['restaurant_id']}, {'$set': update})
    doc = await db.restaurants.find_one({'id': user['restaurant_id']}, {'_id': 0})
    return Restaurant(**doc)

@api_router.get("/restaurants/me/info", response_model=Restaurant)
async def get_my_restaurant(user: dict = Depends(require_roles('restaurant_owner'))):
    doc = await db.restaurants.find_one({'id': user['restaurant_id']}, {'_id': 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return Restaurant(**doc)


# ---------- Menu Routes ----------
@api_router.get("/restaurants/{rid}/menu", response_model=List[MenuItem])
async def list_menu(rid: str):
    docs = await db.menu_items.find({'restaurant_id': rid}, {'_id': 0}).to_list(500)
    return [MenuItem(**d) for d in docs]

@api_router.post("/menu", response_model=MenuItem)
async def create_menu_item(data: MenuItemCreate, user: dict = Depends(require_roles('restaurant_owner'))):
    item = {
        'id': str(uuid.uuid4()),
        'restaurant_id': user['restaurant_id'],
        'name': data.name,
        'description': data.description or '',
        'price': data.price,
        'category': data.category or 'Main',
        'image_url': data.image_url or '',
        'available': data.available if data.available is not None else True,
        'created_at': now_iso(),
    }
    await db.menu_items.insert_one(item)
    return MenuItem(**item)

@api_router.delete("/menu/{item_id}")
async def delete_menu_item(item_id: str, user: dict = Depends(require_roles('restaurant_owner'))):
    res = await db.menu_items.delete_one({'id': item_id, 'restaurant_id': user['restaurant_id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {'ok': True}


# ---------- Courier Routes ----------
@api_router.post("/couriers", response_model=CourierInfo)
async def create_courier(data: CourierCreate, user: dict = Depends(require_roles('restaurant_owner'))):
    existing = await db.users.find_one({'email': data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    courier_id = str(uuid.uuid4())
    user_doc = {
        'id': courier_id,
        'email': data.email.lower(),
        'password_hash': hash_password(data.password),
        'name': data.name,
        'role': 'courier',
        'phone': data.phone,
        'restaurant_id': user['restaurant_id'],
        'lat': None,
        'lng': None,
        'available': True,
        'created_at': now_iso(),
    }
    await db.users.insert_one(user_doc)
    return CourierInfo(id=courier_id, name=data.name, phone=data.phone,
                       restaurant_id=user['restaurant_id'], lat=None, lng=None, available=True)

@api_router.get("/couriers", response_model=List[CourierInfo])
async def list_couriers(user: dict = Depends(require_roles('restaurant_owner'))):
    docs = await db.users.find({'role': 'courier', 'restaurant_id': user['restaurant_id']}, {'_id': 0}).to_list(500)
    return [CourierInfo(id=d['id'], name=d['name'], phone=d.get('phone'),
                        restaurant_id=d['restaurant_id'], lat=d.get('lat'),
                        lng=d.get('lng'), available=d.get('available', True)) for d in docs]

@api_router.post("/couriers/me/location")
async def update_courier_location(loc: CourierLocation, user: dict = Depends(require_roles('courier'))):
    await db.users.update_one({'id': user['id']}, {'$set': {'lat': loc.lat, 'lng': loc.lng}})
    return {'ok': True, 'lat': loc.lat, 'lng': loc.lng}

@api_router.get("/couriers/{cid}/location")
async def get_courier_location(cid: str):
    doc = await db.users.find_one({'id': cid, 'role': 'courier'}, {'_id': 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Courier not found")
    return {'id': cid, 'name': doc['name'], 'lat': doc.get('lat'), 'lng': doc.get('lng')}


# ---------- Courier Invite Flow ----------
def _build_invite_link(token: str) -> str:
    base = os.environ.get('PUBLIC_APP_URL', 'https://directdine.app')
    return f"{base}/invite/{token}"

def _send_invite_email(to_email: str, courier_name: str, restaurant_name: str, invite_link: str) -> bool:
    """Send courier invite email via Resend. Returns True on success. Non-fatal on failure."""
    if not RESEND_API_KEY:
        logger.info(f"[EMAIL SKIP] No RESEND_API_KEY set. Link for {to_email}: {invite_link}")
        return False
    try:
        html = f"""
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
          <div style="text-align:center;padding:24px 0">
            <div style="display:inline-block;background:#2ECC71;color:#fff;font-weight:800;padding:12px 20px;border-radius:8px;font-size:20px">🚴 DirectDine</div>
          </div>
          <h1 style="font-size:22px;margin:16px 0">Hi {courier_name}, you're invited!</h1>
          <p style="font-size:16px;color:#4a4a4a;line-height:1.5">
            <strong>{restaurant_name}</strong> has invited you to join DirectDine as their courier.
            Tap the button below to set your password and open your delivery dashboard.
          </p>
          <div style="text-align:center;margin:32px 0">
            <a href="{invite_link}" style="background:#2ECC71;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;display:inline-block;font-size:16px">
              Activate my account
            </a>
          </div>
          <p style="font-size:13px;color:#7a7a7a">
            Or copy this link into your browser:<br/>
            <a href="{invite_link}" style="color:#1E9E5C">{invite_link}</a>
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:32px 0"/>
          <p style="font-size:12px;color:#a0a0a0;text-align:center">
            DirectDine — 0% commission food delivery
          </p>
        </div>
        """
        resend.Emails.send({
            "from": RESEND_FROM,
            "to": [to_email],
            "subject": f"You're invited to deliver for {restaurant_name}",
            "html": html,
        })
        return True
    except Exception as e:
        logger.error(f"[EMAIL] Resend send failed for {to_email}: {e}")
        return False


@api_router.post("/couriers/invite", response_model=CourierInviteResponse)
async def invite_courier(data: CourierInvite, user: dict = Depends(require_roles('restaurant_owner'))):
    existing = await db.users.find_one({'email': data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    token = secrets.token_urlsafe(24)
    invite_doc = {
        'token': token,
        'email': data.email.lower(),
        'name': data.name,
        'phone': data.phone,
        'restaurant_id': user['restaurant_id'],
        'invited_by': user['id'],
        'accepted': False,
        'created_at': now_iso(),
    }
    await db.courier_invites.insert_one(invite_doc)
    rest = await db.restaurants.find_one({'id': user['restaurant_id']}, {'_id': 0})
    restaurant_name = rest['name'] if rest else ''
    invite_link = _build_invite_link(token)
    email_sent = _send_invite_email(data.email, data.name, restaurant_name, invite_link)
    if email_sent:
        logger.info(f"[EMAIL SENT] Invite for {data.email} via Resend")
    return CourierInviteResponse(
        invite_link=invite_link,
        email=data.email,
        token=token,
        restaurant_name=restaurant_name,
        email_sent=email_sent,
    )

@api_router.get("/couriers/invite/{token}", response_model=CourierInviteInfo)
async def get_invite(token: str):
    inv = await db.courier_invites.find_one({'token': token, 'accepted': False}, {'_id': 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    rest = await db.restaurants.find_one({'id': inv['restaurant_id']}, {'_id': 0})
    return CourierInviteInfo(
        email=inv['email'], name=inv['name'],
        restaurant_name=rest['name'] if rest else '', token=token,
    )

@api_router.post("/couriers/accept-invite", response_model=AuthResponse)
async def accept_invite(data: CourierAcceptInvite):
    inv = await db.courier_invites.find_one({'token': data.token, 'accepted': False}, {'_id': 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    existing = await db.users.find_one({'email': inv['email']})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id, 'email': inv['email'],
        'password_hash': hash_password(data.password),
        'name': inv['name'], 'role': 'courier', 'phone': inv.get('phone'),
        'restaurant_id': inv['restaurant_id'], 'lat': None, 'lng': None,
        'available': True, 'created_at': now_iso(),
    }
    await db.users.insert_one(user_doc)
    await db.courier_invites.update_one({'token': data.token}, {'$set': {'accepted': True, 'accepted_at': now_iso()}})
    token = create_token(user_id, 'courier')
    return AuthResponse(access_token=token, user=user_to_public(user_doc))


# ---------- Mode switch: customer -> restaurant_owner ----------
class UpgradeToOwnerInput(BaseModel):
    restaurant_name: str

@api_router.post("/auth/switch-to-owner", response_model=AuthResponse)
async def switch_to_owner(data: UpgradeToOwnerInput, user: dict = Depends(get_current_user)):
    if user['role'] == 'restaurant_owner':
        raise HTTPException(status_code=400, detail="Already a restaurant owner")
    if user['role'] == 'courier':
        raise HTTPException(status_code=400, detail="Couriers cannot switch modes")
    restaurant_id = str(uuid.uuid4())
    rest_doc = {
        'id': restaurant_id, 'owner_id': user['id'],
        'name': data.restaurant_name, 'description': '', 'cuisine': 'Other',
        'image_url': 'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg',
        'rating': 5.0, 'address': '', 'lat': 41.0082, 'lng': 28.9784,
        'delivery_minutes': 30, 'subscription_active': True, 'is_featured': False,
        'featured_tagline': '', 'created_at': now_iso(),
    }
    await db.restaurants.insert_one(rest_doc)
    await db.users.update_one({'id': user['id']}, {'$set': {
        'role': 'restaurant_owner', 'restaurant_id': restaurant_id,
    }})
    updated = await db.users.find_one({'id': user['id']}, {'_id': 0})
    token = create_token(user['id'], 'restaurant_owner')
    return AuthResponse(access_token=token, user=user_to_public(updated))


# ---------- Order Routes ----------
@api_router.post("/orders/guest", response_model=AuthResponse)
async def create_order_as_guest(data: GuestOrderCreate):
    """Guest checkout: creates a customer account + places an order in one call. Returns auth token."""
    existing = await db.users.find_one({'email': data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered — please log in instead")
    rest = await db.restaurants.find_one({'id': data.restaurant_id}, {'_id': 0})
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    user_id = str(uuid.uuid4())
    user_doc = {
        'id': user_id, 'email': data.email.lower(),
        'password_hash': hash_password(data.password),
        'name': data.name, 'role': 'customer', 'phone': data.phone,
        'restaurant_id': None, 'created_at': now_iso(),
    }
    await db.users.insert_one(user_doc)
    total = sum(i.price * i.quantity for i in data.items)
    ts = now_iso()
    order = {
        'id': str(uuid.uuid4()), 'customer_id': user_id, 'customer_name': data.name,
        'customer_phone': data.phone, 'restaurant_id': data.restaurant_id,
        'restaurant_name': rest['name'], 'courier_id': None, 'courier_name': None,
        'items': [i.dict() for i in data.items], 'total': total,
        'delivery_address': data.delivery_address, 'delivery_lat': data.delivery_lat,
        'delivery_lng': data.delivery_lng, 'notes': data.notes or '',
        'status': 'pending', 'payment_method': 'cash_on_delivery',
        'created_at': ts, 'updated_at': ts,
    }
    await db.orders.insert_one(order)
    token = create_token(user_id, 'customer')
    return AuthResponse(access_token=token, user=user_to_public(user_doc))


@api_router.post("/orders", response_model=Order)
async def create_order(data: OrderCreate, user: dict = Depends(require_roles('customer'))):
    rest = await db.restaurants.find_one({'id': data.restaurant_id}, {'_id': 0})
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    total = sum(i.price * i.quantity for i in data.items)
    order_id = str(uuid.uuid4())
    ts = now_iso()
    order = {
        'id': order_id,
        'customer_id': user['id'],
        'customer_name': user['name'],
        'customer_phone': user.get('phone'),
        'restaurant_id': data.restaurant_id,
        'restaurant_name': rest['name'],
        'courier_id': None,
        'courier_name': None,
        'items': [i.dict() for i in data.items],
        'total': total,
        'delivery_address': data.delivery_address,
        'delivery_lat': data.delivery_lat,
        'delivery_lng': data.delivery_lng,
        'notes': data.notes or '',
        'status': 'pending',
        'payment_method': 'cash_on_delivery',
        'created_at': ts,
        'updated_at': ts,
    }
    await db.orders.insert_one(order)
    order.pop('_id', None)
    return Order(**order)

@api_router.get("/orders", response_model=List[Order])
async def list_orders(user: dict = Depends(get_current_user)):
    if user['role'] == 'customer':
        q = {'customer_id': user['id']}
    elif user['role'] == 'restaurant_owner':
        q = {'restaurant_id': user['restaurant_id']}
    else:  # courier
        q = {'courier_id': user['id']}
    docs = await db.orders.find(q, {'_id': 0}).sort('created_at', -1).to_list(500)
    return [Order(**d) for d in docs]

@api_router.get("/orders/{oid}", response_model=Order)
async def get_order(oid: str, user: dict = Depends(get_current_user)):
    doc = await db.orders.find_one({'id': oid}, {'_id': 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    if user['role'] == 'customer' and doc['customer_id'] != user['id']:
        raise HTTPException(status_code=403, detail="Forbidden")
    if user['role'] == 'restaurant_owner' and doc['restaurant_id'] != user.get('restaurant_id'):
        raise HTTPException(status_code=403, detail="Forbidden")
    if user['role'] == 'courier' and doc.get('courier_id') != user['id']:
        raise HTTPException(status_code=403, detail="Forbidden")
    return Order(**doc)

@api_router.post("/orders/{oid}/assign", response_model=Order)
async def assign_courier(oid: str, data: AssignCourierInput, user: dict = Depends(require_roles('restaurant_owner'))):
    order = await db.orders.find_one({'id': oid}, {'_id': 0})
    if not order or order['restaurant_id'] != user['restaurant_id']:
        raise HTTPException(status_code=404, detail="Order not found")
    courier = await db.users.find_one({'id': data.courier_id, 'role': 'courier', 'restaurant_id': user['restaurant_id']})
    if not courier:
        raise HTTPException(status_code=404, detail="Courier not found")
    await db.orders.update_one({'id': oid}, {'$set': {
        'courier_id': data.courier_id,
        'courier_name': courier['name'],
        'status': 'out_for_delivery' if order['status'] in ('preparing', 'accepted') else order['status'],
        'updated_at': now_iso(),
    }})
    doc = await db.orders.find_one({'id': oid}, {'_id': 0})
    return Order(**doc)

@api_router.post("/orders/{oid}/status", response_model=Order)
async def update_order_status(oid: str, data: OrderStatusUpdate, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({'id': oid}, {'_id': 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    allowed_owner = {'accepted', 'preparing', 'cancelled'}
    allowed_courier = {'out_for_delivery', 'delivered'}
    if user['role'] == 'restaurant_owner':
        if order['restaurant_id'] != user['restaurant_id']:
            raise HTTPException(status_code=403, detail="Forbidden")
        if data.status not in allowed_owner:
            raise HTTPException(status_code=400, detail="Invalid status transition")
    elif user['role'] == 'courier':
        if order.get('courier_id') != user['id']:
            raise HTTPException(status_code=403, detail="Forbidden")
        if data.status not in allowed_courier:
            raise HTTPException(status_code=400, detail="Invalid status transition")
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.orders.update_one({'id': oid}, {'$set': {'status': data.status, 'updated_at': now_iso()}})
    doc = await db.orders.find_one({'id': oid}, {'_id': 0})
    return Order(**doc)


@api_router.post("/orders/{oid}/cancel", response_model=Order)
async def cancel_order(oid: str, user: dict = Depends(require_roles('customer'))):
    order = await db.orders.find_one({'id': oid}, {'_id': 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order['customer_id'] != user['id']:
        raise HTTPException(status_code=403, detail="Forbidden")
    if order['status'] not in ('pending', 'accepted'):
        raise HTTPException(status_code=400, detail="Order can no longer be cancelled")
    await db.orders.update_one({'id': oid}, {'$set': {'status': 'cancelled', 'updated_at': now_iso()}})
    doc = await db.orders.find_one({'id': oid}, {'_id': 0})
    return Order(**doc)


# ---------- Address Book ----------
@api_router.get("/addresses", response_model=List[Address])
async def list_addresses(user: dict = Depends(require_roles('customer'))):
    docs = await db.addresses.find({'user_id': user['id']}, {'_id': 0}).sort('created_at', -1).to_list(500)
    return [Address(**d) for d in docs]

@api_router.post("/addresses", response_model=Address)
async def create_address(data: AddressCreate, user: dict = Depends(require_roles('customer'))):
    doc = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'label': data.label.strip() or 'Other',
        'address': data.address,
        'extra': data.extra or '',
        'lat': data.lat,
        'lng': data.lng,
        'created_at': now_iso(),
    }
    await db.addresses.insert_one(doc)
    return Address(**doc)

@api_router.delete("/addresses/{aid}")
async def delete_address(aid: str, user: dict = Depends(require_roles('customer'))):
    res = await db.addresses.delete_one({'id': aid, 'user_id': user['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")
    return {'ok': True}


# ---------- Seeding ----------
@api_router.post("/seed")
async def seed_data():
    """Idempotent demo seed."""
    existing = await db.users.find_one({'email': 'owner1@directdine.com'})
    if existing:
        return {'ok': True, 'seeded': False, 'msg': 'Already seeded'}

    # Owner 1 - Pizza
    owner1_id = str(uuid.uuid4())
    rest1_id = str(uuid.uuid4())
    await db.restaurants.insert_one({
        'id': rest1_id, 'owner_id': owner1_id, 'name': 'Bella Napoli Pizzeria',
        'description': 'Authentic wood-fired pizza. Family-owned since 2005.',
        'cuisine': 'Pizza',
        'image_url': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
        'rating': 4.8, 'address': 'Istiklal Cd. 45, Beyoglu', 'lat': 41.0369, 'lng': 28.9850,
        'delivery_minutes': 25, 'subscription_active': True,
        'is_featured': True, 'featured_tagline': 'Featured this week · Free drink with any order',
        'created_at': now_iso(),
    })
    await db.users.insert_one({
        'id': owner1_id, 'email': 'owner1@directdine.com', 'password_hash': hash_password('password123'),
        'name': 'Marco Rossi', 'role': 'restaurant_owner', 'phone': '+905551110001',
        'restaurant_id': rest1_id, 'created_at': now_iso(),
    })
    # Menu items
    menu1 = [
        ('Margherita Pizza', 'Fresh mozzarella, basil, tomato', 89.0, 'Pizza',
         'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400'),
        ('Pepperoni Pizza', 'Spicy pepperoni, mozzarella', 105.0, 'Pizza',
         'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400'),
        ('Caesar Salad', 'Romaine, parmesan, croutons', 45.0, 'Salads',
         'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400'),
        ('Tiramisu', 'Classic Italian dessert', 55.0, 'Desserts',
         'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400'),
    ]
    for name, desc, price, cat, img in menu1:
        await db.menu_items.insert_one({
            'id': str(uuid.uuid4()), 'restaurant_id': rest1_id,
            'name': name, 'description': desc, 'price': price, 'category': cat,
            'image_url': img, 'available': True, 'created_at': now_iso(),
        })

    # Owner 2 - Burgers
    owner2_id = str(uuid.uuid4())
    rest2_id = str(uuid.uuid4())
    await db.restaurants.insert_one({
        'id': rest2_id, 'owner_id': owner2_id, 'name': 'Smash & Co. Burgers',
        'description': 'Handcrafted smash burgers. Fast, hot, and juicy.',
        'cuisine': 'Burgers',
        'image_url': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
        'rating': 4.6, 'address': 'Bagdat Cd. 120, Kadikoy', 'lat': 40.9660, 'lng': 29.0625,
        'delivery_minutes': 20, 'subscription_active': True,
        'is_featured': False, 'featured_tagline': '', 'created_at': now_iso(),
    })
    await db.users.insert_one({
        'id': owner2_id, 'email': 'owner2@directdine.com', 'password_hash': hash_password('password123'),
        'name': 'Ayse Yilmaz', 'role': 'restaurant_owner', 'phone': '+905551110002',
        'restaurant_id': rest2_id, 'created_at': now_iso(),
    })
    menu2 = [
        ('Classic Smash', 'Double patty, cheese, secret sauce', 120.0, 'Burgers',
         'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400'),
        ('Chicken Deluxe', 'Crispy chicken, lettuce, pickles', 95.0, 'Burgers',
         'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400'),
        ('Truffle Fries', 'Golden fries with truffle oil', 40.0, 'Sides',
         'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400'),
    ]
    for name, desc, price, cat, img in menu2:
        await db.menu_items.insert_one({
            'id': str(uuid.uuid4()), 'restaurant_id': rest2_id,
            'name': name, 'description': desc, 'price': price, 'category': cat,
            'image_url': img, 'available': True, 'created_at': now_iso(),
        })

    # Owner 3 - Sushi (featured)
    owner3_id = str(uuid.uuid4())
    rest3_id = str(uuid.uuid4())
    await db.restaurants.insert_one({
        'id': rest3_id, 'owner_id': owner3_id, 'name': 'Sakura Sushi Bar',
        'description': 'Premium omakase, delivered by our own team.',
        'cuisine': 'Sushi',
        'image_url': 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=800',
        'rating': 4.9, 'address': 'Nispetiye Cd. 12, Etiler', 'lat': 41.0810, 'lng': 29.0210,
        'delivery_minutes': 35, 'subscription_active': True,
        'is_featured': True, 'featured_tagline': 'Chef\'s pick · Fresh daily catch',
        'created_at': now_iso(),
    })
    await db.users.insert_one({
        'id': owner3_id, 'email': 'owner3@directdine.com', 'password_hash': hash_password('password123'),
        'name': 'Kenji Tanaka', 'role': 'restaurant_owner', 'phone': '+905551110003',
        'restaurant_id': rest3_id, 'created_at': now_iso(),
    })
    for name, desc, price, cat, img in [
        ('Salmon Nigiri (6pc)', 'Fresh Norwegian salmon', 145.0, 'Nigiri',
         'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'),
        ('Rainbow Roll', 'Assorted fish over California roll', 165.0, 'Rolls',
         'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'),
        ('Miso Soup', 'Traditional soybean broth', 30.0, 'Sides',
         'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'),
    ]:
        await db.menu_items.insert_one({
            'id': str(uuid.uuid4()), 'restaurant_id': rest3_id,
            'name': name, 'description': desc, 'price': price, 'category': cat,
            'image_url': img, 'available': True, 'created_at': now_iso(),
        })

    # Courier for owner 1
    courier1_id = str(uuid.uuid4())
    await db.users.insert_one({
        'id': courier1_id, 'email': 'courier1@directdine.com', 'password_hash': hash_password('password123'),
        'name': 'Kemal Demir', 'role': 'courier', 'phone': '+905552220001',
        'restaurant_id': rest1_id, 'lat': 41.0370, 'lng': 28.9860,
        'available': True, 'created_at': now_iso(),
    })

    # Customer
    cust_id = str(uuid.uuid4())
    await db.users.insert_one({
        'id': cust_id, 'email': 'customer1@directdine.com', 'password_hash': hash_password('password123'),
        'name': 'Elif Kaya', 'role': 'customer', 'phone': '+905553330001',
        'restaurant_id': None, 'created_at': now_iso(),
    })

    return {'ok': True, 'seeded': True}


@api_router.get("/")
async def root():
    return {'message': 'DirectDine API', 'version': '1.0'}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index('email', unique=True)
        # Auto-seed on first boot
        existing = await db.users.find_one({'email': 'owner1@directdine.com'})
        if not existing:
            await seed_data()
            logger.info('Seeded demo data')
    except Exception as e:
        logger.error(f'Startup error: {e}')


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
