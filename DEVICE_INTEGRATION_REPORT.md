# Device Integration Report

How data from real medical devices can reach PM-SIM, which standards each route uses, what the app does with the data, and what was and was not tested. Written on 2026-10-28.

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

Reference numbers in square brackets refer to `REFERENCES.md`.

## 1. Purpose and scope

PM-SIM is a teaching simulator. Device integration exists so that students can see real or realistic device data *next to* the simulation, labelled with its source, and learn how hospital devices actually exchange data. Device data never drives the simulation: the ECG, pleth, respiration and cuff waveforms are always generated from the simulator's own set points.

In scope:

- Published, vendor-neutral standards: HL7 v2 observation messages (ORU^R01) in the IHE PCD-01 style, sent over MLLP/TCP or a serial line; HL7 FHIR R4 Observation resources; IEEE 11073 SDC MDIB documents (file only); Bluetooth SIG standard health profiles; CSV/JSON tables; manual entry.
- Receiving data only. PM-SIM never writes to a device, never sends data to another computer and never connects out.

Out of scope:

- Vendor-specific (proprietary) protocols. PM-SIM does not reverse-engineer them. A device that only speaks a proprietary protocol must be connected through the vendor's own gateway or an interface engine that outputs HL7 v2 or FHIR.
- Live SDC (WS-Discovery, TLS, SOAP). Only saved MDIB XML files are read.
- Any claim that a specific device model works with PM-SIM. No real hospital device was connected during this project (section 9).

The **Devices** tab is organised around this scope. The user first picks a *device type* (a generic class, no brand names), then one of the *routes* that such devices typically offer. Each route shows an **available** or **unavailable** badge for the current runtime (browser or desktop app), with the reason when it is unavailable. The catalogue is in `src/devices/catalog.js`.

## 2. Device classes

The "Routes" column lists interfaces that devices of this class commonly offer. Whether a given model supports a route must be checked in its own interface documentation.

| Device class | Typical parameters | Routes offered in the app |
|---|---|---|
| Bedside multiparameter monitor | ECG HR, SpO₂, PR, NIBP, IBP, RR, EtCO₂, temperature | HL7 MLLP, HL7 serial, SDC file, HL7 file, manual, synthetic feed |
| Central station / device integration gateway | All parameters of the connected bedside monitors | HL7 MLLP, HL7 file, FHIR file, synthetic feed |
| Spot-check vital signs monitor | NIBP, SpO₂, PR, temperature | HL7 MLLP, HL7 serial, FHIR file, HL7 file, BLE, manual |
| Pulse oximeter | SpO₂, PR, perfusion index | BLE, HL7 serial, CSV/JSON, manual |
| Automated blood pressure monitor | SBP, DBP, MAP, PR | BLE, HL7 serial, CSV/JSON, manual |
| Clinical thermometer | Body temperature | BLE, CSV/JSON, manual |
| ECG telemetry / Holter / chest strap | Heart rate, RR intervals | BLE, HL7 MLLP, HL7 file, CSV/JSON |
| Capnograph | EtCO₂, airway respiratory rate | HL7 serial, HL7 MLLP, SDC file, manual |
| Ventilator / anaesthesia workstation | Airway RR, EtCO₂ (other ventilation values are not shown) | SDC file, HL7 MLLP, HL7 serial, HL7 file |
| Patient or bed scale | Weight, height, BMI | BLE, HL7 serial, CSV/JSON, manual |
| Wearable patch / remote-monitoring hub | HR, SpO₂, RR, temperature | FHIR file, BLE, CSV/JSON |
| EHR or health record export | Vital signs recorded in the chart | FHIR file, HL7 file, CSV/JSON |

Above the route list the tab has a **Bed / location** field in HL7 PV1-3 form (point of care ^ room ^ bed, default `ICU^01^01`) and a checkbox **Accept HL7 messages for this bed only** (section 6). The chosen device type and the bed value are remembered in the browser's `localStorage`. No measurement data is stored there.

## 3. Routes

### 3.1 HL7 v2 over MLLP (TCP listener) — `hl7-mllp`

**Standard.** HL7 v2.6 ORU^R01 observation messages [23] as profiled by IHE PCD-01 *Communicate PCD Data*, with PM-SIM acting as the Device Observation Consumer [25]. Transport is the Minimal Lower Layer Protocol: each message is framed as VT (0x0B) … FS (0x1C) CR [24].

**How to connect.** Desktop app only: a web page cannot open a TCP port, so in a browser this route is shown as unavailable. In the desktop app, choose the port (default 2575, allowed 1024–65535) and the interface, then **Start listener**. The sending system (monitor, central station or interface engine) is configured to send ORU^R01 to this computer's address and port.

**What the app does.** `electron/mllpServer.cjs` runs the listener in the Electron main process:

- binds to `127.0.0.1` (this computer only) by default; `0.0.0.0` (all interfaces) only when the user selects it, and the page then shows a warning that MLLP has no encryption or login and should be used only on an isolated test network;
- accepts at most 8 simultaneous connections;
- closes a connection that sends more than 1 MB without a complete frame;
- answers each message with an HL7 ACK: `MSA|AA` when the message was read, `MSA|AE` when it could not be read;
- only receives: it never connects out and never forwards data.

`electron/preload.cjs` exposes a fixed API, `window.PMDesktop.mllp` with `start`, `stop`, `onMessage` and `onStatus`, through Electron's `contextBridge`. The page has no Node or IPC access otherwise. The main process refuses IPC calls whose sender is not the app's own origin `app://pm-sim`.

Each received message is parsed by `src/devices/hl7v2.js` (section 4) and stored with source `device`.

**Limits.** No TLS, no authentication (MLLP itself provides neither). The ACK is the original-mode acknowledgement only. Non-numeric OBX value types are skipped. Only parameters listed in section 4 are mapped; other OBX rows are listed in the message log as "code not mapped".

### 3.2 HL7 v2 over a serial port — `hl7-serial`

**Standard.** The same HL7 v2 messages, sent over RS-232 or a USB-serial adapter, with or without MLLP framing. The browser side uses the Web Serial API [34].

**How to connect.** Needs Web Serial: Chrome or Edge in a secure context (`http://localhost` or https), or the desktop app. Choose the baud rate (9600, 19200, 38400, 57600 or 115200) and the format (8N1 or 7E1), then **Connect a port…** and pick the port in the dialog. The page cannot see ports that were not chosen. In the desktop app, `electron/main.cjs` supplies the port chooser dialog (Electron has none built in) and allows the serial permission only for the app's own origin [35]. On Linux the user must be allowed to open the port (usually the `dialout` group).

**What the app does.** `src/devices/webSerial.js` reads the port and passes the text to `SerialFramer`:

- once a VT byte has been seen, MLLP framing is used;
- otherwise the text is split before each `MSH|`, and the last message is flushed after 1.5 s without new data.

**Limits.** Read-only: the app never writes to the port, so **no ACK is sent** on this route. A sender that waits for an ACK before sending the next message will stall. Only 8N1 and 7E1 are offered; flow control is not configurable.

### 3.3 Bluetooth LE standard health profiles — `ble`

**Standard.** Bluetooth SIG Heart Rate (HRS), Pulse Oximeter (PLXS), Blood Pressure (BLS), Health Thermometer (HTS) and Weight Scale (WSS) services [16]–[18], with IEEE 11073-20601 SFLOAT/FLOAT numbers [19], via Web Bluetooth [20].

**How to connect.** Chrome or Edge in a secure context, or the desktop app (which supplies a device chooser dialog). Tick the profiles to look for and click **Connect a device…**. The browser's chooser only lists devices that advertise one of the selected services, so a device that does not implement a standard profile never appears and nothing proprietary is touched.

**What the app does.** Parses the characteristics listed in `TECHNICAL_REPORT.md` section 7.2 and stores the values with source `device`. Special values (NaN, NRes, ±INFINITY) become missing, never 0. The **Start BLE replay** button plays 138 synthetic, byte-exact packets through the same parsers; those values carry `provenance.replay` and a SYNTHETIC badge.

**Environment note (from the 2026-10-27 check).** A passive 15 s LE scan from the laptop's adapter (`hci0`) found 21 advertisers. None advertised a standard health service (Heart Rate 0x180D, Pulse Oximeter 0x1822, Blood Pressure 0x1810, Health Thermometer 0x1809, Weight Scale 0x181D). The scan only shows advertising packets: a device that is bonded to a phone often stops advertising, so the result does not show that a device cannot be used. It means no BLE route could be tested live.

**Limits.** Web Bluetooth is not available in Firefox or Safari. Consumer devices that implement a standard profile are not necessarily medical devices (section 7).

### 3.4 File and paste import — `hl7-file`, `fhir-file`, `sdc-file`

All three take a file (**Choose a file**) or pasted text (**Import pasted text**). Each has a **Load synthetic example** button that generates a test-marked example from `src/devices/samples.js`. Values from files are stored with source `imported`. The **Data import** tab also detects these formats automatically (it accepts `.csv`, `.tsv`, `.txt`, `.json`, `.hl7` and `.xml`).

**HL7 v2 file** (`src/devices/hl7v2.js`). Message logs or exports with one or more ORU^R01 messages, with or without MLLP framing. Parsed exactly as on the live routes.

**FHIR R4** (`src/devices/fhir.js`) [30], [31]. A single Observation, an array, or a Bundle.

- Codes: LOINC [32] or MDC.
- Values: `valueQuantity`, or `component[].valueQuantity` for panels; the blood-pressure panel (LOINC 85354-9) is split into SBP, DBP and MAP.
- `dataAbsentReason` gives a missing observation with the reason kept in provenance.
- Observations with status `entered-in-error` or `cancelled` are skipped.
- Patient, Person, RelatedPerson, Practitioner and PractitionerRole resources and `Observation.subject` are ignored and reported as a warning with a count only.
- Device resources give the device name.

**SDC MDIB XML** (`src/devices/sdc.js`) [28], [29]. A saved GetMdibResponse, Mdib element or EpisodicMetricReport.

- Uses its own minimal XML tokenizer. Files containing `DOCTYPE` or `ENTITY` declarations are refused (this rules out entity-expansion attacks). Files larger than 5 MB are refused.
- Reads NumericMetricDescriptor (handle, MDC type, unit) and NumericMetricState (value, determination time).
- Maps MetricQuality Validity to the quality flag: `Vld`/`Vldated` → ok; `Ong`, `Qst`, `Calib` → low-quality; `Inv`, `Oflw`, `Uflw` → invalid; `NA` → missing.
- Live SDC (WS-Discovery, TLS, SOAP) is **not implemented**. Only files are read.

### 3.5 CSV/JSON tables and manual entry — `csv-file`, `manual`

These routes open the existing **Data import** tab, described in `TECHNICAL_REPORT.md` section 7.1. Table imports are stored as `imported`; manual entries as `user`.

### 3.6 Synthetic HL7 feed — `demo`

`samples.feed()` generates 20 ORU^R01 messages, played one every 2 s, from a synthetic central station that serves two beds. Every fourth message (5 of 20) is for the other bed (`ICU^01^02`). The script includes an SpO₂ drop to 88 %, a respiratory rate sent with result status `X` (stored as missing), and a temperature of 55 °C that is kept but flagged `invalid`. The messages go through the same parser and bed filter as the live routes. All values carry a SYNTHETIC badge. This demonstrates the live path without hardware; it is not a device test.

## 4. Code and unit mapping

`src/devices/mdc.js` maps observation codes to PM-SIM parameters in this order:

1. ISO/IEEE 11073-10101 reference identifier text, for example `MDC_PULS_OXIM_SAT_O2` [26];
2. the 32-bit MDC numeric code (partition × 65536 + term code), only when the coding system is MDC or empty;
3. LOINC codes from the FHIR vital-signs profile [31], [32].

Units are mapped from MDC dimension reference identifiers or codes, from UCUM strings [33] (for example `mm[Hg]`, `Cel`, `[degF]`, `/min`), or from plain text. Values are converted to the app's canonical units, for example kPa → mmHg and °F → °C.

Parameters accepted from devices and files: HR, PR, SpO₂, perfusion index, NIBP SYS/DIA/MAP, invasive arterial pressure (`art_sys`, `art_dia`, `art_map`, mmHg), RR, EtCO₂ (mmHg; kPa is converted), temperature, weight, height and BMI. Invasive arterial pressure and EtCO₂ are not simulated; they appear in Trends, the message log and manual entry.

**Verified versus unverified MDC numeric codes.** Only some numeric codes in `mdc.js` were cross-checked against a published HL7 value set or example while the file was written. They are marked `checked: true`:

| Reference identifier | Numeric code | Parameter |
|---|---|---|
| `MDC_ECG_HEART_RATE` | 147842 | HR |
| `MDC_PULS_OXIM_SAT_O2` | 150456 | SpO₂ |
| `MDC_TEMP_BODY` | 150364 | temperature |
| `MDC_RESP_RATE` | 151562 | RR |
| `MDC_AWAY_RESP_RATE` | 151570 | RR |
| `MDC_TTHOR_RESP_RATE` | 151578 | RR |
| `MDC_CO2_RESP_RATE` | 151594 | RR |

All other numeric observation codes (pulse rate, perfusion index, NIBP, invasive pressure, EtCO₂, `MDC_TEMP`, weight, height, BMI) and all MDC unit codes are marked `checked: false` or carry no flag. They were written from the nomenclature as recalled and **must be confirmed in NIST RTMMS [27] before any real use**. To limit the risk, a reference identifier in the message always wins over a number, and a match made through an unconfirmed number is labelled "numeric code not confirmed" in the observation's provenance. A device that sends only numeric codes for these parameters may therefore be mapped wrongly or not at all.

## 5. Provenance and synthetic flagging

| Origin | Source | Synthetic flag (`provenance.replay`, SYNTHETIC badge) |
|---|---|---|
| Live routes (MLLP, serial, BLE) | `device` | when the sender marks the data as test data (below) |
| File or paste (HL7, FHIR, SDC, CSV/JSON) | `imported` | when the file marks the data as test data |
| Synthetic feed, BLE replay | `device` | always |
| Manual entry | `user` | never |

Test markings recognised: HL7 MSH-11 processing ID `T` (training) or `D` (debugging); FHIR `meta.security` or `meta.tag` code `HTEST`; SDC MetricQuality `Mode="Test"` or `Mode="Demo"`. All synthetic examples and fixtures carry these markings.

Each observation keeps its route, message format, sending application, control ID, location, device identifier, original code, how the code was matched, original value and unit, result status and time source (OBX-14/OBR-7, MSH-7 or time received). A missing value is stored as `null` with quality `missing`, never as 0. Out-of-range values are kept and flagged `invalid`.

The **message log** table on the Devices tab shows every received message or file entry with time, sender, channel, raw text and the decoded result, including dropped messages and the reason. It keeps the latest 400 rows.

## 6. Bed and location filtering

A central station or gateway usually sends data for many beds over one connection. With **Accept HL7 messages for this bed only** ticked, each message's PV1-3 location is compared with the Bed / location field, component by component and case-insensitively. Empty components in the field match anything, so `ICU` alone accepts every bed in the ICU. Messages that do not match are dropped and listed in the message log as "dropped". With the checkbox off, all messages are stored. The filter applies to HL7 v2 only; FHIR and SDC files carry no PV1 segment.

## 7. Privacy and security

- **No outbound traffic.** The page's Content Security Policy still sets `connect-src 'none'`. The MLLP listener only accepts connections; nothing is transmitted to another computer.
- **Listener exposure.** The listener binds to `127.0.0.1` unless the user selects `0.0.0.0`, which triggers a warning. Port numbers below 1024 are refused. At most 8 connections and 1 MB per pending frame are accepted.
- **No patient identity is stored.** HL7 identity segments (PID, PD1, NK1, GT1, IN1, IN2, MRG) are counted and not read. FHIR person resources and `Observation.subject` are ignored. Only a count is reported.
- **Desktop isolation.** Context isolation and sandbox are on, Node integration is off; the page reaches the listener only through the fixed `PMDesktop.mllp` API, and the main process accepts IPC only from `app://pm-sim`. Serial-port permission is limited to the same origin.
- **XML safety.** SDC files with DOCTYPE or ENTITY declarations are refused; size is capped at 5 MB.
- **No reverse engineering.** Only published standards are implemented. Vendor-specific protocols are out of scope; use a vendor gateway or interface engine that outputs HL7 v2 or FHIR.
- **Regulatory context.** Consumer wearables are generally sold as general-wellness products, not medical devices [36]. Pulse oximeters for medical use need clinical accuracy testing [37], and SpO₂ readings have known limitations, for example with poor perfusion, motion or darker skin pigmentation [38]. PM-SIM is not a medical device and has not been validated. It keeps all device data in its own source category and never feeds it into the simulation.

## 8. Test evidence

**Unit tests** (`node --test tests/unit/*.test.js`): 71 tests, 71 pass. `tests/unit/hospital.test.js` adds 14 tests:

- MDC lookup by reference identifier, numeric code and LOINC;
- HL7 fixture: 16.4 kPa → 123.0 mmHg, 99.0 °F → 37.22 °C, empty RR stored as missing, PID content not stored, synthetic flag set;
- HL7 timestamps with a UTC offset;
- a message without MSH is rejected;
- MLLP deframing (junk dropped, partial frame kept) and ACK `MSA|AA|SIM0001`;
- bed filter: 5 of 20 feed messages rejected; 55 °C kept as `invalid`;
- FHIR blood-pressure panel split and `dataAbsentReason` → missing;
- FHIR `entered-in-error` skipped and malformed JSON reported;
- SDC validity → quality mapping;
- SDC DOCTYPE refusal;
- serial framer: plain text split on `MSH|`, idle flush, MLLP when VT is seen;
- format detection and `importAny` rejection of another bed;
- catalogue availability (MLLP unavailable without the desktop API, file routes always available);
- MLLP server on `127.0.0.1` receives a framed message and answers `AA`; a privileged port (80) is refused.

Fixtures: `fixtures/hl7_oru_pcd01.hl7`, `fixtures/fhir_vitals_bundle.json`, `fixtures/sdc_mdib.xml` (described in `fixtures/README.md`).

**Browser self-test** (`index.html?selftest=1`): 15 entries, 13 pass, 0 fail, 2 not run (hardware). The three hospital scenarios and their observed results are in `TEST_REPORT.md` section 3.

**Manual check** on 2026-10-28 in the in-app browser at `http://localhost:8766`: the device picker lists 12 classes; *Central station* shows MLLP as unavailable in the browser and the file and feed routes as available; the HL7 example import gave 16 values imported and 1 missing; the synthetic feed with the bed filter on ended with "Finished: 20 messages, 5 dropped by the bed filter."; the SDC example gave 7 values imported and 1 missing; no console errors.

**Not run:**

- the MLLP listener inside the packaged Electron app (headless Electron exits with code 139, a segmentation fault, on this machine; the listener module itself is tested in Node);
- a real serial HL7 device;
- a real BLE health device;
- a real monitor, central station or gateway on any route;
- the Windows installer build (GitHub Actions workflow not yet run) and running the Windows build on Windows.

## 9. Connecting a real monitor or gateway

The following is the intended procedure. It has **not** been carried out with any real device, and compatibility with any specific monitor, central station or gateway model is unverified.

1. Run the desktop app (`.deb` on Linux or the Windows build). A browser page cannot listen on a TCP port.
2. On the Devices tab choose the device type (for example *Central station / device integration gateway*) and the route **HL7 v2 over MLLP (TCP listener)**.
3. Set **Listen on** to *all network interfaces (0.0.0.0)* and keep or change the port (default 2575). Do this only on an isolated test network: MLLP has no encryption or login. Allow the port in the computer's firewall if needed.
4. Enter the bed in **Bed / location** in the same form the sender uses in PV1-3 (for example `ICU^01^01`) and tick **Accept HL7 messages for this bed only**.
5. Click **Start listener**.
6. In the monitor's HL7 export settings, or in the interface engine, add a destination: this computer's IP address, the chosen port, MLLP framing, HL7 v2 ORU^R01 (IHE PCD-01 if offered).
7. Watch the message log. Each message should show as received and acknowledged with `AA`. Rows marked "code not mapped" or "numeric code not confirmed" point to the limitation in section 4.

For a device with only a serial HL7 output, use the serial route with the baud rate and format from the device's interface manual instead of steps 3–6. Remember that no ACK is sent on serial.
