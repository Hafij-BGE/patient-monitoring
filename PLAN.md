# Implementation Plan — Patient Monitor Simulator

Assignment: homework-2, Interactive Medical Device Simulator. Assigned device: multiparameter bedside **Patient Monitor** (Md. Hafijur Rahman, BMT master's programme).

## Scope (updated 2026-10-28)

By the owner's decision the project is a **simulator first**. On 2026-10-28 the Devices tab and all hospital and Web Bluetooth device integration (HL7 v2, FHIR, SDC, MDC mapping, Web Serial, packet replay) were removed, together with the Electron desktop app, its builds and its workflow. Delivered forms:

- **Website:** https://hafij-bge.github.io/patient-monitoring/, a static site published by `.github/workflows/pages.yml` (unit tests, then deploy). Browser-only, no backend, Content Security Policy `connect-src 'none'`. Also runs locally (`python3 -m http.server 8766`) or from `index.html`.
- **Android app (in development):** `android/`, package `edu.deu.pmsim` 1.1.0, wraps the same page in a WebView. It is the only place where real watch data enters (Health Connect read, native BLE Heart Rate Service 0x180D, health-app export file). Nothing is hardware-tested yet.

## Environment (inspected 2026-10-27)

- Linux, Node.js v24.22.0 (unit tests run with `node --test`), Python 3 (optional local server), pandoc.
- Browsers: Brave (snap), plus the Claude desktop built-in browser used for UI verification.
- No watch, heart-rate sensor or other health device has been connected to any test.

## Architecture

The core runs as a static site: plain `<script>` files, no build step, no network, and it works from `file://`. Each logic module is UMD-style, so the same file loads in the browser (`window.PM.*`) and in Node tests (`require`).

| Layer | Folder | Responsibility | DOM? |
|---|---|---|---|
| Core data | `src/core/` | Observation model (source, unit, timestamp, quality, provenance), units, patient profile, observation store, trends | no |
| Simulation | `src/sim/` | Parameters and presets, ECG (McSharry ODE), PPG red/IR, impedance respiration, oscillometric NIBP, temperature sensor, DSP, detectors, engine | no |
| Alarms | `src/alarms/` | Rule evaluation, delay, priority, acknowledge, audio pause (mute), history | no |
| Data I/O | `src/data/` | CSV/JSON parsing, column mapping, timestamp and unit handling, validation, export | no |
| Device parser | `src/devices/gatt.js` | Bluetooth Heart Rate Measurement (0x2A37) parser for the Android BLE route | no |
| UI | `src/ui/` | Canvas waveforms and trends, controls, panels, wiring | yes |
| Android host | `android/` | WebView wrapper, Health Connect reader, native BLE Heart Rate client | n/a |

## Workstreams

1. Core simulator, patient profile, controls, equations, plots, presets, alarms. Done.
2. Local CSV/JSON import, manual entry, trends, export, fixtures. Done.
3. Tests: Node unit tests (47, all pass) and the in-browser self-test (`?selftest=1`: 10 scenarios plus 1 hardware entry reported as not run). Done for the web part.
4. Documentation: README, TECHNICAL_REPORT, REFERENCES, TEST_REPORT, DEVICE_INTEGRATION_REPORT, DEMO_SCRIPT, VIBE_CODING_PROMPT. Updated 2026-10-28.
5. Website on GitHub Pages. Workflow written.
6. Android app: Health Connect, BLE and export-file routes. **In progress.** Remaining: page-side wiring of the bridge events, a test on a real watch, and recording the result.

## Rules kept throughout

- Every value carries its source: `simulated`, `derived`, `device`, `imported`, or `user`. Missing data stays `null`, never 0.
- The monitor's estimates (QRS detector, ratio-of-ratios, oscillometric envelope, breath detector) are shown next to the simulated "true" inputs, so students see the measurement error.
- No hardware test is marked passed without hardware. No device specification is invented.
- No vendor-specific protocol is reverse-engineered. Watch data enters only through documented Android APIs or the user's own export file.
- Real data never drives the simulation.
