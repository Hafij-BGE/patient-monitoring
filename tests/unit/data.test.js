'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const csv = require('../../src/data/csv.js');
const imp = require('../../src/data/importer.js');
const { ObservationStore } = require('../../src/core/store.js');
const { Engine, frameObservations } = require('../../src/sim/engine.js');
const params = require('../../src/sim/params.js');

const FIX = path.join(__dirname, '..', '..', 'fixtures');
const load = (name, opts) => imp.importText(fs.readFileSync(path.join(FIX, name), 'utf8'), name, opts);
const series = (obs, p) => obs.filter(o => o.param === p).map(o => o.value);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('CSV reader: quotes, doubled quotes, CRLF, BOM, delimiter detection', () => {
  const t = csv.parse('﻿a,b,c\r\n1,"x, ""y""",3\r\n\r\n4,5,6\r\n');
  assert.deepEqual(t.header, ['a', 'b', 'c']);
  assert.deepEqual(t.rows, [['1', 'x, "y"', '3'], ['4', '5', '6']]);
  assert.deepEqual(t.lineOf, [2, 4]);
  assert.equal(csv.detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(csv.detectDelimiter('a\tb\n1\t2'), '\t');
  assert.match(csv.parse('a,b\n1,"open').errors[0].msg, /unterminated/);
});

test('§19.10 wide CSV import: header synonyms, units in brackets, empty cells skipped', () => {
  const { observations: o, report: r } = load('vitals_wide_valid.csv');
  assert.deepEqual(r.errors, []);
  assert.equal(r.format, 'csv');
  assert.equal(r.mapping.format, 'wide');
  assert.deepEqual(r.mapping.columns.map(c => c.param), ['hr', 'spo2', 'sbp', 'dbp', 'rr', 'temp']);
  assert.equal(r.rowsRead, 5);
  assert.equal(r.accepted, 26);         // 5 rows × 6 columns − 4 empty NIBP cells
  assert.equal(r.empty, 4);
  assert.deepEqual(series(o, 'hr'), [72, 74, 71, 75, 73]);
  assert.deepEqual(series(o, 'sbp'), [118, 121, 119]);
  assert.equal(r.timeRange.start, '2026-10-20T05:00:00.000Z'); // +03:00 offset applied
  assert.ok(o.every(x => x.source === 'imported'));
  const first = o.find(x => x.param === 'temp');
  assert.equal(first.provenance.file, 'vitals_wide_valid.csv');
  assert.equal(first.provenance.line, 2);
  assert.equal(first.provenance.column, 'Temp (°C)');
  assert.equal(first.provenance.timezone, '+03:00');
});

test('§19.13 long CSV import converts kPa, °F and lb to canonical units', () => {
  const { observations: o, report: r } = load('vitals_long_valid.csv');
  assert.equal(r.mapping.format, 'long');
  assert.equal(r.accepted, 7);
  const get = p => o.find(x => x.param === p);
  assert.ok(near(get('sbp').value, 120.0, 0.05));
  assert.ok(near(get('dbp').value, 78.0, 0.05));
  assert.ok(near(get('temp').value, 37.0, 1e-9));
  assert.ok(near(get('weight').value, 69.99, 0.01));
  assert.equal(get('temp').unit, '°C');
  assert.equal(get('temp').provenance.originalUnit, '°F');
  assert.equal(get('temp').provenance.originalValue, '98.6');
});

test('§19.13 semicolon file: decimal comma, separate date/time columns, DD.MM.YYYY', () => {
  const { observations: o, report: r } = load('vitals_semicolon_decimal_comma.csv', { timezone: 'UTC' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.mapping.timestamp, 'date + time');
  assert.deepEqual(series(o, 'temp'), [36.8, 37.1, 36.7]);
  assert.deepEqual(series(o, 'weight'), [70.4, 70.1]);
  assert.deepEqual(series(o, 'pr'), [72, 76, 70]);
  assert.equal(r.timeRange.start, '2026-10-20T08:00:00.000Z');
  assert.equal(r.timeRange.end, '2026-10-21T08:00:00.000Z');
  assert.match(r.warnings.join(' '), /without a zone; interpreted as UTC/);
});

test('§19.13 units in column names (temp_f, weight_lb, height_in, SBP (kPa))', () => {
  const { observations: o, report: r } = load('vitals_units_fahrenheit_lb_kpa.csv', { timezone: 'UTC' });
  assert.deepEqual(r.errors, []);
  const units = Object.fromEntries(r.mapping.columns.map(c => [c.param, c.unit]));
  assert.deepEqual(units, { temp: 'f', weight: 'lb', height: 'in', sbp: 'kPa', dbp: 'kPa' });
  const t = series(o, 'temp');
  assert.ok(near(t[0], 37, 1e-9) && near(t[1], 38, 1e-9));
  assert.ok(near(series(o, 'weight')[0], 70.0, 0.01));
  assert.ok(near(series(o, 'height')[0], 171.96, 0.01));
  assert.ok(near(series(o, 'sbp')[0], 120.0, 0.05));
});

test('§19.13 timestamps: Z, offset, naive in chosen zone, epoch s/ms and dotted dates agree', () => {
  const { observations: o, report: r } = load('vitals_timezones.csv', { timezone: '+04:00' });
  assert.deepEqual(r.invalid, []);
  const iso = o.map(x => new Date(x.timestamp).toISOString().slice(11, 16));
  assert.deepEqual(iso, ['08:00', '08:01', '08:02', '08:03', '08:04', '08:05']);
  assert.deepEqual(o.map(x => x.value), [70, 71, 72, 73, 74, 75]);
  assert.equal(r.naiveTimestamps, 2);
  // the same naive file read as UTC shifts only the naive rows
  const utc = load('vitals_timezones.csv', { timezone: 'UTC' }).observations;
  assert.equal(new Date(utc.find(x => x.value === 72).timestamp).toISOString().slice(11, 16), '12:02');
  assert.equal(new Date(utc.find(x => x.value === 70).timestamp).toISOString().slice(11, 16), '08:00');
});

test('timestamp parser rejects impossible and ambiguous dates', () => {
  assert.match(imp.parseTimestamp('2026-02-30T08:00:00Z').error, /does not exist/);
  assert.match(imp.parseTimestamp('03/04/2026').error, /ambiguous/);
  assert.equal(new Date(imp.parseTimestamp('03/04/2026', { dateOrder: 'MDY', timezone: 'UTC' }).ms).toISOString().slice(0, 10), '2026-03-04');
  assert.equal(new Date(imp.parseTimestamp('03/04/2026', { dateOrder: 'DMY', timezone: 'UTC' }).ms).toISOString().slice(0, 10), '2026-04-03');
  assert.equal(new Date(imp.parseTimestamp('25/12/2026', { timezone: 'UTC' }).ms).toISOString().slice(0, 10), '2026-12-25');
  assert.match(imp.parseTimestamp('2026-10-20T08:00', { timezone: 'Mars/Olympus' }).error, /timezone/);
});

test('§19.12 missing tokens become missing observations; duplicates dropped; conflicts reported', () => {
  const { observations: o, report: r } = load('vitals_missing_duplicates.csv');
  assert.deepEqual(series(o, 'hr'), [72, null, 73, 74, null]);   // keep-first on the 08:03 conflict
  assert.deepEqual(series(o, 'spo2'), [97, 96, null, 95]);        // empty cell at 08:04 skipped, not missing
  assert.deepEqual(series(o, 'rr'), [14, 14, null, 15, 16]);
  assert.equal(r.missing, 4);
  assert.equal(r.duplicates, 5); // second 08:02 row (3 values) + identical spo2/rr at 08:03
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual(r.conflicts[0], { param: 'hr', time: '2026-10-20T08:03:00.000Z', kept: 74, dropped: 80, lines: [6, 7] });
  o.filter(x => x.value === null).forEach(x => assert.equal(x.quality, 'missing'));
  const last = load('vitals_missing_duplicates.csv', { duplicates: 'keep-last' });
  assert.equal(series(last.observations, 'hr')[3], 80);
  assert.equal(last.report.conflicts[0].kept, 80);
});

test('§19.11 malformed CSV: bad rows are rejected and listed, good rows survive', () => {
  const { observations: o, report: r } = load('vitals_malformed.csv');
  assert.deepEqual(r.errors, []);
  const reasons = r.invalid.map(x => x.line + ':' + x.reason).join('\n');
  assert.match(reasons, /3:not a number: "abc"/);
  assert.match(reasons, /4:day does not exist/);
  assert.match(reasons, /5:unrecognised timestamp "yesterday"/);
  assert.match(reasons, /6:value 999 bpm outside plausible range/);
  assert.match(r.warnings.join('\n'), /line 7: expected 3 fields, found 4/);
  assert.match(r.warnings.join('\n'), /unterminated quoted field/);
  assert.equal(series(o, 'hr')[0], 72);
  assert.ok(o.every(x => x.value === null || (x.value >= 15 && x.value <= 350)));
});

test('§19.11 malformed or empty inputs fail cleanly with nothing imported', () => {
  for (const [text, file, re] of [
    [fs.readFileSync(path.join(FIX, 'vitals_malformed.json'), 'utf8'), 'vitals_malformed.json', /malformed JSON/],
    ['', 'empty.csv', /empty file/],
    ['foo,bar\n1,2\n', 'nots.csv', /no timestamp column/],
    ['timestamp,colour\n2026-10-20T08:00Z,blue\n', 'noparam.csv', /no recognised parameter/],
    ['{"hello": 1}', 'x.json', /unrecognised JSON structure/],
  ]) {
    const { observations, report } = imp.importText(text, file);
    assert.equal(observations.length, 0, file);
    assert.match(report.errors.join(' '), re, file);
  }
});

test('§19.10 JSON import: wrapped wide records with nested units, null as missing, long arrays', () => {
  const a = load('vitals_records.json');
  assert.deepEqual(a.report.errors, []);
  assert.equal(a.report.format, 'json');
  assert.deepEqual(series(a.observations, 'hr'), [72, 75, 78]);
  assert.deepEqual(series(a.observations, 'spo2'), [97, null]);
  assert.ok(near(series(a.observations, 'temp')[0], 37.17, 0.01));
  assert.deepEqual(series(a.observations, 'steps'), [120, 340]);
  assert.deepEqual(series(a.observations, 'weight'), [70.2]);
  const b = load('vitals_long.json');
  assert.equal(b.report.accepted, 2);
  assert.match(b.report.invalid[0].reason, /unknown parameter "glucose"/);
});

test('§19.14 imported, simulated and user data stay separate; exports re-import as "imported"', () => {
  const store = new ObservationStore();
  const e = new Engine(params.DEFAULTS);
  e.onFrame = f => store.addMany(frameObservations(f));
  e.advance(10);
  store.addMany(load('vitals_wide_valid.csv').observations);
  const m = imp.manualEntry({ param: 'weight', value: '154.3', unit: 'lb', timestamp: '2026-10-20T08:00:00Z' });
  assert.ok(m.observation, m.error);
  store.add(m.observation);
  assert.ok(store.get('simulated', 'hr').length > 0);
  assert.equal(store.get('imported', 'hr').length, 5);
  assert.equal(store.get('user', 'weight').length, 1);
  assert.ok(store.get('simulated', 'hr').every(o => o.provenance.file === undefined));
  // round trip: the app's own export comes back as imported, original source kept
  const { toJSON } = require('../../src/core/store.js');
  const back = imp.importText(toJSON(store.get('user', 'weight')), 'export.json');
  assert.equal(back.observations[0].source, 'imported');
  assert.equal(back.observations[0].provenance.originalSource, 'user');
  assert.ok(near(back.observations[0].value, 69.99, 0.01));
});

test('manual entry validates value, unit, range and timestamp', () => {
  assert.match(imp.manualEntry({ param: 'hr', value: 'fast' }).error, /not a number/);
  assert.match(imp.manualEntry({ param: 'hr', value: '' }).error, /enter a number/);
  assert.match(imp.manualEntry({ param: 'hr', value: 900 }).error, /outside plausible range/);
  assert.match(imp.manualEntry({ param: 'temp', value: 37, unit: 'K' }).error, /unsupported unit/);
  assert.match(imp.manualEntry({ param: 'hr', value: 70, timestamp: 'soon' }).error, /unrecognised timestamp/);
  assert.equal(imp.manualEntry({ param: 'glucose', value: 5 }).error, 'unknown parameter');
  const ok = imp.manualEntry({ param: 'temp', value: '37,2', unit: '°C', device: 'home thermometer' }).observation;
  assert.equal(ok.value, 37.2);
  assert.equal(ok.source, 'user');
  assert.equal(ok.provenance.device, 'home thermometer');
});
