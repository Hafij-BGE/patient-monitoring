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

## Scenario sources

These entries were added on 2026-10-28 with the combined-sign scenarios in `src/sim/params.js` (preset field `refs`). Each scenario is an illustrative teaching pattern; real presentations vary and the values are not diagnostic. Where a source gives only a direction (for example "pulse pressure decreased"), the number in PM-SIM is an illustrative choice inside that direction.

28. **Spahn DR, et al.** Management of bleeding and coagulopathy following major trauma: an updated European guideline. *Crit Care.* 2013;17:R76. doi:10.1186/cc12685. PMID 23601765.
    Supports: ATLS class II (HR 100–120, SBP normal, pulse pressure decreased, RR 20–30) and class III (HR 120–140, SBP and pulse pressure decreased, RR 30–40) (`haem-2`, `haem-3`). These ranges are the ATLS 9th-edition table quoted by this guideline; the 10th edition (2018) no longer gives numeric HR and RR ranges.
29. **Mutschler M, et al.** A critical reappraisal of the ATLS classification of hypovolaemic shock. *Resuscitation.* 2013;84(3):309–313. doi:10.1016/j.resuscitation.2012.07.012. PMID 22835498.
    Supports: the caveat that only 9.3 % of 36,504 trauma patients matched an ATLS class.
30. **Lima AP, Beelen P, Bakker J.** Use of a peripheral perfusion index derived from the pulse oximetry signal as a noninvasive indicator of perfusion. *Crit Care Med.* 2002;30(6):1210–1213. doi:10.1097/00003246-200206000-00006. PMID 12072670.
    Supports: a perfusion index below 1.4 reflecting poor peripheral perfusion in critically ill patients (`haem-3`).
31. **Singer M, et al.** The Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3). *JAMA.* 2016;315(8):801–810. doi:10.1001/jama.2016.0287. PMID 26903338.
    Supports: SIRS criteria (temperature >38 or <36 °C, HR >90, RR >20) and qSOFA (RR ≥22, SBP ≤100) (`sepsis-screen`).
32. **Cardona V, et al.** World Allergy Organization anaphylaxis guidance 2020. *World Allergy Organ J.* 2020;13(10):100472. doi:10.1016/j.waojou.2020.100472. PMID 33204386.
    Supports: hypotension as SBP <90 mmHg or a fall >30 %, with bronchospasm and hypoxaemia (`anaphylaxis`).
33. **Harper NJN, et al.** Anaesthesia, surgery, and life-threatening allergic reactions: epidemiology and clinical features of perioperative anaphylaxis in the 6th National Audit Project (NAP6). *Br J Anaesth.* 2018;121(1):159–171. doi:10.1016/j.bja.2018.04.014. PMID 29935567.
    Supports: frequency of presenting features (hypotension, bronchospasm, tachycardia, desaturation) (`anaphylaxis`).
34. **Fu ES, et al.** Supplemental oxygen impairs detection of hypoventilation by pulse oximetry. *Chest.* 2004;126(5):1552–1558. doi:10.1378/chest.126.5.1552. PMID 15539726.
    Supports: SpO₂ staying normal during hypoventilation on supplemental oxygen (`hypovent-o2`).
35. **Aminiahidashti H, et al.** Applications of end-tidal carbon dioxide (ETCO2) monitoring in emergency department; a narrative review. *Emerg (Tehran).* 2018;6(1):e5. PMID 29503830. PMC5827051.
    Supports: capnography detecting hypoventilation before oximetry; prolonged expiratory phase in bronchospasm and COPD; low EtCO₂ (≤29 mmHg) in DKA (`hypovent-o2`, `anaphylaxis`, `acidosis-breathing`, `copd`).
36. **Kitabchi AE, et al.** Hyperglycemic crises in adult patients with diabetes. *Diabetes Care.* 2009;32(7):1335–1343. doi:10.2337/dc09-9032. PMID 19564476.
    Supports: Kussmaul respiration, tachycardia and hypotension in DKA (`acidosis-breathing`).
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
    Supports: SpO₂ target 88–92 % in patients at risk of hypercapnic respiratory failure (`copd`).
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
    Supports: SVT as a regular narrow-QRS tachycardia from tissue at or above the His bundle; P waves hidden in or just after the QRS in AV-nodal re-entry (`svt`).
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
    Supports: recognising deterioration to prevent in-hospital arrest; hypoxia as a reversible cause; low EtCO₂ with low cardiac output (`periarrest`).

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
    Supports: 88 % of respiratory-depression events within 24 h of surgery; somnolence noted before the event in 62 %; 97 % judged preventable with better monitoring of oxygenation and ventilation (`postop-opioid`).
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
    Supports: the derived limb leads (III = II − I and the augmented leads), the standard 3 × 4 layout with a rhythm strip, 25 mm/s, 10 mm/mV, the 1 mV calibration pulse and the 0.05–150 Hz diagnostic bandwidth (12-lead view).

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
    Supports: age × SI predicted 48-h mortality better than HR, SBP or SI in injured patients older than 55 (AUC 0.828). The abstract gives no cut-off, so PM-SIM shows the value without a threshold (`ageShockIndex`).
78. **Wright JD, Hughes JP, Ostchega Y, Yoon SS, Nwankwo T.** Mean systolic and diastolic blood pressure in adults aged 18 and over in the United States, 2001–2008. *Natl Health Stat Report.* 2011;(35):1–22, 24. PMID 21485611.
    Supports: mean SBP/DBP by age group (18–39, 40–59, 60+) and sex, "Total" columns of Tables 2–7 (`BP_NORMS`, `bpForAge`). The group centres 28.5, 49.5 and 70 years and the linear interpolation between them are PM-SIM's own choice.
79. **Franklin SS, Gustin W, Wong ND, et al.** Hemodynamic patterns of age-related changes in blood pressure. The Framingham Heart Study. *Circulation.* 1997;96(1):308–315. doi:10.1161/01.cir.96.1.308. PMID 9236450.
    Supports: SBP rises with age, DBP falls after age 50–60 and pulse pressure widens (unit test of `bpForAge`).
80. **Ostchega Y, Porter KS, Hughes J, Dillon CF, Nwankwo T.** Resting pulse rate reference data for children, adolescents, and adults: United States, 1999–2008. *Natl Health Stat Report.* 2011;(41). PMID 21905522.
    Supports: adult resting pulse stays about 72 beats/min across age groups, so "age sets blood pressure" does not change HR.

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
