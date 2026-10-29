/* Patient profile calculations: BMI, BSA (Mosteller, DuBois, Haycock), weight
 * history, bedside calculators (predicted body weight, weight-based volumes,
 * age-predicted maximal heart rate), QTc formulas, shock index and age-typical
 * blood pressure. Sources are listed in REFERENCES.md (entries 13, 72-82, 88-92). */
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
    sex: '',                  // optional; used by predictedBodyWeight and bpForAge
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

  /** Body surface area (m²) by a selectable published formula (FORMULAS.bsa). */
  function bsa(weightKg, heightCm, method) {
    if (!validNum(weightKg, 0.3, 500) || !validNum(heightCm, 20, 260)) return null;
    if (method === 'dubois') return 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725);
    if (method === 'haycock') return 0.024265 * Math.pow(weightKg, 0.5378) * Math.pow(heightCm, 0.3964);
    return bsaMosteller(weightKg, heightCm);
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

  // ------------------------------------------------------------- bedside calculators
  /**
   * Predicted body weight (kg), ARDS Network 2000 trial formula:
   * male 50 + 0.91 (height cm - 152.4), female 45.5 + 0.91 (height cm - 152.4).
   * Returns null when sex is not 'male' or 'female' (the formula needs it).
   */
  function predictedBodyWeight(heightCm, sex) {
    if (!validNum(heightCm, 100, 260)) return null;
    const base = sex === 'male' ? 50 : sex === 'female' ? 45.5 : null;
    return base === null ? null : base + 0.91 * (heightCm - 152.4);
  }

  /** Tidal volume (mL) for a dose in mL/kg of predicted body weight. */
  function tidalVolume(pbwKg, mlPerKg) {
    return Number.isFinite(pbwKg) && pbwKg > 0 ? pbwKg * mlPerKg : null;
  }

  /** Volume (mL) for a weight-based dose in mL/kg, e.g. 30 mL/kg crystalloid. */
  function weightDose(weightKg, mlPerKg) {
    return validNum(weightKg, 0.3, 500) ? weightKg * mlPerKg : null;
  }

  /** Age-predicted maximal heart rate (beats/min), Tanaka et al. 2001: 208 - 0.7 x age. */
  function hrMaxTanaka(ageYears) {
    return validNum(ageYears, 0, 120) ? 208 - 0.7 * ageYears : null;
  }

  /** Age-predicted maximal heart rate (beats/min) by a selectable formula (FORMULAS.hrmax). */
  function hrMax(ageYears, method) {
    if (!validNum(ageYears, 0, 120)) return null;
    if (method === 'fox') return 220 - ageYears;
    if (method === 'gellish') return 207 - 0.7 * ageYears;
    return hrMaxTanaka(ageYears);
  }

  // ------------------------------------------------------------- QT correction
  /**
   * Heart-rate-corrected QT (ms) from QT (ms) and the preceding R–R interval (s),
   * by a selectable formula (FORMULAS.qtc). Null outside RR 0.3–2 s.
   */
  function qtc(qtMs, rrS, method) {
    if (!Number.isFinite(qtMs) || !validNum(rrS, 0.3, 2)) return null;
    if (method === 'bazett') return qtMs / Math.sqrt(rrS);
    if (method === 'fridericia') return qtMs / Math.cbrt(rrS);
    if (method === 'hodges') return qtMs + 1.75 * (60 / rrS - 60);
    return qtMs + 154 * (1 - rrS); // Framingham (Sagie 1992)
  }

  /**
   * Formula choices offered in the Profile tab. The first entry of each list is the
   * default and the one with the strongest support for this use (see the notes).
   * ref = entry number in REFERENCES.md.
   */
  const FORMULAS = Object.freeze({
    qtc: [
      { id: 'framingham', name: 'Framingham', eq: 'QT + 154·(1 − RR)', ref: 82 },
      { id: 'fridericia', name: 'Fridericia', eq: 'QT / RR^⅓', ref: 89 },
      { id: 'hodges', name: 'Hodges', eq: 'QT + 1.75·(HR − 60)', ref: 88 },
      { id: 'bazett', name: 'Bazett', eq: 'QT / √RR', ref: 88 },
    ],
    bsa: [
      { id: 'mosteller', name: 'Mosteller', eq: '√(H·W / 3600)', ref: 13 },
      { id: 'dubois', name: 'DuBois & DuBois', eq: '0.007184·W^0.425·H^0.725', ref: 90 },
      { id: 'haycock', name: 'Haycock', eq: '0.024265·W^0.5378·H^0.3964', ref: 91 },
    ],
    hrmax: [
      { id: 'tanaka', name: 'Tanaka', eq: '208 − 0.7·age', ref: 75 },
      { id: 'gellish', name: 'Gellish', eq: '207 − 0.7·age', ref: 92 },
      { id: 'fox', name: 'Fox (220 − age)', eq: '220 − age', ref: 75 },
    ],
    map: [
      { id: 'osc', name: 'Oscillometric (cuff peak)', eq: 'cuff pressure at the largest oscillation' },
      { id: 'formula', name: 'DBP + (SBP − DBP)/3', eq: 'one-third rule' },
    ],
  });
  const formulaInfo = (kind, id) => FORMULAS[kind].find(x => x.id === id) || FORMULAS[kind][0];

  // ------------------------------------------------------------- shock index
  const SI_NORMAL = Object.freeze({ lo: 0.5, hi: 0.7 }); // healthy adult range (Caputo et al. 2018)

  /** Shock index = HR / SBP. Null unless both are finite and SBP > 0. */
  function shockIndex(hr, sbp) {
    return Number.isFinite(hr) && Number.isFinite(sbp) && sbp > 0 ? hr / sbp : null;
  }

  // ------------------------------------------------------------- age-typical blood pressure
  /**
   * Mean SBP/DBP (mmHg) of US adults by age group and sex, NHANES 2001-2008,
   * "Total" columns (all participants, treated hypertensives included).
   * Wright et al. 2011, Natl Health Stat Report 35, Tables 2-7.
   * The report gives only the groups 18-39, 40-59 and 60+; the centres below
   * (28.5, 49.5, 70 years) are this simulator's choice for interpolation.
   */
  const BP_NORMS = Object.freeze({
    centres: [28.5, 49.5, 70],
    all:    { sbp: [115, 123, 136], dbp: [69, 75, 68] },
    male:   { sbp: [119, 124, 133], dbp: [70, 77, 69] },
    female: { sbp: [110, 122, 139], dbp: [68, 74, 68] },
  });

  function interp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    }
    return ys[ys.length - 1];
  }

  /**
   * Age-typical resting SBP/DBP (whole mmHg), linearly interpolated between the
   * NHANES group centres and held flat outside them. Sex other than male/female
   * uses the all-adults row. Returns null for an invalid age.
   */
  function bpForAge(ageYears, sex) {
    if (!validNum(ageYears, 18, 120)) return null;
    const row = BP_NORMS[sex === 'male' || sex === 'female' ? sex : 'all'];
    return { sbp: Math.round(interp(BP_NORMS.centres, row.sbp, ageYears)),
             dbp: Math.round(interp(BP_NORMS.centres, row.dbp, ageYears)) };
  }

  return { DEFAULT_PROFILE, ADULT_MIN_AGE, bmi, bsaMosteller, bsa, hrMax, qtc, FORMULAS, formulaInfo, bmiCategory, normaliseHistory, weightChange,
    predictedBodyWeight, tidalVolume, weightDose, hrMaxTanaka, SI_NORMAL, shockIndex, BP_NORMS, bpForAge };
});
