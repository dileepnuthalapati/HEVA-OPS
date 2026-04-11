# HevaPOS Test Credentials

## Platform Owner
- Username: `platform_owner`
- Password: `admin123`
- Navigates to: `/platform/dashboard`

## Restaurant Admin (rest_demo_1)
- Username: `SKAdmin`
- Password: `saswata@123`
- Restaurant: `rest_demo_1` (Pizza Palace Updated)
- Features: `{pos: true, kds: true, qr_ordering: true, workforce: true}`
- Navigates to: `/dashboard`

## Staff User (rest_demo_1)
- Username: `user`
- Password: `user123`
- POS PIN: `1111` (also used for clock in/out)
- Navigates to: `/pos`

## Manager PIN (for void authorization & KDS verify-pin)
- PIN: `1234` (set on restaurant_admin account)
- Also works for KDS token generation via POST /api/kds/verify-pin
