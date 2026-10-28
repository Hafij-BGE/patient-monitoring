# PM-SIM: Patient Monitor Simulator

Homework 2, *Interactive Medical Device Simulator*. Assigned device: multiparameter bedside **patient monitor**.
Author: Md. Hafijur Rahman (BME master's programme, Dokuz Eylül University). Built with Vibe Coding (see `VIBE_CODING_PROMPT.md`).

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

PM-SIM simulates the signals a bedside monitor acquires: ECG, pulse oximetry (red/IR photoplethysmogram), impedance respiration, oscillometric non-invasive blood pressure (NIBP) and temperature. It then runs simplified versions of the monitor's own estimators on those signals: a QRS detector, the ratio-of-ratios SpO₂ estimate, the oscillometric envelope and a breath detector. Each numeric is shown next to the set point that generated it, so the measurement error is visible.

The app can also hold real data next to the simulation, kept strictly separate from it:

- files exported from devices or apps (CSV or JSON),
- values typed in by hand,
- live readings from Bluetooth LE health devices that use the standard Bluetooth SIG profiles (heart rate, pulse oximeter, blood pressure, thermometer, weight scale),
- hospital-style device data: HL7 v2 ORU^R01 messages (IHE PCD-01 style) received over an MLLP/TCP listener (desktop app) or a serial port, and HL7 v2, FHIR R4 or IEEE 11073 SDC files.

Real data is never used to drive the simulation. For example, the ECG is never generated from a heart rate received from a device. Device integration is described in `DEVICE_INTEGRATION_REPORT.md`.

## How to run

The browser version needs no installation, no build step, no network access and no backend.

1. **Directly in a browser:** open `index.html` in a current browser (Chrome, Edge, Firefox, Safari). Everything works from `file://` except Web Bluetooth, Web Serial and the MLLP listener.
2. **With a local server** (needed for Web Bluetooth and Web Serial, which require a secure context):

   ```bash
   python3 -m http.server 8000
   ```

   Then open `http://localhost:8000/`. Web Bluetooth and Web Serial work only in Chromium-based browsers (Chrome, Edge). Firefox and Safari do not support them. Brave may have Web Bluetooth turned off by default. A web page cannot open a TCP port, so the HL7 MLLP listener is available only in the desktop app.
3. **Desktop app, Linux:** install `release/PM-SIM-1.0.0-amd64.deb` (for example `sudo apt install ./release/PM-SIM-1.0.0-amd64.deb`) and start *PM-SIM* from the application menu. The desktop app (Electron) serves the same page from `app://pm-sim/`, which is a secure context, and adds the MLLP listener and serial-port and Bluetooth chooser dialogs.
4. **Desktop app, Windows:** unzip `release/PM-SIM-1.0.0-win-x64.zip` and run `PM-SIM.exe`. An installer (`PM-SIM-1.0.0-setup-x64.exe`) and a portable `PM-SIM-1.0.0-portable-x64.exe` can be built as described below. The executable is not code-signed, so Windows SmartScreen will show a warning on first start.

### Building the desktop app

Requires Node.js and pnpm (`pnpm install` once).

| Command | Output | Notes |
|---|---|---|
| `pnpm run build:deb` | `release/PM-SIM-1.0.0-amd64.deb` | Linux x64 |
| `pnpm run build:win` | `release/PM-SIM-1.0.0-win-x64.zip` | Windows x64; built on Linux |
| `pnpm run build:win-installer` | `PM-SIM-1.0.0-setup-x64.exe` (NSIS installer) and `PM-SIM-1.0.0-portable-x64.exe` | Needs Windows, or Wine and `makensis`, which the development machine does not have |

`.github/workflows/windows.yml` builds the installer, the portable executable and the zip on a `windows-latest` GitHub Actions runner after running the unit tests. It runs on manual dispatch or on a `v*` tag. The project is not yet in a git repository, so this workflow has **not been run**.

Useful URL options:

- `index.html?selftest=1` opens the Tests tab and runs the browser self-test.

Keyboard: `Space` toggles run/pause.

## Unit tests

Requires Node.js 18 or later. No packages to install.

```bash
node --test tests/unit/*.test.js
```

Current result: 71 tests, 71 pass. Details are in `TEST_REPORT.md`.

## Features

| Area | What it does |
|---|---|
| Monitor | Four sweeping waveforms (ECG, pleth, respiration, cuff pressure) and numerics tiles for HR, SpO₂ (with SQI and PI), pulse rate, NIBP (SYS/DIA, oscillometric MAP, formula MAP, pulse pressure), RR and temperature. Each tile shows the set point and a source badge. |
| Controls | 44 validated controls in three groups: physiology, sensor and processing. Each has a label, a unit, a range and a short explanation. Invalid input is rejected with a message, for example DIA ≥ SYS. |
| Presets | 15 teaching scenarios: baseline, tachycardia, bradycardia, irregular timing, desaturation, low and high blood pressure, fast and slow breathing, temperature elevation, sensor disconnection, motion artifact, noisy ECG, missing observations and apnea. |
| Run control | Run/pause, playback speed (0.25–4×), freeze, reset (also restores default alarm limits) and a PNG snapshot that carries the educational notice. |
| NIBP | Manual start and stop, or an automatic interval. The live cuff-pressure trace, the oscillogram with the detected points, and a results table. |
| Alarms | Limits and delays for 7 parameters, apnea, and 9 technical conditions. Physiological and technical alarms are kept apart, with priorities, acknowledge, a 2-minute audio pause with countdown, history and CSV export. Optional Web Audio tones. |
| Trends | Any parameter from any source over a chosen window. Gaps and missing values are drawn as breaks, never as zeros. Pause, PNG, CSV and summary statistics. |
| Patient profile | Age, sex, height and weight, with BMI and BSA (Mosteller). Adult BMI categories are applied only from age 20. Weight history with change. |
| Data | CSV/JSON import (HL7 v2, FHIR R4 and SDC XML files are detected automatically) (wide or long tables, unit conversion, time zones, missing tokens, duplicates and conflicts), manual entry, CSV/JSON export by source and a waveform CSV export. |
| Devices | Device-type picker with 12 generic device classes (bedside monitor, central station, pulse oximeter, capnograph, ventilator and others), each listing its typical routes with an available/unavailable badge for the current runtime. Bed/location field (HL7 PV1-3) with an optional bed filter. Routes: HL7 v2 over MLLP (desktop app), HL7 v2 over serial (Web Serial), Bluetooth LE standard profiles (Web Bluetooth) with a synthetic packet replay, HL7 v2/FHIR R4/SDC file import with synthetic examples, and a synthetic HL7 feed from a two-bed central station. A message log shows every received message. Details in `DEVICE_INTEGRATION_REPORT.md`. |
| Device parameters | Values from devices and files may also include invasive arterial pressure (systolic, diastolic, mean) and EtCO₂. These are not simulated; they are shown in Trends and the message log. |
| Tests | Browser self-test: 13 automated scenarios plus 2 hardware tests (real BLE device, live HL7 feed) that are always reported as "not run" when no hardware is present. |

## Data provenance

Every value the app stores is an *observation* with:

- a **source**: `simulated`, `derived`, `device`, `imported` or `user`,
- a **quality** flag: `ok`, `low-quality`, `missing`, `invalid` or `artifact`,
- a unit, a timestamp and a **provenance** record (method, set point, file name, device, and so on).

A missing value is stored as `null` with quality `missing`. It is never stored as 0. Series from different sources are never merged. Live device routes store `device`; device files store `imported`. Packet-replay and synthetic-feed data, and any message the sender marks as test data (HL7 processing ID `T` or `D`, FHIR `HTEST`, SDC mode `Test` or `Demo`), carry `provenance.replay` and are labelled SYNTHETIC in the interface.

## Project structure

```
index.html              single page, loads plain <script> files (no modules, works from file://)
css/                    styles
src/core/               observation model, units, patient profile, observation store
src/sim/                parameters and presets, RNG, DSP, ECG, pulse, sensors, NIBP, detectors, engine
src/alarms/             alarm engine
src/data/               CSV reader, importer (mapping, units, timestamps, validation)
src/devices/
  gatt.js               Bluetooth SIG characteristic parsers, IEEE 11073-20601 SFLOAT/FLOAT
  webBluetooth.js       Web Bluetooth connector
  replay.js             synthetic BLE packet replay
  mdc.js                ISO/IEEE 11073-10101 MDC, LOINC and UCUM code and unit tables
  hl7v2.js              HL7 v2 ORU^R01 parser (IHE PCD-01 style), MLLP framing, ACK
  fhir.js               FHIR R4 Observation/Bundle import
  sdc.js                IEEE 11073-10207 SDC MDIB XML import
  webSerial.js          Web Serial receiver and HL7 stream framer
  samples.js            synthetic HL7/FHIR/SDC examples and the scripted HL7 feed
  catalog.js            device classes, routes, availability, format detection
src/ui/                 canvas waveforms and trends, panels, data and device tabs, self-test, app wiring
electron/
  main.cjs              desktop shell: app://pm-sim origin, Bluetooth and serial choosers, MLLP IPC
  preload.cjs           exposes window.PMDesktop.mllp to the page
  mllpServer.cjs        HL7 MLLP TCP listener (receive only, ACK)
.github/workflows/
  windows.yml           Windows installer/portable/zip build on GitHub Actions (not yet run)
tests/unit/             Node unit and integration tests (node --test), including hospital.test.js
fixtures/               synthetic import files, GATT packets, hl7_oru_pcd01.hl7, fhir_vitals_bundle.json,
                        sdc_mdib.xml (see fixtures/README.md)
```

The simulation, alarm, data and device-parser modules do not touch the DOM. They load in the browser as `window.PM.*` and in Node through `require`, so the same code is tested in both places.

## Documents

| File | Content |
|---|---|
| `TECHNICAL_REPORT.md` | Models, equations, assumptions, architecture, alarms, limitations |
| `REFERENCES.md` | Sources and what each one supports |
| `TEST_REPORT.md` | Test scenarios, expected and observed results, what was not tested |
| `DEMO_SCRIPT.md` | Step-by-step demonstration (about 9 minutes) |
| `DEVICE_INTEGRATION_REPORT.md` | Device classes, connection routes and standards, code mapping, privacy, test evidence |
| `VIBE_CODING_PROMPT.md` | The prompts used to build the app |
| `PLAN.md` | Implementation plan and environment notes |

## Privacy and safety

- The page makes no network requests. Its Content Security Policy sets `connect-src 'none'` and loads scripts and styles only from the page's own folder.
- Imported files are read in the browser tab and are not uploaded anywhere.
- The desktop app's MLLP listener only receives. It binds to `127.0.0.1` unless the user chooses all interfaces (with a warning that MLLP has no encryption or login), and it never connects out.
- Patient identity segments and resources (HL7 PID/PD1/NK1, FHIR Patient and other person resources) are never stored; only a count is reported.
- Only vendor-neutral published standards are used. No proprietary protocol is reverse-engineered.
- No measurement data is saved between sessions. Reloading the page clears all data. Only two settings, the chosen device type and the bed/location, are remembered in the browser's `localStorage`.
- PM-SIM is an original educational design. It does not reproduce the interface of any monitor manufacturer.
- It is not a medical device, has not been validated, and must not be used for diagnosis or patient monitoring.
