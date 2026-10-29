# Device Integration Report

What device integration VitalsLab had, why it was removed, and how real watch data can still reach the app through the Android version. Rewritten on 2026-10-28, and updated later the same day for the in-page Android panel and the export route.

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

Reference numbers in square brackets refer to `REFERENCES.md`.

## 1. What was removed, and why

On 2026-10-28 the owner decided to keep the web and desktop app focused on being a simulator. The following was removed from the web page:

- the whole **Devices** tab and its device-type catalogue and bed filter,
- hospital routes: HL7 v2 ORU^R01 (MLLP listener, serial, files), FHIR R4 import, IEEE 11073 SDC import, MDC nomenclature mapping and the synthetic HL7 feed,
- Web Bluetooth devices (pulse oximeter, blood pressure, thermometer, weight scale, heart rate profiles), Web Serial and the GATT packet replay.

The Data import tab now reads CSV/JSON tables only. Manual entry and CSV/JSON export stay. The Electron desktop app, which carried the MLLP listener, was removed on the same day. The Linux desktop app added later for v1.1.0 (`desktop/`) only displays the page and has no device access. The earlier hospital-device work was tested only with synthetic messages and no real device, so nothing that was verified on hardware has been lost.

## 2. What remains

- `src/devices/gatt.js`, trimmed to a parser for the Bluetooth **Heart Rate Measurement** characteristic (0x2A37, Heart Rate Service 0x180D) [16, 17, 18]. The Android app's BLE route uses it. `tests/unit/devices.test.js` has 3 tests for it, and the browser self-test has one scenario for it.
- `src/devices/androidBridge.js`, which turns Health Connect records and BLE packets from the Android app into observations (section 3.1). `tests/unit/androidBridge.test.js` has 4 tests for it, and the browser self-test has one scenario for it.
- `src/ui/androidPanel.js`, the "On this phone" panel (section 3.1). It is shown only inside the Android app.
- Simulated, imported (CSV/JSON), device and manually entered data, each kept in its own series with its source.

## 3. Watch data: Android app only

The Android app (`android/`, package `edu.deu.pmsim`, version 1.5.0) wraps the same web page in a WebView. It is the **only** place where real watch data enters VitalsLab. The watch can be an HONOR watch or any other watch. There are three routes:

| Route | How it works | Limits |
|---|---|---|
| Android Health Connect | Read-only access to heart rate, SpO₂, respiratory rate, blood pressure, body temperature, weight, height and steps [19]. The user grants each permission. | The watch's own companion app must write the data to Health Connect. Which parameters exist depends on the watch and its app. |
| Native Bluetooth LE Heart Rate Service | The Kotlin side scans for service 0x180D, connects over GATT and subscribes to characteristic 0x2A37 [20]. The raw bytes go to `gatt.js`. | Only watches or straps that expose the standard heart-rate service. Whether a given watch exposes this service has to be checked per model. Heart rate only. |
| Import of a health-app export file | CSV/JSON export from the user's health app, read by the table importer. | Needs a file in a column layout the importer recognises. |

### 3.1 The "On this phone" panel

The first two routes are operated from a panel in the **Data import/export** tab. The panel is shown only when the page runs inside the Android app (the app provides a `window.PMAndroid` object). In a normal browser it stays hidden.

- **Health Connect.** The panel shows whether Health Connect is available. The user taps **Allow reading…** to grant the read permissions, chooses the last 1, 7 or 30 days and taps **Read records**. A button opens the store page to install or update Health Connect. The message lists how many values were stored and how many were rejected, with the reasons.
- **Bluetooth heart-rate sensor.** **Scan**, **Stop scan** and **Disconnect** buttons; a list of found devices (name, address, signal strength), each with a **Connect** button; the last heart rate, the sensor contact state and RR intervals. The body sensor location is shown if the device reports it. A malformed packet is ignored with a message.

The conversion is done in `src/devices/androidBridge.js`, which has no user interface:

| Input | Stored as | Rules |
|---|---|---|
| Health Connect record (heart rate, SpO₂, respiratory rate, blood pressure, body temperature, weight, height, steps) | source `device`, route `health-connect` | Unsupported types, non-numbers, records without time and unknown units are rejected with a reason. Values outside the plausible range are rejected, never clamped. Exact duplicates are dropped. The provenance keeps the record type, the data origin (the app that wrote it), the original value and unit, and the record time. |
| BLE Heart Rate Measurement packet (hex) | source `device`, route `ble-hrs` | Parsed by `gatt.js`. The provenance keeps the device name, the receive time and the raw hex. |

The stored values appear in the Trends tab as their own `device` series. They are never merged with simulated values.

### 3.2 Exports in the app

A download link does nothing inside the Android WebView. When `window.PMAndroid` exists, every export of the page (observations as CSV or JSON, waveforms, alarm history, trend CSV, PNG images) is passed to the app with `PMAndroid.saveText` or `PMAndroid.saveBase64`. The app then opens the Android save dialog, and the user chooses where the file goes. In a browser the normal download is used.

## 4. Limitations and rules

- These are consumer wearable readings. They are not clinical measurements and are labelled as such. They never drive the simulation: the ECG is not generated from a received heart rate.
- HONOR's own watch protocol is proprietary and is **not used**. Data arrives only through documented Android APIs or the user's own export file. Nothing is reverse-engineered.
- No data leaves the device. The app has no `INTERNET` permission and cloud backup is off. The page's Content Security Policy sets `connect-src 'none'`.
- Everything needs the user's permission: Health Connect read permissions, and the Bluetooth permissions on Android 12 and later.
- A missing or invalid reading is stored as missing, never as 0. A packet reporting that the sensor has no skin contact is stored with quality `artifact`.
- The only other data the page keeps, in the browser's `localStorage`, are the best lesson quiz scores, the Controls view choice and whether Bedside view is on. None of it is measurement data.

## 5. Status

**Not tested with real hardware.** An APK file has been built (`release/PM-SIM-1.5.0-android.apk`), but no watch, heart-rate sensor or Health Connect store has been used with it, and the app has not been tested on a phone. The page-side bridge is checked by unit tests with records and packets written in the test, and the panel was checked in a desktop browser with a mock `PMAndroid` object (records stored, an out-of-range record rejected, a BLE packet decoded, an export routed to `saveText`). A mock only imitates the app's interface; it is not a device test. The browser self-test lists "Watch data on Android (Health Connect / BLE / export file, hardware)" as **not run**, and it must stay that way until a real device test has been done and recorded. The parser is checked only against packets written from the specification (see `TEST_REPORT.md`).
