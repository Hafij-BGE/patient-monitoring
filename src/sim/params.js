/* Simulation parameter catalogue, validation and scenario presets.
 * Every control in the UI is generated from SPEC, so each one has a label,
 * a unit, a range and a documented effect. Values are educational settings,
 * not device specifications or clinical thresholds. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).params = factory();
})(this, function () {
  'use strict';

  const GROUPS = {
    patient: 'Patient profile (part of the scenario)',
    physiology: 'Physiological inputs (the simulated patient)',
    metabolic: 'Glucose and insulin (model, section 3.13)',
    sensor: 'Sensor and artifact settings (the measurement)',
    processing: 'Processing and display settings (the monitor)',
  };

  // type: num | sel. "help" states the control's effect.
  const SPEC = {
    // ---- patient profile (also shown in the Profile tab) ----
    age_years:   { group: 'patient', label: 'Age', unit: 'years', type: 'num', min: 18, max: 100, step: 1, def: 40,
                   help: 'Used for the adult BMI category, the age-predicted maximal heart rate (formula chosen under Profile → Formulas; default Tanaka, 208 − 0.7 × age). The simulated vital signs do not depend on age, except that with "Age and sex set typical blood pressure" on, a hand edit sets SYS/DIA to the NHANES mean [78]. Age, height and MAP set the delay of the reflected wave in the pleth shape (Millasseau 2002 [93]).' },
    sex:         { group: 'patient', label: 'Sex', type: 'sel', options: ['unspecified', 'female', 'male'], def: 'unspecified',
                   help: 'Used for predicted body weight (ARDS Network formula) and, with "Age and sex set typical blood pressure" on, for the sex-specific NHANES blood pressure [78].' },
    height_cm:   { group: 'patient', label: 'Height', unit: 'cm', type: 'num', min: 120, max: 220, step: 1, def: 172,
                   help: 'Used for BMI, BSA and predicted body weight (Profile tab), and as the reflection path length for the pleth shape: delay = height / stiffness index [93].' },
    weight_kg:   { group: 'patient', label: 'Body weight', unit: 'kg', type: 'num', min: 30, max: 250, step: 0.5, def: 70,
                   help: 'Used for BMI and BSA, the 30 mL/kg fluid and 0.5 mL/kg/h urine cards (Profile tab), and the glucose and insulin distribution volumes of the glucose model.' },
    diabetes:    { group: 'patient', label: 'Diabetes status', type: 'sel', options: ['none', 'type1', 'type2'], def: 'none',
                   help: 'Selects the glucose–insulin model parameter set (no, absent or reduced insulin secretion; insulin sensitivity). It does not change the other signals.' },

    // ---- physiology ----
    hr:          { group: 'physiology', label: 'Heart rate', unit: 'bpm', type: 'num', min: 30, max: 220, step: 1, def: 72,
                   help: 'Mean cardiac cycle rate. Sets the ECG beat interval (60/HR s), PPG pulse timing and the arterial pulse train.' },
    arrhythmia:  { group: 'physiology', label: 'Arrhythmia pattern', type: 'sel', options: ['none', 'af', 'svt', 'pvc', 'vt', 'vf', 'asystole'], def: 'none',
                   help: 'Teaching patterns. af: no P wave, f-waves, irregular intervals. svt: narrow beats at the set heart rate with no visible P wave (hidden in the QRS); use a high rate and low variability. pvc: occasional early wide beat with a compensatory pause. vt: every beat wide at the set heart rate. vf: chaotic 3–7 Hz activity, no beats. asystole: flat line. Shapes are illustrative, not diagnostic.' },
    pvc_per_min: { group: 'physiology', label: 'PVC rate (pvc pattern)', unit: '/min', type: 'num', min: 0, max: 30, step: 1, def: 6,
                   help: 'Mean number of premature ventricular beats per minute when the pattern is "pvc" (at most every second beat).' },
    rhythm:      { group: 'physiology', label: 'Rhythm timing', type: 'sel', options: ['regular', 'irregular'], def: 'regular',
                   help: 'regular: intervals = 60/HR ± variability. irregular: each interval drawn uniformly within ±35 % of 60/HR (timing pattern only; no diagnosis implied).' },
    hrv_ms:      { group: 'physiology', label: 'Beat-to-beat variability (SD)', unit: 'ms', type: 'num', min: 0, max: 150, step: 1, def: 15,
                   help: 'Standard deviation of the Gaussian jitter added to each beat interval.' },
    ecg_amp_mv:  { group: 'physiology', label: 'R-wave amplitude', unit: 'mV', type: 'num', min: 0.2, max: 3, step: 0.05, def: 1.0,
                   help: 'Peak R amplitude above the isoelectric line (gain is calibrated so the clean R peak equals this value).' },
    p_scale:     { group: 'physiology', label: 'P-wave size', unit: '×', type: 'num', min: 0, max: 2, step: 0.05, def: 1,
                   help: 'Scales the P-wave Gaussian amplitude a_P of the McSharry model.' },
    t_scale:     { group: 'physiology', label: 'T-wave size', unit: '×', type: 'num', min: -1, max: 2, step: 0.05, def: 1,
                   help: 'Scales the T-wave Gaussian amplitude a_T (negative inverts the T wave).' },
    qrs_width:   { group: 'physiology', label: 'QRS width', unit: '×', type: 'num', min: 0.6, max: 2.5, step: 0.05, def: 1,
                   help: 'Scales the Q, R and S Gaussian widths b_i (amplitudes compensated so the R height stays constant).' },
    spo2:        { group: 'physiology', label: 'Arterial O2 saturation (set point)', unit: '%', type: 'num', min: 50, max: 100, step: 1, def: 97,
                   help: 'Sets the red/IR modulation ratio R = (110 − SpO2)/25 used by the optical forward model.' },
    pi:          { group: 'physiology', label: 'Perfusion (pulsatile fraction)', unit: '%', type: 'num', min: 0.05, max: 20, step: 0.05, def: 3,
                   help: 'IR pulsatile absorbance amplitude ≈ perfusion index (AC/DC × 100). Low values reduce PPG signal-to-noise ratio.' },
    ppg_reflection: { group: 'physiology', label: 'Pulse-wave reflection (pleth shape)', unit: '×', type: 'num', min: 0, max: 0.8, step: 0.05, def: 0.3,
                   help: 'Gain of the wave reflected from the lower body in the finger volume pulse, delayed by height / SI with SI = 0.63 + 0.086·age + 0.042·MAP m/s (Millasseau 2002 [93]). 0 gives a single systolic peak; higher values give a clearer dicrotic notch and diastolic peak. Vasoconstriction raises the reflection, nitrates lower it (Chowienczyk 1999 [94]). The gain value itself is illustrative. The pulse is rescaled so PI keeps its set value.' },
    sbp:         { group: 'physiology', label: 'Systolic pressure', unit: 'mmHg', type: 'num', min: 50, max: 250, step: 1, def: 120,
                   help: 'Peak of the simulated arterial pressure waveform (input to the oscillometric model).' },
    dbp:         { group: 'physiology', label: 'Diastolic pressure', unit: 'mmHg', type: 'num', min: 25, max: 150, step: 1, def: 80,
                   help: 'Minimum of the simulated arterial pressure waveform. Must be at least 10 mmHg below systolic.' },
    stiffness:   { group: 'physiology', label: 'Arterial wall stiffness', unit: '×', type: 'num', min: 0.5, max: 2.5, step: 0.05, def: 1,
                   help: 'Scales the widths of the brachial artery pressure–volume curve. Stiffer = smaller, broader oscillations; shifts oscillometric error.' },
    pat_ms:      { group: 'physiology', label: 'Pulse arrival time', unit: 'ms', type: 'num', min: 100, max: 400, step: 10, def: 200,
                   help: 'Delay from the ECG R peak to the foot of the arterial pulse (pre-ejection period + pulse transit time). Sets the start of the arterial line and pleth beats. Set by hand: it does not follow pressure or stiffness here.' },
    rr:          { group: 'physiology', label: 'Respiratory rate', unit: 'br/min', type: 'num', min: 0, max: 60, step: 1, def: 14,
                   help: 'Breathing cycle rate (cycle = 60/RR s). 0 = no breathing (apnea demonstration).' },
    resp_amp:    { group: 'physiology', label: 'Breath impedance change', unit: 'Ω', type: 'num', min: 0.05, max: 3, step: 0.05, def: 1,
                   help: 'Peak transthoracic impedance change per breath (illustrative scale).' },
    etco2:       { group: 'physiology', label: 'Alveolar CO2 (end-tidal set point)', unit: 'mmHg', type: 'num', min: 5, max: 90, step: 1, def: 38,
                   help: 'Plateau of the expired CO2 curve with normal circulation. Falls automatically when the simulated circulation stops (VF, asystole).' },
    fico2:       { group: 'physiology', label: 'Inspired CO2 (rebreathing)', unit: 'mmHg', type: 'num', min: 0, max: 15, step: 0.5, def: 0,
                   help: 'Baseline of the capnogram during inspiration. Above 0 = rebreathing of expired gas.' },
    airway_obstr:{ group: 'physiology', label: 'Expiratory airflow obstruction', unit: '%', type: 'num', min: 0, max: 100, step: 1, def: 0,
                   help: 'Slows the expiratory CO2 upstroke (time constant 0.035 → 0.385 of the breath): rounded "shark-fin" capnogram.' },
    temp:        { group: 'physiology', label: 'Core temperature', unit: '°C', type: 'num', min: 30, max: 43, step: 0.1, def: 37.0,
                   help: 'True temperature seen by the probe; the displayed value follows it with the sensor time constant.' },

    // ---- glucose–insulin model (src/sim/glucose.js) ----
    fasting_glucose:{ group: 'metabolic', label: 'Fasting glucose (start value)', unit: 'mg/dL', type: 'num', min: 50, max: 400, step: 1, def: 90,
                   help: 'Steady-state plasma glucose Gb the model starts at and returns to. Changing it restarts the glucose model. 1 mmol/L = 18.016 mg/dL.' },
    fasting_insulin:{ group: 'metabolic', label: 'Fasting insulin (display level)', unit: 'µU/mL', type: 'num', min: 2, max: 50, step: 1, def: 10,
                   help: 'Illustrative user-set level, not a reference value. Sets the insulin level shown and the endogenous secretion at fasting; only changes above this level act on glucose. Ignored for type 1 (no secretion). 1 µU/mL = 1 mU/L.' },
    basal_insulin:{ group: 'metabolic', label: 'Basal insulin infusion (subcutaneous)', unit: 'U/h', type: 'num', min: 0, max: 5, step: 0.05, def: 0,
                   help: 'Continuous subcutaneous insulin. The model starts in steady state at the current rate; changing it later lowers or raises glucose from there.' },

    // ---- sensor & artifacts ----
    ecg_noise_uv: { group: 'sensor', label: 'ECG broadband noise (SD)', unit: 'µV', type: 'num', min: 0, max: 300, step: 5, def: 15,
                   help: 'Gaussian noise (EMG / amplifier noise) added to the ECG.' },
    ecg_wander_mv:{ group: 'sensor', label: 'ECG baseline wander', unit: 'mV', type: 'num', min: 0, max: 1, step: 0.01, def: 0.05,
                   help: 'Respiration-coupled low-frequency baseline shift (electrode–skin and thoracic movement).' },
    mains_uv:    { group: 'sensor', label: 'Mains interference', unit: 'µV', type: 'num', min: 0, max: 300, step: 5, def: 0,
                   help: 'Amplitude of power-line interference at the selected mains frequency.' },
    mains_hz:    { group: 'sensor', label: 'Mains frequency', unit: 'Hz', type: 'sel', options: [50, 60], def: 50,
                   help: 'Power-line frequency (50 Hz in Türkiye/Europe, 60 Hz in the Americas). Also sets the notch filter frequency.' },
    contact:     { group: 'sensor', label: 'Electrode contact quality', unit: '%', type: 'num', min: 0, max: 100, step: 1, def: 100,
                   help: 'Lower contact raises noise and mains pickup (higher electrode impedance). Below 10 % the leads are reported OFF.' },
    ecg_dropout: { group: 'sensor', label: 'ECG dropouts', unit: '/min', type: 'num', min: 0, max: 20, step: 1, def: 0,
                   help: 'Mean number of short signal losses (0.3–1.5 s) per minute.' },
    spo2_sensor: { group: 'sensor', label: 'SpO2 probe state', type: 'sel', options: ['attached', 'probe-off', 'disconnected'], def: 'attached',
                   help: 'probe-off: light reaches the detector without tissue (DC jumps, no pulse). disconnected: no samples at all.' },
    ppg_noise:   { group: 'sensor', label: 'PPG detector noise', unit: '‰ DC', type: 'num', min: 0, max: 5, step: 0.05, def: 0.1,
                   help: 'Gaussian noise SD as per-mille of the DC light level. Fixed noise + low perfusion = poor SNR.' },
    motion:      { group: 'sensor', label: 'Motion artifact', unit: '%', type: 'num', min: 0, max: 100, step: 1, def: 0,
                   help: 'Common-mode optical artifact (both wavelengths), cuff pressure disturbance and impedance artifact.' },
    ppg_dropout: { group: 'sensor', label: 'PPG dropouts', unit: '/min', type: 'num', min: 0, max: 20, step: 1, def: 0,
                   help: 'Mean number of short PPG signal losses per minute.' },
    resp_noise:  { group: 'sensor', label: 'Impedance noise (SD)', unit: 'Ω', type: 'num', min: 0, max: 0.5, step: 0.01, def: 0.02,
                   help: 'Gaussian noise on the impedance pneumogram.' },
    cardiogenic: { group: 'sensor', label: 'Cardiogenic artifact', unit: '% of breath', type: 'num', min: 0, max: 60, step: 1, def: 10,
                   help: 'Heartbeat-synchronous impedance change (blood volume shifts) relative to the breath amplitude.' },
    resp_dropout:{ group: 'sensor', label: 'Respiration dropouts', unit: '/min', type: 'num', min: 0, max: 20, step: 1, def: 0,
                   help: 'Mean number of short impedance signal losses per minute.' },
    temp_sensor: { group: 'sensor', label: 'Temperature probe state', type: 'sel', options: ['ok', 'unavailable', 'error'], def: 'ok',
                   help: 'unavailable: no probe connected (value missing). error: probe reports an implausible value (rejected).' },
    temp_tau:    { group: 'sensor', label: 'Temperature probe time constant', unit: 's', type: 'num', min: 1, max: 120, step: 1, def: 20,
                   help: 'First-order sensor lag τ: reading reaches 63 % of a step change after τ seconds.' },
    capno_sensor:{ group: 'sensor', label: 'CO2 sampling line', type: 'sel', options: ['ok', 'disconnected'], def: 'ok',
                   help: 'disconnected: no CO2 samples (technical alarm, EtCO2 missing).' },
    ibp_line:    { group: 'sensor', label: 'Arterial line state', type: 'sel', options: ['connected', 'open-to-air'], def: 'connected',
                   help: 'open-to-air: the transducer sees atmospheric pressure (as during zeroing), so the trace drops to 0 mmHg.' },
    ibp_damping: { group: 'sensor', label: 'Arterial line damping', type: 'sel', options: ['optimal', 'under-damped', 'over-damped'], def: 'optimal',
                   help: 'Catheter–tubing–transducer modelled as a 2nd-order system. optimal: fn 20 Hz, ζ 0.6. under-damped: fn 6 Hz, ζ 0.1 (ringing, systolic overshoot). over-damped: fn 4 Hz, ζ 1.5 (blunted, e.g. air bubble). On Gardner\'s fn–ζ chart [25] the optimal setting is adequate and the other two are unacceptable. MAP is kept in all three (unity DC gain).' },
    ibp_height_cm:{ group: 'sensor', label: 'Transducer height vs. heart level', unit: 'cm', type: 'num', min: -30, max: 30, step: 1, def: 0,
                   help: 'Positive = transducer above the phlebostatic axis: every reading drops by 0.736 mmHg per cm (hydrostatic column). Negative reads high.' },
    nibp_deflate:{ group: 'sensor', label: 'Cuff deflation rate', unit: 'mmHg/s', type: 'num', min: 2, max: 8, step: 0.5, def: 3,
                   help: 'Linear bleed rate. Faster = fewer beats per measurement = coarser envelope.' },

    // ---- processing & display ----
    ecg_fs:      { group: 'processing', label: 'ECG sampling frequency', unit: 'Hz', type: 'sel', options: [125, 250, 500, 1000], def: 250,
                   help: 'Output sampling rate of the acquired ECG (decimated from a 1 kHz model).' },
    ecg_filter:  { group: 'processing', label: 'ECG display filter', type: 'sel', options: ['monitor', 'diagnostic', 'off'], def: 'monitor',
                   help: 'monitor: 0.5–40 Hz band-pass. diagnostic: 0.05–150 Hz (capped below Nyquist). off: unfiltered.' },
    notch:       { group: 'processing', label: 'Mains notch filter', type: 'sel', options: ['on', 'off'], def: 'on',
                   help: 'Second-order notch (Q = 30) at the mains frequency, applied to the displayed ECG.' },
    spo2_avg:    { group: 'processing', label: 'SpO2 averaging time', unit: 's', type: 'sel', options: [2, 4, 8, 16], def: 8,
                   help: 'Number of 1-s ratio-of-ratios estimates averaged for display. Longer = steadier but slower response.' },
    resp_thr:    { group: 'processing', label: 'Breath detection threshold', unit: 'Ω', type: 'num', min: 0.02, max: 1, step: 0.01, def: 0.2,
                   help: 'Hysteresis level on the band-passed impedance. Too high misses shallow breaths; too low counts cardiogenic artifact.' },
    apnea_delay: { group: 'processing', label: 'Apnea detection delay', unit: 's', type: 'num', min: 10, max: 60, step: 1, def: 20,
                   help: 'Time without a detected breath before apnea is declared.' },
    nibp_interval:{ group: 'processing', label: 'NIBP auto interval', unit: 'min', type: 'sel', options: [0, 1, 2, 5, 15], def: 5,
                   help: '0 = manual start only. Otherwise a measurement starts automatically at this interval (simulation time).' },
    nibp_ks:     { group: 'processing', label: 'Systolic ratio Ks', unit: '', type: 'num', min: 0.3, max: 0.8, step: 0.01, def: 0.55,
                   help: 'SBP = cuff pressure above the maximum where oscillation amplitude falls to Ks × maximum.' },
    nibp_kd:     { group: 'processing', label: 'Diastolic ratio Kd', unit: '', type: 'num', min: 0.4, max: 0.95, step: 0.01, def: 0.55,
                   help: 'DBP = cuff pressure below the maximum where oscillation amplitude falls to Kd × maximum.' },
    sweep:       { group: 'processing', label: 'Sweep speed', unit: 'mm/s', type: 'sel', options: [6.25, 12.5, 25, 50], def: 25,
                   help: 'Horizontal scale of the waveforms (screen calibration assumed 96 dpi).' },
    ecg_gain:    { group: 'processing', label: 'ECG gain', unit: 'mm/mV', type: 'sel', options: [5, 10, 20], def: 10,
                   help: 'Vertical scale of the ECG trace.' },
    glu_clock:   { group: 'processing', label: 'Glucose model time scale', unit: '×', type: 'sel', options: [1, 10, 60], def: 60,
                   help: 'Glucose model minutes per simulated minute. 60 = one simulated second advances the glucose model one minute, so a meal response is visible in a few minutes. The other signals keep their own time.' },
    speed:       { group: 'processing', label: 'Playback speed', unit: '×', type: 'sel', options: [0.25, 0.5, 1, 2, 4], def: 1,
                   help: 'Simulation time per real second. All rates stay correct in simulation time.' },
    seed:        { group: 'processing', label: 'Random seed', unit: '', type: 'num', min: 1, max: 999999, step: 1, def: 2026,
                   help: 'Seed for all noise sources; same seed + same settings = same run.' },
  };

  const DEFAULTS = Object.freeze(Object.fromEntries(Object.entries(SPEC).map(([k, s]) => [k, s.def])));

  /**
   * Validate a partial update against SPEC and the current parameter set.
   * Returns { params, errors: [{key,msg}], warnings: [{key,msg}] }.
   * Invalid values are rejected (old value kept); out-of-range numbers are clamped with a warning.
   */
  function validate(current, update) {
    const next = Object.assign({}, current);
    const errors = [], warnings = [];
    for (const [k, raw] of Object.entries(update || {})) {
      const s = SPEC[k];
      if (!s) { errors.push({ key: k, msg: 'unknown parameter' }); continue; }
      if (s.type === 'sel') {
        const opt = s.options.find(o => String(o) === String(raw));
        if (opt === undefined) errors.push({ key: k, msg: 'must be one of ' + s.options.join(', ') });
        else next[k] = opt;
        continue;
      }
      const v = typeof raw === 'string' ? (raw.trim() === '' ? NaN : Number(raw)) : raw;
      if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push({ key: k, msg: 'not a number' }); continue; }
      if (v < s.min || v > s.max) {
        warnings.push({ key: k, msg: 'clamped to ' + s.min + '–' + s.max + ' ' + (s.unit || '') });
        next[k] = Math.min(s.max, Math.max(s.min, v));
      } else next[k] = v;
    }
    if (next.dbp > next.sbp - 10) {
      errors.push({ key: 'dbp', msg: 'diastolic must be at least 10 mmHg below systolic' });
      next.sbp = current.sbp; next.dbp = current.dbp;
    }
    return { params: next, errors, warnings };
  }

  // Disease and condition groups of the scenario menu, in menu order. Every built-in
  // preset names one in "group"; community scenarios get their own menu group.
  const SCENARIO_GROUPS = [
    { id: 'basic', label: 'Single vital-sign changes' },
    { id: 'sensor', label: 'Sensor and signal artefacts' },
    { id: 'rhythm', label: 'Heart rhythm' },
    { id: 'cardio', label: 'Heart and circulation' },
    { id: 'shock', label: 'Bleeding, shock and sepsis' },
    { id: 'resp', label: 'Lungs and airway' },
    { id: 'neuro', label: 'Brain and nerves' },
    { id: 'metabolic', label: 'Metabolic, endocrine and electrolytes' },
    { id: 'temp', label: 'Temperature, drugs and poisoning' },
    { id: 'periop', label: 'Anaesthesia and after surgery' },
    { id: 'obstetric', label: 'Pregnancy and birth' },
    { id: 'arrest', label: 'Deterioration and cardiac arrest' },
  ];

  // Each preset = baseline defaults + listed changes. Fictional scenarios for teaching
  // signal behaviour; names describe the parameter pattern, not a diagnosis.
  const PRESETS = [
    { id: 'baseline', group: 'basic', name: 'Baseline adult', changes: {}, refs: [80, 78, 145, 144],
      note: 'Healthy resting adult. Adult resting pulse stays about 72/min across ages [80]; blood pressure sits near the population mean [78]; 37.0 °C lies inside the 95 % range of normal temperature (35.7–37.3 °C, mean 36.6 °C) [145]. Respiratory rate is the vital sign most often left unrecorded, yet an abnormal rate predicts serious events [144].' },
    { id: 'tachy', group: 'basic', name: 'Tachycardia (fast rate)', changes: { hr: 135 }, refs: [55],
      note: 'Sinus rhythm at 135/min: P waves stay visible before each QRS. A fast regular rate alone does not name its cause (fever, pain, bleeding, anxiety); compare the SVT pattern, where P waves are hidden [55].' },
    { id: 'brady', group: 'basic', name: 'Bradycardia (slow rate)', changes: { hr: 42 }, refs: [136],
      note: 'Sinus rhythm at 42/min. Whether a slow rate needs action depends on symptoms and cause, as the bradycardia guideline sets out [136]; fit athletes can rest this low (compare the athlete profile pattern).' },
    { id: 'irregular', group: 'basic', name: 'Irregular beat timing', changes: { rhythm: 'irregular', hr: 95 }, refs: [146, 135],
      note: 'Teaching pattern for the RR-variability detector: beat timing varies but P waves remain, so this is not AF. RR-interval variability is the basis of automatic AF detection [146]; for real AF (no P waves, irregular) use the AF scenario [135].' },
    { id: 'desat', group: 'basic', name: 'Desaturation', changes: { spo2: 84 }, refs: [42],
      note: 'SpO2 84 % with everything else normal. Even in patients at risk of CO2 retention the oxygen target is 88–92 % [42], so this is below every usual target. Check the probe and the plethysmogram before believing a low reading.' },
    { id: 'hypotension', group: 'basic', name: 'Low blood pressure', changes: { sbp: 80, dbp: 46 }, refs: [127, 31],
      note: 'Systolic 80 mmHg: below the < 90 mmHg definition used for post-induction hypotension [127] and below the qSOFA cut-off of ≤ 100 mmHg [31]. The cause (bleeding, sepsis, drugs, heart failure) is not shown by the pressure alone.' },
    { id: 'hypertension', group: 'basic', name: 'High blood pressure', changes: { sbp: 175, dbp: 105 }, refs: [105],
      note: 'High pressure (175/105 mmHg) without other changes. It stays below the > 180/> 120 mmHg level that, together with new organ damage, defines a hypertensive emergency [105]; compare the hypertensive-emergency scenario.' },
    { id: 'tachypnea', group: 'basic', name: 'Fast breathing', changes: { rr: 32 }, refs: [144, 31, 99],
      note: 'Respiratory rate 32/min. An abnormal rate predicts serious events [144]; ≥ 22/min counts in qSOFA [31] and ≥ 30/min in CURB-65 [99]. Breath depth is not shown.' },
    { id: 'bradypnea', group: 'basic', name: 'Slow breathing', changes: { rr: 7 }, refs: [144, 104, 66],
      note: 'Respiratory rate 7/min. Slow breathing is a key sign of opioid toxicity [104], and post-operative respiratory depression was judged mostly preventable with better monitoring of ventilation [66]. EtCO2 is left normal here; compare the hypoventilation scenarios.' },
    { id: 'fever', group: 'basic', name: 'Temperature elevation', changes: { temp: 38.9 }, refs: [137, 145, 31],
      note: 'Temperature 38.9 °C, well above the normal range (95 % range up to 37.3 °C) [145] and above the SIRS threshold of 38 °C [31]. Fever has many infectious and non-infectious causes, so it calls for clinical assessment, not a diagnosis by number [137].' },
    { id: 'disconnect', group: 'sensor', name: 'Sensor disconnection', changes: { spo2_sensor: 'disconnected', contact: 5 }, refs: [139, 15],
      note: 'SpO2 probe off and ECG electrodes almost off: the monitor raises technical alarms, not physiological ones [15]. Technical alarms made up 791,632 of 2,558,760 alarms in one ICU study [139].' },
    { id: 'motion', group: 'sensor', name: 'Motion artifact', changes: { motion: 70 }, refs: [138],
      note: 'Patient movement at 70 % artefact strength. Motion causes data loss, inaccurate readings and false alarms in pulse oximetry [138]: here SpO2 reads falsely low and the cuff may fail, while the true saturation is normal.' },
    { id: 'noisy-ecg', group: 'sensor', name: 'Noisy ECG', changes: { ecg_noise_uv: 120, mains_uv: 80, ecg_wander_mv: 0.4, contact: 60 }, refs: [71, 27, 139],
      note: 'Muscle noise, mains hum, baseline wander and poor electrode contact. Filters trade noise against waveform fidelity (diagnostic bandwidth 0.05–150 Hz [71]); clinical detectors are tested on annotated ECG databases [27]. In one ICU study 88.8 % of annotated arrhythmia alarms were false positives [139].' },
    { id: 'missing', group: 'sensor', name: 'Missing observations', changes: { ecg_dropout: 6, ppg_dropout: 6, resp_dropout: 6, temp_sensor: 'unavailable' }, refs: [139, 15],
      note: 'Short gaps in the ECG, plethysmogram and respiration signals and no temperature probe. Missing data must show as missing, not as zero or the last value; technical alarms flag them [15]. Technical alarms were nearly a third of all alarms in one ICU study [139].' },
    { id: 'apnea', group: 'basic', name: 'Apnea demonstration', changes: { rr: 0 }, refs: [35, 142],
      note: 'No breaths: the capnogram goes flat and the impedance trace stops, and the apnea alarm fires after its delay. Capnography detects a breathing problem before oximetry does [35]; exhaled CO2 monitoring is the basic check of ventilation [142].' },
    { id: 'af', group: 'rhythm', name: 'AF pattern (irregular, no P waves)', changes: { arrhythmia: 'af', hr: 110 }, refs: [135, 146],
      note: 'Irregularly irregular rhythm with no P waves at 110/min, just above the lenient rate-control target of < 110/min [135]. The analyser flags AF from RR-interval variability, the approach of automatic AF detection [146].' },
    { id: 'svt', group: 'rhythm', name: 'SVT pattern (regular narrow-QRS tachycardia)', changes: { arrhythmia: 'svt', hr: 180, hrv_ms: 3, sbp: 106, dbp: 72 }, refs: [55, 56],
      note: 'Narrow complexes at a fast, very regular rate with no visible P wave (hidden in the QRS, as in typical AV-nodal re-entry). The slightly low blood pressure is illustrative; many patients stay stable. The analyser uses rate, width and regularity only, so it cannot tell this from a fast sinus rhythm.' },
    { id: 'pvc', group: 'rhythm', name: 'Frequent PVCs', changes: { arrhythmia: 'pvc', pvc_per_min: 14 }, refs: [140, 141, 139],
      note: 'Fourteen PVCs per minute. PVCs are common on long-term monitoring and often harmless, though a high burden may raise the risk of heart failure [140]; ventricular arrhythmia care follows the guideline [141]. PVCs were among the non-actionable alarm causes in ICU alarm data [139].' },
    { id: 'vt', group: 'rhythm', name: 'V-Tach pattern', changes: { arrhythmia: 'vt', hr: 170, sbp: 85, dbp: 55 }, refs: [141, 60, 139],
      note: 'Wide-complex tachycardia at 170/min with low pressure. Ventricular tachycardia is covered by the ventricular-arrhythmia guideline [141] and, with poor output, by advanced life support [60]. In ICU alarm data most true VT alarms were short runs that did not need treatment [139], so the duration matters.' },
    { id: 'vf', group: 'rhythm', name: 'V-Fib pattern (no output)', changes: { arrhythmia: 'vf' }, refs: [60, 141],
      note: 'Chaotic ventricular activity with no output: a cardiac arrest rhythm, managed by advanced life support [60] and a main cause of sudden cardiac death [141]. Pressure, pulse oximetry and EtCO2 lose their pulsatile signals.' },
    { id: 'asystole', group: 'rhythm', name: 'Asystole pattern', changes: { arrhythmia: 'asystole' }, refs: [60],
      note: 'No electrical activity and no output: a cardiac arrest rhythm managed by advanced life support [60]. A flat line can also be a disconnected lead, so check the leads and the gain.' },
    { id: 'hypovent', group: 'resp', name: 'Hypoventilation on room air (high EtCO2)', changes: { rr: 6, etco2: 58, spo2: 92 }, refs: [34, 35],
      note: 'On room air a high CO2 lowers alveolar O2 (alveolar gas equation: PAO2 ≈ 150 − PaCO2/0.8 ≈ 75 mmHg), so SpO2 falls a little. Compare the O2-masked pattern.' },
    { id: 'bronchospasm', group: 'resp', name: 'Obstructed expiration', changes: { airway_obstr: 80, rr: 22 }, refs: [35, 147],
      note: 'Expiratory airflow obstruction: the capnogram loses its square shape and the plateau slopes up; capnography shows the prolonged expiratory phase of bronchospasm [35]. The shape of the capnogram tracks bronchospasm severity (FEV1) [147].' },
    { id: 'rebreathing', group: 'periop', name: 'CO2 rebreathing', changes: { fico2: 6, etco2: 46 }, refs: [148, 142, 26],
      note: 'Inspired CO2 above zero raises the capnogram baseline, so the waveform no longer returns to zero, and end-tidal CO2 rises. One reported cause is a malfunctioning expiratory valve in the breathing circuit [148]. Inspired and end-tidal CO2 follow the vocabulary of [26]; see also [142].' },
    { id: 'underdamped', group: 'sensor', name: 'Under-damped arterial line', changes: { ibp_damping: 'under-damped' }, refs: [25],
      note: 'fn 6 Hz with ζ 0.1 lies in the unacceptable (under-damped) zone of Gardner\'s fn–ζ chart: the systolic reading overshoots. A fast-flush test would show many oscillations.' },
    { id: 'transducer', group: 'sensor', name: 'Transducer too high', changes: { ibp_height_cm: 20 }, refs: [143],
      note: 'Transducer 20 cm above heart level: every arterial reading is about 15 mmHg too low (7.5 mmHg per 10 cm [143]). The patient is unchanged; level the transducer to the phlebostatic axis and re-zero. The cuff (NIBP) is not affected.' },

    // Combined-sign teaching patterns from the literature. "refs" are entry numbers in
    // REFERENCES.md. Where a source gives only a direction (up/down), the number is an
    // illustrative choice inside that direction; see TECHNICAL_REPORT.md section 3.12.
    { id: 'haem-2', group: 'shock', name: 'Blood-loss pattern, ATLS class II', changes: { hr: 110, sbp: 118, dbp: 92, rr: 24 }, refs: [28, 29],
      note: 'Fast heart rate and a narrow pulse pressure while systolic pressure is still normal. Ranges from the ATLS 9th edition table as quoted in [28]; the 10th edition dropped the numeric HR and RR ranges.' },
    { id: 'haem-3', group: 'shock', name: 'Blood-loss pattern, ATLS class III', changes: { hr: 130, sbp: 88, dbp: 68, rr: 32, pi: 0.8 }, refs: [28, 29, 30],
      note: 'Systolic pressure now falls; low perfusion index. Only a minority of real trauma patients fit an ATLS class.' },
    { id: 'sepsis-screen', group: 'shock', name: 'Infection-screening pattern (SIRS / qSOFA thresholds)', changes: { hr: 112, rr: 24, sbp: 96, dbp: 58, temp: 38.7 }, refs: [31],
      note: 'Several moderate changes cross screening thresholds together. Screening thresholds are not a diagnosis.' },
    { id: 'anaphylaxis', group: 'shock', name: 'Acute allergic-reaction pattern', changes: { sbp: 78, dbp: 42, hr: 128, spo2: 90, airway_obstr: 60, rr: 24, etco2: 30 }, refs: [32, 33, 35],
      note: 'Hypotension, tachycardia, falling SpO2 and an obstructive capnogram together. Skin signs cannot be shown.' },
    { id: 'hypovent-o2', group: 'resp', name: 'Hypoventilation masked by supplemental O2', changes: { rr: 7, etco2: 55 }, refs: [34, 35],
      note: 'EtCO2 rises while SpO2 stays normal: capnography shows the problem first.' },
    { id: 'dka-pattern', group: 'metabolic', name: 'Hyperglycaemic-crisis pattern (DKA-type)', changes: { diabetes: 'type1', fasting_glucose: 320, rr: 28, etco2: 24, hr: 115, sbp: 102, dbp: 64 }, refs: [35, 36, 51, 81],
      note: 'Type 1 without insulin: glucose above 250 mg/dL (2024 consensus criterion ≥ 200 mg/dL or known diabetes [81]; 250 in the 2009 criteria [36]) with compensatory fast breathing and low EtCO2. Ketones and pH are not modelled.' },
    { id: 'pe-pattern', group: 'cardio', name: 'Dead-space pattern (PE-type)', changes: { hr: 115, spo2: 89, sbp: 105, dbp: 70, etco2: 30, rr: 24 }, refs: [37, 38],
      note: 'Low EtCO2 here comes from added alveolar dead space, which widens the PaCO2 − EtCO2 gap. Fast breathing lowers EtCO2 too, so the monitor alone cannot tell them apart; only a blood gas shows the gap.' },
    { id: 'hypothermia', group: 'temp', name: 'Cold-exposure pattern (hypothermia stage II)', changes: { temp: 30.5, hr: 45, sbp: 92, dbp: 58, rr: 9, pi: 0.3 }, refs: [39],
      note: 'Slowed vital signs and a weak pleth from vasoconstriction. Osborn waves are not modelled.' },
    { id: 'mh-early', group: 'temp', name: 'Hypermetabolic pattern, early (MH-type)', changes: { etco2: 60, hr: 125, rr: 12, temp: 37.6 }, refs: [40, 41],
      note: 'EtCO2 climbs at a fixed ventilator rate before temperature rises.' },
    { id: 'mh-late', group: 'temp', name: 'Hypermetabolic pattern, late (MH-type)', changes: { etco2: 75, hr: 145, rr: 12, temp: 39.5, arrhythmia: 'pvc' }, refs: [40, 41],
      note: 'Temperature now rises and ectopic beats appear.' },
    { id: 'copd', group: 'resp', name: 'Obstructive hypercapnic pattern (COPD-type)', changes: { spo2: 89, etco2: 52, airway_obstr: 60, rr: 24, hr: 100 }, refs: [35, 42],
      note: 'Shark-fin capnogram with high EtCO2. An SpO2 near 90 % can be a deliberate target in this group.' },
    { id: 'hyperk-early', group: 'metabolic', name: 'Raised-potassium ECG, early', changes: { t_scale: 1.9 }, refs: [43],
      note: 'Peaked T waves first. ECG changes track potassium levels poorly.' },
    { id: 'hyperk-late', group: 'metabolic', name: 'Raised-potassium ECG, late', changes: { t_scale: 1.9, p_scale: 0.3, qrs_width: 1.7 }, refs: [43],
      note: 'Then flattened P waves and a wide QRS.' },
    { id: 'cushing', group: 'neuro', name: 'Raised-ICP reflex pattern (Cushing)', changes: { sbp: 200, dbp: 90, hr: 46, rr: 8 }, refs: [44],
      note: 'High pressure with a slow heart rate, the opposite of shock. Irregular breathing cannot be set.' },
    { id: 'deteriorating', group: 'arrest', name: 'Pre-arrest deterioration (hours before)', changes: { rr: 31, spo2: 88, hr: 122, sbp: 86, dbp: 52, etco2: 30 }, refs: [57, 58, 59],
      note: 'Fast breathing, falling SpO2, rising heart rate and low blood pressure: the antecedents most often recorded in the hours before an in-hospital arrest. Several moderate alarms together matter more than any single one. A falling level of consciousness, the other common sign, cannot be shown.' },
    { id: 'periarrest', group: 'arrest', name: 'Peri-arrest (minutes before arrest)', changes: { rr: 4, spo2: 68, hr: 36, sbp: 60, dbp: 32, etco2: 18, pi: 0.15 }, refs: [59, 60],
      note: 'Exhausted breathing, severe hypoxaemia, bradycardia and a very low pressure. EtCO2 is low because little blood reaches the lungs, although arterial CO2 is high. The next step is arrest: choose Asystole or V-Fib. Pulseless electrical activity (an ECG with no output) is not modelled.' },
    { id: 'stroke', group: 'neuro', name: 'Acute stroke pattern (high blood pressure)', changes: { sbp: 192, dbp: 104, hr: 84, spo2: 96 }, refs: [61, 62],
      note: 'Blood pressure is raised in most patients arriving with stroke; 185/110 mmHg is the upper limit before clot-dissolving treatment. The monitor cannot show the neurological deficit and cannot tell an ischaemic from a haemorrhagic stroke (that needs imaging). For atrial fibrillation as the cause, use the AF scenario.' },
    { id: 'hf-oedema', group: 'cardio', name: 'Heart failure: acute pulmonary oedema (warm-wet)', changes: { sbp: 178, dbp: 102, hr: 118, rr: 32, spo2: 86, etco2: 32 }, refs: [63, 64],
      note: 'Congested but well perfused: high pressure, fast breathing and hypoxaemia from fluid in the lungs. Crackles, orthopnoea and oedema cannot be shown.' },
    { id: 'hf-cold-wet', group: 'cardio', name: 'Heart failure: low output with congestion (cold-wet)', changes: { sbp: 92, dbp: 74, hr: 112, rr: 26, spo2: 90, pi: 0.5 }, refs: [63, 64],
      note: 'Congested and poorly perfused: the pulse pressure is narrow (18 of 92 mmHg, under 25 %) and the perfusion index is low. No default alarm fires, although this is the highest-risk profile: pulse pressure and perfusion index have no alarm. Cool skin, drowsiness and falling urine output cannot be shown.' },
    { id: 'cardiogenic-shock', group: 'cardio', name: 'Heart failure: cardiogenic shock (SCAI stage C)', changes: { sbp: 76, dbp: 50, hr: 118, rr: 28, spo2: 88, etco2: 28, pi: 0.3 }, refs: [63, 65],
      note: 'Hypotension with hypoperfusion. The vital signs look like the blood-loss pattern; the difference is congestion and a failing pump, which need examination, lactate and echocardiography. Venous pressure is not modelled, so right-ventricular failure cannot be shown.' },
    { id: 'postop-opioid', group: 'periop', name: 'Post-operative: opioid respiratory depression (ward, room air)', changes: { rr: 6, spo2: 86, etco2: 62, hr: 58, sbp: 104, dbp: 62 }, refs: [66, 34, 35],
      note: 'Slow breathing, CO2 retention and then desaturation, most often within 24 h of surgery. Sedation came first in most reported cases but cannot be shown. With supplemental oxygen SpO2 would stay normal; compare the masked-hypoventilation scenario.' },
    { id: 'postop-hypothermia', group: 'periop', name: 'Post-operative: hypothermia with shivering', changes: { temp: 35.2, hr: 96, motion: 35, pi: 0.8 }, refs: [67],
      note: 'Unwarmed anaesthetised patients typically lose 1–2 °C. Vasoconstriction lowers the perfusion index; shivering is shown with the motion control. The SpO2 of about 85 % is an artefact (set saturation 97 %): motion pulls the red/infrared ratio towards 1, and this simple quality index does not flag it.' },
    { id: 'postop-ppc', group: 'periop', name: 'Post-operative: pulmonary complication (atelectasis type)', changes: { spo2: 89, rr: 26, hr: 104, etco2: 34 }, refs: [68],
      note: 'Low SpO2 and fast breathing in the days after surgery. The monitor cannot tell atelectasis from pneumonia or pulmonary embolism (compare the PE-type scenario); that needs examination and imaging.' },

    // Disease and condition scenarios added after v1.6.0 (REFERENCES.md entries 96–135 and
    // earlier entries). Numbers are illustrative choices inside the ranges or directions the
    // sources give. Each note says what the monitor cannot show.
    { id: 'athlete', group: 'basic', name: 'Trained-athlete resting pattern (sinus bradycardia)', changes: { hr: 44, hrv_ms: 90, rr: 10 }, refs: [108],
      note: 'A slow, variable sinus rate at rest is a normal training effect; the athlete ECG criteria accept sinus bradycardia down to 30 bpm. The default low-rate alarm still fires, so an alarm is not a diagnosis. Fitness history and symptoms cannot be shown.' },
    { id: 'af-rvr', group: 'rhythm', name: 'AF with fast ventricular rate', changes: { arrhythmia: 'af', hr: 160, sbp: 92, dbp: 60 }, refs: [135],
      note: 'Irregular rhythm without P waves at a fast rate, with a falling pressure from short filling times. The initial rate-control target is a resting rate under 110 bpm. The monitor cannot tell how long AF has lasted, which decides whether early cardioversion is safe.' },
    { id: 'hypertensive-emergency', group: 'cardio', name: 'Hypertensive-emergency pattern', changes: { sbp: 220, dbp: 130, hr: 96 }, refs: [105],
      note: 'Above 180 and/or 120 mmHg. It is an emergency only with new or worsening organ damage (brain, heart, kidney, eyes); the same numbers without it are an urgency. The monitor cannot show organ damage.' },
    { id: 'aortic-regurgitation', group: 'cardio', name: 'Wide pulse-pressure pattern (aortic-regurgitation-type)', changes: { sbp: 160, dbp: 45, hr: 88 }, refs: [106],
      note: 'High systolic and very low diastolic pressure: blood leaks back into the heart in diastole. The bounding pulse behind the classic eponymous signs is visible in the arterial and pleth traces; most of those signs have poor specificity. The diastolic murmur and echocardiography cannot be shown.' },
    { id: 'tamponade', group: 'cardio', name: 'Pericardial tamponade pattern', changes: { hr: 125, sbp: 84, dbp: 66, rr: 26, ecg_amp_mv: 0.5 }, refs: [107],
      note: 'Fast rate, low and narrow pressure, small QRS complexes. Pulsus paradoxus (an inspiratory fall in systolic pressure over 10 mmHg), electrical alternans and raised venous pressure are not modelled; echocardiography makes the diagnosis.' },
    { id: 'pe-high-risk', group: 'cardio', name: 'Dead-space pattern with shock (high-risk PE-type)', changes: { sbp: 82, dbp: 54, hr: 130, spo2: 84, etco2: 22, rr: 30 }, refs: [37, 38],
      note: 'The PE-type pattern with haemodynamic instability (systolic under 90 mmHg), which defines high-risk PE. The low EtCO2 reflects dead space and low cardiac output; only a blood gas shows the PaCO2–EtCO2 gap. Right-ventricular strain needs echocardiography or CT.' },
    { id: 'haem-1', group: 'shock', name: 'Blood-loss pattern, ATLS class I', changes: { hr: 90, rr: 18 }, refs: [28, 29],
      note: 'Up to about 15 % blood loss: vital signs stay nearly normal. A monitor alone misses early bleeding; the trend and the history matter.' },
    { id: 'haem-4', group: 'shock', name: 'Blood-loss pattern, ATLS class IV', changes: { hr: 145, sbp: 68, dbp: 50, rr: 38, pi: 0.3 }, refs: [28, 29, 30],
      note: 'Over 40 % loss: heart rate over 140, low pressure, very fast breathing and almost no peripheral perfusion. Only a minority of real trauma patients fit an ATLS class. Mental state and urine output cannot be shown.' },
    { id: 'septic-shock', group: 'shock', name: 'Septic-shock pattern (vasodilated)', changes: { hr: 125, sbp: 82, dbp: 40, temp: 39.2, rr: 28, pi: 4 }, refs: [31, 73],
      note: 'Low diastolic pressure and a mean pressure under 65 mmHg with warm, well-perfused fingers (high perfusion index): vasodilatation, not blood loss. Sepsis-3 septic shock also needs a vasopressor requirement and lactate over 2 mmol/L, which cannot be shown.' },
    { id: 'neurogenic-shock', group: 'shock', name: 'Neurogenic-shock pattern (low pressure, slow rate)', changes: { sbp: 82, dbp: 44, hr: 48 }, refs: [96],
      note: 'After a cervical or high thoracic cord injury the sympathetic outflow is lost: low pressure without the fast heart rate of blood loss. Studies use different blood-pressure and heart-rate cut-offs, so the reported incidence varies. The cord injury itself cannot be shown, and bleeding can coexist.' },
    { id: 'vasovagal', group: 'shock', name: 'Reflex-syncope pattern (vasovagal)', changes: { hr: 40, sbp: 72, dbp: 40 }, refs: [97],
      note: 'A sudden drop in heart rate (cardioinhibitory) and pressure (vasodepressor), usually short and self-limiting when the patient lies flat. The trigger, the prodrome and the brief loss of consciousness cannot be shown.' },
    { id: 'asthma-severe', group: 'resp', name: 'Acute severe asthma pattern', changes: { rr: 28, hr: 118, spo2: 93, airway_obstr: 85, etco2: 32 }, refs: [98, 35],
      note: 'Respiratory rate ≥ 25 and heart rate ≥ 110 meet the BTS/SIGN acute-severe criteria; the capnogram has a steep shark-fin shape and EtCO2 is low from fast breathing. Peak flow and the inability to complete sentences cannot be shown.' },
    { id: 'asthma-life', group: 'resp', name: 'Life-threatening asthma pattern (tiring)', changes: { spo2: 88, etco2: 42, rr: 14, hr: 100, sbp: 96, dbp: 60, airway_obstr: 95 }, refs: [98, 35],
      note: 'SpO2 under 92 % and a CO2 back in the "normal" range as the patient tires: a falling rate here is a danger sign, not improvement. EtCO2 underestimates arterial CO2 in severe obstruction. A silent chest and exhaustion cannot be shown.' },
    { id: 'pneumonia', group: 'resp', name: 'Severe pneumonia pattern (CURB-65 ≥ 3)', changes: { age_years: 72, rr: 30, sbp: 104, dbp: 58, hr: 108, temp: 38.6, spo2: 91 }, refs: [99],
      note: 'Age ≥ 65, respiratory rate ≥ 30 and diastolic ≤ 60 mmHg give 3 CURB-65 points from the monitor alone. Confusion and urea, the other two points, cannot be shown, and neither can the chest X-ray.' },
    { id: 'ards', group: 'resp', name: 'Severe hypoxaemic failure pattern (ARDS-type)', changes: { rr: 30, spo2: 87, etco2: 40, hr: 110 }, refs: [100, 72],
      note: 'Low SpO2 with fast breathing. The Berlin severity grades need PaO2/FiO2 from a blood gas and the ventilator setting; SpO2 cannot give them, and bilateral opacities need imaging.' },
    { id: 'tension-ptx', group: 'resp', name: 'Tension-pneumothorax pattern (ventilated)', changes: { hr: 135, sbp: 74, dbp: 48, spo2: 82, etco2: 25 }, refs: [101],
      note: 'In ventilated patients hypoxia was found in 92 % and hypotension and arrest were far more common than in those breathing on their own. EtCO2 falls as cardiac output falls. Absent breath sounds, tracheal shift and rising airway pressure cannot be shown.' },
    { id: 'hyperventilation', group: 'resp', name: 'Hyperventilation pattern (low CO2, normal SpO2)', changes: { rr: 30, etco2: 22, hr: 108, spo2: 99 }, refs: [102, 35],
      note: 'Fast breathing blows off CO2. The monitor shows the same low EtCO2 as compensation for acidosis (compare the DKA-type scenario); only a blood gas tells primary hyperventilation from metabolic acidosis or a pulmonary embolism.' },
    { id: 'tbi', group: 'neuro', name: 'Brain injury with secondary insults (hypotension, hypoxia)', changes: { sbp: 88, dbp: 52, hr: 105, spo2: 88, rr: 10, etco2: 48 }, refs: [109, 110],
      note: 'A systolic pressure under 90 mmHg or hypoxia after head injury raised mortality; current guidance aims for ≥ 100–110 mmHg. A late rising pressure with a slowing heart rate is the Cushing pattern. Consciousness level and pupils cannot be shown.' },
    { id: 'seizure', group: 'neuro', name: 'Generalised seizure pattern (artefact-dominated)', changes: { hr: 140, sbp: 170, dbp: 100, motion: 80, spo2: 88, temp: 38.2, ecg_noise_uv: 150 }, refs: [111],
      note: 'Muscle activity swamps the ECG and the pleth, so the rate and SpO2 readings are unreliable; treat after 5 minutes of continuous seizure. The monitor cannot show seizure activity itself; that needs observation or EEG.' },
    { id: 'autonomic-dysreflexia', group: 'neuro', name: 'Autonomic-dysreflexia pattern (high spinal cord injury)', changes: { sbp: 190, dbp: 105, hr: 52 }, refs: [112],
      note: 'A sudden rise of at least 20 mmHg above baseline, often with a slow heart rate, in injuries at or above T6, usually triggered by a full bladder or bowel. Resting pressure in these patients is often low, so a reading that looks modest can already be a crisis. Headache and flushing cannot be shown.' },
    { id: 'neuromuscular-failure', group: 'neuro', name: 'Neuromuscular respiratory failure pattern (GBS-type)', changes: { rr: 30, resp_amp: 0.6, etco2: 46, spo2: 95, hr: 112 }, refs: [113],
      note: 'Rapid, shallow breaths (small impedance swings) while SpO2 is still normal: oxygenation fails late. Breaths shallower than the detector threshold would read as apnea. Vital capacity under 20 mL/kg and mouth pressures predict the need for ventilation; the monitor cannot measure them.' },
    { id: 'hypoglycaemia', group: 'metabolic', name: 'Low-glucose pattern (level 2 hypoglycaemia)', changes: { diabetes: 'type1', fasting_glucose: 50, hr: 110, sbp: 150 }, refs: [51],
      note: 'Glucose under 54 mg/dL with an adrenergic response (fast heart rate, raised systolic pressure). Sweating, tremor and confusion cannot be shown; beta-blockers can hide the heart-rate rise.' },
    { id: 'thyroid-storm', group: 'metabolic', name: 'Thyroid-storm pattern', changes: { arrhythmia: 'af', hr: 150, temp: 39.4, sbp: 150, dbp: 60, rr: 24 }, refs: [114],
      note: 'High fever, fast AF and a wide pulse pressure. In the Burch–Wartofsky score, temperature, heart rate and AF give points and ≥ 45 points is highly suggestive; agitation, gastrointestinal signs and thyroid tests cannot be shown.' },
    { id: 'myxoedema', group: 'metabolic', name: 'Myxoedema-coma pattern', changes: { temp: 34.5, hr: 46, rr: 8, etco2: 52, sbp: 92, dbp: 60, ecg_amp_mv: 0.6 }, refs: [115],
      note: 'Low temperature, slow heart and breathing, CO2 retention and small QRS complexes. Hyponatraemia, coma and the thyroid tests cannot be shown.' },
    { id: 'adrenal-crisis', group: 'metabolic', name: 'Adrenal-crisis pattern', changes: { sbp: 78, dbp: 44, hr: 120, temp: 38.4, t_scale: 1.6 }, refs: [116, 43],
      note: 'Low pressure with fever and peaked T waves from raised potassium. The monitor cannot tell this from septic shock; the clue is the history (steroid use, missed doses) and the sodium and potassium values.' },
    { id: 'phaeo-crisis', group: 'metabolic', name: 'Catecholamine-crisis pattern (phaeochromocytoma-type)', changes: { sbp: 230, dbp: 125, hr: 140, temp: 38.4 }, refs: [117],
      note: 'Severe hypertension with a fast rate and fever. Crises vary from this hypertensive form to swings or sustained hypotension, which needs circulatory support; this scenario shows the hypertensive form. Headache, sweating and the hormone tests cannot be shown.' },
    { id: 'missed-dialysis', group: 'metabolic', name: 'Missed-dialysis pattern (fluid overload and raised potassium)', changes: { t_scale: 1.8, p_scale: 0.4, qrs_width: 1.4, sbp: 178, dbp: 98, rr: 26, spo2: 91, hr: 58 }, refs: [43, 118],
      note: 'Peaked T, small P and a widening QRS with high pressure and fluid in the lungs. Deaths and heart-failure admissions peak after the long 2-day gap between sessions. Weight gain and the potassium value cannot be shown.' },
    { id: 'hypothermia-1', group: 'temp', name: 'Cold-exposure pattern (hypothermia stage I, shivering)', changes: { temp: 34, hr: 105, rr: 22, motion: 40, sbp: 140, dbp: 88 }, refs: [39, 138],
      note: 'Mild hypothermia: the body still fights the cold with shivering (motion artefact), a fast rate and raised pressure. Compare stage II, where everything slows. Shivering also disturbs the finger probe: SpO2 reads falsely low and the cuff may fail [138]. Consciousness cannot be shown.' },
    { id: 'heat-stroke', group: 'temp', name: 'Heatstroke pattern', changes: { temp: 41.5, hr: 145, sbp: 92, dbp: 50, rr: 30, etco2: 28 }, refs: [119],
      note: 'Core temperature over 40 °C with CNS dysfunction defines heatstroke. The monitor shows the temperature and circulatory strain but not the confusion; skin and peripheral probes read lower than the core.' },
    { id: 'nms', group: 'temp', name: 'Neuroleptic-malignant pattern (NMS-type)', changes: { temp: 39.5, hr: 120, sbp: 160, dbp: 95, rr: 24 }, refs: [120],
      note: 'Over 38 °C, blood pressure and heart rate at least 25 % and respiratory rate at least 50 % above baseline meet these consensus items. Rigidity, a raised CK and the drug history cannot be shown; compare the serotonin pattern.' },
    { id: 'serotonin', group: 'temp', name: 'Serotonin-toxicity pattern', changes: { temp: 39, hr: 130, sbp: 165, dbp: 95, motion: 50, rr: 24 }, refs: [121, 138],
      note: 'Fever, fast rate and high pressure with tremor (motion artefact). It looks like NMS on the monitor; clonus, onset within hours rather than days, and the drug history tell them apart. The tremor also gives a falsely low SpO2 and can make the cuff fail [138].' },
    { id: 'ccb-overdose', group: 'temp', name: 'Calcium-channel-blocker overdose pattern', changes: { hr: 42, sbp: 74, dbp: 40, fasting_glucose: 360 }, refs: [122],
      note: 'Slow rate and low pressure with high glucose in a patient without diabetes: in verapamil and diltiazem poisoning glucose tracks severity (median peak 364 mg/dL in severe cases). Beta-blocker poisoning gives similar vital signs without the high glucose.' },
    { id: 'tca', group: 'temp', name: 'Tricyclic-overdose pattern (wide QRS)', changes: { hr: 125, qrs_width: 1.6, sbp: 84, dbp: 50 }, refs: [123],
      note: 'Fast rate, low pressure and a widened QRS (set here as a multiple of normal). In the source, seizures occurred only with QRS ≥ 0.10 s and ventricular arrhythmias only with ≥ 0.16 s. The terminal R wave in aVR and the drug level cannot be shown.' },
    { id: 'organophosphate', group: 'temp', name: 'Cholinergic-crisis pattern (organophosphate-type)', changes: { hr: 46, rr: 30, spo2: 86, airway_obstr: 60, sbp: 92, dbp: 56 }, refs: [124],
      note: 'Slow heart, bronchospasm with secretions and hypoxaemia. Small pupils, sweating, salivation and muscle twitching cannot be shown.' },
    { id: 'stimulant', group: 'temp', name: 'Sympathomimetic-toxicity pattern (cocaine-type)', changes: { hr: 140, sbp: 180, dbp: 105, temp: 39.0, rr: 24 }, refs: [125],
      note: 'Fast rate, high pressure and fever. Chest pain from coronary spasm, agitation and large pupils cannot be shown; ST changes are not modelled.' },
    { id: 'co-poisoning', group: 'temp', name: 'Carbon-monoxide pattern (falsely normal SpO2)', changes: { spo2: 99, hr: 110, rr: 22 }, refs: [126],
      note: 'The saturation set here is what a two-wavelength oximeter reports. Carboxyhaemoglobin looks like oxyhaemoglobin to it, so SpO2 stays near normal while the true oxygen content is low; only CO-oximetry of a blood sample measures COHb.' },
    { id: 'opioid-overdose', group: 'temp', name: 'Opioid-overdose pattern (room air)', changes: { rr: 4, spo2: 78, etco2: 68, hr: 54, sbp: 98, dbp: 58 }, refs: [104, 35],
      note: 'Very slow breathing, CO2 retention and severe hypoxaemia; compare the milder post-operative pattern. Small pupils and coma cannot be shown.' },
    { id: 'induction-hypotension', group: 'periop', name: 'Post-induction hypotension pattern', changes: { sbp: 78, dbp: 42, hr: 60, rr: 12, etco2: 35 }, refs: [127],
      note: 'Systolic under 90 mmHg within 20 minutes of inducing general anaesthesia, from vasodilatation and less sympathetic tone. Anaesthetic depth and drug doses cannot be shown.' },
    { id: 'oesophageal-intubation', group: 'periop', name: 'Oesophageal-intubation pattern (no exhaled CO2)', changes: { etco2: 5, spo2: 94, hr: 110 }, refs: [103],
      note: 'No sustained exhaled CO2 means the tube is not in the trachea. After pre-oxygenation SpO2 can stay normal for minutes, so a normal SpO2 does not confirm tube position. A flat capnogram in cardiac arrest has other causes.' },
    { id: 'vae', group: 'periop', name: 'Venous-air-embolism pattern', changes: { etco2: 22, rr: 12, spo2: 90, hr: 120, sbp: 86, dbp: 52 }, refs: [128],
      note: 'A sudden fall in EtCO2 at a fixed ventilator rate, followed by hypoxaemia and hypotension. Doppler or echocardiography detect the air earlier; neither is modelled.' },
    { id: 'last', group: 'periop', name: 'Local-anaesthetic-toxicity pattern (cardiac stage)', changes: { hr: 40, qrs_width: 1.5, sbp: 70, dbp: 38 }, refs: [129],
      note: 'Slow rate, wide QRS and low pressure after a nerve block. CNS signs (metallic taste, seizures) usually come first and cannot be shown.' },
    { id: 'preeclampsia', group: 'obstetric', name: 'Pre-eclampsia with severe-range blood pressure', changes: { age_years: 30, sex: 'female', sbp: 168, dbp: 112, hr: 96, spo2: 95 }, refs: [131],
      note: 'Systolic ≥ 160 or diastolic ≥ 110 mmHg is a severe feature. Proteinuria, headache, visual signs and the laboratory tests cannot be shown; the fetus is not modelled.' },
    { id: 'pph', group: 'obstetric', name: 'Postpartum-haemorrhage pattern (raised shock index)', changes: { age_years: 30, sex: 'female', hr: 120, sbp: 92, dbp: 60, rr: 24, pi: 0.8 }, refs: [132],
      note: 'Shock index = heart rate / systolic pressure = 1.3. In postpartum haemorrhage an index ≥ 0.9 caught every ICU admission and ≥ 1.7 was highly specific. Pregnancy hides blood loss, so the pressure stays near normal for long. Measured blood loss cannot be shown.' },
    { id: 'afe', group: 'obstetric', name: 'Amniotic-fluid-embolism pattern', changes: { age_years: 30, sex: 'female', spo2: 78, sbp: 66, dbp: 36, hr: 135, etco2: 18, rr: 32 }, refs: [133],
      note: 'Sudden collapse with hypoxaemia and hypotension during labour or just after birth. The research definition also needs a coagulopathy, which cannot be shown.' },
    { id: 'spinal-hypotension', group: 'obstetric', name: 'Spinal-anaesthesia hypotension at caesarean', changes: { age_years: 30, sex: 'female', sbp: 82, dbp: 44, hr: 58 }, refs: [130],
      note: 'From a baseline of 120 mmHg, 82 mmHg is 68 %; the aim is to keep at least 90 % and avoid under 80 %. With a slow heart rate the vasopressor choice changes. Nausea and the fetal heart rate cannot be shown.' },
    { id: 'post-rosc', group: 'arrest', name: 'After return of circulation (post-ROSC)', changes: { hr: 110, sbp: 92, dbp: 56, etco2: 38, spo2: 96 }, refs: [60, 134],
      note: 'Within the post-resuscitation targets: SpO2 94–98 %, normal CO2 and a mean pressure above 65 mmHg (here 68). Brain injury, temperature control and the 12-lead ECG for a coronary cause cannot be shown.' },
  ];

  /** Parameters for a preset, keeping the current display/processing settings. */
  function applyPreset(id, current) {
    const p = PRESETS.find(x => x.id === id);
    if (!p) throw new Error('unknown preset ' + id);
    const base = Object.assign({}, DEFAULTS);
    for (const k of Object.keys(SPEC)) if (SPEC[k].group === 'processing' && current) base[k] = current[k];
    const params = Object.assign(base, p.changes);
    const changed = Object.keys(p.changes);
    return { params, changed, preset: p };
  }

  /** Id of the preset whose patient and sensor settings equal params, or 'custom'.
   *  Display/processing settings are ignored. prefer wins when several match. */
  function matchPreset(params, prefer) {
    const keys = Object.keys(SPEC).filter(k => SPEC[k].group !== 'processing');
    const same = p => { const q = applyPreset(p.id).params; return keys.every(k => String(q[k]) === String(params[k])); };
    const pref = PRESETS.find(p => p.id === prefer);
    if (pref && same(pref)) return pref.id;
    const hit = PRESETS.find(same);
    return hit ? hit.id : 'custom';
  }

  return { GROUPS, SPEC, DEFAULTS, SCENARIO_GROUPS, PRESETS, validate, applyPreset, matchPreset };
});
