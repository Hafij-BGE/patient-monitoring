'use strict';
const test = require('node:test');
const assert = require('node:assert');
const importer = require('../../src/data/importer.js');
const units = require('../../src/core/units.js');
const { SAMPLES } = require('../../src/data/samples.js');

test('every downloadable sample imports with no invalid value and no error', () => {
  assert.strictEqual(SAMPLES.length, 4);
  for (const s of SAMPLES) {
    const r = importer.importText(s.text, s.file, { timezone: 'UTC' });
    assert.deepStrictEqual(r.report.errors, [], s.file);
    assert.deepStrictEqual(r.report.invalid, [], s.file);
    assert.ok(r.report.accepted >= 10, s.file + ': ' + r.report.accepted + ' accepted');
  }
});

test('samples show the documented conversions and missing values', () => {
  const by = f => importer.importText(SAMPLES.find(s => s.file === f).text, f, { timezone: 'UTC' }).observations;
  const long = by('vitals_long_template.csv');
  const get = (list, p, i) => list.filter(o => o.param === p)[i || 0].value;
  assert.ok(Math.abs(get(long, 'temp') - (98.4 - 32) * 5 / 9) < 1e-9);    // °F → °C
  assert.ok(Math.abs(get(long, 'weight') - 155.4 / units.LB_PER_KG) < 1e-9); // lb → kg
  assert.ok(Math.abs(get(long, 'sbp', 1) - 16.1 * units.MMHG_PER_KPA) < 1e-9); // kPa → mmHg
  assert.ok(Math.abs(get(long, 'glucose') - 5.3 * 18.016) < 1e-9);        // mmol/L → mg/dL
  assert.strictEqual(long.filter(o => o.param === 'spo2' && o.value === null).length, 1); // N/A stays missing
  const semi = by('vitals_semicolon_decimal_comma.csv');
  assert.strictEqual(get(semi, 'temp'), 36.8);                          // decimal comma
  const wide = by('vitals_wide_template.csv');
  assert.strictEqual(wide.filter(o => o.param === 'sbp').length, 3);   // empty cells are not values
  assert.strictEqual(wide.filter(o => o.param === 'temp' && o.value === null).length, 1);
});

test('acceptedUnits lists the canonical unit first and every unit toCanonical accepts', () => {
  for (const p of Object.keys(units.PARAMS)) {
    const list = units.acceptedUnits(p);
    assert.strictEqual(list[0], units.normUnit(units.PARAMS[p].unit), p);
    for (const u of list) assert.ok(units.toCanonical(p, 1, u).value !== undefined, p + ' ' + u);
  }
  assert.ok(units.toCanonical('temp', 1, 'kelvin').error);
});
