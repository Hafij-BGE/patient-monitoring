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
| Simulation | `src/sim/params.js`, `rng.js`, `dsp.js`, `ecg.js`, `arrhythmia.js`, `pulse.js`, `sensors.js`, `nibp.js`, `detectors.js`, `engine.js` | Parameters, presets, signal models, arrhythmia patterns, estimators, the time-stepping engine |
| Alarms | `src/alarms/alarmEngine.js` | Limit checks, rhythm alarms, delays, priorities, acknowledge, audio pause, history |
| Data I/O | `src/data/csv.js`, `importer.js` | CSV/JSON parsing, column mapping, units, time zones, validation |
| Lessons | `src/lessons/lessons.js` | Lesson content (objectives, steps, quiz questions) and quiz grading; no DOM |
| Device parser and bridge | `src/devices/gatt.js`, `androidBridge.js` | Parser for the Bluetooth Heart Rate Measurement characteristic (0x2A37); conversion of Health Connect records and BLE packets from the Android app into observations |
| UI | `src/ui/*.js` (including `chainPanel.js`, `lessonsPanel.js`, `androidPanel.js`), `index.html`, `css/` | Canvas rendering, panels and wiring. Tabs: Controls, NIBP, Alarms, Trends, Data import/export, Profile, Signal chain, Lessons, Science, Tests, References |
| Android host | `android/` (Kotlin) | WebView wrapper around the same page, with a Health Connect reader, a native BLE Heart Rate client and a save dialog for exports (not tested with real hardware) |

The simulation, alarm, data and parser modules never touch the DOM. Each uses a UMD wrapper, so the same file runs in the browser (`window.PM.*`) and in Node for the unit tests. There is no build step and no ES-module import, so `index.html` also works from `file://`.

**Website and Android app.** The page is published as a static website at https://hafij-bge.github.io/patient-monitoring/ by the GitHub Actions workflow `.github/workflows/pages.yml`, which runs the unit tests and then deploys `index.html`, `css/`, `src/` and `fixtures/`. It can also be served locally (`python3 -m http.server 8766`) or opened from `file://`. The Content Security Policy (`connect-src 'none'`) means the page makes no network requests. The Android app (`android/`, package `edu.deu.pmsim`, version 1.1.0) wraps the same page in a WebView. It is the only place where real watch data enters (section 7.2) and it has not been tested with real hardware. The earlier Electron desktop app (with the hospital routes and the Windows build) was removed on 2026-10-28. For v1.1.0 a new, minimal Linux desktop app was added in `desktop/`: an Electron shell that shows the same page from inside a `.deb` package, with no preload script, no Node access in the page and no device access, so the page's CSP applies unchanged. It was smoke-tested under a virtual X display (Xvfb): the page loaded and the browser self-test gave 14 passed, 0 failed, 1 not run.

### 2.1 Time base

The engine advances in fixed steps of **Δt = 1 ms**. Each subsystem samples at its own rate:

| Signal | Model rate | Acquired rate | Notes |
|---|---|---|---|
| ECG | 1000 Hz (ODE) | `ecg_fs` = 125, 250, 500 or 1000 Hz | decimated from the 1 kHz model |
| PPG red/IR | — | 125 Hz | |
| Impedance respiration | — | 50 Hz | |
| Capnogram (CO₂) | — | 50 Hz | driven by the respiration phase |
| Arterial line (ART) | 1000 Hz (transducer ODE) | 125 Hz | |
| Cuff pressure | — | 100 Hz | |
| Numerics, rhythm analysis, temperature, alarms | — | 1 Hz | one *frame* per simulated second |

Waveforms are kept in 60 s ring buffers. For the Signal chain tab the engine also keeps the intermediate signals of each stage ("taps") for the last 12 s. The UI calls `engine.advance(dt × speed)` from `requestAnimationFrame`, with dt capped at 0.1 s, so the playback speed (0.25–4×) changes simulated time, not the models.

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

then limited to 0.5–1.6 × the mean interval and to 0.25–3 s. The irregular mode is a timing demonstration only. It does not model atrial fibrillation. A separate AF teaching pattern (no P waves, fibrillatory baseline) is described in section 3.10.

**Acquisition.** At `ecg_fs` the acquired signal is

$$x(t) = z(t) + A_w\left[\sin(2\pi\varphi_{resp}) + 0.3\sin(2\pi \cdot 0.05\,t)\right] + n(t)\,(1 + 4(1-q)^2) + A_m (1 + 4(1-q))\sin(2\pi f_m t)$$

where A_w is the baseline-wander amplitude, φ_resp the respiration phase, n(t) Gaussian noise with SD `ecg_noise_uv`, q the electrode contact quality (0–1), and A_m, f_m the mains amplitude and frequency. Below 10 % contact the leads are off and the sample is NaN (missing). Random dropouts also produce NaN.

**Display filter.** Monitor mode is a 0.5–40 Hz band-pass, diagnostic mode is 0.05–150 Hz, or off. An optional mains notch at 50 or 60 Hz (Q = 30) follows. The QRS detector sees the unfiltered acquired signal.

**Important.** The ECG is generated only from the simulator's own heart-rate setting. It is never generated from a heart rate imported from a file, typed in, or received from a device or watch. A heart-rate number does not contain the information needed to produce an ECG.

### 3.2 Arterial pulse

The arterial pulse is a shape function triggered by each simulated beat, delayed by a fixed pulse arrival time of **0.20 s** after the R peak. Over one beat, with u = time since pulse onset divided by the beat interval:

$$s(u) = g(u; 0.18, 0.07) + 0.45\, g(u; 0.45, 0.09),\qquad g(u;\mu,\sigma) = \exp\!\left(-\frac{(u-\mu)^2}{2\sigma^2}\right)$$

The sum is detrended and normalised to 0…1. The first Gaussian stands for the systolic wave and the second for a late reflected or diastolic component. The shape and the 0.20 s delay are **illustrative teaching choices**, not values fitted to measured data.

**True arterial pressure.** The pressure in the artery, used by the cuff model (section 3.6) and the arterial line (section 3.9), is

$$p_{art}(t) = P_{MSF} + (DBP - P_{MSF})\cdot perf + (SBP - DBP)\cdot\min(1, s(t))$$

- P_MSF = 10 mmHg is an illustrative mean systemic filling pressure: the level the arteries settle to without heartbeats.
- perf (0–1) is a perfusion state. It relaxes toward 1 with a time constant of 0.8 s while beats arrive. When no beat has come for 2 × 60/HR + 0.5 s (V-Fib, asystole), it decays with a time constant of 1.5 s. Both time constants are illustrative.
- Each beat in the pulse train has an amplitude: 1 for a normal beat, 0.4 for a PVC and 0.5 for a V-Tach beat (teaching choices). A weak beat therefore gives a smaller pulse in the pleth, the ART trace and the cuff oscillations.

With regular beats, perf stays at 1 and the formula reduces to DBP + (SBP − DBP) · s(t).

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

### 3.8 Capnography (sidestream CO₂)

**Forward model.** The CO₂ partial pressure c (mmHg) at the sampling line follows the respiration phase φ of section 3.4. FiCO₂ is the inspired level (`fico2`, 0 by default) and the plateau is

$$c_{plateau} = FiCO_2 + \max(0,\ EtCO_2 - FiCO_2)\cdot(0.15 + 0.85\,perf)$$

where EtCO₂ is the alveolar set point (`etco2`, default 38 mmHg) and perf is the perfusion state of section 3.2. When the circulation stops, the plateau falls toward 15 % of its normal height above FiCO₂.

- **Inspiration** (φ < 1/3): the line is washed out, c = FiCO₂ + (c_end − FiCO₂) · exp(−φ/0.012), where c_end is the value at the end of the previous expiration.
- **Expiration**, with u = (φ − 1/3)/(2/3):
  - Dead space first: c = FiCO₂ while u < 0.06.
  - Then an exponential rise to the plateau with a small upward slope:
    $$c = Fi + (c_{plateau} - Fi)\,\frac{1 - e^{-v/\tau}}{1 - e^{-1/\tau}}\,(0.94 + 0.06\,v),\qquad v = \frac{u - 0.06}{0.94}$$
  - τ = 0.035 + 0.35 · `airway_obstr`/100. Expiratory obstruction slows the rise and gives a sloped, "shark-fin" upstroke.
- **Apnea** (RR = 0): c = FiCO₂.
- Gaussian noise with SD 0.25 mmHg is added and the result is clipped at 0. A disconnected sampling line (`capno_sensor`) gives NaN.

The phase constants, the time constants and the 15 %/85 % split are **illustrative teaching choices**.

**Estimator (monitor side).** A breath starts when c rises above a threshold. The threshold is 4 mmHg for the first breath. After that it is max(2, 0.5 · (last EtCO₂ − last minimum) · exp(−Δt/6 s)), where Δt is the time since the last breath ended. The breath ends when c falls below FiCO₂ + 0.5 · (breath maximum − FiCO₂).

- EtCO₂ = the maximum of the breath.
- FiCO₂ = the minimum during inspiration.
- awRR (airway respiratory rate) = 60 / mean of the last 4 breath intervals, reported once at least 2 intervals exist.
- All three are null if no breath was detected within the apnea delay.
- A NaN sample within the last 1 s raises the technical condition "CO₂ no signal".

Presets: *Hypoventilation (high EtCO2)* (RR 6, EtCO₂ 58 mmHg), *Obstructed expiration* (obstruction 80 %, RR 22) and *CO2 rebreathing* (FiCO₂ 6 mmHg).

### 3.9 Invasive arterial pressure (fluid-filled line)

**Forward model.** A fluid-filled catheter–transducer system is modelled as a second-order system, the standard teaching model for a catheter–transducer line (Gardner 1981):

$$\ddot x + 2\zeta\omega_n\dot x + \omega_n^2 x = \omega_n^2\,(p_{art} - 0.7356\cdot h)$$

- x is the pressure reported by the transducer (mmHg) and ω_n = 2π f_n.
- p_art is the true arterial pressure of section 3.2.
- h is the transducer height above heart level (`ibp_height_cm`, −30 to +30 cm). 0.7356 mmHg/cm converts a water column to mmHg, so a transducer that is too high reads low.
- The line state "open to air" sets the input to 0.
- The equation is integrated with semi-implicit Euler at 1 kHz. The output is sampled at 125 Hz with Gaussian noise of SD 0.3 mmHg.

| `ibp_damping` | f_n | ζ | Effect |
|---|---|---|---|
| optimal | 20 Hz | 0.6 | follows the true pressure |
| under-damped | 6 Hz | 0.1 | ringing, systolic overshoot, diastolic undershoot |
| over-damped | 4 Hz | 1.5 | blunted trace, systolic reads low |

These f_n and ζ values are **illustrative**, chosen to make each case visible. They are not measured values of any catheter. The DC gain is 1 in all three cases, so the mean pressure is kept.

**Estimator (monitor side).** Over the last 4 s (at least 1 s of data): SYS = maximum, DIA = minimum, MAP = mean. If SYS − DIA < 5 mmHg and |MAP| < 5 mmHg, the technical condition "ART no pulsatile signal" is raised and no ART value is reported.

Presets: *Under-damped arterial line* and *Transducer too high* (20 cm).

### 3.10 Arrhythmia patterns and rhythm analysis

**Patient side** (`src/sim/arrhythmia.js`, `ecg.js`). The `arrhythmia` control selects one teaching pattern: none, AF, PVC, VT, VF or asystole. The patterns are simplified shapes for teaching. They are not models of the electrophysiology.

- **Ventricular (wide) beats** reuse the McSharry ODE of section 3.1 with a different event set: no P wave, Q at −35 ms (SD 30 ms, −0.08), R at 0 (SD 40 ms, 1), S at +75 ms (SD 40 ms, −0.45) and a discordant T wave at min(0.3 s, 0.42 · RR) (SD 75 ms, −0.35). Times and widths are converted to angles, and amplitudes to aᵢ = Aᵢ · ω / bᵢ². The wide beat is scaled to 1.3 × `ecg_amp_mv`. These values are teaching choices.
- **AF:** no P waves. RRᵢ = mean · (0.55 + 0.9 U), U ~ uniform(0, 1). A fibrillatory baseline of 6–9 Hz (sum of 4 sines with a random-walk frequency and a slow amplitude envelope) with amplitude 0.07 × `ecg_amp_mv` is added.
- **PVC:** each normal cycle is followed by an early wide beat with probability min(0.5, `pvc_per_min`/HR), never two in a row. The early beat comes at about 0.6 × the mean interval and is followed by a compensatory pause.
- **VT:** every beat is wide, at the set heart rate.
- **VF:** no beats. The ECG is a fibrillatory signal of 3–7 Hz with amplitude 0.5 × `ecg_amp_mv`.
- **Asystole:** no beats and a flat ECG (noise and wander are still added at acquisition).

Without beats, perf falls (section 3.2), so ART, pleth and the CO₂ plateau fall as well. Presets: *AF pattern*, *Frequent PVCs* (14/min), *V-Tach pattern* (HR 170, 85/55 mmHg), *V-Fib pattern (no output)* and *Asystole pattern*.

**Monitor side** (`RhythmAnalyzer` in `src/sim/detectors.js`). The analyser works on a 0.5–40 Hz band-passed copy of the ECG, keeps 6 s of it and uses the QRS times of section 3.7.

- **QRS width** is measured around the largest deflection near each detected QRS (last 0.32 s), as the span where the signal stays above 15 % of the peak, relative to the median of the last 2 s. A complex is *wide* above 75 ms. This threshold was tuned on the simulator's own waveforms; the measured width reads lower than a clinical QRS duration.
- Once per second the rules below are checked in order. The first match gives the label:
  1. leads off, or a signal loss within the last 2 s → *Not analysed*,
  2. first 8 s → *Learning*,
  3. peak-to-peak below 0.3 mV over 4 s → *Asystole*,
  4. no QRS for 4 s → *V-Fib* if the signal is mostly not flat, else *Asystole*,
  5. median width wide and RR coefficient of variation > 0.3 (at least 3 widths) → *V-Fib*,
  6. last 4 complexes wide and rate > 100 bpm → *V-Tach*,
  7. coefficient of variation of narrow-to-narrow intervals > 0.12 (at least 6 intervals) → *Irregular*,
  8. any wide complex in the last 60 s → *PVCs*,
  9. otherwise → *Regular*.
- PVC rate = wide complexes × 60 / max(10 s, time span covered).
- For V-Fib and asystole the HR value is reported as missing.

These rules are **not a validated arrhythmia algorithm**. A clinical arrhythmia detector is tested against annotated ECG databases (IEC 60601-2-27); this one was not.

### 3.11 Monitor screen, signal chain view and lessons

**Signal chain tab** (`src/ui/chainPanel.js`). For one channel at a time the tab plots each stage of the chain from the engine taps, with its unit and a short note:

| Channel | Stages | Readout |
|---|---|---|
| ECG | patient model (mV) → electrodes, amplifier and ADC → display filter → Pan–Tompkins integrator output with the adaptive threshold and the detected QRS marks | HR, rhythm, QRS width |
| SpO₂ / pleth | red channel → IR channel → ln, 0.5–5 Hz band-pass, inverted | R, SpO₂ (instant and averaged), SQI, status |
| Respiration | demodulated impedance (Ω) → 0.1–1 Hz band-pass with the ± hysteresis thresholds and breath marks | RR, threshold |
| Arterial line | pressure in the artery → transducer output with the true pressure drawn behind it, on the same scale | SYS/DIA (MAP), f_n, ζ, height |
| Capnography | CO₂ partial pressure | EtCO₂, FiCO₂, awRR |

The last stage can be saved as a PNG image.

**Lessons tab** (`src/lessons/lessons.js`, `src/ui/lessonsPanel.js`). Seven guided lessons: ECG signal chain, pulse oximetry, NIBP, rhythms, capnography, arterial line and alarms (8–10 min each). Each lesson has objectives, a button that loads its scenario (preset), steps that can set controls or open a tab, and a quiz of 3 multiple-choice questions with an explanation for each answer. A unit test checks that the quiz answers about the model (for example the ratio R of the desaturation preset) agree with the simulator. The best score per lesson is kept in the browser's `localStorage` only; it is not measurement data.

**Monitor screen.** Six sweeping waveforms: ECG, pleth (auto scale), ART (0–200 mmHg), respiration (auto scale), CO₂ (0–60 mmHg) and cuff pressure (0–300 mmHg). Respiration, CO₂ and cuff sweep at 6.25 mm/s. The HR tile also shows the rhythm label and the PVC rate. The ART tile shows SYS/DIA (MAP) with the set point and the SYS limits. The EtCO₂ tile shows FiCO₂ and awRR. The page layout adapts to narrow screens (one column at 1100 px and below, a phone layout at 720 px and below).

## 4. Data model and provenance

Every stored value is an immutable observation:

```
{ id, param, value (number | null), unit, source, timestamp, simTime?, quality, provenance }
```

| Source | Meaning | Examples |
|---|---|---|
| `simulated` | produced by the engine, including its estimators | HR from the QRS detector, SpO₂ from the ratio of ratios, EtCO₂ from the capnogram, ART SYS/DIA/MAP from the arterial line |
| `derived` | calculated from other values | BMI, BSA, pulse pressure, MAP formula |
| `device` | received from a wearable through the Android app | Health Connect records and Bluetooth Heart Rate Measurement packets (`androidBridge.js`, `gatt.js`) |
| `imported` | loaded from a file | CSV/JSON table, including a health-app export file |
| `user` | typed in by hand | a temperature read from a thermometer |

Quality is one of `ok`, `low-quality`, `missing`, `invalid` and `artifact`. When the value is `null`, NaN or absent, the observation is always stored with value `null` and quality `missing`. **A missing value is never stored as 0.** Each simulated observation records the method and the set point in its provenance. Each imported one records the file, line and original unit. Each device observation records the route, the device name and the raw packet bytes.

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
| EtCO₂ (mmHg) | 30 | 45 | 10 s |
| ART SYS (mmHg) | 90 | 160 | 5 s |
| ART MAP (mmHg) | 65 | 110 | 5 s |

These defaults are illustrative and editable. They are not clinical recommendations.

- A condition must persist for the full delay before the alarm becomes active.
- Comparison is strict: a value equal to the limit does not alarm.
- Physiological alarms are medium priority. **Apnea** is high priority and replaces the RR-low alarm.
- Missing values never raise a physiological alarm. They raise a technical alarm instead.

**Rhythm alarms** come from the rhythm label of section 3.10. The priorities follow the spirit of IEC 60601-2-27; they do not claim compliance.

| Rhythm label | Message | Priority | Delay |
|---|---|---|---|
| Asystole | ASYSTOLE | high | 0 s |
| V-Fib | V-FIB | high | 0 s |
| V-Tach | V-TACH | high | 0 s |
| Irregular | Irregular HR | medium | 10 s |
| PVCs, rate > 10/min | PVCs > 10/min | medium | 0 s |

**Technical alarms** (low priority, 2 s delay): ECG leads off, ECG signal lost, SpO₂ no signal, SpO₂ probe off, SpO₂ poor signal quality, resp signal lost, temp probe unavailable, temp probe error, NIBP measurement failed, CO₂ no signal (sampling line disconnected), ART no pulsatile signal (line open to air?).

**Operator actions.**

- *Acknowledge* silences one alarm. It stays listed until its condition ends.
- *Audio paused* silences all tones for a 120 s countdown. Visual indication continues.
- Alarms are non-latching: an alarm ends when its condition ends.
- Every alarm is written to the history with condition start, activation, end and acknowledge times. The history can be exported as CSV.

## 7. Data import and watch data

### 7.1 File import

CSV and JSON files are read locally with `FileReader`. The importer handles CSV and JSON tables only. It:

- detects the delimiter (`,` `;` tab) and the decimal comma,
- recognises wide tables (one column per parameter) and long tables (`timestamp, parameter, value, unit`),
- maps header synonyms (for example `heart_rate`, `SpO2 (%)`, `resp rate`) and units written in brackets or in column names (`temp_f`, `weight_lb`, `SBP (kPa)`),
- converts to canonical units (°F → °C, lb → kg, in → cm, kPa → mmHg),
- parses ISO 8601 with Z or an offset, naive timestamps in a chosen time zone, epoch seconds or milliseconds, and `DD.MM.YYYY` or `MM/DD/YYYY` dates,
- treats `NA`, `N/A`, `--`, `null` and empty cells as missing,
- range-checks values, drops exact duplicates and reports conflicting duplicates,
- produces an import report: rows read, accepted, missing, invalid lines with reasons, and the column mapping.

Imported data is stored as `imported` and never drives the simulation. Values can also be typed in (manual entry, source `user`) and exported as CSV or JSON by source.

### 7.2 Watch data in the Android app (not tested with real hardware)

On 2026-10-28 the Devices tab and all other device integration were removed from the web page: HL7 v2 (MLLP, serial, files), FHIR R4 and IEEE 11073 SDC import, the MDC code mapping, Web Bluetooth, Web Serial and the packet replay. The reason is the owner's decision to keep the project focused on the simulator. See `DEVICE_INTEGRATION_REPORT.md`.

Real wearable data now enters only through the Android app (`android/`), by three routes:

1. **Android Health Connect.** The app reads heart rate, SpO₂, respiratory rate, blood pressure, body temperature, weight, height and steps, read-only, after the user grants each permission. Any watch that writes to Health Connect can be a source (for example through its own companion app).
2. **Native Bluetooth LE Heart Rate Service 0x180D.** The Kotlin side scans for the service, connects over GATT and subscribes to the Heart Rate Measurement characteristic 0x2A37. It passes the raw bytes to the page as hex.
3. **Import of a health-app export file** (CSV/JSON) through the table importer of section 7.1.

`src/devices/gatt.js` is the only device module that remains. It parses the Heart Rate Measurement characteristic (written from the Bluetooth SIG GATT Specification Supplement): flags, HR as uint8 or uint16, sensor contact, energy expended and RR intervals (units of 1/1024 s). A packet with the contact bits reporting "not detected" is stored with quality `artifact`; HR 0 is stored as missing, never as 0; a truncated packet is rejected. The parser is covered by 3 Node tests and one browser self-test scenario.

**Page-side bridge** (`src/devices/androidBridge.js`, no DOM):

- `healthConnectToObservations` turns Health Connect records into observations with source `device`. A record is rejected, with a reason, when its type is not supported, its value is not a number, it has no time, or its unit cannot be converted. A value outside the parameter's plausible range is rejected ("outside min–max unit"), never clamped. Exact duplicates (parameter, time, value) are dropped. The provenance records the route `health-connect`, the record type, the data origin (the app that wrote the record), the original value and unit, and that the time is the record time.
- `bleHeartRateToObservations` takes the hex string of one 0x2A37 packet, parses it with `gatt.js` and stores the result as `device` with the route `ble-hrs`, the device name, the receive time and the raw hex.

**"On this phone" panel** (`src/ui/androidPanel.js`, in the Data import/export tab). It is shown only when the page runs inside the Android app (`window.PMAndroid` exists). In a normal browser it stays hidden. It offers:

- Health Connect: availability status, a button to request the read permissions, a period of the last 1, 7 or 30 days, a button to read the records, and a button to install or update Health Connect. The result message lists how many values were stored and rejected, with the reasons.
- Bluetooth LE: scan, stop scan and disconnect; a list of found devices (name, address, signal strength) with a Connect button; the last heart rate, the contact state and RR intervals; the body sensor location if the device reports it. A malformed packet is ignored with a message.

The app sends its results to the page as `pmandroid` events. The stored values appear in the Trends tab as a separate `device` series.

**Exports in the app.** In the Android WebView a download link does nothing. When `window.PMAndroid` exists, every export of the page (CSV, JSON, alarm history, PNG) is passed to the app instead, which opens the Android save dialog. In a browser the normal download is used.

The WebView page is served from the app's own assets and has no network access; the app has no `INTERNET` permission. HONOR's own watch protocol is proprietary and is not used. **Status: not hardware-tested.** The bridge and the panel were checked only with unit tests and a mock `PMAndroid` object in a desktop browser. No watch, heart-rate sensor or Health Connect store was used in any test.

## 8. Assumptions

1. A single ECG lead with a fixed morphology, scaled by heart rate. The arrhythmia patterns (AF, PVC, VT, VF, asystole) are simplified teaching shapes. No other conduction disorders are modelled.
2. The arterial pulse has a fixed shape and a fixed 0.20 s arrival time. Pressure, PPG, capnogram and respiration share the same beat and breath times. Circulation is reduced to one perfusion state (section 3.2).
3. The PPG is two-wavelength transmission with a linear R-to-SpO₂ calibration. No venous pulsation, no ambient light, no dyshaemoglobins.
4. Respiration is a regular oscillator with I:E = 1:2. No sighs. Expiratory obstruction is shown only in the capnogram shape, not in the impedance signal.
5. The capnogram is a phase-driven shape, not a gas-exchange model. The sampling delay of a sidestream line is not modelled.
6. The arterial line is a linear second-order system with fixed f_n and ζ per damping setting. There is no flush test and no air bubble or clot model.
7. NIBP uses an arctangent artery model, a linear deflation, one amplitude per beat and fixed ratios. The cuff and limb tissue are not modelled.
8. Temperature is a first-order lag with no site differences.
9. Set points change instantly. There is no physiological coupling between parameters; for example, changing SpO₂ does not change HR. The only coupling is through the perfusion state: when beats stop, ART, pleth and the CO₂ plateau fall.
10. Default alarm limits and delays are illustrative.

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
- **Rhythm analysis** is a set of simple rules, not a validated arrhythmia algorithm. It was checked only on the simulator's own patterns. The 75 ms width threshold was tuned on these waveforms, so the measured QRS width reads lower than a clinical QRS duration. Noisy ECG or dropouts can give wrong labels.
- **Capnography and arterial line** parameters (wave shape constants, f_n, ζ, the perfusion time constants) are illustrative. They show the effects qualitatively and are not fitted to measured data.
- **Watch data** (Android app only) has not been tested with any real watch, heart-rate sensor or Health Connect store. Consumer wearable readings are not clinical measurements (see `TEST_REPORT.md`).
- Measurements are not persisted between sessions. Only the best lesson quiz scores are kept, in the browser's `localStorage`.

## 10. References

See `REFERENCES.md` for the full list and what each reference supports.
