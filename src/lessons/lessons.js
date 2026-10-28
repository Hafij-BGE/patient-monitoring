/* Guided lessons and self-check quizzes. Pure data and logic (no DOM): each lesson
 * loads a scenario preset, lists steps the learner carries out on the simulator
 * (some with a "Do it" action that sets controls), and ends with a short quiz
 * graded here. The questions are about how the simulated monitor measures, using
 * the model and parameter values of this simulator. They are teaching material,
 * not clinical guidance. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).lessons = factory();
})(this, function () {
  'use strict';

  /**
   * Lesson fields:
   *   id, title, minutes, preset (PRESETS id), objectives[]
   *   steps[]: { text, tab?, set?: {param: value} }   tab = panel to open, set = controls to change
   *   quiz[]:  { q, options[], answer (index), why }
   */
  const LESSONS = [
    {
      id: 'ecg-chain', title: 'ECG: from electrodes to heart rate', minutes: 10, preset: 'noisy-ecg',
      objectives: ['Name the noise sources added between the patient model and the display',
        'Explain what the display filter and the mains notch remove',
        'Follow the Pan–Tompkins steps that turn the ECG into a heart rate'],
      steps: [
        { text: 'The scenario adds baseline wander, broadband noise and 80 µV of mains interference. Open the signal chain for the ECG and compare stage 1 (model) with stage 2 (acquired).', tab: 'chain' },
        { text: 'Turn the mains notch off. The 50 Hz interference now reaches the display trace (stage 3).', set: { notch: 'off' } },
        { text: 'Turn the notch back on and switch the display filter to "diagnostic" (0.05–150 Hz). The baseline wander comes back on the display.', set: { notch: 'on', ecg_filter: 'diagnostic' } },
        { text: 'Return to the monitor filter. Watch stage 4: each QRS becomes one bump that crosses the dashed adaptive threshold.', set: { ecg_filter: 'monitor' } },
      ],
      quiz: [
        { q: 'Why does the monitor filter (0.5–40 Hz) hide baseline wander better than the diagnostic filter (0.05–150 Hz)?',
          options: ['Its higher low cut-off removes slow components such as breathing-related wander', 'Its lower high cut-off removes slow components', 'It averages several beats', 'It increases the ECG gain'],
          answer: 0, why: 'Baseline wander is below about 0.5 Hz. A 0.5 Hz high-pass removes most of it; 0.05 Hz lets it through.' },
        { q: 'The simulator\'s mains frequency is set to 50 Hz (as in Turkey and Europe). Where should the notch filter be centred?',
          options: ['0.5 Hz', '40 Hz', '50 Hz', '150 Hz'], answer: 2,
          why: 'A notch removes a narrow band around the interfering mains frequency, here 50 Hz (60 Hz in some other countries).' },
        { q: 'In the Pan–Tompkins chain, which step turns each QRS into a single positive bump that can be compared with a threshold?',
          options: ['5–15 Hz band-pass', 'Derivative', 'Moving-window integration after squaring', 'Notch filter'], answer: 2,
          why: 'Squaring makes all values positive and stresses steep slopes; the 150 ms moving-window integral merges them into one bump per QRS.' },
      ],
    },
    {
      id: 'spo2', title: 'Pulse oximetry: ratio of ratios', minutes: 10, preset: 'desat',
      objectives: ['Explain why two wavelengths are needed', 'Compute SpO₂ from R with the simulator\'s calibration line',
        'Recognise when the signal quality index makes a reading unreliable'],
      steps: [
        { text: 'Open the signal chain for SpO₂. Compare the red and infrared channels and read R in the line under the plots.', tab: 'chain' },
        { text: 'Set the saturation back to 97 % and see R fall.', set: { spo2: 97 } },
        { text: 'Add strong motion. The pleth trace distorts, the SQI falls and the reading becomes unreliable.', set: { motion: 70 } },
        { text: 'Remove the motion and lower the perfusion index to 0.3 %. The AC part shrinks and noise matters more.', set: { motion: 0, pi: 0.3 } },
      ],
      quiz: [
        { q: 'Why does a pulse oximeter use a red and an infrared LED?',
          options: ['Oxygenated and deoxygenated haemoglobin absorb the two wavelengths differently', 'One LED measures heart rate and the other temperature', 'Infrared light is needed to see through nail polish', 'Two LEDs double the signal strength'],
          answer: 0, why: 'The ratio of the pulsatile absorption at the two wavelengths depends on the fraction of oxygenated haemoglobin.' },
        { q: 'This simulator uses SpO₂ = 110 − 25·R. Which R gives 85 %?',
          options: ['0.5', '0.85', '1.0', '1.25'], answer: 2, why: '110 − 25 × 1.0 = 85. Real devices use their own empirical calibration curves.' },
        { q: 'What does the perfusion index (PI) shown here express?',
          options: ['Pulsatile (AC) part of the infrared signal relative to its DC level, in %', 'Oxygen content of the blood', 'Pulse rate divided by respiration rate', 'The SQI multiplied by 100'],
          answer: 0, why: 'PI = AC/DC × 100 of the infrared channel. A low PI means a small pulsatile signal.' },
      ],
    },
    {
      id: 'nibp', title: 'NIBP: the oscillometric method', minutes: 8, preset: 'baseline',
      objectives: ['Describe the cuff inflate–deflate cycle', 'Locate MAP on the oscillogram', 'Explain the fixed-ratio method for systolic and diastolic pressure'],
      steps: [
        { text: 'Open the NIBP tab and press "Start NIBP". Watch the cuff pressure wave on the monitor.', tab: 'nibp' },
        { text: 'When the measurement ends, look at the oscillogram: the amplitude rises to a maximum and falls again.' },
        { text: 'Change the systolic ratio Ks to 0.3 and measure again. The reported systolic pressure rises by a few mmHg although the patient did not change.', set: { nibp_ks: 0.3 } },
        { text: 'Set Ks back to 0.5.', set: { nibp_ks: 0.5 } },
      ],
      quiz: [
        { q: 'In this oscillometric model, where is the mean arterial pressure read?',
          options: ['At the cuff pressure with the largest oscillation amplitude', 'Where the oscillations first appear', 'Where the oscillations disappear', 'At the average of systolic and diastolic cuff pressures'],
          answer: 0, why: 'MAP is taken at the maximum of the oscillation envelope.' },
        { q: 'With Ks = 0.5, systolic pressure is taken where the amplitude equals…',
          options: ['0.5 × maximum, on the high-pressure side of the maximum', '0.5 × maximum, on the low-pressure side', 'half of MAP', 'the first oscillation'],
          answer: 0, why: 'The fixed-ratio method looks above MAP for Ks·max (systolic) and below MAP for Kd·max (diastolic).' },
        { q: 'Why does changing Ks change the reading without changing the patient?',
          options: ['Ks is a processing setting of the algorithm, not a property of the artery', 'Ks inflates the cuff higher', 'Ks changes the heart rate', 'It does not; the reading stays the same'],
          answer: 0, why: 'Systolic and diastolic values from oscillometry depend on the chosen ratios. Devices use their own, validated algorithms.' },
      ],
    },
    {
      id: 'rhythms', title: 'Rhythm patterns and the analyser', minutes: 10, preset: 'pvc',
      objectives: ['Recognise the teaching patterns: PVCs, AF, V-Tach', 'Describe which features the rule-based analyser uses', 'Explain the learning period'],
      steps: [
        { text: 'Frequent PVCs: look for early, wide complexes followed by a pause. The HR tile shows PVCs per minute.' },
        { text: 'Switch to atrial fibrillation. The R–R intervals become irregular and there are no P waves.', set: { arrhythmia: 'af', hr: 110 } },
        { text: 'Switch to V-Tach. Wide complexes at a high rate; the alarm has high priority and no delay.', set: { arrhythmia: 'vt', hr: 170 } },
        { text: 'Open the signal chain for the ECG: QRS width and rhythm label are listed under the plots.', tab: 'chain' },
      ],
      quiz: [
        { q: 'Which feature marks a PVC in this simulator?',
          options: ['An early, wide complex followed by a compensatory pause', 'A tall P wave', 'A slower but regular rhythm', 'Smaller T waves only'],
          answer: 0, why: 'The PVC model fires early, with a wide QRS and no P wave; the next normal beat comes on time, leaving a pause.' },
        { q: 'Which measurement does the analyser use to call a rhythm "Irregular"?',
          options: ['Coefficient of variation of the R–R intervals between narrow beats', 'QRS amplitude', 'SpO₂ value', 'T-wave height'],
          answer: 0, why: 'Irregular is called when the narrow-to-narrow R–R variation is above 0.12 (an illustrative threshold).' },
        { q: 'Why does the rhythm label read "Learning" after a reset?',
          options: ['The analyser needs about 8 s of signal before its rules apply', 'The ECG is switched off for 8 s', 'The alarm system is being tested', 'The patient model is not running'],
          answer: 0, why: 'Rules based on R–R statistics need a few beats first. The analyser here is illustrative and not a validated algorithm.' },
      ],
    },
    {
      id: 'capno', title: 'Capnography: reading the CO₂ waveform', minutes: 8, preset: 'baseline',
      objectives: ['Name the phases of the time capnogram', 'Link waveform changes to ventilation, obstruction and rebreathing in the model'],
      steps: [
        { text: 'Open the signal chain for capnography. Find phase I (baseline), phase II (rise) and phase III (plateau).', tab: 'chain' },
        { text: 'Load hypoventilation: fewer breaths and a higher plateau.', set: { rr: 6, etco2: 58 } },
        { text: 'Load airway obstruction: the rise becomes slow and the plateau slopes upward.', set: { rr: 22, etco2: 38, airway_obstr: 80 } },
        { text: 'Load rebreathing: the baseline no longer returns to zero, so FiCO₂ is above 0.', set: { airway_obstr: 0, rr: 14, fico2: 6 } },
      ],
      quiz: [
        { q: 'Which part of the capnogram is reported as EtCO₂?',
          options: ['The end of the expiratory plateau (peak of each breath)', 'The inspiratory baseline', 'The steepest point of phase II', 'The average over a whole minute'],
          answer: 0, why: 'EtCO₂ is the CO₂ at the end of expiration, the highest point of each breath here.' },
        { q: 'In this model, what does a baseline that stays above zero indicate?',
          options: ['Inspired CO₂ (rebreathing), shown as FiCO₂ > 0', 'Higher heart rate', 'A disconnected sampling line', 'Normal ventilation'],
          answer: 0, why: 'FiCO₂ is the minimum during inspiration. Above zero means CO₂ is being breathed in again.' },
        { q: 'How does the airway obstruction setting change the waveform?',
          options: ['Slower phase II rise and an upward-sloping phase III', 'Higher EtCO₂ with a flat plateau', 'Waveform disappears', 'Only the respiratory rate changes'],
          answer: 0, why: 'The model slows the rise time constant with obstruction, giving a sloped plateau while EtCO₂ changes little.' },
      ],
    },
    {
      id: 'artline', title: 'Arterial line: damping and transducer height', minutes: 8, preset: 'baseline',
      objectives: ['Explain how damping changes the arterial waveform', 'Compute the error from transducer height', 'Explain zeroing'],
      steps: [
        { text: 'Open the signal chain for the arterial line. Grey shows the true pressure, colour the transducer output.', tab: 'chain' },
        { text: 'Make the line under-damped: overshoot and ringing raise the systolic reading.', set: { ibp_damping: 'under-damped' } },
        { text: 'Make it over-damped: the peaks are blunted and systolic reads low. MAP stays close.', set: { ibp_damping: 'over-damped' } },
        { text: 'Return to optimal damping and raise the transducer 20 cm above the heart.', set: { ibp_damping: 'optimal', ibp_height_cm: 20 } },
        { text: 'Open the line to air (as when zeroing): the pressure reads 0.', set: { ibp_height_cm: 0, ibp_line: 'open-to-air' } },
        { text: 'Reconnect the line.', set: { ibp_line: 'connected' } },
      ],
      quiz: [
        { q: 'An under-damped arterial line most often…',
          options: ['over-reads systolic pressure, with MAP close to the true value', 'under-reads all pressures by the same amount', 'shows no waveform', 'reads only MAP correctly when over-damped'],
          answer: 0, why: 'Low damping makes the system ring, adding overshoot to the systolic peak; the mean is affected much less.' },
        { q: 'The transducer is 20 cm above the heart. About how much lower is the reading? (1 cmH₂O ≈ 0.736 mmHg)',
          options: ['About 7 mmHg', 'About 15 mmHg', 'About 20 mmHg', 'About 27 mmHg'], answer: 1,
          why: '20 × 0.736 ≈ 14.7 mmHg of hydrostatic offset.' },
        { q: 'Why is the line opened to air during zeroing?',
          options: ['So the transducer reads atmospheric pressure as 0', 'To remove air bubbles', 'To flush the catheter', 'To test the alarm'],
          answer: 0, why: 'Zeroing sets atmospheric pressure as the reference, so the monitor shows pressure relative to it.' },
      ],
    },
    {
      id: 'alarms', title: 'Alarms: physiological and technical', minutes: 8, preset: 'disconnect',
      objectives: ['Tell physiological and technical alarms apart', 'Explain alarm delay and priority'],
      steps: [
        { text: 'The SpO₂ probe is disconnected and ECG contact is poor. Read the alarm bar: these are technical alarms.' },
        { text: 'Reconnect the sensors.', set: { spo2_sensor: 'attached', contact: 100 } },
        { text: 'Stop breathing: the apnea alarm needs the apnea delay (20 s) before it activates.', set: { rr: 0 } },
        { text: 'Open the Alarms tab and look at the history and the limits table.', tab: 'alarms' },
        { text: 'Restore breathing.', set: { rr: 14 } },
      ],
      quiz: [
        { q: 'A "SpO₂ probe off" message is…',
          options: ['a technical alarm about the equipment', 'a physiological alarm about the patient', 'not an alarm', 'a high-priority rhythm alarm'],
          answer: 0, why: 'Technical alarms report problems with the equipment or signal, not with the patient.' },
        { q: 'Why do limit alarms have a delay of several seconds here?',
          options: ['To avoid alarms from short artefacts', 'To save battery', 'Because the numbers update only once a minute', 'Delays are not used'],
          answer: 0, why: 'A condition must persist for the delay before the alarm activates, which filters brief spikes.' },
        { q: 'In this simulator, which alarms are high priority with no delay?',
          options: ['Apnea, asystole, V-Fib and V-Tach', 'All limit alarms', 'Only temperature alarms', 'Technical alarms'],
          answer: 0, why: 'These are configured as high priority with zero delay in the alarm engine.' },
      ],
    },
  ];

  function get(id) {
    const l = LESSONS.find(x => x.id === id);
    if (!l) throw new Error('unknown lesson ' + id);
    return l;
  }

  /** answers: array of chosen option indices (null = not answered). */
  function grade(id, answers) {
    const l = get(id);
    const items = l.quiz.map((q, i) => {
      const chosen = answers && Number.isInteger(answers[i]) ? answers[i] : null;
      return { chosen, correct: q.answer, ok: chosen === q.answer, answered: chosen !== null, why: q.why };
    });
    const score = items.filter(x => x.ok).length;
    return { score, total: items.length, percent: Math.round(100 * score / items.length), complete: items.every(x => x.answered), items };
  }

  return { LESSONS, get, grade };
});
