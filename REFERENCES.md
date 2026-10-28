# References

Each entry lists what it supports in PM-SIM. Web pages were consulted in October 2026. References used only by the removed device integration (HL7 v2, MLLP, IHE PCD, IEEE 11073, FHIR, LOINC, Web Bluetooth, Web Serial, Electron) were dropped on 2026-10-28.

## Signal models and algorithms

1. **McSharry PE, Clifford GD, Tarassenko L, Smith LA.** A dynamical model for generating synthetic electrocardiogram signals. *IEEE Trans Biomed Eng.* 2003;50(3):289–294.
   Supports: ECG ODE, P–Q–R–S–T parameters (Table I), limit-cycle formulation (`src/sim/ecg.js`).
2. **PhysioNet. ECGSYN, `ecgsyn.m` reference implementation** (McSharry PE, Clifford GD). https://physionet.org/content/ecgsyn/
   Supports: heart-rate scaling of the angles and widths (√(HR/60) factors).
3. **Pan J, Tompkins WJ.** A real-time QRS detection algorithm. *IEEE Trans Biomed Eng.* 1985;32(3):230–236.
   Supports: QRS detector stages, adaptive threshold, refractory period and T-wave check (`src/sim/detectors.js`).
4. **Webster JG, ed.** *Design of Pulse Oximeters.* Bristol: IOP Publishing; 1997.
   Supports: two-wavelength transmission model, ratio of ratios, empirical calibration.
5. **Allen J.** Photoplethysmography and its application in clinical physiological measurement. *Physiol Meas.* 2007;28(3):R1–R39.
   Supports: PPG AC/DC components, perfusion index, motion artifact.
6. **Texas Instruments.** Application note SLAA655, pulse-oximeter design using the MSP430.
   Supports: the example linear calibration SpO₂ = 110 − 25 R. It is used here only as a textbook example.
7. **Webster JG, ed.** *Medical Instrumentation: Application and Design.* 4th ed. Hoboken: Wiley; 2010.
   Supports: general background on ECG amplifiers and filters, impedance pneumography, oscillometric NIBP and temperature probes.
8. **Geddes LA, Voelz M, Combs C, Reiner D, Babbs CF.** Characterization of the oscillometric method for measuring indirect blood pressure. *Ann Biomed Eng.* 1982;10(6):271–280.
   Supports: fixed-ratio method (systolic and diastolic ratios of the maximum oscillation).
9. **Forouzanfar M, Dajani HR, Groza VZ, Bolic M, Rajan S, Batkin I.** Oscillometric blood pressure estimation: past, present, and future. *IEEE Rev Biomed Eng.* 2015;8:44–63.
   Supports: overview of oscillometric estimation methods, MAP at maximum amplitude, sources of error including motion.
10. **Babbs CF.** Oscillometric measurement of systolic and diastolic blood pressures validated in a physiologic mathematical model. *BioMed Eng OnLine.* 2012;11:56.
    Supports: modelling oscillometry with an arterial pressure–volume curve under the cuff.
11. **Langewouters GJ, Wesseling KH, Goedhard WJA.** The static elastic properties of 45 human thoracic and 20 abdominal aortas in vitro and the parameters of a new model. *J Biomech.* 1984;17(6):425–435.
    Supports: arctangent form of the arterial pressure–area relation.
12. **Drzewiecki G, Hood R, Apple H.** Theory of the oscillometric maximum and the systolic and diastolic detection ratios. *Ann Biomed Eng.* 1994;22(1):88–96.
    Supports: asymmetric (collapse versus distension) arterial compliance and why the oscillation maximum lies near MAP.

## Patient profile

13. **Mosteller RD.** Simplified calculation of body-surface area. *N Engl J Med.* 1987;317(17):1098.
    Supports: BSA = √(height × weight / 3600).
14. **World Health Organization.** Body mass index (BMI) classification for adults; BMI-for-age growth references for 5–19 years.
    Supports: adult BMI categories applied only from age 20.

## Alarms

15. **IEC 60601-1-8.** Medical electrical equipment, Part 1-8: General requirements, tests and guidance for alarm systems in medical electrical equipment and medical electrical systems.
    Supports: vocabulary only (alarm condition, delay, priority, acknowledge, audio paused, technical versus physiological). PM-SIM does not claim compliance.

## Watch data and units (Android app)

16. **Bluetooth SIG.** GATT Specification Supplement. https://www.bluetooth.com/specifications/gss/
    Supports: field layout and flags of the Heart Rate Measurement characteristic 0x2A37 (`src/devices/gatt.js`).
17. **Bluetooth SIG.** Assigned Numbers. https://www.bluetooth.com/specifications/assigned-numbers/
    Supports: the UUIDs of the Heart Rate Service (0x180D) and its characteristics (0x2A37, 0x2A38).
18. **Bluetooth SIG.** Heart Rate Service 1.0 and Heart Rate Profile 1.0. https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/
    Supports: heart-rate notification behaviour used by the Android app's BLE route.
19. **Android Developers.** Health Connect. https://developer.android.com/health-and-fitness/guides/health-connect
    Supports: the read-only, permission-based access to heart rate, SpO₂, respiratory rate, blood pressure, body temperature, weight, height and steps in the Android app, and the record fields (time, data origin) kept in the provenance by `src/devices/androidBridge.js`.
20. **Android Developers.** Bluetooth Low Energy overview. https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview
    Supports: scanning, GATT connection and notifications in the Android app's native BLE client.
21. **Regenstrief Institute.** The Unified Code for Units of Measure (UCUM). https://ucum.org/
    Supports: unit symbols and the conversions to the app's internal units (listed on the app's References tab; `src/core/units.js` does not cite it directly).

## Regulatory context

22. **U.S. Food and Drug Administration.** General Wellness: Policy for Low Risk Devices. Guidance, January 2026 (docket FDA-2014-N-1039). https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices
    Supports: why consumer wearable readings are treated as non-clinical data.
23. **U.S. Food and Drug Administration.** Pulse Oximeters for Medical Purposes: Non-Clinical and Clinical Performance Testing, Labeling, and Premarket Submission Recommendations. Draft guidance, January 2025 (docket FDA-2023-N-4976).
    Supports: the difference between medical and consumer oximetry and known accuracy limits.
24. **U.S. Food and Drug Administration.** Pulse Oximeter Accuracy and Limitations: FDA Safety Communication, 19 February 2021. https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters
    Supports: limitations of SpO₂ readings mentioned in the report and the app.

## Capnography, arterial line and rhythm analysis

These entries were added on 2026-10-28 with the capnography, arterial-line and arrhythmia features. The constants used in PM-SIM for these features are teaching choices and are not taken from these documents (see `TECHNICAL_REPORT.md` sections 3.8–3.10).

25. **Gardner RM.** Direct blood pressure measurement—dynamic response requirements. *Anesthesiology.* 1981;54:227–236.
    Supports: describing a fluid-filled catheter–transducer system by its natural frequency and damping coefficient, and the effect of under- and over-damping on systolic and diastolic readings (`src/sim/engine.js`, IBP damping).
26. **ISO 80601-2-55.** Medical electrical equipment, Part 2-55: Particular requirements for the basic safety and essential performance of respiratory gas monitors.
    Supports: vocabulary only (end-tidal and inspired CO₂, sidestream sampling). PM-SIM does not claim compliance.
27. **IEC 60601-2-27.** Medical electrical equipment, Part 2-27: Particular requirements for the basic safety and essential performance of electrocardiographic monitoring equipment.
    Supports: the note that a clinical arrhythmia detector is tested against annotated ECG databases (`src/sim/arrhythmia.js`). The rhythm alarm priorities in `src/alarms/alarmEngine.js` are set only in the spirit of this standard. PM-SIM's rhythm analyser was not tested this way and does not claim compliance.
