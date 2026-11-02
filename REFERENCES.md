# References

Each entry lists what it supports in VitalsLab. Web pages were consulted in October 2026. References used only by the removed device integration (HL7 v2, MLLP, IHE PCD, IEEE 11073, FHIR, LOINC, Web Bluetooth, Web Serial, Electron) were dropped on 2026-10-28.

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
    Supports: vocabulary only (alarm condition, delay, priority, acknowledge, audio paused, technical versus physiological). VitalsLab does not claim compliance (scenarios: `disconnect`, `missing`).

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

These entries were added on 2026-10-28 with the capnography, arterial-line and arrhythmia features. The constants used in VitalsLab for these features are teaching choices and are not taken from these documents (see `TECHNICAL_REPORT.md` sections 3.8–3.10).

25. **Gardner RM.** Direct blood pressure measurement—dynamic response requirements. *Anesthesiology.* 1981;54:227–236.
    Supports: describing a fluid-filled catheter–transducer system by its natural frequency and damping coefficient, and the effect of under- and over-damping on systolic and diastolic readings (`src/sim/engine.js`, IBP damping).
26. **ISO 80601-2-55.** Medical electrical equipment, Part 2-55: Particular requirements for the basic safety and essential performance of respiratory gas monitors.
    Supports: vocabulary only (end-tidal and inspired CO₂, sidestream sampling). VitalsLab does not claim compliance (scenarios: `rebreathing`).
27. **IEC 60601-2-27.** Medical electrical equipment, Part 2-27: Particular requirements for the basic safety and essential performance of electrocardiographic monitoring equipment.
    Supports: the note that a clinical arrhythmia detector is tested against annotated ECG databases (`src/sim/arrhythmia.js`). The rhythm alarm priorities in `src/alarms/alarmEngine.js` are set only in the spirit of this standard. VitalsLab's rhythm analyser was not tested this way and does not claim compliance (scenarios: `noisy-ecg`).

## Scenario sources

These entries were added on 2026-10-28 with the combined-sign scenarios in `src/sim/params.js` (preset field `refs`). Each scenario is an illustrative teaching pattern; real presentations vary and the values are not diagnostic. Where a source gives only a direction (for example "pulse pressure decreased"), the number in VitalsLab is an illustrative choice inside that direction.

28. **Spahn DR, et al.** Management of bleeding and coagulopathy following major trauma: an updated European guideline. *Crit Care.* 2013;17:R76. doi:10.1186/cc12685. PMID 23601765.
    Supports: ATLS class II (HR 100–120, SBP normal, pulse pressure decreased, RR 20–30) and class III (HR 120–140, SBP and pulse pressure decreased, RR 30–40) (`haem-2`, `haem-3`). These ranges are the ATLS 9th-edition table quoted by this guideline; the 10th edition (2018) no longer gives numeric HR and RR ranges.
29. **Mutschler M, et al.** A critical reappraisal of the ATLS classification of hypovolaemic shock. *Resuscitation.* 2013;84(3):309–313. doi:10.1016/j.resuscitation.2012.07.012. PMID 22835498.
    Supports: the caveat that only 9.3 % of 36,504 trauma patients matched an ATLS class.
30. **Lima AP, Beelen P, Bakker J.** Use of a peripheral perfusion index derived from the pulse oximetry signal as a noninvasive indicator of perfusion. *Crit Care Med.* 2002;30(6):1210–1213. doi:10.1097/00003246-200206000-00006. PMID 12072670.
    Supports: a perfusion index below 1.4 reflecting poor peripheral perfusion in critically ill patients (`haem-3`).
31. **Singer M, et al.** The Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3). *JAMA.* 2016;315(8):801–810. doi:10.1001/jama.2016.0287. PMID 26903338.
    Supports: SIRS criteria (temperature >38 or <36 °C, HR >90, RR >20) and qSOFA (RR ≥22, SBP ≤100) (`sepsis-screen`, `hypotension`, `tachypnea`, `fever`).
32. **Cardona V, et al.** World Allergy Organization anaphylaxis guidance 2020. *World Allergy Organ J.* 2020;13(10):100472. doi:10.1016/j.waojou.2020.100472. PMID 33204386.
    Supports: hypotension as SBP <90 mmHg or a fall >30 %, with bronchospasm and hypoxaemia (`anaphylaxis`).
33. **Harper NJN, et al.** Anaesthesia, surgery, and life-threatening allergic reactions: epidemiology and clinical features of perioperative anaphylaxis in the 6th National Audit Project (NAP6). *Br J Anaesth.* 2018;121(1):159–171. doi:10.1016/j.bja.2018.04.014. PMID 29935567.
    Supports: frequency of presenting features (hypotension, bronchospasm, tachycardia, desaturation) (`anaphylaxis`).
34. **Fu ES, et al.** Supplemental oxygen impairs detection of hypoventilation by pulse oximetry. *Chest.* 2004;126(5):1552–1558. doi:10.1378/chest.126.5.1552. PMID 15539726.
    Supports: SpO₂ staying normal during hypoventilation on supplemental oxygen (`hypovent-o2`).
35. **Aminiahidashti H, et al.** Applications of end-tidal carbon dioxide (ETCO2) monitoring in emergency department; a narrative review. *Emerg (Tehran).* 2018;6(1):e5. PMID 29503830. PMC5827051.
    Supports: capnography detecting hypoventilation before oximetry; prolonged expiratory phase in bronchospasm and COPD; low EtCO₂ (≤29 mmHg) in DKA (`hypovent-o2`, `anaphylaxis`, `dka-pattern`, `copd`, `apnea`, `bronchospasm`).
36. **Kitabchi AE, et al.** Hyperglycemic crises in adult patients with diabetes. *Diabetes Care.* 2009;32(7):1335–1343. doi:10.2337/dc09-9032. PMID 19564476.
    Supports: Kussmaul respiration, tachycardia and hypotension in DKA (`dka-pattern`).
37. **Konstantinides SV, et al.** 2019 ESC Guidelines for the diagnosis and management of acute pulmonary embolism. *Eur Heart J.* 2020;41(4):543–603. doi:10.1093/eurheartj/ehz405. PMID 31504429.
    Supports: sPESI items (pulse ≥110, SBP <100, SaO₂ <90 %) and haemodynamic instability as SBP <90 (`pe-pattern`).
38. **Hemnes AR, et al.** Bedside end-tidal CO2 tension as a screening tool to exclude pulmonary embolism. *Eur Respir J.* 2010;35(4):735–741. doi:10.1183/09031936.00084709. PMID 19717480.
    Supports: mean PETCO₂ 30.5 mmHg with PE versus 35.5 without (`pe-pattern`).
39. **Paal P, et al.** Accidental hypothermia: 2021 update. *Int J Environ Res Public Health.* 2022;19(1):501. doi:10.3390/ijerph19010501. PMID 35010760.
    Supports: stage II (<32–28 °C), bradycardia, hypotension, bradypnoea and difficult SpO₂ measurement from vasoconstriction (`hypothermia`).
40. **Rosenberg H, et al.** Malignant hyperthermia: a review. *Orphanet J Rare Dis.* 2015;10:93. doi:10.1186/s13023-015-0310-1. PMID 26238698.
    Supports: tachycardia and rising EtCO₂ as the earliest signs, temperature rising later (`mh-early`, `mh-late`).
41. **Larach MG, et al.** A clinical grading scale to predict malignant hyperthermia susceptibility. *Anesthesiology.* 1994;80(4):771–779. doi:10.1097/00000542-199404000-00008. PMID 8024130.
    Supports: PETCO₂ >55 mmHg with controlled ventilation, temperature >38.8 °C, inappropriate sinus tachycardia, ventricular arrhythmia (`mh-early`, `mh-late`).
42. **O'Driscoll BR, et al.** BTS guideline for oxygen use in adults in healthcare and emergency settings. *Thorax.* 2017;72(Suppl 1):ii1–ii90. doi:10.1136/thoraxjnl-2016-209729. PMID 28507176.
    Supports: SpO₂ target 88–92 % in patients at risk of hypercapnic respiratory failure (`copd`, `desat`).
43. **Mattu A, Brady WJ, Robinson DA.** Electrocardiographic manifestations of hyperkalemia. *Am J Emerg Med.* 2000;18(6):721–729. doi:10.1053/ajem.2000.7344. PMID 11043630.
    Supports: peaked T waves, then P-wave flattening and QRS widening; poor correlation with potassium level (`hyperk-early`, `hyperk-late`).
44. **Fodstad H, Kelly PJ, Buchfelder M.** History of the Cushing reflex. *Neurosurgery.* 2006;59(5):1132–1137. doi:10.1227/01.NEU.0000245582.08532.7C. PMID 17143247.
    Supports: rising systolic and pulse pressure with bradycardia and irregular breathing (`cushing`).

## Glucose model sources

Used by `src/sim/glucose.js` (TECHNICAL_REPORT.md section 3.13). The model is a teaching model with population parameters; no individual is fitted.

45. **Bergman RN, Ider YZ, Bowden CR, Cobelli C.** Quantitative estimation of insulin sensitivity. *Am J Physiol.* 1979;236(6):E667–E677. doi:10.1152/ajpendo.1979.236.6.E667. PMID 443421.
    Supports: the minimal model of glucose disappearance (glucose effectiveness SG, remote insulin action X, insulin sensitivity SI = p3/p2).
46. **Pacini G, Tonolo G, Sambataro M, et al.** Insulin sensitivity and glucose effectiveness: minimal model analysis of regular and insulin-modified FSIGT. *Am J Physiol.* 1998;274(4):E592–E599. doi:10.1152/ajpendo.1998.274.4.E592. PMID 9575818.
    Supports: SG = 0.0260 ± 0.0028 min⁻¹ in 16 normal subjects (regular FSIGT), used as `SG`.
47. **Kanderian SS, Weinzimer S, Voskanyan G, Steil GM.** Identification of intraday metabolic profiles during closed-loop glucose control in individuals with type 1 diabetes. *J Diabetes Sci Technol.* 2009;3(5):1047–1057. doi:10.1177/193229680900300508. PMID 20144418. PMC2769900.
    Supports: the minimal model written with insulin action dX/dt = −p2·X + p2·SI·I and exogenous insulin only in type 1 diabetes; `p2` = 0.0113 min⁻¹ is the mean of the 10 subject values in its Table 1 (mean calculated here); type 1 SI range 9.64 × 10⁻⁵ to 1.73 × 10⁻³.
48. **Hovorka R, Canonico V, Chassin LJ, et al.** Nonlinear model predictive control of glucose concentration in subjects with type 1 diabetes. *Physiol Meas.* 2004;25(4):905–920. doi:10.1088/0967-3334/25/4/010. PMID 15382830.
    Supports: two-compartment meal absorption and subcutaneous insulin absorption; AG 0.8, tmax,G 40 min, tmax,I 55 min, ke 0.138 min⁻¹, VI 0.12 L/kg, VG 0.16 L/kg (values as tabulated in Resalat N, et al. *PLoS ONE.* 2019;14(7):e0217301, Table 2, doi:10.1371/journal.pone.0217301).
49. **Welch S, Gebhart SS, Bergman RN, Phillips LS.** Minimal model analysis of intravenous glucose tolerance test-derived insulin sensitivity in diabetic subjects. *J Clin Endocrinol Metab.* 1990;71(6):1508–1518. doi:10.1210/jcem-71-6-1508. PMID 2229309.
    Supports: SI 4.1 ± 0.4 × 10⁻⁴ min⁻¹ per µU/mL in normal subjects and 0.61 ± 0.16 × 10⁻⁴ in type 2 diabetes, used as `TYPES.none.SI` and `TYPES.type2.SI`.
50. **Kahn SE, Prigeon RL, McCulloch DK, et al.** Quantification of the relationship between insulin sensitivity and beta-cell function in human subjects. Evidence for a hyperbolic function. *Diabetes.* 1993;42(11):1663–1672. doi:10.2337/diab.42.11.1663. PMID 8405710.
    Supports: β-cell function rising to compensate for low insulin sensitivity (SI × β-cell function ≈ constant), the reason type 2 secretion is reduced, not removed. The halved gain itself is illustrative.
51. **American Diabetes Association Professional Practice Committee.** 6. Glycemic goals, hypoglycemia, and hyperglycemic crises: Standards of Care in Diabetes—2026. *Diabetes Care.* 2026;49(Suppl 1):S132–S149. doi:10.2337/dc26-S006. PMID 41358894.
    Supports: hypoglycaemia level 1 below 70 mg/dL (3.9 mmol/L) and level 2 below 54 mg/dL (3.0 mmol/L), used for the glucose low limit and the high-priority level 2 alarm.
52. **Battelino T, Danne T, Bergenstal RM, et al.** Clinical targets for continuous glucose monitoring data interpretation: recommendations from the International Consensus on Time in Range. *Diabetes Care.* 2019;42(8):1593–1603. doi:10.2337/dci19-0028. PMID 31177185.
    Supports: time in range 70–180 mg/dL (3.9–10.0 mmol/L) and the 180 and 250 mg/dL bands, used for the glucose high limit and the forecast summary.
53. **De Gaetano A, Arino O.** Mathematical modelling of the intravenous glucose tolerance test. *J Math Biol.* 2000;40(2):136–168. doi:10.1007/s002850050007. PMID 10743599.
    Supports: the coupled minimal model may have no equilibrium and unbounded insulin action, the reason the model clamps glucose uptake at zero and glucose to 1–1000 mg/dL.
54. **Saad MF, Anderson RL, Laws A, et al.** A comparison between the minimal model and the glucose clamp in the assessment of insulin sensitivity across the spectrum of glucose tolerance. *Diabetes.* 1994;43(9):1114–1121. doi:10.2337/diab.43.9.1114. PMID 8070611.
    Supports: limitation statement — minimal-model SI is about 66 % lower than clamp SI and is not distinguishable from 0 in about half of type 2 patients.

## SVT scenario sources

55. **Page RL, Joglar JA, Caldwell MA, et al.** 2015 ACC/AHA/HRS Guideline for the Management of Adult Patients With Supraventricular Tachycardia. *Circulation.* 2016;133(14):e506–e574. doi:10.1161/CIR.0000000000000311. PMID 26399663.
    Supports: SVT as a regular narrow-QRS tachycardia from tissue at or above the His bundle; P waves hidden in or just after the QRS in AV-nodal re-entry (`svt`, `tachy`).
56. **Brugada J, Katritsis DG, Arbelo E, et al.** 2019 ESC Guidelines for the management of patients with supraventricular tachycardia. *Eur Heart J.* 2020;41(5):655–720. doi:10.1093/eurheartj/ehz467. PMID 31504425.
    Supports: same ECG features; telling SVT from sinus tachycardia needs P-wave analysis, onset and the response to vagal manoeuvres (`svt`).

## Peri-arrest scenario sources

57. **Schein RM, Hazday N, Pena M, Ruben BH, Sprung CL.** Clinical antecedents to in-hospital cardiopulmonary arrest. *Chest.* 1990;98(6):1388–1392. doi:10.1378/chest.98.6.1388. PMID 2245680.
    Supports: 84 % of 64 patients had documented deterioration within 8 h before arrest, mostly respiratory or mental; mean respiratory rate 29 ± 1 /min (`deteriorating`).
58. **Kause J, Smith G, Prytherch D, et al.** A comparison of antecedents to cardiac arrests, deaths and emergency intensive care admissions in Australia and New Zealand, and the United Kingdom—the ACADEMIA study. *Resuscitation.* 2004;62(3):275–282. doi:10.1016/j.resuscitation.2004.05.016. PMID 15325446.
    Supports: hypotension and a fall in consciousness as the most common antecedents in the 8 h before arrest (`deteriorating`).
59. **Andersen LW, Holmberg MJ, Berg KM, Donnino MW, Granfeldt A.** In-hospital cardiac arrest: a review. *JAMA.* 2019;321(12):1200–1210. doi:10.1001/jama.2019.1696. PMID 30912843.
    Supports: about 81 % of in-hospital arrests start in a non-shockable rhythm (asystole or PEA); respiratory insufficiency is a common cause (`deteriorating`, `periarrest`).
60. **Soar J, Böttiger BW, Carli P, et al.** European Resuscitation Council Guidelines 2021: Adult advanced life support. *Resuscitation.* 2021;161:115–151. doi:10.1016/j.resuscitation.2021.02.010. PMID 33773825.
    Supports: recognising deterioration to prevent in-hospital arrest; hypoxia as a reversible cause; low EtCO₂ with low cardiac output (`periarrest`, `vt`, `vf`, `asystole`).

## Stroke scenario sources

61. **Powers WJ, Rabinstein AA, Ackerson T, et al.** Guidelines for the early management of patients with acute ischemic stroke: 2019 update to the 2018 guidelines. *Stroke.* 2019;50(12):e344–e418. doi:10.1161/STR.0000000000000211. PMID 31662037.
    Supports: blood pressure must be below 185/110 mmHg before intravenous thrombolysis; imaging is needed to exclude haemorrhage; cardiac monitoring to detect atrial fibrillation (`stroke`).
62. **Qureshi AI, Ezzeddine MA, Nasar A, et al.** Prevalence of elevated blood pressure in 563,704 adult patients with stroke presenting to the ED in the United States. *Am J Emerg Med.* 2007;25(1):32–38. doi:10.1016/j.ajem.2006.07.008. PMID 17157679.
    Supports: initial SBP ≥ 140 mmHg in 69 % of stroke patients and 185–219 mmHg in 13 % (`stroke`).

## Heart-failure scenario sources

63. **McDonagh TA, Metra M, Adamo M, et al.** 2021 ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure. *Eur Heart J.* 2021;42(36):3599–3726. doi:10.1093/eurheartj/ehab368. PMID 34447992.
    Supports: the clinical presentations of acute heart failure (acute decompensated, acute pulmonary oedema, isolated right-ventricular failure, cardiogenic shock) and the congestion / hypoperfusion assessment (`hf-oedema`, `hf-cold-wet`, `cardiogenic-shock`).
64. **Nohria A, Tsang SW, Fang JC, et al.** Clinical assessment identifies hemodynamic profiles that predict outcomes in patients admitted with heart failure. *J Am Coll Cardiol.* 2003;41(10):1797–1804. doi:10.1016/s0735-1097(03)00309-7. PMID 12767667.
    Supports: the warm/cold (perfusion) and dry/wet (congestion) profiles, with narrow pulse pressure as a sign of hypoperfusion; wet-cold has the highest risk (`hf-oedema`, `hf-cold-wet`).
65. **Baran DA, Grines CL, Bailey S, et al.** SCAI clinical expert consensus statement on the classification of cardiogenic shock. *Catheter Cardiovasc Interv.* 2019;94(1):29–37. doi:10.1002/ccd.28329. PMID 31104355.
    Supports: shock stages A–E; stage C ("classic") is hypotension with hypoperfusion (`cardiogenic-shock`).

## Post-operative scenario sources

66. **Lee LA, Caplan RA, Stephens LS, et al.** Postoperative opioid-induced respiratory depression: a closed claims analysis. *Anesthesiology.* 2015;122(3):659–665. doi:10.1097/ALN.0000000000000564. PMID 25536092.
    Supports: 88 % of respiratory-depression events within 24 h of surgery; somnolence noted before the event in 62 %; 97 % judged preventable with better monitoring of oxygenation and ventilation (`postop-opioid`, `bradypnea`).
67. **Sessler DI.** Perioperative thermoregulation and heat balance. *Lancet.* 2016;387(10038):2655–2664. doi:10.1016/S0140-6736(15)00981-2. PMID 26775126.
    Supports: unwarmed anaesthetised patients become hypothermic by 1–2 °C; vasoconstriction and shivering as thermoregulatory defences; shivering as a complication (`postop-hypothermia`).
68. **Miskovic A, Lumb AB.** Postoperative pulmonary complications. *Br J Anaesth.* 2017;118(3):317–334. doi:10.1093/bja/aex002. PMID 28186222.
    Supports: atelectasis develops in > 75 % of patients given a neuromuscular blocking drug; pulmonary complications are common after surgery and raise mortality (`postop-ppc`).

## 12-lead ECG sources

69. **Dower GE, Machado HB, Osborne JA.** On deriving the electrocardiogram from vectorcardiographic leads. *Clin Cardiol.* 1980;3(2):87–95. PMID 6993081.
    Supports: the 12-lead ECG can be derived from the Frank X, Y, Z signals by a fixed linear transform close enough to the recorded ECG for serial comparison (`src/sim/ecg12.js`).
70. **Edenbrandt L, Pahlm O.** Vectorcardiogram synthesized from a 12-lead ECG: superiority of the inverse Dower matrix. *J Electrocardiol.* 1988;21(4):361–367. doi:10.1016/0022-0736(88)90113-6. PMID 3241148.
    Supports: the Dower matrix coefficients used for leads I, II and V1–V6 (`DOWER` in `src/sim/ecg12.js`).
71. **Kligfield P, Gettes LS, Bailey JJ, et al.** Recommendations for the standardization and interpretation of the electrocardiogram, part I: the electrocardiogram and its technology. *Circulation.* 2007;115(10):1306–1324. doi:10.1161/CIRCULATIONAHA.106.180200. PMID 17322457.
    Supports: the derived limb leads (III = II − I and the augmented leads), the standard 3 × 4 layout with a rhythm strip, 25 mm/s, 10 mm/mV, the 1 mV calibration pulse and the 0.05–150 Hz diagnostic bandwidth (12-lead view, `noisy-ecg`).

## Profile use-case sources

72. **Acute Respiratory Distress Syndrome Network; Brower RG, Matthay MA, Morris A, Schoenfeld D, Thompson BT, Wheeler A.** Ventilation with lower tidal volumes as compared with traditional tidal volumes for acute lung injury and the acute respiratory distress syndrome. *N Engl J Med.* 2000;342(18):1301–1308. doi:10.1056/NEJM200005043421801. PMID 10793162.
    Supports: tidal volume of 6 mL/kg of predicted body weight (lower mortality than 12 mL/kg) and the predicted-body-weight formula of the trial, male 50 + 0.91 × (height cm − 152.4), female 45.5 + 0.91 × (height cm − 152.4) (`predictedBodyWeight` in `src/core/profile.js`).
73. **Evans L, Rhodes A, Alhazzani W, et al.** Surviving sepsis campaign: international guidelines for management of sepsis and septic shock 2021. *Intensive Care Med.* 2021;47(11):1181–1247. doi:10.1007/s00134-021-06506-y. PMID 34599691. PMC8486643.
    Supports: at least 30 mL/kg IV crystalloid within the first 3 h for sepsis-induced hypoperfusion or septic shock (recommendation 5, weak, low-quality evidence; the 2016 text used ideal body weight); low tidal volume of 6 mL/kg PBW in sepsis-induced ARDS (recommendation 49), earlier versions 4–8 mL/kg PBW (Profile calculators).
74. **Kellum JA, Lameire N; KDIGO AKI Guideline Work Group.** Diagnosis, evaluation, and management of acute kidney injury: a KDIGO summary (Part 1). *Crit Care.* 2013;17(1):204. doi:10.1186/cc11454. PMID 23394211. PMC4057151.
    Supports: urine volume < 0.5 mL/kg/h for 6 h as an AKI criterion and stage 1 (6–12 h) (urine output threshold card).
75. **Tanaka H, Monahan KD, Seals DR.** Age-predicted maximal heart rate revisited. *J Am Coll Cardiol.* 2001;37(1):153–156. doi:10.1016/s0735-1097(00)01054-8. PMID 11153730.
    Supports: HRmax = 208 − 0.7 × age, independent of sex (`hrMaxTanaka`).
76. **Caputo N, Reilly J, Kanter M, West J.** A retrospective analysis of the respiratory adjusted shock index to determine the presence of occult shock in trauma patients. *J Trauma Acute Care Surg.* 2018;84(4):674–678. doi:10.1097/TA.0000000000001761. PMID 29251715.
    Supports: shock index = HR / SBP, healthy adult range 0.5–0.7; SI alone had AUC 0.58 for occult hypoperfusion (`SI_NORMAL`, NIBP tile).
77. **Zarzaur BL, Croce MA, Fischer PE, Magnotti LJ, Fabian TC.** New vitals after injury: shock index for the young and age x shock index for the old. *J Surg Res.* 2008;147(2):229–236. doi:10.1016/j.jss.2008.03.025. PMID 18498875.
    Supports: age × SI predicted 48-h mortality better than HR, SBP or SI in injured patients older than 55 (AUC 0.828). The abstract gives no cut-off, so VitalsLab does not show Age × SI (removed 2026-10-29); the reference explains why only SI is shown.
78. **Wright JD, Hughes JP, Ostchega Y, Yoon SS, Nwankwo T.** Mean systolic and diastolic blood pressure in adults aged 18 and over in the United States, 2001–2008. *Natl Health Stat Report.* 2011;(35):1–22, 24. PMID 21485611.
    Supports: mean SBP/DBP by age group (18–39, 40–59, 60+) and sex, "Total" columns of Tables 2–7 (`BP_NORMS`, `bpForAge`). The group centres 28.5, 49.5 and 70 years and the linear interpolation between them are VitalsLab's own choice (scenarios: `baseline`).
79. **Franklin SS, Gustin W, Wong ND, et al.** Hemodynamic patterns of age-related changes in blood pressure. The Framingham Heart Study. *Circulation.* 1997;96(1):308–315. doi:10.1161/01.cir.96.1.308. PMID 9236450.
    Supports: SBP rises with age, DBP falls after age 50–60 and pulse pressure widens (unit test of `bpForAge`).
80. **Ostchega Y, Porter KS, Hughes J, Dillon CF, Nwankwo T.** Resting pulse rate reference data for children, adolescents, and adults: United States, 1999–2008. *Natl Health Stat Report.* 2011;(41). PMID 21905522.
    Supports: adult resting pulse stays about 72 beats/min across age groups, so "age sets blood pressure" does not change HR (scenarios: `baseline`).

## Audit sources (2026-10-29)

81. **Umpierrez GE, Davis GM, ElSayed NA, et al.** Hyperglycaemic crises in adults with diabetes: a consensus report. *Diabetologia.* 2024;67(8):1455–1479. doi:10.1007/s00125-024-06183-8. PMID 38907161.
    Supports: DKA diagnosis with glucose ≥ 200 mg/dL (11.1 mmol/L) or known diabetes, ketonaemia and acidosis (`dka` scenario note).
82. **Sagie A, Larson MG, Goldberg RJ, Bengtson JR, Levy D.** An improved method for adjusting the QT interval for heart rate (the Framingham Heart Study). *Am J Cardiol.* 1992;70(7):797–801. doi:10.1016/0002-9149(92)90562-D. PMID 1519533.
    Supports: the linear QT–RR relation QT = QTc − 0.154 (1 − RR) used to place the T wave from the preceding R–R interval (`qtFor` in `src/sim/ecg.js`).
83. **Westerhof N, Lankhaar JW, Westerhof BE.** The arterial Windkessel. *Med Biol Eng Comput.* 2009;47(2):131–141. doi:10.1007/s11517-008-0359-2. PMID 18543011.
    Supports: the three-element Windkessel P = P∞ + Zc·Q + Pc, C·dPc/dt = Q − Pc/R, used for the arterial pressure pulse (`src/sim/pulse.js`).
84. **Weissler AM, Harris WS, Schoenfeld CD.** Systolic time intervals in heart failure in man. *Circulation.* 1968;37(2):149–159. doi:10.1161/01.cir.37.2.149. PMID 5640345.
    Supports: the left-ventricular ejection time regression LVET = 413 − 1.7·HR ms (men) that sets the ejection time of each simulated beat.
85. **Brookes CI, White PA, Staples M, et al.** Myocardial contractility is not constant during spontaneous atrial fibrillation in patients. *Circulation.* 1998;98(17):1762–1768. doi:10.1161/01.cir.98.17.1762. PMID 9788831.
    Supports: beat-to-beat stroke volume and pulse pressure vary with the preceding R–R interval in AF (modelled through diastolic filling time); the contractility changes this paper also reports are not modelled.
86. **Ramirez AH, Schildcrout JS, Blakemore DL, et al.** Modulators of normal electrocardiographic intervals identified in a large electronic medical record. *Heart Rhythm.* 2011;8(2):271–277. doi:10.1016/j.hrthm.2010.10.034. PMID 21044898.
    Supports: adult ECG reference ranges used to place the simulated P, Q, R, S events (95 % of 32 949 normal ECGs: PR 125–196 ms, QRS 69–103 ms).
87. **Palhares DMF, Marcolino MS, Santos TMM, et al.** Normal limits of the electrocardiogram derived from a large database of Brazilian primary care patients. *BMC Cardiovasc Disord.* 2017;17(1):152. doi:10.1186/s12872-017-0572-8. PMID 28610624.
    Supports: normal limits of P duration, PR, QRS and QTc (Bazett, Fridericia, Framingham, Hodges) from 486 014 ECGs; used as a second, more recent check of the simulated intervals.
88. **Vandenberk B, Vandael E, Robyns T, et al.** Which QT correction formulae to use for QT monitoring? *J Am Heart Assoc.* 2016;5(6):e003264. doi:10.1161/JAHA.116.003264. PMID 27317349.
    Supports: Fridericia and Framingham gave the best rate correction and mortality prediction; Bazett performed worst. Basis for Framingham as the default QTc formula and for the Bazett and Hodges options.
89. **Fridericia LS.** The duration of systole in an electrocardiogram in normal humans and in patients with heart disease (1920, English translation). *Ann Noninvasive Electrocardiol.* 2003;8(4):343–351. doi:10.1046/j.1542-474x.2003.08413.x. PMID 14516292.
    Supports: the cube-root correction QTc = QT / RR^(1/3).
90. **Du Bois D, Du Bois EF.** A formula to estimate the approximate surface area if height and weight be known (1916, reprint). *Nutrition.* 1989;5(5):303–311. PMID 2520314.
    Supports: BSA = 0.007184 · W^0.425 · H^0.725 (BSA option).
91. **Haycock GB, Schwartz GJ, Wisotsky DH.** Geometric method for measuring body surface area: a height-weight formula validated in infants, children, and adults. *J Pediatr.* 1978;93(1):62–66. doi:10.1016/s0022-3476(78)80601-5. PMID 650346.
    Supports: BSA = 0.024265 · W^0.5378 · H^0.3964 (BSA option).
92. **Gellish RL, Goslin BR, Olson RE, et al.** Longitudinal modeling of the relationship between age and maximal heart rate. *Med Sci Sports Exerc.* 2007;39(5):822–829. doi:10.1097/mss.0b013e31803349c6. PMID 17468581.
    Supports: HRmax = 207 − 0.7 · age (maximal heart rate option).
93. **Millasseau SC, Kelly RP, Ritter JM, Chowienczyk PJ.** Determination of age-related increases in large artery stiffness by digital pulse contour analysis. *Clin Sci (Lond).* 2002;103(4):371–377. doi:10.1042/cs1030371. PMID 12241535.
    Supports: the finger volume pulse has a direct (systolic) and a reflected (diastolic) peak; their delay ΔT gives the stiffness index SI = height/ΔT, with SI = 0.63 + 0.086·age + 0.042·MAP m/s (87 subjects, 21–68 years). Used for the reflection delay of the simulated pleth.
94. **Chowienczyk PJ, Kelly RP, MacCallum H, et al.** Photoplethysmographic assessment of pulse wave reflection: blunted response to endothelium-dependent β2-adrenergic vasodilation in type II diabetes mellitus. *J Am Coll Cardiol.* 1999;34(7):2007–2014. doi:10.1016/s0735-1097(99)00441-6. PMID 10588217.
    Supports: the notch/inflection of the digital volume pulse reflects pressure-wave reflection; nitrates lower it; the time between the first and second peak correlates with aortic transit time (r = 0.75). Basis for the reflection-gain parameter and its help text.
95. **Millasseau SC, Ritter JM, Takazawa K, Chowienczyk PJ.** Contour analysis of the photoplethysmographic pulse measured at the finger. *J Hypertens.* 2006;24(8):1449–1456. doi:10.1097/01.hjh.0000239277.05068.87. PMID 16877944.
    Supports: review of the digital volume pulse contour (systolic peak, notch or inflection, diastolic peak) and how vasoactive drugs, age and arterial stiffness change it.

## Disease scenario sources (2026-11-03)

Each entry was checked against its PubMed record (title, abstract, citation). Where the abstract does not give the figure used in a scenario note, the Supports line says "(full text)": that figure comes from the body of the paper and was not re-read for this release.

96. **Ruiz IA, Squair JW, Phillips AA, et al.** Incidence and natural progression of neurogenic shock after traumatic spinal cord injury. *J Neurotrauma.* 2018;35(3):461–466. doi:10.1089/neu.2016.4947. PMID 29141498.
    Supports: neurogenic shock after cervical cord injury (incidence 29 %); the reported incidence depends on which blood-pressure and heart-rate definition is used (`neurogenic-shock` scenario).
97. **Brignole M, Moya A, de Lange FJ, et al.** 2018 ESC guidelines for the diagnosis and management of syncope. *Eur Heart J.* 2018;39(21):1883–1948. doi:10.1093/eurheartj/ehy037. PMID 29562304.
    Supports: reflex (vasovagal) syncope with a cardioinhibitory (slow heart rate) and a vasodepressor (low pressure) component (full text) (`vasovagal`).
98. **British Thoracic Society, Scottish Intercollegiate Guidelines Network.** British guideline on the management of asthma. *Thorax.* 2014;69(Suppl 1):1–192. PMID 25323740.
    Supports: acute severe asthma with respiratory rate ≥ 25/min and heart rate ≥ 110/min; life-threatening asthma with SpO2 < 92 %, a "normal" PaCO2 of 4.6–6.0 kPa, exhaustion, arrhythmia or hypotension (full text) (`asthma-severe`, `asthma-life`).
99. **Lim WS, van der Eerden MM, Laing R, et al.** Defining community acquired pneumonia severity on presentation to hospital: an international derivation and validation study. *Thorax.* 2003;58(5):377–382. doi:10.1136/thorax.58.5.377. PMID 12728155.
    Supports: CURB-65, one point each for confusion, urea > 7 mmol/L, respiratory rate ≥ 30/min, systolic < 90 or diastolic ≤ 60 mmHg, age ≥ 65 (`pneumonia`, `tachypnea`).
100. **ARDS Definition Task Force, Ranieri VM, Rubenfeld GD, et al.** Acute respiratory distress syndrome: the Berlin Definition. *JAMA.* 2012;307(23):2526–2533. doi:10.1001/jama.2012.5669. PMID 22797452.
    Supports: ARDS severity by PaO2/FiO2: mild 200–300, moderate 100–200, severe ≤ 100 mmHg (`ards`).
101. **Roberts DJ, Leigh-Smith S, Faris PD, et al.** Clinical presentation of patients with tension pneumothorax: a systematic review. *Ann Surg.* 2015;261(6):1068–1078. doi:10.1097/SLA.0000000000001073. PMID 25563887.
    Supports: hypoxia in 91.8 % of ventilated versus 50.0 % of unassisted patients; in ventilated patients hypotension (adjusted odds 12.6) and cardiac arrest (17.7) were more frequent (`tension-ptx`).
102. **Gardner WN.** The pathophysiology of hyperventilation disorders. *Chest.* 1996;109(2):516–534. doi:10.1378/chest.109.2.516. PMID 8620731.
    Supports: hyperventilation lowers arterial CO2 (hypocapnia) (full text) (`hyperventilation`).
103. **Chrimes N, Higgs A, Hagberg CA, et al.** Preventing unrecognised oesophageal intubation: a consensus guideline from the Project for Universal Management of Airways and international airway societies. *Anaesthesia.* 2022;77(12):1395–1415. doi:10.1111/anae.15817. PMID 35977431.
    Supports: sustained exhaled CO2 on waveform capnography is the mainstay for excluding oesophageal placement (`oesophageal-intubation`).
104. **Boyer EW.** Management of opioid analgesic overdose. *N Engl J Med.* 2012;367(2):146–155. doi:10.1056/NEJMra1202561. PMID 22784117.
    Supports: opioid toxicity with slow breathing, miosis and reduced consciousness (full text) (`opioid-overdose`, `bradypnea`).
105. **Whelton PK, Carey RM, Aronow WS, et al.** 2017 ACC/AHA/AAPA/ABC/ACPM/AGS/APhA/ASH/ASPC/NMA/PCNA guideline for the prevention, detection, evaluation, and management of high blood pressure in adults. *Hypertension.* 2018;71(6):e13–e115. doi:10.1161/HYP.0000000000000065. PMID 29133356.
    Supports: hypertensive emergency as blood pressure > 180 and/or > 120 mmHg with new or worsening target-organ damage (full text) (`hypertensive-emergency`, `hypertension`).
106. **Babu AN, Kymes SM, Carpenter Fryer SM.** Eponyms and the diagnosis of aortic regurgitation: what says the evidence? *Ann Intern Med.* 2003;138(9):736–742. doi:10.7326/0003-4819-138-9-200305060-00010. PMID 12729428.
    Supports: the peripheral signs of aortic regurgitation (Corrigan pulse, Duroziez, Hill sign) have poor specificity, except Hill's sign, which tracks severity (`aortic-regurgitation`).
107. **Spodick DH.** Acute cardiac tamponade. *N Engl J Med.* 2003;349(7):684–690. doi:10.1056/NEJMra022643. PMID 12917306.
    Supports: tamponade with tachycardia, hypotension, pulsus paradoxus, low QRS voltage and electrical alternans (full text) (`tamponade`).
108. **Drezner JA, Sharma S, Baggish A, et al.** International criteria for electrocardiographic interpretation in athletes: consensus statement. *Br J Sports Med.* 2017;51(9):704–731. doi:10.1136/bjsports-2016-097331. PMID 28258178.
    Supports: sinus bradycardia ≥ 30 bpm is a normal training-related finding in athletes (full text) (`athlete`).
109. **Chesnut RM, Marshall LF, Klauber MR, et al.** The role of secondary brain injury in determining outcome from severe head injury. *J Trauma.* 1993;34(2):216–222. doi:10.1097/00005373-199302000-00006. PMID 8459458.
    Supports: in 717 patients, a systolic pressure < 90 mmHg (34.6 %) went with a 150 % rise in mortality; hypoxia (PaO2 ≤ 60 mmHg) also worsened outcome (`tbi`).
110. **Carney N, Totten AM, O'Reilly C, et al.** Guidelines for the management of severe traumatic brain injury, fourth edition. *Neurosurgery.* 2017;80(1):6–15. doi:10.1227/NEU.0000000000001432. PMID 27654000.
    Supports: keep systolic pressure ≥ 100 mmHg at age 50–69 and ≥ 110 mmHg at 15–49 or over 70 (full text) (`tbi`).
111. **Trinka E, Cock H, Hesdorffer D, et al.** A definition and classification of status epilepticus: report of the ILAE Task Force on Classification of Status Epilepticus. *Epilepsia.* 2015;56(10):1515–1523. doi:10.1111/epi.13121. PMID 26336950.
    Supports: for tonic-clonic status epilepticus, t1 = 5 min (treat) and t2 = 30 min (long-term harm) (`seizure`).
112. **Krassioukov A, Warburton DE, Teasell R, et al.** A systematic review of the management of autonomic dysreflexia after spinal cord injury. *Arch Phys Med Rehabil.* 2009;90(4):682–695. doi:10.1016/j.apmr.2008.10.017. PMID 19345787.
    Supports: autonomic dysreflexia with a sudden rise in blood pressure (≥ 20 mmHg above baseline), often with a slow heart rate, in injuries at or above T6 (full text) (`autonomic-dysreflexia`).
113. **Lawn ND, Fletcher DD, Henderson RD, et al.** Anticipating mechanical ventilation in Guillain-Barré syndrome. *Arch Neurol.* 2001;58(6):893–898. doi:10.1001/archneur.58.6.893. PMID 11405803.
    Supports: respiratory failure predicted by vital capacity < 20 mL/kg, maximal inspiratory pressure < 30 cmH2O, maximal expiratory pressure < 40 cmH2O, or a fall of > 30 % (`neuromuscular-failure`).
114. **Burch HB, Wartofsky L.** Life-threatening thyrotoxicosis: thyroid storm. *Endocrinol Metab Clin North Am.* 1993;22(2):263–277. PMID 8325286.
    Supports: point score from temperature, heart rate, atrial fibrillation, heart failure, CNS and GI signs and a precipitant; ≥ 45 points highly suggestive of thyroid storm (full text); mortality 20–50 % (`thyroid-storm`).
115. **Wartofsky L.** Myxedema coma. *Endocrinol Metab Clin North Am.* 2006;35(4):687–698. doi:10.1016/j.ecl.2006.09.003. PMID 17127141.
    Supports: myxoedema coma with hypothermia, hypercarbia, hypoxaemia and hyponatraemia; bradycardia and hypotension (full text) (`myxoedema`).
116. **Rushworth RL, Torpy DJ, Falhammar H.** Adrenal crisis. *N Engl J Med.* 2019;381(9):852–861. doi:10.1056/NEJMra1807486. PMID 31461595.
    Supports: adrenal crisis with hypotension or shock, fever, hyponatraemia and hyperkalaemia (full text) (`adrenal-crisis`).
117. **Whitelaw BC, Prague JK, Mustafa OG, et al.** Phaeochromocytoma crisis. *Clin Endocrinol (Oxf).* 2014;80(1):13–22. doi:10.1111/cen.12324. PMID 24102156.
    Supports: phaeochromocytoma crisis as an endocrine emergency, classified by severity; alpha-blockade is strongly associated with survival; sustained hypotension needs mechanical circulatory support (`phaeo-crisis`).
118. **Foley RN, Gilbertson DT, Murray T, et al.** Long interdialytic interval and mortality among patients receiving hemodialysis. *N Engl J Med.* 2011;365(12):1099–1107. doi:10.1056/NEJMoa1103313. PMID 21992122.
    Supports: after the 2-day interval, all-cause mortality 22.1 vs 18.0, cardiac-arrest deaths 1.3 vs 1.0 and heart-failure admissions 29.9 vs 16.9 per 100 person-years (`missed-dialysis`).
119. **Epstein Y, Yanovich R.** Heatstroke. *N Engl J Med.* 2019;380(25):2449–2459. doi:10.1056/NEJMra1810762. PMID 31216400.
    Supports: heatstroke as core temperature > 40 °C with CNS dysfunction (full text) (`heat-stroke`).
120. **Gurrera RJ, Caroff SN, Cohen A, et al.** An international consensus study of neuroleptic malignant syndrome diagnostic criteria using the Delphi method. *J Clin Psychiatry.* 2011;72(9):1222–1228. doi:10.4088/JCP.10m06438. PMID 21733489.
    Supports: temperature > 38.0 °C on two occasions, rigidity, blood pressure ≥ 25 % above baseline or fluctuating, heart rate ≥ 25 % and respiratory rate ≥ 50 % above baseline (`nms`).
121. **Boyer EW, Shannon M.** The serotonin syndrome. *N Engl J Med.* 2005;352(11):1112–1120. doi:10.1056/NEJMra041867. PMID 15784664.
    Supports: serotonin toxicity with clonus, tremor, hyperthermia, tachycardia and hypertension, starting within hours (full text) (`serotonin`).
122. **Levine M, Boyer EW, Pozner CN, et al.** Assessment of hyperglycemia after calcium channel blocker overdoses involving diltiazem or verapamil. *Crit Care Med.* 2007;35(9):2071–2075. doi:10.1097/01.CCM.0000278916.04569.23. PMID 17855820.
    Supports: median peak glucose 364 vs 145 mg/dL in severe vs non-severe verapamil/diltiazem poisoning; glucose correlates with severity (`ccb-overdose`).
123. **Boehnert MT, Lovejoy FH.** Value of the QRS duration versus the serum drug level in predicting seizures and ventricular arrhythmias after an acute overdose of tricyclic antidepressants. *N Engl J Med.* 1985;313(8):474–479. doi:10.1056/NEJM198508223130804. PMID 4022081.
    Supports: seizures only with QRS ≥ 0.10 s, ventricular arrhythmias only with QRS ≥ 0.16 s; drug levels did not predict either (`tca`).
124. **Eddleston M, Buckley NA, Eyer P, et al.** Management of acute organophosphorus pesticide poisoning. *Lancet.* 2008;371(9612):597–607. doi:10.1016/S0140-6736(07)61202-1. PMID 17706760.
    Supports: cholinergic crisis with bradycardia, bronchorrhoea, bronchospasm and respiratory failure (full text); atropine and respiratory support (`organophosphate`).
125. **Havakuk O, Rezkalla SH, Kloner RA.** The cardiovascular effects of cocaine. *J Am Coll Cardiol.* 2017;70(1):101–113. doi:10.1016/j.jacc.2017.05.014. PMID 28662796.
    Supports: cocaine as a leading cause of drug-related emergency visits, mostly cardiovascular; sympathomimetic tachycardia and hypertension (full text) (`stimulant`).
126. **Hampson NB.** Pulse oximetry in severe carbon monoxide poisoning. *Chest.* 1998;114(4):1036–1041. doi:10.1378/chest.114.4.1036. PMID 9792574.
    Supports: in 30 patients with COHb > 25 %, SpO2 consistently overestimated the oxyhaemoglobin saturation, more so as COHb rose (`co-poisoning`).
127. **Südfeld S, Brechnitz S, Wagner JY, et al.** Post-induction hypotension and early intraoperative hypotension associated with general anaesthesia. *Br J Anaesth.* 2017;119(1):57–64. doi:10.1093/bja/aex127. PMID 28974066.
    Supports: post-induction hypotension = systolic < 90 mmHg (or noradrenaline > 6 µg/min) within 20 min of induction, in 2037 patients (`induction-hypotension`, `hypotension`).
128. **Mirski MA, Lele AV, Fitzsimmons L, et al.** Diagnosis and treatment of vascular air embolism. *Anesthesiology.* 2007;106(1):164–177. doi:10.1097/00000542-200701000-00026. PMID 17197859.
    Supports: venous air embolism with a sudden fall in EtCO2, hypoxaemia, hypotension and arrhythmia (full text) (`vae`).
129. **Neal JM, Woodward CM, Harrison TK.** The American Society of Regional Anesthesia and Pain Medicine checklist for managing local anesthetic systemic toxicity: 2017 version. *Reg Anesth Pain Med.* 2018;43(2):150–153. doi:10.1097/AAP.0000000000000726. PMID 29356775.
    Supports: local anaesthetic toxicity with CNS signs, then bradycardia, conduction delay, hypotension and arrest; lipid emulsion (full text) (`last`).
130. **Kinsella SM, Carvalho B, Dyer RA, et al.** International consensus statement on the management of hypotension with vasopressors during caesarean section under spinal anaesthesia. *Anaesthesia.* 2018;73(1):71–92. doi:10.1111/anae.14080. PMID 29090733.
    Supports: keep systolic pressure ≥ 90 % of baseline and avoid < 80 %; phenylephrine first; bradycardia with hypotension may need ephedrine or an anticholinergic (full text) (`spinal-hypotension`).
131. **American College of Obstetricians and Gynecologists.** Gestational hypertension and preeclampsia: ACOG practice bulletin, number 222. *Obstet Gynecol.* 2020;135(6):e237–e260. doi:10.1097/AOG.0000000000003891. PMID 32443079.
    Supports: severe features include systolic ≥ 160 or diastolic ≥ 110 mmHg (full text) (`preeclampsia`).
132. **Nathan HL, El Ayadi A, Hezelgrave NL, et al.** Shock index: an effective predictor of outcome in postpartum haemorrhage? *BJOG.* 2015;122(2):268–275. doi:10.1111/1471-0528.13206. PMID 25546050.
    Supports: shock index (heart rate / systolic pressure) ≥ 0.9 had 100 % sensitivity for ICU admission and ≥ 1.7 had 97.7 % specificity in postpartum haemorrhage (`pph`).
133. **Clark SL, Romero R, Dildy GA, et al.** Proposed diagnostic criteria for the case definition of amniotic fluid embolism in research studies. *Am J Obstet Gynecol.* 2016;215(4):408–412. doi:10.1016/j.ajog.2016.06.037. PMID 27372270.
    Supports: amniotic fluid embolism as sudden haemodynamic and respiratory compromise with strictly defined coagulopathy (`afe`).
134. **Nolan JP, Sandroni C, Böttiger BW, et al.** European Resuscitation Council and European Society of Intensive Care Medicine guidelines 2021: post-resuscitation care. *Resuscitation.* 2021;161:220–269. doi:10.1016/j.resuscitation.2021.02.012. PMID 33773827.
    Supports: after return of circulation target SpO2 94–98 %, normal PaCO2 and mean arterial pressure > 65 mmHg (full text) (`post-rosc`).
135. **Van Gelder IC, Rienstra M, Bunting KV, et al.** 2024 ESC guidelines for the management of atrial fibrillation developed in collaboration with the European Association for Cardio-Thoracic Surgery (EACTS). *Eur Heart J.* 2024;45(36):3314–3414. doi:10.1093/eurheartj/ehae176. PMID 39210723.
    Supports: lenient rate control with a resting heart rate < 110 bpm as the initial target (full text) (`af-rvr`, `irregular`, `af`).

## Single-sign and sensor scenario sources (2026-11-03)

Added so that every built-in scenario, including the single-sign and sensor ones, cites a source.

136. **Kusumoto FM, Schoenfeld MH, Barrett C, et al.** 2018 ACC/AHA/HRS guideline on the evaluation and management of patients with bradycardia and cardiac conduction delay. *Circulation.* 2019;140(8):e382–e482. doi:10.1161/CIR.0000000000000628. PMID 30586772.
    Supports: bradycardia as a guideline-defined condition whose evaluation and management depend on symptoms and cause (scope of the guideline) (`brady`).
137. **O'Grady NP, Barie PS, Bartlett JG, et al.** Guidelines for evaluation of new fever in critically ill adult patients: 2008 update from the American College of Critical Care Medicine and the Infectious Diseases Society of America. *Crit Care Med.* 2008;36(4):1330–1349. doi:10.1097/CCM.0b013e318169eda9. PMID 18379262.
    Supports: fever has many infectious and non-infectious causes, so a new fever should trigger a clinical assessment rather than automatic tests (abstract) (`fever`).
138. **Petterson MT, Begnoche VL, Graybeal JM.** The effect of motion on pulse oximetry and its clinical significance. *Anesth Analg.* 2007;105(6 Suppl):S78–S84. doi:10.1213/01.ane.0000278134.47777.a5. PMID 18048903.
    Supports: motion causes loss of data, inaccurate readings and false alarms in pulse oximetry (abstract) (`motion`, `hypothermia-1`, `serotonin`).
139. **Drew BJ, Harris P, Zègre-Hemsey JK, et al.** Insights into the problem of alarm fatigue with physiologic monitor devices: a comprehensive observational study of consecutive intensive care unit patients. *PLoS One.* 2014;9(10):e110274. doi:10.1371/journal.pone.0110274. PMID 25338067.
    Supports: 2,558,760 alarms in 461 adults over 31 days, 791,632 of them technical; 88.8 % of 12,671 annotated arrhythmia alarms were false positives; PVCs were among the non-actionable alarm causes; 93 % of the 168 true VT alarms were not sustained long enough to need treatment (abstract) (`disconnect`, `noisy-ecg`, `missing`, `pvc`, `vt`).
140. **Marcus GM.** Evaluation and management of premature ventricular complexes. *Circulation.* 2020;141(17):1404–1418. doi:10.1161/CIRCULATIONAHA.119.042434. PMID 32339046.
    Supports: PVCs are found in most people on long-term monitoring and are often asymptomatic; a higher PVC frequency may be a risk factor for heart failure and death (abstract) (`pvc`).
141. **Al-Khatib SM, Stevenson WG, Ackerman MJ, et al.** 2017 AHA/ACC/HRS guideline for management of patients with ventricular arrhythmias and the prevention of sudden cardiac death. *J Am Coll Cardiol.* 2018;72(14):e91–e220. doi:10.1016/j.jacc.2017.10.054. PMID 29097296.
    Supports: ventricular tachycardia and ventricular fibrillation as the arrhythmias behind sudden cardiac death (scope of the guideline) (`pvc`, `vt`, `vf`).
142. **Siobal MS.** Monitoring exhaled carbon dioxide. *Respir Care.* 2016;61(10):1397–1416. doi:10.4187/respcare.04919. PMID 27601718.
    Supports: exhaled CO₂ monitoring assesses ventilation and also gives information on ventilation–perfusion matching, cardiac output and metabolic rate (abstract) (`apnea`, `rebreathing`).
143. **Saugel B, Kouz K, Meidert AS, et al.** How to measure blood pressure using an arterial catheter: a systematic 5-step approach. *Crit Care.* 2020;24(1):172. doi:10.1186/s13054-020-02859-w. PMID 32331527.
    Supports: the transducer is levelled to the phlebostatic axis; a 10 cm height difference gives about 7.5 mmHg pressure difference (full text) (`transducer`).
144. **Cretikos MA, Bellomo R, Hillman K, et al.** Respiratory rate: the neglected vital sign. *Med J Aust.* 2008;188(11):657–659. doi:10.5694/j.1326-5377.2008.tb01825.x. PMID 18513176.
    Supports: an abnormal respiratory rate predicts serious clinical events, yet it is often not recorded (abstract) (`baseline`, `tachypnea`, `bradypnea`).
145. **Obermeyer Z, Samra JK, Mullainathan S.** Individual differences in normal body temperature: longitudinal big data analysis of patient records. *BMJ.* 2017;359:j5468. doi:10.1136/bmj.j5468. PMID 29237616.
    Supports: mean temperature 36.6 °C with a 95 % range of 35.7–37.3 °C in 35,488 patients without infection (abstract) (`baseline`, `fever`).
146. **Tateno K, Glass L.** Automatic detection of atrial fibrillation using the coefficient of variation and density histograms of RR and ΔRR intervals. *Med Biol Eng Comput.* 2001;39(6):664–671. doi:10.1007/BF02345439. PMID 11804173.
    Supports: AF detection from RR-interval variability; the CV test on RR intervals had 86.6 % sensitivity and 84.3 % specificity (abstract) (`irregular`, `af`).
147. **You B, Peslin R, Duvivier C, et al.** Expiratory capnography in asthma: evaluation of various shape indices. *Eur Respir J.* 1994;7(2):318–323. doi:10.1183/09031936.94.07020318. PMID 8162985.
    Supports: airway obstruction changes the shape of the capnogram; the angle between the ascending phase and the alveolar plateau correlated best with FEV₁ (abstract) (`bronchospasm`).
148. **Kumar A, Bithal P, Chouhan RS, Sinha PK.** Should one rely on capnometry when a capnogram is not seen? *J Neurosurg Anesthesiol.* 2002;14(2):153–156. doi:10.1097/00008506-200204000-00012. PMID 11907398.
    Supports: case report of rebreathing from a malfunctioning expiratory valve, with high inspired CO₂ and a raised capnogram baseline (abstract) (`rebreathing`).
