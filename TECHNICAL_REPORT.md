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
| Simulation | `src/sim/params.js`, `rng.js`, `dsp.js`, `ecg.js`, `arrhythmia.js`, `pulse.js`, `sensors.js`, `nibp.js`, `detectors.js`, `glucose.js`, `engine.js` | Parameters, presets, signal models, arrhythmia patterns, glucose–insulin model and projection, estimators, the time-stepping engine |
| Alarms | `src/alarms/alarmEngine.js`, `severity.js` | Limit checks, rhythm alarms, delays, priorities, acknowledge, audio pause, history |
| Data I/O | `src/data/csv.js`, `importer.js` | CSV/JSON parsing, column mapping, units, time zones, validation |
| Lessons | `src/lessons/lessons.js` | Lesson content (objectives, steps, quiz questions) and quiz grading; no DOM |
| Device parser and bridge | `src/devices/gatt.js`, `androidBridge.js` | Parser for the Bluetooth Heart Rate Measurement characteristic (0x2A37); conversion of Health Connect records and BLE packets from the Android app into observations |
| UI | `src/ui/*.js` (including `chainPanel.js`, `lessonsPanel.js`, `androidPanel.js`, `glucosePanel.js`), `index.html`, `css/` | Canvas rendering, panels and wiring. Tabs: Controls, NIBP, Alarms, Trends, Glucose, Data import/export, Profile, Signal chain, Lessons, Science, Tests, References |
| Android host | `android/` (Kotlin) | WebView wrapper around the same page, with a Health Connect reader, a native BLE Heart Rate client and a save dialog for exports (not tested with real hardware) |

The simulation, alarm, data and parser modules never touch the DOM. Each uses a UMD wrapper, so the same file runs in the browser (`window.PM.*`) and in Node for the unit tests. There is no build step and no ES-module import, so `index.html` also works from `file://`.

**Website and Android app.** The page is published as a static website at https://hafij-bge.github.io/patient-monitoring/ by the GitHub Actions workflow `.github/workflows/pages.yml`, which runs the unit tests and then deploys `index.html`, `css/`, `src/` and `fixtures/`. It can also be served locally (`python3 -m http.server 8766`) or opened from `file://`. The Content Security Policy (`connect-src 'none'`) means the page makes no network requests. The Android app (`android/`, package `edu.deu.pmsim`, version 1.3.0) wraps the same page in a WebView. It is the only place where real watch data enters (section 7.2) and it has not been tested with real hardware. The earlier Electron desktop app (with the hospital routes and the Windows build) was removed on 2026-10-28. For v1.1.0 a new, minimal Linux desktop app was added in `desktop/`: an Electron shell that shows the same page from inside a `.deb` package, with no preload script, no Node access in the page and no device access, so the page's CSP applies unchanged. It was smoke-tested under a virtual X display (Xvfb): the page loaded and the browser self-test of v1.1.0 gave 14 passed, 0 failed, 1 not run. After the glucose model was added the self-test has 16 entries; the browser run gave 15 passed, 0 failed, 1 not run.

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
6. **Set-point change.** If the simulated SBP or DBP moves more than 5 mmHg from its value at the start of the measurement, or the stiffness setting changes, the measurement is aborted with "patient pressure changed during measurement; repeat". Without this rule an oscillogram that mixes beats from two pressure levels can still pass the analysis below and give a wrong reading (before the fix, a switch from 120/80 to 78/42 during deflation gave 121/112 mmHg flagged `ok`). The rule uses the known set point, which a real monitor does not have (see section 9).

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
7. 200 ms refractory period. A candidate within 360 ms of the last QRS whose maximum slope (largest derivative over the 150 ms integration window) is below half of the previous QRS slope is classified as a T wave.
8. The beat time is the largest band-passed sample in the same 150 ms window (the R peak). Using the integrator peak itself moved the mark by up to ±60 ms, because small ripples on the integrator plateau create several local maxima. This jitter did not change the averaged HR, but it made regular rhythms look irregular to the SVT rule (RR coefficient of variation > 0.06 at 180 bpm).
9. HR = 60 / mean of the last 8 RR intervals.

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

**Patient side** (`src/sim/arrhythmia.js`, `ecg.js`). The `arrhythmia` control selects one teaching pattern: none, AF, SVT, PVC, VT, VF or asystole. The patterns are simplified shapes for teaching. They are not models of the electrophysiology.

- **Ventricular (wide) beats** reuse the McSharry ODE of section 3.1 with a different event set: no P wave, Q at −35 ms (SD 30 ms, −0.08), R at 0 (SD 40 ms, 1), S at +75 ms (SD 40 ms, −0.45) and a discordant T wave at min(0.3 s, 0.42 · RR) (SD 75 ms, −0.35). Times and widths are converted to angles, and amplitudes to aᵢ = Aᵢ · ω / bᵢ². The wide beat is scaled to 1.3 × `ecg_amp_mv`. These values are teaching choices.
- **AF:** no P waves. RRᵢ = mean · (0.55 + 0.9 U), U ~ uniform(0, 1). A fibrillatory baseline of 6–9 Hz (sum of 4 sines with a random-walk frequency and a slow amplitude envelope) with amplitude 0.07 × `ecg_amp_mv` is added.
- **SVT:** a normal narrow beat without the P wave (hidden in the QRS, as in typical AV-nodal re-entry [55, 56]), at the set heart rate and beat-to-beat variability. Fast, regular timing comes from the scenario (HR 180, variability SD 3 ms).
- **PVC:** each normal cycle is followed by an early wide beat with probability min(0.5, `pvc_per_min`/HR), never two in a row. The early beat comes at about 0.6 × the mean interval and is followed by a compensatory pause.
- **VT:** every beat is wide, at the set heart rate.
- **VF:** no beats. The ECG is a fibrillatory signal of 3–7 Hz with amplitude 0.5 × `ecg_amp_mv`.
- **Asystole:** no beats and a flat ECG (noise and wander are still added at acquisition).

Without beats, perf falls (section 3.2), so ART, pleth and the CO₂ plateau fall as well. Presets: *AF pattern*, *SVT pattern* (HR 180, 106/72 mmHg), *Frequent PVCs* (14/min), *V-Tach pattern* (HR 170, 85/55 mmHg), *V-Fib pattern (no output)* and *Asystole pattern*.

**Monitor side** (`RhythmAnalyzer` in `src/sim/detectors.js`). The analyser works on a 0.5–40 Hz band-passed copy of the ECG, keeps 6 s of it and uses the QRS times of section 3.7.

- **QRS width** is measured around the largest deflection near each detected QRS (last 0.32 s), as the span where the signal stays above 15 % of the peak, relative to the median of the last 2 s. A complex is *wide* above 75 ms. This threshold was tuned on the simulator's own waveforms; the measured width reads lower than a clinical QRS duration.
- Once per second the rules below are checked in order. The first match gives the label:
  1. leads off, or a signal loss within the last 2 s → *Not analysed*,
  2. first 8 s → *Learning*,
  3. peak-to-peak below 0.3 mV over 4 s → *Asystole*,
  4. no QRS for 4 s → *V-Fib* if the signal is mostly not flat, else *Asystole*,
  5. median width wide and RR coefficient of variation > 0.3 (at least 3 widths) → *V-Fib*,
  6. last 4 complexes wide and rate > 100 bpm → *V-Tach*,
  7. last 8 complexes narrow, rate > 150 bpm and their RR coefficient of variation < 0.06 → *SVT*,
  8. coefficient of variation of narrow-to-narrow intervals > 0.12 (at least 6 intervals) → *Irregular*,
  9. any wide complex in the last 60 s → *PVCs*,
  10. otherwise → *Regular*.
- The SVT rule uses rate, width and regularity only. It does not look for P waves, so a sinus rhythm above 150 bpm also reads *SVT*. Telling the two apart needs the P waves, the onset and the response to vagal manoeuvres [56]. The thresholds are illustrative.
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

**Controls tab** (`buildControls` in `src/ui/panels.js`). One row per parameter, built from `SPEC`. *Simple* view shows 11 main controls (HR, arrhythmia pattern, SYS, DIA, SpO₂, RR, EtCO₂, temperature, motion, SpO₂ probe state, NIBP interval). Any other control is shown as well when it is not at its default value or an active alarm points to it, so a scenario never hides what it changed. *Advanced* shows all 62. The explanation text is hidden unless *Show explanations* is ticked; it is also the tooltip of the control name.

**Lessons tab** (`src/lessons/lessons.js`, `src/ui/lessonsPanel.js`). Eight guided lessons: ECG signal chain, pulse oximetry, NIBP, rhythms, capnography, arterial line, alarms and deterioration before cardiac arrest (8–10 min each). Each lesson has objectives, a button that loads its scenario (preset), steps that can set controls or open a tab, and a quiz of 3 multiple-choice questions with an explanation for each answer. A unit test checks that the quiz answers about the model (for example the ratio R of the desaturation preset) agree with the simulator. The best score per lesson is kept in the browser's `localStorage` only; it is not measurement data.

**Monitor screen.** Six sweeping waveforms: ECG, pleth (auto scale), ART (0–200 mmHg), respiration (auto scale), CO₂ (0–60 mmHg) and cuff pressure (0–300 mmHg). Respiration, CO₂ and cuff sweep at 6.25 mm/s. The HR tile also shows the rhythm label and the PVC rate. The ART tile shows SYS/DIA (MAP) with the set point and the SYS limits. The EtCO₂ tile shows FiCO₂ and awRR. The page layout adapts to narrow screens (one column at 1100 px and below, a phone layout at 720 px and below).

### 3.12 Scenarios (presets) and the scenario selector

A scenario sets **every** patient-profile, physiological and sensor control: it starts from the defaults and applies its own changes, so nothing from the previous scenario remains. Processing and display settings (filters, sweep, averaging, NIBP interval, speed, seed) are kept. When any patient or sensor control is changed by hand, in Controls or in the Profile tab, the selector shows **Custom (edited)**. If the values are changed back to those of a scenario, the selector shows that scenario again (`matchPreset` in `src/sim/params.js`).

There are 50 scenarios. The first 25 change one or two signs, or one sensor setting. The other 25 are **combined-sign patterns taken from the literature**. Each lists its sources (field `refs`, entries 28–44, 51 and 55–68 of `REFERENCES.md`) and a teaching note, which the app shows when the scenario is loaded.

| Scenario | Values (others at default) | Sources |
|---|---|---|
| Blood loss, ATLS class II | HR 110, 118/92 mmHg, RR 24 | 28, 29 |
| Blood loss, ATLS class III | HR 130, 88/68 mmHg, RR 32, PI 0.8 % | 28–30 |
| Infection screening (SIRS / qSOFA) | HR 112, RR 24, 96/58 mmHg, 38.7 °C | 31 |
| Acute allergic reaction | 78/42 mmHg, HR 128, SpO₂ 90 %, obstruction 60 %, RR 24, EtCO₂ 30 | 32, 33, 35 |
| Hypoventilation masked by O₂ | RR 7, EtCO₂ 55 (SpO₂ stays 97 %) | 34, 35 |
| Compensatory hyperventilation | RR 28, EtCO₂ 24, HR 115, 102/64 mmHg | 35, 36 |
| Dead-space pattern (PE-type) | HR 115, SpO₂ 89 %, 105/70 mmHg, EtCO₂ 30, RR 24 | 37, 38 |
| Hypothermia stage II | 30.5 °C, HR 45, 92/58 mmHg, RR 9, PI 0.3 % | 39 |
| Hypermetabolic, early (MH-type) | EtCO₂ 60, HR 125, RR 12, 37.6 °C | 40, 41 |
| Hypermetabolic, late (MH-type) | EtCO₂ 75, HR 145, RR 12, 39.5 °C, PVC pattern | 40, 41 |
| Obstructive hypercapnic (COPD-type) | SpO₂ 89 %, EtCO₂ 52, obstruction 60 %, RR 24, HR 100 | 35, 42 |
| Raised-potassium ECG, early | T-wave size 1.9× | 43 |
| Raised-potassium ECG, late | T 1.9×, P 0.3×, QRS width 1.7× | 43 |
| Raised-ICP reflex (Cushing) | 200/90 mmHg, HR 46, RR 8 | 44 |
| SVT pattern | SVT rhythm (no P wave), HR 180, variability SD 3 ms, 106/72 mmHg | 55, 56 |
| Hyperglycaemic-crisis pattern (DKA-type) | type 1 diabetes, fasting glucose 320 mg/dL, no basal insulin, RR 28, EtCO₂ 24, HR 115, 102/64 mmHg | 35, 36, 51 |
| Pre-arrest deterioration (hours before) | RR 31, SpO₂ 88 %, HR 122, 86/52 mmHg, EtCO₂ 30 | 57–59 |
| Peri-arrest (minutes before arrest) | RR 4, SpO₂ 68 %, HR 36, 60/32 mmHg, EtCO₂ 18, PI 0.15 % | 59, 60 |
| Acute stroke pattern (high blood pressure) | 192/104 mmHg, HR 84, SpO₂ 96 % | 61, 62 |
| Heart failure, acute pulmonary oedema (warm-wet) | 178/102 mmHg, HR 118, RR 32, SpO₂ 86 %, EtCO₂ 32 | 63, 64 |
| Heart failure, low output with congestion (cold-wet) | 92/74 mmHg, HR 112, RR 26, SpO₂ 90 %, PI 0.5 % | 63, 64 |
| Heart failure, cardiogenic shock (SCAI stage C) | 78/54 mmHg, HR 118, RR 28, SpO₂ 88 %, EtCO₂ 28, PI 0.3 % | 63, 65 |
| Post-operative opioid respiratory depression (ward, room air) | RR 6, SpO₂ 86 %, EtCO₂ 62, HR 58, 104/62 mmHg | 66, 34, 35 |
| Post-operative hypothermia with shivering | 35.2 °C, HR 96, motion 35 %, PI 0.8 % | 67 |
| Post-operative pulmonary complication (atelectasis type) | SpO₂ 89 %, RR 26, HR 104, EtCO₂ 34 | 68 |

Where a source gives a range (for example ATLS class III: HR 120–140, RR 30–40) the value lies inside it. Where a source gives only a direction (for example "pulse pressure decreased", "bradycardia"), the number is an **illustrative choice** in that direction. The ECG scale factors for raised potassium are illustrative; the source gives only the order of the changes, and the patterns carry no potassium values. The DKA-type pattern shows only glucose above 250 mg/dL together with the compensatory breathing of [35, 36]; ketones, pH and potassium are not modelled. The critical-illness and post-operative scenarios also show what the monitor **cannot** see, and their notes say so. In the peri-arrest pattern the low EtCO₂ comes from low pulmonary blood flow; pulseless electrical activity (PEA) is not modelled, because the model always couples a QRS complex to a pulse. The stroke pattern shows only the blood pressure (above the 185/110 mmHg limit for thrombolysis [61]); the neurological deficit is not visible on a monitor. The cold-wet heart-failure pattern has a proportional pulse pressure of (92 − 74)/92 < 25 % [64] but raises no default alarm, although it is the profile with the highest risk. Cardiogenic shock raises the same alarms as the blood-loss pattern; venous pressure and right-ventricular failure are not modelled. In the shivering pattern the SpO₂ of about 85 % is a motion artefact (set point 97 %) that the signal quality index does not flag (section 9). The monitor cannot tell atelectasis from pneumonia or pulmonary embolism. A unit test (`tests/unit/critical.test.js`) checks the alarms each of these scenarios raises. Every scenario is an illustrative pattern for education only. Real presentations vary and the values are not diagnostic. A unit test checks that every sourced scenario passes validation without clamping, that its references exist in `REFERENCES.md` and that no two scenarios have the same settings.

### 3.13 Glucose–insulin model and projection

`src/sim/glucose.js` (pure, no DOM) adds plasma glucose and insulin to the simulated patient. It joins three published model parts. Time is in minutes. Numbers in brackets are entries in `REFERENCES.md`.

```
Glucose, Bergman minimal model [45], insulin action in the form of [47]:
  dG/dt = −(SG + X)·G + SG·Gb + Ra          G  plasma glucose, mg/dL
  dX/dt = −p2·X + p2·SI·(I − Ib)            X  insulin action, 1/min
Meal absorption, two-compartment gut [48]:
  dD1/dt = −D1/tG,  dD2/dt = (D1 − D2)/tG,  Ra = D2/tG · MW/VG     a meal adds AG·carbs to D1
Subcutaneous insulin [48]:
  dS1/dt = u − S1/tI,  dS2/dt = (S1 − S2)/tI,  dI/dt = S2/(tI·VI) − ke·I + secretion
Endogenous secretion (no diabetes and type 2 only):
  secretion = ke·I_fast + σ·max(0, G − Gb)
```

The model starts in steady state at the set fasting glucose Gb and the set basal rate u. Only I − Ib acts on glucose, so the fasting insulin value sets the level shown in the tile, not the glucose response. MW = 180.16 mg/mmol (molar mass of glucose); 1 mmol/L = 18.016 mg/dL. The integration is forward Euler with steps of at most 0.5 min. G is held in 1–1000 mg/dL and I ≥ 0. The uptake term SG + X is held at ≥ 0, which keeps the system bounded; [53] discusses this property of the minimal model.

| Parameter | Value | Source |
|---|---|---|
| VG, glucose distribution volume | 0.16 L/kg (1.6 dL/kg) | [48] |
| VI, insulin distribution volume | 0.12 L/kg | [48] |
| ke, insulin elimination | 0.138 /min | [48] |
| tI, subcutaneous absorption time-to-maximum | 55 min | [48] |
| AG, carbohydrate bioavailability | 0.8 | [48] |
| tG, meal appearance time-to-maximum | 40 min | [48] |
| p2, insulin action rate | 0.0113 /min (mean of the 10 subjects in Table 1 of [47], calculated here) | [47] |
| SG, glucose effectiveness | 0.026 /min (normal subjects, regular FSIGT) | [46] |
| SI, no diabetes | 4.1 × 10⁻⁴ /min per µU/mL | [49] |
| SI, type 2 | 0.61 × 10⁻⁴ /min per µU/mL | [49] |
| SI, type 1 | 4.1 × 10⁻⁴ (inside the type 1 range of [47]) | [47], [49] |
| Secretion, type 1 | none (structural choice, as in [47]) | [47] |
| σ, secretion gain above fasting | 0.1 µU/mL per min per mg/dL | **illustrative** |
| Secretion gain, type 2 | 0.5 × σ | **illustrative**, direction from [50] |
| Fasting insulin | user-set, 2–50 µU/mL (default 10) | **illustrative** |

σ was chosen so the "no diabetes" model returns close to fasting within about 3 h after a 50 g meal. It is not a fitted or published value.

**Controls** (group *Glucose and insulin* in the Controls tab): fasting glucose 50–400 mg/dL, fasting insulin 2–50 µU/mL, basal insulin 0–5 U/h. The *glucose model time scale* (1×, 10× or 60×) is in the processing group. The default is 60×: one simulated second is one model minute, so a meal response is visible within a few minutes. Diabetes status (none, type 1, type 2) and weight are in the patient profile, which is part of the Controls tab. Changing diabetes status, fasting glucose, fasting insulin or weight restarts the model in steady state. Changing the basal rate acts as a step change from the current state.

**Glucose tab** (`src/ui/glucosePanel.js`). *Give now* adds a meal (0–200 g carbohydrate) or a subcutaneous bolus (0–30 U) to the running model. *Projection* runs a copy of the model forward 2, 3 or 4 h (`forecast()` in `glucose.js`) with an optional planned meal and bolus at chosen minutes. It draws this curve next to the same model with no further events. It reports the first time glucose crosses 70, 54, 180 and 250 mg/dL and the percentage of time in 70–180 mg/dL. The thresholds are the consensus CGM ranges of [52] and the level 1 and level 2 hypoglycaemia values of [51]. The plot and the tab carry the label "Model projection, not a clinical prediction". The projection uses population parameters. It is not fitted to any person, does not learn from data and is not dosing advice.

**Monitor and alarms.** The GLU tile shows glucose in mg/dL and mmol/L, insulin in µU/mL and the model clock, with a "model" badge. There is no glucose sensor or CGM model, so the value shown is the model value. Glucose and insulin are stored as `simulated` observations with the method text "(model value, no sensor)". Alarm defaults: glucose < 70 or > 180 mg/dL (medium priority), and < 54 mg/dL (level 2, high priority).

**Measured behaviour** (`tests/unit/glucose.test.js`). Fasting 90 mg/dL, 50 g meal, no basal insulin. Peak / 2 h / 4 h values: no diabetes 167 / 120 / 83 mg/dL; type 2 183 / 162 / 100; type 1 without insulin 185 / 167 / 105. In type 1 (fasting 200 mg/dL, basal 0.8 U/h) a 6 U bolus lowers the 4 h value by more than 10 mg/dL.

### 3.14 Derived 12-lead ECG

**Model** (`src/sim/ecg12.js`). The McSharry equation for z is linear in z, so its solution is the sum of five parts z_i(t), one per event (P, Q, R, S, T), each driven by its own Gaussian term. `ecg.js` integrates every z_i with RK4 using the same forcing values as the sum, so the monitor ECG is unchanged. Each event is given a fixed spatial direction d_i in Frank coordinates (X left, Y feet, Z back), and the heart vector is

  VCG(t) = g · Σ_i z_i(t) · d_i / (h_II · d_i)

where h_II is the lead II row of the Dower matrix. The scaling makes the projection on lead II equal to the single-lead monitor ECG at every sample. Leads I, II and V1–V6 come from the Dower transform s = D · VCG [69, 70]; III, aVR, aVL and aVF from Einthoven's and Goldberger's relations [71]. Ventricular beats (PVC, VT) use a second set of directions: broad QRS negative in V1 and positive in V6, inferior axis, T opposite the QRS. AF f-waves lie along an atrial direction that is large in V1. VF adds a second fibrillation signal along a direction that lead II cannot see (h_II · n = 0), so the chest leads differ from lead II. Asystole gives a zero vector.

**Acquisition** (`acquireLeads12` in `src/sim/engine.js`). Lead II of the 12-lead ring is the monitor signal itself. Lead I and V1–V6 get the same baseline wander and mains interference as lead II plus their own white noise; III, aVR, aVL and aVF are then formed from the noisy I and II, as an ECG cart does. Every lead passes through its own copy of the display filter chain. When the electrodes are off (contact < 10 %) all 12 leads are missing (NaN), never zero.

**View** (`src/ui/ecg12Panel.js`). Clicking the ECG waveform, or its *12-lead* button, opens a dialog with the last 10 s in the standard 3 × 4 layout (each column 2.5 s of the same recording) and a 10 s lead II rhythm strip, on 1 mm / 5 mm grid paper at 25 mm/s and 10 mm/mV with a 1 mV calibration pulse [71]. The header gives the monitor HR, the filter, the sampling rate and the frontal QRS axis. The axis is computed from the model beat (net Q + R + S area in I and aVF, one noise-free cycle): +49° for a normal beat and +83° for VT, stable within 5° from 40 to 200 bpm and QRS width 0.8–1.5×. The view refreshes once a second and can be held or saved as a PNG that carries the educational notice.

**Event directions** (unit vectors before scaling):

| Event | Normal beat (X, Y, Z) | Ventricular beat (X, Y, Z) |
|---|---|---|
| P | (0.85, 0.5, −0.1) | (0.85, 0.5, −0.1) |
| Q | (−0.5, −0.6, −0.4) | (−0.4, −0.8, −0.45) |
| R | (0.8, 0.5, 0.3) | (0.4, 0.8, 0.45) |
| S | (−0.6, −0.2, 0.8) | (−0.3, −0.5, 0.4) |
| T | (0.85, 0.45, −0.3) | (−0.4, −0.8, −0.45) |

These are teaching values chosen to give a normal adult pattern (rS in V1, transition V3–V4, qR in V5–V6, upright T in I, II and V3–V6, everything negative in aVR). They are not fitted to recorded vectorcardiograms.

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

Age, sex, height, weight and diabetes status are simulation parameters (group *Patient profile* at the top of the Controls tab). The Profile tab shows and edits the same values, so both always agree, and a change in either sets the scenario selector to Custom. Ranges: age 18–100 years (the vital-sign models are adult), height 120–220 cm, weight 30–250 kg. The label and the weight history stay in the Profile tab only.

- **BMI** = weight (kg) / height (m)².
- **BSA** (Mosteller 1987) = √(height (cm) × weight (kg) / 3600) m².
- The WHO adult BMI categories (< 18.5, 18.5–24.9, 25.0–29.9, ≥ 30) are shown **only from age 20**. Below that the app explains that BMI-for-age references are needed and shows no category.
- Weight history records dated weights and shows the absolute and percentage change.

BMI and BSA are stored as `derived`. Age, sex, height, BMI and BSA do not change any simulated signal. Weight and diabetes status are inputs of the glucose model only (section 3.13).

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
| Glucose (mg/dL, model value) | 70 | 180 | 0 s |

These defaults are illustrative and editable. They are not clinical recommendations.

- A condition must persist for the full delay before the alarm becomes active.
- Comparison is strict: a value equal to the limit does not alarm.
- Physiological alarms are medium priority. **Apnea** is high priority and replaces the RR-low alarm.
- Missing values never raise a physiological alarm. They raise a technical alarm instead.
- **Glucose level 2:** below 54 mg/dL a separate high-priority alarm "GLUCOSE < 54 (level 2)" is raised as well. The 70, 180 and 54 mg/dL values follow [51, 52].
- **Extreme lows:** below HR 40 bpm ("EXTREME BRADY") and below SpO₂ 80 % ("SpO₂ < 80 (severe)") a separate high-priority alarm is raised on top of the medium limit alarm, with the same delay. It is switched off together with its limit. Without it a patient close to arrest showed only medium-priority alarms. The two values are illustrative teaching values, not taken from a device or guideline (`EXTREME_LOW` in `src/alarms/alarmEngine.js`).

**Rhythm alarms** come from the rhythm label of section 3.10. The priorities follow the spirit of IEC 60601-2-27; they do not claim compliance.

| Rhythm label | Message | Priority | Delay |
|---|---|---|---|
| Asystole | ASYSTOLE | high | 0 s |
| V-Fib | V-FIB | high | 0 s |
| V-Tach | V-TACH | high | 0 s |
| SVT | SVT | medium | 0 s |
| Irregular | Irregular HR | medium | 10 s |
| PVCs, rate > 10/min | PVCs > 10/min | medium | 0 s |

**Technical alarms** (low priority, 2 s delay): ECG leads off, ECG signal lost, SpO₂ no signal, SpO₂ probe off, SpO₂ poor signal quality, resp signal lost, temp probe unavailable, temp probe error, NIBP measurement failed, CO₂ no signal (sampling line disconnected), ART no pulsatile signal (line open to air?).

**Operator actions.**

- *Acknowledge* silences one alarm. It stays listed until its condition ends.
- *Audio paused* silences all tones for a 120 s countdown. Visual indication continues.
- Alarms are non-latching: an alarm ends when its condition ends.
- Every alarm is written to the history with condition start, activation, end and acknowledge times. The history can be exported as CSV.

**Showing several alarms and where they come from** (`src/alarms/severity.js`). The alarm bar lists **every** active alarm, highest priority first, after a count such as "3 alarms: 1 high, 2 medium". Each active alarm is also linked to the tiles and the controls it concerns (for example SpO₂ probe off → SpO₂ tile and the *SpO₂ probe state* control; low SQI → SpO₂ tile and the motion, PPG noise and perfusion controls). Tiles and controls are coloured by the highest priority present: red for high, amber for medium, dashed cyan for technical (low). The alarm text is shown inside the tile and under the control. A control whose value differs from its default is marked "not default". The colours follow only what the alarm engine reports; `severity.js` contains no thresholds of its own.

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

1. A single ECG lead with a fixed morphology, scaled by heart rate. The arrhythmia patterns (AF, SVT, PVC, VT, VF, asystole) are simplified teaching shapes. No other conduction disorders are modelled.
2. The arterial pulse has a fixed shape and a fixed 0.20 s arrival time. Pressure, PPG, capnogram and respiration share the same beat and breath times. Circulation is reduced to one perfusion state (section 3.2).
3. The PPG is two-wavelength transmission with a linear R-to-SpO₂ calibration. No venous pulsation, no ambient light, no dyshaemoglobins.
4. Respiration is a regular oscillator with I:E = 1:2. No sighs. Expiratory obstruction is shown only in the capnogram shape, not in the impedance signal.
5. The capnogram is a phase-driven shape, not a gas-exchange model. The sampling delay of a sidestream line is not modelled.
6. The arterial line is a linear second-order system with fixed f_n and ζ per damping setting. There is no flush test and no air bubble or clot model.
7. NIBP uses an arctangent artery model, a linear deflation, one amplitude per beat and fixed ratios. The cuff and limb tissue are not modelled.
8. Temperature is a first-order lag with no site differences.
9. Set points change instantly. There is no physiological coupling between parameters; for example, changing SpO₂ does not change HR. The only coupling is through the perfusion state: when beats stop, ART, pleth and the CO₂ plateau fall.
10. Default alarm limits and delays are illustrative.
11. Glucose and insulin follow the population model of section 3.13. They are not coupled to the cardiovascular or respiratory signals; the DKA-type scenario sets those signs separately.

## 9. Limitations

These were observed or are known from the model design:

- **NIBP under motion.** At motion ≥ 20 % the oscillometric measurement usually fails with a motion-artifact message. This is intended behaviour, but the threshold is a teaching choice.
- **NIBP set-point change.** A measurement is aborted when the simulated SBP or DBP changes by more than 5 mmHg while it runs (section 3.6). The simulator can do this because it knows the set point. A real monitor has to detect an unstable patient from the oscillations themselves, and the oscillogram analysis here does not test for a two-level envelope. Gradual changes of up to 5 mmHg are accepted and can bias the reading by a similar amount.
- **SpO₂ under motion** is biased toward about 85 % (R → 1). The value is not corrected. SQI (consistency of R across four 1-s windows) drops for mild motion (mean 43 at motion 15, 60 s run) but rises again under strong motion (mean 75 at motion 70), because then the artefact itself sets a steady R ≈ 1. The low-SQI flag (SQI < 40) therefore catches only some mild-motion windows and misses strong motion (`motion` and `postop-hypothermia` scenarios: 0 flagged frames in 90 s).
- **Hypotension preset.** At 82/48 mmHg the oscillometric DBP estimate can land just above the 50 mmHg limit, so the DIA-low alarm may not fire. This is a real-world limitation of fixed-ratio estimation and is left visible as a teaching example.
- **12-lead ECG** is derived from one moving dipole with fixed directions per wave. It shows textbook normal and ventricular patterns only. It cannot show regional ST changes, infarct Q waves, bundle-branch blocks other than the VT shape, a biphasic P in V1 or electrode misplacement. Scenarios that change a wave (for example the raised-potassium T wave) change it in every lead in the same proportion. It is not a diagnostic ECG.
- **QRS detector** has no search-back, so dropouts and very noisy ECG can cause missed beats and HR errors.
- **HR in the AF pattern reads low.** With a set HR of 110 the displayed HR is about 75–85 bpm. The ECG model scales the QRS amplitude with the beat interval, so the short beats of AF have a small QRS that does not cross the detection threshold. The irregular-rhythm alarm still fires. Not fixed.
- **RR estimate** is null for the first breaths after a start or reset.
- **SpO₂ calibration** is the linear example line, not a device calibration.
- **Imported timestamps without a time zone** are read in the zone chosen in the import panel. Device clocks that carry no zone information cannot be corrected automatically.
- A column named `rr` is read as respiratory rate, not as an RR interval.
- **Rhythm analysis** is a set of simple rules, not a validated arrhythmia algorithm. It was checked only on the simulator's own patterns. The 75 ms width threshold was tuned on these waveforms, so the measured QRS width reads lower than a clinical QRS duration. Noisy ECG or dropouts can give wrong labels.
- **Capnography and arterial line** parameters (wave shape constants, f_n, ζ, the perfusion time constants) are illustrative. They show the effects qualitatively and are not fitted to measured data.
- **Watch data** (Android app only) has not been tested with any real watch, heart-rate sensor or Health Connect store. Consumer wearable readings are not clinical measurements (see `TEST_REPORT.md`).
- **Glucose model.** Population parameters only; no person is fitted. Renal glucose excretion, glucagon, counter-regulation, exercise and the change of endogenous glucose output with insulin are not modelled. Without insulin action, glucose still returns towards fasting through SG (glucose effectiveness), so untreated type 1 hyperglycaemia resolves slowly in the model, unlike in reality. Minimal-model SI is lower than clamp-derived sensitivity (about 66 % lower in [54]), so a bolus has a modest effect. Secretion gain σ, the type 2 factor 0.5 and fasting insulin are illustrative. There is no CGM or glucose meter model (no sensor lag, no noise). Ketones and pH are not modelled.
- Measurements are not persisted between sessions. Only the best lesson quiz scores, the Controls view choice and the Bedside view on/off state are kept, in the browser's `localStorage` (keys `pmsim.lessons.v1`, `pmsim.controls.v1`, `pmsim.bedside`).

## 10. References

See `REFERENCES.md` for the full list and what each reference supports.
