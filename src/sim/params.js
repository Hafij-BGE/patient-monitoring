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
                   help: 'Used for the adult BMI category (Profile tab). The simulated vital signs use adult settings at every age; age does not change them.' },
    sex:         { group: 'patient', label: 'Sex', type: 'sel', options: ['unspecified', 'female', 'male'], def: 'unspecified',
                   help: 'Recorded with the profile only. No calculation in PM-SIM uses it.' },
    height_cm:   { group: 'patient', label: 'Height', unit: 'cm', type: 'num', min: 120, max: 220, step: 1, def: 172,
                   help: 'Used for BMI and BSA (Profile tab).' },
    weight_kg:   { group: 'patient', label: 'Body weight', unit: 'kg', type: 'num', min: 30, max: 250, step: 0.5, def: 70,
                   help: 'Used for BMI and BSA, and for the glucose and insulin distribution volumes of the glucose model.' },
    diabetes:    { group: 'patient', label: 'Diabetes status', type: 'sel', options: ['none', 'type1', 'type2'], def: 'none',
                   help: 'Selects the glucose–insulin model parameter set (no, absent or reduced insulin secretion; insulin sensitivity). It does not change the other signals.' },

    // ---- physiology ----
    hr:          { group: 'physiology', label: 'Heart rate', unit: 'bpm', type: 'num', min: 30, max: 220, step: 1, def: 72,
                   help: 'Mean cardiac cycle rate. Sets the ECG beat interval (60/HR s), PPG pulse timing and the arterial pulse train.' },
    arrhythmia:  { group: 'physiology', label: 'Arrhythmia pattern', type: 'sel', options: ['none', 'af', 'pvc', 'vt', 'vf', 'asystole'], def: 'none',
                   help: 'Teaching patterns. af: no P wave, f-waves, irregular intervals. pvc: occasional early wide beat with a compensatory pause. vt: every beat wide at the set heart rate. vf: chaotic 3–7 Hz activity, no beats. asystole: flat line. Shapes are illustrative, not diagnostic.' },
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
    sbp:         { group: 'physiology', label: 'Systolic pressure', unit: 'mmHg', type: 'num', min: 50, max: 250, step: 1, def: 120,
                   help: 'Peak of the simulated arterial pressure waveform (input to the oscillometric model).' },
    dbp:         { group: 'physiology', label: 'Diastolic pressure', unit: 'mmHg', type: 'num', min: 25, max: 150, step: 1, def: 80,
                   help: 'Minimum of the simulated arterial pressure waveform. Must be at least 10 mmHg below systolic.' },
    stiffness:   { group: 'physiology', label: 'Arterial wall stiffness', unit: '×', type: 'num', min: 0.5, max: 2.5, step: 0.05, def: 1,
                   help: 'Scales the widths of the brachial artery pressure–volume curve. Stiffer = smaller, broader oscillations; shifts oscillometric error.' },
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
                   help: 'Catheter–tubing–transducer modelled as a 2nd-order system. optimal: fn 20 Hz, ζ 0.6. under-damped: fn 6 Hz, ζ 0.1 (ringing, systolic overshoot). over-damped: fn 4 Hz, ζ 1.5 (blunted, e.g. air bubble). MAP is kept in all three.' },
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
    nibp_ks:     { group: 'processing', label: 'Systolic ratio Ks', unit: '', type: 'num', min: 0.3, max: 0.8, step: 0.01, def: 0.5,
                   help: 'SBP = cuff pressure above the maximum where oscillation amplitude falls to Ks × maximum.' },
    nibp_kd:     { group: 'processing', label: 'Diastolic ratio Kd', unit: '', type: 'num', min: 0.5, max: 0.95, step: 0.01, def: 0.8,
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

  // Each preset = baseline defaults + listed changes. Fictional scenarios for teaching
  // signal behaviour; names describe the parameter pattern, not a diagnosis.
  const PRESETS = [
    { id: 'baseline', name: 'Baseline adult', changes: {} },
    { id: 'tachy', name: 'Tachycardia (fast rate)', changes: { hr: 135 } },
    { id: 'brady', name: 'Bradycardia (slow rate)', changes: { hr: 42 } },
    { id: 'irregular', name: 'Irregular beat timing', changes: { rhythm: 'irregular', hr: 95 } },
    { id: 'desat', name: 'Desaturation', changes: { spo2: 84 } },
    { id: 'hypotension', name: 'Low blood pressure', changes: { sbp: 82, dbp: 48 } },
    { id: 'hypertension', name: 'High blood pressure', changes: { sbp: 175, dbp: 105 } },
    { id: 'tachypnea', name: 'Fast breathing', changes: { rr: 32 } },
    { id: 'bradypnea', name: 'Slow breathing', changes: { rr: 7 } },
    { id: 'fever', name: 'Temperature elevation', changes: { temp: 38.9 } },
    { id: 'disconnect', name: 'Sensor disconnection', changes: { spo2_sensor: 'disconnected', contact: 5 } },
    { id: 'motion', name: 'Motion artifact', changes: { motion: 70 } },
    { id: 'noisy-ecg', name: 'Noisy ECG', changes: { ecg_noise_uv: 120, mains_uv: 80, ecg_wander_mv: 0.4, contact: 60 } },
    { id: 'missing', name: 'Missing observations', changes: { ecg_dropout: 6, ppg_dropout: 6, resp_dropout: 6, temp_sensor: 'unavailable' } },
    { id: 'apnea', name: 'Apnea demonstration', changes: { rr: 0 } },
    { id: 'af', name: 'AF pattern (irregular, no P waves)', changes: { arrhythmia: 'af', hr: 110 } },
    { id: 'pvc', name: 'Frequent PVCs', changes: { arrhythmia: 'pvc', pvc_per_min: 14 } },
    { id: 'vt', name: 'V-Tach pattern', changes: { arrhythmia: 'vt', hr: 170, sbp: 85, dbp: 55 } },
    { id: 'vf', name: 'V-Fib pattern (no output)', changes: { arrhythmia: 'vf' } },
    { id: 'asystole', name: 'Asystole pattern', changes: { arrhythmia: 'asystole' } },
    { id: 'hypovent', name: 'Hypoventilation (high EtCO2)', changes: { rr: 6, etco2: 58 } },
    { id: 'bronchospasm', name: 'Obstructed expiration', changes: { airway_obstr: 80, rr: 22 } },
    { id: 'rebreathing', name: 'CO2 rebreathing', changes: { fico2: 6 } },
    { id: 'underdamped', name: 'Under-damped arterial line', changes: { ibp_damping: 'under-damped' } },
    { id: 'transducer', name: 'Transducer too high', changes: { ibp_height_cm: 20 } },

    // Combined-sign teaching patterns from the literature. "refs" are entry numbers in
    // REFERENCES.md. Where a source gives only a direction (up/down), the number is an
    // illustrative choice inside that direction; see TECHNICAL_REPORT.md section 3.12.
    { id: 'haem-2', name: 'Blood-loss pattern, ATLS class II', changes: { hr: 110, sbp: 118, dbp: 92, rr: 24 }, refs: [28, 29],
      note: 'Fast heart rate and a narrow pulse pressure while systolic pressure is still normal.' },
    { id: 'haem-3', name: 'Blood-loss pattern, ATLS class III', changes: { hr: 130, sbp: 88, dbp: 68, rr: 32, pi: 0.8 }, refs: [28, 29, 30],
      note: 'Systolic pressure now falls; low perfusion index. Only a minority of real trauma patients fit an ATLS class.' },
    { id: 'sepsis-screen', name: 'Infection-screening pattern (SIRS / qSOFA thresholds)', changes: { hr: 112, rr: 24, sbp: 96, dbp: 58, temp: 38.7 }, refs: [31],
      note: 'Several moderate changes cross screening thresholds together. Screening thresholds are not a diagnosis.' },
    { id: 'anaphylaxis', name: 'Acute allergic-reaction pattern', changes: { sbp: 78, dbp: 42, hr: 128, spo2: 90, airway_obstr: 60, rr: 24, etco2: 30 }, refs: [32, 33, 35],
      note: 'Hypotension, tachycardia, falling SpO2 and an obstructive capnogram together. Skin signs cannot be shown.' },
    { id: 'hypovent-o2', name: 'Hypoventilation masked by supplemental O2', changes: { rr: 7, etco2: 55 }, refs: [34, 35],
      note: 'EtCO2 rises while SpO2 stays normal: capnography shows the problem first.' },
    { id: 'acidosis-breathing', name: 'Compensatory hyperventilation (low EtCO2)', changes: { rr: 28, etco2: 24, hr: 115, sbp: 102, dbp: 64 }, refs: [35, 36],
      note: 'Fast breathing with low EtCO2 can be compensation for acidosis. Breath depth is not modelled.' },
    { id: 'dka-pattern', name: 'Hyperglycaemic-crisis pattern (DKA-type)', changes: { diabetes: 'type1', fasting_glucose: 320, rr: 28, etco2: 24, hr: 115, sbp: 102, dbp: 64 }, refs: [35, 36, 51],
      note: 'Type 1 without insulin: glucose above 250 mg/dL with compensatory fast breathing and low EtCO2. Ketones and pH are not modelled.' },
    { id: 'pe-pattern', name: 'Dead-space pattern (PE-type)', changes: { hr: 115, spo2: 89, sbp: 105, dbp: 70, etco2: 30, rr: 24 }, refs: [37, 38],
      note: 'Low EtCO2 with a normal or high rate suggests dead space rather than hyperventilation.' },
    { id: 'hypothermia', name: 'Cold-exposure pattern (hypothermia stage II)', changes: { temp: 30.5, hr: 45, sbp: 92, dbp: 58, rr: 9, pi: 0.3 }, refs: [39],
      note: 'Slowed vital signs and a weak pleth from vasoconstriction. Osborn waves are not modelled.' },
    { id: 'mh-early', name: 'Hypermetabolic pattern, early (MH-type)', changes: { etco2: 60, hr: 125, rr: 12, temp: 37.6 }, refs: [40, 41],
      note: 'EtCO2 climbs at a fixed ventilator rate before temperature rises.' },
    { id: 'mh-late', name: 'Hypermetabolic pattern, late (MH-type)', changes: { etco2: 75, hr: 145, rr: 12, temp: 39.5, arrhythmia: 'pvc' }, refs: [40, 41],
      note: 'Temperature now rises and ectopic beats appear.' },
    { id: 'copd', name: 'Obstructive hypercapnic pattern (COPD-type)', changes: { spo2: 89, etco2: 52, airway_obstr: 60, rr: 24, hr: 100 }, refs: [35, 42],
      note: 'Shark-fin capnogram with high EtCO2. An SpO2 near 90 % can be a deliberate target in this group.' },
    { id: 'hyperk-early', name: 'Raised-potassium ECG, early', changes: { t_scale: 1.9 }, refs: [43],
      note: 'Peaked T waves first. ECG changes track potassium levels poorly.' },
    { id: 'hyperk-late', name: 'Raised-potassium ECG, late', changes: { t_scale: 1.9, p_scale: 0.3, qrs_width: 1.7 }, refs: [43],
      note: 'Then flattened P waves and a wide QRS.' },
    { id: 'cushing', name: 'Raised-ICP reflex pattern (Cushing)', changes: { sbp: 200, dbp: 90, hr: 46, rr: 8 }, refs: [44],
      note: 'High pressure with a slow heart rate, the opposite of shock. Irregular breathing cannot be set.' },
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

  return { GROUPS, SPEC, DEFAULTS, PRESETS, validate, applyPreset, matchPreset };
});
