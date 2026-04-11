# Heva One - Test Credentials

## Platform Owner
- Username: `platform_owner`
- Password: `admin123`

## Business Admin (rest_demo_1)
- Username: `SKAdmin`
- Password: `saswata@123`
- Manager PIN: `1234`
- Restaurant ID: `rest_demo_1`
- All modules enabled (pos, kds, qr_ordering, workforce)

## Staff User (rest_demo_1)
- Username: `user`
- Password: `user123`
- POS PIN: `1111`

## Login Modes
- **Personal Mode** (default): Email or Username + Password → /login
- **Terminal Mode** (Kiosk): 4-digit PIN → /terminal (after admin registers device in Settings > Security)

## Notes
- Login accepts both email and username in the email field
- Staff `user` has POS PIN 1111 which also works for KDS token generation via POST /api/kds/verify-pin
- Existing users may not have email or capabilities set yet (created before migration)
- Manager PIN 1234 works for void authorization, terminal unregistration, and admin actions
