# HevaPOS - Android APK Build Guide

## Prerequisites (Install on your machine)
1. **Android Studio** - https://developer.android.com/studio
2. **Java JDK 17+** - Android Studio will prompt to install

---

## Build Steps

### Step 1: Install Dependencies
```bash
cd frontend
yarn install
```

### Step 2: Build React App for Production
```bash
yarn build
```

### Step 3: Add Android Platform (first time only)
```bash
npx cap add android
```

### Step 4: Sync Web Assets to Android
```bash
npx cap sync android
```

### Step 5: Open in Android Studio
```bash
npx cap open android
```

### Step 6: Build APK in Android Studio
1. Wait for Gradle sync to complete
2. Go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## For Signed Release APK (Play Store)

### Step 1: Generate Keystore (first time only)
```bash
keytool -genkey -v -keystore hevapos-release.keystore -alias hevapos -keyalg RSA -keysize 2048 -validity 10000
```

### Step 2: In Android Studio
1. **Build → Generate Signed Bundle / APK**
2. Select **APK**
3. Choose your keystore file
4. Enter keystore password and key alias
5. Select **release** build variant
6. Click **Finish**

---

## Configuration Files

| File | Purpose |
|------|---------|
| `capacitor.config.json` | App ID, name, Android settings |
| `.env.production` | Production API URL |

---

## Current Configuration

**App ID:** `com.hetupathways.hevapos`
**App Name:** `HevaPOS`
**Backend URL:** `https://restaurant-orders-38.preview.emergentagent.com`

---

## Updating Backend URL

Edit `.env.production`:
```env
REACT_APP_BACKEND_URL=https://your-production-api.com
```

Then rebuild:
```bash
yarn build
npx cap sync android
```

---

## Quick Commands Reference

```bash
# Full rebuild
yarn build && npx cap sync android && npx cap open android

# Just sync changes
npx cap sync android

# Run on connected device
npx cap run android
```
