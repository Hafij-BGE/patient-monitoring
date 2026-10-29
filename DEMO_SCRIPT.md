# Demo Script

A demonstration of VitalsLab in about 11 minutes. Each step names what to click, what to say and what the audience should see. Times are cumulative.

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

## Before you start

- Open the website https://hafij-bge.github.io/patient-monitoring/ in any current browser. Alternatives: run `python3 -m http.server 8766` in the project folder and open `http://localhost:8766/`, or open `index.html` directly. All three show the same page.
- Use a fresh page load, so the stored data is empty.
- Keep `fixtures/vitals_units_fahrenheit_lb_kpa.csv` ready for the import step.
- The demo runs at playback speed 1×. Press `Space` at any time to pause and explain a waveform.

## 1. Introduction (0:00–0:45)

**Show:** the whole monitor screen.

**Say:**

- VitalsLab simulates a multiparameter bedside monitor: ECG, pulse oximetry, respiration, capnography (CO₂), invasive arterial pressure, non-invasive blood pressure and temperature.
- The signals come from published models. The numbers are then measured *from those signals* by simplified monitor algorithms, the way a real monitor does it.
- Point at the notice bar: this is an educational simulation, not a medical device.
- Point at one tile: the large number is the measured value, the small "set" value under it is what the model was told. The difference is the measurement error. The badge shows the data source (here `simulated`).

## 2. Changing inputs and seeing the effect (0:45–2:15)

**Click:** the **Controls** tab. Show the five groups: patient profile, physiology, glucose and insulin, sensor and processing. Every control has a unit, a range and an explanation. *Simple* view shows the 16 main controls plus any control a scenario changed or an alarm points to; *Advanced* shows all 64.

1. Set **Heart rate** to 110 bpm.
   - *Expected:* the ECG beats come closer together. The HR tile moves toward 110 within a few beats. The pleth pulses follow, delayed by the pulse arrival time.
2. Set **T-wave size** to −0.5.
   - *Expected:* the T wave inverts. The heart rate does not change, because the QRS detector looks only at the QRS complex.
3. Set **Arterial O2 saturation (set point)** to 88 %.
   - *Expected:* the red pleth amplitude grows relative to the infrared one, and SpO₂ falls toward 88 % over the averaging time (8 s by default). After 10 s below the limit of 90 %, the SpO₂-low alarm appears.
4. Set **Motion artifact** to 50 %.
   - *Expected:* the pleth becomes irregular, SQI falls, and the SpO₂ value is flagged as low quality. Explain that motion pulls the ratio of ratios toward 1, which reads near 85 %. This is why a real monitor shows a signal-quality indicator.
5. Type 130 into **Diastolic pressure** while systolic is 120.
   - *Expected:* the input is rejected with a message (diastolic must be below systolic). The old value stays.

**Click:** **Reset**. Everything returns to the defaults, including the alarm limits.

## 3. Presets (2:15–3:15)

**Use:** the preset selector in the top bar. Each preset sets all patient, physiology and sensor controls: its own values, all others at default. The message lists the changed controls, and literature patterns also show their note and sources. Changing a control by hand switches the selector to **Custom (edited)**.

| Preset | What to point out |
|---|---|
| Irregular beat timing | RR intervals vary; HR tile still updates |
| Apnea demonstration | Respiration trace goes flat; after the 20 s apnea delay a **high-priority** apnea alarm appears |
| Sensor disconnection | SpO₂ shows `--` (missing), a **technical** alarm appears, and **no** SpO₂-low alarm: a missing value is not a low value |
| Missing observations | Gaps in the waveforms; trends show breaks, not zeros |

Return to **Baseline adult**.

## 4. New waveforms and tiles (3:15–4:30)

**Show:** the six sweeps (ECG, pleth, ART, respiration, CO₂, cuff) and the ART and EtCO₂ tiles. The HR tile also shows the rhythm label.

1. Choose the **V-Tach pattern** preset.
   - *Expected:* wide QRS complexes at about 170 bpm. Within a few seconds the rhythm label reads *V-Tach* and a **high-priority** V-TACH alarm appears. The ART pulses become smaller.
   - *Say:* the rhythm label comes from simple rules on QRS width and timing. It is a teaching analyser, not a validated arrhythmia algorithm.
2. Return to **Baseline adult**, then choose **Hypoventilation on room air (high EtCO2)**.
   - *Expected:* fewer, longer breaths on the CO₂ trace. EtCO₂ rises toward 58 mmHg. After the 10 s delay the EtCO₂-high alarm appears and the EtCO₂ tile is highlighted.
3. Return to **Baseline adult**, then choose **Under-damped arterial line**.
   - *Expected:* ringing on the ART trace and a higher systolic value, while MAP stays about the same.
   - *Say:* the catheter and transducer act like a spring–mass system. Its natural frequency and damping decide how faithfully the trace follows the true pressure. The values used here are illustrative. The ART sweep uses an "optimum" scale that snaps to 20 mmHg steps around the pulse, so the ringing and the dicrotic notch stay readable; the range is printed in the label.
4. Return to **Baseline adult** and click the **12-lead** button on the ECG sweep (or the ECG trace itself).
   - *Expected:* a dialog with the last 10 s in the standard 3 × 4 layout and a lead II rhythm strip, on grid paper at 25 mm/s and 10 mm/mV, with a frontal QRS axis of about +49°.
   - *Say:* the 12 leads are derived from one moving heart vector through the Dower transform. Lead II is the monitor ECG itself. It shows textbook normal and ventricular patterns only and is not a diagnostic ECG.

Return to **Baseline adult**.

## 5. NIBP measurement (4:30–5:45)

**Click:** **Start NIBP** in the NIBP tile, then open the **NIBP** tab.

**Say while it runs (about 35 s):**

- The cuff inflates above the expected systolic pressure, then deflates at 3 mmHg/s (the cuff trace).
- Small oscillations ride on the cuff pressure. Their size depends on the cuff pressure, because the artery under the cuff is most compliant near zero transmural pressure.
- The oscillogram plots the oscillation amplitude against cuff pressure. Its maximum gives the mean arterial pressure (MAP). Systolic and diastolic are read where the envelope falls to 55 % of the maximum above and below it (fixed-ratio method, K_s = K_d = 0.55 for this model artery).

**Expected result:** around 120/80 mmHg, with two MAP values: the oscillometric MAP and the formula MAP, (SYS + 2·DIA)/3, plus pulse pressure. Explain that they differ, and that real monitors also report the oscillometric value.

**Show:** after the measurement the cuff strip keeps the last cycle: the cuff pressure with mmHg and time axes, dashed SYS, MAP and DIA markers, the oscillations magnified in their own band with a mmHg scale bar, and the reading next to the arterial-line value and the set point.

**Optional:** start another measurement and press **Stop** while the cuff deflates. The history lists the attempt as "cancelled by user", no NIBP-failed alarm appears and the last valid reading stays on the tile.

**Optional:** set **Motion artifact** to 70 % and start again. The measurement fails with "motion artifact" and reports no numbers. Reset afterwards.

## 6. Alarms (5:45–6:45)

**Click:** the **Alarms** tab.

1. Show the limits table: 11 parameters (including the model glucose), each with a low limit, a high limit and a delay.
2. Choose the **Tachycardia (fast rate)** preset. After the 5 s delay a HR-high alarm appears in the alarm bar.
3. Click **Acknowledge**. The alarm stays listed while the condition lasts, but it is marked acknowledged.
4. Click **Audio pause 2 min**. Show the countdown.
5. Return to **Baseline adult**. The alarm ends by itself (alarms do not latch). Show the history list and **Export history CSV**.

**Say:** physiological alarms (patient values) and technical alarms (sensor problems) are kept apart and have different priorities.

## 7. Signal chain (6:45–7:30)

**Click:** the **Signal chain** tab.

1. Choose **ECG**.
   - *Expected:* numbered stages from the patient model, through electrodes, amplifier and ADC, and the display filter, to the QRS detector's integrator output with its adaptive threshold and the detected beats.
2. Choose **Arterial line**.
   - *Expected:* the pressure in the artery and the transducer output on the same scale, with f_n and ζ in the readout.

**Say:** every number on the monitor comes out of a chain like this. Each stage can add error.

## 8. A guided lesson (7:30–8:30)

**Click:** the **Lessons** tab and open **Capnography: reading the CO₂ waveform** (or any other lesson).

1. Show the objectives and click **Load the scenario**.
2. Click one **Do it** button. The controls change and the effect shows on the monitor.
3. Answer the 3 quiz questions. Each answer shows an explanation.

**Say:** the quiz is graded in the browser. Only the best score is remembered, in this browser only. It is not measurement data.

## 9. Real data next to the simulation (8:30–9:30)

**Click:** the **Data import/export** tab.

1. Import `fixtures/vitals_units_fahrenheit_lb_kpa.csv`.
   - *Expected:* the import report lists accepted values, rejected values with reasons and empty cells. °F, lb and kPa are converted to °C, kg and mmHg.
2. Under **Manual entry**, add a temperature of 99.5 °F.
   - *Expected:* stored as 37.5 °C with source `user`.
3. Open the **Trends** tab and choose temperature. Simulated, imported and user values are drawn as separate series. Nothing is merged, and gaps are breaks, not zeros.

## 9a. Glucose model and projection (optional, about 1 min)

Use this step if time allows; it is not counted in the 11 minutes.

**Click:** Controls → Patient profile, set **Diabetes status** to *type 1*. Under **Glucose and insulin**, set basal insulin to 0.8 U/h. The scenario label shows **Custom (edited)**.

**Click:** the **Glucose** tab. Under *Projection*, plan a 60 g meal at minute 15 and a 4 U bolus at minute 0, horizon 3 h.

- *Expected:* a solid blue curve (with the plan) and a dashed grey curve (no further events), the green 70–180 mg/dL band, and the time each threshold is crossed. The plot is labelled "Model projection, not a clinical prediction".

**Click:** **Give meal** (50 g, under *Give now*). The GLU tile rises over the next minutes (model time runs at 60× by default). Above 180 mg/dL the tile turns amber and a GLUCOSE-high alarm appears.

**Say:** this is a population model (Bergman minimal model with Hovorka meal and insulin absorption, parameters from published studies). It is not fitted to any person, it has no sensor model, and it is not dosing advice. Reset afterwards.

## 10. Watch data on Android (9:30–10:00)

This part is a short spoken note, or an optional demonstration if a phone is available. Real watch data enters VitalsLab only through the Android app, which wraps the same page. In a normal browser the "On this phone" panel is hidden. The Android app has **not been tested with real hardware**, so do not present any result from it as verified.

**Say:**

- The Android app has three routes for watch data: reading Android Health Connect (with the user's permission), a native Bluetooth LE connection to the standard Heart Rate Service (0x180D), and import of a health-app export file.
- The watch may be an HONOR watch or any other watch that writes to Health Connect or exposes the standard heart-rate service. HONOR's own protocol is proprietary and is not used.
- Watch readings are consumer wearable values. In the app they are meant to be shown next to the simulation with their source, and they are never used to generate the ECG.
- The app has no internet permission, and the data stays on the phone.

**Optional, only if a phone is available:** install the APK (`release/PM-SIM-1.5.0-android.apk`) and open the **Data import/export** tab. The "On this phone" panel appears there.

1. Under **Health Connect**, tap **Allow reading…**, choose a period and tap **Read records**. The message lists the stored and rejected values. The values appear in **Trends** as a separate `device` series.
2. Under **Bluetooth heart-rate sensor**, tap **Scan**, then **Connect** on a heart-rate device. The last heart rate is shown.
3. Export a CSV. The Android save dialog opens.

This has not been done on a real device yet. Until it has, report it as planned, not as a result.

## 11. Tests (10:00–10:30)

**Click:** the **Tests** tab, then **Run browser self-test** (or open `index.html?selftest=1`).

**Expected:** 16 pass, 0 fail, 1 not run. Each row shows the input, the expected result and the observed result.

**Say:** the one hardware entry (watch data on Android through Health Connect, BLE or an export file) is reported as "not run" because no watch was connected. The app never marks a hardware test as passed without hardware. The same models and parsers are also checked by 133 Node unit tests (`node --test tests/unit/*.test.js`).

## 12. Closing (10:30–10:45)

**Say:**

- The model, its equations, assumptions and limitations are in `TECHNICAL_REPORT.md`, with sources in `REFERENCES.md`. The Android-only watch routes and their status are in `DEVICE_INTEGRATION_REPORT.md`. The page is online at https://hafij-bge.github.io/patient-monitoring/.
- Limitations to name aloud: the waveforms come from simplified models, the SpO₂ calibration is a textbook example, NIBP fails under strong motion, the rhythm analyser is not validated, the capnography and arterial-line constants are illustrative, and no real watch or sensor was tested.
- Educational simulation only.
