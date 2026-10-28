/* Local CSV/JSON import and manual entry.
 *
 * Everything here turns outside data into Observations with source "imported"
 * (files) or "user" (manual entry), keeping the original row, column, value and
 * unit in the provenance. Nothing is sent anywhere: the browser reads the file
 * with FileReader and passes the text to importText().
 *
 * Policies (also shown to the user in the import report):
 *  - Explicit missing tokens (empty quoted "", NA, N/A, null, NaN, -, --) become
 *    missing observations (value null), shown as gaps. An empty cell in a wide
 *    table means "not measured at this time" and is skipped (counted).
 *  - Values are converted to the canonical unit; unknown units are rejected.
 *  - Values outside the wide data-sanity range of units.PARAMS are rejected.
 *  - Timestamps with a zone (Z, ±hh:mm) are absolute. Timestamps without a zone
 *    are interpreted in the zone chosen by the user (local, UTC or a fixed offset).
 *  - Same parameter at the same instant: an identical value is a duplicate
 *    (dropped); a different value is a conflict (keep-first or keep-last). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./csv.js'), require('../core/units.js'), require('../core/observation.js'));
  else (root.PM = root.PM || {}).importer = factory(root.PM.csv, root.PM.units, root.PM.observation);
})(this, function (csv, units, observation) {
  'use strict';

  const MAX_ENTRIES = 200000;
  const MISSING_TOKENS = new Set(['na', 'n/a', 'null', 'none', 'nan', '-', '--', 'missing']);

  const SYNONYMS = {
    hr: ['hr', 'heart rate', 'heartrate', 'heart rate bpm', 'ecg hr'],
    pr: ['pr', 'pulse', 'pulse rate', 'pulserate'],
    spo2: ['spo2', 'sp02', 'spo₂', 'oxygen saturation', 'o2 sat', 'blood oxygen', 'saturation', 'oxygen'],
    sbp: ['sbp', 'systolic', 'sys', 'systolic bp', 'bp sys', 'systolic pressure', 'nibp sys'],
    dbp: ['dbp', 'diastolic', 'dia', 'diastolic bp', 'bp dia', 'diastolic pressure', 'nibp dia'],
    map: ['map', 'mean arterial pressure', 'mean pressure', 'nibp map'],
    pp: ['pp', 'pulse pressure'],
    rr: ['rr', 'resp', 'respiration', 'respiratory rate', 'resp rate', 'breathing rate', 'awrr'],
    temp: ['temp', 'temperature', 'body temperature', 'body temp', 'skin temperature'],
    weight: ['weight', 'body weight', 'mass'],
    height: ['height', 'body height'],
    steps: ['steps', 'step count'],
    pi: ['pi', 'perfusion index'],
  };
  const TIME_NAMES = ['timestamp', 'time stamp', 'datetime', 'date time', 'ts', 'start time', 'measured at', 'recorded at', 'measurement time', 'time', 'date'];
  const PARAM_COL = ['param', 'parameter', 'type', 'metric', 'measure', 'name', 'variable'];
  const VALUE_COL = ['value', 'val', 'reading', 'result'];
  const UNIT_COL = ['unit', 'units', 'uom'];

  function norm(s) { return String(s).toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  /** "Temp (°F)" → {name:'temp', unit:'°F'}; "weight_kg" → {name:'weight', unit:'kg'}. */
  function splitHeader(h) {
    let name = String(h), unit = '';
    const m = name.match(/^(.*?)[\s_]*[(\[]([^)\]]*)[)\]]\s*$/);
    if (m) { name = m[1]; unit = m[2].trim(); }
    name = norm(name);
    if (!unit) {
      const parts = name.split(' ');
      if (parts.length > 1) {
        const last = parts[parts.length - 1], rest = parts.slice(0, -1).join(' ');
        const p = paramFor(rest);
        if (p && units.toCanonical(p, 1, last).value !== undefined && units.normUnit(last) !== '') return { name: rest, unit: last };
      }
    }
    return { name, unit };
  }

  function paramFor(name) {
    const n = norm(name);
    if (units.PARAMS[n.replace(/ /g, '_')]) return n.replace(/ /g, '_');
    for (const [p, list] of Object.entries(SYNONYMS)) if (list.includes(n)) return p;
    return null;
  }

  // ---------------------------------------------------------------- timestamps
  function offsetMinutes(tz) {
    const m = String(tz).match(/^([+-])(\d{2}):?(\d{2})$/);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
  }

  function fromParts(y, mo, d, h, mi, s, ms, zone, opts) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return { error: 'invalid date/time fields' };
    const utc = Date.UTC(y, mo - 1, d, h, mi, s, ms);
    const chk = new Date(utc);
    if (chk.getUTCDate() !== d || chk.getUTCMonth() !== mo - 1) return { error: 'day does not exist in that month' };
    if (zone) {
      const off = zone === 'Z' ? 0 : offsetMinutes(zone);
      return { ms: utc - off * 60000, zone: zone };
    }
    const tz = opts.timezone || 'local';
    if (tz === 'UTC') return { ms: utc, naive: true };
    if (tz === 'local') return { ms: new Date(y, mo - 1, d, h, mi, s, ms).getTime(), naive: true };
    const off = offsetMinutes(tz);
    if (off === null) return { error: 'unknown timezone setting "' + tz + '"' };
    return { ms: utc - off * 60000, naive: true };
  }

  /** @returns {{ms:number, naive?:boolean}|{error:string}} */
  function parseTimestamp(raw, opts) {
    opts = opts || {};
    if (raw === null || raw === undefined) return { error: 'missing timestamp' };
    if (typeof raw === 'number') raw = String(raw);
    const s = String(raw).trim();
    if (s === '') return { error: 'missing timestamp' };
    if (/^\d{9,13}(\.\d+)?$/.test(s)) { // Unix epoch: ≥ 1e11 → milliseconds, else seconds
      const v = Number(s);
      return { ms: v >= 1e11 ? v : v * 1000, epoch: true };
    }
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
    if (m) {
      const frac = m[7] ? Math.round(Number('0.' + m[7]) * 1000) : 0;
      return fromParts(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), frac, m[8] ? m[8].toUpperCase() : null, opts);
    }
    m = s.match(/^(\d{1,2})([./])(\d{1,2})\2(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      let a = +m[1], b = +m[3], order = opts.dateOrder || 'auto';
      if (m[2] === '.' && order === 'auto') order = 'DMY'; // dotted dates are day-first by convention
      if (order === 'auto') {
        if (a > 12 && b <= 12) order = 'DMY';
        else if (b > 12 && a <= 12) order = 'MDY';
        else if (a === b) order = 'DMY';
        else return { error: 'ambiguous date "' + s + '": choose day/month order' };
      }
      const [d, mo] = order === 'MDY' ? [b, a] : [a, b];
      return fromParts(+m[4], mo, d, +(m[5] || 0), +(m[6] || 0), +(m[7] || 0), 0, null, opts);
    }
    return { error: 'unrecognised timestamp "' + s + '"' };
  }

  // ---------------------------------------------------------------- values
  function parseValue(raw, delimiter) {
    if (raw === null) return { missing: true };
    if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw } : { missing: true };
    if (typeof raw === 'boolean' || typeof raw === 'object') return { error: 'not a number' };
    let s = String(raw).trim();
    if (MISSING_TOKENS.has(s.toLowerCase())) return { missing: true };
    if (delimiter !== ',' && /^-?\d+,\d+$/.test(s)) s = s.replace(',', '.'); // decimal comma (e.g. "36,8")
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return { error: 'not a number: "' + s + '"' };
    return { value: Number(s) };
  }

  // ---------------------------------------------------------------- entries → observations
  function newReport(file, format) {
    return { file, format, rowsRead: 0, accepted: 0, missing: 0, empty: 0, duplicates: 0,
      conflicts: [], invalid: [], warnings: [], errors: [], mapping: {}, naiveTimestamps: 0, timeRange: null, params: [] };
  }

  function build(entries, report, opts) {
    const policy = opts.duplicates || 'keep-first';
    const byKey = new Map();
    for (const e of entries) {
      if (e.ts.error) { report.invalid.push({ line: e.line, column: e.column, reason: e.ts.error }); continue; }
      if (e.ts.naive) report.naiveTimestamps++;
      let v = e.isMissing ? { missing: true } : parseValue(e.raw, opts.delimiter);
      if (v.error) { report.invalid.push({ line: e.line, column: e.column, reason: v.error }); continue; }
      let value = null;
      if (!v.missing) {
        const c = units.toCanonical(e.param, v.value, e.unit || '');
        if (c.error) { report.invalid.push({ line: e.line, column: e.column, reason: c.error }); continue; }
        if (!units.inRange(e.param, c.value)) {
          const P = units.PARAMS[e.param];
          report.invalid.push({ line: e.line, column: e.column, reason: 'value ' + v.value + ' ' + (e.unit || P.unit) + ' outside plausible range ' + P.min + '–' + P.max + ' ' + P.unit });
          continue;
        }
        value = c.value;
      }
      const key = e.param + '|' + e.ts.ms;
      const prev = byKey.get(key);
      const obs = { param: e.param, value, ts: e.ts.ms, prov: Object.assign({ file: report.file, line: e.line, column: e.column,
        originalValue: e.raw === undefined ? null : e.raw, originalUnit: e.unit || null,
        timezone: e.ts.naive ? (opts.timezone || 'local') : (e.ts.zone || (e.ts.epoch ? 'epoch' : null)) }, e.prov || {}) };
      if (prev) {
        const same = prev.value === value || (prev.value !== null && value !== null && Math.abs(prev.value - value) < 1e-9);
        if (same) { report.duplicates++; continue; }
        report.conflicts.push({ param: e.param, time: new Date(e.ts.ms).toISOString(), kept: policy === 'keep-last' ? value : prev.value,
          dropped: policy === 'keep-last' ? prev.value : value, lines: [prev.prov.line, e.line] });
        if (policy === 'keep-last') byKey.set(key, obs);
        continue;
      }
      byKey.set(key, obs);
    }
    const out = [];
    const source = opts.source || observation.SOURCE.IMPORTED;
    for (const o of byKey.values()) {
      out.push(observation.make({ param: o.param, value: o.value, source, timestamp: o.ts, provenance: o.prov }));
      if (o.value === null) report.missing++; else report.accepted++;
    }
    out.sort((a, b) => a.timestamp - b.timestamp);
    if (out.length) report.timeRange = { start: new Date(out[0].timestamp).toISOString(), end: new Date(out[out.length - 1].timestamp).toISOString() };
    report.params = Array.from(new Set(out.map(o => o.param)));
    if (report.naiveTimestamps) report.warnings.push(report.naiveTimestamps + ' value(s) had timestamps without a zone; interpreted as ' + (opts.timezone || 'local') + '.');
    if (!out.length && !report.errors.length) report.errors.push('no usable values found');
    return out;
  }

  function findCol(names, list) {
    for (const want of list) { const i = names.indexOf(want); if (i >= 0) return i; }
    return -1;
  }

  /** Column mapping for a CSV header: {format:'wide'|'long', time, date?, clock?, params:{col: {param, unit}}, unmapped:[]} */
  function detectMapping(header) {
    const split = header.map(splitHeader);
    const names = split.map(x => x.name);
    const map = { format: 'wide', time: -1, params: {}, unmapped: [] };
    const pc = findCol(names, PARAM_COL), vc = findCol(names, VALUE_COL);
    const dateI = names.indexOf('date'), timeI = names.indexOf('time');
    if (dateI >= 0 && timeI >= 0 && findCol(names, TIME_NAMES.slice(0, -2)) < 0) { map.date = dateI; map.clock = timeI; }
    else map.time = findCol(names, TIME_NAMES);
    if (pc >= 0 && vc >= 0) {
      map.format = 'long'; map.param = pc; map.value = vc; map.unit = findCol(names, UNIT_COL);
      return map;
    }
    split.forEach((h, i) => {
      if (i === map.time || i === map.date || i === map.clock) return;
      const p = paramFor(h.name);
      if (p) map.params[i] = { param: p, unit: h.unit };
      else map.unmapped.push(header[i]);
    });
    return map;
  }

  function importCSV(text, file, opts) {
    const report = newReport(file, 'csv');
    const t = csv.parse(text);
    opts = Object.assign({}, opts, { delimiter: t.delimiter });
    t.errors.forEach(e => report.warnings.push('line ' + e.line + ': ' + e.msg));
    if (!t.header.length) { report.errors.push('empty file or no header row'); return { observations: [], report }; }
    const map = Object.assign(detectMapping(t.header), opts.mapping || {});
    report.mapping = describeMapping(t.header, map);
    if (map.time < 0 && map.date === undefined) { report.errors.push('no timestamp column (expected one of: ' + TIME_NAMES.join(', ') + ')'); return { observations: [], report }; }
    if (map.format === 'wide' && !Object.keys(map.params).length) { report.errors.push('no recognised parameter columns'); return { observations: [], report }; }
    const entries = [];
    t.rows.forEach((r, k) => {
      const line = t.lineOf[k];
      report.rowsRead++;
      const tsRaw = map.date !== undefined ? (r[map.date] || '') + ' ' + (r[map.clock] || '') : r[map.time];
      const ts = parseTimestamp(tsRaw, opts);
      if (map.format === 'long') {
        const p = paramFor(r[map.param] || '');
        if (!p) { report.invalid.push({ line, column: t.header[map.param], reason: 'unknown parameter "' + (r[map.param] || '') + '"' }); return; }
        const raw = r[map.value];
        if (raw === undefined || raw === '') { report.empty++; return; }
        entries.push({ line, column: t.header[map.value], param: p, raw, unit: map.unit >= 0 ? r[map.unit] : '', ts });
        return;
      }
      for (const [col, m] of Object.entries(map.params)) {
        const raw = r[col];
        if (raw === undefined || raw === '') { report.empty++; continue; }
        const unit = (opts.units && opts.units[m.param]) || m.unit;
        entries.push({ line, column: t.header[col], param: m.param, raw, unit, ts });
      }
    });
    if (entries.length > MAX_ENTRIES) { report.errors.push('file too large: more than ' + MAX_ENTRIES + ' values'); return { observations: [], report }; }
    return { observations: build(entries, report, opts), report };
  }

  function describeMapping(header, map) {
    const d = { format: map.format };
    if (map.date !== undefined) d.timestamp = header[map.date] + ' + ' + header[map.clock];
    else d.timestamp = map.time >= 0 ? header[map.time] : null;
    if (map.format === 'long') { d.param = header[map.param]; d.value = header[map.value]; d.unit = map.unit >= 0 ? header[map.unit] : null; }
    else {
      d.columns = Object.entries(map.params).map(([c, m]) => ({ column: header[c], param: m.param, unit: m.unit || units.PARAMS[m.param].unit + ' (assumed)' }));
      d.ignored = map.unmapped;
    }
    return d;
  }

  // ---------------------------------------------------------------- JSON
  function timeKey(obj) {
    for (const k of Object.keys(obj)) if (TIME_NAMES.includes(norm(k))) return k;
    return null;
  }

  function importJSON(text, file, opts) {
    opts = opts || {};
    const report = newReport(file, 'json');
    let data;
    try { data = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); }
    catch (e) { report.errors.push('malformed JSON: ' + e.message); return { observations: [], report }; }
    let list = null, ownExport = false;
    if (Array.isArray(data)) list = data;
    else if (data && typeof data === 'object') {
      if (data.format === 'pm-sim-observations') ownExport = true;
      list = data.observations || data.records || data.data || data.measurements || null;
    }
    if (!Array.isArray(list)) { report.errors.push('unrecognised JSON structure: expected an array of records or {observations|records|data: [...]}'); return { observations: [], report }; }
    if (ownExport) report.warnings.push('File is an export of this app. Values keep their original source in provenance.originalSource and are shown as imported.');
    const entries = [];
    list.forEach((rec, i) => {
      const line = i + 1; // record number
      report.rowsRead++;
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) { report.invalid.push({ line, column: '', reason: 'record is not an object' }); return; }
      const tk = timeKey(rec);
      const ts = parseTimestamp(tk ? rec[tk] : null, opts);
      const pk = Object.keys(rec).find(k => PARAM_COL.includes(norm(k)));
      const vk = Object.keys(rec).find(k => VALUE_COL.includes(norm(k)));
      if (pk && vk) {
        const p = paramFor(rec[pk] || '');
        if (!p) { report.invalid.push({ line, column: pk, reason: 'unknown parameter "' + rec[pk] + '"' }); return; }
        const uk = Object.keys(rec).find(k => UNIT_COL.includes(norm(k)));
        const prov = ownExport ? { originalSource: rec.source, originalQuality: rec.quality } : {};
        if (rec[vk] === undefined || rec[vk] === '') { report.empty++; return; }
        entries.push({ line, column: pk + '=' + rec[pk], param: p, raw: rec[vk], unit: uk ? rec[uk] : '', ts, prov, isMissing: rec[vk] === null });
        return;
      }
      let any = false;
      for (const [k, raw] of Object.entries(rec)) {
        if (k === tk) continue;
        const h = splitHeader(k), p = paramFor(h.name);
        if (!p) continue;
        any = true;
        let val = raw, unit = h.unit;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) { val = raw.value; unit = raw.unit || unit; }
        if (val === undefined || val === '') { report.empty++; continue; }
        entries.push({ line, column: k, param: p, raw: val, unit, ts, isMissing: val === null });
      }
      if (!any) report.invalid.push({ line, column: '', reason: 'no recognised parameter in record' });
    });
    if (entries.length > MAX_ENTRIES) { report.errors.push('file too large: more than ' + MAX_ENTRIES + ' values'); return { observations: [], report }; }
    return { observations: build(entries, report, opts), report };
  }

  /** Detect the format from the name or the first character and import. */
  function importText(text, file, opts) {
    const name = String(file || '');
    const first = String(text).replace(/^﻿/, '').trimStart()[0];
    if (/\.json$/i.test(name) || (!/\.(csv|tsv|txt)$/i.test(name) && (first === '{' || first === '['))) return importJSON(text, name, opts);
    return importCSV(text, name, opts);
  }

  /** Manual entry of one value by the user. */
  function manualEntry(o) {
    if (!units.PARAMS[o.param]) return { error: 'unknown parameter' };
    if (o.value === undefined || o.value === null || String(o.value).trim() === '') return { error: 'enter a number' };
    const v = parseValue(o.value, ';');
    if (v.missing || v.error) return { error: v.error || 'enter a number' };
    const c = units.toCanonical(o.param, v.value, o.unit || '');
    if (c.error) return { error: c.error };
    if (!units.inRange(o.param, c.value)) {
      const P = units.PARAMS[o.param];
      return { error: 'outside plausible range ' + P.min + '–' + P.max + ' ' + P.unit };
    }
    const ts = o.timestamp === undefined || o.timestamp === '' ? { ms: Date.now() } : parseTimestamp(o.timestamp, { timezone: o.timezone || 'local' });
    if (ts.error) return { error: ts.error };
    return { observation: observation.make({ param: o.param, value: c.value, source: observation.SOURCE.USER, timestamp: ts.ms,
      provenance: { entry: 'manual', originalValue: String(o.value), originalUnit: o.unit || null, note: o.note || '', device: o.device || '' } }) };
  }

  return { importText, importCSV, importJSON, parseTimestamp, parseValue, detectMapping, splitHeader, paramFor, manualEntry, SYNONYMS, MAX_ENTRIES };
});
