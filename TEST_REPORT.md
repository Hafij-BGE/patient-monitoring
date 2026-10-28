# Test Report

PM-SIM, Patient Monitor Simulator. Updated 2026-10-28 after the device integration and the Electron desktop app were removed (the Devices tab, HL7/FHIR/SDC import, Web Bluetooth, Web Serial and the desktop builds no longer exist, so their tests were removed too). Updated again on 2026-10-28 after capnography, the arterial line, arrhythmia patterns, the Signal chain and Lessons tabs and the Android page bridge were added. A new minimal Linux desktop app (`desktop/`, `.deb`) was then built; the browser self-test run inside the packaged app under Xvfb gave 14 passed, 0 failed, 1 not run (hardware).

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

## 1. Summary

| Test level | Result |
|---|---|
| Node unit tests (`node --test tests/unit/*.test.js`) | **78 tests in 10 files, 78 pass, 0 fail** (run 2026-10-28 after the glucose model; it was 64 tests before the scenario and glucose tests, and 47 before that) |
| Browser self-test (`index.html?selftest=1`) | **16 entries: 15 automated scenarios plus 1 hardware entry that is always reported as "not run".** Browser run on 2026-10-28: **15 pass, 0 fail, 1 not run** (section 3). |
| Manual interaction checks in a browser | 9 earlier checks (section 4.1) and 5 checks of the new features made on 2026-10-28 (section 4.2), all as expected. |
| Hardware tests (watch data on Android through Health Connect, native BLE Heart Rate Service, export file) | **Not run.** No watch, heart-rate sensor or Health Connect store was used. |
| Android app | Not tested on a device. An APK file (`release/PM-SIM-1.2.0-android.apk`) exists. The page-side bridge is unit-tested with mock records and packets, and the "On this phone" panel was checked in a desktop browser with a mock bridge object. No behaviour of the app has been verified on a phone. |
| Website | Published from `.github/workflows/pages.yml`, which runs the unit tests before deploying. The deployed site was not checked as part of this report. |
| Opening from `file://` | Checked statically only (section 5) |

## 2. Environment

- Linux, Node.js v24.22.0.
- Browser checks: the Chromium-based browser pane of the Claude desktop app, loading the app from a local no-cache HTTP server (`http://localhost:8766/`).
- A 15 s LE scan on the development machine found 21 advertisers, none advertising a standard health service. No Bluetooth health device was connected.
- No watch, heart-rate sensor or other health device was used in any test.

## 3. Browser self-test: expected versus observed

The self-test runs each scenario on a fresh engine instance with a fixed seed. The live monitor is not touched. Results are also exposed as `window.__TEST_RESULTS__`.

| # | Scenario (input) | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | Baseline preset, HR set to 72 bpm, 20 s | HR estimate within ±3 bpm of 72 | HR 72.9 bpm | pass |
| 2 | Tachycardia preset, HR set to 135 bpm, 25 s | HR within ±4 bpm of 135; HR-high alarm active | HR 138.1 bpm, hr:high active | pass |
| 3 | Desaturation preset, SpO₂ set to 84 %, 30 s | SpO₂ from the red/IR ratio within ±3 % of 84; SpO₂-low alarm active | SpO₂ 84.0 %, spo2:low active | pass |
| 4 | Sensor disconnection preset, 15 s | SpO₂ value `null`, quality `missing`, technical alarm, **no** SpO₂-low alarm | value null, quality missing, technical true, spo2:low false | pass |
| 5 | Baseline, 120/80 mmHg, one NIBP measurement | SYS/DIA within ±10 mmHg of 120/80; MAP formula = (SYS + 2·DIA)/3 | 120/83 mmHg, MAP osc. 91, MAP formula 95.2 | pass |
| 6 | Motion artifact preset (70 %), NIBP | Measurement fails with a technical alarm; no numbers reported | failed: "motion artifact (irregular oscillations)" | pass |
| 7 | Apnea preset (RR = 0), 30 s | Apnea flagged and apnea alarm active after the 20 s delay | apnea true, alarm active | pass |
| 8 | Input validation: DIA = 130 with SYS = 120 | Rejected with an error, previous DIA kept | error message; DIA kept at 80 | pass |
| 9 | Import CSV with `temp (°F)` = 98.6, `weight (lb)` = 154, empty `hr` | 37.0 °C, 69.9 kg, empty cell stays missing | temp 37.00 °C, weight 69.85 kg, hr not stored | pass |
| 10 | Bluetooth Heart Rate Measurement parser (used by the Android app): packet `1F 2C 01 0A 00 00 04 00 02`, a no-contact packet `04 50` and a truncated packet `01 48` | u16 HR 300, contact detected, RR intervals 1.0 s and 0.5 s; no-contact packet stored with quality `artifact` and source `device`; truncated packet rejected | hr 300, contact detected, RR 1/0.5 s; no-contact artifact; truncated rejected: true (browser self-test, 2026-10-28) | pass |
| 11 | V-Tach pattern preset, 20 s | Rhythm classified `vtach` and `rhythm:vtach` alarm active | rhythm vtach, HR 172, rhythm:vtach active | pass |
| 12 | Hypoventilation preset (RR 6, EtCO₂ set to 58 mmHg), 30 s | EtCO₂ within ±3 mmHg of 58; EtCO₂-high alarm active after its 10 s delay | EtCO₂ 58.8 mmHg, etco2:high active | pass |
| 13 | Arterial line: optimal vs under-damped, 120/80 mmHg, 20 s each | Optimal SYS/DIA within ±5 of 120/80; under-damped SYS ≥ 8 mmHg higher with MAP within ±2 | optimal about 120/79 (90), under-damped about 133/74 (91) | pass |
| 14 | Health Connect records (Android bridge logic): one valid heart-rate record and one SpO₂ record of 150 % | Valid record stored as source `device`; SpO₂ 150 % rejected, not clamped | 1 stored (hr 61, device), 1 rejected | pass |
| 15 | Glucose model (no diabetes: 50 g meal, 5 h; type 1: fasting 200 mg/dL, basal 0.8 U/h, 6 U bolus, 4 h; alarm engine at 60 mg/dL) | Meal peak above 120 mg/dL and back within ±15 of 90 by 5 h; bolus lowers the 4 h value by ≥ 10 mg/dL; glucose-low alarm active | peak 167, 5 h 84 mg/dL; type 1 at 4 h 200 → 159 mg/dL with bolus; glucose:low active | pass |
| 16 | Watch data on Android (Health Connect, BLE, export file): readings arrive with source `device` and the route in the provenance | Live readings from a real watch or sensor | **not run**: no hardware available | not run |

Entry 14 tests only the page-side conversion code with records written in the test. It does not involve Health Connect or a phone. Entry 16 is reported as "not run" by design. The code never marks a hardware test as passed without hardware. Earlier versions of the self-test also had scenarios for the BLE packet replay, HL7 v2, the HL7 bed filter and MLLP framing, and FHIR/SDC import (15 entries: 13 pass, 2 not run). They were removed together with those features.

## 4. Manual interaction checks

### 4.1 Earlier checks

Performed on 2026-10-28 by driving the running app in the browser pane, before the Devices tab was removed. They were not repeated afterwards. At that time the alarm limits table had 7 rows; the source now defines 10 limit rows (EtCO₂, ART SYS and ART MAP were added), and this row count was not re-checked by hand.

| Check | Expected | Observed |
|---|---|---|
| Select the Tachycardia preset | Message names the changed control; HR tile and alarm follow | Message "Changed: Heart rate"; HR alarm shown in the alarm bar as MEDIUM priority |
| Start NIBP at baseline | Cuff inflates and deflates, oscillogram drawn, row added to the table | Completed at 121/83 mmHg (MAP osc. 94), MAP formula 96, PP 37; table row "46 121 83 94 96 120/80 ok" |
| Manual entry: temperature 99.5 °F | Converted and stored as user data | Stored as 37.5 °C, source `user` |
| Import `mini.csv` (test file with one bad value and empty cells) | Valid values accepted, bad value listed, empty cells not stored | 6 accepted, 1 invalid ("not a number: "abc""), 2 empty cells; headers mapped |
| Trends with data from two sources | Sources drawn separately, gaps visible | simulated n = 37 with 3 missing and 1 gap, drawn as its own series beside the second source (at the time the since-removed packet replay) |
| Reset | Simulation and alarm limits back to defaults; simulated/derived data cleared; imported and user data kept | As expected |
| Alarm limits table | One row per limited parameter | 7 rows |
| Layout at 375 px width | No horizontal overflow | No overflow |
| Browser console during all checks | No errors | No errors |

### 4.2 Checks of the new features

Performed on 2026-10-28 in the same browser pane, after capnography, the arterial line, the arrhythmia patterns, the Signal chain and Lessons tabs and the Android panel were added.

| Check | Expected | Observed |
|---|---|---|
| Monitor screen at desktop width and at 375 px | No horizontal overflow | No overflow at either width |
| Reset | The new tiles (ART, EtCO₂) are cleared like the others | As expected |
| Hypoventilation preset | EtCO₂-high alarm after its delay; EtCO₂ tile highlighted | Alarm raised and tile highlighted |
| Signal chain and Lessons tabs | Both render and update | As expected; no console errors |
| Android panel: normal browser, then with a mock `PMAndroid` object | Hidden in a normal browser. With the mock: Health Connect records stored, an out-of-range record rejected, a BLE packet decoded, an export routed to `saveText` | As expected |

The mock object only imitates the app's interface in a desktop browser. It is not a test of the Android app, Health Connect or a Bluetooth device.

## 5. Offline and `file://` operation

The page was not opened from `file://` in a browser during this session. The local Chromium-based browser available here (a snap package) could not read files under `/tmp` or `/mnt` because of its sandbox, and the browser pane cannot open `file://` URLs. Instead the following was checked statically:

- The Content Security Policy allows `file:` for scripts, styles and images, and sets `connect-src 'none'`.
- All script and style paths in `index.html` are relative.
- No `type="module"` scripts are used (module scripts are blocked from `file://` in Chromium).
- No `fetch` or XHR call is needed at start-up. Files are read with `FileReader` only after the user picks them.

When served over `http://localhost`, the app made no network requests other than loading its own files.

## 6. Node unit and integration tests

78 tests in 10 files (17 + 10 + 4 + 13 + 3 + 10 + 3 + 4 + 6 + 8). Section numbers (§19.x) refer to the acceptance checks of the project prompt.

The first five files were already described before the new features were added. Their counts did not change.

### `tests/unit/sim.test.js` (17 tests)

- §19.1 HR 60 bpm gives a 1.000 s beat interval (model and detector).
- §19.2 RR 12 br/min gives a 5 s breathing cycle; the detector reports 12.
- §19.3 MAP formula: 120/80 → 93.3 mmHg.
- §19.4 Pulse pressure = SBP − DBP in the NIBP result.
- The NIBP oscillometric estimate stays within ±5 mmHg of the set point in low-noise cases.
- NIBP fails with a message under strong motion, and re-inflates when SBP is above the first target.
- Oscillogram analysis rejects too few beats.
- The SpO₂ estimator tracks the set point and reports SQI, PI and pulse rate.
- Motion biases SpO₂ toward R ≈ 1 (≈ 85 %) and lowers SQI.
- Sensor states give missing values and technical flags, never zeros.
- Apnea: RR = 0 is detected after the apnea delay.
- §19.16 Waveform buffers grow at the configured sampling rates.
- Changing `ecg_fs` at run time rebuilds the ECG chain.
- The same seed and settings give an identical run.
- §19.7/§19.8 Presets apply explicit changes and keep processing settings.
- §19.9 Invalid inputs are rejected or clamped with messages.
- Every preset runs 30 s without exceptions or NaN numerics.

### `tests/unit/alarms.test.js` (10 tests)

- §19.5 SpO₂ below the low limit raises an alarm only after the delay.
- Limits are strict: a value equal to the limit does not alarm.
- A dip shorter than the delay does not alarm; alarms are non-latching.
- Missing values never raise physiological alarms.
- §19.6 Acknowledge silences one alarm, mute counts down, reset clears.
- Apnea is high priority and replaces the RR-low alarm.
- Technical alarms are low priority, delayed, and separate from physiological ones.
- Limit validation rejects low ≥ high and bad numbers.
- History exports as CSV.
- Presets drive the expected alarms end to end (simulation → alarm engine).

### `tests/unit/core.test.js` (4 tests)

- Unit conversions are explicit and exact.
- Observations keep source and provenance; missing is `null`, never 0.
- Profile: BMI, BSA (Mosteller), the note for age under 20, weight change.
- Store: series by source, gaps reported but not filled, CSV/JSON export.

### `tests/unit/data.test.js` (13 tests)

- CSV reader: quotes, doubled quotes, CRLF, BOM, delimiter detection.
- §19.10 Wide CSV import: header synonyms, units in brackets, empty cells skipped.
- §19.13 Long CSV import converts kPa, °F and lb to canonical units.
- §19.13 Semicolon file: decimal comma, separate date and time columns, `DD.MM.YYYY`.
- §19.13 Units in column names (`temp_f`, `weight_lb`, `height_in`, `SBP (kPa)`).
- §19.13 Timestamps: Z, offset, naive in a chosen zone, epoch s/ms and dotted dates agree.
- The timestamp parser rejects impossible and ambiguous dates.
- §19.12 Missing tokens become missing observations; duplicates are dropped; conflicts are reported.
- §19.11 Malformed CSV: bad rows are rejected and listed, good rows survive.
- §19.11 Malformed or empty inputs fail cleanly with nothing imported.
- §19.10 JSON import: wrapped wide records with nested units, `null` as missing, long arrays.
- §19.14 Imported, simulated and user data stay separate; exports re-import as `imported`.
- Manual entry validates value, unit, range and timestamp.

### `tests/unit/devices.test.js` (3 tests)

- Heart Rate Measurement 0x2A37: uint8/uint16 heart rate, sensor contact, energy expended and RR intervals, using byte vectors written by hand from the specification. A one-byte packet and an odd-length hex string are rejected.
- The test encoder round-trips through the parser.
- Heart-rate packets become `device` observations with provenance (route, raw bytes, RR intervals); a no-contact packet gets quality `artifact`; heart rate 0 is stored as missing, never as 0.

These tests check the parser against packets built from the specification. They do not test a radio link or a real sensor.

### `tests/unit/arrhythmia.test.js` (10 tests)

- Each teaching rhythm gets its label in at least 90 % of the frames after the first 10 s of a 60 s run: baseline, tachycardia and bradycardia → regular; AF → irregular; PVC → pvc; VT → vtach; VF → vfib; asystole → asystole.
- The analyser reports "learning" at the start, and "unavailable" (shown as "Not analysed") with the leads off.
- PVC pattern over 90 s: each PVC is premature (< 0.8 × the mean interval) and followed by a compensatory pause (coupling + pause > 1.7 × the mean); at least 5 PVCs are checked; a PVC has a smaller pulse than a normal beat; the reported PVC rate is 6–25/min.
- VT: measured QRS width > 100 ms and HR within ±10 bpm of 170. VF and asystole: HR missing, perfusion < 0.05, ART MAP < 15 mmHg and EtCO₂ < 10 mmHg after 40 s.
- VT, VF and asystole raise their high-priority rhythm alarms within 20 s.
- Capnography: baseline EtCO₂ within ±2 of 38 mmHg, FiCO₂ < 1 mmHg and awRR within ±1 of 14; hypoventilation EtCO₂ > 54 mmHg and awRR about 6; rebreathing FiCO₂ within ±1.5 of 6 mmHg; apnea gives EtCO₂ missing.
- Expiratory obstruction makes the 40–95 % rise of the capnogram more than 2 times slower than at baseline, with the peak within 4 mmHg.
- A disconnected sampling line gives EtCO₂ missing and the CO₂-no-signal technical flag.
- Arterial line damping: optimal SYS and DIA within ±4 mmHg of the set point; under-damped SYS more than 6 mmHg above optimal; over-damped SYS more than 4 mmHg below optimal; MAP within ±2 mmHg in both cases; ζ under-damped < ζ optimal.
- A transducer 20 cm too high lowers MAP by 20 × 0.7356 mmHg (within ±1.5). A line open to air gives no ART value and the no-pulsatile-signal flag.

These tests check the analyser only on the simulator's own waveforms. They are not a validation against annotated ECG databases.

### `tests/unit/lessons.test.js` (3 tests)

- Lesson content is valid: unique ids, existing presets, every step's tab exists, every control change in a step passes the parameter validation without errors or warnings, objectives and steps are not empty.
- Quizzes: at least 3 questions each, answer index in range, unique options, an explanation for every question. All correct answers give 100 % and "complete"; a partial set gives score 0 and "incomplete"; an unknown lesson id throws.
- Quiz facts agree with the model: the ratio R in the desaturation preset is (110 − 84)/25 within ±0.08; the default mains frequency is 50 Hz and the apnea delay 20 s; Ks 0.3 gives an NIBP SBP more than 2 mmHg above Ks 0.5.

### `tests/unit/androidBridge.test.js` (4 tests)

- Valid Health Connect records (heart rate, SpO₂, temperature, plus one duplicate) give 3 `device` observations with value, unit, time, route `health-connect` and data origin; the duplicate is dropped and an error message from the app is passed through.
- Rejections: an unsupported type (cholesterol), a non-number value, SpO₂ 140 % (out of range) and a record without time are rejected with reasons. A systolic pressure of 16 kPa is converted to mmHg (× 7.50062). Empty input gives no observations.
- A BLE packet built with the test encoder (HR 72, contact, one RR interval of 0.8 s) gives one `device` observation with route `ble-hrs` and the device name; a malformed packet throws.
- The Base64 helper used for binary exports matches Node's `Buffer` for 70 000 bytes.

These tests use records and packets written in the test. They do not involve a phone, Health Connect or a Bluetooth device.

### `tests/unit/scenario.test.js` (6 tests)

- Every preset matches itself; a manual edit of a patient, physiology or sensor value gives "custom". Display and processing settings do not make a scenario custom.
- Loading a scenario sets every patient and sensor value, not only the scenario's own changes.
- Alarm colouring: the highest priority wins per tile, all messages are kept, and a technical alarm maps to its sensor control. Every alarm parameter and technical flag the engine can raise is linked to a tile.
- Literature scenarios: values in range without clamping, references that exist in `REFERENCES.md`, and no two scenarios with the same settings.

### `tests/unit/glucose.test.js` (8 tests)

- Without events the model holds its fasting value for 10 h in each diabetes status.
- No diabetes, 50 g meal: the peak is above 120 mg/dL between 20 and 120 min, and glucose is back within ±15 of 90 mg/dL after 5 h.
- Same meal: type 2 and type 1 (no insulin) peak more than 10 mg/dL higher and are more than 30 mg/dL higher at 2 h than no diabetes.
- Type 1: a 6 U bolus lowers the 4 h value by more than 10 mg/dL and raises plasma insulin.
- The projection reports the first crossing of 70, 54, 180 and 250 mg/dL, gives time in range between 0 and 100 %, and runs on a copy (the model is unchanged).
- mmol/L and mg/dL conversion (× 18.016) in the model and in the import unit converter; mU/L equals µU/mL for insulin.
- Engine: glucose follows the model clock, a meal raises it, observations are labelled `simulated` in mg/dL, and a change of diabetes status restarts the model at the new fasting value.
- Alarms: medium priority below 70 or above 180 mg/dL; high-priority level 2 below 54 mg/dL only.

These tests check the model against its own design targets and the published parameter values. They are not a validation against measured patient data.

## 7. Defects found and fixed during testing

Defects found in the removed device code are not listed here.

| Defect | Cause | Fix |
|---|---|---|
| Browser kept running old JavaScript after edits | Cached files | Tests served with `Cache-Control: no-store` |
| Reset said limits were restored, but they were not | Reset did not call the alarm engine's restore function | Reset now restores the default limits |

## 8. Not tested and known limitations

- **No real watch, heart-rate sensor or Health Connect store** was used. The Android app (`android/`) has not been tested on a phone. Its three watch routes (Health Connect, native BLE Heart Rate Service, export file) and the native save dialog for exports have not been tested on a device, and the Heart Rate Measurement parser is checked only against packets built from the Bluetooth SIG specification. Consumer wearable readings are not clinical measurements.
- **Page-side Android bridge** (`src/devices/androidBridge.js`, `src/ui/androidPanel.js`) is checked only with unit tests and a mock `PMAndroid` object in a desktop browser.
- **Rhythm analysis** is checked only on the simulator's own patterns, not on recorded ECGs.
- **Website:** the GitHub Pages workflow runs the unit tests before deploying. The live site at https://hafij-bge.github.io/patient-monitoring/ was not part of the testing described here.
- **`file://`** was checked statically only (section 5).
- Browsers other than Chromium were not tested.
- Model limitations observed during testing are listed in `TECHNICAL_REPORT.md` section 9: NIBP fails at motion ≥ 20 %, SpO₂ is biased toward about 85 % under motion, the DIA-low alarm can be missed in the low-blood-pressure preset, and the QRS detector has no search-back.

## 9. How to repeat

```bash
node --test tests/unit/*.test.js
```

Then open `index.html?selftest=1` (from a local server such as `python3 -m http.server 8766`, from the website, or directly) and compare the Tests tab with section 3. Expected: 15 pass, 0 fail, 1 not run. Values can differ slightly between browsers, but each must stay within the stated tolerance.
