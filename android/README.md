# PM-SIM for Android (WebView wrapper)

A thin Android host for the PM-SIM web app. The web files are **not** duplicated in this
folder: at build time the Gradle task `syncWebAssets` copies `index.html`, `css/`, `src/`
and `fixtures/` from the project root into `app/build/generated/www-assets/www`. That folder
is registered as an assets source dir.

- Package `edu.deu.pmsim`, version 1.4.0 (versionCode 7), minSdk 26, target/compile SDK 35
- Kotlin 2.0.21, AGP 8.7.3, Gradle 8.11.1, JDK 17
- Dependencies: androidx core-ktx, activity-ktx, lifecycle-runtime-ktx, webkit 1.12.1,
  kotlinx-coroutines-android, `androidx.health.connect:connect-client:1.1.0-beta01`
  (the newest release that still allows compileSdk 35 and AGP 8.7; beta02 and later need SDK 36 and AGP 8.9.1)
- **No `INTERNET` permission**, `allowBackup="false"`, no analytics, no third-party SDKs

## Build

No Gradle wrapper is committed. Use the local Gradle 8.11.1:

```bash
cd android
export ANDROID_HOME=~/Android/Sdk          # or write sdk.dir into local.properties (git-ignored)
~/.local/opt/gradle-8.11.1/bin/gradle --offline assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
~/.local/opt/gradle-8.11.1/bin/gradle --offline assembleRelease   # also copies to ../release/PM-SIM-1.1.0-android.apk
```

Leave out `--offline` the first time on a machine whose Gradle cache does not hold the
dependencies yet.

### Release signing

Signing values are read at build time and never stored in the repo. They come from the
environment variables `PMSIM_KEYSTORE`, `PMSIM_KEYSTORE_PASSWORD`, `PMSIM_KEY_ALIAS` and
`PMSIM_KEY_PASSWORD`, or, if those are unset, from `~/.android/pmsim-release.env`
(`export NAME=value` lines; set `PMSIM_ENV_FILE` to use another path). Without them the
release APK is built **unsigned**, and Gradle prints a warning.

Verify:

```bash
BT=~/Android/Sdk/build-tools/35.0.0
$BT/apksigner verify --print-certs ../release/PM-SIM-1.1.0-android.apk
$BT/aapt2 dump badging ../release/PM-SIM-1.1.0-android.apk | grep uses-permission
```

The APK holds a **snapshot** of the web files from build time, so rebuild after you change them.

## How the page is served ("routes")

| URL | Served from |
| --- | --- |
| `https://appassets.androidplatform.net/assets/www/index.html` | start page (`WebViewAssetLoader` + `AssetsPathHandler`) |
| `https://appassets.androidplatform.net/assets/www/**` | `css/`, `src/`, `fixtures/` |
| `https://appassets.androidplatform.net/favicon.ico` | empty 204 |
| any other host or scheme | blocked: subresources get an empty 403, and navigations are cancelled; nothing opens externally |

WebView settings: JavaScript on, DOM storage on, file and content access off, mixed content
never allowed, Safe Browsing on, no geolocation, no multiple windows, and web permission
requests (camera, mic and so on) are denied. The page CSP (`connect-src 'none'`) stays as it is.
Remote debugging (`chrome://inspect`) is enabled only in debug builds.

Back button: `webView.goBack()` if there is history, otherwise the activity finishes.
Content is padded out of the system bars, display cutout and IME, so the app is edge-to-edge safe on Android 15.
Configuration changes (rotation, size, night mode and others) do not reload the page.

`<input type=file>` opens the system document picker (`OpenDocument`, or
`OpenMultipleDocuments` when the input has `multiple`). `accept` extensions are mapped to
MIME types. An extension with no reliable MIME type (`.hl7`) makes the picker unfiltered (`*/*`).

## JS bridge: `window.PMAndroid`

The bridge exists only inside the Android app. Every call is ignored unless the current page
origin is `https://appassets.androidplatform.net`. Methods return immediately. Asynchronous
results arrive as events:

```js
window.addEventListener('pmandroid', e => { const ev = e.detail; /* ev.type ... */ });
```

| Method | Returns / emits |
| --- | --- |
| `info()` | returns a JSON **string** `{"platform":"android","appVersion":"1.4.0","sdk":35,"healthConnect":"available"\|"not-installed"\|"update-required"\|"unsupported","ble":"available"\|"off"\|"unsupported"\|"no-permission"}` |
| `hcRequestPermissions()` | opens the Health Connect read-permission screen, then emits `{"type":"hc-permissions","granted":[...],"denied":[...]}` (record simple names). If Health Connect is unavailable, emits `{"type":"hc-status","status":"not-installed"\|"update-required"\|"unsupported"}` instead |
| `hcRead(days)` | `days` is clamped to 1..30. Emits ONE event `{"type":"hc-records","days":d,"records":[...],"errors":[...]}` |
| `hcOpenInstall()` | *extra.* Opens the Play Store Health Connect page. Call it only from a user tap |
| `bleScan()` | asks for Bluetooth permission if needed, then scans for 15 s, filtered to the Heart Rate Service 0x180D. Emits `ble-state` and `ble-device` events |
| `bleStop()` | stops the scan and emits `ble-state` `stopped` |
| `bleConnect(address)` | connects over GATT (LE), enables notifications on 0x2A37 and reads 0x2A38 |
| `bleDisconnect()` | disconnects, closes GATT and emits `ble-state` `disconnected` |
| `saveText(name, mime, text)` | *extra.* Saves through the system "create document" dialog, then emits `{"type":"save","ok":bool,"name":...,"error"?:...}` |
| `saveBase64(name, mime, b64)` | *extra.* Same as `saveText`, for binary data such as a PNG (`canvas.toDataURL()` without the `data:...;base64,` prefix) |

`hc-records` item:
`{"param":"hr"|"spo2"|"rr"|"sbp"|"dbp"|"temp"|"weight"|"height"|"steps","value":Number,"unit":"bpm"|"%"|"br/min"|"mmHg"|"°C"|"kg"|"cm"|"steps","time":<epoch ms>,"origin":"<data origin package>","type":"<RecordSimpleName>"}`

- HeartRateRecord produces one item per sample. BloodPressureRecord produces two items, `sbp` and `dbp`, with the same time. Steps use `count` with `time = startTime`. Height is converted from metres to cm.
- Records are read newest first, with paging, up to **5000 values per type**. When a type hits the cap, an `errors` entry says that it was truncated.
- `errors` items are `{"type":"WeightRecord","error":"permission not granted"}`, or an exception class and message (SecurityException, RemoteException, IOException and others).

BLE events:
- `{"type":"ble-state","state":"scanning"|"stopped"|"no-permission"|"off"|"unsupported"|"connecting"|"connected"|"disconnected"|"error","detail":"..."}`
- `{"type":"ble-device","name":<string|null>,"address":"AA:BB:..","rssi":-60}`, once per new device during a scan
- `{"type":"ble-hr","raw":"<hex bytes>","time":<epoch ms>,"device":"<name or address>"}`, the raw Heart Rate Measurement bytes, parsed on the web side by `src/devices/gatt.js`
- `{"type":"ble-info","bodySensorLocation":<int>}`
- If the Heart Rate Service is missing after discovery, the app emits `ble-state` `error` with "Heart Rate Service not found on this device" and disconnects.

Other: `{"type":"download-unsupported"}` is emitted when the page triggers a normal
`<a download>` / blob download. Blob URLs cannot be fetched under the page CSP, so inside
the app the page should use `saveText` / `saveBase64`.

Bluetooth permissions: on Android 12+ `BLUETOOTH_SCAN` (with `neverForLocation`) and
`BLUETOOTH_CONNECT`. On Android 11 and older, `ACCESS_FINE_LOCATION` plus `BLUETOOTH` /
`BLUETOOTH_ADMIN` (maxSdkVersion 30). Location services must be on there for scans to return results.

Lifecycle: `onDestroy` stops any scan, disconnects and closes GATT, and destroys the WebView.

## Privacy

Health Connect permissions are read-only: heart rate, SpO2, respiratory rate, blood pressure,
body temperature, weight, height and steps. `PrivacyActivity` handles
`androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (Android 13 and older). The activity-alias
`ViewPermissionUsageActivity` handles `android.intent.action.VIEW_PERMISSION_USAGE` +
`android.intent.category.HEALTH_PERMISSIONS` (Android 14+). Both show:

> PM-SIM reads the health records you allow, only to show them on this device. Nothing is
> uploaded; the app has no internet permission. Educational simulation only. Simulated values
> and consumer wearable readings are not a substitute for clinical monitoring or medical advice.

Data from Health Connect and BLE goes only to the local WebView page. The app has no network
permission, and cloud backup and device transfer are disabled.
