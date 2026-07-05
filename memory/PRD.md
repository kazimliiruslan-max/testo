# DirectDine — Product Requirements

## Overview
Commission-free food delivery mobile app. Only restaurants with their own couriers can join. Subscription-based (mocked). Cash on Delivery only.

## Roles
- **Customer**: Browse restaurants, view menus, place orders (COD), track courier on map, order history
- **Restaurant Owner**: Manage menu items, accept/prepare orders, assign couriers, add couriers, view active orders + subscription status
- **Courier**: View assigned deliveries, update status (out_for_delivery → delivered), update own GPS location

## Stack
- Frontend: Expo Router 6, React Native 0.81, TypeScript
- Backend: FastAPI + Motor (MongoDB async) + PyJWT + bcrypt
- Map: react-native-maps (native) + web fallback
- Auth: JWT + bcrypt (7-day tokens), stored in expo-secure-store (web = localStorage)
- i18n: English + Turkish (custom lightweight solution, AsyncStorage-persisted)

## Key Endpoints
- POST `/api/auth/register`, `/api/auth/login`, GET `/api/auth/me`
- GET `/api/restaurants`, GET `/api/restaurants/{id}`, GET `/api/restaurants/{id}/menu`
- Owner: PUT `/api/restaurants/me`, POST/DELETE `/api/menu`, POST/GET `/api/couriers`
- POST `/api/couriers/me/location`, GET `/api/couriers/{id}/location`
- POST `/api/orders`, GET `/api/orders`, GET `/api/orders/{id}`
- POST `/api/orders/{id}/assign`, POST `/api/orders/{id}/status`

## Design
Terracotta (#E05C36) brand color, iOS-native clean personality. Bottom tab navigation per-role.

## Constraints / Non-goals
- No real payment integration (Cash on Delivery only)
- Subscription status is MOCKED (always `subscription_active: true`)
- Courier live GPS uses a "Update My Location" button (mock nudge); real geolocation requires expo-location + native build
- 0% commission is a marketing promise enforced by never charging or splitting revenue in code
