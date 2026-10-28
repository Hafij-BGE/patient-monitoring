# Demo Script

A demonstration of PM-SIM in about 8 minutes. Each step names what to click, what to say and what the audience should see. Times are cumulative.

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

## Before you start

- Open the website https://hafij-bge.github.io/patient-monitoring/ in any current browser. Alternatives: run `python3 -m http.server 8766` in the project folder and open `http://localhost:8766/`, or open `index.html` directly. All three show the same page.
- Use a fresh page load, so the stored data is empty.
- Keep `fixtures/vitals_units_fahrenheit_lb_kpa.csv` ready for the import step.
- The demo runs at playback speed 1×. Press `Space` at any time to pause and explain a waveform.

## 1. Introduction (0:00–0:45)

**Show:** the whole monitor screen.

**Say:**

- PM-SIM simulates a multiparameter bedside monitor: ECG, pulse oximetry, respiration, non-invasive blood pressure and temperature.
- The signals come from published models. The numbers are then measured *from those signals* by simplified monitor algorithms, the way a real monitor does it.
- Point at the notice bar: this is an educational simulation, not a medical device.
- Point at one tile: the large number is the measured value, the small "set" value under it is what the model was told. The difference is the measurement error. The badge shows the data source (here `simulated`).

## 2. Changing inputs and seeing the effect (0:45–2:15)

**Click:** the **Controls** tab. Show the three groups: physiology, sensor and processing. Every control has a unit, a range and an explanation.

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

**Use:** the preset selector in the top bar. Each preset changes only the controls it names, and the message lists them.

| Preset | What to point out |
|---|---|
| Irregular beat timing | RR intervals vary; HR tile still updates |
| Apnea demonstration | Respiration trace goes flat; after the 20 s apnea delay a **high-priority** apnea alarm appears |
| Sensor disconnection | SpO₂ shows `--` (missing), a **technical** alarm appears, and **no** SpO₂-low alarm: a missing value is not a low value |
| Missing observations | Gaps in the waveforms; trends show breaks, not zeros |

Return to **Baseline adult**.

## 4. NIBP measurement (3:15–4:30)

**Click:** **Start NIBP** in the NIBP tile, then open the **NIBP** tab.

**Say while it runs (about 40 s):**

- The cuff inflates above the expected systolic pressure, then deflates at 3 mmHg/s (the cuff trace).
- Small oscillations ride on the cuff pressure. Their size depends on the cuff pressure, because the artery under the cuff is most compliant near zero transmural pressure.
- The oscillogram plots the oscillation amplitude against cuff pressure. Its maximum gives the mean arterial pressure (MAP). Systolic and diastolic are read where the envelope crosses 50 % and 80 % of the maximum (fixed-ratio method).

**Expected result:** around 120/80 mmHg, with two MAP values: the oscillometric MAP and the formula MAP, (SYS + 2·DIA)/3, plus pulse pressure. Explain that they differ, and that real monitors also report the oscillometric value.

**Optional:** set **Motion artifact** to 70 % and start again. The measurement fails with "motion artifact" and reports no numbers. Reset afterwards.

## 5. Alarms (4:30–5:30)

**Click:** the **Alarms** tab.

1. Show the limits table: 7 parameters, each with a low limit, a high limit and a delay.
2. Choose the **Tachycardia (fast rate)** preset. After the 5 s delay a HR-high alarm appears in the alarm bar.
3. Click **Acknowledge**. The alarm stays listed while the condition lasts, but it is marked acknowledged.
4. Click **Audio pause 2 min**. Show the countdown.
5. Return to **Baseline adult**. The alarm ends by itself (alarms do not latch). Show the history list and **Export history CSV**.

**Say:** physiological alarms (patient values) and technical alarms (sensor problems) are kept apart and have different priorities.

## 6. Real data next to the simulation (5:30–6:45)

**Click:** the **Data import/export** tab.

1. Import `fixtures/vitals_units_fahrenheit_lb_kpa.csv`.
   - *Expected:* the import report lists accepted values, rejected values with reasons and empty cells. °F, lb and kPa are converted to °C, kg and mmHg.
2. Under **Manual entry**, add a temperature of 99.5 °F.
   - *Expected:* stored as 37.5 °C with source `user`.
3. Open the **Trends** tab and choose temperature. Simulated, imported and user values are drawn as separate series. Nothing is merged, and gaps are breaks, not zeros.

## 7. Watch data on Android (6:45–7:15)

This part is a short spoken note, or a planned demonstration on a phone. It is **not** part of the web page: real watch data enters PM-SIM only through the Android app, which wraps the same page. The Android app is still in development and has **not been tested with real hardware**, so do not present any result from it as verified.

**Say:**

- The Android app has three routes for watch data: reading Android Health Connect (with the user's permission), a native Bluetooth LE connection to the standard Heart Rate Service (0x180D), and import of a health-app export file.
- The watch may be an HONOR watch or any other watch that writes to Health Connect or exposes the standard heart-rate service. HONOR's own protocol is proprietary and is not used.
- Watch readings are consumer wearable values. In the app they are meant to be shown next to the simulation with their source, and they are never used to generate the ECG.
- The app has no internet permission, and the data stays on the phone.

**If the phone demonstration is done later:** install the APK (`release/PM-SIM-1.1.0-android.apk`), grant the Health Connect permissions, and show the values that arrive with the route recorded as their source. Until that has been done on a real device, report it as planned.

## 8. Tests (7:15–7:45)

**Click:** the **Tests** tab, then **Run browser self-test** (or open `index.html?selftest=1`).

**Expected:** 10 pass, 0 fail, 1 not run. Each row shows the input, the expected result and the observed result.

**Say:** the one hardware entry (watch data on Android through Health Connect, BLE or an export file) is reported as "not run" because no watch was connected. The app never marks a hardware test as passed without hardware. The same models and parsers are also checked by 47 Node unit tests (`node --test tests/unit/*.test.js`).

## 9. Closing (7:45–8:00)

**Say:**

- The model, its equations, assumptions and limitations are in `TECHNICAL_REPORT.md`, with sources in `REFERENCES.md`. The Android-only watch routes and their status are in `DEVICE_INTEGRATION_REPORT.md`. The page is online at https://hafij-bge.github.io/patient-monitoring/.
- Limitations to name aloud: the waveforms come from simplified models, the SpO₂ calibration is a textbook example, NIBP fails under strong motion, and no real watch or sensor was tested.
- Educational simulation only.
