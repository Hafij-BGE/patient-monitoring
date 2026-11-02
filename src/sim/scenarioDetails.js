/* Plain-language background for every built-in scenario, shown in the Scenario details tab.
 * CONDITIONS explains what the condition (or sign, or artefact) is and what happens in the
 * body; SCENARIOS maps each preset id to its condition and says what that preset shows on the
 * monitor. Specific numbers come only from the "Supports" lines of the references the preset
 * cites (REFERENCES.md); the rest is general background found in those same sources.
 * tests/unit/scenarioDetails.test.js checks that every preset has an entry. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).scenarioDetails = factory();
})(this, function () {
  'use strict';

  // kind: 'condition' (a disease or clinical state), 'sign' (one abnormal vital sign whose
  // cause is open), 'technical' (a sensor or equipment problem; the patient may be well).
  const CONDITIONS = {
    normal: {
      kind: 'sign', title: 'Normal resting adult',
      what: 'Not a disease. This is the reference state: a healthy adult lying still, with every vital sign inside its normal range.',
      happens: 'The heart beats in sinus rhythm, started by the sinus node, and breathing matches the body\'s CO2 production. Normal values differ between people: body temperature, for example, has a 95 % range of about 35.7–37.3 °C in patients without infection.'
    },
    'sinus-tachy': {
      kind: 'sign', title: 'Sinus tachycardia',
      what: 'A fast heart rate (over 100/min) with a normal sinus rhythm. It is a sign, not a diagnosis.',
      happens: 'The sinus node fires faster when sympathetic activity rises, for example with fever, pain, anxiety, bleeding or low oxygen. Each beat still starts in the atria, so a P wave comes before every QRS complex. Supraventricular tachycardia (SVT) differs: it comes from a re-entry circuit and the P waves are often hidden.'
    },
    'sinus-brady': {
      kind: 'sign', title: 'Sinus bradycardia',
      what: 'A slow heart rate (under 60/min) with a normal sinus rhythm. It can be normal or a sign of disease.',
      happens: 'The sinus node fires slowly. Causes include a high vagal tone (sleep, trained athletes), drugs, hypothermia, hypothyroidism and disease of the conduction system. Whether it needs treatment depends on symptoms and cause, not on the number alone.'
    },
    'rr-variability': {
      kind: 'sign', title: 'Irregular beat timing (teaching pattern)',
      what: 'Not a disease. The time between beats varies while each beat still starts in the sinus node.',
      happens: 'Automatic AF detectors measure how much the RR intervals vary. A sinus rhythm with variable timing (for example sinus arrhythmia) also varies, but P waves remain. This pattern shows why a detector that uses RR variability alone can raise a false AF alarm.'
    },
    hypoxaemia: {
      kind: 'sign', title: 'Hypoxaemia (low oxygen saturation)',
      what: 'Too little oxygen in the arterial blood, seen on the monitor as a low SpO2. It is a sign with many causes.',
      happens: 'Oxygen does not pass well enough from the lungs into the blood: for example when parts of the lung are not ventilated (pneumonia, collapse), when breathing is too slow, or when the inspired oxygen is low. Most adults are kept at SpO2 94–98 %; patients at risk of CO2 retention have a lower target of 88–92 %.'
    },
    hypotension: {
      kind: 'sign', title: 'Hypotension (low blood pressure)',
      what: 'Blood pressure too low to keep organs perfused. Common cut-offs are a systolic pressure under 90 mmHg, or 100 mmHg or less in the qSOFA sepsis screen.',
      happens: 'Pressure depends on the blood the heart pumps and on the tone of the blood vessels. It falls when blood volume is lost (bleeding), when vessels dilate (sepsis, anaesthetic drugs, allergy) or when the heart pumps poorly (heart failure). The number alone does not say which.'
    },
    hypertension: {
      kind: 'sign', title: 'High blood pressure',
      what: 'Blood pressure above the normal range. A single high reading is not yet a diagnosis of hypertension.',
      happens: 'Pressure rises with pain, anxiety, a full bladder, stopped medicines or long-standing hypertension. It becomes an emergency only when very high pressure (over 180 and/or 120 mmHg) comes with new or worsening damage to organs such as the brain, heart or kidneys.'
    },
    tachypnoea: {
      kind: 'sign', title: 'Tachypnoea (fast breathing)',
      what: 'A respiratory rate above normal (adults about 12–20/min). It is one of the most useful warning signs and also one of the least often recorded.',
      happens: 'The body breathes faster when it needs more oxygen, when it must remove more CO2 (fever, sepsis, acidosis), when the lungs are stiff or wet, or with pain and anxiety. A rate of 22/min or more counts in qSOFA, and 30/min or more in the CURB-65 pneumonia score.'
    },
    bradypnoea: {
      kind: 'sign', title: 'Bradypnoea (slow breathing)',
      what: 'A respiratory rate below normal. It is a typical sign of depressed breathing drive.',
      happens: 'Opioids and sedatives reduce the drive to breathe from the brainstem. Breathing gets slow, CO2 builds up and, on room air, oxygen saturation falls later. Opioid toxicity typically combines slow breathing, small pupils and reduced consciousness.'
    },
    fever: {
      kind: 'sign', title: 'Fever',
      what: 'A body temperature above the normal range, here above the 38 °C threshold used in the SIRS criteria.',
      happens: 'The brain raises its temperature set point, most often in response to infection but also to drugs, inflammation, clots or tissue injury. Heart rate usually rises with temperature. Because fever has many infectious and non-infectious causes, a new fever calls for clinical assessment, not a diagnosis by number.'
    },
    'sensor-off': {
      kind: 'technical', title: 'Sensor disconnection (technical alarm)',
      what: 'Not a disease. A sensor has come off or lost contact, so the monitor cannot measure.',
      happens: 'The patient may be completely well. The monitor must tell a technical problem (probe off, lead off) from a physiological one and raise a technical alarm. Technical alarms are common: in one ICU study they were 791,632 of 2,558,760 alarms.'
    },
    'motion-artefact': {
      kind: 'technical', title: 'Motion artefact',
      what: 'Not a disease. Movement of the patient disturbs the sensors and distorts the signals.',
      happens: 'A pulse oximeter measures small changes in red and infrared light with each heartbeat. Movement changes the light path much more than the pulse does, so the oximeter can lose data, show a wrong value and raise a false alarm. The automatic cuff can also fail to read during movement.'
    },
    'ecg-noise': {
      kind: 'technical', title: 'ECG noise and interference',
      what: 'Not a disease. Electrical signals that do not come from the heart are mixed into the ECG.',
      happens: 'Muscle activity, mains hum (50/60 Hz), breathing movement (baseline wander) and poor electrode contact all add noise. Filters remove some of it but also change the shape of the ECG, so a diagnostic ECG uses a wide 0.05–150 Hz band. Noise can make the rhythm analyser report false arrhythmias.'
    },
    'signal-gaps': {
      kind: 'technical', title: 'Missing data',
      what: 'Not a disease. Some signals drop out for short periods and one sensor is not available.',
      happens: 'Gaps come from loose contacts, movement, a probe being moved or a sensor that is not attached. A correct monitor shows a gap as missing, never as zero or as the last value, and raises a technical alarm when a signal is lost.'
    },
    apnoea: {
      kind: 'sign', title: 'Apnoea (no breathing)',
      what: 'Breathing has stopped. In a real patient this is an emergency.',
      happens: 'Without breaths no CO2 is exhaled and no fresh oxygen reaches the lungs. The capnogram goes flat at once, while SpO2 falls only later because the body has an oxygen store. Capnography therefore detects a breathing problem before pulse oximetry does.'
    },
    af: {
      kind: 'condition', title: 'Atrial fibrillation (AF)',
      what: 'The most common sustained heart rhythm disorder. The atria lose their organised electrical activity and no longer contract together.',
      happens: 'Chaotic electrical activity in the atria replaces the sinus beat, so there are no P waves. The AV node passes only some of these impulses to the ventricles, at random times, so the ventricular rhythm is irregularly irregular. A fast ventricular rate shortens the filling time of the heart, and blood pressure can fall. Blood can also stagnate in the atria and form clots, which is why AF raises the risk of stroke. The initial rate-control target is a resting rate under 110/min.'
    },
    svt: {
      kind: 'condition', title: 'Supraventricular tachycardia (SVT)',
      what: 'A regular, fast, narrow-QRS tachycardia that starts in tissue at or above the His bundle.',
      happens: 'In the common form (AV-nodal re-entry) an impulse circles in a loop around the AV node and activates the ventricles with each round. The rate is fast and very regular. Atria and ventricles are activated almost together, so the P wave is hidden in or just after the QRS. It often starts and stops suddenly. Telling it from sinus tachycardia needs P-wave analysis, the onset and the response to vagal manoeuvres.'
    },
    pvc: {
      kind: 'condition', title: 'Premature ventricular complexes (PVCs)',
      what: 'Early beats that start in the ventricles instead of the sinus node. They are found in most people on long-term monitoring.',
      happens: 'A focus in the ventricular muscle fires before the next sinus beat. The impulse spreads slowly through muscle, not through the fast conduction system, so the QRS is wide and differently shaped, and no P wave comes before it. PVCs are often harmless and without symptoms, but a high PVC burden may raise the risk of heart failure and death.'
    },
    vt: {
      kind: 'condition', title: 'Ventricular tachycardia (VT)',
      what: 'A fast rhythm that starts in the ventricles. Together with ventricular fibrillation it is the main rhythm behind sudden cardiac death.',
      happens: 'A ventricular focus or re-entry circuit drives the ventricles fast with wide QRS complexes. At high rates the ventricles do not fill well, so cardiac output and blood pressure fall. VT can stop by itself (short runs) or persist and turn into ventricular fibrillation. Treatment depends on whether the patient has a pulse.'
    },
    vf: {
      kind: 'condition', title: 'Ventricular fibrillation (VF)',
      what: 'A cardiac arrest rhythm: the ventricles quiver chaotically and pump no blood.',
      happens: 'Electrical activity in the ventricles is completely disorganised, so there is no coordinated contraction and no cardiac output. Without blood flow the person loses consciousness within seconds. VF is a shockable rhythm: advanced life support uses chest compressions and early defibrillation.'
    },
    asystole: {
      kind: 'condition', title: 'Asystole',
      what: 'A cardiac arrest rhythm with no electrical activity in the heart at all.',
      happens: 'The heart has neither electrical activity nor contraction, so there is no output. It is a non-shockable rhythm: advanced life support uses chest compressions, adrenaline and a search for reversible causes such as hypoxia. Most in-hospital arrests (about 81 %) start in a non-shockable rhythm. A flat line can also be a lead off or a gain set too low, so check those first.'
    },
    hypoventilation: {
      kind: 'condition', title: 'Hypoventilation',
      what: 'Breathing too little to remove the CO2 the body makes, so CO2 rises in the blood (hypercapnia).',
      happens: 'Too few or too shallow breaths, often from opioids or sedatives, let CO2 build up. On room air the extra CO2 in the alveoli leaves less room for oxygen, so SpO2 falls too. With supplemental oxygen the alveoli hold so much oxygen that SpO2 stays normal while CO2 keeps rising: pulse oximetry then misses the problem, and capnography shows it first.'
    },
    bronchospasm: {
      kind: 'condition', title: 'Bronchospasm (airway narrowing)',
      what: 'The muscles around the small airways tighten and narrow them, as in asthma, COPD or allergy.',
      happens: 'Narrow airways slow the outflow of air, mostly during expiration. Different lung regions empty at different speeds, so exhaled CO2 rises slowly instead of in a square step. The capnogram takes a "shark-fin" shape with a sloping plateau, and the slope tracks how severe the obstruction is.'
    },
    rebreathing: {
      kind: 'technical', title: 'CO2 rebreathing',
      what: 'Not a disease. The patient breathes in gas that already contains CO2, usually because of an equipment fault.',
      happens: 'Normally inspired gas has no CO2, so the capnogram returns to zero with every breath. If the breathing circuit fails (for example a faulty expiratory valve or exhausted CO2 absorber), exhaled gas is breathed in again. The capnogram baseline rises above zero and end-tidal CO2 rises.'
    },
    underdamped: {
      kind: 'technical', title: 'Under-damped arterial line',
      what: 'Not a disease. The fluid-filled tubing between the arterial catheter and the pressure transducer resonates.',
      happens: 'An arterial line behaves like a spring system with a natural frequency and a damping coefficient. When damping is too low, the pressure wave overshoots and rings, so the systolic reading is too high and the diastolic reading can be too low. A fast-flush test shows many oscillations.'
    },
    transducer: {
      kind: 'technical', title: 'Transducer at the wrong height',
      what: 'Not a disease. The pressure transducer of the arterial line is not level with the heart.',
      happens: 'A fluid column adds or removes pressure by its height: about 7.5 mmHg per 10 cm. A transducer above the heart reads too low, one below the heart reads too high. The transducer must be levelled to the phlebostatic axis and zeroed. The cuff (NIBP) is not affected.'
    },
    haemorrhage: {
      kind: 'condition', title: 'Haemorrhagic (hypovolaemic) shock',
      what: 'Loss of blood volume, for example after trauma, so the circulation can no longer supply the tissues.',
      happens: 'At first the body compensates: the heart rate rises and the blood vessels tighten, so systolic pressure stays normal while the pulse pressure narrows. With more loss the compensation fails, systolic pressure falls, breathing gets fast and the fingers are poorly perfused. The ATLS classes I–IV describe this progression, but only a minority of real trauma patients fit one class.'
    },
    sepsis: {
      kind: 'condition', title: 'Sepsis and septic shock',
      what: 'Sepsis is life-threatening organ dysfunction caused by a dysregulated body response to infection. Septic shock is sepsis with circulatory failure.',
      happens: 'The response to infection makes blood vessels dilate and leak. Heart rate and breathing rise, temperature can go up or down, and blood pressure falls. In septic shock the pressure stays low despite fluids, so vasopressors are needed to keep the mean pressure at 65 mmHg or more, and lactate is above 2 mmol/L. Screening tools such as SIRS and qSOFA use the vital signs but do not make the diagnosis.'
    },
    anaphylaxis: {
      kind: 'condition', title: 'Anaphylaxis',
      what: 'A severe, life-threatening allergic reaction that develops within minutes, for example to drugs during anaesthesia.',
      happens: 'Mast cells release histamine and other mediators. Blood vessels dilate and leak, so blood pressure falls (under 90 mmHg or a fall of more than 30 %) and the heart rate rises. The airways narrow (bronchospasm) and oxygen saturation falls. Hypotension, bronchospasm, tachycardia and desaturation are common presenting features.'
    },
    dka: {
      kind: 'condition', title: 'Diabetic ketoacidosis (DKA)',
      what: 'A hyperglycaemic crisis of diabetes, mostly type 1: high glucose with ketones and acidosis.',
      happens: 'Without insulin the cells cannot use glucose. Glucose rises in the blood and spills into the urine, which removes water, so the patient becomes dehydrated (fast heart rate, low pressure). The body burns fat instead and makes ketone acids, which cause metabolic acidosis. To compensate, the patient breathes deep and fast (Kussmaul breathing) and blows off CO2, so EtCO2 is low.'
    },
    pe: {
      kind: 'condition', title: 'Pulmonary embolism (PE)',
      what: 'A blood clot, usually from the leg veins, blocks a pulmonary artery.',
      happens: 'Lung regions that are still ventilated get no blood flow (dead space). Gas from them contains no CO2, so exhaled CO2 is diluted and EtCO2 falls below arterial CO2. The mismatch of ventilation and blood flow lowers oxygen saturation, and the heart rate rises. A large clot strains the right ventricle; when systolic pressure falls under 90 mmHg the PE is high-risk.'
    },
    hypothermia: {
      kind: 'condition', title: 'Accidental hypothermia',
      what: 'A core body temperature below 35 °C from exposure to cold. Stages are set by temperature and the clinical picture.',
      happens: 'In mild hypothermia (stage I, 35–32 °C) the body still fights the cold: it shivers, the heart beats faster and the vessels in the skin tighten. Below 32 °C (stage II, 32–28 °C) these defences fail and the metabolism slows: heart rate, blood pressure and breathing fall. Vasoconstriction makes the finger pulse weak and SpO2 hard to measure.'
    },
    mh: {
      kind: 'condition', title: 'Malignant hyperthermia (MH)',
      what: 'An inherited muscle disorder in which some anaesthetic drugs (volatile anaesthetics, succinylcholine) set off a dangerous rise in metabolism.',
      happens: 'In susceptible patients the trigger drugs release calcium from muscle stores without control. The muscles work non-stop, use oxygen and make CO2 and heat. The earliest signs are a rising EtCO2 at a fixed ventilator setting and a fast heart rate; temperature rises later, and arrhythmias can follow. The specific treatment is dantrolene.'
    },
    copd: {
      kind: 'condition', title: 'Chronic obstructive pulmonary disease (COPD)',
      what: 'A chronic lung disease with persistent narrowing of the airways, usually from smoking. Exacerbations make it worse.',
      happens: 'Narrow airways slow expiration, so the capnogram has a shark-fin shape. In severe disease some patients retain CO2 (hypercapnic respiratory failure). Too much oxygen can raise their CO2 further, so their SpO2 target is lower, 88–92 %.'
    },
    hyperkalaemia: {
      kind: 'condition', title: 'Hyperkalaemia (raised potassium)',
      what: 'Too much potassium in the blood, for example in kidney failure or with some drugs.',
      happens: 'Potassium sets the electrical charge across heart-muscle cell membranes. As it rises, repolarisation speeds up first (tall, peaked T waves), then conduction slows (flat P waves, then a wide QRS). Without treatment this can end in a fatal arrhythmia. The ECG changes track the potassium level poorly, so a blood test is needed.'
    },
    cushing: {
      kind: 'condition', title: 'Raised intracranial pressure (Cushing reflex)',
      what: 'A late reflex response to rising pressure inside the skull, for example from bleeding or brain swelling.',
      happens: 'When pressure in the skull rises, blood flow to the brainstem falls. The body raises systolic blood pressure to push blood into the brain; the higher pressure then slows the heart through the baroreflex, and breathing becomes irregular. High pressure with a slow heart rate is the opposite of the pattern in shock, and it signals danger of brain herniation.'
    },
    deterioration: {
      kind: 'condition', title: 'Deterioration before in-hospital cardiac arrest',
      what: 'Most in-hospital cardiac arrests are not sudden: abnormal vital signs are often recorded in the hours before.',
      happens: 'In one study 84 % of patients had documented deterioration within 8 hours before arrest, mostly in breathing or mental state. Breathing gets fast, oxygen saturation falls, heart rate rises and blood pressure drops. If no one acts, breathing tires, oxygen and pressure fall further and the heart slows before it stops. About 81 % of in-hospital arrests start in a non-shockable rhythm (asystole or PEA), and respiratory insufficiency is a common cause.'
    },
    stroke: {
      kind: 'condition', title: 'Acute stroke',
      what: 'A sudden loss of brain function because a brain artery is blocked (ischaemic stroke) or bursts (haemorrhagic stroke).',
      happens: 'The part of the brain behind the blocked or bleeding vessel loses its blood supply and stops working, which causes weakness, speech problems or other deficits. Blood pressure is raised in most patients on arrival (systolic 140 mmHg or more in 69 % in one large study). Only imaging can tell an ischaemic from a haemorrhagic stroke. Before clot-dissolving treatment the pressure must be below 185/110 mmHg.'
    },
    ahf: {
      kind: 'condition', title: 'Acute heart failure',
      what: 'The heart suddenly cannot pump enough blood, or can do so only at high filling pressures.',
      happens: 'Two problems combine in different degrees. Congestion ("wet"): pressure backs up into the lungs, fluid leaks into the alveoli, breathing gets fast and oxygen saturation falls. Hypoperfusion ("cold"): the heart pumps too little, so the pulse pressure narrows and the skin and fingers are poorly perfused. The warm/cold and wet/dry profiles predict outcome; cold-wet has the highest risk. Cardiogenic shock is the most severe form: hypotension with hypoperfusion.'
    },
    opioid: {
      kind: 'condition', title: 'Opioid-induced respiratory depression',
      what: 'Opioid drugs (pain medicines or drugs of abuse) reduce the drive to breathe.',
      happens: 'Opioids act on the breathing centre in the brainstem. Breathing gets slow and shallow, CO2 rises, and on room air oxygen saturation falls. Typical signs are slow breathing, small pupils and reduced consciousness. After surgery most events happen within 24 hours, and drowsiness often comes first. Supplemental oxygen keeps SpO2 normal and can hide the problem.'
    },
    'periop-hypothermia': {
      kind: 'condition', title: 'Perioperative hypothermia',
      what: 'A fall in core temperature during and after surgery.',
      happens: 'Anaesthesia impairs the body\'s temperature control, and heat is lost to the cold operating room. Unwarmed anaesthetised patients typically lose 1–2 °C. When the anaesthetic wears off, the body defends itself with vasoconstriction (cold, poorly perfused fingers) and shivering, which raises oxygen use and disturbs the sensors.'
    },
    ppc: {
      kind: 'condition', title: 'Postoperative pulmonary complications (atelectasis)',
      what: 'Lung problems after surgery, such as collapsed lung regions (atelectasis), infection or fluid.',
      happens: 'During anaesthesia, and especially after muscle-relaxant drugs, parts of the lung collapse (in over 75 % of such patients). Blood that flows past these regions picks up no oxygen, so saturation falls and the patient breathes faster. Pain after surgery limits deep breathing and coughing. These complications are common and raise mortality.'
    },
    athlete: {
      kind: 'sign', title: 'Athlete\'s heart (training-related bradycardia)',
      what: 'Not a disease. Regular endurance training slows the resting heart rate.',
      happens: 'Training raises the vagal tone and enlarges the stroke volume, so the heart needs fewer beats at rest. Sinus bradycardia down to 30/min is a normal finding in athletes. The variability between beats is high. A monitor alarm for low heart rate still fires, which shows that an alarm is not a diagnosis.'
    },
    'hypertensive-emergency': {
      kind: 'condition', title: 'Hypertensive emergency',
      what: 'Very high blood pressure (over 180 and/or 120 mmHg) with new or worsening damage to organs.',
      happens: 'Very high pressure can damage blood vessels and the organs they supply: the brain (encephalopathy, stroke), the heart (heart failure, ischaemia), the kidneys and the eyes. The organ damage, not the number, defines the emergency; the same pressure without organ damage is an urgency.'
    },
    'aortic-regurgitation': {
      kind: 'condition', title: 'Aortic regurgitation',
      what: 'The aortic valve does not close fully, so blood leaks back from the aorta into the left ventricle.',
      happens: 'During diastole blood flows back into the heart, so the diastolic pressure falls. The left ventricle then ejects the normal flow plus the leaked blood, so systolic pressure rises. The result is a wide pulse pressure and a bounding pulse. Several classic bedside signs come from this pulse, but most of them have poor specificity; echocardiography makes the diagnosis.'
    },
    tamponade: {
      kind: 'condition', title: 'Cardiac tamponade',
      what: 'Fluid or blood collects in the sac around the heart (pericardium) and compresses it.',
      happens: 'The pressure in the pericardium stops the heart chambers from filling. Less filling means a smaller stroke volume, so blood pressure falls and the heart rate rises. Typical signs are tachycardia, hypotension, pulsus paradoxus (systolic pressure falls more than 10 mmHg on inspiration), low QRS voltage and electrical alternans. Echocardiography makes the diagnosis, and draining the fluid is the treatment.'
    },
    'neurogenic-shock': {
      kind: 'condition', title: 'Neurogenic shock',
      what: 'Circulatory failure after an injury of the cervical or high thoracic spinal cord.',
      happens: 'The injury cuts the sympathetic nerves that keep the blood vessels tight and speed up the heart. The vessels dilate, so blood pressure falls, and the vagal nerve, which is not affected, slows the heart. Low pressure with a slow heart rate distinguishes it from bleeding, but bleeding can occur at the same time. The reported incidence (29 % in one cervical-injury study) depends on the cut-offs used.'
    },
    vasovagal: {
      kind: 'condition', title: 'Vasovagal (reflex) syncope',
      what: 'A brief loss of consciousness (fainting) from a reflex, often triggered by standing for long, pain or emotion.',
      happens: 'A reflex suddenly raises vagal activity and lowers sympathetic tone. The heart slows (cardioinhibitory part) and the blood vessels dilate (vasodepressor part). Blood pressure falls, the brain gets too little blood and the person faints. Lying flat restores the blood flow, so it is usually short and resolves on its own.'
    },
    asthma: {
      kind: 'condition', title: 'Acute asthma',
      what: 'A sudden worsening of asthma, a chronic disease with inflamed and over-reactive airways.',
      happens: 'The airways narrow from muscle spasm, swelling and mucus, so air leaves the lungs slowly. In acute severe asthma the patient breathes fast (25/min or more) with a fast heart rate (110/min or more) and blows off CO2, so EtCO2 is low. As the patient tires, the rate falls and CO2 climbs back to "normal": with an SpO2 under 92 % this is life-threatening, not a sign of improvement.'
    },
    pneumonia: {
      kind: 'condition', title: 'Community-acquired pneumonia',
      what: 'An infection of the lung tissue picked up outside hospital.',
      happens: 'Air spaces in the infected lung fill with fluid and inflammatory cells, so blood flowing past them takes up less oxygen. The patient has fever, breathes fast and the saturation falls; in severe cases the blood pressure falls as in sepsis. The CURB-65 score gives one point each for confusion, urea over 7 mmol/L, respiratory rate 30/min or more, low blood pressure (systolic under 90 or diastolic 60 mmHg or less) and age 65 or more.'
    },
    ards: {
      kind: 'condition', title: 'Acute respiratory distress syndrome (ARDS)',
      what: 'Acute, widespread inflammatory injury of both lungs, for example from pneumonia or sepsis, that is not explained by heart failure.',
      happens: 'Inflammation makes the lung capillaries leak, and the air spaces fill with protein-rich fluid. The lungs become stiff and gas exchange fails, so oxygen saturation is low despite fast breathing. The Berlin definition grades severity by the ratio of arterial oxygen to inspired oxygen (PaO2/FiO2): mild 200–300, moderate 100–200, severe 100 mmHg or less. Lung-protective ventilation uses small tidal volumes (6 mL/kg predicted body weight).'
    },
    'tension-ptx': {
      kind: 'condition', title: 'Tension pneumothorax',
      what: 'Air gets into the space around a lung, cannot escape and builds up pressure.',
      happens: 'Each breath (or each ventilator breath) pushes more air into the pleural space. The lung on that side collapses and the rising pressure impairs the return of blood to the heart. Oxygen saturation and cardiac output fall, and EtCO2 falls with the output. Ventilated patients deteriorate faster: hypoxia was found in about 92 %, and hypotension and cardiac arrest were much more common than in patients breathing on their own. Needle or finger decompression is the treatment.'
    },
    hyperventilation: {
      kind: 'condition', title: 'Hyperventilation',
      what: 'Breathing more than the body needs, so CO2 in the blood falls (hypocapnia).',
      happens: 'Fast or deep breathing removes CO2 faster than the body makes it. EtCO2 and arterial CO2 fall while oxygen saturation stays normal. Low CO2 can cause tingling, dizziness and muscle cramps. Anxiety is one cause, but fast breathing is also how the body compensates for metabolic acidosis (for example DKA) or responds to a pulmonary embolism, so the cause must be found.'
    },
    tbi: {
      kind: 'condition', title: 'Traumatic brain injury with secondary insults',
      what: 'A head injury, plus the further brain damage that low blood pressure or low oxygen can add later.',
      happens: 'The injured brain is very sensitive to a lack of oxygen. Low blood pressure or hypoxia after the injury (secondary insults) cut its oxygen supply and worsen the outcome: in one study a systolic pressure under 90 mmHg went with a 150 % rise in mortality. Guidelines therefore aim to keep systolic pressure at 100 mmHg or more (age 50–69) or 110 mmHg or more (age 15–49 or over 70).'
    },
    'status-epilepticus': {
      kind: 'condition', title: 'Generalised seizure (status epilepticus)',
      what: 'A seizure that does not stop by itself. A generalised tonic-clonic seizure lasting 5 minutes or more is status epilepticus.',
      happens: 'Abnormal, synchronised electrical activity spreads through the brain and makes the muscles contract rhythmically. The heart rate, blood pressure and temperature rise, and breathing can be impaired. Treatment should start at 5 minutes (t1); after 30 minutes (t2) there is a risk of long-term harm. The muscle activity also swamps the monitor signals.'
    },
    'autonomic-dysreflexia': {
      kind: 'condition', title: 'Autonomic dysreflexia',
      what: 'A sudden, dangerous rise in blood pressure in people with a spinal cord injury at or above T6.',
      happens: 'A stimulus below the injury, most often a full bladder or bowel, sets off a large sympathetic reflex. The brain cannot send calming signals down past the injury, so the vessels below it stay tight and the pressure rises by 20 mmHg or more above baseline. The baroreflex slows the heart through the vagal nerve. Removing the trigger is the first treatment.'
    },
    gbs: {
      kind: 'condition', title: 'Neuromuscular respiratory failure (Guillain-Barré syndrome)',
      what: 'Weakness of the breathing muscles from a nerve or muscle disease, for example Guillain-Barré syndrome (GBS), an autoimmune disease of the peripheral nerves.',
      happens: 'As the breathing muscles weaken, each breath gets smaller and the patient breathes faster to compensate. CO2 starts to rise while oxygen saturation stays normal until late. A vital capacity under 20 mL/kg, a maximal inspiratory pressure under 30 cmH2O, a maximal expiratory pressure under 40 cmH2O, or a fall of more than 30 % predict the need for ventilation.'
    },
    hypoglycaemia: {
      kind: 'condition', title: 'Hypoglycaemia (low blood glucose)',
      what: 'Blood glucose too low, most often in people with diabetes treated with insulin. Level 1 is under 70 mg/dL (3.9 mmol/L), level 2 under 54 mg/dL (3.0 mmol/L).',
      happens: 'The brain depends on glucose. When it falls, the body releases adrenaline, which causes a fast heart rate, higher systolic pressure, sweating and tremor. If glucose keeps falling, confusion, seizures and coma follow. Beta-blockers can hide the adrenergic warning signs.'
    },
    'thyroid-storm': {
      kind: 'condition', title: 'Thyroid storm',
      what: 'A life-threatening form of thyrotoxicosis (too much thyroid hormone), often set off by an illness, surgery or stopped medicines.',
      happens: 'Excess thyroid hormone speeds up the metabolism and the heart. The patient has a high fever, a fast heart rate, often atrial fibrillation, and may develop heart failure, agitation and gastrointestinal signs. The Burch–Wartofsky score adds points for these features; 45 points or more is highly suggestive. Mortality is 20–50 %.'
    },
    myxoedema: {
      kind: 'condition', title: 'Myxoedema coma',
      what: 'The most severe, decompensated form of hypothyroidism (too little thyroid hormone).',
      happens: 'Without thyroid hormone the metabolism slows down. Body temperature falls, the heart beats slowly, blood pressure is low and breathing is weak, so CO2 rises (hypercarbia) and oxygen falls. Sodium in the blood is low (hyponatraemia) and consciousness is reduced.'
    },
    'adrenal-crisis': {
      kind: 'condition', title: 'Adrenal crisis',
      what: 'An acute lack of the adrenal hormone cortisol, for example when a patient on long-term steroids misses doses or gets ill.',
      happens: 'Cortisol is needed to keep blood vessels responsive and blood pressure up during stress. Without it the patient develops hypotension or shock, often with fever. When the adrenal glands themselves fail, aldosterone is also missing, so sodium falls and potassium rises (hyponatraemia, hyperkalaemia). Treatment is intravenous hydrocortisone and fluids.'
    },
    phaeo: {
      kind: 'condition', title: 'Phaeochromocytoma crisis',
      what: 'An endocrine emergency in which a tumour of the adrenal medulla (phaeochromocytoma) releases a surge of catecholamines (adrenaline, noradrenaline).',
      happens: 'The catecholamine surge tightens the vessels and drives the heart, causing severe hypertension and a fast heart rate, sometimes with fever. Crises range from this hypertensive form to swings in pressure and sustained hypotension, which may need mechanical circulatory support. Alpha-blockade is strongly associated with survival.'
    },
    'missed-dialysis': {
      kind: 'condition', title: 'Kidney failure after a missed dialysis',
      what: 'People with end-stage kidney failure depend on dialysis to remove fluid and potassium. Between sessions both accumulate.',
      happens: 'Retained fluid raises blood pressure and can flood the lungs (fast breathing, low saturation). Retained potassium changes the ECG (peaked T, flat P, wide QRS) and can cause fatal arrhythmias. After the long 2-day gap between sessions, all-cause mortality, cardiac-arrest deaths and heart-failure admissions were all higher than on other days.'
    },
    'heat-stroke': {
      kind: 'condition', title: 'Heatstroke',
      what: 'A core temperature over 40 °C with dysfunction of the central nervous system (confusion, seizures or coma).',
      happens: 'Heat from exertion or a hot environment exceeds what the body can lose. The skin vessels dilate to shed heat and fluid is lost by sweating, so blood pressure falls and the heart races. Very high temperature damages cells in the brain and other organs. Rapid cooling is the key treatment.'
    },
    nms: {
      kind: 'condition', title: 'Neuroleptic malignant syndrome (NMS)',
      what: 'A rare, dangerous reaction to drugs that block dopamine, mostly antipsychotics.',
      happens: 'Blocking dopamine disturbs temperature control and muscle tone. The patient develops fever, severe muscle rigidity and an unstable autonomic system. Consensus criteria include a temperature over 38.0 °C on two occasions, rigidity, blood pressure at least 25 % above baseline or fluctuating, heart rate at least 25 % and respiratory rate at least 50 % above baseline. It usually develops over days.'
    },
    serotonin: {
      kind: 'condition', title: 'Serotonin toxicity (serotonin syndrome)',
      what: 'Excess serotonin activity, usually from an overdose or a combination of drugs that raise serotonin.',
      happens: 'Too much serotonin in the nervous system causes clonus (rhythmic muscle jerks), tremor, high temperature, a fast heart rate and high blood pressure. It typically starts within hours of a new drug or dose, faster than NMS, and clonus is the key bedside sign.'
    },
    ccb: {
      kind: 'condition', title: 'Calcium-channel-blocker overdose',
      what: 'Poisoning with drugs such as verapamil or diltiazem, which block calcium channels in the heart and blood vessels.',
      happens: 'Blocked calcium channels slow the heart, weaken its contraction and dilate the blood vessels, so the patient has a slow heart rate and low pressure. These drugs also reduce insulin release, so glucose rises: in severe verapamil or diltiazem poisoning the median peak glucose was 364 mg/dL, against 145 mg/dL in non-severe cases.'
    },
    tca: {
      kind: 'condition', title: 'Tricyclic antidepressant overdose',
      what: 'Poisoning with tricyclic antidepressants, an older class of drugs that is dangerous in overdose.',
      happens: 'The drug slows conduction in the heart muscle, which shows as a widened QRS, and it causes a fast heart rate and low blood pressure. The QRS width predicts complications better than the drug level: in the source study seizures occurred only with a QRS of 0.10 s or more, and ventricular arrhythmias only with 0.16 s or more.'
    },
    organophosphate: {
      kind: 'condition', title: 'Organophosphorus pesticide poisoning',
      what: 'Poisoning with organophosphate insecticides, which block the enzyme that breaks down acetylcholine.',
      happens: 'Acetylcholine accumulates and overstimulates its receptors: a cholinergic crisis. The heart slows, the airways narrow and fill with secretions (bronchospasm, bronchorrhoea), and the breathing muscles weaken, which can end in respiratory failure. Treatment is atropine and respiratory support.'
    },
    stimulant: {
      kind: 'condition', title: 'Sympathomimetic (cocaine-type) toxicity',
      what: 'Poisoning with stimulant drugs such as cocaine. Cocaine is a leading cause of drug-related emergency visits, mostly for cardiovascular problems.',
      happens: 'These drugs boost the effect of noradrenaline and the sympathetic nervous system. The heart rate and blood pressure rise, the temperature can rise, and coronary arteries can spasm and cause chest pain or a heart attack.'
    },
    co: {
      kind: 'condition', title: 'Carbon monoxide (CO) poisoning',
      what: 'Poisoning with carbon monoxide, an odourless gas from fires, faulty heaters or engine exhaust.',
      happens: 'CO binds to haemoglobin much more strongly than oxygen and forms carboxyhaemoglobin (COHb), so the blood carries less oxygen. A standard two-wavelength pulse oximeter sees COHb as oxyhaemoglobin. In patients with COHb over 25 %, SpO2 overestimated the true oxyhaemoglobin saturation, more so as COHb rose. Only CO-oximetry of a blood sample measures COHb.'
    },
    'induction-hypotension': {
      kind: 'condition', title: 'Post-induction hypotension',
      what: 'Low blood pressure in the first minutes after starting general anaesthesia, defined in one study as a systolic pressure under 90 mmHg within 20 minutes of induction.',
      happens: 'Induction drugs dilate the blood vessels, weaken the heart and reduce the sympathetic tone that kept the pressure up while the patient was awake. At the same time there is no surgical stimulation yet. The pressure falls, and the heart rate often does not rise much.'
    },
    'oesophageal-intubation': {
      kind: 'condition', title: 'Unrecognised oesophageal intubation',
      what: 'The breathing tube has been placed in the oesophagus (food pipe) instead of the trachea.',
      happens: 'Ventilation goes into the stomach, not the lungs, so there is no gas exchange and no CO2 comes back. Sustained exhaled CO2 on waveform capnography is the main way to exclude this. After good pre-oxygenation the oxygen saturation can stay normal for minutes, so a normal SpO2 does not prove the tube is in the right place.'
    },
    vae: {
      kind: 'condition', title: 'Venous air embolism',
      what: 'Air enters the venous circulation, for example during surgery above heart level or through a central line.',
      happens: 'The air travels to the right heart and the pulmonary arteries and blocks blood flow to ventilated lung (dead space). EtCO2 falls suddenly at an unchanged ventilator setting, followed by hypoxaemia, hypotension and arrhythmias. A large amount of air can stop the circulation.'
    },
    last: {
      kind: 'condition', title: 'Local anaesthetic systemic toxicity (LAST)',
      what: 'Toxic levels of a local anaesthetic in the blood, for example after a nerve block injected into a vessel by mistake.',
      happens: 'Local anaesthetics block sodium channels. In high blood levels they first affect the brain (metallic taste, agitation, seizures), then the heart: bradycardia, conduction delay (wide QRS), hypotension and cardiac arrest. Treatment follows a checklist and includes lipid emulsion.'
    },
    preeclampsia: {
      kind: 'condition', title: 'Pre-eclampsia',
      what: 'A hypertensive disorder of pregnancy, starting after 20 weeks, with protein in the urine or signs of organ damage.',
      happens: 'Abnormal development of the placenta leads to widespread damage of the mother\'s blood-vessel lining. The vessels tighten and the pressure rises; the kidneys, liver, brain and clotting system can be affected. A systolic pressure of 160 mmHg or more or a diastolic of 110 mmHg or more is a severe feature. It can progress to seizures (eclampsia).'
    },
    pph: {
      kind: 'condition', title: 'Postpartum haemorrhage',
      what: 'Heavy bleeding after childbirth, a leading cause of maternal death.',
      happens: 'Most often the uterus does not contract well after delivery and keeps bleeding. Pregnancy increases the blood volume, so the blood pressure stays nearly normal for a long time while the heart rate rises. The shock index (heart rate divided by systolic pressure) shows the problem earlier: an index of 0.9 or more caught every ICU admission and 1.7 or more was highly specific.'
    },
    afe: {
      kind: 'condition', title: 'Amniotic fluid embolism',
      what: 'A rare, sudden collapse during labour or just after birth.',
      happens: 'Amniotic fluid is thought to enter the mother\'s circulation and trigger a severe reaction. There is sudden haemodynamic and respiratory compromise: low blood pressure, low oxygen and often cardiac arrest. The research definition also requires a strictly defined coagulopathy (failure of blood clotting).'
    },
    'spinal-hypotension': {
      kind: 'condition', title: 'Hypotension after spinal anaesthesia for caesarean section',
      what: 'A fall in blood pressure after a spinal anaesthetic, very common at caesarean delivery.',
      happens: 'The spinal anaesthetic blocks sympathetic nerves as well as pain nerves. The vessels in the lower body dilate and blood pools there, so the pressure falls and the placenta gets less blood. The aim is to keep systolic pressure at 90 % of baseline or more and to avoid under 80 %. Phenylephrine is the first choice; with a slow heart rate ephedrine or an anticholinergic may be needed.'
    },
    'post-rosc': {
      kind: 'condition', title: 'After return of spontaneous circulation (post-ROSC)',
      what: 'The phase after the heart has started again following a cardiac arrest.',
      happens: 'Organs, above all the brain, were without blood during the arrest and are injured again when blood flow returns. The heart is often weak for a while. Care aims to avoid further harm: SpO2 94–98 %, a normal arterial CO2 and a mean arterial pressure above 65 mmHg, together with temperature control and a search for the cause (for example a coronary occlusion).'
    }
  };

  // Per preset: the condition it shows, and what this preset puts on the monitor.
  const SCENARIOS = {
    baseline: { condition: 'normal', shows: 'Every number sits in its normal range and no alarm fires. Use it as the reference: change one setting at a time and watch what moves.' },
    tachy: { condition: 'sinus-tachy', shows: 'Heart rate 135/min with a P wave before every QRS. Nothing else changes, so the monitor shows only the rate; the cause has to be found at the bedside.' },
    brady: { condition: 'sinus-brady', shows: 'Heart rate 42/min in sinus rhythm with long gaps between beats. The low heart-rate alarm fires even though the rhythm itself is normal.' },
    irregular: { condition: 'rr-variability', shows: 'Beats at an average of 95/min with varying gaps, but each still has a P wave. Watch whether the rhythm analyser calls it AF: it judges RR variability only.' },
    desat: { condition: 'hypoxaemia', shows: 'SpO2 84 % with a good plethysmogram and every other value normal. A low reading with a clean pleth is more likely to be real.' },
    hypotension: { condition: 'hypotension', shows: 'Blood pressure 80/46 mmHg with a normal heart rate. The pressure alone does not show the cause.' },
    hypertension: { condition: 'hypertension', shows: 'Blood pressure 175/105 mmHg with every other value normal: high, but below the emergency level of 180/120 mmHg.' },
    tachypnea: { condition: 'tachypnoea', shows: 'Respiratory rate 32/min on the impedance trace and the capnogram. Breath depth and the cause are not shown.' },
    bradypnea: { condition: 'bradypnoea', shows: 'Respiratory rate 7/min with long pauses between breaths. EtCO2 is left normal here; the hypoventilation scenarios add the CO2 rise.' },
    fever: { condition: 'fever', shows: 'Temperature 38.9 °C with every other value normal. In real fever the heart rate usually rises too.' },
    disconnect: { condition: 'sensor-off', shows: 'The SpO2 probe is off and the ECG contact is very poor. The pleth and SpO2 disappear and technical alarms fire, while the patient is unchanged.' },
    motion: { condition: 'motion-artefact', shows: 'The plethysmogram is distorted and SpO2 reads falsely low while the true saturation is normal. The cuff may fail to read.' },
    'noisy-ecg': { condition: 'ecg-noise', shows: 'The ECG carries muscle noise, mains hum and baseline wander from poor contact. Try the ECG filter settings and watch for false rhythm calls.' },
    missing: { condition: 'signal-gaps', shows: 'Short gaps in the ECG, pleth and respiration traces, and no temperature value. The gaps appear as gaps, not as zero.' },
    apnea: { condition: 'apnoea', shows: 'The capnogram goes flat and the impedance trace stops. The apnoea alarm fires after its delay; SpO2 has not fallen yet.' },
    af: { condition: 'af', shows: 'Irregularly irregular narrow complexes at 110/min with no P waves. The rhythm analyser flags AF from the RR variability.' },
    'af-rvr': { condition: 'af', shows: 'AF at 160/min with blood pressure 92/60 mmHg: the short filling times lower the pressure. The monitor cannot show how long AF has lasted.' },
    svt: { condition: 'svt', shows: 'A very regular narrow-complex rhythm at 180/min with no visible P waves and a slightly low pressure (106/72 mmHg).' },
    pvc: { condition: 'pvc', shows: 'Fourteen wide, early beats per minute among normal sinus beats, with no P wave before them.' },
    vt: { condition: 'vt', shows: 'Wide-complex tachycardia at 170/min with blood pressure 85/55 mmHg. A high-priority rhythm alarm fires.' },
    vf: { condition: 'vf', shows: 'A chaotic ECG without QRS complexes. The arterial trace, pleth and capnogram lose their pulsatile signals: there is no output.' },
    asystole: { condition: 'asystole', shows: 'A flat ECG and no pulsatile signals. Before acting, check that the leads are attached and the gain is not too low.' },
    hypovent: { condition: 'hypoventilation', shows: 'On room air: respiratory rate 6/min, EtCO2 58 mmHg and SpO2 92 %. The high CO2 lowers the alveolar oxygen, so saturation falls a little.' },
    'hypovent-o2': { condition: 'hypoventilation', shows: 'With supplemental oxygen: respiratory rate 7/min and EtCO2 55 mmHg, but SpO2 stays normal. Only the capnogram shows the problem.' },
    bronchospasm: { condition: 'bronchospasm', shows: 'The capnogram loses its square shape and takes a sloping "shark-fin" form; the respiratory rate is 22/min.' },
    rebreathing: { condition: 'rebreathing', shows: 'Inspired CO2 of 6 mmHg lifts the capnogram baseline above zero, and EtCO2 rises to 46 mmHg.' },
    underdamped: { condition: 'underdamped', shows: 'The arterial waveform overshoots and rings. The arterial systolic reads higher than the cuff pressure; the patient is unchanged.' },
    transducer: { condition: 'transducer', shows: 'The transducer is 20 cm above the heart, so every arterial value reads about 15 mmHg too low. The cuff (NIBP) still reads correctly.' },
    'haem-1': { condition: 'haemorrhage', shows: 'Class I (up to about 15 % loss): heart rate 90/min and respiratory rate 18/min, pressure normal. The monitor looks almost normal.' },
    'haem-2': { condition: 'haemorrhage', shows: 'Class II: heart rate 110/min, respiratory rate 24/min, systolic still normal (118 mmHg) but a narrow pulse pressure (118/92 mmHg).' },
    'haem-3': { condition: 'haemorrhage', shows: 'Class III: heart rate 130/min, systolic 88 mmHg, respiratory rate 32/min and a low perfusion index (0.8): compensation is failing.' },
    'haem-4': { condition: 'haemorrhage', shows: 'Class IV (over 40 % loss): heart rate 145/min, blood pressure 68/50 mmHg, respiratory rate 38/min and almost no peripheral perfusion (PI 0.3).' },
    'sepsis-screen': { condition: 'sepsis', shows: 'Heart rate 112/min, respiratory rate 24/min, systolic 96 mmHg and 38.7 °C: several SIRS and qSOFA thresholds are crossed together. Screening is not diagnosis.' },
    'septic-shock': { condition: 'sepsis', shows: 'Blood pressure 82/40 mmHg (mean under 65), heart rate 125/min, 39.2 °C and a high perfusion index (4): warm, dilated vessels, unlike the cold fingers of blood loss.' },
    anaphylaxis: { condition: 'anaphylaxis', shows: 'Blood pressure 78/42 mmHg, heart rate 128/min, SpO2 90 % and an obstructive capnogram appear together. Skin signs cannot be shown.' },
    'dka-pattern': { condition: 'dka', shows: 'Glucose 320 mg/dL with deep fast breathing (28/min) and a low EtCO2 (24 mmHg), plus a fast heart rate and lowish pressure from dehydration. Ketones and pH are not modelled.' },
    'pe-pattern': { condition: 'pe', shows: 'Heart rate 115/min, SpO2 89 %, respiratory rate 24/min and EtCO2 30 mmHg. Fast breathing also lowers EtCO2, so only a blood gas shows the dead-space gap.' },
    'pe-high-risk': { condition: 'pe', shows: 'Systolic 82 mmHg, heart rate 130/min, SpO2 84 % and EtCO2 22 mmHg: haemodynamic instability makes this high-risk PE.' },
    hypothermia: { condition: 'hypothermia', shows: 'Stage II: 30.5 °C with heart rate 45/min, blood pressure 92/58 mmHg, respiratory rate 9/min and a weak pleth (PI 0.3).' },
    'hypothermia-1': { condition: 'hypothermia', shows: 'Stage I: 34 °C with shivering (motion artefact), heart rate 105/min and raised pressure. Shivering makes SpO2 read falsely low.' },
    'mh-early': { condition: 'mh', shows: 'EtCO2 climbs to 60 mmHg at a fixed ventilator rate of 12/min and the heart rate rises to 125/min, while temperature is only 37.6 °C.' },
    'mh-late': { condition: 'mh', shows: 'EtCO2 75 mmHg, heart rate 145/min, temperature 39.5 °C and ectopic beats (PVCs).' },
    copd: { condition: 'copd', shows: 'A shark-fin capnogram with EtCO2 52 mmHg, SpO2 89 % and respiratory rate 24/min. An SpO2 near 90 % can be the intended target here.' },
    'hyperk-early': { condition: 'hyperkalaemia', shows: 'Tall, peaked T waves; every number stays normal. Only the ECG shape changes.' },
    'hyperk-late': { condition: 'hyperkalaemia', shows: 'Peaked T waves, flattened P waves and a wide QRS complex: conduction is now slowed.' },
    'missed-dialysis': { condition: 'missed-dialysis', shows: 'Peaked T, small P and a widening QRS with heart rate 58/min, blood pressure 178/98 mmHg, respiratory rate 26/min and SpO2 91 %.' },
    cushing: { condition: 'cushing', shows: 'Blood pressure 200/90 mmHg (wide pulse pressure) with heart rate 46/min and respiratory rate 8/min. Irregular breathing cannot be set.' },
    deteriorating: { condition: 'deterioration', shows: 'Respiratory rate 31/min, SpO2 88 %, heart rate 122/min, blood pressure 86/52 mmHg: several moderate alarms at once, which matter more together than alone.' },
    periarrest: { condition: 'deterioration', shows: 'Respiratory rate 4/min, SpO2 68 %, heart rate 36/min, blood pressure 60/32 mmHg and EtCO2 18 mmHg (little blood reaches the lungs). Arrest is next.' },
    'post-rosc': { condition: 'post-rosc', shows: 'Heart rate 110/min, blood pressure 92/56 mmHg (mean 68), EtCO2 38 mmHg and SpO2 96 %: inside the post-resuscitation targets.' },
    stroke: { condition: 'stroke', shows: 'Blood pressure 192/104 mmHg, above the 185/110 mmHg limit for clot-dissolving treatment. The neurological deficit and the stroke type cannot be shown.' },
    'hf-oedema': { condition: 'ahf', shows: 'Warm-wet profile: blood pressure 178/102 mmHg, heart rate 118/min, respiratory rate 32/min and SpO2 86 % from fluid in the lungs.' },
    'hf-cold-wet': { condition: 'ahf', shows: 'Cold-wet profile: blood pressure 92/74 mmHg (narrow pulse pressure), heart rate 112/min, SpO2 90 % and a low perfusion index (0.5). No default alarm fires, although this profile has the highest risk: pulse pressure and perfusion index have no alarm.' },
    'cardiogenic-shock': { condition: 'ahf', shows: 'SCAI stage C: blood pressure 76/50 mmHg, heart rate 118/min, SpO2 88 % and very poor perfusion (PI 0.3). It looks like blood loss on the monitor.' },
    'postop-opioid': { condition: 'opioid', shows: 'On a ward, room air: respiratory rate 6/min, EtCO2 62 mmHg, SpO2 86 % and heart rate 58/min.' },
    'opioid-overdose': { condition: 'opioid', shows: 'Respiratory rate 4/min, EtCO2 68 mmHg and SpO2 78 % on room air: more severe than the post-operative pattern.' },
    'postop-hypothermia': { condition: 'periop-hypothermia', shows: '35.2 °C with shivering (motion artefact), heart rate 96/min and a low perfusion index. SpO2 reads about 85 % although the true saturation is 97 %: an artefact.' },
    'postop-ppc': { condition: 'ppc', shows: 'SpO2 89 %, respiratory rate 26/min, heart rate 104/min and EtCO2 34 mmHg in the days after surgery.' },
    'induction-hypotension': { condition: 'induction-hypotension', shows: 'Blood pressure 78/42 mmHg with heart rate 60/min and a ventilated pattern (rate 12/min, EtCO2 35 mmHg).' },
    'oesophageal-intubation': { condition: 'oesophageal-intubation', shows: 'Almost no exhaled CO2 (EtCO2 5 mmHg) while SpO2 is still 94 %. The flat capnogram is the warning.' },
    vae: { condition: 'vae', shows: 'EtCO2 falls to 22 mmHg at a fixed ventilator rate, with SpO2 90 %, heart rate 120/min and blood pressure 86/52 mmHg.' },
    last: { condition: 'last', shows: 'Heart rate 40/min, a wide QRS and blood pressure 70/38 mmHg: the cardiac stage. The earlier CNS signs cannot be shown.' },
    athlete: { condition: 'athlete', shows: 'Sinus rhythm at 44/min with high beat-to-beat variability and slow breathing (10/min). The low heart-rate alarm still fires.' },
    'hypertensive-emergency': { condition: 'hypertensive-emergency', shows: 'Blood pressure 220/130 mmHg with heart rate 96/min. Whether it is an emergency depends on organ damage, which the monitor cannot show.' },
    'aortic-regurgitation': { condition: 'aortic-regurgitation', shows: 'Blood pressure 160/45 mmHg: a very wide pulse pressure and a bounding pulse on the arterial and pleth traces.' },
    tamponade: { condition: 'tamponade', shows: 'Heart rate 125/min, low and narrow pressure (84/66 mmHg), fast breathing and small QRS complexes. Pulsus paradoxus and electrical alternans are not modelled.' },
    'neurogenic-shock': { condition: 'neurogenic-shock', shows: 'Blood pressure 82/44 mmHg with a slow heart rate of 48/min: low pressure without the fast rate of blood loss.' },
    vasovagal: { condition: 'vasovagal', shows: 'Heart rate 40/min and blood pressure 72/40 mmHg together: both the cardioinhibitory and the vasodepressor parts.' },
    'asthma-severe': { condition: 'asthma', shows: 'Respiratory rate 28/min, heart rate 118/min, SpO2 93 %, a steep shark-fin capnogram and a low EtCO2 (32 mmHg).' },
    'asthma-life': { condition: 'asthma', shows: 'SpO2 88 %, respiratory rate down to 14/min and EtCO2 back to 42 mmHg with severe obstruction: the patient is tiring, not improving.' },
    pneumonia: { condition: 'pneumonia', shows: 'A 72-year-old with respiratory rate 30/min, diastolic 58 mmHg, 38.6 °C and SpO2 91 %: three CURB-65 points from the monitor and the age.' },
    ards: { condition: 'ards', shows: 'SpO2 87 % with respiratory rate 30/min and heart rate 110/min. SpO2 cannot give the Berlin grade; that needs a blood gas.' },
    'tension-ptx': { condition: 'tension-ptx', shows: 'In a ventilated patient: SpO2 82 %, blood pressure 74/48 mmHg, heart rate 135/min and EtCO2 falling to 25 mmHg with the cardiac output.' },
    hyperventilation: { condition: 'hyperventilation', shows: 'Respiratory rate 30/min, EtCO2 22 mmHg and SpO2 99 %. The same low EtCO2 also appears in DKA compensation.' },
    tbi: { condition: 'tbi', shows: 'Systolic 88 mmHg, SpO2 88 %, slow breathing (10/min) and EtCO2 48 mmHg: both secondary insults, hypotension and hypoxia, together.' },
    seizure: { condition: 'status-epilepticus', shows: 'Muscle activity floods the ECG and the pleth with artefact, so the heart rate and SpO2 values are unreliable. Pressure 170/100 mmHg and 38.2 °C.' },
    'autonomic-dysreflexia': { condition: 'autonomic-dysreflexia', shows: 'Blood pressure 190/105 mmHg with a slow heart rate of 52/min. In these patients a lower reading can already be a crisis, because baseline pressure is often low.' },
    'neuromuscular-failure': { condition: 'gbs', shows: 'Fast, shallow breathing (30/min, small impedance swings), EtCO2 46 mmHg and SpO2 still 95 %: oxygenation fails late.' },
    hypoglycaemia: { condition: 'hypoglycaemia', shows: 'Glucose 50 mg/dL (level 2) with heart rate 110/min and systolic 150 mmHg from the adrenaline response.' },
    'thyroid-storm': { condition: 'thyroid-storm', shows: 'AF at 150/min, 39.4 °C, a wide pulse pressure (150/60 mmHg) and respiratory rate 24/min.' },
    myxoedema: { condition: 'myxoedema', shows: '34.5 °C, heart rate 46/min, respiratory rate 8/min, EtCO2 52 mmHg, blood pressure 92/60 mmHg and small QRS complexes.' },
    'adrenal-crisis': { condition: 'adrenal-crisis', shows: 'Blood pressure 78/44 mmHg, heart rate 120/min, 38.4 °C and peaked T waves from raised potassium. On the monitor it looks like septic shock.' },
    'phaeo-crisis': { condition: 'phaeo', shows: 'Blood pressure 230/125 mmHg, heart rate 140/min and 38.4 °C: the hypertensive form of the crisis.' },
    'heat-stroke': { condition: 'heat-stroke', shows: '41.5 °C with heart rate 145/min, blood pressure 92/50 mmHg and fast breathing (30/min). The confusion cannot be shown.' },
    nms: { condition: 'nms', shows: '39.5 °C, heart rate 120/min, blood pressure 160/95 mmHg and respiratory rate 24/min. Rigidity cannot be shown.' },
    serotonin: { condition: 'serotonin', shows: '39 °C, heart rate 130/min, blood pressure 165/95 mmHg and tremor (motion artefact), which also gives a falsely low SpO2.' },
    'ccb-overdose': { condition: 'ccb', shows: 'Heart rate 42/min and blood pressure 74/40 mmHg with glucose 360 mg/dL in a patient without diabetes.' },
    tca: { condition: 'tca', shows: 'Heart rate 125/min, blood pressure 84/50 mmHg and a widened QRS complex.' },
    organophosphate: { condition: 'organophosphate', shows: 'Heart rate 46/min, respiratory rate 30/min, SpO2 86 % and an obstructive capnogram from bronchospasm and secretions.' },
    stimulant: { condition: 'stimulant', shows: 'Heart rate 140/min, blood pressure 180/105 mmHg and 39 °C. ST changes are not modelled.' },
    'co-poisoning': { condition: 'co', shows: 'SpO2 reads 99 % while the true oxygen content is low; heart rate 110/min and respiratory rate 22/min. The monitor gives false reassurance.' },
    preeclampsia: { condition: 'preeclampsia', shows: 'A 30-year-old woman with blood pressure 168/112 mmHg: both values in the severe range. The fetus is not modelled.' },
    pph: { condition: 'pph', shows: 'Heart rate 120/min with systolic still 92 mmHg: shock index 1.3, above the 0.9 warning level. Low perfusion index (0.8).' },
    afe: { condition: 'afe', shows: 'Sudden collapse: SpO2 78 %, blood pressure 66/36 mmHg, heart rate 135/min and EtCO2 18 mmHg.' },
    'spinal-hypotension': { condition: 'spinal-hypotension', shows: 'Blood pressure 82/44 mmHg (68 % of a 120 mmHg baseline) with heart rate 58/min.' }
  };

  return { CONDITIONS, SCENARIOS };
});
