# PM-SIM: Patient Monitor Simulator

Homework 2, *Interactive Medical Device Simulator*. Assigned device: multiparameter bedside **patient monitor**.
Author: Md. Hafijur Rahman (BMT master's programme, Dokuz Eylül University). Built with Vibe Coding (see `VIBE_CODING_PROMPT.md`).

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

PM-SIM simulates the signals a bedside monitor acquires: ECG (with teaching arrhythmias), pulse oximetry (red/IR photoplethysmogram), invasive arterial pressure (ART), impedance respiration, capnography (CO₂), oscillometric non-invasive blood pressure (NIBP) and temperature. It then runs simplified versions of the monitor's own estimators on those signals: a QRS detector with a rhythm classifier, the ratio-of-ratios SpO₂ estimate, the oscillometric envelope, a breath detector, end-tidal CO₂ detection and arterial SYS/DIA/MAP. Each numeric is shown next to the set point that generated it, so the measurement error is visible.

The app can also hold real data next to the simulation, kept strictly separate from it:

- files exported from devices or apps (CSV or JSON tables),
- values typed in by hand,
- in the **Android app only**: readings from a watch or other wearable, through Android Health Connect, a Bluetooth LE heart-rate sensor (Heart Rate Service 0x180D) or a health-app export file. The Android app is still in development and has not been tested with real hardware (see `DEVICE_INTEGRATION_REPORT.md`).

Real data is never used to drive the simulation. For example, the ECG is never generated from a heart rate received from a watch.

## How to run

PM-SIM needs no installation, no build step, no network access after loading and no backend. All computation happens in the browser tab.

1. **Website:** open https://hafij-bge.github.io/patient-monitoring/ in a current browser (Chrome, Edge, Firefox, Safari). It is the same page as the app, published as a static site on GitHub Pages by `.github/workflows/pages.yml` (the workflow runs the unit tests, copies `index.html`, `css`, `src` and `fixtures` to `_site` and deploys). The page makes no network requests of its own (Content Security Policy `connect-src 'none'`).
2. **Locally with a server:**

   ```bash
   python3 -m http.server 8766
   ```

   (also `npm start`, see `package.json`), then open `http://localhost:8766/`.
3. **Directly from the file:** open `index.html` in a browser. This works from `file://` because the page uses plain scripts and no network calls.
4. **Android app (in development):** `android/` holds a WebView wrapper (package `edu.deu.pmsim`, version 1.3.0) that loads the same web page from the app's own assets. It is the **only** place where real watch data enters the app, through three routes: Android Health Connect (read with the user's permission), native Bluetooth LE Heart Rate Service 0x180D, and import of a health-app export file. The app is still being built and **nothing has been tested with real hardware**. Build notes are in `android/README.md`. 
5. **Linux desktop app (.deb):** `desktop/` holds a small Electron shell that shows the same page from inside the package (no preload, no device access, same CSP). `desktop/build-deb.sh` builds `release/PM-SIM-1.3.0-amd64.deb`; install with `sudo apt install ./PM-SIM-1.3.0-amd64.deb` and start **PM-SIM** from the application menu.
6. **Windows desktop app (.exe):** the same Electron shell, built on a GitHub Windows runner by `.github/workflows/windows.yml` (run it by hand with a release tag). It adds an NSIS installer, a portable `.exe` and a `.zip` to that release. The files are not code-signed, so Windows SmartScreen shows a warning.

Useful URL options:

- `index.html?selftest=1` opens the Tests tab and runs the browser self-test.

Keyboard: `Space` toggles run/pause.

Tabs: Controls, NIBP, Alarms, Trends, Glucose, Signal chain, Lessons, Data import/export, Profile, Science, Tests, References.

## Unit tests

Requires Node.js 18 or later. No packages to install.

```bash
node --test tests/unit/*.test.js
```

Current result: 86 tests, 86 pass. Details are in `TEST_REPORT.md`.

## Features

| Area | What it does |
|---|---|
| Monitor | Six sweeping waveforms (ECG, pleth, arterial pressure 0–200 mmHg, respiration, CO₂ 0–60 mmHg, cuff pressure) and numerics tiles for HR (with rhythm label and PVC/min), SpO₂ (with SQI and PI), pulse rate, ART (SYS/DIA and MAP), EtCO₂ (with FiCO₂ and airway RR), NIBP (SYS/DIA, oscillometric MAP, formula MAP, pulse pressure), RR and temperature. Each tile shows the set point and a source badge. The layout adapts to narrow screens and phones. |
| Controls | 62 validated controls in five groups: patient profile, physiology, glucose and insulin, sensor and processing. Each has a label, a unit, a range and a short explanation (hover the name, or tick *Show explanations*). **Simple** view shows 11 main controls (HR, arrhythmia, SYS, DIA, SpO₂, RR, EtCO₂, temperature, motion, SpO₂ probe state, NIBP interval) plus any control the scenario changed or an alarm points to; **Advanced** shows all 62. Invalid input is rejected with a message, for example DIA ≥ SYS. |
| Presets | 50 teaching scenarios. A scenario sets every patient, physiology and sensor control (its own values, all others at default); editing any of them by hand shows **Custom (edited)**. 25 simple scenarios: baseline, tachycardia, bradycardia, irregular timing, desaturation, low and high blood pressure, fast and slow breathing, temperature elevation, sensor disconnection, motion artifact, noisy ECG, missing observations, apnea, atrial fibrillation, PVCs, ventricular tachycardia, ventricular fibrillation, asystole, hypoventilation, bronchospasm, rebreathing, under-damped arterial line and transducer height error. 25 combined-sign patterns from the literature, each with its sources (REFERENCES.md entries 28–44, 51 and 55–68) and a note shown on load: blood loss ATLS class II and III, infection screening (SIRS/qSOFA), acute allergic reaction, hypoventilation masked by O₂, compensatory hyperventilation, dead-space (PE-type) pattern, hypothermia, early and late hypermetabolic (MH-type) pattern, obstructive hypercapnic (COPD-type) pattern, early and late raised-potassium ECG, the raised-ICP (Cushing) reflex, an SVT pattern, a hyperglycaemic-crisis (DKA-type) pattern, pre-arrest deterioration, peri-arrest, acute stroke (high blood pressure), three heart-failure profiles (warm-wet pulmonary oedema, cold-wet low output, cardiogenic shock) and three post-operative patterns (opioid respiratory depression, hypothermia with shivering, pulmonary complication). Illustrative patterns for education only; not diagnostic. |
| Run control | Run/pause, playback speed (0.25–4×), freeze, reset (also restores default alarm limits) and a PNG snapshot that carries the educational notice. |
| NIBP | Manual start and stop, or an automatic interval (default every 5 min; a reading also starts on load, scenario change and Reset). The live cuff-pressure trace, the oscillogram with the detected points, and a results table. |
| Alarms | Limits and delays for the physiological parameters (including EtCO₂, arterial SYS and MAP) and rhythm alarms (for example V-tach, frequent PVCs), apnea, and 9 technical conditions. Physiological and technical alarms are kept apart, with priorities, acknowledge, a 2-minute audio pause with countdown, history and CSV export. Optional Web Audio tones. |
| Trends | Any parameter from any source over a chosen window. Gaps and missing values are drawn as breaks, never as zeros. Pause, PNG, CSV and summary statistics. |
| Glucose and insulin | A population glucose–insulin model: Bergman minimal model with meal absorption and subcutaneous insulin (Hovorka), parameters from published studies (REFERENCES.md 45–54). Diabetes status none, type 1 or type 2 changes insulin sensitivity and secretion. The GLU tile shows glucose (mg/dL and mmol/L) and insulin with a "model" badge; alarms below 70, above 180 and a high-priority level 2 below 54 mg/dL. Extra high-priority alarms below HR 40 bpm and SpO₂ 80 % (illustrative values). The **Glucose** tab gives a meal or an insulin bolus now, and draws a 2–4 h **model projection** with a planned meal and bolus: the curve, the time to cross 70/54/180/250 mg/dL and the time in 70–180 mg/dL. It is a model projection, not a clinical prediction, and not dosing advice. |
| Patient profile | Age, sex, height, weight and diabetes status are the same parameters as Controls → Patient profile (changing either sets the scenario to Custom). Shows BMI and BSA (Mosteller). Adult BMI categories are applied only from age 20. Weight history with change. |
| Data import/export | CSV/JSON table import only (wide or long tables, unit conversion, time zones, missing tokens, duplicates and conflicts), manual entry, CSV/JSON export by source and a waveform CSV export. In the Android app an extra "On this phone" section reads Health Connect records and a Bluetooth heart-rate sensor after the user starts each one; out-of-range values are rejected with a reason, never clamped. |
| Signal chain | Pick a channel (ECG, PPG, respiration, arterial line, capnography) and watch each processing stage as a live plot, with units and a note per stage: for example clean ECG, acquired ECG with noise, display filter, the QRS detector's integrated signal with its threshold and detections. Any stage can be saved as PNG. |
| Lessons | 8 guided lessons (ECG chain, SpO₂, NIBP, rhythms, capnography, arterial line, alarms, deterioration before cardiac arrest). Each has objectives, steps with buttons that set the controls, and a 3-question quiz graded in the page with explanations. |
| Science and references | The models, assumptions and engineering limitations summarised in the app, and the reference list. |
| Tests | Browser self-test: 15 automated scenarios (including V-tach, hypoventilation, arterial-line damping, the glucose model, the Bluetooth Heart Rate Measurement parser and the Health Connect record conversion used by the Android app) plus 1 hardware entry (watch data on Android: Health Connect, BLE, export file) that is always reported as "not run" when no hardware is present. |

## Data provenance

Every value the app stores is an *observation* with:

- a **source**: `simulated`, `derived`, `device`, `imported` or `user`,
- a **quality** flag: `ok`, `low-quality`, `missing`, `invalid` or `artifact`,
- a unit, a timestamp and a **provenance** record (method, set point, file name, device, and so on).

A missing value is stored as `null` with quality `missing`. It is never stored as 0. Series from different sources are never merged. Values from a Bluetooth heart-rate sensor (Android route) use `device`; values loaded from files use `imported`. Values typed in use `user`.

## Project structure

```
index.html              single page, loads plain <script> files (no modules, works from file://)
css/                    styles
src/core/               observation model, units, patient profile, observation store
src/sim/                parameters and presets, RNG, DSP, ECG, arrhythmias, pulse, sensors, NIBP, detectors, glucose model, engine
src/alarms/             alarm engine, alarm-to-tile/control links (severity)
src/data/               CSV reader, importer (mapping, units, timestamps, validation)
src/devices/
  gatt.js               Bluetooth Heart Rate Measurement (0x2A37) parser, used by the Android app's BLE route
  androidBridge.js      turns Health Connect records and BLE notifications from the Android app into observations
src/lessons/            lesson content and quiz grading (no DOM)
src/ui/                 canvas waveforms and trends, panels (signal chain, lessons, Android section, glucose), data tab, self-test, app wiring
android/                Android WebView app (edu.deu.pmsim 1.3.0, in development): Health Connect and BLE bridge
desktop/                Linux .deb and Windows .exe: Electron shell (main.cjs), package config and build-deb.sh
.github/workflows/
  pages.yml             runs the unit tests and deploys the site to GitHub Pages
tests/unit/             Node unit tests (node --test): sim, arrhythmia, alarms, core, data, devices, androidBridge, lessons, scenario, glucose
fixtures/               synthetic CSV/JSON import files (see fixtures/README.md)
package.json            "test" and "start" scripts
```

The simulation, alarm, data and parser modules do not touch the DOM. They load in the browser as `window.PM.*` and in Node through `require`, so the same code is tested in both places.

## Documents

| File | Content |
|---|---|
| `TECHNICAL_REPORT.md` | Models, equations, assumptions, architecture, alarms, limitations |
| `REFERENCES.md` | Sources and what each one supports |
| `TEST_REPORT.md` | Test scenarios, expected and observed results, what was not tested |
| `DEMO_SCRIPT.md` | Step-by-step demonstration (about 11 minutes) |
| `DEVICE_INTEGRATION_REPORT.md` | What device integration was removed and why; the Android-only watch routes, their limits and status |
| `VIBE_CODING_PROMPT.md` | The prompts used to build the app |
| `PLAN.md` | Implementation plan and environment notes |

## Privacy and safety

- The page makes no network requests. Its Content Security Policy sets `connect-src 'none'` and loads scripts and styles only from the page's own folder. The same page is served as the website and wrapped in the Android app and the Linux desktop app.
- Imported files are read in the browser tab and are not uploaded anywhere.
- No measurement data is saved between sessions. Reloading the page clears all data. Only two things are kept in this browser's `localStorage`: the best quiz score per lesson (key `pmsim.lessons.v1`) and the Controls view choice, Simple or Advanced and explanations on or off (key `pmsim.controls.v1`).
- The Android app has no `INTERNET` permission and disables cloud backup. Health Connect permissions are read-only, requested from the user, and the data goes only to the local page. This is the intended design; it has not yet been verified with real devices.
- Only documented, vendor-neutral interfaces are used (Android Health Connect, Bluetooth SIG Heart Rate Service, the user's own export files). No proprietary protocol is reverse-engineered.
- PM-SIM is an original educational design. It does not reproduce the interface of any monitor manufacturer.
- It is not a medical device, has not been validated, and must not be used for diagnosis or patient monitoring.
