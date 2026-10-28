# References

Each entry lists what it supports in PM-SIM. Web pages were consulted in October 2026.

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

## Devices and data formats

16. **Bluetooth SIG.** GATT Specification Supplement. https://www.bluetooth.com/specifications/gss/
    Supports: field layouts and flags of characteristics 0x2A37, 0x2A5E, 0x2A5F, 0x2A35, 0x2A36, 0x2A1C, 0x2A1E, 0x2A9D (`src/devices/gatt.js`).
17. **Bluetooth SIG.** Assigned Numbers. https://www.bluetooth.com/specifications/assigned-numbers/
    Supports: service and characteristic UUIDs.
18. **Bluetooth SIG.** Heart Rate Service 1.0 and Heart Rate Profile 1.0. https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/
    Supports: heart-rate notification behaviour. The Pulse Oximeter, Blood Pressure, Health Thermometer and Weight Scale service specifications were used in the same way.
19. **IEEE 11073-20601.** Health informatics, Personal health device communication, Part 20601: Application profile, optimized exchange protocol.
    Supports: SFLOAT and FLOAT number formats and their special values (NaN, NRes, ±INFINITY).
20. **W3C Web Bluetooth Community Group.** Web Bluetooth (draft specification). https://webbluetoothcg.github.io/web-bluetooth/
    Supports: chooser-based device request, secure-context requirement (`src/devices/webBluetooth.js`).
21. **Web Bluetooth CG.** Implementation status. https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md
    Supports: browser support statement (Chromium-based browsers only).
22. **Chrome for Developers.** Communicating with Bluetooth devices over JavaScript. https://developer.chrome.com/docs/capabilities/bluetooth
    Supports: practical connection, notification and disconnect handling.

## Hospital device interfaces

23. **Health Level Seven International.** HL7 Version 2 Product Suite. https://www.hl7.org/implement/standards/product_brief.cfm?product_id=185
    Supports: segment, field and component structure of ORU^R01 messages; MSH, PV1, OBR and OBX fields; ACK with MSA (`src/devices/hl7v2.js`).
24. **Health Level Seven International.** HL7 Version 2.x Implementation Guide: Transport Specification, MLLP Release 2.
    Supports: the minimal lower layer protocol frame (start block 0x0B, end block 0x1C followed by 0x0D) used by the MLLP listener and the serial framer (`electron/mllpServer.cjs`, `src/devices/hl7v2.js`, `src/devices/webSerial.js`).
25. **IHE International.** IHE Patient Care Device (PCD) Technical Framework, Volume 2, transaction PCD-01 (Communicate PCD Data). https://www.ihe.net/resources/technical_frameworks/#pcd
    Supports: the device-to-gateway ORU^R01 profile: MDC codes in OBX-3, UCUM or MDC units in OBX-6, equipment identifier in OBX-18, processing ID in MSH-11.
26. **ISO/IEEE 11073-10101.** Health informatics, Point-of-care medical device communication, Part 10101: Nomenclature.
    Supports: MDC reference identifiers and numeric codes for vital-sign metrics (`src/devices/mdc.js`).
27. **National Institute of Standards and Technology.** Rosetta Terminology Mapping Management System (RTMMS). https://rtmms.nist.gov/
    Supports: look-up of MDC reference identifiers, numeric codes and units. Only the codes marked `checked: true` in `src/devices/mdc.js` were cross-checked against published values; the others are labelled as not confirmed.
28. **IEEE 11073-10207.** Health informatics, Point-of-care medical device communication, Part 10207: Domain Information and Service Model for Service-Oriented Point-of-Care Medical Device Communication. https://standards.ieee.org/ieee/11073-10207/6152/
    Supports: the MDIB structure, numeric metric states and MetricQuality (Validity, Mode) read by the SDC file importer (`src/devices/sdc.js`).
29. **IEEE 11073-20701.** Health informatics, Point-of-care medical device communication, Part 20701: Service-Oriented Medical Device Exchange Architecture and Protocol Binding. https://standards.ieee.org/ieee/11073-20701/6151/
    Supports: the description of live SDC networking, which PM-SIM does not implement; only MDIB snapshots saved as files are read.
30. **Health Level Seven International.** FHIR Release 4, Observation resource. https://hl7.org/fhir/R4/observation.html
    Supports: Observation fields read by the FHIR importer (code, valueQuantity, component, effective time, status, dataAbsentReason) (`src/devices/fhir.js`).
31. **Health Level Seven International.** FHIR Release 4, Vital Signs profile. https://hl7.org/fhir/R4/observation-vitalsigns.html
    Supports: LOINC codes and UCUM units of the vital-sign observations, including the blood pressure panel 85354-9 with systolic and diastolic components.
32. **Regenstrief Institute.** LOINC. https://loinc.org/
    Supports: LOINC codes used as the second look-up key after MDC.
33. **Regenstrief Institute.** The Unified Code for Units of Measure (UCUM). https://ucum.org/
    Supports: unit codes and the unit conversions to the app's internal units (`src/core/units.js`).
34. **W3C Web Platform Incubator Community Group.** Web Serial API (draft). https://wicg.github.io/serial/
    Supports: the serial-port route for HL7 over RS-232 or USB serial adapters (`src/devices/webSerial.js`); Chromium-based browsers only.
35. **Electron.** Device access: Web Serial API. https://www.electronjs.org/docs/latest/tutorial/devices#web-serial-api
    Supports: the serial-port and Bluetooth chooser handlers and permission checks in the desktop app (`electron/main.cjs`).

## Regulatory context

36. **U.S. Food and Drug Administration.** General Wellness: Policy for Low Risk Devices. Guidance, January 2026 (docket FDA-2014-N-1039). https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices
    Supports: why consumer wearable readings are treated as non-clinical data.
37. **U.S. Food and Drug Administration.** Pulse Oximeters for Medical Purposes: Non-Clinical and Clinical Performance Testing, Labeling, and Premarket Submission Recommendations. Draft guidance, January 2025 (docket FDA-2023-N-4976).
    Supports: the difference between medical and consumer oximetry and known accuracy limits.
38. **U.S. Food and Drug Administration.** Pulse Oximeter Accuracy and Limitations: FDA Safety Communication, 19 February 2021. https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters
    Supports: limitations of SpO₂ readings mentioned in the report and the app.
