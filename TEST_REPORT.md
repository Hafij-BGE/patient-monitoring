# Test Report

PM-SIM, Patient Monitor Simulator. Updated 2026-10-28 after the device integration and the Electron desktop app were removed (the Devices tab, HL7/FHIR/SDC import, Web Bluetooth, Web Serial and the desktop builds no longer exist, so their tests were removed too).

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

## 1. Summary

| Test level | Result |
|---|---|
| Node unit tests (`node --test tests/unit/*.test.js`) | **47 tests in 5 files, 47 pass, 0 fail** (run 2026-10-28 after the removal; it was 71 tests before) |
| Browser self-test (`index.html?selftest=1`) | **11 entries: 10 automated scenarios plus 1 hardware entry that is always reported as "not run".** Browser run on 2026-10-28 after the removal: **10 pass, 0 fail, 1 not run** (section 3). |
| Manual interaction checks in a browser | 9 checks, all as expected (section 4). Made on 2026-10-28 before the Devices tab was removed; not repeated afterwards. |
| Hardware tests (watch data on Android through Health Connect, native BLE Heart Rate Service, export file) | **Not run.** The Android app is still in development and no watch, heart-rate sensor or Health Connect store was used. |
| Android app | Not tested on a device. An APK file (`release/PM-SIM-1.1.0-android.apk`) exists, but no behaviour of it has been verified on a device. |
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
| 11 | Watch data on Android (Health Connect, BLE, export file): readings arrive with source `device` and the route in the provenance | Live readings from a real watch or sensor | **not run**: no hardware available | not run |

Entry 11 is reported as "not run" by design. The code never marks a hardware test as passed without hardware. Earlier versions of the self-test also had scenarios for the BLE packet replay, HL7 v2, the HL7 bed filter and MLLP framing, and FHIR/SDC import (15 entries: 13 pass, 2 not run). They were removed together with those features.

## 4. Manual interaction checks

Performed on 2026-10-28 by driving the running app in the browser pane, before the Devices tab was removed. They were not repeated afterwards.

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

## 5. Offline and `file://` operation

The page was not opened from `file://` in a browser during this session. The local Chromium-based browser available here (a snap package) could not read files under `/tmp` or `/mnt` because of its sandbox, and the browser pane cannot open `file://` URLs. Instead the following was checked statically:

- The Content Security Policy allows `file:` for scripts, styles and images, and sets `connect-src 'none'`.
- All script and style paths in `index.html` are relative.
- No `type="module"` scripts are used (module scripts are blocked from `file://` in Chromium).
- No `fetch` or XHR call is needed at start-up. Files are read with `FileReader` only after the user picks them.

When served over `http://localhost`, the app made no network requests other than loading its own files.

## 6. Node unit and integration tests

47 tests in 5 files (17 + 10 + 4 + 13 + 3). Section numbers (§19.x) refer to the acceptance checks of the project prompt.

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

## 7. Defects found and fixed during testing

Defects found in the removed device code are not listed here.

| Defect | Cause | Fix |
|---|---|---|
| Browser kept running old JavaScript after edits | Cached files | Tests served with `Cache-Control: no-store` |
| Reset said limits were restored, but they were not | Reset did not call the alarm engine's restore function | Reset now restores the default limits |

## 8. Not tested and known limitations

- **No real watch, heart-rate sensor or Health Connect store** was used. The Android app (`android/`) is still in development. Its three watch routes (Health Connect, native BLE Heart Rate Service, export file) have not been tested on a device, and the Heart Rate Measurement parser is checked only against packets built from the Bluetooth SIG specification. Consumer wearable readings are not clinical measurements.
- **Page-side wiring of the Android bridge** is not part of `src/ui/` yet, so it has no test.
- **Website:** the GitHub Pages workflow runs the unit tests before deploying. The live site at https://hafij-bge.github.io/patient-monitoring/ was not part of the testing described here.
- **`file://`** was checked statically only (section 5).
- Browsers other than Chromium were not tested.
- Model limitations observed during testing are listed in `TECHNICAL_REPORT.md` section 9: NIBP fails at motion ≥ 20 %, SpO₂ is biased toward about 85 % under motion, the DIA-low alarm can be missed in the low-blood-pressure preset, and the QRS detector has no search-back.

## 9. How to repeat

```bash
node --test tests/unit/*.test.js
```

Then open `index.html?selftest=1` (from a local server such as `python3 -m http.server 8766`, from the website, or directly) and compare the Tests tab with section 3. Expected: 10 pass, 0 fail, 1 not run. Values can differ slightly between browsers, but each must stay within the stated tolerance.
