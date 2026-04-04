# HevaPOS Test Credentials

## Users
- Platform Owner: `platform_owner` / `admin123`
- Restaurant Admin: `restaurant_admin` / `admin123`
- Staff User: `user` / `user123`

## QR Guest Menu (Public - No Auth)
- URL: /menu/{restaurant_id}/{table_hash}
- Example: /menu/rest_demo_1/{hash}

## Stripe
- Test key in backend/.env: STRIPE_API_KEY=sk_test_emergent
- Webhook secret: not configured (accepts raw payloads in dev)
