# Implementation Plan — Patient Monitor Simulator

Assignment: homework-2, Interactive Medical Device Simulator. Assigned device: multiparameter bedside **Patient Monitor** (Md. Hafijur Rahman).

## Environment (inspected 2026-10-27)

- Linux, Node.js v24.22.0 (unit tests run with `node --test`), Python 3 (optional local server), pandoc.
- Browsers: Brave (snap), plus the Claude desktop built-in browser used for UI verification.
- Bluetooth: adapter `hci0` powered. A passive 15 s LE scan found 21 advertisers. None advertised a standard health service (0x180D, 0x1822, 0x1810, 0x1809, 0x181D).
- No serial HL7 device and no hospital monitor, central station or gateway available.
- Desktop packaging (added 2026-10-28): Electron 42 with electron-builder 26 via pnpm. The Linux `.deb` and the Windows `.zip` build on this machine. The Windows NSIS installer and portable `.exe` need Windows (or Wine and `makensis`, not installed here), so they are built by a GitHub Actions workflow on `windows-latest`. Headless Electron exits with code 139 (segmentation fault) on this machine, so the packaged app cannot be driven in automated tests here.

## Architecture

The core runs as a static site: plain `<script>` files, no build step, no network, and it works from `file://`. Each logic module is UMD-style, so the same file loads in the browser (`window.PM.*`) and in Node tests (`require`). A thin Electron shell (`electron/`) packages the same page as a desktop app for Linux (`.deb`) and Windows, and adds what a web page cannot do itself: a local HL7 MLLP listener and serial-port and Bluetooth chooser dialogs.

| Layer | Folder | Responsibility | DOM? |
|---|---|---|---|
| Core data | `src/core/` | Observation model (source, unit, timestamp, quality, provenance), units, patient profile, observation store, trends | no |
| Simulation | `src/sim/` | Parameters and presets, ECG (McSharry ODE), PPG red/IR, impedance respiration, oscillometric NIBP, temperature sensor, DSP, detectors, engine | no |
| Alarms | `src/alarms/` | Rule evaluation, delay, priority, acknowledge, audio pause (mute), history | no |
| Data I/O | `src/data/` | CSV/JSON parsing, column mapping, timestamp and unit handling, validation, export | no |
| Devices | `src/devices/` | IEEE-11073 SFLOAT/FLOAT and GATT characteristic parsers (pure), Web Bluetooth connectors (browser only); HL7 v2 (PCD-01) parser with MLLP framing, FHIR R4 and SDC MDIB importers, MDC/LOINC/UCUM code tables, Web Serial framer, device catalogue, synthetic samples | parsers no |
| UI | `src/ui/` | Canvas waveforms and trends, controls, panels, wiring | yes |
| Desktop shell | `electron/` | `app://pm-sim` origin, MLLP listener (receive only), preload bridge, device chooser dialogs | no |

## Workstreams

1. Core simulator, patient profile, controls, equations, plots, presets, alarms.
2. Local CSV/JSON import, manual entry, trends, export, fixtures.
3. Consumer and personal medical devices: Bluetooth SIG standard profiles (Heart Rate, Pulse Oximeter, Blood Pressure, Health Thermometer, Weight Scale), parsed from the verified GATT Specification Supplement. File import covers devices without standard BLE.
4. Hospital device integration (added 2026-10-28): a device-type picker with 12 generic classes; HL7 v2 ORU^R01 (IHE PCD-01) over MLLP (desktop app) and serial (Web Serial); HL7 v2, FHIR R4 and SDC MDIB file import; bed/location filter; synthetic HL7 feed. Published standards only, receive only, no patient identity stored.
5. Desktop packaging: Linux `.deb` and Windows (zip built locally; installer and portable `.exe` via GitHub Actions).
6. Tests: Node unit and integration tests, plus in-browser UI self-test (`?selftest=1`), plus an offline check.
7. Documentation: README, TECHNICAL_REPORT, REFERENCES, TEST_REPORT, DEVICE_INTEGRATION_REPORT, DEMO_SCRIPT, VIBE_CODING_PROMPT.

## Rules kept throughout

- Every value carries its source: `simulated`, `derived`, `device`, `imported`, or `user`. Missing data stays `null`, never 0.
- The monitor's estimates (QRS detector, ratio-of-ratios, oscillometric envelope, breath detector) are shown next to the simulated "true" inputs, so students see the measurement error.
- No hardware test is marked passed without hardware. No device specification is invented.
- No vendor-specific protocol is reverse-engineered. Devices that only speak a proprietary protocol are reached through a vendor gateway or interface engine that outputs HL7 v2 or FHIR.
- Patient identity data (HL7 PID and similar segments, FHIR person resources) is never stored.
