/* Patient profile calculations: BMI, BSA (Mosteller), weight history. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).profile = factory();
})(this, function () {
  'use strict';

  const DEFAULT_PROFILE = Object.freeze({
    label: 'SIM-PATIENT-01',  // fictional local label, not a real identifier
    heightCm: 172,
    weightKg: 70,
    ageYears: 40,
    sex: '',                  // optional; not used by any calculation implemented here
    notes: '',
    weightHistory: [],        // [{date:'YYYY-MM-DD', kg:number}]
  });

  const ADULT_MIN_AGE = 20;   // WHO adult BMI cut-offs apply from age 20; younger -> BMI-for-age charts

  function validNum(v, lo, hi) { return Number.isFinite(v) && v >= lo && v <= hi; }

  /** BMI = weight(kg) / height(m)^2. Returns null when inputs are invalid. */
  function bmi(weightKg, heightCm) {
    if (!validNum(weightKg, 0.3, 500) || !validNum(heightCm, 20, 260)) return null;
    const m = heightCm / 100;
    return weightKg / (m * m);
  }

  /** Mosteller BSA (m²) = sqrt(height(cm) * weight(kg) / 3600). */
  function bsaMosteller(weightKg, heightCm) {
    if (!validNum(weightKg, 0.3, 500) || !validNum(heightCm, 20, 260)) return null;
    return Math.sqrt(heightCm * weightKg / 3600);
  }

  /** WHO adult category, only for age >= 20. Boundaries: <18.5, 18.5–<25, 25–<30, >=30. */
  function bmiCategory(bmiValue, ageYears) {
    if (bmiValue === null) return { category: null, note: 'BMI unavailable (check height and weight).' };
    if (!Number.isFinite(ageYears)) return { category: null, note: 'Enter age: adult BMI categories apply only from age 20.' };
    if (ageYears < ADULT_MIN_AGE) {
      return { category: null,
        note: 'Age < 20 y: adult BMI categories are not applied. Children and adolescents need age- and sex-specific BMI-for-age references (WHO / CDC growth charts).' };
    }
    let c;
    if (bmiValue < 18.5) c = 'Underweight (<18.5)';
    else if (bmiValue < 25) c = 'Normal range (18.5–24.9)';
    else if (bmiValue < 30) c = 'Pre-obesity (25.0–29.9)';
    else c = 'Obesity (≥30.0)';
    return { category: c, note: 'WHO adult classification; a population screening index, not a diagnosis.' };
  }

  /** Sort, de-duplicate (same date keeps last entry) and validate weight history. */
  function normaliseHistory(entries) {
    const map = new Map();
    for (const e of entries || []) {
      const t = Date.parse(e.date);
      if (!Number.isFinite(t) || !validNum(Number(e.kg), 0.3, 500)) continue;
      map.set(e.date, { date: e.date, kg: Number(e.kg), t });
    }
    return Array.from(map.values()).sort((a, b) => a.t - b.t);
  }

  /** Absolute and percentage change between first and last dated entry. */
  function weightChange(entries) {
    const h = normaliseHistory(entries);
    if (h.length < 2) return null;
    const first = h[0], last = h[h.length - 1];
    const abs = last.kg - first.kg;
    return { from: first, to: last, absKg: abs, pct: abs / first.kg * 100,
             days: Math.round((last.t - first.t) / 86400000) };
  }

  return { DEFAULT_PROFILE, ADULT_MIN_AGE, bmi, bsaMosteller, bmiCategory, normaliseHistory, weightChange };
});
