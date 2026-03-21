# HevaPOS Android APK Build Instructions

## 🎯 Build the APK Locally (Recommended)

Due to ARM64 container limitations, the APK needs to be built on a Windows, Mac, or x86_64 Linux machine.

---

## ✅ Prerequisites

### Install Required Tools:

1. **Node.js** (v18 or higher)
   - Download: https://nodejs.org/
   - Verify: `node --version`

2. **Yarn Package Manager**
   ```bash
   npm install -g yarn
   ```

3. **Android Studio** (Required for Android SDK)
   - Download: https://developer.android.com/studio
   - During installation, ensure you install:
     - Android SDK
     - Android SDK Platform (API 34)
     - Android SDK Build-Tools
     - Android SDK Platform-Tools

4. **Java JDK 17**
   - Download: https://adoptium.net/
   - Or use Android Studio's bundled JDK

---

## 📦 Building the APK

### Step 1: Clone/Download Repository
```bash
# If you haven't already
git clone https://github.com/dileepnuthalapati/HEVA-OPS.git
cd HEVA-OPS/frontend
```

### Step 2: Install Dependencies
```bash
yarn install
```

### Step 3: Build Production Web App
```bash
yarn build
```

### Step 4: Sync Capacitor
```bash
npx cap sync android
```

### Step 5: Open in Android Studio
```bash
npx cap open android
```

**This will open Android Studio with the Android project.**

### Step 6: Build APK in Android Studio

#### Option A: Debug APK (For Testing)
1. In Android Studio, click **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. Wait for build to complete (2-5 minutes)
3. Click **locate** in the notification to find the APK
4. Location: `android/app/build/outputs/apk/debug/app-debug.apk`

#### Option B: Release APK (For Distribution)
1. Click **Build** → **Generate Signed Bundle / APK**
2. Select **APK** → **Next**
3. Create a new keystore or use existing:
   - **Keystore path:** Choose location for new keystore
   - **Password:** Create strong password
   - **Alias:** hevapos
   - **Validity:** 25 years (or more)
4. Click **Next** → **release** → **Finish**
5. Location: `android/app/build/outputs/apk/release/app-release.apk`

---

## 🚀 Alternative: Command Line Build

### For Debug APK:
```bash
cd android
./gradlew assembleDebug
```
APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### For Release APK (Requires Keystore):
```bash
cd android
./gradlew assembleRelease
```
APK location: `android/app/build/outputs/apk/release/app-release.apk`

---

## 📱 Installing the APK

### On Android Device:

1. **Enable Unknown Sources:**
   - Go to **Settings** → **Security**
   - Enable **Install from Unknown Sources** or **Allow from this source**

2. **Transfer APK:**
   - Email it to yourself
   - Use USB cable and copy to Downloads folder
   - Use cloud storage (Google Drive, Dropbox)
   - Use ADB: `adb install app-debug.apk`

3. **Install:**
   - Open APK file on your Android device
   - Tap **Install**
   - Tap **Open** when complete

---

## 🔐 Signing Release APK (Important for Play Store)

### Create Keystore (One-time):
```bash
keytool -genkey -v -keystore hevapos-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias hevapos
```

### Configure Signing in `android/app/build.gradle`:

Add after `android {`:
```gradle
signingConfigs {
    release {
        storeFile file('path/to/hevapos-release-key.jks')
        storePassword 'your-password'
        keyAlias 'hevapos'
        keyPassword 'your-password'
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

**⚠️ Security Note:** Never commit keystore files or passwords to Git!

---

## 🎨 Customization Before Building

### Change App Name:
Edit: `android/app/src/main/res/values/strings.xml`
```xml
<string name="app_name">HevaPOS</string>
```

### Change App Icon:
Replace icons in: `android/app/src/main/res/mipmap-*dpi/ic_launcher.png`

### Change Package Name:
1. Edit `capacitor.config.json`:
   ```json
   {
     "appId": "com.yourcompany.hevapos"
   }
   ```
2. Run: `npx cap sync android`

---

## 🐛 Troubleshooting

### Build Fails with "SDK location not found":
Create `android/local.properties`:
```properties
sdk.dir=/path/to/Android/sdk
```

**Common paths:**
- **Windows:** `C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk`
- **Mac:** `/Users/YourName/Library/Android/sdk`
- **Linux:** `/home/YourName/Android/Sdk`

### "Gradle sync failed":
- Open Android Studio
- Click **File** → **Sync Project with Gradle Files**
- Wait for sync to complete

### "Java version" errors:
- Use JDK 17 (not 11 or 21)
- Set `JAVA_HOME` environment variable

### "AAPT2" errors:
- Update Android SDK Build Tools in Android Studio SDK Manager
- Clean project: **Build** → **Clean Project**

---

## 📊 APK Size

- **Debug APK:** ~40-60 MB
- **Release APK:** ~25-40 MB (minified & optimized)

---

## 🎯 What's Included in This Build

✅ Full HevaPOS Multi-Tenant System
✅ Order Management (Place & Complete)
✅ Dual Receipt System (Kitchen & Customer)
✅ Product & Category Management
✅ Cash Drawer Reconciliation
✅ Reports & Analytics
✅ Offline-First Architecture
✅ Admin Dashboard
✅ Role-Based Access Control
✅ Multi-Currency Support
✅ PDF Receipt Generation

❌ Bluetooth Printer Support (removed due to build issues)
✅ USB & WiFi Printer Support (via browser print)

---

## 🔄 Re-adding Bluetooth (Future)

Once you have proper build environment:

```bash
cd frontend
yarn add @capacitor-community/bluetooth-le
npx cap sync android
```

Then rebuild APK.

---

## 📞 Support

If you encounter issues:
1. Check Android Studio's Build Output for detailed errors
2. Google the specific error message
3. Check Capacitor docs: https://capacitorjs.com/docs/android
4. Check Gradle docs: https://docs.gradle.org/

---

**Happy Building! 🚀**
