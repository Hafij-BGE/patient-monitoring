# Technical Report: VitalsLab, an Interactive Patient Monitor Simulator

Md. Hafijur Rahman. Homework 2, *Interactive Medical Device Simulator*. Dokuz Eylül University, 2026.

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

## 1. Purpose and scope

A multiparameter bedside patient monitor acquires several physiological signals at once, estimates numeric values from them, compares the numerics with alarm limits, and shows waveforms, numerics and trends. VitalsLab reproduces this chain in a browser, at teaching level:

```
simulated physiology  →  sensor forward model  →  acquisition (sampling, noise, filters)
        (set points)        (ECG, PPG, impedance,        →  monitor estimators (QRS detector,
                             cuff, temperature probe)        ratio of ratios, oscillometry,
                                                             breath detector)  →  numerics  →  alarms
```

The set point of every parameter is known, so the app shows each estimate next to the value that produced it. The difference is the measurement error of the simulated monitor. This is the main teaching point: a monitor reports an *estimate*, and the estimate depends on the sensor, the noise and the algorithm.

**What VitalsLab is not.** It is not a validated physiological model, it does not reproduce any commercial monitor's algorithms or interface, and it makes no claim of clinical accuracy. All constants that are teaching choices, rather than published values, are marked as such below.

## 2. Architecture

| Layer | Files | Role |
|---|---|---|
| Core data | `src/core/observation.js`, `units.js`, `profile.js`, `store.js` | Observation model, unit conversion, BMI/BSA and profile calculators, per-source time series |
| Simulation | `src/sim/params.js`, `rng.js`, `dsp.js`, `ecg.js`, `arrhythmia.js`, `pulse.js`, `sensors.js`, `nibp.js`, `detectors.js`, `glucose.js`, `engine.js` | Parameters, presets, signal models, arrhythmia patterns, glucose–insulin model and projection, estimators, the time-stepping engine |
| Alarms | `src/alarms/alarmEngine.js`, `severity.js` | Limit checks, rhythm alarms, delays, priorities, acknowledge, audio pause, history |
| Data I/O | `src/data/csv.js`, `importer.js` | CSV/JSON parsing, column mapping, units, time zones, validation |
| Lessons | `src/lessons/lessons.js` | Lesson content (objectives, steps, quiz questions) and quiz grading; no DOM |
| Device parser and bridge | `src/devices/gatt.js`, `androidBridge.js` | Parser for the Bluetooth Heart Rate Measurement characteristic (0x2A37); conversion of Health Connect records and BLE packets from the Android app into observations |
| UI | `src/ui/*.js` (including `chainPanel.js`, `lessonsPanel.js`, `androidPanel.js`, `glucosePanel.js`), `index.html`, `css/` | Canvas rendering, panels and wiring. Tabs: Controls, NIBP, Alarms, Trends, Glucose, Data import/export, Profile, Signal chain, Lessons, Science, Tests, References |
| Android host | `android/` (Kotlin) | WebView wrapper around the same page, with a Health Connect reader, a native BLE Heart Rate client and a save dialog for exports (not tested with real hardware) |

The simulation, alarm, data and parser modules never touch the DOM. Each uses a UMD wrapper, so the same file runs in the browser (`window.PM.*`) and in Node for the unit tests. There is no build step and no ES-module import, so `index.html` also works from `file://`.

**Website and Android app.** The page is published as a static website at https://hafij-bge.github.io/patient-monitoring/ by the GitHub Actions workflow `.github/workflows/pages.yml`, which runs the unit tests and then deploys `index.html`, `css/`, `src/`, `fixtures/` and `community/`. It can also be served locally (`python3 -m http.server 8766`) or opened from `file://`. The Content Security Policy (`connect-src 'none'`) means the page makes no network requests; the only outbound route is a link to a GitHub issue page that the user opens by hand (section 3.12, *Community scenarios*). The Android app (`android/`, package `edu.deu.pmsim`, version 1.5.0) wraps the same page in a WebView. It is the only place where real watch data enters (section 7.2) and it has not been tested with real hardware. The earlier Electron desktop app (with the hospital routes and the Windows build) was removed on 2026-10-28. For v1.1.0 a new, minimal Linux desktop app was added in `desktop/`: an Electron shell that shows the same page from inside a `.deb` package, with no preload script, no Node access in the page and no device access, so the page's CSP applies unchanged. It was smoke-tested under a virtual X display (Xvfb): the page loaded and the browser self-test of v1.1.0 gave 14 passed, 0 failed, 1 not run. After the glucose model and the derived 12-lead ECG were added the self-test has 17 entries; the browser run on 2026-10-29 gave 16 passed, 0 failed, 1 not run (`TEST_REPORT.md` section 3).

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

### 3.1 ECG: Gaussian-event model after McSharry et al.

The ECG follows the dynamical model of McSharry et al. (2003). A point moves on the unit limit cycle with angular velocity ω = 2π / RRᵢ, and the ECG z is driven by five Gaussian events P, Q, R, S, T:

$$\dot z = -\sum_{i \in \{P,Q,R,S,T\}} a_i\,\Delta\theta_i\,\exp\!\left(-\frac{\Delta\theta_i^2}{2 b_i^2}\right),\qquad \Delta\theta_i = (\theta - \theta_i) \bmod 2\pi$$

**Exact solution instead of numerical integration.** Without the original relaxation term −(z − z₀) this integrates exactly to a sum of Gaussians, which is what the code evaluates:

$$z(\theta) = \sum_i A_i \exp\!\left(-\frac{\Delta\theta_i^2}{2 b_i^2}\right),\qquad A_i = \frac{a_i b_i^2}{\omega}$$

The relaxation term was removed on purpose. With τ = 1 s it pulled the T–P baseline 0.05–0.3 mV below zero depending on heart rate, while a real T–P segment is isoelectric. The earlier Runge–Kutta integration is no longer needed.

**Events in seconds, not radians.** Each event is defined by its time from the R peak tᵢ, its width σᵢ and its height Aᵢ. They are converted to phase with the ω of the interval they sit in (θᵢ = ω·tᵢ, bᵢ = ω·σᵢ, aᵢ = Aᵢ·ω/bᵢ²). P, QRS and T therefore keep their durations and heights when the R–R interval changes. The `ecgsyn` θ and b scaling (h = √(HR/60)) made QRS width and height change with each cycle's length, which mattered for irregular rhythms; it is no longer used.

| Event | t from R (s) | σ (s) | A (model units) |
|---|---|---|---|
| P | −0.165 | 0.020 | 0.0119 |
| Q | −0.024 | 0.009 | −0.0080 |
| R | 0 | 0.009 | 0.0477 |
| S | 0.024 | 0.009 | −0.0119 |
| T | set from QT (below) | 0.05 · QT / 0.40 | 0.0191 |

The heights are those of McSharry Table I at 60 bpm (A = a·b²/ω), so the P:Q:R:S:T ratios are unchanged. The output is scaled so that the R peak equals `ecg_amp_mv` (default 1.0 mV); T is then 0.41 mV.

**QT follows the preceding R–R interval.** QT = 0.40 − 0.154·(1 − RR) s, the Framingham linear formula (Sagie et al. 1992, REFERENCES [82]), with RR limited to 0.25–2 s. Framingham and Fridericia gave the best rate correction in 6 609 adults in sinus rhythm below 90 bpm [88]. The T peak is placed so that the T wave falls to 25 µV exactly QT after the QRS onset: T end = peak + σ·√(2 ln(0.41 mV / 25 µV)) ≈ peak + 2.37 σ. The QRS onset is where the Q wave (0.17 mV) crosses 25 µV, about 2.05 σ before the Q peak.

**Measured intervals.** The intervals below were measured on the clean simulated signal with `node tests/tools/ecg-intervals.js`. Each boundary is where that wave's own share of the signal crosses 25 µV, so T and P can be measured even where they overlap. Reference ranges are 95 % ranges of normal adult ECGs: PR 125–196 ms and QRS 69–103 ms in 32 949 ECGs [86], with similar limits in 486 014 primary-care ECGs [87].

| HR (bpm) | P (ms) | PR (ms) | QRS (ms) | QT measured (ms) | QT Framingham (ms) | TP segment |
|---|---|---|---|---|---|---|
| 50 | 86 | 167 | 84 | 428 | 431 | isoelectric |
| 60 | 86 | 167 | 84 | 398 | 400 | isoelectric |
| 72 | 86 | 167 | 84 | 372 | 374 | isoelectric |
| 100 | 86 | 167 | 84 | 336 | 338 | isoelectric |
| 150 | 86 | 167 | 84 | 305 | 308 | none: T and next P overlap (lowest point between them 0.37 mV) |

The measured QT is 2–3 ms shorter than the formula at every rate because the 25 µV level is reached slightly inside the Gaussian tails. This is well below the 10–20 ms spread between QT measurements by different readers or algorithms.

At 150 bpm the cycle is 400 ms, so T and the next P wave run together. This also happens in real sinus tachycardia, but the exact overlap here is a property of the Gaussian shapes, not a validated model.

**Teaching controls.** `qrs_width` stretches Q, R and S in time with their heights kept. QRS onset moves earlier and P moves with it, so PR stays the same. QT grows by the QRS widening, so the JT interval is unchanged. At `qrs_width` 1.5 the measured QRS is 127 ms, PR stays 167 ms and QT is 46 ms longer at every rate (444 ms at 60 bpm). `p_scale` and `t_scale` multiply the P and T heights (a negative `t_scale` inverts the T wave). These are illustrative deformations, not models of specific conduction disorders. In a real bundle-branch block the R peak sits late in a wide QRS; here the QRS widens symmetrically.

**QT and QTc on the monitor.** The HR tile shows the model's QT for the last supraventricular beat and its QTc by the formula chosen in Profile → Formulas (section 5.2). This QT is the value the model placed, not a value measured from the noisy trace. It is blank for ventricular beats, VF and asystole and outside RR 0.3–2 s. Because the model's QT follows Framingham, Framingham QTc stays at 400 ms at every rate, while Bazett QTc rises at fast rates (for example 411 ms at 72 bpm and above 420 ms at 120 bpm). This is the over-correction reported in [88].

**Beat timing.** Each RR interval is drawn when a beat starts:

- regular: RRᵢ = 60/HR + N(0, σ²), where σ = `hrv_ms`,
- irregular: RRᵢ = (60/HR) · (0.65 + 0.7 U), U ~ uniform(0, 1), that is, uniformly within ±35 %,

then limited to 0.5–1.6 × the mean interval and to 0.25–3 s. The irregular mode is a timing demonstration only. It does not model atrial fibrillation. A separate AF teaching pattern (no P waves, fibrillatory baseline) is described in section 3.10.

**Acquisition.** At `ecg_fs` the acquired signal is

$$x(t) = z(t) + A_w\left[\sin(2\pi\varphi_{resp}) + 0.3\sin(2\pi \cdot 0.05\,t)\right] + n(t)\,(1 + 4(1-q)^2) + A_m (1 + 4(1-q))\sin(2\pi f_m t)$$

where A_w is the baseline-wander amplitude, φ_resp the respiration phase, n(t) Gaussian noise with SD `ecg_noise_uv`, q the electrode contact quality (0–1), and A_m, f_m the mains amplitude and frequency. Below 10 % contact the leads are off and the sample is NaN (missing). Random dropouts also produce NaN.

**Display filter.** Monitor mode is a 0.5–40 Hz band-pass, diagnostic mode is 0.05–150 Hz, or off. An optional mains notch at 50 or 60 Hz (Q = 30) follows. The QRS detector sees the unfiltered acquired signal.

**Important.** The ECG is generated only from the simulator's own heart-rate setting. It is never generated from a heart rate imported from a file, typed in, or received from a device or watch. A heart-rate number does not contain the information needed to produce an ECG.

### 3.2 Arterial pulse (three-element Windkessel)

The true arterial pressure is produced by a three-element Windkessel (Westerhof et al. 2009, REFERENCES [83]) driven by one ejection per simulated beat. The code is in `src/sim/pulse.js`.

$$p_{art}(t) = P_\infty + Z_c\,Q(t) + P_c(t),\qquad C\,\frac{dP_c}{dt} = Q(t) - \frac{P_c}{R},\qquad \tau = RC$$

- **Ejection flow Q(t).** Each beat ejects a skewed half-sine, sin(πu)·(1 − u), lasting the ejection time T_e and scaled to unit area (one stroke volume). The skew puts peak flow in early systole, which gives a steep upstroke and an early systolic peak. The shape is illustrative.
- **Incisura (dicrotic notch).** At aortic valve closure the flow is followed by a brief backflow (2.5 % of the stroke volume over 30 ms, half-sine) and then a small forward rebound (3 % over 100 ms). Through Z_c these give a sharp notch on the downstroke and a small dicrotic wave after it. The notch is a valve-closure event. The following wave is in reality shaped by wave reflection, which a lumped Windkessel cannot represent, so the rebound is an illustrative stand-in. When less than 130 ms remains between the end of ejection and 0.9·RR, both terms are scaled down in proportion, so the notch fades at high rates as on real traces. Measured at 120/80 mmHg (noise-free model): the notch sits 7–15 mmHg above DBP, and the pressure rises out of it by about 8 mmHg at 60 bpm, 6 mmHg at 72 bpm, 3 mmHg at 100 bpm and 1.4–1.9 mmHg at 130–150 bpm.
- **Ejection time.** T_e follows Weissler's regression for men, LVET = 413 − 1.7·HR ms (Weissler 1968, [84]), limited to 0.16 s … 0.6·RR. At 72 bpm T_e = 0.291 s.
- **Fitting.** For the set HR, SBP and DBP, the time constant τ is solved by bisection so that the steady state of a regular rhythm has exactly the set systolic and diastolic pressures. The characteristic impedance is Z_c = 0.07·R. A narrow pulse pressure (tamponade, cardiogenic shock) cannot be reached with that Z_c and a physiological τ. In that case τ is held at 4 s and Z_c/R is lowered, and only with Z_c = 0 is τ allowed to rise further (up to 60 s). A gain in mmHg per unit stroke volume then scales the result. A unit test checks the fit for seven rate/pressure cases (40–180 bpm, pulse pressures 10–100 mmHg): the simulated extremes are within 1 mmHg of the set values.
- **Floor pressure.** P∞ = 10 mmHg stands for the mean systemic filling pressure: without beats the pressure falls exponentially toward it with time constant τ (V-Fib, asystole). The value is illustrative.
- **Superposition.** Pressure is the sum of the responses of all past beats. A long R–R interval therefore gives a lower diastolic pressure and a short one a higher pressure, as in a real circulation.
- **Stroke volume per beat.** Each beat's stroke volume is multiplied by a filling factor that depends on the preceding R–R interval:
  $$f(RR) = \frac{1 - e^{-(RR - T_e)/0.25\,\mathrm{s}}}{1 - e^{-(60/HR - T_e)/0.25\,\mathrm{s}}}$$
  A beat after a short interval ejects less (pulse deficit in atrial fibrillation). A beat after a long pause ejects more. The 0.25 s filling time constant is illustrative. Beat-to-beat changes of contractility, which Brookes et al. (1998, [85]) measured in AF, are not modelled. A PVC ejects 0.4 of a normal beat and a V-Tach beat 0.5 (teaching choices).
- **Pulse arrival.** The ejection starts a pulse arrival time (PAT) after the R peak. PAT is the parameter `pat_ms` (Physiological inputs, 100–400 ms, default 200 ms). It is the sum of the pre-ejection period and the pulse transit time to the measuring site. The same value starts the arterial line beat and the pleth beat, so both channels move together when it is changed. It is set by hand only: it does not follow pressure, stiffness or heart rate here, although real PAT shortens when pressure or arterial stiffness rises.
- **Beat gain.** Each beat keeps the mmHg gain of the fit that was valid when it was ejected, and the decaying tail of earlier beats is stored in mmHg. When HR, SBP or DBP is changed, only new beats use the new fit, so the trace moves to the new pressure over a few beats without a step. Before this change a new fit rescaled beats already ejected and the pressure jumped by about 75 mmHg within 24 ms when HR was changed from 72 to 40 bpm.
- **True MAP.** The reference MAP is the time average of the waveform, DBP + (SBP − DBP)·m, where m (the form factor) comes from the fit. Over the tested cases m lies between 0.38 and 0.51 (0.385 at 120/80 mmHg and 72 bpm), so the true MAP is not always (SBP + 2·DBP)/3.

**What is not modelled:** wave reflection in the pressure itself (the dicrotic wave is a stand-in, see above), pressure amplification from aorta to periphery, and baroreflex control. The cardiogenic impedance artifact (section 3.4) uses the same pressure, normalised so that DBP = 0 and SBP = 1. The PPG (section 3.3) uses that normalised pressure as input to the finger volume pulse model below.

**Finger volume pulse.** The light absorbance at the finger follows blood volume, not pressure. Its typical contour (digital volume pulse, DVP) has a systolic peak, a notch or inflection, and a later diastolic peak formed by the wave reflected from the lower body (Millasseau et al. 2002 [93], 2006 [95]; Chowienczyk et al. 1999 [94]). The simulator builds it from the normalised pressure s(t):

$$v(t) = \mathrm{LP}_{\tau_v}\!\left[\frac{s(t) + g\,s(t - \Delta T)}{1 + g}\right],\qquad \Delta T = \frac{\text{height}}{SI},\qquad SI = 0.63 + 0.086\cdot\text{age} + 0.042\cdot MAP\ \ \mathrm{m/s}$$

- The SI regression is the one Millasseau et al. measured in 87 subjects [93]. At 40 years, MAP 93 mmHg and 170 cm, ΔT ≈ 0.21 s; it shortens with age and pressure (stiffer arteries).
- g is the reflection gain (parameter `ppg_reflection`, default 0.3, range 0–0.8). g = 0 gives a single systolic peak. Vasoconstriction raises the reflection and nitrates lower it [94]; the numeric value of g is illustrative.
- LP is a first-order low-pass with τ_v = 40 ms that stands for vessel compliance (illustrative).
- v is rescaled to unit peak-to-trough for a regular rhythm at the current fit, so the set PI is kept. The scale is computed once per parameter set and cached.

**Perfusion state.** A separate variable perf (0–1) relaxes toward 1 with time constant 0.8 s while beats arrive. When no beat has come for 2 × 60/HR + 0.5 s it decays with time constant 1.5 s. It is used only for the capnogram plateau (section 3.8) and is reported in the truth frame. Both time constants are illustrative.

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

1. Take ln(I) for each channel and band-pass it at 0.5–5 Hz to obtain the AC components used for R and pulse detection. The displayed pleth is the inverted IR signal band-passed at 0.1–10 Hz (the PI band), which keeps the diastolic decay, the notch and the diastolic peak; the 0.5–5 Hz band had turned the slow decay into a spiky, overshooting trace.
2. Every 1 s, compute the ratio of ratios over the last 4 s:
   $$R = \frac{\mathrm{RMS}(AC_{red})}{\mathrm{RMS}(AC_{IR})}$$
   Working on ln(I) makes this equal to (AC/DC)_red / (AC/DC)_IR for small pulsations.
3. Convert with the linear example calibration **SpO₂ = 110 − 25 R** (TI application note SLAA655). Real oximeters use empirical, device-specific calibration curves.
4. Average over the selected time (2, 4, 8 or 16 s).
5. **Pulse gate.** The Pearson correlation r between the red and IR AC components over the same 4 s is computed. A real arterial pulse changes both channels together (r ≈ 0.99 in the simulation). Uncorrelated detector noise gives r between about −0.3 and 0. If r < 0.6, or the IR AC component is practically zero, the status is *no-pulse* and SpO₂, pulse rate and PI are blank. Without this gate the estimator turned noise into SpO₂ readings of 86–97 % and pulse rates of 101–171 bpm during V-Fib and asystole. An earlier gate based on autocorrelation (periodicity) failed for atrial fibrillation, because AF pulses are irregular.
6. **Signal quality index.** R is also computed in four 1 s sub-windows. With CV their coefficient of variation:
   $$SQI = 100\cdot\min\left(1 - \frac{CV}{0.2},\ \frac{r - 0.6}{0.3}\right)$$
   clamped to 0–100.
7. **Perfusion index.** PI = 100 × peak-to-peak of ln(I_IR) band-passed at 0.1–10 Hz, over 4 s. The narrower 0.5–5 Hz band used for R removed about 12 % of the pulse amplitude (PI 2.63 for a set 3.0), so PI uses its own wider band. With an irregular rhythm the window extremes include the strongest beat, so PI reads above the mean (4.2 for a set 3.0 in AF).
8. **Pulse rate** from intervals between pleth peaks.
9. If the DC level exceeds 1.5, the status is *probe-off*. If the signal is NaN, the status is *no signal*.

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

integrated exactly over each step, T += (T_true − T)(1 − e^{−Δt/τ}), with Gaussian noise of 0.02 °C and τ = `temp_tau` (default 20 s). A unit test checks that a 37 → 39 °C step reaches 63 % of the change after one τ. The state *unavailable* gives a missing value. The state *error* produces a raw reading of −40 °C. The monitor rejects it as implausible, stores it with quality `invalid` and raises a technical alarm.

### 3.6 Oscillometric NIBP

**Forward model.** The brachial artery under the cuff follows an arctangent pressure–volume relation of transmural pressure P = p_art − P_cuff (shape after Langewouters 1984 and Drzewiecki 1994):

$$v(P) = \frac{1}{2} + \frac{1}{\pi}\arctan\frac{P}{w},\qquad w = \begin{cases} 6\ \text{mmHg} & P < 0\ \text{(collapse)} \\ 8\ \text{mmHg} & P \ge 0\ \text{(distension)} \end{cases}$$

Both widths are multiplied by the stiffness setting. They were fitted so that the cuff pressure at the oscillation maximum matches the true (waveform-average) MAP of the Windkessel pulse over 10 rate/pressure cases (RMS error 0.8 mmHg in the analytic envelope). They are not fitted to measured arteries. The cuff pressure seen by the sensor is

$$P_{sensor}(t) = P_c(t) + G\,[v(p_{art} - P_c) - v(DBP - P_c)],\qquad G = 3\ \text{mmHg}$$

**Measurement cycle.**

1. Inflate at 25 mmHg/s to max(160, last SBP + 30) mmHg, capped at 280 mmHg.
2. Deflate linearly at `nibp_deflate` (default 3 mmHg/s).
3. Record one oscillation amplitude per beat.
4. Stop when at least 8 beats are recorded, the maximum has passed, and the last 2 beats are below 0.45 of the maximum, or the cuff is below 25 mmHg. Then dump at 50 mmHg/s.
5. The whole measurement times out after 120 s.
6. **Set-point change.** If the simulated SBP or DBP moves more than 5 mmHg from its value at the start of the measurement, or the stiffness setting changes, the measurement is aborted with "patient pressure changed during measurement; repeat". Without this rule an oscillogram that mixes beats from two pressure levels can still pass the analysis below and give a wrong reading (before the fix, a switch from 120/80 to 78/42 during deflation gave 121/112 mmHg flagged `ok`). The rule uses the known set point, which a real monitor does not have (see section 9).

**Oscillogram analysis (monitor side).**

1. At least 8 beats are required.
2. **Artifact screening.** A beat is rejected if its amplitude exceeds 2 × the median of its 5-beat neighbourhood + 0.2 mmHg. If more than 30 % of beats are rejected, or the mean relative deviation from the local median exceeds 0.15, the measurement fails with "motion artifact (irregular oscillations)".
3. Smooth the remaining amplitudes over 3 beats.
4. MAP_osc is the cuff pressure at the maximum amplitude A_m.
5. **Fixed-ratio method** (Geddes 1982; Forouzanfar 2015): SBP is the cuff pressure above the maximum where the envelope falls to K_s·A_m. DBP is the pressure below the maximum where it falls to K_d·A_m. Defaults are K_s = K_d = 0.55, adjustable. These are the ratios that return the set SBP and DBP for this arctangent artery. Real devices use proprietary ratios, reported as K_s 0.45–0.73 and K_d 0.69–0.83 (Forouzanfar 2015), because a real artery's pressure–volume curve differs from this one. Crossings are linearly interpolated.
6. If the systolic point is not found (cuff not inflated high enough), the cuff re-inflates once to 50 mmHg higher.
7. **Stop by the user.** Stopping a running measurement (inflating or deflating) dumps the cuff and records the attempt as `cancelled`, not as a failed measurement. It does not raise the NIBP-failed technical alarm, it keeps the last valid reading on the tile and in the oscillogram view, and the history table shows the row as "cancelled by user". A new measurement can be started at once.

**Cuff strip between measurements.** A measurement takes about 35 s, so on the 60 s sweep the cycle scrolls out soon after it ends and the strip would show a flat 0 mmHg line until the next one. While the cuff is empty, the strip therefore shows the last completed or failed cycle (the newest result keeps its cuff pressure at 100 Hz; older results drop it):

- the recorded cuff pressure against a labelled mmHg axis and a seconds axis;
- dashed SYS, MAP and DIA markers where the deflating cuff passed the reported values;
- the oscillation (the reading minus its 2 s centred moving average, deflation only) in a band underneath, magnified ×1, ×2, ×5 … so that it fills the band. A scale bar in mmHg and the largest beat amplitude (peak-to-trough) are printed with it. At 120/80 the largest beat is about 2.5 mmHg, less than 1 px on a 0–300 mmHg axis, which is why it cannot be seen without magnification;
- a comparison line: the NIBP reading, the arterial-line estimate at the end of the cycle, their difference (NIBP − ART, systolic/diastolic and mean), and the set values.

The label says how long ago the cycle ended in simulated time. During a measurement the live sweep returns, with labelled tick lines at 0–250 mmHg. In the bedside view the strip gets at least 150 px (160 px on a phone) so the axes stay readable. A failed cycle is shown with its error message instead of the markers.

**Derived values.** The app also reports two values calculated from SBP and DBP. Their source is marked `derived`:

$$MAP_{formula} = \frac{SBP + 2\,DBP}{3},\qquad PP = SBP - DBP$$

MAP_osc (measured at the oscillation maximum) and MAP_formula (calculated) are shown side by side. Their difference is itself a teaching point.

**Accuracy against the simulated truth** (default K_s = K_d = 0.55, deflation 3 mmHg/s, one measurement each, error = reading − set value; MAP error against the waveform-average MAP):

| Set SBP/DBP @ HR | SBP error | DBP error | MAP_osc error |
|---|---|---|---|
| 120/80 @ 72 | −0.8 | +0.5 | −1.7 |
| 82/48 @ 72 | −0.3 | −0.4 | −3.1 |
| 175/105 @ 72 | −1.8 | +2.1 | +3.0 |
| 140/90 @ 72 | −1.1 | +0.5 | +1.0 |
| 100/60 @ 110 | +0.1 | −0.4 | −0.8 |
| 160/70 @ 60 | −2.3 | +1.9 | −7.0 |
| 90/70 @ 120 | +1.2 | −0.9 | +3.0 |

SBP and DBP stay within 2.3 mmHg. MAP_osc is within 3.1 mmHg except for the wide pulse pressure at a slow rate (160/70 @ 60 bpm), where the long diastole lowers the waveform average and the oscillation maximum misses it by 7 mmHg. This error is a property of the model artery, not of a measured device.

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

### 3.8 Capnography (mainstream-style CO₂)

**Forward model.** The CO₂ partial pressure c (mmHg) at the airway follows the respiration phase φ of section 3.4. FiCO₂ is the inspired level (`fico2`, 0 by default) and the plateau is

$$c_{plateau} = FiCO_2 + \max(0,\ EtCO_2 - FiCO_2)\cdot(0.15 + 0.85\,perf)$$

where EtCO₂ is the alveolar set point (`etco2`, default 38 mmHg) and perf is the perfusion state of section 3.2. When the circulation stops, the plateau falls toward 15 % of its normal height above FiCO₂.

- **Inspiration** (φ < 1/3): the line is washed out, c = FiCO₂ + (c_end − FiCO₂) · exp(−φ/0.012), where c_end is the value at the end of the previous expiration.
- **Expiration**, with u = (φ − 1/3)/(2/3):
  - Dead space first: c = FiCO₂ while u < 0.06.
  - Then an exponential rise to the plateau with a small upward slope:
    $$c = Fi + (c_{plateau} - Fi)\,\frac{1 - e^{-v/\tau}}{1 - e^{-1/\tau}}\,(0.94 + 0.06\,v),\qquad v = \frac{u - 0.06}{0.94}$$
  - τ = 0.035 + 0.35 · `airway_obstr`/100. Expiratory obstruction slows the rise and gives a sloped, "shark-fin" upstroke.
- **Apnea** (RR = 0): c = FiCO₂.
- Gaussian noise with SD 0.25 mmHg is added and the result is clipped at 0. A disconnected CO₂ sensor or sampling line (`capno_sensor`) gives NaN.

The phase constants, the time constants and the 15 %/85 % split are **illustrative teaching choices**.

**Estimator (monitor side).** A breath starts when c rises above a threshold. The threshold is 4 mmHg for the first breath. After that it is max(2, 0.5 · (last EtCO₂ − last minimum) · exp(−Δt/6 s)), where Δt is the time since the last breath ended. The breath ends when c falls below FiCO₂ + 0.5 · (breath maximum − FiCO₂).

- EtCO₂ = the maximum of the breath, read on a 5-sample (100 ms) moving average of the 50 Hz signal. Without the average the maximum of the 0.25 mmHg noise read EtCO₂ 0.3–0.4 mmHg high on average; with it the mean error is within 0.1 mmHg at RR 12–30 and EtCO₂ 24–58 mmHg (section 9a of `SIMULATION_AUDIT.md`). A NaN sample clears the average.
- FiCO₂ = the minimum during inspiration.
- awRR (airway respiratory rate) = 60 / mean of the last 4 breath intervals, reported once at least 2 intervals exist.
- All three are null if no breath was detected within the apnea delay.
- A NaN sample within the last 1 s raises the technical condition "CO₂ no signal".

Presets: *Hypoventilation on room air (high EtCO2)* (RR 6, EtCO₂ 58 mmHg, SpO₂ 92 %: by the alveolar gas equation PAO₂ ≈ 150 − 58/0.8 ≈ 78 mmHg), *Obstructed expiration* (obstruction 80 %, RR 22) and *CO2 rebreathing* (FiCO₂ 6 mmHg).

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

- **Ventricular (wide) beats** reuse the Gaussian-event model of section 3.1 with a different event set: no P wave, Q at −35 ms (SD 30 ms, −0.08), R at 0 (SD 40 ms, 1), S at +75 ms (SD 40 ms, −0.45) and a discordant T wave at min(0.3 s, 0.42 · RR) (SD 75 ms, −0.35). Times and widths are converted to angles, and amplitudes to aᵢ = Aᵢ · ω / bᵢ². The wide beat is scaled to 1.3 × `ecg_amp_mv`. These values are teaching choices.
- **AF:** no P waves. RRᵢ = mean · (0.55 + 0.9 U), U ~ uniform(0, 1). A fibrillatory baseline of 6–9 Hz (sum of 4 sines with a random-walk frequency and a slow amplitude envelope) with amplitude 0.07 × `ecg_amp_mv` is added.
- **SVT:** a normal narrow beat without the P wave (hidden in the QRS, as in typical AV-nodal re-entry [55, 56]), at the set heart rate and beat-to-beat variability. Fast, regular timing comes from the scenario (HR 180, variability SD 3 ms).
- **PVC:** each normal cycle is followed by an early wide beat with probability min(0.5, `pvc_per_min`/HR), never two in a row. The early beat comes at about 0.6 × the mean interval and is followed by a compensatory pause.
- **VT:** every beat is wide, at the set heart rate.
- **VF:** no beats. The ECG is a fibrillatory signal of 3–7 Hz with amplitude 0.5 × `ecg_amp_mv`.
- **Asystole:** no beats and a flat ECG (noise and wander are still added at acquisition).

Without beats the Windkessel pressure decays toward P∞ with its time constant (section 3.2), so ART and pleth fall; perf falls too and lowers the CO₂ plateau. Presets: *AF pattern*, *SVT pattern* (HR 180, 106/72 mmHg), *Frequent PVCs* (14/min), *V-Tach pattern* (HR 170, 85/55 mmHg), *V-Fib pattern (no output)* and *Asystole pattern*.

**Monitor side** (`RhythmAnalyzer` in `src/sim/arrhythmia.js`). The analyser works on a 0.5–40 Hz band-passed copy of the ECG, keeps 6 s of it and uses the QRS times of section 3.7.

- **QRS width** is measured around the largest deflection near each detected QRS (last 0.32 s), as the span where the signal stays above 15 % of the peak, relative to the median of the last 2 s. A complex is *wide* above 75 ms. This threshold was tuned on the simulator's own waveforms; the measured width reads lower than a clinical QRS duration.
- Once per second the rules below are checked in order. The first match gives the label:
  1. leads off, or a signal loss within the last 2 s → *Not analysed*,
  2. first 8 s → *Learning*,
  3. peak-to-peak below 0.3 mV over 4 s and no detected QRS above 0.08 mV (filtered) in that time → *Asystole*. The second condition keeps low-voltage QRS complexes (below 0.5 mV, as in obesity, pericardial effusion or emphysema) from being called asystole, while detector triggers on noise stay below it,
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
| SpO₂ / pleth | red channel → IR channel → ln, 0.5–5 Hz band-pass (R, pulse peaks); 0.1–10 Hz band-pass, inverted (pleth trace, PI) | R, SpO₂ (instant and averaged), SQI, status |
| Respiration | demodulated impedance (Ω) → 0.1–1 Hz band-pass with the ± hysteresis thresholds and breath marks | RR, threshold |
| Arterial line | pressure in the artery → transducer output with the true pressure drawn behind it, on the same scale | SYS/DIA (MAP), f_n, ζ, height |
| Capnography | CO₂ partial pressure | EtCO₂, FiCO₂, awRR |

The last stage can be saved as a PNG image.

**Controls tab** (`buildControls` in `src/ui/panels.js`). One row per parameter, built from `SPEC`. *Simple* view shows 16 main controls (the 5 patient profile fields: age, sex, height, weight, diabetes status; then HR, arrhythmia pattern, SYS, DIA, SpO₂, RR, EtCO₂, temperature, motion, SpO₂ probe state, NIBP interval). Any other control is shown as well when it is not at its default value or an active alarm points to it, so a scenario never hides what it changed. *Advanced* shows all 64. The explanation text is hidden unless *Show explanations* is ticked; it is also the tooltip of the control name.

**Lessons tab** (`src/lessons/lessons.js`, `src/ui/lessonsPanel.js`). Eight guided lessons: ECG signal chain, pulse oximetry, NIBP, rhythms, capnography, arterial line, alarms and deterioration before cardiac arrest (8–10 min each). Each lesson has objectives, a button that loads its scenario (preset), steps that can set controls or open a tab, and a quiz of 3 multiple-choice questions with an explanation for each answer. A unit test checks that the quiz answers about the model (for example the ratio R of the desaturation preset) agree with the simulator. The best score per lesson is kept in the browser's `localStorage` only; it is not measurement data.

**Monitor screen.** Six sweeping waveforms: ECG, pleth (auto scale), ART (optimum scale: the range snaps to 20 mmHg steps around the visible sweep, e.g. 40–140 mmHg at 120/80, and is printed in the label), respiration (auto scale), CO₂ (0–60 mmHg) and cuff pressure (0–300 mmHg). Respiration, CO₂ and cuff sweep at 6.25 mm/s. The HR tile also shows the rhythm label and the PVC rate. The ART tile shows SYS/DIA (MAP) with the set point and the SYS limits. The EtCO₂ tile shows FiCO₂ and awRR. The page layout adapts to narrow screens (one column at 1100 px and below, a phone layout at 720 px and below).

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
| Heart failure, cardiogenic shock (SCAI stage C) | 76/50 mmHg, HR 118, RR 28, SpO₂ 88 %, EtCO₂ 28, PI 0.3 % | 63, 65 |
| Post-operative opioid respiratory depression (ward, room air) | RR 6, SpO₂ 86 %, EtCO₂ 62, HR 58, 104/62 mmHg | 66, 34, 35 |
| Post-operative hypothermia with shivering | 35.2 °C, HR 96, motion 35 %, PI 0.8 % | 67 |
| Post-operative pulmonary complication (atelectasis type) | SpO₂ 89 %, RR 26, HR 104, EtCO₂ 34 | 68 |

Where a source gives a range (for example ATLS class III: HR 120–140, RR 30–40) the value lies inside it. Where a source gives only a direction (for example "pulse pressure decreased", "bradycardia"), the number is an **illustrative choice** in that direction. The ECG scale factors for raised potassium are illustrative; the source gives only the order of the changes, and the patterns carry no potassium values. The DKA-type pattern shows only glucose above 250 mg/dL together with the compensatory breathing of [35, 36]; ketones, pH and potassium are not modelled. The critical-illness and post-operative scenarios also show what the monitor **cannot** see, and their notes say so. In the peri-arrest pattern the low EtCO₂ comes from low pulmonary blood flow; pulseless electrical activity (PEA) is not modelled, because the model always couples a QRS complex to a pulse. The stroke pattern shows only the blood pressure (above the 185/110 mmHg limit for thrombolysis [61]); the neurological deficit is not visible on a monitor. The cold-wet heart-failure pattern has a proportional pulse pressure of (92 − 74)/92 < 25 % [64] but raises no default alarm, although it is the profile with the highest risk. Cardiogenic shock raises the same alarms as the blood-loss pattern; venous pressure and right-ventricular failure are not modelled. In the shivering pattern the SpO₂ of about 85 % is a motion artefact (set point 97 %) that the signal quality index does not flag (section 9). The monitor cannot tell atelectasis from pneumonia or pulmonary embolism. A unit test (`tests/unit/critical.test.js`) checks the alarms each of these scenarios raises. Every scenario is an illustrative pattern for education only. Real presentations vary and the values are not diagnostic. A unit test checks that every sourced scenario passes validation without clamping, that its references exist in `REFERENCES.md` and that no two scenarios have the same settings.

#### Community scenarios

Other people can propose scenarios. They are stored in the repository and shipped with the website, so every visitor sees them under *Community scenarios* in the scenario list. The code is in `src/core/community.js` (shared by the page and the GitHub Action), `src/ui/sharePanel.js`, `tools/community-scenario.js`, `.github/ISSUE_TEMPLATE/scenario.yml` and `.github/workflows/community-scenarios.yml`.

*Format.* A submission is `{ name, note, source, changes }`. `changes` holds only patient and sensor parameters, the same kind of object as a built-in scenario; display and processing settings (`group: 'processing'` in `src/sim/params.js`) are excluded. A stored entry adds `id` (`c-` plus a slug of the name, made unique with `-2`, `-3`, …), `author` (GitHub user name), `issue` (issue number) and `added` (date). The canonical list is `community/scenarios.json` (format `vitalslab-community-scenarios`, version 1, at most 200 entries). `community/scenarios.js` is generated from it and sets `PM.communityData`, so the page reads the list as a script and needs no `fetch` under `connect-src 'none'`.

*Validation* (the same function in the page, in the Action and at load time):

- every key in `changes` is a known scenario parameter; numbers are numbers and options are listed options;
- `validate()` from `src/sim/params.js` reports no error and no clamping, so the stored values are the values that run; diastolic is at least 10 mmHg below systolic;
- no value equals the baseline, and at least one parameter is set;
- the settings do not equal those of any loaded scenario (built-in or community), and no scenario has the same name (case-insensitive);
- name 3–80, note 0–600 and source 5–300 characters, plain text with no `<`, `>`, backticks or control characters. The text is set with `textContent` in the page, and the comment code block in the Action cannot be broken out of.

At load time `register()` validates each entry again and skips any that fail or reuse an id; skipped entries are reported in the browser console. A community scenario has no references (`refs: []`); the message shown when it is loaded names the author, the issue, the date and the author's source, and says that the maintainer checked format and ranges, not clinical content.

*Submission.* The *Share as community scenario…* button in Controls opens a dialog. It builds the submission from the current settings (the patient profile only if a box is ticked), shows the exact JSON, lists any errors and, when it is valid, offers a link to `github.com/Hafij-BGE/patient-monitoring/issues/new?template=scenario.yml` with the title and the JSON filled in. Nothing is sent by the page; the user submits the issue on GitHub. The issue form requires two confirmations: the values are invented or taken from published teaching material, and the scenario may be published under the MIT licence with the author's GitHub name. In the Android app only links to this repository are opened, in the system browser; all other external links stay blocked.

*Review.* The workflow runs on issues with the `scenario-submission` label. On *opened* and *edited* it checks the issue (`tools/community-scenario.js check`), comments the result and sets `scenario-valid` or `scenario-invalid`. When the `approved` label is added it first checks that the person who added it has write, maintain or admin permission on the repository; otherwise the label is removed and the job stops. It then checks the issue again against the current list, appends the entry, regenerates the script, runs the unit tests, commits as `github-actions[bot]`, pushes to `main` and starts the Pages workflow. On success it comments, adds `scenario-added` and closes the issue; on any failure it comments with the errors or the run link and removes `approved`.

*Security.* The issue body is untrusted. It is read from the event file by Node and parsed as JSON only; it is never interpolated into a shell command or into `${{ }}` expressions in the workflow. Error lines in comments have backticks and line breaks replaced and are length-limited. Only the two `community/` files change, and only after validation and passing tests.

*Limits.* The checks cover format and ranges, not clinical plausibility; that judgement is the maintainer's and is not verified by software. New entries reach the Android and desktop apps only with the next release. As of 2026-10-29 the workflow has not yet run on GitHub (`TEST_REPORT.md` section 4.4).

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
| SI, type 1 | 4.4 × 10⁻⁴ /min per µU/mL (mean of the 10 subjects in Table 1 of [47], calculated here) | [47] |
| GEZI, type 1 glucose effectiveness at zero insulin | 2.5 × 10⁻³ /min (same source); type 1 uses SG = GEZI + SI·Ib | [47] |
| Secretion, type 1 | none (structural choice, as in [47]) | [47] |
| σ, secretion gain above fasting | 0.1 µU/mL per min per mg/dL | **illustrative** |
| Secretion gain, type 2 | 0.5 × σ | **illustrative**, direction from [50] |
| Fasting insulin | user-set, 2–50 µU/mL (default 10) | **illustrative** |

σ was chosen so the "no diabetes" model returns close to fasting within about 3 h after a 50 g meal. It is not a fitted or published value.

**Controls** (group *Glucose and insulin* in the Controls tab): fasting glucose 50–400 mg/dL, fasting insulin 2–50 µU/mL, basal insulin 0–5 U/h. The *glucose model time scale* (1×, 10× or 60×) is in the processing group. The default is 60×: one simulated second is one model minute, so a meal response is visible within a few minutes. Diabetes status (none, type 1, type 2) and weight are in the patient profile, which is part of the Controls tab. Changing diabetes status, fasting glucose, fasting insulin or weight restarts the model in steady state. Changing the basal rate acts as a step change from the current state.

**Glucose tab** (`src/ui/glucosePanel.js`). *Give now* adds a meal (0–200 g carbohydrate) or a subcutaneous bolus (0–30 U) to the running model. *Projection* runs a copy of the model forward 2, 3 or 4 h (`forecast()` in `glucose.js`) with an optional planned meal and bolus at chosen minutes. It draws this curve next to the same model with no further events. It reports the first time glucose crosses 70, 54, 180 and 250 mg/dL and the percentage of time in 70–180 mg/dL. The thresholds are the consensus CGM ranges of [52] and the level 1 and level 2 hypoglycaemia values of [51]. The plot and the tab carry the label "Model projection, not a clinical prediction". The projection uses population parameters. It is not fitted to any person, does not learn from data and is not dosing advice.

**Monitor and alarms.** The GLU tile shows glucose in mg/dL and mmol/L, insulin in µU/mL and the model clock, with a "model" badge. There is no glucose sensor or CGM model, so the value shown is the model value. Glucose and insulin are stored as `simulated` observations with the method text "(model value, no sensor)". Alarm defaults: glucose < 70 or > 180 mg/dL (medium priority), and < 54 mg/dL (level 2, high priority).

**Measured behaviour** (`tests/unit/glucose.test.js`). Fasting 90 mg/dL, 50 g meal, no basal insulin. Peak (time) / 2 h / 4 h values: no diabetes 167 mg/dL (61 min) / 120 / 83; type 2 183 (76 min) / 162 / 100; type 1 without any insulin 349 (160 min) / 336 / 325. The type 1 curve stays high because, with no insulin, only GEZI clears glucose, and GEZI is about one tenth of SG; this matches the direction of [47], where glucose effectiveness at zero insulin is small. The rise of about 5 mg/dL per gram of carbohydrate is at the upper end of clinical rules of thumb for an adult. In type 1 (fasting 200 mg/dL, basal 0.8 U/h) a 6 U bolus lowers the 4 h value from 200 to 104 mg/dL, about 16 mg/dL per unit. That is lower than the insulin sensitivity factor given by the common 1800 rule for an adult on about 40 U/day (about 45 mg/dL per unit), so the bolus effect of this model is weaker than typical clinical practice; it is shown for direction only. Numbers measured with the model code on 2026-10-29.

### 3.14 Derived 12-lead ECG

**Model** (`src/sim/ecg12.js`). The McSharry equation for z is linear in z, so its solution is the sum of five parts z_i(t), one per event (P, Q, R, S, T), each driven by its own Gaussian term. Because `ecg.js` evaluates the exact solution (section 3.1), each z_i is simply the Gaussian of event i, and their sum is the monitor ECG. Each event is given a fixed spatial direction d_i in Frank coordinates (X left, Y feet, Z back), and the heart vector is

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
- **BSA** by the formula chosen in Profile → Formulas (section 5.2); the default is Mosteller (1987) = √(height (cm) × weight (kg) / 3600) m².
- The WHO adult BMI categories (< 18.5, 18.5–24.9, 25.0–29.9, ≥ 30) are shown **only from age 20**. Below that the app explains that BMI-for-age references are needed and shows no category.
- Weight history records dated weights and shows the absolute and percentage change.

BMI and BSA are stored as `derived`. Age, sex, height, BMI and BSA do not change any simulated signal. Weight and diabetes status are inputs of the glucose model only (section 3.13).

### 5.1 Using the profile

The box *Use the profile* in the Profile tab has three switches. Their state is kept in `localStorage` (`pmsim.usecases.v1`); defaults are calculators on, shock index on, age-typical blood pressure off. The functions are in `src/core/profile.js` and are tested in `tests/unit/usecases.test.js`.

**Bedside calculators.** Cards below BMI and BSA, recalculated whenever the profile or the set heart rate changes:

- Predicted body weight (PBW), ARDS Network formula [72]: male 50 + 0.91 × (height cm − 152.4), female 45.5 + 0.91 × (height cm − 152.4). The formula needs sex; with sex unspecified the card shows both values and asks for sex.
- Low tidal volume 6 mL/kg PBW, with the 4–8 mL/kg range [72].
- Sepsis crystalloid bolus 30 mL/kg on actual weight [73]; the PBW value is shown as well.
- Urine output threshold 0.5 mL/kg/h and its 6-hour total (KDIGO oliguria criterion) [74].
- Age-predicted maximal heart rate by the formula chosen in section 5.2 (default Tanaka, 208 − 0.7 × age [75]), and the set heart rate as a percentage of it.

**Shock index.** When the switch is on, the patient banner on the monitor (section 5.2) shows SI = displayed heart rate / systolic pressure of the last successful NIBP measurement. The healthy adult SI range is 0.5–0.7 [76]; values above 0.7 are coloured. Age × SI is not shown: it was studied only for 48-h mortality in injured patients over 55 [77] and has no validated cut-off, so a displayed number could not be judged. When the ECG leads are off or no NIBP has been measured the row shows `--`. Example (tested in the browser): the hypotension scenario (age 40) gives NIBP 80/46 (61) and SI 0.90 (highlighted).

**Age-typical blood pressure.** When the switch is on and age or sex is changed by hand (Controls or Profile tab), SYS and DIA are set to the mean for that age and sex from NHANES 2001–2008 [78]: age groups 18–39, 40–59 and ≥ 60 years, placed at 28.5, 49.5 and 70 years, linearly interpolated between them and held constant outside them. With sex unspecified the all-adult values are used. The curve reproduces the known pattern that systolic pressure rises with age while diastolic pressure falls after about 50, so pulse pressure widens [79, 80]. A message names the values set. Blood pressure can still be changed by hand afterwards, and loading a scenario never applies this rule. Examples (tested): age 40 male 122/74, age 75 male 133/69, age 30 male 119/71.

These calculations are for teaching. They are not prescriptions and not dosing advice.

### 5.2 Formula choices and the patient banner

Where the literature offers more than one accepted formula, the Profile tab has a *Formulas* box with one selector each. The first option is the default and is the best-supported one; the choice is stored in `localStorage` (`pmsim.formulas.v1`) and changes only displayed numbers, never a simulated signal or an alarm. The equations are in `FORMULAS` in `src/core/profile.js`, and the note under the selectors shows the active equations with their reference numbers.

| Quantity | Options (default first) | Equation | Why the default |
|---|---|---|---|
| QTc | Framingham [82] | QT + 0.154 (1 − RR) | Best rate correction in 6 609 adults [88] |
| | Fridericia [89] | QT / RR^(1/3) | Also good in [88] |
| | Hodges [88] | QT + 1.75 (HR − 60) ms | |
| | Bazett [88] | QT / √RR | Worst in [88]: over-corrects at fast rates; kept because it is still widely printed |
| BSA | Mosteller [13] | √(H · W / 3600) | Simple; within 0.3 % of Du Bois and Haycock at 172 cm, 70 kg (unit test) |
| | Du Bois [90] | 0.007184 · W^0.425 · H^0.725 | Original 1916 formula |
| | Haycock [91] | 0.024265 · W^0.5378 · H^0.3964 | Validated from infants to adults |
| Max HR | Tanaka [75] | 208 − 0.7 · age | Meta-analysis of 351 studies plus a lab study |
| | Gellish [92] | 207 − 0.7 · age | Longitudinal cohort |
| | Fox [75] | 220 − age | Historic; over-estimates in young and under-estimates in old adults [75] |
| MAP shown | Oscillometric | MAP measured by the NIBP algorithm | What a monitor displays |
| | Formula | DIA + (SYS − DIA)/3 | Textbook estimate; shown in brackets |

(H in cm, W in kg, RR in s.) QTc is computed only for RR 0.3–2 s; outside that range it is blank, because all four formulas were fitted inside it.

**QT and QTc on the HR tile.** See section 3.1. The QT is the model's QT for the last supraventricular beat, not a measurement from the trace.

**Patient banner.** A line above the parameter tiles shows the profile values a clinician would want at a glance, all derived from section 5:

- age, sex, height and weight;
- BMI with its WHO category (or "no adult category under 20 y");
- BSA and the formula used;
- the typical blood pressure for the age and sex (NHANES mean [78]);
- the predicted maximal heart rate and the formula used;
- shock index (when the shock-index switch is on).

The banner is hidden in the full-screen bedside view, which keeps only the waveforms and the numbers.

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
- **Tones** (Web Audio, off until the user turns sound on). The burst timing follows the tables of IEC 60601-1-8: high priority 10 pulses (groups 3 + 2, pause, 3 + 2; pulse 150 ms, spacing 100 ms, 350 ms after pulses 3 and 8, 600 ms after pulse 5), followed by a 3.1 s pause; medium priority 3 pulses of 200 ms every 7.5 s; low priority 2 pulses every 16 s. The high-priority burst lasts 3.4 s and starts again 6.5 s after the previous start (pitches 523, 440 and 330 Hz for high, medium and low). Each pulse has 15 % rise and fall ramps and a fundamental with four harmonics, because the standard asks for at least four harmonics in the 300–4000 Hz range. Loudness, harmonic levels and the exact pitch were not measured against the standard, so the sound is not claimed to comply.
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

1. A single ECG lead with fixed P, QRS and T shapes (durations in seconds, independent of rate) and a QT that follows the Framingham formula (section 3.1). Real QT also lags rate changes by 1–2 minutes (QT hysteresis); the model QT follows the previous R–R interval at once. The arrhythmia patterns (AF, SVT, PVC, VT, VF, asystole) are simplified teaching shapes. No other conduction disorders are modelled.
2. Arterial pressure comes from a three-element Windkessel with a fixed ejection-flow shape and a user-set arrival time (`pat_ms`, default 0.20 s, section 3.2) shared by the arterial line and the pleth. The incisura comes from a brief valve-closure backflow; the dicrotic wave after it is an illustrative rebound, not a computed reflection. The pleth uses a delayed copy of the pressure for the reflected wave (Millasseau SI regression), not a transmission-line model. Pressure, PPG, capnogram and respiration share the same beat and breath times.
3. The PPG is two-wavelength transmission with a linear R-to-SpO₂ calibration. No venous pulsation, no ambient light, no dyshaemoglobins.
4. Respiration is a regular oscillator with I:E = 1:2. No sighs. Expiratory obstruction is shown only in the capnogram shape, not in the impedance signal.
5. The capnogram is a phase-driven shape, not a gas-exchange model. It behaves like a mainstream sensor: there is no transit delay and no rise-time filtering of a sidestream sampling line.
6. The arterial line is a linear second-order system with fixed f_n and ζ per damping setting. There is no flush test and no air bubble or clot model.
7. NIBP uses an arctangent artery model, a linear deflation, one amplitude per beat and fixed ratios. The cuff and limb tissue are not modelled.
8. Temperature is a first-order lag with no site differences.
9. Set points change instantly. There is no physiological coupling between parameters; for example, changing SpO₂ does not change HR, and EtCO₂ does not follow the respiratory rate (each scenario sets both). The couplings that exist are mechanical: the beat sequence drives the Windkessel, so irregular beats change the pressure beat to beat and stopped beats let ART and pleth fall; the perfusion state lowers the CO₂ plateau when beats stop.
10. Default alarm limits and delays are illustrative.
11. Glucose and insulin follow the population model of section 3.13. They are not coupled to the cardiovascular or respiratory signals; the DKA-type scenario sets those signs separately.

## 9. Limitations

These were observed or are known from the model design:

- **NIBP under motion.** At motion ≥ 20 % the oscillometric measurement usually fails with a motion-artifact message. This is intended behaviour, but the threshold is a teaching choice.
- **NIBP set-point change.** A measurement is aborted when the simulated SBP or DBP changes by more than 5 mmHg while it runs (section 3.6). The simulator can do this because it knows the set point. A real monitor has to detect an unstable patient from the oscillations themselves, and the oscillogram analysis here does not test for a two-level envelope. Gradual changes of up to 5 mmHg are accepted and can bias the reading by a similar amount.
- **SpO₂ under motion** is biased toward about 85 % (R → 1). The value is not corrected. SQI (the lower of the consistency of R across four 1-s windows and the red/IR correlation) drops for mild motion (mean 40 at motion 15, 60 s run) but rises again under strong motion (mean 72 at motion 70), because then the artefact itself sets a steady R ≈ 1. The low-SQI flag (SQI < 40) therefore catches only some mild-motion windows and misses strong motion (`motion` and `postop-hypothermia` scenarios: 0 flagged frames in 90 s).
- **Fixed-ratio NIBP.** SBP and DBP come from fixed amplitude ratios (Ks = Kd = 0.55, fitted to this simulator's cuff model). Real devices use proprietary ratios or other rules, and the error grows when the pulse pressure is wide at a low heart rate (160/70 at 60 bpm: MAP −7 mmHg, section 3.6). Real oscillometric devices show similar errors of several mmHg against intra-arterial pressure.
- **12-lead ECG** is derived from one moving dipole with fixed directions per wave. It shows textbook normal and ventricular patterns only. It cannot show regional ST changes, infarct Q waves, bundle-branch blocks other than the VT shape, a biphasic P in V1 or electrode misplacement. Scenarios that change a wave (for example the raised-potassium T wave) change it in every lead in the same proportion. It is not a diagnostic ECG.
- **QRS detector** has no search-back, so dropouts and very noisy ECG can cause missed beats and HR errors.
- **HR in the AF pattern** varies with the irregular intervals (set 110: mean 112.7, range 91–140 bpm over 40 s after an 8-beat average). Earlier versions read 75–85 bpm because short beats had a small QRS; that was fixed in the ECG audit.
- **Pulse oximeter PI in AF** reads above the set value (4.2 for a set 3.0), because the peak-to-peak window includes the strongest beat after a long interval.
- **RR estimate** is null for the first breaths after a start or reset.
- **Pulse arrival time** is one value for both the arterial line and the finger pleth, and it is not coupled to pressure, stiffness or heart rate (section 3.2). On a real patient the finger pulse arrives later than a radial pulse, and PAT shortens as pressure rises.
- **SpO₂ calibration** is the linear example line, not a device calibration.
- **Imported timestamps without a time zone** are read in the zone chosen in the import panel. Device clocks that carry no zone information cannot be corrected automatically.
- A column named `rr` is read as respiratory rate, not as an RR interval.
- **Rhythm analysis** is a set of simple rules, not a validated arrhythmia algorithm. It was checked only on the simulator's own patterns. The 75 ms width threshold was tuned on these waveforms, so the measured QRS width reads lower than a clinical QRS duration. Noisy ECG or dropouts can give wrong labels.
- **Capnography and arterial line** parameters (wave shape constants, f_n, ζ, the perfusion time constants) are illustrative. They show the effects qualitatively and are not fitted to measured data.
- **Watch data** (Android app only) has not been tested with any real watch, heart-rate sensor or Health Connect store. Consumer wearable readings are not clinical measurements (see `TEST_REPORT.md`).
- **Glucose model.** Population parameters only; no person is fitted. Renal glucose excretion, glucagon, counter-regulation, exercise and the change of endogenous glucose output with insulin are not modelled. Without insulin action, glucose still returns towards fasting through SG (glucose effectiveness), so untreated type 1 hyperglycaemia resolves slowly in the model, unlike in reality. Minimal-model SI is lower than clamp-derived sensitivity (about 66 % lower in [54]), so a bolus has a modest effect. Secretion gain σ, the type 2 factor 0.5 and fasting insulin are illustrative. There is no CGM or glucose meter model (no sensor lag, no noise). Ketones and pH are not modelled.
- Measurements are not persisted between sessions. Only the best lesson quiz scores, the Controls view choice, the Bedside view on/off state and the profile use-case switches are kept, in the browser's `localStorage` (keys `pmsim.lessons.v1`, `pmsim.controls.v1`, `pmsim.bedside`, `pmsim.usecases.v1`).
- **Community scenarios** are checked for format and parameter ranges only. Their clinical content is the author's responsibility and is reviewed by a person, not by software. Submissions are public GitHub issues.

## 10. References

See `REFERENCES.md` for the full list and what each reference supports.
