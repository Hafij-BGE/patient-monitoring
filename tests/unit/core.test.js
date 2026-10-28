'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const units = require('../../src/core/units.js');
const observation = require('../../src/core/observation.js');
const profile = require('../../src/core/profile.js');
const { ObservationStore, findGaps, toCSV, toJSON } = require('../../src/core/store.js');

test('unit conversions are explicit and exact', () => {
  assert.equal(units.toCanonical('temp', 98.6, '°F').value.toFixed(2), '37.00');
  assert.equal(units.toCanonical('weight', 154.3236, 'lb').value.toFixed(3), '70.000');
  assert.equal(units.toCanonical('sbp', 16, 'kPa').value.toFixed(1), '120.0');
  assert.equal(units.toCanonical('height', 1.72, 'm').value, 172);
  assert.equal(units.toCanonical('hr', 70, '').value, 70);
  assert.ok(units.toCanonical('hr', 70, 'furlongs').error);
  assert.ok(units.toCanonical('nope', 1, '').error);
  const fi = units.cmToFtIn(172);
  assert.equal(fi.ft, 5);
  assert.ok(Math.abs(units.ftInToCm(fi.ft, fi.in) - 172) < 0.1); // inches rounded to 0.1
});

test('observations keep source and provenance; missing is null, never 0', () => {
  const o = observation.make({ param: 'spo2', value: NaN, source: 'imported', provenance: { file: 'x.csv' } });
  assert.equal(o.value, null);
  assert.equal(o.quality, 'missing');
  assert.equal(o.provenance.file, 'x.csv');
  assert.ok(Object.isFrozen(o));
  assert.throws(() => observation.make({ param: 'spo2', value: 1, source: 'magic' }));
  assert.throws(() => observation.make({ param: 'bogus', value: 1, source: 'user' }));
});

test('profile: BMI, BSA (Mosteller), paediatric note, weight change', () => {
  assert.equal(profile.bmi(70, 172).toFixed(1), '23.7');
  assert.equal(profile.bsaMosteller(70, 172).toFixed(2), '1.83');
  assert.equal(profile.bmi(0, 172), null);
  assert.ok(profile.bmiCategory(23.7, 40).category);
  assert.equal(profile.bmiCategory(23.7, 12).category, null);
  assert.match(profile.bmiCategory(23.7, 12).note, /age|sex/i);
  const ch = profile.weightChange([{ date: '2026-01-01', kg: 80 }, { date: '2026-03-01', kg: 76 }]);
  assert.equal(ch.absKg, -4);
  assert.equal(ch.pct, -5);
});

test('store: series by source, gaps reported not filled, CSV/JSON export', () => {
  const s = new ObservationStore();
  const t0 = Date.UTC(2026, 0, 1);
  [72, 73, null, 75].forEach((v, i) => s.add(observation.make({ param: 'hr', value: v, source: 'imported', timestamp: t0 + i * 60000 })));
  s.add(observation.make({ param: 'hr', value: 70, source: 'simulated', timestamp: t0 }));
  assert.equal(s.get('imported', 'hr').length, 4);
  assert.equal(s.get('simulated', 'hr').length, 1);
  const gaps = findGaps(s.get('imported', 'hr'), 120000);
  assert.ok(gaps.length >= 1);
  const csv = toCSV(s.all());
  assert.match(csv.split('\n')[0], /timestamp_iso,sim_time_s,param,value,unit,source,quality,provenance/);
  const js = JSON.parse(toJSON(s.all(), {}));
  assert.equal(js.format, 'pm-sim-observations');
  assert.equal(js.observations.length, 5);
});
