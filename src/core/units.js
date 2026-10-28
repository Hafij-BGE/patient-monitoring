/* Units, parameter catalogue and conversions. Pure, no DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).units = factory();
})(this, function () {
  'use strict';

  // Canonical unit per parameter and a plausibility range used to reject
  // corrupt imported/device records. Ranges are deliberately wide data-sanity
  // bounds, NOT clinical reference ranges and NOT device specifications.
  const PARAMS = {
    hr:       { label: 'Heart rate',        unit: 'bpm',      min: 15,  max: 350 },
    pr:       { label: 'Pulse rate',        unit: 'bpm',      min: 15,  max: 350 },
    spo2:     { label: 'SpO2',              unit: '%',        min: 30,  max: 100 },
    pi:       { label: 'Perfusion index',   unit: '%',        min: 0,   max: 30 },
    spo2_sqi: { label: 'SpO2 signal quality index', unit: '%', min: 0, max: 100 },
    sbp:      { label: 'Systolic BP',       unit: 'mmHg',     min: 30,  max: 300 },
    dbp:      { label: 'Diastolic BP',      unit: 'mmHg',     min: 10,  max: 250 },
    map:      { label: 'Mean arterial pressure', unit: 'mmHg', min: 15, max: 280 },
    pp:       { label: 'Pulse pressure',    unit: 'mmHg',     min: 0,   max: 250 },
    rr:       { label: 'Respiratory rate',  unit: 'br/min',   min: 0,   max: 120 },
    art_sys:  { label: 'Arterial systolic (invasive)',  unit: 'mmHg', min: 30, max: 300 },
    art_dia:  { label: 'Arterial diastolic (invasive)', unit: 'mmHg', min: 10, max: 250 },
    art_map:  { label: 'Arterial mean (invasive)',      unit: 'mmHg', min: 15, max: 280 },
    etco2:    { label: 'End-tidal CO2',     unit: 'mmHg',     min: 0,   max: 150 },
    temp:     { label: 'Temperature',       unit: '°C',       min: 20,  max: 46 },
    glucose:  { label: 'Plasma glucose',    unit: 'mg/dL',    min: 1,   max: 1000 },
    insulin:  { label: 'Plasma insulin',    unit: 'µU/mL',    min: 0,   max: 1000 },
    weight:   { label: 'Weight',            unit: 'kg',       min: 0.3, max: 500 },
    height:   { label: 'Height',            unit: 'cm',       min: 20,  max: 260 },
    bmi:      { label: 'BMI',               unit: 'kg/m²',    min: 5,   max: 150 },
    bsa:      { label: 'BSA (Mosteller)',   unit: 'm²',       min: 0.05, max: 4 },
    steps:    { label: 'Steps',             unit: 'steps',    min: 0,   max: 200000 },
  };

  // Accepted unit spellings -> converter to canonical unit.
  const LB_PER_KG = 2.2046226218;
  const MMHG_PER_KPA = 7.500615758;
  const MGDL_PER_MMOLL = 18.016; // glucose, molar mass 180.16 g/mol
  const CONVERTERS = {
    weight: { kg: v => v, g: v => v / 1000, lb: v => v / LB_PER_KG, lbs: v => v / LB_PER_KG },
    height: { cm: v => v, m: v => v * 100, mm: v => v / 10, in: v => v * 2.54, inch: v => v * 2.54 },
    temp:   { '°c': v => v, c: v => v, celsius: v => v, degc: v => v,
              '°f': v => (v - 32) * 5 / 9, f: v => (v - 32) * 5 / 9, fahrenheit: v => (v - 32) * 5 / 9, degf: v => (v - 32) * 5 / 9 },
    sbp:    { mmhg: v => v, kpa: v => v * MMHG_PER_KPA },
    dbp:    { mmhg: v => v, kpa: v => v * MMHG_PER_KPA },
    map:    { mmhg: v => v, kpa: v => v * MMHG_PER_KPA },
    pp:     { mmhg: v => v, kpa: v => v * MMHG_PER_KPA },
    art_sys: { mmhg: v => v, kpa: v => v * MMHG_PER_KPA },
    art_dia: { mmhg: v => v, kpa: v => v * MMHG_PER_KPA },
    art_map: { mmhg: v => v, kpa: v => v * MMHG_PER_KPA },
    etco2:  { mmhg: v => v, kpa: v => v * MMHG_PER_KPA },
    spo2:   { '%': v => v, percent: v => v },
    pi:     { '%': v => v, percent: v => v },
    spo2_sqi: { '%': v => v, percent: v => v },
    hr:     { bpm: v => v, '/min': v => v, 'beats/min': v => v },
    pr:     { bpm: v => v, '/min': v => v, 'beats/min': v => v },
    rr:     { 'br/min': v => v, bpm: v => v, '/min': v => v, 'breaths/min': v => v, rpm: v => v },
    bmi:    { 'kg/m²': v => v, 'kg/m2': v => v },
    bsa:    { 'm²': v => v, m2: v => v },
    steps:  { steps: v => v, count: v => v },
    glucose: { 'mg/dl': v => v, 'mmol/l': v => v * MGDL_PER_MMOLL, mm: v => v * MGDL_PER_MMOLL },
    insulin: { 'µu/ml': v => v, 'uu/ml': v => v, 'mu/l': v => v, 'miu/l': v => v, 'µiu/ml': v => v, 'uiu/ml': v => v },
  };

  function normUnit(u) {
    return String(u == null ? '' : u).trim().toLowerCase().replace(/\s+/g, '');
  }

  /** Convert value from `unit` to the canonical unit of `param`.
   *  Returns {value} or {error}. Empty unit = assume canonical. */
  function toCanonical(param, value, unit) {
    const p = PARAMS[param];
    if (!p) return { error: 'unknown parameter "' + param + '"' };
    const conv = CONVERTERS[param] || {};
    const u = normUnit(unit);
    if (u === '' || u === normUnit(p.unit)) return { value: value };
    const f = conv[u];
    if (!f) return { error: 'unsupported unit "' + unit + '" for ' + param };
    return { value: f(value) };
  }

  function inRange(param, value) {
    const p = PARAMS[param];
    return !!p && Number.isFinite(value) && value >= p.min && value <= p.max;
  }

  const cToF = c => c * 9 / 5 + 32;
  const fToC = f => (f - 32) * 5 / 9;
  const kgToLb = kg => kg * LB_PER_KG;
  const lbToKg = lb => lb / LB_PER_KG;
  function cmToFtIn(cm) {
    const totalIn = cm / 2.54;
    let ft = Math.floor(totalIn / 12);
    let inch = Math.round((totalIn - ft * 12) * 10) / 10;
    if (inch >= 12) { ft += 1; inch -= 12; }
    return { ft, in: inch };
  }
  const ftInToCm = (ft, inch) => (ft * 12 + inch) * 2.54;

  return { PARAMS, toCanonical, inRange, normUnit, cToF, fToC, kgToLb, lbToKg, cmToFtIn, ftInToCm,
           LB_PER_KG, MMHG_PER_KPA };
});
