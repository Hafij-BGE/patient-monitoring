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
    physiology: 'Physiological inputs (the simulated patient)',
    sensor: 'Sensor and artifact settings (the measurement)',
    processing: 'Processing and display settings (the monitor)',
  };

  // type: num | sel. "help" states the control's effect.
  const SPEC = {
    // ---- physiology ----
    hr:          { group: 'physiology', label: 'Heart rate', unit: 'bpm', type: 'num', min: 30, max: 220, step: 1, def: 72,
                   help: 'Mean cardiac cycle rate. Sets the ECG beat interval (60/HR s), PPG pulse timing and the arterial pulse train.' },
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
    temp:        { group: 'physiology', label: 'Core temperature', unit: '°C', type: 'num', min: 30, max: 43, step: 0.1, def: 37.0,
                   help: 'True temperature seen by the probe; the displayed value follows it with the sensor time constant.' },

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
    nibp_interval:{ group: 'processing', label: 'NIBP auto interval', unit: 'min', type: 'sel', options: [0, 1, 2, 5, 15], def: 0,
                   help: '0 = manual start only. Otherwise a measurement starts automatically at this interval (simulation time).' },
    nibp_ks:     { group: 'processing', label: 'Systolic ratio Ks', unit: '', type: 'num', min: 0.3, max: 0.8, step: 0.01, def: 0.5,
                   help: 'SBP = cuff pressure above the maximum where oscillation amplitude falls to Ks × maximum.' },
    nibp_kd:     { group: 'processing', label: 'Diastolic ratio Kd', unit: '', type: 'num', min: 0.5, max: 0.95, step: 0.01, def: 0.8,
                   help: 'DBP = cuff pressure below the maximum where oscillation amplitude falls to Kd × maximum.' },
    sweep:       { group: 'processing', label: 'Sweep speed', unit: 'mm/s', type: 'sel', options: [6.25, 12.5, 25, 50], def: 25,
                   help: 'Horizontal scale of the waveforms (screen calibration assumed 96 dpi).' },
    ecg_gain:    { group: 'processing', label: 'ECG gain', unit: 'mm/mV', type: 'sel', options: [5, 10, 20], def: 10,
                   help: 'Vertical scale of the ECG trace.' },
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

  return { GROUPS, SPEC, DEFAULTS, PRESETS, validate, applyPreset };
});
