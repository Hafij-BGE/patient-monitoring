'use strict';
// Glucose–insulin teaching model (src/sim/glucose.js) and its engine/alarm wiring.
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../../src/sim/glucose.js');
const { Engine, frameObservations } = require('../../src/sim/engine.js');
const params = require('../../src/sim/params.js');
const { AlarmEngine } = require('../../src/alarms/alarmEngine.js');
const units = require('../../src/core/units.js');

const P = (o) => Object.assign({ weight_kg: 70, diabetes: 'none', fasting_glucose: 90, fasting_insulin: 10, basal_insulin: 0 }, o);

test('glucose model holds its steady state without events (each diabetes status)', () => {
  for (const diabetes of ['none', 'type2', 'type1']) {
    const m = new g.GlucoseModel(P({ diabetes, fasting_glucose: 140, basal_insulin: diabetes === 'type1' ? 0.8 : 0 }));
    m.advance(600);
    assert.ok(Math.abs(m.values().glucose - 140) < 0.01, diabetes + ' drifted to ' + m.values().glucose);
  }
});

test('a 50 g meal raises glucose, then it returns towards fasting (no diabetes)', () => {
  const f = new g.GlucoseModel(P()).forecast(300, [{ at: 0, carbs: 50 }]);
  assert.ok(f.maxG > 120, 'peak ' + f.maxG);
  const tPeak = f.G.indexOf(f.maxG);
  assert.ok(tPeak > 20 && tPeak < 120, 'peak time ' + tPeak);
  assert.ok(Math.abs(f.G[300] - 90) < 15, 'after 5 h ' + f.G[300]);
});

test('same meal: type 2 and type 1 (no insulin) peak higher and stay higher at 2 h than no diabetes', () => {
  const meal = [{ at: 0, carbs: 50 }];
  const none = new g.GlucoseModel(P()).forecast(240, meal);
  const t2 = new g.GlucoseModel(P({ diabetes: 'type2' })).forecast(240, meal);
  const t1 = new g.GlucoseModel(P({ diabetes: 'type1' })).forecast(240, meal);
  for (const d of [t2, t1]) {
    assert.ok(d.maxG > none.maxG + 10, 'peak ' + d.maxG + ' vs ' + none.maxG);
    assert.ok(d.G[120] > none.G[120] + 30, '2 h ' + d.G[120] + ' vs ' + none.G[120]);
  }
});

test('an insulin bolus lowers glucose compared with no bolus (type 1)', () => {
  const m = new g.GlucoseModel(P({ diabetes: 'type1', fasting_glucose: 200, basal_insulin: 0.8 }));
  const without = m.forecast(240, []), withBolus = m.forecast(240, [{ at: 0, units: 6 }]);
  assert.ok(withBolus.G[240] < without.G[240] - 10, withBolus.G[240] + ' vs ' + without.G[240]);
  assert.ok(Math.max(...withBolus.I) > Math.max(...without.I));
});

test('forecast reports first crossing times of the 70 / 54 / 180 / 250 mg/dL thresholds and does not change the model', () => {
  const m = new g.GlucoseModel(P({ diabetes: 'type1', fasting_glucose: 100, basal_insulin: 0.8 }));
  const hi = m.forecast(240, [{ at: 30, carbs: 80 }]);
  assert.ok(hi.cross.above180 > 30, 'above 180 at ' + hi.cross.above180);
  assert.equal(hi.cross.below70, null);
  const lo = m.forecast(240, [{ at: 0, units: 20 }]);
  assert.ok(lo.cross.below70 !== null && (lo.cross.below54 === null || lo.cross.below54 >= lo.cross.below70));
  assert.ok(lo.tir >= 0 && lo.tir <= 100);
  assert.equal(m.values().glucose, 100); // forecast runs on a copy
});

test('glucose units: mmol/L ↔ mg/dL (×18.016) in the model and in the import converters', () => {
  assert.ok(Math.abs(g.toMgdl(5.5) - 99.09) < 0.01);
  assert.ok(Math.abs(g.toMmol(180) - 9.99) < 0.01);
  assert.ok(Math.abs(units.toCanonical('glucose', 5.5, 'mmol/L').value - 99.09) < 0.01);
  assert.equal(units.toCanonical('insulin', 12, 'mU/L').value, 12);
});

test('engine: glucose follows the model clock, meals act, observations are labelled simulated', () => {
  const e = new Engine(Object.assign({}, params.DEFAULTS, { glu_clock: 60 }));
  e.advance(2);
  assert.equal(e.lastFrame.est.glucose, 90);
  e.giveMeal(60);
  e.advance(40); // 40 s × 60 = 40 model minutes
  assert.ok(e.lastFrame.est.glucose > 110, 'glucose ' + e.lastFrame.est.glucose);
  const obs = frameObservations(e.lastFrame).filter(o => o.param === 'glucose');
  assert.equal(obs.length, 1);
  assert.equal(obs[0].source, 'simulated');
  assert.equal(obs[0].unit, 'mg/dL');
  // changing diabetes status restarts the model at the fasting value
  e.setParams({ diabetes: 'type2', fasting_glucose: 150 });
  e.advance(1);
  assert.ok(Math.abs(e.lastFrame.est.glucose - 150) < 0.01);
});

test('glucose alarms: medium below 70 or above 180, high-priority level 2 below 54', () => {
  const a = new AlarmEngine();
  const frame = (glucose, t) => ({ t, est: { glucose, rhythm: 'sinus' }, technical: {}, nibp: {} });
  let st = a.evaluate(frame(200, 1));
  assert.ok(st.active.some(x => x.id === 'glucose:high' && x.priority === 'medium'));
  st = a.evaluate(frame(60, 2));
  assert.ok(st.active.some(x => x.id === 'glucose:low'));
  assert.ok(!st.active.some(x => x.id === 'glucose:level2'));
  st = a.evaluate(frame(50, 3));
  assert.ok(st.active.some(x => x.id === 'glucose:level2' && x.priority === 'high'));
});
