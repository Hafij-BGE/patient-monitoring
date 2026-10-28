/* Terminology tables used by the hospital interfaces (HL7 v2, FHIR, SDC).
 *
 *   ISO/IEEE 11073-10101 nomenclature (MDC): observation and unit codes, matched
 *     by reference identifier text (e.g. "MDC_PULS_OXIM_SAT_O2") or by the 32-bit
 *     numeric code (partition << 16 | term code).
 *   LOINC: vital-sign codes from the HL7 FHIR R4 vital signs profiles.
 *   UCUM: unit strings used by FHIR valueQuantity and by many HL7 v2 feeds.
 *
 * `checked: true` marks numeric codes cross-checked against a published HL7 value
 * set or example while writing this file. The others are from the nomenclature as
 * recalled by the author and must be confirmed in NIST RTMMS before any real use.
 * Reference identifiers (text) are matched first, so an unconfirmed number never
 * overrides a self-describing code. Pure, no DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).mdc = factory();
})(this, function () {
  'use strict';

  const SYS = Object.freeze({
    MDC: 'urn:iso:std:iso:11073:10101',
    LOINC: 'http://loinc.org',
    UCUM: 'http://unitsofmeasure.org',
  });

  // refid, numeric code, app parameter
  const TERMS = [
    ['MDC_ECG_HEART_RATE',            147842, 'hr',      true],
    ['MDC_PULS_RATE',                 149514, 'pr',      false],
    ['MDC_PULS_OXIM_PULS_RATE',       149530, 'pr',      false],
    ['MDC_PULS_RATE_NON_INV',         149546, 'pr',      false],
    ['MDC_PULS_OXIM_SAT_O2',          150456, 'spo2',    true],
    ['MDC_PULS_OXIM_PERF_REL',        150488, 'pi',      false],
    ['MDC_PRESS_BLD_NONINV_SYS',      150021, 'sbp',     false],
    ['MDC_PRESS_BLD_NONINV_DIA',      150022, 'dbp',     false],
    ['MDC_PRESS_BLD_NONINV_MEAN',     150023, 'map',     false],
    ['MDC_PRESS_BLD_ART_SYS',         150017, 'art_sys', false],
    ['MDC_PRESS_BLD_ART_DIA',         150018, 'art_dia', false],
    ['MDC_PRESS_BLD_ART_MEAN',        150019, 'art_map', false],
    ['MDC_PRESS_BLD_ART_ABP_SYS',     150033, 'art_sys', false],
    ['MDC_PRESS_BLD_ART_ABP_DIA',     150034, 'art_dia', false],
    ['MDC_PRESS_BLD_ART_ABP_MEAN',    150035, 'art_map', false],
    ['MDC_RESP_RATE',                 151562, 'rr',      true],
    ['MDC_AWAY_RESP_RATE',            151570, 'rr',      true],
    ['MDC_TTHOR_RESP_RATE',           151578, 'rr',      true],
    ['MDC_CO2_RESP_RATE',             151594, 'rr',      true],
    ['MDC_AWAY_CO2_ET',               151708, 'etco2',   false],
    ['MDC_TEMP_BODY',                 150364, 'temp',    true],
    ['MDC_TEMP',                      150344, 'temp',    false],
    ['MDC_MASS_BODY_ACTUAL',          188736, 'weight',  false],
    ['MDC_LEN_BODY_ACTUAL',           188740, 'height',  false],
    ['MDC_RATIO_MASS_BODY_LEN_SQ',    188752, 'bmi',     false],
  ].map(([refid, code, param, checked]) => ({ refid, code, param, checked }));

  // LOINC vital-sign codes (HL7 FHIR R4 vital signs profiles). Panels carry no value.
  const LOINC = {
    '8867-4': 'hr', '8889-8': 'pr', '59408-5': 'spo2', '2708-6': 'spo2', '9279-1': 'rr',
    '8310-5': 'temp', '8480-6': 'sbp', '8462-4': 'dbp', '8478-0': 'map',
    '29463-7': 'weight', '3141-9': 'weight', '8302-2': 'height', '39156-5': 'bmi',
    '19889-5': 'etco2',
  };
  const LOINC_PANELS = { '85353-1': 'vital signs panel', '85354-9': 'blood pressure panel' };

  // refid, numeric code, unit string understood by units.toCanonical
  const UNITS = [
    ['MDC_DIM_PERCENT',        262688, '%'],
    ['MDC_DIM_BEAT_PER_MIN',   264864, 'bpm'],
    ['MDC_DIM_RESP_PER_MIN',   264928, 'br/min'],
    ['MDC_DIM_MMHG',           266016, 'mmHg'],
    ['MDC_DIM_KILO_PASCAL',    265987, 'kPa'],
    ['MDC_DIM_DEGC',           268192, '°C'],
    ['MDC_DIM_FAHR',           266560, '°F'],
    ['MDC_DIM_KILO_G',         263875, 'kg'],
    ['MDC_DIM_LB',             null,   'lb'],
    ['MDC_DIM_CENTI_M',        263441, 'cm'],
    ['MDC_DIM_INCH',           null,   'in'],
    ['MDC_DIM_KG_PER_M_SQ',    264096, 'kg/m²'],
  ].map(([refid, code, unit]) => ({ refid, code, unit }));

  const UCUM = {
    '%': '%', '/min': '/min', '{beats}/min': 'bpm', '{beat}/min': 'bpm', '{breaths}/min': 'br/min', '{Breaths}/min': 'br/min',
    'mm[Hg]': 'mmHg', 'kPa': 'kPa', 'Cel': '°C', '[degF]': '°F', 'kg': 'kg', 'g': 'g', '[lb_av]': 'lb',
    'cm': 'cm', 'm': 'm', '[in_i]': 'in', 'kg/m2': 'kg/m²',
  };

  const byRefid = new Map(TERMS.map(t => [t.refid, t]));
  const byCode = new Map(TERMS.map(t => [String(t.code), t]));
  const unitByRefid = new Map(UNITS.map(u => [u.refid, u]));
  const unitByCode = new Map(UNITS.filter(u => u.code).map(u => [String(u.code), u]));

  const isMdcSystem = s => !s || /^(MDC|urn:iso:std:iso:11073:10101)$/i.test(String(s).trim());
  const isLoincSystem = s => /^(LN|LOINC|http:\/\/loinc\.org)$/i.test(String(s || '').trim());

  /**
   * Find the app parameter for a list of codings [{code, display, system}].
   * Reference identifiers win over numbers; MDC wins over LOINC.
   * Returns {param, via, term} or {panel} or null.
   */
  function lookup(codings) {
    const list = (codings || []).filter(c => c && (c.code || c.display));
    for (const c of list) {
      for (const s of [c.code, c.display]) {
        const t = s && byRefid.get(String(s).trim());
        if (t) return { param: t.param, via: 'MDC ' + t.refid, term: t };
      }
    }
    for (const c of list) {
      if (!isMdcSystem(c.system) || !/^\d+$/.test(String(c.code || '').trim())) continue;
      const t = byCode.get(String(c.code).trim());
      if (t) return { param: t.param, via: 'MDC ' + t.code + (t.checked ? '' : ' (numeric code not confirmed)'), term: t };
    }
    for (const c of list) {
      const code = String(c.code || '').trim();
      if (!(isLoincSystem(c.system) || /^\d{1,7}-\d$/.test(code))) continue;
      if (LOINC[code]) return { param: LOINC[code], via: 'LOINC ' + code };
      if (LOINC_PANELS[code]) return { panel: LOINC_PANELS[code], via: 'LOINC ' + code };
    }
    return null;
  }

  /** Unit string for units.toCanonical from MDC refid, MDC number, UCUM or plain text. */
  function unit(codings) {
    const list = (codings || []).filter(c => c && (c.code || c.display));
    for (const c of list) {
      for (const s of [c.code, c.display]) {
        const u = s && unitByRefid.get(String(s).trim());
        if (u) return u.unit;
      }
    }
    for (const c of list) {
      const u = isMdcSystem(c.system) && unitByCode.get(String(c.code || '').trim());
      if (u) return u.unit;
    }
    for (const c of list) {
      const k = String(c.code || c.display || '').trim();
      if (Object.prototype.hasOwnProperty.call(UCUM, k)) return UCUM[k];
    }
    const first = list[0];
    return first ? String(first.code || first.display || '').trim() : '';
  }

  /** Codings to write for a parameter (used by the synthetic sample encoders). */
  function codesFor(param) {
    const t = TERMS.find(x => x.param === param);
    const loinc = Object.keys(LOINC).find(k => LOINC[k] === param);
    return { mdc: t || null, loinc: loinc || null };
  }
  function unitCodesFor(appUnit) {
    const u = UNITS.find(x => x.unit === appUnit);
    const ucum = Object.keys(UCUM).find(k => UCUM[k] === appUnit);
    return { mdc: u || null, ucum: ucum || appUnit };
  }

  return { SYS, TERMS, LOINC, LOINC_PANELS, UNITS, UCUM, lookup, unit, codesFor, unitCodesFor };
});
