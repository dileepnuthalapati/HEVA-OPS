# HevaPOS - Railway Deployment Guide

## Quick Setup (5 minutes)

### Step 1: Push Code to GitHub
Use the "Save to GitHub" button in Emergent chat to push your code.

### Step 2: Create Railway Project
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub Repo
2. Select your HevaPOS repository
3. Railway will auto-detect the `railway.toml` and start building

### Step 3: Set Environment Variables
In Railway Dashboard → Your Service → **Variables** tab, add:

```
MONGO_URL=mongodb+srv://<your-atlas-user>:<password>@<cluster>.mongodb.net/hevapos?retryWrites=true&w=majority
DB_NAME=hevapos
JWT_SECRET_KEY=<generate-a-strong-random-key-here>
CORS_ORIGINS=https://<your-railway-app>.up.railway.app
STRIPE_API_KEY=<your-stripe-key>
```

**Important**: Do NOT copy the local `.env` values. Use your production MongoDB Atlas connection string.

### Step 4: Set Root Directory
In Railway → Service Settings → **Root Directory**: set to `backend`

### Step 5: Generate a Domain
In Railway → Service → Settings → **Networking** → Generate Domain
- You'll get something like `hevapos-production.up.railway.app`

### Step 6: Seed the Database (First Time Only)
After deployment, open your browser and visit:
```
https://<your-railway-domain>/api/seed-database?secret=hevapos2026
```
This creates:
- Platform Owner: `platform_owner` / `admin123`
- Restaurant Admin: `restaurant_admin` / `admin123`
- Staff: `user` / `user123`
- Demo restaurant with 4 categories and 11 products

### Step 7: Update Frontend for Production
For the Capacitor APK, update the API URL:
```
# In frontend/.env (before building APK)
REACT_APP_BACKEND_URL=https://<your-railway-domain>
```
Then rebuild the APK:
```bash
cd frontend
yarn build
npx cap sync
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `MONGO_URL` | YES | MongoDB Atlas connection string |
| `DB_NAME` | YES | Database name (default: `hevapos`) |
| `JWT_SECRET_KEY` | YES | Secret for JWT tokens. Use a 32+ character random string |
| `CORS_ORIGINS` | YES | Your frontend URL(s), comma-separated |
| `STRIPE_API_KEY` | NO | Stripe secret key for payment processing |
| `STRIPE_WEBHOOK_SECRET` | NO | Stripe webhook signing secret |
| `SENTRY_DSN` | NO | Sentry error monitoring DSN |
| `PORT` | AUTO | Railway sets this automatically |

---

## Health Check
Railway monitors: `GET /api/` → returns `{"message": "Hello World"}`

## What's Deployed
- **Backend only** runs on Railway (FastAPI + MongoDB)
- **Frontend** is packaged as an Android APK via Capacitor
- QR codes use `REACT_APP_BACKEND_URL` so they point to your Railway domain

## Troubleshooting

**Categories not showing?**
→ Run the seed endpoint again: `/api/seed-database?secret=hevapos2026`
→ The seed now correctly adds `restaurant_id` to all categories and products

**QR codes go to localhost?**
→ Update `REACT_APP_BACKEND_URL` in `frontend/.env` to your Railway URL, then rebuild APK

**Health check failing?**
→ Check Railway logs. Health check hits `GET /api/` — make sure the service started correctly

**CORS errors?**
→ Set `CORS_ORIGINS` to your exact frontend URL (e.g., `https://hevapos.up.railway.app`)
