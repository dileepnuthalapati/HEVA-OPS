# iOS Setup Guide — Heva ONE

This guide tells you exactly what to do on your Mac to get Heva ONE running on iPad/iPhone, and what to copy-paste into `Info.plist` so local-network printer discovery works on iOS.

**Important:** I (the AI agent) cannot run iOS commands from the cloud — Apple requires Xcode + a Mac. You'll run the commands below; I've prepared the code so it all works first try.

---

## Prerequisites on your Mac

| What | Why | How |
|---|---|---|
| **macOS 13+** | Xcode 15 requires it | — |
| **Xcode 15+** | Required to build for iOS 14+ | Mac App Store |
| **CocoaPods** | Capacitor iOS uses Pods | `sudo gem install cocoapods` |
| **Node 24** | Same as Android build | `nvm install 24 && nvm use 24` |
| **Apple Developer Team ID** | Signs the build | https://developer.apple.com/account → Membership |

---

## Step 1 — Scaffold iOS project (one-time)

From `/your-mac-path/frontend`:

```bash
yarn install                  # makes sure capacitor-zeroconf etc are installed
npx cap add ios               # creates ./ios/App/ with Xcode project
npx cap sync ios              # copies plugins into the Xcode project
```

This creates `/frontend/ios/App/App/Info.plist`.

---

## Step 2 — Add required Info.plist entries

Open `frontend/ios/App/App/Info.plist` in Xcode (right-click → Open As → Source Code).

Find the closing `</dict></plist>` at the bottom of the file. **Just above** the final `</dict>`, paste in everything between the markers below:

```xml
<!-- ──────────────── HEVA ONE — START ──────────────── -->

<!-- LOCAL NETWORK ACCESS (iOS 14+). Without this, every TCP connection
     to 192.168.x.x is silently blocked by iOS and times out. -->
<key>NSLocalNetworkUsageDescription</key>
<string>Heva ONE uses your local network to discover thermal receipt printers connected to the same Wi-Fi.</string>

<!-- BONJOUR / mDNS SERVICE TYPES. iOS will only let us discover service
     types explicitly declared here. These cover 99% of ESC/POS thermal
     printers (Epson, Star, HP, Bixolon, etc.). -->
<key>NSBonjourServices</key>
<array>
  <string>_pdl-datastream._tcp</string>
  <string>_printer._tcp</string>
  <string>_ipp._tcp</string>
  <string>_ipps._tcp</string>
  <string>_http._tcp</string>
</array>

<!-- BLUETOOTH PRINTER ACCESS. NSBluetoothAlwaysUsageDescription is required
     for iOS 13+; NSBluetoothPeripheralUsageDescription kept for legacy. -->
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Heva ONE connects to thermal receipt printers over Bluetooth.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>Heva ONE connects to thermal receipt printers over Bluetooth.</string>

<!-- CAMERA (for receipt photo / QR code scanning) -->
<key>NSCameraUsageDescription</key>
<string>Heva ONE uses the camera to scan receipts and QR codes.</string>

<!-- PHOTO LIBRARY (for adding menu item images) -->
<key>NSPhotoLibraryUsageDescription</key>
<string>Heva ONE saves menu item photos to your library.</string>

<!-- LOCATION (used by attendance geo-fence for clock-in) -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Heva ONE uses your location to verify you are at the restaurant when clocking in.</string>

<!-- MICROPHONE (kept off by default; comment in only if you add voice notes) -->
<!-- <key>NSMicrophoneUsageDescription</key>
<string>Heva ONE uses the microphone for voice notes on orders.</string> -->

<!-- iPad Universal support -->
<key>UISupportedInterfaceOrientations~ipad</key>
<array>
  <string>UIInterfaceOrientationPortrait</string>
  <string>UIInterfaceOrientationPortraitUpsideDown</string>
  <string>UIInterfaceOrientationLandscapeLeft</string>
  <string>UIInterfaceOrientationLandscapeRight</string>
</array>

<!-- App Transport Security: allow connections to printers on LAN. The TCP
     plugin uses raw sockets, but if any plugin starts using NSURLSession
     against a local IP it'll need this. Already covered for raw TCP. -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsLocalNetworking</key>
  <true/>
</dict>

<!-- ──────────────── HEVA ONE — END ──────────────── -->
```

Save the file.

---

## Step 3 — Configure signing in Xcode

```bash
npx cap open ios   # opens Xcode
```

In Xcode:

1. Click the **App** project in the left sidebar (top item, blue icon)
2. Select the **App** target → **Signing & Capabilities** tab
3. Tick **Automatically manage signing**
4. **Team:** pick your Apple Developer team from the dropdown
5. **Bundle Identifier:**
   - Current: `com.hevapos.app`
   - **Recommended for App Store:** change to `com.hetupathways.hevaone` (matches your domain — easier App Store approval)
6. **Display Name:** "Heva ONE"

Xcode auto-creates a provisioning profile after a few seconds.

---

## Step 4 — Set deployment target & device family

Same screen → **General** tab:

1. **Minimum Deployments — iOS:** `14.0` (covers ~99% of devices in 2026)
2. **Supported Destinations:** keep iPhone + iPad checked (Universal app)

---

## Step 5 — Add the app icon

1. In Xcode, open `App/Assets.xcassets/AppIcon.appiconset/`
2. Drag the 1024×1024 icon onto the largest slot (it auto-generates other sizes if you tick "Single Size" in the Attributes Inspector)
3. **Use the same icon you used for Android** so the brand is consistent — `/frontend/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp` (export as PNG 1024×1024)

---

## Step 6 — Run on iPad Simulator (sanity check)

In Xcode:
1. Top-bar device dropdown → pick **iPad Pro 11"** (or your target iPad)
2. Press **▶ Run** (Cmd+R)
3. The simulator launches → app loads → log in with `SKAdmin / saswata@123`

> Note: Bluetooth + LAN printer discovery **won't work in the simulator** (no real hardware). Test those on a physical iPad in Step 7.

---

## Step 7 — Run on a physical iPad

1. Plug the iPad into your Mac via USB-C
2. On the iPad: Settings → General → VPN & Device Management → trust your developer certificate
3. In Xcode, device dropdown → pick your iPad
4. ▶ Run
5. **First Wi-Fi printer scan will trigger an iOS prompt:** *"Heva ONE would like to find devices on your local network"* → tap **Allow**. (If you tap Don't Allow, you must re-enable it in iOS Settings → Heva ONE → Local Network)

In the app:
- Go to **Printer Settings → Diagnose** button. The diagnostics should show all green:
  - ✓ Runtime: iOS app (native)
  - ✓ TCP socket plugin loaded
  - ✓ Bonjour / mDNS plugin loaded
  - ✓ mDNS live test: discovered N printers

---

## Step 8 — Archive & TestFlight

1. In Xcode device dropdown → select **Any iOS Device (arm64)**
2. **Product → Archive** (takes 1-3 min)
3. Window pops open with Organizer
4. Click **Distribute App → App Store Connect → Upload**
5. Sign in with your Apple Developer account → upload completes in 5-15 min
6. Go to https://appstoreconnect.apple.com → My Apps → Heva ONE → **TestFlight** tab
7. Add internal testers (your email) → install via the **TestFlight app** on iPad
8. Test with 1-2 real restaurants for 1-2 weeks before submitting to App Review

---

## Step 9 — Submit for App Store Review

1. App Store Connect → My Apps → Heva ONE → **App Store** tab
2. Fill in:
   - **Subtitle** (30 chars max)
   - **Category:** Business (primary), Food & Drink (secondary)
   - **Description**
   - **Screenshots** — iPad Pro 12.9", iPhone 6.7" (mandatory sizes)
   - **App Privacy** — declare data collection (you collect: email, name, payment info for Stripe, restaurant data)
   - **Privacy Policy URL** — required, you can host on `hetupathways.com/privacy`
3. Submit. Review typically takes 1-3 days.

---

## ⚠️ Apple's Subscription Rules — Important

Apple takes 30% of any subscription sold *inside an iOS app* using In-App Purchase. Your platform SaaS fee (£X/mo) is **B2B** and qualifies for the **Reader App / Business App exception** — but you must follow these rules:

✅ **Allowed:** Restaurant admins subscribe via Stripe Checkout in an **external browser** (Safari opens, payment happens off-app)
✅ **Allowed:** Don't show "Subscribe Now" UI inside the iOS app — email subscribers a Stripe Checkout link from your dashboard
❌ **Not allowed:** Embedding a payment form inside the iOS app
❌ **Not allowed:** Using Apple's IAP for the platform subscription (you'd lose 30% needlessly)

**The diner-facing payments (QR ordering via Stripe Connect) are physical goods/services — Apple has no claim on those.** No restrictions there.

The current code already opens Stripe Checkout in an external browser via `window.location.href`, which is the safe path. On the iOS build, I recommend additionally hiding the "Subscribe Now" banner — let me know when you're ready and I'll add a Capacitor platform check to gate it.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Printer scan shows "Bonjour plugin not installed" | `capacitor-zeroconf` not synced into Xcode project | Re-run `npx cap sync ios` then rebuild |
| TCP connection times out on every printer | iOS Local Network permission was denied | Settings → Heva ONE → Local Network → ON |
| App crashes on first launch | Missing Bluetooth/Camera permission string | Re-check Step 2 |
| "Apple ID is locked" during upload | 2FA expired | Re-sign-in to Apple ID in Xcode preferences |
| Build fails: `pod install` errors | CocoaPods outdated | `sudo gem install cocoapods --pre` then re-sync |

---

If anything fails, paste me the exact error from Xcode and I'll debug — that's faster than guessing.
