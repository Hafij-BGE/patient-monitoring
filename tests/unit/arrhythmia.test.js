'use strict';
// Arrhythmia patterns, capnography and the arterial line. Each test runs the full
// simulation (patient model → sensor → monitor algorithm) and checks what the
// monitor reports, so a mistake in any stage shows up.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, IBP_DAMPING, HYDRO_MMHG_PER_CM } = require('../../src/sim/engine.js');
const params = require('../../src/sim/params.js');
const arr = require('../../src/sim/arrhythmia.js');
const { AlarmEngine } = require('../../src/alarms/alarmEngine.js');

function run(preset, seconds, changes) {
  const p = Object.assign(params.applyPreset(preset, params.DEFAULTS).params, changes || {});
  const e = new Engine(p);
  const frames = [];
  e.onFrame = f => frames.push(f);
  e.advance(seconds);
  return { e, frames, last: frames[frames.length - 1] };
}
const after = (frames, t0) => frames.filter(f => f.t >= t0);
const share = (frames, rhythm) => frames.filter(f => f.est.rhythm === rhythm).length / frames.length;

test('rhythm analyser labels each teaching rhythm (≥ 90 % of frames after learning)', () => {
  const expect = { baseline: 'regular', tachy: 'regular', brady: 'regular', af: 'irregular', pvc: 'pvc',
    vt: 'vtach', vf: 'vfib', asystole: 'asystole' };
  for (const [id, rhythm] of Object.entries(expect)) {
    const { frames } = run(id, 60);
    assert.ok(share(after(frames, 10), rhythm) >= 0.9, id + ' → ' + rhythm);
  }
});

test('rhythm analysis is "learning" at first and "Not analysed" with leads off', () => {
  const { frames } = run('baseline', 12);
  assert.equal(frames[2].est.rhythm, 'learning');
  const off = run('disconnect', 15).last;
  assert.equal(off.est.rhythm, 'unavailable');
  assert.equal(off.est.rhythmLabel, arr.LABELS.unavailable);
});

test('PVC: early wide beat, compensatory pause, weaker pulse', () => {
  const { e } = run('pvc', 90);
  const t = e.trueR, k = e.trueKinds;
  let checked = 0;
  for (let i = 1; i < k.length - 1; i++) {
    if (k[i] !== 'pvc' || k[i - 1] !== 'normal' || k[i + 1] !== 'normal') continue;
    const before = t[i] - t[i - 1], pause = t[i + 1] - t[i], mean = 60 / e.p.hr;
    assert.ok(before < 0.8 * mean, 'premature: ' + before.toFixed(2));
    assert.ok(before + pause > 1.7 * mean, 'compensatory pause: ' + (before + pause).toFixed(2));
    checked++;
  }
  assert.ok(checked >= 5, 'saw ' + checked + ' PVCs');
  assert.ok(arr.PULSE_AMP.pvc < arr.PULSE_AMP.normal);
  const last = run('pvc', 60).last.est;
  assert.ok(last.pvcPerMin >= 6 && last.pvcPerMin <= 25, 'PVC rate ' + last.pvcPerMin);
});

test('V-Tach: wide complexes at the set rate; V-Fib and asystole: no HR, pressure and EtCO₂ fall', () => {
  const vt = run('vt', 30).last.est;
  assert.ok(vt.qrsWidthMs > 100, 'VT width ' + vt.qrsWidthMs);
  assert.ok(Math.abs(vt.hr - 170) < 10, 'VT rate ' + vt.hr);
  for (const id of ['vf', 'asystole']) {
    const { last } = run(id, 40);
    assert.equal(last.est.hr, null, id);
    assert.ok(last.truth.perfusion < 0.05, id + ' perfusion');
    assert.ok(last.est.art.map < 15, id + ' ART MAP ' + last.est.art.map);
    assert.ok(last.est.etco2 < 10, id + ' EtCO₂ ' + last.est.etco2);
  }
});

test('lethal rhythms raise high-priority alarms with no delay', () => {
  for (const [id, alarm] of [['vt', 'rhythm:vtach'], ['vf', 'rhythm:vfib'], ['asystole', 'rhythm:asystole']]) {
    const e = new Engine(params.applyPreset(id, params.DEFAULTS).params);
    const a = new AlarmEngine();
    e.onFrame = f => a.evaluate(f);
    e.advance(20);
    const hit = a.state().active.find(x => x.id === alarm);
    assert.ok(hit, id);
    assert.equal(hit.priority, 'high');
  }
});

test('capnography: EtCO₂, FiCO₂ and airway rate follow the settings', () => {
  const base = run('baseline', 40).last.est;
  assert.ok(Math.abs(base.etco2 - 38) < 2, 'EtCO₂ ' + base.etco2);
  assert.ok(base.fico2 < 1);
  assert.ok(Math.abs(base.awrr - 14) < 1);
  const hypo = run('hypovent', 60).last.est;
  assert.ok(hypo.etco2 > 54 && Math.abs(hypo.awrr - 6) < 1, 'hypoventilation ' + hypo.etco2);
  const reb = run('rebreathing', 40).last.est;
  assert.ok(Math.abs(reb.fico2 - 6) < 1.5, 'FiCO₂ ' + reb.fico2);
  const ap = run('apnea', 60).last.est;
  assert.equal(ap.etco2, null);
});

test('capnography: obstruction slopes the plateau (phase III) without changing EtCO₂ much', () => {
  const slope = preset => {
    const { e } = run(preset, 30);
    const c = e.capS.last(4 * 50);
    // rise from 40 % to 95 % of the peak, in samples
    const peak = Math.max(...c);
    let i40 = -1, i95 = -1;
    for (let i = 1; i < c.length; i++) {
      if (i40 < 0 && c[i - 1] < 0.4 * peak && c[i] >= 0.4 * peak) i40 = i;
      if (i40 >= 0 && c[i] >= 0.95 * peak) { i95 = i; break; }
    }
    return { rise: i95 - i40, peak };
  };
  const n = slope('baseline'), o = slope('bronchospasm');
  assert.ok(o.rise > 2 * n.rise, 'rise ' + n.rise + ' vs ' + o.rise);
  assert.ok(Math.abs(o.peak - n.peak) < 4);
});

test('capnography: disconnected line → no value and a technical alarm', () => {
  const { last } = run('baseline', 20, { capno_sensor: 'disconnected' });
  assert.equal(last.est.etco2, null);
  assert.equal(last.technical.capnoNoSignal, true);
});

test('arterial line: optimal damping reads the set pressure; under-damping overshoots, MAP kept', () => {
  const opt = run('baseline', 15).last;
  assert.ok(Math.abs(opt.est.art.sys - opt.truth.sbp) < 4, 'sys ' + opt.est.art.sys);
  assert.ok(Math.abs(opt.est.art.dia - opt.truth.dbp) < 4, 'dia ' + opt.est.art.dia);
  const under = run('underdamped', 15).last.est.art, over = run('baseline', 15, { ibp_damping: 'over-damped' }).last.est.art;
  assert.ok(under.sys > opt.est.art.sys + 6, 'under-damped overshoot ' + under.sys);
  assert.ok(over.sys < opt.est.art.sys - 4, 'over-damped blunting ' + over.sys);
  for (const a of [under, over]) assert.ok(Math.abs(a.map - opt.est.art.map) < 2, 'MAP ' + a.map);
  assert.ok(IBP_DAMPING['under-damped'].zeta < IBP_DAMPING.optimal.zeta);
});

test('arterial line: transducer 20 cm above the heart reads ≈ 15 mmHg low; open line reads zero', () => {
  const a0 = run('baseline', 15).last.est.art, a20 = run('transducer', 15).last.est.art;
  assert.ok(Math.abs(a0.map - a20.map - 20 * HYDRO_MMHG_PER_CM) < 1.5, 'offset ' + (a0.map - a20.map));
  const open = run('baseline', 15, { ibp_line: 'open-to-air' }).last;
  assert.equal(open.est.art, null);
  assert.equal(open.technical.artNoPulse, true);
});
