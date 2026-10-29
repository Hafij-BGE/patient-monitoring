# Simulation audit (after v1.4.0)

VitalsLab, homework 2 "Interactive Medical Device Simulator". Author: Md. Hafijur Rahman. Audit date 2026-10-29.

This document lists every model in the simulator that was checked after release v1.4.0. For each one it states what was wrong, what was changed, the equations and parameters now used with their sources, how the result was tested and what limits remain. Numbers in brackets are entries in `REFERENCES.md`. The full model descriptions are in `TECHNICAL_REPORT.md`; the section is named in each heading.

Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.

## 0. What "real" means here

The simulator is not, and cannot be, a 100 % real patient. Every waveform is generated from a small model with population-average parameters. The audit goal was narrower and testable:

1. Every number the monitor shows must be produced by the same kind of measurement a real monitor uses (detector, oscillogram, red/IR ratio), not copied from the set point.
2. Every model parameter must either come from a cited source or be marked **illustrative**.
3. Every claim in the reports must be reproducible by a test or a script in this repository.
4. Where the model is known to differ from physiology, the difference is stated, with its size where it was measured.

The audit found model errors in nine areas and stale or wrong statements in the documentation. They are listed below. Nothing here was tested on a real patient, a real monitor or real hardware.

## 1. How to reproduce the numbers

```
node --test tests/unit/*.test.js          # 111 tests in 14 files
node tests/tools/ecg-intervals.js         # P, PR, QRS, QT at 50–150 bpm
node tests/tools/ecg-intervals.js 1.5     # same with QRS width ×1.5
```

Browser self-test: open `index.html?selftest=1` from a local server (`python3 -m http.server 8766`) or the website and press *Run self-test* in the Tests tab.

## 2. ECG (TECHNICAL_REPORT §3.1, `src/sim/ecg.js`)

**What was wrong.**
- The P, Q, R, S and T events were placed with the angle scaling of the original ecgsyn code. With irregular intervals (atrial fibrillation) short beats got a narrow, small QRS, so the QRS detector missed them. The HR read 75–85 bpm at a set 110 bpm.
- The relaxation term of the McSharry ODE pulled the TP segment below zero. The baseline between beats sat at −0.05 to −0.3 mV, depending on rate.
- QT did not follow any measured QT–RR relation. The T wave end and the QRS onset were not defined, so QT could not be measured or checked.

**Change.** The signal is now the plain sum of Gaussian events, each placed in seconds from the R peak:

```
z(t) = Σ_i a_i · exp(−(t − t_i)² / (2 σ_i²))
```

| Event | t_i (s) | σ_i (s) | a_i (mV) |
|---|---|---|---|
| P | −0.165 | 0.020 | 0.0119 × gain |
| Q | −0.024 | 0.009 | −0.0080 × gain |
| R | 0 | 0.009 | 0.0477 × gain |
| S | +0.024 | 0.009 | −0.0119 × gain |
| T | QT-dependent | 0.05 · QT / 0.40 | 0.0191 × gain |

- QT follows the Framingham linear formula, QT = QTc + 0.154·(1 − RR) s with QTc 400 ms [82]. Vandenberk et al. 2016 [88] compared the common correction formulas against mortality and found Framingham and Fridericia the best rate correction; Bazett over-corrects at high rates.
- T end is at 2.37 σ_T after the T peak and QRS onset at 2.05 σ before the R peak. With these, QT measured at a 25 µV threshold matches the formula within 2–3 ms.
- The relaxation term was removed, so the TP baseline is exactly 0 mV in a clean beat.
- The QRS width control scales Q, R and S. P moves with the QRS onset, so PR stays at 167 ms. The JT interval stays fixed, so QT grows with QRS width, as in a real bundle branch block.
- The model QT is exposed (`engine.lastQt`) and shown on the HR tile as QT/QTc with the chosen correction formula (Profile → Formulas).

**Measured** (`tests/tools/ecg-intervals.js`, clean signal, regular rhythm):

| HR (bpm) | P (ms) | PR (ms) | QRS (ms) | QT (ms) | Framingham QT (ms) |
|---|---|---|---|---|---|
| 50 | 86 | 167 | 84 | 428 | 430.8 |
| 60 | 86 | 167 | 84 | 398 | 400.0 |
| 72 | 86 | 167 | 84 | 372 | 374.3 |
| 100 | 86 | 167 | 84 | 336 | 338.4 |
| 150 | 86 | 167 | 84 | 305 | 307.6 |

PR and QRS lie inside the 95 % ranges of normal adult ECGs: PR 125–196 ms and QRS 69–103 ms in 32 949 ECGs (Ramirez et al. 2011 [86]), with similar limits in 486 014 primary-care ECGs (Palhares et al. 2017 [87]). With QRS width 1.5 the QRS is 127 ms and QT 475/444/418/382/351 ms. AF at a set 110 bpm now reads a mean of 112.7 bpm (range 91–140 over 40 s). At 150 bpm the T and P waves fuse (shortest TP gap 0 ms), which also happens in real sinus tachycardia.

**Tests.** `usecases.test.js` (QTc formulas, engine QT), `arrhythmia.test.js` (AF rate), self-test entries for HR and the 12-lead ECG.

**Limits.** P, QRS and T shapes are fixed. There is no QT hysteresis (QT adapts to a rate change at once; in real hearts it takes about 2 min). Lead morphology for the 12-lead view is derived from one dipole (§3.14), not from body-surface data.

## 3. Asystole detection (§3.10, `src/sim/arrhythmia.js`)

**What was wrong.** Asystole was declared when the peak-to-peak signal fell below 0.3 mV. A patient with low-voltage QRS complexes (allowed by the gain control) could be called asystolic while the heart was beating.

**Change.** Asystole now also needs that no detected QRS in the last 4 s had a filtered amplitude above 0.08 mV. Noise peaks stay below that level; real low-voltage QRS complexes do not.

**Tests.** `arrhythmia.test.js`: VF and asystole give no HR; a sinus rhythm with R 0.2 mV gives 0 % asystole frames and HR within 3 bpm of 72.

**Limits.** The rhythm analyser is rule-based. It is not a validated arrhythmia algorithm and was not tested on recorded ECG databases.

## 4. Arterial pressure: three-element Windkessel (§3.2, `src/sim/pulse.js`)

**What was wrong.** The arterial pressure was a fixed Gaussian shape scaled between the set DBP and SBP. It had no physical time constant. Pressure between beats did not depend on how long the pause was, and the "true" MAP was a fixed fraction of the shape, not the real area under the curve.

**Change.** The pressure is now produced by a three-element Windkessel [83], driven by one ejection per beat:

```
P = P_c + Zc·Q,   C·dP_c/dt = Q − (P_c − P∞)/R,   τ = R·C
```

- Ejection time T_e = 413 − 1.7·HR ms (Weissler 1968 [84]), limited to 0.16 s … 0.6·RR.
- τ is fitted by bisection so that the steady-state pressure has the set SBP and DBP. Zc = 0.07·R. When the pulse pressure is too narrow for a fit, τ is held at 4 s.
- P∞ (pressure the arteries fall to without inflow) is 10 mmHg.
- Stroke volume depends on the filling time before the beat, with a 0.25 s time constant (**illustrative**). A beat after a short RR ejects less; this gives the pulse deficit in AF. Beat-to-beat contractility changes (Brookes et al. [85]) are not modelled.
- Ejection flow sin(πu)·(1 − u) (was (1 − 0.7u)): earlier peak flow, steeper upstroke, sharper systolic peak.
- Incisura: after ejection a backflow of 2.5 % of the stroke volume over 30 ms, then a forward rebound of 3 % over 100 ms (both **illustrative**). Through Zc this gives a sharp dicrotic notch and a small dicrotic wave. Both shrink when less than 130 ms remains before 0.9·RR, so the notch fades at high rates. Measured at 120/80 mmHg: rise out of the notch about 8 mmHg at 60 bpm, 6 at 72, 3 at 100, 1.4–1.9 at 130–150 bpm.
- The waveform form factor (MAP − DBP)/(SBP − DBP) comes out at 0.38–0.51 depending on rate and pressure (0.385 at 120/80 mmHg, 72 bpm). The true MAP is the waveform average, as in a real arterial line.
- The PPG and the cardiogenic artifact of the respiration signal are driven by the same normalised pressure, so all three agree beat by beat.
- Finger volume pulse for the PPG: the normalised pressure plus a copy delayed by ΔT = height/SI, SI = 0.63 + 0.086·age + 0.042·MAP m/s (Millasseau 2002 [93]), with reflection gain `ppg_reflection` (default 0.3; illustrative value, direction of change from Chowienczyk 1999 [94]), then a 40 ms first-order low-pass. It is rescaled to unit peak-to-trough so PI keeps its set value. This gives the systolic peak, notch and diastolic peak of the digital volume pulse [95].

**Tests.** `pulse.test.js` (10 tests): the fit reproduces the set SBP/DBP over the rate and pulse-pressure range; ejection time follows Weissler; without beats the pressure decays to P∞ with time constant τ; a short RR gives a smaller beat; the NIBP reads the Windkessel pressure within 3 mmHg; a notch with a rebound follows ejection at 72 bpm and lies between DBP and SBP; the notch is smaller at 150 bpm; the finger volume pulse has two maxima about ΔT apart with the diastolic one lower; without reflection it has one; engine PR and PI stay on the set values with reflection 0, 0.3 and 0.8. The four shape tests fail on the v1.4.0 code.

**Limits.** The dicrotic wave in the pressure is a stand-in, not a computed reflection; the pleth reflection is a single delayed copy, not a transmission-line model. A fixed 0.20 s pulse arrival time. No baroreflex: changing HR does not change the pressure.

## 5. Oscillometric NIBP (§3.6, `src/sim/nibp.js`)

**What was wrong.** The cuff model widths (3 mmHg collapse, 15 mmHg distension) and the ratios Ks 0.50 / Kd 0.80 were tuned to the old pulse shape. With the Windkessel pulse, the oscillation maximum no longer sat at the true MAP.

**Change.**
- Arctangent widths 4 and 7.5 mmHg (6 and 8 before the sharper pulse shape and the incisura lowered the form factor). They were fitted with `tests/tools/nibp-fit.js` so that the cuff pressure at the oscillation maximum matches the waveform MAP over 10 pressure/rate cases (RMS error 1.8 mmHg in the analytic envelope). The error surface is flat along w_collapse/w_distend ≈ 0.53; 4/7.5 was chosen over the grid optimum 1.5/2.75 (RMS 1.75) to keep the envelope width close to the earlier one.
- Ks = Kd = 0.55, the ratios that return the set SBP and DBP with these widths. Published device ratios are Ks 0.45–0.73 and Kd 0.69–0.83 (Forouzanfar 2015); real devices differ because a real artery is not an arctangent.
- The stop rule now ends deflation after two beats below 0.45 of the maximum (was 0.6), so the DBP point is reached.
- The displayed MAP is the cuff pressure at the maximum, as on real oscillometric monitors.

**Measured.** SBP and DBP within 2.9 mmHg of the set value in the six checked cases (120/80, 80/46, 140/90, 160/70 at 60 bpm, 100/60 at 120 bpm, 90/50 at 50 bpm). MAP within 3.4 mmHg, except 160/70 mmHg at 60 bpm, where MAP reads 5.9 mmHg low. That case has a very low form factor; real oscillometric MAP has similar errors in wide pulse pressures.

**Tests.** `sim.test.js` (NIBP accuracy, motion failure, set-point change abort), `pulse.test.js` (engine case).

**Limits.** NIBP fails at motion ≥ 20 %. No cuff size or arm position effects.

## 6. Pulse oximetry, PR and PI (§3.3, `src/sim/detectors.js`)

**What was wrong.**
- With no arterial pulse (VF, asystole) the estimator still computed a red/IR ratio from noise. It showed SpO₂ 86–97 % and a pulse rate of 101–171 bpm.
- PI was computed from the same band as SpO₂ and read 2.63 % at a set 3.0 %.

**Change.**
- A pulse is accepted only when the red and IR AC signals are correlated, Pearson r ≥ 0.6 over the 4 s window. Arterial pulsation moves both wavelengths together; independent noise does not. An autocorrelation gate was tried first and rejected, because it also rejected AF.
- The signal quality index (SQI) now includes r.
- PI uses its own 0.1–10 Hz band. It reads 3.00 % at a set 3.0 % (2.91–3.25 % over 40–180 bpm and reflection 0–0.8).
- The displayed pleth now uses the same 0.1–10 Hz band (inverted IR). With the 0.5–5 Hz band the high-pass turned the slow diastolic decay into an overshoot, which made the trace look spiky. R and pulse detection stay on 0.5–5 Hz.
- The pleth is driven by the finger volume pulse (section 4), so it shows a fast upstroke, systolic peak, notch, diastolic peak and decay to baseline. PR stays within 1 bpm of HR at 40–150 bpm (186 at a set 180, where HRV jitter gives a true mean RR of 0.330 s; the ECG detector reads the same).
- With no pulse, SpO₂, PR and PI are blanked (shown as missing), not held or guessed.

**Tests.** `sim.test.js`: no pulse blanks SpO₂/PR/PI; AF is still accepted; low PI is measured, not rejected; motion biases SpO₂ toward about 85 %.

**Limits.** The calibration curve is a straight line in R. Motion bias toward 85 % is real behaviour of ratio oximeters but its size is not fitted to any device. No skin-pigmentation effect is modelled.

## 7. Temperature probe (§3.5, `src/sim/sensors.js`)

**What was wrong.** The first-order lag was integrated with `min(1, dt/τ)` (forward Euler). This decays slightly faster than the true exponential, more so at large time steps.

**Change.** Exact integration over each step: T += (T_true − T)·(1 − e^(−dt/τ)).

**Tests.** `sim.test.js`: 63 % of a step after one τ.

## 8. Capnography (§3.8)

**What was wrong.**
- The *hypoventilation* preset showed SpO₂ 95 % at EtCO₂ 60 mmHg on room air. The alveolar gas equation gives PAO₂ ≈ 150 − 60/0.8 = 75 mmHg, which corresponds to SpO₂ in the low 90s, not 95 %.
- The *dead-space pattern (PE-type)* note said low EtCO₂ with a normal or high rate "suggests dead space rather than hyperventilation". Fast breathing also lowers EtCO₂, so the monitor alone cannot tell them apart.

**Change.** Hypoventilation SpO₂ is 92 %, with the alveolar gas equation in the help text. The dead-space note now says that added alveolar dead space widens the PaCO₂ − EtCO₂ gap, and that only a blood gas shows the gap.

**Limits.** The capnogram is a shape model. It has no gas-exchange model; EtCO₂ is a set point scaled by perfusion.

## 9. Invasive arterial pressure and the self-test threshold (§3.9)

The under-damped line model was not changed. Its help text now cites Gardner 1981 [25] for the natural frequency / damping chart.

**Disclosure.** The Windkessel upstroke is smoother than the old Gaussian shape, so the same under-damped line now overshoots by about 8 mmHg instead of more. The self-test threshold for entry 13 was lowered from "SYS ≥ 8 mmHg higher" to "SYS > 6 mmHg higher". This is a change of the test, not of the model. It was made because the old threshold sat exactly on the new overshoot. With the sharper ejection flow and the incisura (§4) the overshoot is larger again: the self-test now reads optimal 121/80 (MAP 95) and under-damped 135/78 (MAP 95), so the threshold is met with margin.

**ART display scale.** The ART trace uses an "optimum" scale (`src/ui/waveforms.js`, `optimum()`): the range snaps to 20 mmHg steps around the minimum and maximum of the visible sweep, with at least 5 mmHg of padding and a span of at least 40 mmHg. The range is kept while the trace stays at least 3 mmHg inside it, so it does not jump on every beat. The current range is printed in the label and on dashed reference lines. At 120/80 mmHg it settles at 40–140 mmHg. With the earlier fixed 0–200 mmHg scale the pulse was only about 25 px high and the dicrotic notch was hard to see. The scale changes only the drawing, not any value.

## 9a. Targeted waveform audit (2026-10-29)

A second pass checked each displayed channel (ECG, pleth, arterial line, impedance respiration, CO₂, NIBP cuff) and the renderer. Every number below was measured with the noise sources off unless stated, using `tests/unit/channels.test.js` or the probe scripts named in the text. The old-code numbers come from the same scripts run on commit c914f9a.

### Defects found and fixed

| # | Channel | Evidence (before) | Fix | After |
|---|---|---|---|---|
| 1 | Arterial line | A change of HR, SBP or DBP rescaled beats already ejected. At HR 72 → 40 bpm the pressure went 118 → 194 mmHg within 24 ms; at HR 72 → 120 bpm it fell 118 → 76 mmHg. Steady beat-to-beat sample step is 4–6 mmHg. | `Arterial.beat()` stores the gain of the fit that was valid at ejection; the tail of earlier beats is kept in mmHg (`src/sim/pulse.js`). | Largest sample step in the 3 s after the change: 7.2 (HR 120), 6.1 (SBP 150), 5.0 (DBP 60), 3.8 mmHg (HR 40), against 4.1–6.4 mmHg in steady state. |
| 2 | CO₂ | EtCO₂ was the raw maximum of each breath, so the 0.25 mmHg noise biased it upward: mean error +0.38 (RR 12, 38 mmHg), +0.40 (RR 6, 58), +0.31 (RR 30, 24), +0.32 mmHg (RR 20, 38), 6 seeds each. | The detector reads the maximum of a 5-sample (100 ms) moving average (`CapnoDetector`, `src/sim/detectors.js`). | Mean error +0.06, +0.09, +0.01, +0.01 mmHg. With 80 % expiratory obstruction it is −0.22 mmHg, because the plateau is not reached before inspiration (expected for that pattern). |
| 3 | Pleth / arterial line | The R-peak to pulse-foot delay was a hidden constant (0.20 s). | New parameter `pat_ms` (100–400 ms, default 200) in Physiological inputs; it starts both the arterial line and the pleth beat (`src/sim/params.js`, `src/sim/engine.js`). | At 150 and 300 ms the arterial foot is within ±12 ms of R + PAT, and the pleth foot lies 0–40 ms after the arterial foot. |
| 4 | NIBP | Stop during inflation or deflation was stored as a failed measurement: state `failed`, the NIBP-failed technical alarm, and the last valid reading replaced by the error. | `Nibp.cancel()` records a `cancelled` result, dumps the cuff, keeps the last valid reading and raises no alarm; the history row reads "cancelled by user" and the oscillogram view ignores cancelled rows. | Unit test and browser check: 119/82 kept on the tile, "No active alarms", cuff at 0 mmHg, a new start is accepted. |
| 5 | Layout | At 375 px width the scenario list (506 px), the alarm limit table and the trend source badges made the page 422–514 px wide, so the whole page scrolled sideways. | CSS only: the scenario select is capped to the viewport; single-column grids use `minmax(0, 1fr)` so wide tables scroll inside their own box; the trend source badges wrap. | Every tab is 375 px wide at 375 px (Chromium device emulation). Tablet (768 px) and desktop widths unchanged. |
| 6 | NIBP cuff strip | The strip sweeps at 6.25 mm/s over 60 s and a measurement takes about 35 s, so the cycle scrolled out and the strip stayed flat at 0 mmHg until the next interval. The scale was 0–300 mmHg with no tick labels, and the oscillation (about 2.5 mmHg peak-to-trough at 120/80) was under 1 px high. In the bedside view the strip was about 85 px tall. | While the cuff is empty the strip shows the last cycle: mmHg and time axes, SYS/MAP/DIA markers, the oscillation magnified in its own band with a mmHg scale bar, and NIBP vs arterial line vs set values (`src/sim/nibp.js` keeps the trace, `drawCuffCycle` in `src/ui/trends.js`). The live sweep gets labelled ticks. The strip is 170 px (160 px on a phone, at least 150 px in the bedside view). | At 120/80 the reading 119/81 (98) sits within 1 mmHg of the cuff pressure under each marker. Peak-to-trough oscillation within ±0.5 s is largest at MAP (2.42 mmHg) and 0.69 (SYS) and 0.65 (DIA) of it there. Browser: desktop, 375 px phone and both bedside layouts (149 and 159 px) show axes, markers, band and comparison line with no horizontal scroll. |

The arterial-line display scale (fixed 0–200 mmHg, pulse about 25 px high) was changed earlier in this pass; see section 9.

### Checked and not changed

- **ECG.** At 120 bpm the model R–R is 0.500 s (±2 ms) and the detector R–R within ±12 ms, HR ±1 bpm. Changing HR from 72 to 40 or 140 bpm causes no step larger than 1.25 × the steady sample step + 0.02 mV. The renderer draws 10 mm/mV and 25 mm/s (checked in pixels for the calibrated scale). The canvas is labelled "Simulated ECG waveform" and the page carries the educational-simulation notice.
- **Arterial line.** The fit returns 120/80, 160/95 and 90/55 mmHg within ±1.5 mmHg. Under- and over-damped lines keep MAP within ±1.5 mmHg; under-damping raises SBP by more than 8 mmHg, over-damping lowers SBP by more than 5 mmHg and raises DBP by more than 1 mmHg.
- **Pleth.** SpO₂ comes from the red/IR ratio of the two simulated channels (section 6), never from the shape of the displayed trace. During a sensor dropout the samples are NaN and the estimated numerics are null, not held or guessed.
- **Respiration and CO₂.** The impedance cycle at RR 12 is 5.00 ± 0.02 s. The CO₂ half-rise of each breath falls 0–0.8 s after the impedance peak, so both channels share one breath clock without forced simultaneous peaks. awRR is within ±0.5 /min.
- **Determinism.** A reset run and a run advanced in 625 steps of 16 ms are identical sample by sample to a fresh run with the same seed.
- **Renderer.** NaN samples are drawn as hatched gaps, not as lines to zero. All points stay inside the canvas at 320 × 60, 800 × 160 and 1920 × 300 px, and the sweep width equals the canvas width divided by 25 mm/s. The arterial optimum range brackets the trace with at least 5 mmHg padding and stays fixed over 8 redraws of a steady trace.

### Limits that remain

- One PAT value is used for both the arterial line and the finger pleth. In a patient the finger pulse arrives later than a radial pulse, and PAT shortens as pressure or stiffness rises; here it changes only when the user sets it.
- The ECG, pleth, arterial and CO₂ shapes are model shapes with illustrative constants; none was fitted to recorded patient signals.
- The Windows build was not run on a Windows PC. The Linux package was built and started once (`TEST_REPORT.md` section 8 lists what was checked).

## 10. Alarm tones (§6, `src/ui/app.js`)

**What was wrong.** Alarm tones were short beeps 0.2 s apart at one fixed pitch, without the burst and pause structure of a standard alarm signal.

**Change.** Burst patterns after the timing of IEC 60601-1-8:
- High: 10 pulses of 150 ms, burst 3.4 s, repeated every 6.5 s, 523 Hz.
- Medium: 3 pulses of 200 ms, every 7.5 s, 440 Hz.
- Low: 2 pulses, every 16 s, 330 Hz.
- 15 % rise and fall ramps and 4 harmonics, so the pitch is easy to place.

**Limits.** The tones follow the published timing but were not measured against the standard. They are not claimed to comply with IEC 60601-1-8.

## 11. Filter labels (`src/ui/chainPanel.js`, `src/ui/ecg12Panel.js`, lessons)

**What was wrong.** The "diagnostic" filter was labelled 0.05–150 Hz at a 250 Hz sample rate. 150 Hz is above the Nyquist frequency (125 Hz), so the label described a filter that cannot exist.

**Change.** The upper edge is capped at 0.49·fs (122.5 Hz at 250 Hz) and the label shows the real edge. The lesson text says so.

## 12. Glucose–insulin model (§3.13, `src/sim/glucose.js`)

**What was wrong.** Type 1 diabetes used the glucose effectiveness of normal subjects (SG 0.026 /min). With no insulin, glucose then returned to fasting after a meal almost as fast as in a healthy person. That is not what happens in type 1 diabetes.

**Change.** Type 1 uses the form of Kanderian et al. [47]: SG = GEZI + SI·Ib, with GEZI 2.5 × 10⁻³ /min and SI 4.4 × 10⁻⁴ /min per µU/mL, both the means of the 10 subjects in Table 1 of [47].

**Measured** (fasting 90 mg/dL, 50 g meal, no insulin given):

| Status | Peak (time) | 2 h | 4 h |
|---|---|---|---|
| No diabetes | 167 mg/dL (61 min) | 120 | 83 |
| Type 2 | 183 mg/dL (76 min) | 162 | 100 |
| Type 1, no insulin | 349 mg/dL (160 min) | 336 | 325 |

Type 1 with fasting 200 mg/dL and basal 0.8 U/h: a 6 U bolus lowers the 4 h value from 200 to 104 mg/dL.

**Tests.** `glucose.test.js` (8 tests).

**Limits.** The bolus effect is about 16 mg/dL per unit. The common 1800 rule gives about 45 mg/dL per unit for an adult on 40 U/day, so the model's bolus effect is weaker than clinical practice. The secretion gain σ is **illustrative**. There is no glucose sensor model; the value shown is the model value.

## 13. Android BLE heart rate input (`src/devices/androidBridge.js`)

**What was wrong.** A Bluetooth heart-rate packet with an impossible value (for example 300 bpm) was accepted as an observation.

**Change.** Each observation is checked against the parameter's valid range in `units.PARAMS`. Values outside it are rejected with a reason ("outside min–max unit") and shown as rejected, not stored.

**Tests.** `androidBridge.test.js` decodes a valid packet and rejects a malformed one; the out-of-range rejection is the same `units.inRange` check that the Health Connect test covers. Not tested with a real Bluetooth device.

## 14. Scenarios (§3.12, `src/sim/params.js`)

| Preset | Before | After | Reason |
|---|---|---|---|
| Hypotension | 82/48 mmHg | 80/46 mmHg | Waveform MAP was 64.2 mmHg, on the 65 mmHg alarm limit; the alarm flickered. MAP is now clearly below 65. |
| Cardiogenic shock | 78/54 mmHg | 76/50 mmHg | Same reason; keeps SBP < 90 and MAP < 65 with the Windkessel form factor. |
| Hypoventilation | SpO₂ 95 % | SpO₂ 92 % | Alveolar gas equation (section 8). |
| DKA-type pattern | refs [35, 36, 51] | adds the 2024 consensus [81]: glucose ≥ 200 mg/dL or known diabetes | The 2024 consensus lowered the glucose criterion. |
| Haemorrhage (class II pattern) | no edition named | ranges from the ATLS 9th edition table as quoted in [28] | The 10th edition dropped the numeric HR and RR ranges. |

**Tests.** `scenario.test.js`, `sim.test.js` (every preset runs 30 s without NaN).

## 15. Lessons and quizzes (§3.11, `src/lessons/lessons.js`)

- The mains-interference step now says poor electrode contact raises mains pickup.
- The diagnostic filter step names the capped upper edge.
- *Set Ks back* now uses the new default 0.55.
- The quiz on zero-delay alarms now says apnea is first detected after the apnea delay (20 s).
- The PEA explanation now reads "organised electrical activity with no palpable pulse".

**Tests.** `lessons.test.js` checks quiz facts against the model (calibration, mains frequency, Ks and alarm delays).

## 16. Patient profile, formulas and banner (§5, §5.2)

New user choices under Profile → Formulas. Each default is the one recommended by current literature:

| Quantity | Options | Default and reason |
|---|---|---|
| QTc | Framingham, Fridericia, Hodges, Bazett | Framingham: best rate correction in [88]; Bazett over-corrects above 60 bpm. |
| BSA | Mosteller, Du Bois, Haycock | Mosteller: simplest; within 0.3 % of Du Bois and Haycock at 172 cm, 70 kg. |
| Max HR | Tanaka (208 − 0.7·age), Gellish (207 − 0.7·age), Fox (220 − age) | Tanaka: meta-analysis of 351 studies plus a lab study [75]. |
| NIBP MAP shown | Oscillometric (cuff pressure at the largest oscillation), DBP + (SBP − DBP)/3 | Oscillometric: what a real cuff monitor shows. The one-third rule is shown for teaching and is not equal to the waveform MAP (form factor 0.33–0.55, section 4). |

The patient banner (hidden in bedside view) shows BMI and BSA, age-normal ranges, and the shock index (for example 80/46 mmHg (61), SI 0.90). Age × SI was shown here until 2026-10-29 and then removed: it was studied only in injured patients over 55 [77] and has no validated cut-off, so the number could not be judged.

**Tests.** `usecases.test.js` (9 tests): BSA formulas, max HR formulas, QTc formulas diverge at fast rates, engine QT, shock index, age-typical BP.

## 17. Documentation fixes

- TECHNICAL_REPORT §3.1 rewritten for the Gaussian-event ECG, with the measured interval table.
- §3.10 asystole rule and Windkessel decay; §3.8 hypoventilation preset; §3.13 type 1 parameters and measured values; §5.2 formula table and banner; §6 tones; §8 assumption 1.
- Literature updated to recent sources: Ramirez et al. 2011 [86], Palhares et al. 2017 [87] and Vandenberk et al. 2016 [88] for ECG reference ranges and QT correction.

## 18. What remains unreal

These are known differences from a real patient. They are also listed in TECHNICAL_REPORT §8 and §9.

- Parameters do not affect each other physiologically (no baroreflex, no chemoreflex, no oxygen–CO₂ coupling). Scenarios set every value directly.
- Fixed waveform shapes for P, QRS, T and the CO₂ curve; the reflected wave is a delayed copy in the pleth and an illustrative rebound in the arterial pressure, not a transmission-line model.
- No QT hysteresis.
- One user-set pulse arrival time for both the arterial line and the pleth, not coupled to pressure or stiffness (section 9a).
- No patient variability between runs other than seeded noise and HRV.
- Sensor models (SpO₂ calibration, NIBP ratios, motion artifacts) are generic and not fitted to any commercial device.
- No hardware was tested. The Android watch and BLE routes were not tested with real devices.
