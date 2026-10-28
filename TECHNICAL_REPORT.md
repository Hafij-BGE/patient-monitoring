# Technical Report: PM-SIM, an Interactive Patient Monitor Simulator

Md. Hafijur Rahman. Homework 2, *Interactive Medical Device Simulator*. Dokuz Eylül University, 2026.

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

## 1. Purpose and scope

A multiparameter bedside patient monitor acquires several physiological signals at once, estimates numeric values from them, compares the numerics with alarm limits, and shows waveforms, numerics and trends. PM-SIM reproduces this chain in a browser, at teaching level:

```
simulated physiology  →  sensor forward model  →  acquisition (sampling, noise, filters)
        (set points)        (ECG, PPG, impedance,        →  monitor estimators (QRS detector,
                             cuff, temperature probe)        ratio of ratios, oscillometry,
                                                             breath detector)  →  numerics  →  alarms
```

The set point of every parameter is known, so the app shows each estimate next to the value that produced it. The difference is the measurement error of the simulated monitor. This is the main teaching point: a monitor reports an *estimate*, and the estimate depends on the sensor, the noise and the algorithm.

**What PM-SIM is not.** It is not a validated physiological model, it does not reproduce any commercial monitor's algorithms or interface, and it makes no claim of clinical accuracy. All constants that are teaching choices, rather than published values, are marked as such below.

## 2. Architecture

| Layer | Files | Role |
|---|---|---|
| Core data | `src/core/observation.js`, `units.js`, `profile.js`, `store.js` | Observation model, unit conversion, BMI/BSA, per-source time series |
| Simulation | `src/sim/params.js`, `rng.js`, `dsp.js`, `ecg.js`, `pulse.js`, `sensors.js`, `nibp.js`, `detectors.js`, `engine.js` | Parameters, presets, signal models, estimators, the time-stepping engine |
| Alarms | `src/alarms/alarmEngine.js` | Limit checks, delays, priorities, acknowledge, audio pause, history |
| Data I/O | `src/data/csv.js`, `importer.js` | CSV/JSON parsing, column mapping, units, time zones, validation |
| Devices | `src/devices/gatt.js`, `webBluetooth.js`, `replay.js` | Bluetooth SIG characteristic parsers, Web Bluetooth connector, synthetic replay |
| Hospital interfaces | `src/devices/hl7v2.js`, `fhir.js`, `sdc.js`, `mdc.js`, `webSerial.js`, `catalog.js`, `samples.js` | HL7 v2 ORU^R01 parser with MLLP framing and ACK, FHIR R4 and SDC MDIB importers, MDC/LOINC/UCUM code tables, serial framer, device-class catalogue, synthetic examples and feed |
| UI | `src/ui/*.js`, `index.html`, `css/` | Canvas rendering, panels and wiring |
| Desktop shell | `electron/main.cjs`, `preload.cjs`, `mllpServer.cjs` | Electron window on the `app://pm-sim` origin, HL7 MLLP listener, serial and Bluetooth chooser dialogs |

The simulation, alarm, data and parser modules never touch the DOM. Each uses a UMD wrapper, so the same file runs in the browser (`window.PM.*`) and in Node for the unit tests. There is no build step and no ES-module import, so `index.html` also works from `file://`.

**Desktop app.** The same page is packaged with Electron as a Linux `.deb` and a Windows build (zip, NSIS installer and portable `.exe`). The window loads the page from a private `app://pm-sim` protocol with `contextIsolation`, `sandbox` and no Node integration. The desktop shell adds only what a web page cannot do: a TCP listener for HL7 MLLP, which runs in the main process and is reached through a fixed `contextBridge` API, and chooser dialogs for serial ports and Bluetooth devices, which Electron does not provide itself. The page's Content Security Policy (`connect-src 'none'`) is unchanged, so the page still makes no network requests.

### 2.1 Time base

The engine advances in fixed steps of **Δt = 1 ms**. Each subsystem samples at its own rate:

| Signal | Model rate | Acquired rate | Notes |
|---|---|---|---|
| ECG | 1000 Hz (ODE) | `ecg_fs` = 125, 250, 500 or 1000 Hz | decimated from the 1 kHz model |
| PPG red/IR | — | 125 Hz | |
| Impedance respiration | — | 50 Hz | |
| Cuff pressure | — | 100 Hz | |
| Numerics, temperature, alarms | — | 1 Hz | one *frame* per simulated second |

Waveforms are kept in 60 s ring buffers. The UI calls `engine.advance(dt × speed)` from `requestAnimationFrame`, with dt capped at 0.1 s, so the playback speed (0.25–4×) changes simulated time, not the models.

Every random process uses its own seeded generator (seed + subsystem index), so the same seed and the same settings give an identical run. A unit test checks this.

## 3. Signal models

### 3.1 ECG: McSharry dynamical model

The ECG is generated with the three-dimensional dynamical model of McSharry et al. (2003), following the reference implementation `ecgsyn.m` (PhysioNet ECGSYN). A point moves on the unit limit cycle in the (x, y) plane with angular velocity ω = 2π / RRᵢ. Its vertical coordinate z is:

$$\dot z = -\sum_{i \in \{P,Q,R,S,T\}} a_i\,\Delta\theta_i\,\exp\!\left(-\frac{\Delta\theta_i^2}{2 b_i^2}\right) - (z - z_0),\qquad \Delta\theta_i = (\theta - \theta_i) \bmod 2\pi$$

with z₀ = 0 (baseline wander is added later, at acquisition). Parameters are those of McSharry Table I:

| | P | Q | R | S | T |
|---|---|---|---|---|---|
| θᵢ (rad) | −π/3 | −π/12 | 0 | π/12 | π/2 |
| aᵢ | 1.2 | −5.0 | 30.0 | −7.5 | 0.75 |
| bᵢ | 0.25 | 0.1 | 0.1 | 0.1 | 0.4 |

**Heart-rate scaling** follows `ecgsyn.m`: with h = √(HR/60), the angles are multiplied by [√h, h, 1, h, √h] and the widths bᵢ by h. This shortens the QT interval at high rates.

**Teaching controls.** `qrs_width` multiplies b_Q, b_R and b_S and divides a_Q, a_R and a_S by the square of the factor. `p_scale` and `t_scale` multiply a_P and a_T (a negative `t_scale` inverts the T wave). These are illustrative deformations, not models of specific conduction disorders.

**Integration and amplitude.** The ODE is integrated with fourth-order Runge–Kutta at 1 kHz. The output is scaled so that the R peak equals `ecg_amp_mv` (default 1.0 mV).

**Beat timing.** Each RR interval is drawn when a beat starts:

- regular: RRᵢ = 60/HR + N(0, σ²), where σ = `hrv_ms`,
- irregular: RRᵢ = (60/HR) · (0.65 + 0.7 U), U ~ uniform(0, 1), that is, uniformly within ±35 %,

then limited to 0.5–1.6 × the mean interval and to 0.25–3 s. The irregular mode is a timing demonstration only. It does not model atrial fibrillation.

**Acquisition.** At `ecg_fs` the acquired signal is

$$x(t) = z(t) + A_w\left[\sin(2\pi\varphi_{resp}) + 0.3\sin(2\pi \cdot 0.05\,t)\right] + n(t)\,(1 + 4(1-q)^2) + A_m (1 + 4(1-q))\sin(2\pi f_m t)$$

where A_w is the baseline-wander amplitude, φ_resp the respiration phase, n(t) Gaussian noise with SD `ecg_noise_uv`, q the electrode contact quality (0–1), and A_m, f_m the mains amplitude and frequency. Below 10 % contact the leads are off and the sample is NaN (missing). Random dropouts also produce NaN.

**Display filter.** Monitor mode is a 0.5–40 Hz band-pass, diagnostic mode is 0.05–150 Hz, or off. An optional mains notch at 50 or 60 Hz (Q = 30) follows. The QRS detector sees the unfiltered acquired signal.

**Important.** The ECG is generated only from the simulator's own heart-rate setting. It is never generated from a heart rate imported from a file, typed in, or received from a device or watch. A heart-rate number does not contain the information needed to produce an ECG.

### 3.2 Arterial pulse

The arterial pulse is a shape function triggered by each simulated beat, delayed by a fixed pulse arrival time of **0.20 s** after the R peak. Over one beat, with u = time since pulse onset divided by the beat interval:

$$s(u) = g(u; 0.18, 0.07) + 0.45\, g(u; 0.45, 0.09),\qquad g(u;\mu,\sigma) = \exp\!\left(-\frac{(u-\mu)^2}{2\sigma^2}\right)$$

The sum is detrended and normalised to 0…1. The first Gaussian stands for the systolic wave and the second for a late reflected or diastolic component. The shape and the 0.20 s delay are **illustrative teaching choices**, not values fitted to measured data. The arterial pressure used by the cuff model is p_art(t) = DBP + (SBP − DBP) · s(t).

### 3.3 Pulse oximetry (red/IR photoplethysmogram)

The PPG model uses Beer–Lambert transmission with the tissue DC level normalised to 1 (background: Webster 1997; Allen 2007):

$$I_{IR}(t) = e^{-k\,s(t) - m(t)},\qquad I_{red}(t) = e^{-R\,k\,s(t) - m(t)},\qquad k = \frac{PI}{100}$$

- s(t) is the arterial pulse train.
- PI is the perfusion setting (%).
- m(t) is a common-mode motion absorbance of up to ±5 % at 100 % motion.
- R is the ratio for the set SpO₂, R = (110 − SpO₂)/25. This is the inverse of the calibration line used by the estimator.

Detector noise is added to both channels. The sensor states are:

| State | Signal |
|---|---|
| attached | as above |
| probe-off | light reaches the detector directly: DC ≈ 3, no pulse |
| disconnected | NaN (missing) |
| dropout | NaN for 0.3–1.5 s at Poisson-distributed times |

**Estimator (monitor side).** At 125 Hz:

1. Take ln(I) for each channel and band-pass it at 0.5–5 Hz to obtain the AC components.
2. Every 1 s, compute the ratio of ratios over the last 4 s:
   $$R = \frac{\mathrm{RMS}(AC_{red})}{\mathrm{RMS}(AC_{IR})}$$
   Working on ln(I) makes this equal to (AC/DC)_red / (AC/DC)_IR for small pulsations.
3. Convert with the linear example calibration **SpO₂ = 110 − 25 R** (TI application note SLAA655). Real oximeters use empirical, device-specific calibration curves.
4. Average over the selected time (2, 4, 8 or 16 s).
5. **Signal quality index.** R is also computed in four 1 s sub-windows. With CV their coefficient of variation:
   $$SQI = 100\,(1 - CV/0.2)$$
   clamped to 0–100.
6. **Perfusion index.** PI = 100 × peak-to-peak of the IR AC component.
7. **Pulse rate** from intervals between pleth peaks.
8. If the DC level exceeds 1.5, the status is *probe-off*. If the signal is NaN, the status is *no signal*.

SpO₂ readings with SQI < 50 are stored with quality `low-quality`. SQI < 40 raises a technical alarm.

**Known bias.** Motion adds the same absorbance to both channels, so it pulls R toward 1 and SpO₂ toward about 85 %. This reproduces, qualitatively, a known failure of simple ratio-of-ratios oximeters.

### 3.4 Impedance respiration

A phase oscillator φ advances at RR/60 per second. One cycle consists of a raised-cosine inspiration over the first third of the cycle and a passive expiration over the remaining two thirds (I:E = 1:2). The impedance signal is

$$Z(t) = A_{resp}\,v(\varphi) + 0.5\,c\,A_{resp}\,s(t) + \text{motion} + n(t)$$

where c is the cardiogenic fraction and s(t) is the arterial pulse train. When RR is set to 0, the current breath is completed and the signal then holds at end-expiration. This produces apnea.

**Breath detector.** Band-pass at 0.1–1 Hz, then a hysteresis comparator with thresholds ±h (`resp_thr`). A breath is counted when the signal rises above +h after having fallen below −h. RR = 60 / mean of the last 4 breath intervals, reported once at least 2 intervals exist. Apnea is declared when no breath has been detected for the apnea delay (default 20 s). The RR estimate is null until enough breaths have been seen.

### 3.5 Temperature probe

The probe is a first-order lag:

$$\frac{dT_{probe}}{dt} = \frac{T_{true} - T_{probe}}{\tau}$$

with Gaussian noise of 0.02 °C and τ = `temp_tau` (default 20 s). The state *unavailable* gives a missing value. The state *error* produces a raw reading of −40 °C. The monitor rejects it as implausible, stores it with quality `invalid` and raises a technical alarm.

### 3.6 Oscillometric NIBP

**Forward model.** The brachial artery under the cuff follows an arctangent pressure–volume relation of transmural pressure P = p_art − P_cuff (shape after Langewouters 1984 and Drzewiecki 1994):

$$v(P) = \frac{1}{2} + \frac{1}{\pi}\arctan\frac{P}{w},\qquad w = \begin{cases} 3\ \text{mmHg} & P < 0\ \text{(collapse)} \\ 15\ \text{mmHg} & P \ge 0\ \text{(distension)} \end{cases}$$

Both widths are multiplied by the stiffness setting. They were chosen so that the oscillation maximum falls at the mean arterial pressure for the default 120/80 case. They are not fitted to measured arteries. The cuff pressure seen by the sensor is

$$P_{sensor}(t) = P_c(t) + G\,[v(p_{art} - P_c) - v(DBP - P_c)],\qquad G = 3\ \text{mmHg}$$

**Measurement cycle.**

1. Inflate at 25 mmHg/s to max(160, last SBP + 30) mmHg, capped at 280 mmHg.
2. Deflate linearly at `nibp_deflate` (default 3 mmHg/s).
3. Record one oscillation amplitude per beat.
4. Stop when the oscillations have passed their maximum and fallen away, or the cuff is below 25 mmHg. Then dump at 50 mmHg/s.
5. The whole measurement times out after 120 s.

**Oscillogram analysis (monitor side).**

1. At least 8 beats are required.
2. **Artifact screening.** A beat is rejected if its amplitude exceeds 2 × the median of its 5-beat neighbourhood + 0.2 mmHg. If more than 30 % of beats are rejected, or the mean relative deviation from the local median exceeds 0.15, the measurement fails with "motion artifact (irregular oscillations)".
3. Smooth the remaining amplitudes over 3 beats.
4. MAP_osc is the cuff pressure at the maximum amplitude A_m.
5. **Fixed-ratio method** (Geddes 1982; Forouzanfar 2015): SBP is the cuff pressure above the maximum where the envelope falls to K_s·A_m. DBP is the pressure below the maximum where it falls to K_d·A_m. Defaults are K_s = 0.50 and K_d = 0.80, adjustable. Crossings are linearly interpolated.
6. If the systolic point is not found (cuff not inflated high enough), the cuff re-inflates once to 50 mmHg higher.

**Derived values.** The app also reports two values calculated from SBP and DBP. Their source is marked `derived`:

$$MAP_{formula} = \frac{SBP + 2\,DBP}{3},\qquad PP = SBP - DBP$$

MAP_osc (measured at the oscillation maximum) and MAP_formula (calculated) are shown side by side. Their difference is itself a teaching point.

### 3.7 QRS detector (simplified Pan–Tompkins)

Following Pan & Tompkins (1985), simplified:

1. Band-pass 5–15 Hz.
2. Five-point derivative.
3. Squaring.
4. Moving-window integration over 150 ms.
5. A 2 s learning phase initialises the signal and noise peak levels (SPKI, NPKI).
6. Adaptive threshold: thr = NPKI + 0.25 (SPKI − NPKI).
7. 200 ms refractory period. A candidate within 360 ms of the last QRS whose maximum slope is below half of the previous slope is classified as a T wave.
8. HR = 60 / mean of the last 8 RR intervals.

**Omitted:** the search-back for missed beats and the second (filtered-signal) threshold set of the original algorithm.

## 4. Data model and provenance

Every stored value is an immutable observation:

```
{ id, param, value (number | null), unit, source, timestamp, simTime?, quality, provenance }
```

| Source | Meaning | Examples |
|---|---|---|
| `simulated` | produced by the engine, including its estimators | HR from the QRS detector, SpO₂ from the ratio of ratios |
| `derived` | calculated from other values | BMI, BSA, pulse pressure, MAP formula |
| `device` | received from a connected device | Bluetooth heart-rate strap; HL7 v2 message received over MLLP or a serial port; packet replay and synthetic HL7 feed (with `provenance.replay`) |
| `imported` | loaded from a file | CSV/JSON table; HL7 v2 message file; FHIR R4 Observation or Bundle; SDC MDIB XML |
| `user` | typed in by hand | a temperature read from a thermometer |

Quality is one of `ok`, `low-quality`, `missing`, `invalid` and `artifact`. When the value is `null`, NaN or absent, the observation is always stored with value `null` and quality `missing`. **A missing value is never stored as 0.** Each simulated observation records the method and the set point in its provenance. Each imported one records the file, line and original unit. Each observation from a hospital interface also records the protocol, the original code and code system, the original unit, the equipment or device identifier, the bed/location and the message control ID when present. Patient identity fields are never recorded.

Some parameters exist only as device data: invasive arterial pressure (`art_sys`, `art_dia`, `art_map`, mmHg) and end-tidal CO₂ (`etco2`, mmHg, converted from kPa when needed). They are not simulated. They appear in the trends and can be entered by hand.

The store keeps one series per (source, parameter). Series are never merged across sources. The trend view draws each source separately and draws gaps (no data for longer than 3 × the median sample interval, and at least 3 s) and missing values as breaks in the line.

## 5. Patient profile

- **BMI** = weight (kg) / height (m)².
- **BSA** (Mosteller 1987) = √(height (cm) × weight (kg) / 3600) m².
- The WHO adult BMI categories (< 18.5, 18.5–24.9, 25.0–29.9, ≥ 30) are shown **only from age 20**. Below that the app explains that BMI-for-age references are needed and shows no category.
- Weight history records dated weights and shows the absolute and percentage change.

BMI and BSA are stored as `derived`. They do not change any simulated signal.

## 6. Alarm system

The alarm engine uses the vocabulary of IEC 60601-1-8 (alarm condition, delay, priority, acknowledge, audio paused). It is a teaching model and does **not** claim compliance with that standard.

**Physiological alarms.**

| Parameter | Low | High | Delay |
|---|---|---|---|
| HR (bpm) | 50 | 120 | 5 s |
| SpO₂ (%) | 90 | — | 10 s |
| RR (br/min) | 8 | 30 | 10 s |
| Temp (°C) | 35.5 | 38.5 | 10 s |
| NIBP SYS (mmHg) | 90 | 160 | 0 s (per measurement) |
| NIBP DIA (mmHg) | 50 | 95 | 0 s |
| NIBP MAP (mmHg) | 65 | 115 | 0 s |

These defaults are illustrative and editable. They are not clinical recommendations.

- A condition must persist for the full delay before the alarm becomes active.
- Comparison is strict: a value equal to the limit does not alarm.
- Physiological alarms are medium priority. **Apnea** is high priority and replaces the RR-low alarm.
- Missing values never raise a physiological alarm. They raise a technical alarm instead.

**Technical alarms** (low priority, 2 s delay): ECG leads off, ECG signal lost, SpO₂ no signal, SpO₂ probe off, SpO₂ poor signal quality, resp signal lost, temp probe unavailable, temp probe error, NIBP measurement failed.

**Operator actions.**

- *Acknowledge* silences one alarm. It stays listed until its condition ends.
- *Audio paused* silences all tones for a 120 s countdown. Visual indication continues.
- Alarms are non-latching: an alarm ends when its condition ends.
- Every alarm is written to the history with condition start, activation, end and acknowledge times. The history can be exported as CSV.

## 7. Data import and devices

### 7.1 File import

CSV and JSON files are read locally with `FileReader`. The importer:

- detects the delimiter (`,` `;` tab) and the decimal comma,
- recognises wide tables (one column per parameter) and long tables (`timestamp, parameter, value, unit`),
- maps header synonyms (for example `heart_rate`, `SpO2 (%)`, `resp rate`) and units written in brackets or in column names (`temp_f`, `weight_lb`, `SBP (kPa)`),
- converts to canonical units (°F → °C, lb → kg, in → cm, kPa → mmHg),
- parses ISO 8601 with Z or an offset, naive timestamps in a chosen time zone, epoch seconds or milliseconds, and `DD.MM.YYYY` or `MM/DD/YYYY` dates,
- treats `NA`, `N/A`, `--`, `null` and empty cells as missing,
- range-checks values, drops exact duplicates and reports conflicting duplicates,
- produces an import report: rows read, accepted, missing, invalid lines with reasons, and the column mapping.

Imported data is stored as `imported` and never drives the simulation.

### 7.2 Bluetooth LE standard profiles

`src/devices/gatt.js` implements parsers for the Bluetooth SIG characteristics below, written from the GATT Specification Supplement:

| Service | Characteristic | Values |
|---|---|---|
| Heart Rate 0x180D | Heart Rate Measurement 0x2A37 | HR (uint8 or uint16), sensor contact, energy, RR intervals |
| Pulse Oximeter 0x1822 | PLX Continuous 0x2A5F, PLX Spot-Check 0x2A5E | SpO₂, PR, status words |
| Blood Pressure 0x1810 | BP Measurement 0x2A35, Intermediate Cuff Pressure 0x2A36 | SYS, DIA, MAP in mmHg or kPa, pulse, status bits |
| Health Thermometer 0x1809 | Temperature Measurement 0x2A1C, Intermediate 0x2A1E | °C or °F, measurement site |
| Weight Scale 0x181D | Weight Measurement 0x2A9D | kg or lb, BMI, height |

Device Information (0x180A) and Battery (0x180F) are read when present. Numbers use the IEEE 11073-20601 SFLOAT and FLOAT formats. Their special values (NaN, NRes, ±INFINITY) become missing, never 0.

`webBluetooth.js` requests a device through the browser's chooser, filtered by these services. It subscribes to notifications and indications, and reconnects with 1-2-4-8-16 s backoff after an unexpected disconnect. Web Bluetooth requires a secure context (https or `http://localhost`) and a Chromium-based browser, so it does not work from `file://`.

**Packet replay.** `replay.js` plays a fixed, synthetic script of 138 packets through the same parsers. The script includes a truncated packet and a NaN temperature. Replayed observations have source `device` but carry `provenance.replay` and are shown with a SYNTHETIC badge. Replay lets the device path be demonstrated and tested without hardware. It is not a device test.

### 7.3 Hospital device interfaces

See `DEVICE_INTEGRATION_REPORT.md` for the full description. In summary:

- The **Devices** tab starts with a device-type picker of 12 generic classes (bedside monitor, central station or gateway, spot-check monitor, pulse oximeter, automated BP monitor, thermometer, ECG telemetry, capnograph, ventilator, scale, wearable patch or hub, EHR export). Each class lists the routes such devices typically offer, and each route shows whether it is available in the current runtime.
- **HL7 v2 ORU^R01** in the IHE PCD-01 style is read from three routes: a TCP listener using MLLP framing (desktop app only, binds to `127.0.0.1` by default, answers with an ACK), a serial port through Web Serial (no ACK, the app never writes to the port), and a file or pasted text.
- **FHIR R4** Observation resources and Bundles, and **SDC MDIB** XML snapshots (IEEE 11073-10207), are read from files. Live SDC networking is not implemented.
- Codes are mapped from MDC reference identifiers, then MDC numeric codes, then LOINC. Only seven MDC numeric codes were cross-checked against published values; matches through the others are labelled "numeric code not confirmed" in the provenance.
- A **bed/location** filter (HL7 PV1-3) can drop messages for other beds. Patient identity segments (PID and similar) and FHIR person resources are counted and ignored, never stored. Messages with processing ID `T` or `D` are flagged as synthetic.
- A **synthetic HL7 feed** of 20 messages for two beds demonstrates the live path without hardware. It is not a device test.

## 8. Assumptions

1. A single ECG lead with a fixed morphology, scaled by heart rate. No conduction disorders are modelled.
2. The arterial pulse has a fixed shape and a fixed 0.20 s arrival time. Pressure, PPG and respiration share the same beat times.
3. The PPG is two-wavelength transmission with a linear R-to-SpO₂ calibration. No venous pulsation, no ambient light, no dyshaemoglobins.
4. Respiration is a regular oscillator with I:E = 1:2. No sighs, no obstructive pattern.
5. NIBP uses an arctangent artery model, a linear deflation, one amplitude per beat and fixed ratios. The cuff and limb tissue are not modelled.
6. Temperature is a first-order lag with no site differences.
7. Set points change instantly. There is no physiological coupling between parameters; for example, changing SpO₂ does not change HR.
8. Default alarm limits and delays are illustrative.

## 9. Limitations

These were observed or are known from the model design:

- **NIBP under motion.** At motion ≥ 20 % the oscillometric measurement usually fails with a motion-artifact message. This is intended behaviour, but the threshold is a teaching choice.
- **SpO₂ under motion** is biased toward about 85 % (R → 1), and SQI drops. The low-SQI quality flag and technical alarm show this. The value itself is not corrected.
- **Hypotension preset.** At 82/48 mmHg the oscillometric DBP estimate can land just above the 50 mmHg limit, so the DIA-low alarm may not fire. This is a real-world limitation of fixed-ratio estimation and is left visible as a teaching example.
- **QRS detector** has no search-back, so dropouts and very noisy ECG can cause missed beats and HR errors.
- **RR estimate** is null for the first breaths after a start or reset.
- **SpO₂ calibration** is the linear example line, not a device calibration.
- **Imported timestamps without a time zone** are read in the zone chosen in the import panel. Device clocks that carry no zone information cannot be corrected automatically.
- A column named `rr` is read as respiratory rate, not as an RR interval.
- **Web Bluetooth and Web Serial** need a Chromium browser and a secure context, or the desktop app. No real BLE device, serial device, monitor, central station or gateway was connected in this project (see `TEST_REPORT.md`).
- **MDC numeric codes.** Only the seven codes marked `checked: true` in `src/devices/mdc.js` were cross-checked. A device that sends only numeric codes for the other parameters (for example NIBP, invasive pressure, EtCO₂ or pulse rate) may be mapped wrongly or not at all until the codes are confirmed in NIST RTMMS.
- **MLLP listener** was tested in Node only. It was not exercised inside the packaged desktop app, because headless Electron crashes on the test machine (exit code 139). MLLP has no encryption and no authentication.
- **Serial route** sends no ACK. A sender that waits for an ACK will stall.
- **SDC** is file-only. Live SDC (WS-Discovery, TLS, SOAP) is not implemented.
- **Windows build.** The zip was built on Linux; the installer and portable `.exe` are built by a CI workflow that has not been run yet. No Windows build was started on Windows. The executable is unsigned, so Windows SmartScreen shows a warning.
- Measurements are not persisted between sessions. Only the chosen device type and bed/location are kept in the browser's `localStorage`.

## 10. References

See `REFERENCES.md` for the full list and what each reference supports.
