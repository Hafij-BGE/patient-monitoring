# Device Integration Report

What device integration PM-SIM had, why it was removed, and how real watch data can still reach the app through the Android version. Rewritten on 2026-10-28.

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

Reference numbers in square brackets refer to `REFERENCES.md`.

## 1. What was removed, and why

On 2026-10-28 the owner decided to keep the web and desktop app focused on being a simulator. The following was removed from the web page:

- the whole **Devices** tab and its device-type catalogue and bed filter,
- hospital routes: HL7 v2 ORU^R01 (MLLP listener, serial, files), FHIR R4 import, IEEE 11073 SDC import, MDC nomenclature mapping and the synthetic HL7 feed,
- Web Bluetooth devices (pulse oximeter, blood pressure, thermometer, weight scale, heart rate profiles), Web Serial and the GATT packet replay.

The Data import tab now reads CSV/JSON tables only. Manual entry and CSV/JSON export stay. The Electron desktop app, which carried the MLLP listener, was removed on the same day. The earlier hospital-device work was tested only with synthetic messages and no real device, so nothing that was verified on hardware has been lost.

## 2. What remains

- `src/devices/gatt.js`, trimmed to a parser for the Bluetooth **Heart Rate Measurement** characteristic (0x2A37, Heart Rate Service 0x180D) [16, 17, 18]. The Android app's BLE route uses it. `tests/unit/devices.test.js` has 3 tests for it, and the browser self-test has one scenario for it.
- Simulated, imported (CSV/JSON) and manually entered data, each kept in its own series with its source.

## 3. Watch data: Android app only

The Android app (`android/`, package `edu.deu.pmsim`, version 1.1.0) wraps the same web page in a WebView. It is the **only** place where real watch data enters PM-SIM. The watch can be an HONOR watch or any other watch. There are three routes:

| Route | How it works | Limits |
|---|---|---|
| Android Health Connect | Read-only access to heart rate, SpO₂, respiratory rate, blood pressure, body temperature, weight, height and steps [19]. The user grants each permission. | The watch's own companion app must write the data to Health Connect. Which parameters exist depends on the watch and its app. |
| Native Bluetooth LE Heart Rate Service | The Kotlin side scans for service 0x180D, connects over GATT and subscribes to characteristic 0x2A37 [20]. The raw bytes go to `gatt.js`. | Only watches or straps that expose the standard heart-rate service. Whether a given watch exposes this service has to be checked per model. Heart rate only. |
| Import of a health-app export file | CSV/JSON export from the user's health app, read by the table importer. | Needs a file in a column layout the importer recognises. |

## 4. Limitations and rules

- These are consumer wearable readings. They are not clinical measurements and are labelled as such. They never drive the simulation: the ECG is not generated from a received heart rate.
- HONOR's own watch protocol is proprietary and is **not used**. Data arrives only through documented Android APIs or the user's own export file. Nothing is reverse-engineered.
- No data leaves the device. The app has no `INTERNET` permission and cloud backup is off. The page's Content Security Policy sets `connect-src 'none'`.
- Everything needs the user's permission: Health Connect read permissions, and the Bluetooth permissions on Android 12 and later.
- A missing or invalid reading is stored as missing, never as 0. A packet reporting that the sensor has no skin contact is stored with quality `artifact`.
- Page-side wiring of the Android bridge (turning the app's events into observations in the web page) is not yet part of `src/ui/`.

## 5. Status

**In development, not hardware-tested.** An APK file has been built (`release/PM-SIM-1.1.0-android.apk`), but no watch, heart-rate sensor or Health Connect store has been used with it. The browser self-test lists "Watch data on Android (Health Connect / BLE / export file, hardware)" as **not run**, and it must stay that way until a real device test has been done and recorded. The parser is checked only against packets written from the specification (see `TEST_REPORT.md`).
