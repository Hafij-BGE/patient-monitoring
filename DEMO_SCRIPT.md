# Demo Script

A demonstration of PM-SIM in about 9 minutes. Each step names what to click, what to say and what the audience should see. Times are cumulative.

> **Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.**

## Before you start

- Open `index.html` in Chrome or Edge. For the Bluetooth and serial parts, serve the folder instead (`python3 -m http.server 8000`) and open `http://localhost:8000/`.
- To show the HL7 MLLP listener as available, use the desktop app (Linux `.deb` or Windows build) instead of the browser. The rest of the script is the same in both.
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

**Click:** the **Devices** tab. Set **Device type** to *Pulse oximeter*.

1. Point at the route list: each route shows whether it is available in this browser. Select *Bluetooth LE standard health profile* and click **Start BLE replay** under *Packet replay (no hardware)*. Recorded Bluetooth packets for heart rate, pulse oximetry, blood pressure, temperature and weight run through the same parsers as a live device.
   - *Expected:* readings appear in the extra-devices tile, labelled SYNTHETIC. One truncated packet is rejected and one "not a number" temperature is stored as missing.
2. Mention **Connect a device…**: with a device that implements a standard Bluetooth health profile (for example a heart-rate strap or a Bluetooth thermometer) this connects through the browser's own device chooser. It needs Chrome or Edge and `localhost` or `https`, or the desktop app. Devices without a standard profile never appear in the chooser.

## 7. Hospital device integration (6:45–8:15)

Stay on the **Devices** tab.

1. Open the **Device type** list and show the 12 generic classes, from bedside monitor and central station to capnograph, ventilator and EHR export. No brand names are used.
2. Choose *Central station / device integration gateway*.
   - *Expected (browser):* *HL7 v2 over MLLP (TCP listener)* is marked unavailable, with the reason that a web page cannot open a TCP port. The file routes and the synthetic feed are available. In the desktop app the listener is available, on port 2575 and `127.0.0.1` by default.
   - **Say:** hospitals usually connect monitors through a central station or gateway that sends HL7 v2 ORU^R01 messages (IHE PCD-01) over MLLP. PM-SIM only receives; it never sends data out.
3. Select the route *HL7 v2 message file*, then click **Load synthetic example**.
   - *Expected:* 16 values imported, 1 missing. kPa and °F are converted. The respiratory rate that has no value is stored as missing, not 0. The patient identity segment is not stored.
4. Tick **Accept HL7 messages for this bed only** (bed `ICU^01^01`). Select the route *Synthetic HL7 feed (no hardware)* and click **Start feed**. Open the **Message log** while it runs (one message every 2 s, about 40 s in total).
   - *Expected:* each row shows the raw HL7 text and what was decoded. SpO₂ drops to 88 % for a few messages, one respiratory rate is missing and one temperature of 55 °C is flagged invalid. At the end: "Finished: 20 messages, 5 dropped by the bed filter."
   - **Say:** the 5 dropped messages were for the neighbouring bed `ICU^01^02`. A central station sends data for many beds, so the bed filter matters.
5. Change **Device type** to *Bedside multiparameter monitor*, select the route *SDC MDIB XML* and click **Load synthetic example**.
   - *Expected:* 7 imported, 1 missing. The SpO₂ value of questionable validity is flagged low quality.
6. **Say:** all of this was tested only with synthetic messages written from the published standards. No real monitor was connected, and some MDC codes are still unconfirmed. Details are in `DEVICE_INTEGRATION_REPORT.md`.

## 8. Tests (8:15–8:45)

**Click:** the **Tests** tab, then **Run browser self-test** (or open `index.html?selftest=1`).

**Expected:** 13 pass, 0 fail, 2 not run. Each row shows the input, the expected result and the observed result.

**Say:** the two hardware tests (a real BLE device and a live HL7 feed from a real monitor or gateway) are reported as "not run" because no device was connected. The app never marks a hardware test as passed without hardware. The same models and parsers are also checked by 71 Node unit tests (`node --test tests/unit/*.test.js`).

## 9. Closing (8:45–9:00)

**Say:**

- The model, its equations, assumptions and limitations are in `TECHNICAL_REPORT.md`, with sources in `REFERENCES.md`. Device interfaces are described in `DEVICE_INTEGRATION_REPORT.md`.
- Limitations to name aloud: the waveforms come from simplified models, the SpO₂ calibration is a textbook example, NIBP fails under strong motion, and no real device was tested.
- Educational simulation only.
