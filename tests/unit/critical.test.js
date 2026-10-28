'use strict';
// Critical-illness scenarios (deterioration before arrest, peri-arrest, stroke,
// heart failure). Each runs the full simulation and checks what the monitor and
// the alarm engine report, including what they cannot see.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine } = require('../../src/sim/engine.js');
const params = require('../../src/sim/params.js');
const { AlarmEngine, EXTREME_LOW } = require('../../src/alarms/alarmEngine.js');

function run(preset, seconds, limits) {
  const e = new Engine(params.applyPreset(preset, params.DEFAULTS).params);
  const frames = [];
  e.onFrame = f => frames.push(f);
  e.advance(seconds);
  const alarms = new AlarmEngine(limits);
  let st;
  for (const f of frames.filter(f => f.t >= 5)) st = alarms.evaluate(f);
  return { e, last: frames[frames.length - 1], active: st.active };
}
const ids = active => active.map(a => a.id).sort();
const high = active => active.filter(a => a.priority === 'high').map(a => a.id).sort();

test('deteriorating: several medium alarms together, none high priority', () => {
  const { last, active } = run('deteriorating', 60);
  assert.ok(last.est.rr > 30 && last.est.hr > 120 && last.est.spo2 < 90, JSON.stringify(last.est));
  for (const id of ['rr:high', 'spo2:low', 'hr:high', 'art_sys:low'])
    assert.ok(ids(active).includes(id), id + ' in ' + ids(active));
  assert.deepEqual(high(active), []);
});

test('peri-arrest: extreme-low alarms are high priority; asystole follows', () => {
  const { last, active } = run('periarrest', 60);
  assert.ok(last.est.hr < EXTREME_LOW.hr.value && last.est.spo2 < EXTREME_LOW.spo2.value, JSON.stringify(last.est));
  assert.deepEqual(high(active), ['hr:extreme', 'spo2:extreme']);
  for (const id of ['hr:low', 'spo2:low', 'rr:low', 'etco2:low', 'art_sys:low', 'art_map:low'])
    assert.ok(ids(active).includes(id), id);
  assert.ok(last.est.etco2 < 25, 'low EtCO2 with low output: ' + last.est.etco2);
  // Disabling a limit also disables its extreme alarm.
  const lim = JSON.parse(JSON.stringify(require('../../src/alarms/alarmEngine.js').DEFAULT_LIMITS));
  lim.hr.enabled = false;
  assert.ok(!ids(run('periarrest', 30, lim).active).includes('hr:extreme'));
  // The next step, arrest, is the existing asystole pattern.
  assert.ok(high(run('asystole', 30).active).includes('rhythm:asystole'));
});

test('extreme alarms do not fire for the milder slow-rate and desaturation scenarios', () => {
  for (const id of ['brady', 'desat', 'hypothermia', 'cushing'])
    assert.ok(!run(id, 40).active.some(a => a.id.endsWith(':extreme')), id);
});

test('stroke: pressure above the 185/110 thrombolysis limit raises only pressure alarms', () => {
  const { last, active } = run('stroke', 40);
  assert.ok(last.est.art.sys > 185, 'ART sys ' + last.est.art.sys);
  assert.equal(last.est.rhythm, 'regular');
  assert.deepEqual(ids(active), ['art_map:high', 'art_sys:high']);
});

test('heart failure: warm-wet, cold-wet and shock differ in what the monitor shows', () => {
  const wet = run('hf-oedema', 40);
  for (const id of ['art_sys:high', 'spo2:low', 'rr:high']) assert.ok(ids(wet.active).includes(id), id);
  // Cold-wet: narrow proportional pulse pressure (< 25 %) and low PI, yet no alarm.
  const cold = run('hf-cold-wet', 40);
  const a = cold.last.est.art;
  assert.ok((a.sys - a.dia) / a.sys < 0.25, 'pulse pressure ' + (a.sys - a.dia) + '/' + a.sys);
  assert.deepEqual(ids(cold.active), []);
  // Shock: hypotension and low MAP; same alarm types as the blood-loss pattern.
  const shock = run('cardiogenic-shock', 40);
  for (const id of ['art_sys:low', 'art_map:low', 'spo2:low']) assert.ok(ids(shock.active).includes(id), id);
  assert.ok(shock.last.est.art.map < 65);
});

test('post-operative: opioid hypoventilation, shivering artefact, pulmonary complication', () => {
  const op = run('postop-opioid', 60);
  for (const id of ['rr:low', 'etco2:high', 'spo2:low']) assert.ok(ids(op.active).includes(id), id);
  assert.ok(op.last.est.etco2 > 55, 'EtCO2 ' + op.last.est.etco2);
  // Shivering: low temperature alarm, and a false low SpO2 (set point 97 %) that
  // the R-consistency quality index does not flag.
  const hy = run('postop-hypothermia', 60);
  assert.ok(ids(hy.active).includes('temp:low'));
  assert.ok(hy.last.est.spo2 < 90, 'artefactual SpO2 ' + hy.last.est.spo2);
  assert.equal(hy.last.technical.spo2LowSQI, false);
  const ppc = run('postop-ppc', 60);
  assert.deepEqual(ids(ppc.active), ['spo2:low']);
  assert.ok(ppc.last.est.rr > 24 && ppc.last.est.hr > 100);
});
