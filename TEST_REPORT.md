# Test Report

PM-SIM, Patient Monitor Simulator. Tests run on 2026-10-28.

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

## 1. Summary

| Test level | Result |
|---|---|
| Node unit and integration tests (`node --test tests/unit/*.test.js`) | **71 tests, 71 pass, 0 fail** |
| Browser self-test (`index.html?selftest=1`) | **15 entries: 13 pass, 0 fail, 2 not run** (hardware) |
| Manual interaction checks in a browser | 17 checks, all as expected (section 4) |
| Hardware tests (real BLE device; live HL7 feed from a real monitor, central station or gateway; real serial device) | **Not run.** No hardware was available. |
| MLLP listener inside the packaged desktop app | **Not run.** Headless Electron crashes on this machine (exit code 139). The listener module was tested in Node (section 6). |
| Desktop builds | Linux `.deb` and Windows `.zip` built on Linux. Windows installer and portable `.exe`: CI workflow written, **not run**. No build was started on Windows. |
| Opening from `file://` | Checked statically only (section 5) |

## 2. Environment

- Linux, Node.js v24.22.0.
- Browser checks: the Chromium-based browser pane of the Claude desktop app, loading the app from a local no-cache HTTP server (`http://localhost:8766/`).
- No Bluetooth health device was connected. A 15 s LE scan found 21 advertisers, none advertising a standard health service.
- No serial device and no hospital monitor, central station or HL7 gateway were available.
- Desktop packaging: Electron 42 and electron-builder 26 via pnpm. Wine and `makensis` are not installed, so the Windows installer cannot be built on this machine.

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
| 10 | BLE packet replay through the GATT parsers | Truncated packet rejected; NaN temperature stored as missing; all values flagged synthetic | 138 packets, 1 parse error, 247 observations, NaN temp missing: true | pass |
| 11 | Real BLE health device | Live readings from a standard-profile device | **not run**: no hardware available | not run |
| 12 | HL7 v2 ORU^R01 import (PCD-01 style): two synthetic messages for bed `ICU^01^01`, each with a test PID segment; the second has SBP/DBP in kPa, temperature in °F and a respiratory rate without a value | kPa and °F converted to mmHg and °C; empty OBX-5 stored as missing; identity segments not stored; values flagged synthetic | 17 observations; sbp 123.0 mmHg, temp 37.22 °C, rr missing | pass |
| 13 | HL7 bed filter and MLLP framing/ACK: 8 feed messages, 2 of them for bed `ICU^01^02`, filter set to `ICU^01^01`; then a stream of junk, one framed message and a partial frame | Messages for another bed dropped; framed message recovered; ACK carries MSA\|AA and the control ID | 2 of 8 dropped; 1 framed message(s); ACK MSA\|AA\|FEED0001 | pass |
| 14 | FHIR R4 Bundle and SDC MDIB import: synthetic Bundle with a BP panel and an RR observation with `dataAbsentReason`; synthetic MDIB with SpO₂ of questionable validity and an empty temperature metric | BP panel split into SBP/DBP/MAP; dataAbsentReason stored as missing; SDC questionable validity flagged low-quality | FHIR 9 observations (rr missing: true); SDC 8 observations, spo2 low-quality | pass |
| 15 | Live HL7 feed from a real monitor or gateway | ORU^R01 messages arrive over MLLP or serial and are acknowledged | **not run**: no hardware available | not run |

Tests 11 and 15 are reported as "not run" by design. The code never marks a hardware test as passed without hardware. Tests 12–14 use synthetic messages generated by `src/devices/samples.js`; they test the parsers, not a device.

## 4. Manual interaction checks

Performed by driving the running app in the browser pane.

| Check | Expected | Observed |
|---|---|---|
| Select the Tachycardia preset | Message names the changed control; HR tile and alarm follow | Message "Changed: Heart rate"; HR alarm shown in the alarm bar as MEDIUM priority |
| Start NIBP at baseline | Cuff inflates and deflates, oscillogram drawn, row added to the table | Completed at 121/83 mmHg (MAP osc. 94), MAP formula 96, PP 37; table row "46 121 83 94 96 120/80 ok" |
| Manual entry: temperature 99.5 °F | Converted and stored as user data | Stored as 37.5 °C, source `user` |
| Import `mini.csv` (test file with one bad value and empty cells) | Valid values accepted, bad value listed, empty cells not stored | 6 accepted, 1 invalid ("not a number: "abc""), 2 empty cells; headers mapped |
| Trends with simulated and device data | Sources drawn separately, gaps visible | simulated n = 37 with 3 missing and 1 gap, shown beside device n = 40 |
| Reset | Simulation and alarm limits back to defaults; simulated/derived data cleared; imported, device and user data kept | As expected |
| Alarm limits table | One row per limited parameter | 7 rows |
| Layout at 375 px width | No horizontal overflow | No overflow |
| Browser console during all checks | No errors | No errors |
| Devices tab in a browser without Web Bluetooth | Clear message, connect button disabled | Message shown, button disabled |
| Packet replay | Rows labelled SYNTHETIC, values stored as `device` with replay provenance | As expected |

Hospital device integration checks, 2026-10-28, app served from `http://localhost:8766`:

| Check | Expected | Observed |
|---|---|---|
| Device-type picker on the Devices tab | 12 device classes listed | 12 classes listed |
| Select "Central station" in the browser | MLLP route shown as unavailable with the reason (browser cannot open a TCP port); file and feed routes available | MLLP unavailable (browser); HL7 file, FHIR file and synthetic feed available |
| HL7 v2 file route: **Load synthetic example** | Values imported, the empty respiratory-rate result reported as missing | 16 values imported, 1 missing |
| Synthetic HL7 feed with **Accept HL7 messages for this bed only** ticked, bed `ICU^01^01` | 20 messages played; the 5 messages for `ICU^01^02` dropped | "Finished: 20 messages, 5 dropped by the bed filter." |
| SDC file route: **Load synthetic example** | Values imported, the empty metric reported as missing | 7 imported, 1 missing |
| Browser console during these checks | No errors | No errors |

## 5. Offline and `file://` operation

The page was not opened from `file://` in a browser during this session. The local Chromium-based browser available here (a snap package) could not read files under `/tmp` or `/mnt` because of its sandbox, and the browser pane cannot open `file://` URLs. Instead the following was checked statically:

- The Content Security Policy allows `file:` for scripts, styles and images, and sets `connect-src 'none'`.
- All script and style paths in `index.html` are relative.
- No `type="module"` scripts are used (module scripts are blocked from `file://` in Chromium).
- No `fetch` or XHR call is needed at start-up. Files are read with `FileReader` only after the user picks them.

When served over `http://localhost`, the app made no network requests other than loading its own files.

## 6. Node unit and integration tests

71 tests in 6 files. Section numbers (§19.x) refer to the acceptance checks of the project prompt.

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

### `tests/unit/devices.test.js` (13 tests)

- IEEE 11073 SFLOAT and FLOAT decoding, including special values.
- Heart Rate Measurement 0x2A37: uint8/uint16, contact, energy, RR intervals.
- PLX continuous 0x2A5F and spot-check 0x2A5E with status words.
- Blood Pressure Measurement 0x2A35: mmHg and kPa, pulse, user, status bits.
- Temperature 0x2A1C (°C/°F, site) and Weight 0x2A9D (kg/lb, BMI, height, failure).
- Encoders round-trip through the parsers for every profile.
- Device packets become `device` observations with provenance and status-based quality.
- Packet replay is labelled synthetic and exercises errors and missing values.
- Web Bluetooth availability needs a secure context and the API.
- Connect: chooser filters, device information, battery, notifications → observations (with a mock `navigator.bluetooth`).
- A cancelled chooser is reported, not thrown.
- An unexpected disconnect reconnects with 1-2-4-8-16 s backoff; a user disconnect does not.
- A device without any supported profile is reported, not silently accepted.

The Web Bluetooth tests use a mock of the browser API. They test the connector logic, not a radio link.

### `tests/unit/hospital.test.js` (14 tests)

Uses the fixtures `fixtures/hl7_oru_pcd01.hl7`, `fixtures/fhir_vitals_bundle.json` and `fixtures/sdc_mdib.xml`, which are synthetic and contain no real patient data.

- MDC lookup: reference-identifier text, numeric code and LOINC.
- HL7 fixture: units converted, missing kept, identity not stored, synthetic flag.
- HL7 timestamps: OBX-14 with a UTC offset parsed to UTC.
- The HL7 parser rejects a message without MSH.
- MLLP deframing: junk dropped, partial frame kept, ACK echoes the control ID.
- Bed filter: feed messages for the other bed are rejected.
- FHIR fixture: BP panel split, `dataAbsentReason` stored as missing, `subject` ignored.
- FHIR: `entered-in-error` skipped, bad JSON reported.
- SDC fixture: validity mapped to quality, empty metric stored as missing.
- The SDC parser refuses DOCTYPE and entity declarations.
- Serial framer: plain CR-separated text split on MSH and flushed when idle; MLLP used once VT is seen.
- Format detection and the `importAny` report.
- Catalogue: a browser-only page cannot offer MLLP; file routes always work.
- MLLP server: receives a framed message on 127.0.0.1 and answers AA.

The MLLP server test runs `electron/mllpServer.cjs` in Node with a real TCP socket on the loopback interface. It does not run inside Electron.

## 7. Defects found and fixed during testing

| Defect | Cause | Fix |
|---|---|---|
| Self-test 10 failed although replay worked | The test expected `provenance.replay === true`, but the field holds a descriptive string | Test checks that the field is present |
| Browser kept running old JavaScript after edits | Cached files | Tests served with `Cache-Control: no-store` |
| Reset said limits were restored, but they were not | Reset did not call the alarm engine's restore function | Reset now restores the default limits |

## 8. Not tested and known limitations

- **No real Bluetooth device** was connected. The parsers are tested against packets built from the specification and against the synthetic replay, not against a commercial device.
- **No real hospital device** (bedside monitor, central station, gateway, capnograph, ventilator) was connected, and no real serial device. The HL7, FHIR and SDC parsers are tested only against synthetic messages written from the published standards. Compatibility with any specific device model is not verified. See `DEVICE_INTEGRATION_REPORT.md`.
- **MDC numeric codes:** only the seven marked `checked: true` in `src/devices/mdc.js` were cross-checked against published values.
- **MLLP listener inside the packaged desktop app** was not exercised: headless Electron exits with code 139 (segmentation fault) on this machine. The listener was tested in Node only.
- **Windows:** the NSIS installer and portable `.exe` were not built, because the CI workflow `.github/workflows/windows.yml` has not been run (the project is not yet in a git repository). The Windows `.zip` was built on Linux but was not started on Windows.
- **`file://`** was checked statically only (section 5).
- Browsers other than Chromium were not tested.
- Model limitations observed during testing are listed in `TECHNICAL_REPORT.md` section 9: NIBP fails at motion ≥ 20 %, SpO₂ is biased toward about 85 % under motion, the DIA-low alarm can be missed in the low-blood-pressure preset, and the QRS detector has no search-back.

## 9. How to repeat

```bash
node --test tests/unit/*.test.js
```

Then open `index.html?selftest=1` (from a local server or directly) and compare the Tests tab with section 3. Values can differ slightly between browsers, but each must stay within the stated tolerance.
