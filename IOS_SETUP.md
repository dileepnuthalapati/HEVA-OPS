# iOS Setup Guide — HevaONE

This guide is your **start-to-finish checklist** for getting HevaONE on the App Store. Every value below is pre-filled with your specific details — no decisions left to make.

---

## Your account values (pre-filled)

| Setting | Value |
|---|---|
| **Apple Team ID** | `4U8Q869544` |
| **Bundle ID** | `com.hetupathways.app` |
| **App Name** | HevaONE |
| **Subtitle** (App Store, 30 chars max) | `Workforce + POS for business` |
| **Primary Category** | Business |
| **Devices** | Universal — iPhone + iPad |
| **Minimum iOS** | 14.0 |

> Same Bundle ID `com.hetupathways.app` is used by your Android app — that's normal, Apple and Google handle these independently.

---

## Step 0 — One-time Mac setup (~15 min)

Open Terminal on your Mac and run these in order:

```bash
# 1. Install Homebrew if you don't have it (paste in Terminal, then follow prompts)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Node 24 via nvm (matches your Android build)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# Close + reopen Terminal so nvm is on PATH
nvm install 24
nvm use 24
nvm alias default 24
node -v   # should print v24.x.x

# 3. Install CocoaPods (Capacitor iOS uses it for native deps)
sudo gem install cocoapods
pod --version   # should print 1.15+ or similar
```

Make sure **Xcode 15+** is already installed from the Mac App Store (~7GB; takes ~30 min the first time).

---

## Step 1 — Pull the latest code

```bash
cd ~/your-projects-folder
git clone <your-repo>            # or: git pull
cd hevaone/frontend               # or wherever your frontend lives
yarn install                      # installs all deps including capacitor-zeroconf
```

---

## Step 2 — Scaffold the iOS project (one-time only)

```bash
npx cap add ios                   # creates frontend/ios/ with Xcode project
yarn build                        # builds the React app into frontend/build/
npx cap sync ios                  # copies plugins + JS into the iOS project
```

This creates `frontend/ios/App/App/Info.plist` — you'll edit it next.

---

## Step 3 — Edit Info.plist (CRITICAL)

Open `frontend/ios/App/App/Info.plist` in Xcode (right-click → Open As → Source Code, **not** Property List).

Find the closing `</dict>` at the very bottom of the file (the second-to-last line, just before `</plist>`). **Just above** that closing `</dict>`, paste in this block:

```xml
<!-- ──────────────── HEVAONE — START ──────────────── -->

<!-- iOS 14+ REQUIRES this for any TCP connection to a 192.168.x.x address.
     Without it, every printer connection times out silently. -->
<key>NSLocalNetworkUsageDescription</key>
<string>HevaONE uses your local network to discover thermal receipt printers connected to the same Wi-Fi.</string>

<!-- mDNS / Bonjour service types. iOS will only let us discover service
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

<!-- Bluetooth printer access -->
<key>NSBluetoothAlwaysUsageDescription</key>
<string>HevaONE connects to thermal receipt printers over Bluetooth.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>HevaONE connects to thermal receipt printers over Bluetooth.</string>

<!-- Camera (receipt photo + QR scanning) -->
<key>NSCameraUsageDescription</key>
<string>HevaONE uses the camera to scan receipts and QR codes.</string>

<!-- Photo Library (menu item images) -->
<key>NSPhotoLibraryUsageDescription</key>
<string>HevaONE adds menu item photos from your library.</string>

<!-- Location (attendance geofence) -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>HevaONE verifies you are at the restaurant when clocking in.</string>

<!-- Universal iPad orientation support -->
<key>UISupportedInterfaceOrientations~ipad</key>
<array>
  <string>UIInterfaceOrientationPortrait</string>
  <string>UIInterfaceOrientationPortraitUpsideDown</string>
  <string>UIInterfaceOrientationLandscapeLeft</string>
  <string>UIInterfaceOrientationLandscapeRight</string>
</array>

<!-- App Transport Security: allow connections to printers on LAN -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsLocalNetworking</key>
  <true/>
</dict>

<!-- ──────────────── HEVAONE — END ──────────────── -->
```

Save (Cmd+S).

---

## Step 4 — Configure signing in Xcode

```bash
npx cap open ios   # opens the project in Xcode
```

In Xcode:

1. Click the blue **App** project icon at the top of the left sidebar
2. Select **App** target → **Signing & Capabilities** tab
3. Tick **Automatically manage signing**
4. **Team** dropdown → choose your team (Team ID `4U8Q869544`)
5. Confirm **Bundle Identifier** reads `com.hetupathways.app` (already pre-set from capacitor.config.json)
6. **Display Name** field → set to `HevaONE`

Xcode will auto-create a provisioning profile. Wait for the spinner to finish.

---

## Step 5 — General settings

Same screen → **General** tab:

| Setting | Value |
|---|---|
| **Minimum Deployments → iOS** | `14.0` |
| **Supported Destinations** | iPhone + iPad (both checked = Universal) |
| **Version** | `1.0.0` |
| **Build** | `1` |
| **Display Name** | `HevaONE` |

---

## Step 6 — App icon

1. In Xcode left sidebar: `App/Assets.xcassets/AppIcon.appiconset/`
2. Open `/your-mac-path/frontend/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp`
3. Convert to PNG 1024×1024 (Preview app: File → Export → PNG, 1024×1024)
4. Drag the PNG onto the largest empty slot in AppIcon.appiconset
5. In the Attributes Inspector on the right, set **Appearances: Any, Dark** if you want a dark-mode icon variant (optional)

---

## Step 7 — Run on iPad Simulator

In Xcode top toolbar:
1. Device dropdown → **iPad Pro 11" (M4)** (or any iPad)
2. Click **▶ Run** (Cmd+R)
3. Simulator launches → login with `SKAdmin / saswata@123`

> Note: Bluetooth + LAN printer discovery won't work in the simulator (no real hardware). That's expected — test those on a physical iPad next.

---

## Step 8 — Run on physical iPad

1. Connect iPad to Mac via USB-C
2. On iPad: Settings → General → VPN & Device Management → trust your developer cert
3. Xcode device dropdown → select your iPad
4. ▶ Run
5. **First Wi-Fi printer scan triggers an iOS prompt:** *"HevaONE would like to find devices on your local network"* → tap **Allow**
6. Go to **Printer Settings → Diagnose** button → all 6 checks should show green ✓:
   - ✓ Runtime: iOS app (native)
   - ✓ Tablet Wi-Fi (subnet detected)
   - ✓ TCP socket plugin loaded
   - ✓ Bonjour / mDNS plugin loaded
   - ✓ mDNS live test (discovered N printers)
   - ✓ TCP probe (if you entered an IP)

---

## Step 9 — Upload to App Store Connect (TestFlight)

In Xcode:
1. Device dropdown → **Any iOS Device (arm64)** (this is required for archiving)
2. **Product → Archive** (Cmd+B then Product > Archive)
3. Wait 1–3 min for archive to build
4. Organizer window opens → click **Distribute App** → **App Store Connect** → **Upload**
5. Sign in with your Apple Developer ID → upload completes in 5–15 min
6. Go to https://appstoreconnect.apple.com → **My Apps**
7. If app doesn't exist yet: **+ New App** → fill in:
   - Platform: iOS
   - Name: **HevaONE**
   - Primary language: English (UK or US)
   - Bundle ID: `com.hetupathways.app` (should appear in dropdown after upload)
   - SKU: `hevaone-001` (any unique string)
8. Open HevaONE → **TestFlight** tab
9. Add yourself + a customer as internal testers
10. Install **TestFlight** from App Store on the iPad
11. Open TestFlight → install HevaONE → use it for 1–2 weeks

---

## Step 10 — Submit for App Store Review

App Store Connect → My Apps → HevaONE → **App Store** tab → **Prepare for Submission**:

| Field | Value |
|---|---|
| **App Name** | HevaONE |
| **Subtitle** | Workforce + POS for business |
| **Primary Category** | Business |
| **Secondary Category** | Food & Drink |
| **Description** | (write 1500-char description — I can draft this if you want) |
| **Keywords** | POS, restaurant, rota, workforce, scheduling, payroll, time tracking |
| **Support URL** | https://hetupathways.com/support (must exist) |
| **Marketing URL** | https://hetupathways.com (optional) |
| **Privacy Policy URL** | https://hetupathways.com/privacy (required — must exist) |

**Screenshots** (mandatory — capture from physical iPad/iPhone):
- 6.7" iPhone (1290 × 2796) — at least 3 screenshots
- 12.9" iPad Pro (2048 × 2732) — at least 3 screenshots
- The simplest workflow: open the app on a device, take screenshots, transfer to Mac, upload

**App Privacy** (required questionnaire):
- Data Collected: Email, Name, Phone, Payment info (Stripe), Purchase history
- Tracking: NO (you don't track users for ads)

Submit → review takes 1–3 days typically.

---

## ⚠️ Apple Subscription Rules — Important

Apple takes **30% commission** on any subscription sold *inside* an iOS app via In-App Purchase. Your platform SaaS fee is **B2B** and qualifies for Apple's **Reader App / Business App exception** — but you must follow these rules:

✅ **Allowed:** Restaurant admins subscribe via Stripe Checkout in an **external browser**
✅ **Allowed:** Show a "Manage on web" link that opens Safari
❌ **Not allowed:** Embedding a card form inside the iOS app
❌ **Not allowed:** Using Apple's IAP for the platform subscription (you'd lose 30%)

The current code already opens Stripe Checkout via `window.location.href` (external browser path) — that's the safe approach. When you're ready to ship to TestFlight, tell me and I'll add a Capacitor platform check to **hide the "Subscribe Now" banner on iOS** so reviewers don't flag it. We'll let restaurants subscribe via email link from the dashboard instead.

**Diner-facing payments (Stripe Connect QR ordering) are fully fine** — physical goods/services have no Apple commission.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Bonjour plugin not installed" in Diagnostics | `capacitor-zeroconf` not synced | `npx cap sync ios` then rebuild |
| Every printer TCP times out | Local Network permission denied | iPad Settings → HevaONE → Local Network → ON |
| App crashes on first launch | Missing permission string in Info.plist | Re-check Step 3 |
| "Apple ID is locked" during upload | 2FA expired | Re-sign-in in Xcode → Preferences → Accounts |
| `pod install` fails during sync | CocoaPods cache stale | `pod repo update` then re-sync |
| Xcode says "Provisioning profile required" | Auto-signing didn't complete | Step 4 → uncheck and re-check "Automatically manage signing" |

If anything fails, paste me the **exact** Xcode error and I'll debug — faster than guessing.
