# Test Report

VitalsLab, Patient Monitor Simulator. Updated 2026-10-29 after the simulation audit (`SIMULATION_AUDIT.md`); earlier updated 2026-10-28 after the device integration and the Electron desktop app were removed (the Devices tab, HL7/FHIR/SDC import, Web Bluetooth, Web Serial and the desktop builds no longer exist, so their tests were removed too). Updated again on 2026-10-28 after capnography, the arterial line, arrhythmia patterns, the Signal chain and Lessons tabs and the Android page bridge were added. A new minimal Linux desktop app (`desktop/`, `.deb`) was then built; the browser self-test run inside the packaged app under Xvfb gave 14 passed, 0 failed, 1 not run (hardware).

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

## 1. Summary

| Test level | Result |
|---|---|
| Node unit tests (`node --test tests/unit/*.test.js`) | **145 tests in 17 files, 145 pass, 0 fail** (run 2026-10-29 after the community scenarios were added; 133 after the cuff strip change; 130 after the waveform audit, `SIMULATION_AUDIT.md` §9a; 116 after the arterial notch and finger volume pulse, see `SIMULATION_AUDIT.md` §4 and §6; 111 after the simulation audit; 98 after the profile use cases; 93 after the derived 12-lead ECG; 86 after the critical-illness, stroke, heart-failure and post-operative scenarios and the extreme-low alarms; 80 after the SVT scenario and the QRS beat-time fix, 79 after the NIBP set-point fix, 78 after the glucose model, it was 64 tests before the scenario and glucose tests, and 47 before that) |
| Browser self-test (`index.html?selftest=1`) | **17 entries: 16 automated scenarios plus 1 hardware entry that is always reported as "not run".** Browser run on 2026-10-29 after the waveform audit (§9a): **16 pass, 0 fail, 1 not run** (section 3), the same as before it. |
| Manual interaction checks in a browser | 9 earlier checks (section 4.1), 5 checks of the new features made on 2026-10-28 (section 4.2), the derived 12-lead view (section 4.3) and the community scenarios on 2026-10-29 (section 4.4), all as expected. |
| Hardware tests (watch data on Android through Health Connect, native BLE Heart Rate Service, export file) | **Not run.** No watch, heart-rate sensor or Health Connect store was used. |
| Android app | Not tested on a device. An APK file (`release/PM-SIM-1.5.0-android.apk`) exists. The page-side bridge is unit-tested with mock records and packets, and the "On this phone" panel was checked in a desktop browser with a mock bridge object. No behaviour of the app has been verified on a phone. |
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
| 1 | Baseline preset, HR set to 72 bpm, 20 s | HR estimate within ±3 bpm of 72 | HR 72.2 bpm | pass |
| 2 | Tachycardia preset, HR set to 135 bpm, 25 s | HR within ±4 bpm of 135; HR-high alarm active | HR 137.1 bpm, hr:high active | pass |
| 3 | Desaturation preset, SpO₂ set to 84 %, 30 s | SpO₂ from the red/IR ratio within ±3 % of 84; SpO₂-low alarm active | SpO₂ 84.0 %, SQI 99.07, spo2:low active | pass |
| 4 | Sensor disconnection preset, 15 s | SpO₂ value `null`, quality `missing`, technical alarm, **no** SpO₂-low alarm | value null, quality missing, technical true, spo2:low false | pass |
| 5 | Baseline, 120/80 mmHg, one NIBP measurement | SYS/DIA within ±10 mmHg of 120/80; MAP formula = (SYS + 2·DIA)/3 | 119/81 mmHg, MAP osc. 98, MAP formula 93.8 | pass |
| 6 | Motion artifact preset (70 %), NIBP | Measurement fails with a technical alarm; no numbers reported | failed: "motion artifact (irregular oscillations)" | pass |
| 7 | Apnea preset (RR = 0), 30 s | Apnea flagged and apnea alarm active after the 20 s delay | apnea true, alarm active | pass |
| 8 | Input validation: DIA = 130 with SYS = 120 | Rejected with an error, previous DIA kept | error message; DIA kept at 80 | pass |
| 9 | Import CSV with `temp (°F)` = 98.6, `weight (lb)` = 154, empty `hr` | 37.0 °C, 69.9 kg, empty cell stays missing | temp 37.00 °C, weight 69.85 kg, hr not stored | pass |
| 10 | Bluetooth Heart Rate Measurement parser (used by the Android app): packet `1F 2C 01 0A 00 00 04 00 02`, a no-contact packet `04 50` and a truncated packet `01 48` | u16 HR 300, contact detected, RR intervals 1.0 s and 0.5 s; no-contact packet stored with quality `artifact` and source `device`; truncated packet rejected | hr 300, contact detected, RR 1/0.5 s; no-contact artifact; truncated rejected: true (browser self-test, 2026-10-29) | pass |
| 11 | V-Tach pattern preset, 20 s | Rhythm classified `vtach` and `rhythm:vtach` alarm active | rhythm vtach, HR 173, rhythm:vtach active | pass |
| 12 | Hypoventilation preset (RR 6, EtCO₂ set to 58 mmHg), 30 s | EtCO₂ within ±3 mmHg of 58; EtCO₂-high alarm active after its 10 s delay | EtCO₂ 58.8 mmHg, etco2:high active | pass |
| 13 | Arterial line: optimal vs under-damped, 120/80 mmHg, 20 s each | Optimal SYS/DIA within ±5 of 120/80; under-damped SYS > 6 mmHg higher (was ≥ 8 before the Windkessel pulse; see SIMULATION_AUDIT.md §9) with MAP within ±2 | optimal 121/80 (95), under-damped 135/78 (95) | pass |
| 14 | Health Connect records (Android bridge logic): one valid heart-rate record and one SpO₂ record of 150 % | Valid record stored as source `device`; SpO₂ 150 % rejected, not clamped | 1 stored (hr 61, device), 1 rejected | pass |
| 15 | Glucose model (no diabetes: 50 g meal, 5 h; type 1: fasting 200 mg/dL, basal 0.8 U/h, 6 U bolus, 4 h; alarm engine at 60 mg/dL) | Meal peak above 120 mg/dL and back within ±15 of 90 by 5 h; bolus lowers the 4 h value by ≥ 10 mg/dL; glucose-low alarm active | peak 167, 5 h 84 mg/dL; type 1 at 4 h 200 → 104 mg/dL with bolus; glucose:low active | pass |
| 16 | Derived 12-lead ECG: baseline preset, 12 s, then electrode contact 5 % for 2 s | Lead II of the 12-lead identical to the monitor trace; I + III = II; frontal axis +30° to +75°; leads off gives no signal in all 12 leads | largest II − monitor difference 0 mV, largest I + III − II residual 2.1 × 10⁻¹⁴ mV, axis +49°, leads off: no signal | pass |
| 17 | Watch data on Android (Health Connect, BLE, export file): readings arrive with source `device` and the route in the provenance | Live readings from a real watch or sensor | **not run**: no hardware available | not run |

Entry 14 tests only the page-side conversion code with records written in the test. It does not involve Health Connect or a phone. Entry 17 is reported as "not run" by design. The code never marks a hardware test as passed without hardware. Earlier versions of the self-test also had scenarios for the BLE packet replay, HL7 v2, the HL7 bed filter and MLLP framing, and FHIR/SDC import (15 entries: 13 pass, 2 not run). They were removed together with those features.

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

### 4.3 Derived 12-lead view

Performed on 2026-10-28 in the browser pane (Chromium) served from `localhost`, and in offscreen Electron for the README screenshot.

| Check | Expected | Observed |
|---|---|---|
| Click on the ECG waveform, and the *12-lead* button | Dialog opens with 12 labelled leads, a rhythm strip, the header and the notice | Opens from both; layout as expected; no console errors |
| Baseline (72 bpm) | Normal pattern, axis about +50° | Axis +49° (normal); rS in V1, tall R in V4–V6, aVR negative |
| VT preset | Wide complexes, V1 negative, V6 positive | As expected; axis +83° |
| VF preset | Chaotic activity in all leads, no axis | As expected; message "no QRS complexes, no axis" |
| Asystole preset | Message, no axis | As expected |
| Contact set to 5 % for 4 s, then 12 s | First: gaps left blank with a partial-signal message; then: no traces and "No ECG signal" | As expected (a first version reported "No ECG signal" for a partial gap; fixed to use the 10 s rhythm strip) |
| Hold / Close buttons | Hold freezes and relabels; Close closes and stops the refresh | As expected |
| Bedside view and 375 px width | Button reachable; dialog fits the screen; the ECG paper scrolls sideways inside it, the page does not | As expected (page width 375 px) |

The *Save PNG* button uses the same `canvasPng` helper as the other PNG buttons; the download itself was not clicked in this session.

### 4.4 Community scenarios and the rename

Performed on 2026-10-29 in the browser pane (Chromium) served from `localhost`. For the list checks a temporary sample entry was written to `community/scenarios.js` and removed afterwards; the shipped list is empty.

| Check | Expected | Observed |
|---|---|---|
| Page title and header | "VitalsLab" with the author and a link to the repository | Title "VitalsLab · Patient Monitor Simulator"; header "by Md. Hafijur Rahman · github.com/Hafij-BGE/patient-monitoring" |
| Sample entry in the list | A "Community scenarios" group after the built-in ones; the entry ends in "(community)" | As expected |
| Load the sample entry | Its values are set; the message names the author, the issue, the date and the author's source, and says that the clinical content was not checked | HR 118, temperature 38.6 °C; message as expected |
| Bedside view scenario list | Same entries as in Controls | 52 options; choosing the entry switches the scenario |
| Share dialog with baseline settings | Nothing to share; link disabled | Message "Nothing to share yet…"; link has no `href` |
| Share dialog with a built-in scenario loaded unchanged | Refused as a duplicate | "same settings as the existing scenario …" |
| Profile checkbox | Off: no profile keys in the preview; on: changed profile keys appear | `age_years` appears only when ticked |
| `<b>` in the name | Refused; link disabled | "plain text only …"; `href` removed, `aria-disabled="true"` |
| Valid entry | Preview equals the JSON in the link; link goes to the issue template | URL `https://github.com/Hafij-BGE/patient-monitoring/issues/new?template=scenario.yml&title=…&scenario=…`; decoded JSON equals the preview |
| Reset, console, self-test | Back to baseline; no errors; self-test unchanged | As expected; self-test 16 pass, 0 fail, 1 not run |

Not tested: the GitHub side (issue form, the `community-scenarios.yml` workflow, the labels, the commit and the redeploy) has not run on GitHub yet; it is covered only by the unit tests of `tools/community-scenario.js`. The link was not clicked, so no issue was created. Opening the link from the Android app (allow-listed for this repository only) and from the Linux desktop app was not tested. The dialog was not checked in dark mode.

## 5. Offline and `file://` operation

The page was not opened from `file://` in a browser during this session. The local Chromium-based browser available here (a snap package) could not read files under `/tmp` or `/mnt` because of its sandbox, and the browser pane cannot open `file://` URLs. Instead the following was checked statically:

- The Content Security Policy allows `file:` for scripts, styles and images, and sets `connect-src 'none'`.
- All script and style paths in `index.html` are relative.
- No `type="module"` scripts are used (module scripts are blocked from `file://` in Chromium).
- No `fetch` or XHR call is needed at start-up. Files are read with `FileReader` only after the user picks them.

When served over `http://localhost`, the app made no network requests other than loading its own files.

## 6. Node unit and integration tests

145 tests in 17 files (21 + 10 + 4 + 13 + 3 + 12 + 3 + 4 + 6 + 8 + 10 + 6 + 7 + 9 + 14 + 3 + 12). Section numbers (§19.x) refer to the acceptance checks of the project prompt.

The first five files were already described before the new features were added. Their counts did not change.

### `tests/unit/sim.test.js` (21 tests)

- §19.1 HR 60 bpm gives a 1.000 s beat interval (model and detector).
- §19.2 RR 12 br/min gives a 5 s breathing cycle; the detector reports 12.
- §19.3 MAP formula: 120/80 → 93.3 mmHg.
- §19.4 Pulse pressure = SBP − DBP in the NIBP result.
- The NIBP oscillometric estimate stays within ±5 mmHg of the set point in low-noise cases.
- NIBP fails with a message under strong motion, and re-inflates when SBP is above the first target.
- NIBP aborts when the pressure set point changes during a measurement (120/80 to 78/42 while the cuff deflates gives "patient pressure changed during measurement; repeat" and a technical failure, not a reading). The next measurement at the new set point is within ±5 mmHg of 78/42, and a change of 3 mmHg during a measurement does not abort it. Before the fix this test failed: the mixed oscillogram gave 121/112 mmHg with no error.
- Oscillogram analysis rejects too few beats.
- The SpO₂ estimator tracks the set point and reports SQI, PI and pulse rate.
- Motion biases SpO₂ toward R ≈ 1 (≈ 85 %) and lowers SQI.
- No arterial pulse (VF, asystole): SpO₂, PR and PI are blanked instead of being read from noise (red/IR correlation gate r ≥ 0.6).
- An irregular pulse (AF) is still accepted as pulsatile; a low PI is measured, not rejected.
- The temperature probe reaches 63 % of a step after one time constant.
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

### `tests/unit/arrhythmia.test.js` (12 tests)

- Each teaching rhythm gets its label in at least 90 % of the frames after the first 10 s of a 60 s run: baseline, tachycardia and bradycardia → regular; AF → irregular; SVT → svt; PVC → pvc; VT → vtach; VF → vfib; asystole → asystole.
- SVT pattern: measured QRS width < 75 ms, HR within ±6 of 180, no wide beats, P-wave amplitude 0, and the medium-priority `rhythm:svt` alarm active. The documented limitation is tested too: sinus rhythm at 180 bpm (P wave kept) is also labelled SVT in ≥ 90 % of frames; sinus at 140 bpm and AF at 180 bpm are never labelled SVT.
- The analyser reports "learning" at the start, and "unavailable" (shown as "Not analysed") with the leads off.
- PVC pattern over 90 s: each PVC is premature (< 0.8 × the mean interval) and followed by a compensatory pause (coupling + pause > 1.7 × the mean); at least 5 PVCs are checked; a PVC has a smaller pulse than a normal beat; the reported PVC rate is 6–25/min.
- VT: measured QRS width > 100 ms and HR within ±10 bpm of 170. VF and asystole: HR missing, perfusion < 0.05, ART MAP < 15 mmHg and EtCO₂ < 10 mmHg after 40 s.
- Low-voltage QRS (R 0.2 mV, baseline preset): no frame between 15 and 40 s is labelled asystole, and HR stays within ±3 of 72.
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

### `tests/unit/pulse.test.js` (10 tests)

- The three-element Windkessel fit reproduces the set SBP/DBP over the rate and pulse-pressure range.
- Ejection time follows Weissler (413 − 1.7·HR ms) within its limits.
- Without beats the pressure decays toward the filling pressure with time constant τ.
- Stroke volume depends on the preceding filling time (smaller beat after a short R–R).
- Engine: the true MAP is the waveform area, and the NIBP reads SBP, DBP and MAP within 3 mmHg of it.
- Arterial pressure at 72 bpm: a notch (local minimum) follows the end of ejection, then a rebound; the notch lies between DBP and SBP, and the set SBP/DBP still hold.
- The rebound out of the notch is smaller at 150 bpm than at 72 bpm.
- Finger volume pulse: two maxima per beat, about ΔT (Millasseau stiffness index) apart, the diastolic one lower; the trough is at end-diastole.
- Finger volume pulse without reflection: one maximum per beat.
- Engine: PR within 3 bpm of HR and PI within 15 % of the set value with reflection 0, 0.3 and 0.8, at 72 and 120 bpm, and at PI 0.3 %.

The four waveform-shape tests were also run against the v1.4.0 code and fail there, so they detect the missing notch and reflected wave.

### `tests/unit/critical.test.js` (6 tests)

Each test runs the full simulation of a scenario (40–60 s) and passes every frame after 5 s to the alarm engine with default limits.

- Pre-arrest deterioration: RR > 30, HR > 120, SpO₂ < 90 %; RR-high, SpO₂-low, HR-high and ART-SYS-low are active together, and none is high priority.
- Peri-arrest: HR < 40 and SpO₂ < 80 % give exactly two high-priority alarms (`hr:extreme`, `spo2:extreme`) on top of six medium alarms; EtCO₂ < 25. With the HR limit switched off, `hr:extreme` is not raised. The asystole scenario raises the high-priority asystole alarm.
- The extreme alarms are not raised in the bradycardia, desaturation, hypothermia and Cushing scenarios.
- Stroke: arterial systolic > 185 mmHg, regular rhythm, and only the two arterial-pressure-high alarms.
- Heart failure: warm-wet raises ART-SYS-high, SpO₂-low and RR-high; cold-wet has a proportional pulse pressure < 25 % and raises **no** alarm; cardiogenic shock raises ART-SYS-low, ART-MAP-low and SpO₂-low with MAP < 65 mmHg.
- Post-operative: opioid depression raises RR-low, EtCO₂-high and SpO₂-low with EtCO₂ > 55; shivering raises TEMP-low and shows SpO₂ < 90 % (set point 97 %) **without** the low-SQI flag; the pulmonary complication raises only SpO₂-low with RR > 24 and HR > 100.

The cold-wet and shivering checks record limitations on purpose: the monitor misses the first, and the quality index misses the artefact in the second.

### `tests/unit/ecg12.test.js` (7 tests)

- Derived lead II equals the single-lead monitor ECG to < 10⁻⁹ mV at every sample in all seven rhythm patterns (none, AF, PVC, VT, VF, asystole, SVT).
- Einthoven (I + III = II) and Goldberger (aVR + aVL + aVF = 0) hold at every sample.
- Every scaled event direction projects on lead II with value 1, and the extra VF direction projects to 0.
- Normal beat: frontal axis between +30 and +75°; R/S < 1 in V1 and > 1 in V5 and V6, rising from V1 to V3 to V5; T upright in I, II, V3–V6 and inverted in aVR; aVR mainly negative.
- Ventricular beat (VT, 70 bpm): V1 negative, V6 positive, axis +60…+100°, T opposite the QRS in II.
- The axis stays within 5° of its reference at 40–200 bpm and QRS width 0.8–1.5×; it is undefined (NaN) in VF and asystole.
- Engine: 12 rings filled; the 12-lead lead II ring equals the monitor ECG ring sample for sample; all 12 are NaN while the electrode contact is 5 %.

### `tests/unit/usecases.test.js` (9 tests)

- Predicted body weight: 180 cm male 75.12 kg, 165 cm female 56.97 kg, 152.4 cm male exactly 50 kg; null when sex is unspecified or height is invalid.
- Tidal volume 6 mL/kg × 75.12 kg = 451 mL; 30 mL/kg × 70 kg = 2100 mL; 0.5 mL/kg/h × 70 kg = 35 mL/h; null for invalid weight.
- Tanaka maximal heart rate: 180 bpm at 40 years, 159 bpm at 70 years.
- Shock index 72/120 = 0.6; null when SBP is 0 or HR is missing. Age × SI is no longer exported (removed 2026-10-29).
- BSA at 70 kg, 172 cm: Mosteller 1.829, Du Bois 1.825, Haycock 1.834 m²; null for weight 0.
- Maximal heart rate at age 60: Tanaka 166, Gellish 165, Fox 160 bpm; null for a negative age.
- QTc: all four formulas give 400 ms for QT 400 ms at RR 1 s. QT 360 ms at RR 0.6 s gives Framingham 421.6 and Hodges 430 ms; Bazett at RR 0.64 s gives 450 ms; RR outside 0.3–2 s gives null; an unknown formula falls back to the default.
- Engine QT at 50, 72 and 120 bpm: Framingham QTc of the model QT is 400 ± 1 ms; Bazett QTc is above 420 ms at 120 bpm. VF, asystole and VT give no QT.
- Age-typical BP: male 20 y 119/70 (held flat), unspecified 28.5 y 115/69, female 49.5 y 122/74, male 60 y 129/73 (interpolated), female 90 y 139/68 (held flat), null below 18 y. For every sex SBP rises from 30 to 50 to 75 y, DBP falls from 50 to 75 y and pulse pressure widens.

Browser checks of the use cases (2026-10-28, local preview): switches default to calculators on, shock index on, age BP off; switching each off hides its cards or row and is kept after reload. Male 180 cm shows PBW 75.1 kg and tidal volume 451 mL; sex unspecified at 172 cm shows both values (63.3 and 67.8 kg). With age BP on, age 40 male gives 122/74, age 75 gives 133/69, age 30 via the Controls tab 119/71, and a later manual SYS of 150 is kept. With the switch off, changing age leaves the blood pressure unchanged. The hypotension scenario loads 82/48 unchanged; after an NIBP the tile shows SI 0.88 (highlighted). (Age × SI was also shown then; it was removed on 2026-10-29.)

### `tests/unit/channels.test.js` (14 tests)

Waveform audit fixtures (`SIMULATION_AUDIT.md` §9a). Noise sources off unless stated; fixed seeds.

- ECG at 120 bpm: model R–R 0.500 s ±2 ms, detector R–R ±12 ms, HR ±1 bpm.
- ECG HR change 72 → 40 and 72 → 140 bpm: no sample step above 1.25 × the steady step + 0.02 mV.
- Arterial fit: 120/80, 160/95, 90/55 mmHg within ±1.5 mmHg.
- Line damping: MAP within ±1.5 mmHg; under-damped SBP > reference + 8; over-damped SBP < reference − 5 and DBP > reference + 1 mmHg.
- Arterial line after a change of HR (120, 40), SBP (150) or DBP (60): no sample step above 1.5 × the steady step + 1 mmHg.
- `pat_ms` 150 and 300 ms: arterial foot within ±12 ms of R + PAT; pleth foot 0–40 ms after the arterial foot (−8 ms allowed for detection).
- EtCO₂ mean over seeds 1–4 within ±0.3 mmHg of the set value at RR/EtCO₂ 12/38, 30/24 and 8/55; awRR within ±0.5 /min.
- CO₂ half-rise 0–0.8 s after the impedance peak; impedance cycle 5.00 ± 0.02 s at RR 12.
- NIBP stop during deflation: state `cancelled`, cuff 0 mmHg, no NIBP-failed flag, last reading kept, a new start accepted.
- Sensor dropout: NaN in the sample rings; estimated numerics finite or null.
- Reset and chunked advance (625 × 16 ms): identical to a fresh run.
- Renderer (stub canvas in a `vm` sandbox): 1 mV = 10 mm and 1 s = 25 mm in pixels; arterial optimum range brackets the trace with ≥ 5 mmHg padding and ≥ 40 mmHg span and is stable over 8 redraws; NaN drawn as hatched gaps; all points inside the canvas at 320 × 60, 800 × 160 and 1920 × 300 px; sweep width = canvas width / 25 mm/s.

On commit c914f9a (before the fixes) the arterial-step, EtCO₂ and NIBP-stop tests fail (arterial step 17.7 against a limit of 4.9 mmHg; EtCO₂ mean 38.36 mmHg at a set 38, outside ±0.3; NIBP state `failed`).

### `tests/unit/cuffcycle.test.js` (3 tests)

The cuff strip between measurements (`SIMULATION_AUDIT.md` §9a, row 6). Quiet patient at 120/80.

- The result keeps its cycle at 100 Hz with a valid deflation index; the peak is within 5 mmHg of the inflation target; the cycle lasts 20–60 s; an older result drops its trace when a new one completes.
- The deflating cuff passes SYS, MAP and DIA in that order, within ±1 mmHg of the reported values. No oscillation is shown before deflation. Peak-to-trough oscillation within ±0.5 s of SYS and DIA is 0.4–0.85 of that at MAP.
- Renderer (stub canvas in a `vm` sandbox) at 340 × 160, 800 × 170, 1600 × 170 and 900 × 110 px: the comparison line starts with the NIBP reading and, from 800 px, also shows ART, NIBP − ART and the set values; SYS, MAP and DIA labels; pressure ticks at 50 and 100 mmHg (at least three ticks at 110 px); time ticks; a band gain of 1, 2 or 5 × 10ⁿ with a mmHg scale bar; every text and point inside the canvas. A failed result reads "Failed: …".

### `tests/unit/community.test.js` (12 tests)

Community scenarios (`src/core/community.js`, `tools/community-scenario.js`).

- A well-formed submission passes and gets the id `c-<slug>`.
- Refused: unknown parameters, display/processing settings, wrong types, values the simulator would clamp, diastolic not 10 mmHg below systolic, values equal to the baseline, unknown options, empty changes, unknown fields.
- Text fields: length limits, required source, no `<`, `>`, backticks or control characters.
- Duplicates of an existing scenario are refused by settings and by name (case-insensitive).
- `changesFrom` leaves out display settings and, unless asked, the patient profile.
- The issue URL opens the `scenario.yml` template with the title and the JSON in the form field; it stays under 8000 characters.
- The issue body parser reads the first JSON block and reports bad JSON.
- Collection: unique ids (`-2` suffix), a second entry for the same issue is refused, an invalid author is refused, `toScript` round-trips.
- `register` adds valid entries as community presets with no references and skips broken ones; a registered entry counts for the duplicate check; registering again adds nothing.
- Action tool, `check`: both consent boxes are required; a parameter name containing a code fence and an `@` mention produces a comment with only the opening and closing fence and no mention line.
- Action tool, `add`: run as a child process on the real `community/` files, it adds one entry with the author and the issue number, writes the script and the comment, refuses the same issue a second time, and restores the files.
- The shipped list is valid and `scenarios.js` equals the script generated from `scenarios.json`.

## 7. Defects found and fixed during testing

Defects found in the removed device code are not listed here.

| Defect | Cause | Fix |
|---|---|---|
| Browser kept running old JavaScript after edits | Cached files | Tests served with `Cache-Control: no-store` |
| Reset said limits were restored, but they were not | Reset did not call the alarm engine's restore function | Reset now restores the default limits |
| Waveform defects found in the second 2026-10-29 pass (arterial step on parameter change, EtCO₂ noise bias, hidden PAT, NIBP stop counted as a failure, page wider than a phone screen) | See `SIMULATION_AUDIT.md` §9a | See `SIMULATION_AUDIT.md` §9a |
| Android app blocked the link to the repository's own front page | The allow-list checked only paths below `/Hafij-BGE/patient-monitoring/` | It now accepts the repository path itself or a path below it |
| A failed push in the approval workflow could still be reported as "added" | The reply step looked only at the tool's result | The push step has its own outcome; the reply reports a failed push with the run link and removes `approved` |
| The `add` unit test assumed an empty community list | Written before the workflow ran the tests after adding an entry | The test counts relative to the current list and uses a unique name |
| Model errors found in the 2026-10-29 audit (AF HR read 75–85 at a set 110, TP baseline below zero, SpO₂ read from noise in VF, hypotension MAP on the alarm limit, filter label above Nyquist, type 1 glucose effectiveness, and others) | See `SIMULATION_AUDIT.md` | See `SIMULATION_AUDIT.md`, one section per model |

## 8. Not tested and known limitations

- **No real watch, heart-rate sensor or Health Connect store** was used. The Android app (`android/`) has not been tested on a phone. Its three watch routes (Health Connect, native BLE Heart Rate Service, export file) and the native save dialog for exports have not been tested on a device, and the Heart Rate Measurement parser is checked only against packets built from the Bluetooth SIG specification. Consumer wearable readings are not clinical measurements.
- **Page-side Android bridge** (`src/devices/androidBridge.js`, `src/ui/androidPanel.js`) is checked only with unit tests and a mock `PMAndroid` object in a desktop browser.
- **Rhythm analysis** is checked only on the simulator's own patterns, not on recorded ECGs.
- **Website:** the GitHub Pages workflow runs the unit tests before deploying. The live site at https://hafij-bge.github.io/patient-monitoring/ was not part of the testing described here.
- **`file://`** was checked statically only (section 5).
- Browsers other than Chromium were not tested.
- **Community scenario workflow** (`.github/workflows/community-scenarios.yml`): not yet run on GitHub (section 4.4). Approval is limited to users with write access; this check runs only on GitHub.
- **Desktop builds after the waveform audit:** the Linux `.deb` (1.4.0 version string, current source) was built with `desktop/build-deb.sh` and started once. Through the DevTools protocol after 7.8 s it showed HR 71, SpO₂ 97, ART 119/74, EtCO₂ 38, RR not yet reported, and all six waveform canvases drawn. Xvfb is no longer installed on the build PC, so this run used the desktop session, not a virtual display. The browser self-test was not run inside this package. The Windows `.exe` is built only by the GitHub Actions workflow and was not built or run for this pass; no Windows build has been started on a real Windows PC.
- Model limitations observed during testing are listed in `TECHNICAL_REPORT.md` section 9: NIBP fails at motion ≥ 20 %, SpO₂ is biased toward about 85 % under motion, and the QRS detector has no search-back. Found while adding the new scenarios: in the atrial-fibrillation scenario (set HR 110) the displayed HR was about 75–85 bpm, because short beats had a smaller QRS that the detector missed; this was fixed in the simulation audit (`SIMULATION_AUDIT.md` §2). Not fixed: the low-SQI flag does not catch strong motion (0 flagged frames in 90 s for the motion and shivering scenarios).

## 9. How to repeat

```bash
node --test tests/unit/*.test.js
```

ECG intervals (P, PR, QRS, QT at 50–150 bpm, see TECHNICAL_REPORT §3.1):

```bash
node tests/tools/ecg-intervals.js
```

Then open `index.html?selftest=1` (from a local server such as `python3 -m http.server 8766`, from the website, or directly) and compare the Tests tab with section 3. Expected: 16 pass, 0 fail, 1 not run. Values can differ slightly between browsers, but each must stay within the stated tolerance.
