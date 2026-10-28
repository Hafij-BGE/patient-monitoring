'use strict';
// Simulation engine tests (node --test). Each test names the §19 requirement it covers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, mapFormula } = require('../../src/sim/engine.js');
const { EcgGenerator } = require('../../src/sim/ecg.js');
const { RespSensor } = require('../../src/sim/sensors.js');
const { analyse } = require('../../src/sim/nibp.js');
const params = require('../../src/sim/params.js');
const { Rng } = require('../../src/sim/rng.js');

const diffs = a => a.slice(1).map((x, i) => x - a[i]);

test('§19.1 HR 60 bpm gives a 1.000 s beat interval (model and detector)', () => {
  const g = new EcgGenerator(Object.assign({}, params.DEFAULTS, { hr: 60, hrv_ms: 0 }), new Rng(1));
  const r = [];
  g.onR = t => r.push(t);
  for (let i = 0; i < 10000; i++) g.step();
  for (const d of diffs(r)) assert.ok(Math.abs(d - 1) < 1e-6, 'model R–R ' + d);
  const e = new Engine({ hr: 60, hrv_ms: 0 });
  e.advance(20);
  for (const d of diffs(e.qrsTimes.slice(3))) assert.ok(Math.abs(d - 1) <= 2 / e.p.ecg_fs + 1e-9, 'detected R–R ' + d);
  assert.ok(Math.abs(e.lastFrame.est.hr - 60) < 0.5, 'HR ' + e.lastFrame.est.hr);
});

test('§19.2 RR 12 br/min gives a 5 s breathing cycle, detector reports 12', () => {
  const s = new RespSensor(new Rng(1), { at: () => 0 });
  const starts = [];
  for (let k = 1; k <= 31000; k++) if (s.advance(1e-3, 12)) starts.push(k * 1e-3);
  for (const d of diffs(starts)) assert.ok(Math.abs(d - 5) < 2e-3, 'cycle ' + d);
  const e = new Engine({ rr: 12 });
  e.advance(40);
  assert.ok(Math.abs(e.lastFrame.est.rr - 12) < 0.3, 'RR ' + e.lastFrame.est.rr);
});

test('§19.3 MAP formula: 120/80 → 93.3 mmHg', () => {
  assert.equal(Number(mapFormula(120, 80).toFixed(1)), 93.3);
});

test('§19.4 pulse pressure = SBP − DBP in the NIBP result', () => {
  const e = new Engine({});
  let res = null;
  e.onNibp = r => { res = r; };
  e.startNibp();
  e.advance(60);
  assert.ok(res && !res.error, 'measurement completed');
  assert.ok(Math.abs(res.pp - (res.sbp - res.dbp)) < 1e-9);
  assert.ok(Math.abs(res.map - (res.sbp + 2 * res.dbp) / 3) < 1e-9);
});

test('NIBP oscillometric estimate stays within ±5 mmHg of the set point (noise-free-ish cases)', () => {
  for (const [s, d] of [[120, 80], [82, 48], [175, 105], [140, 90]]) {
    const e = new Engine({ sbp: s, dbp: d });
    let res = null;
    e.onNibp = r => { res = r; };
    e.startNibp();
    e.advance(120);
    assert.ok(res && !res.error, s + '/' + d + ': ' + (res && res.error));
    assert.ok(Math.abs(res.sbp - s) <= 5, 'SBP ' + res.sbp + ' vs ' + s);
    assert.ok(Math.abs(res.dbp - d) <= 5, 'DBP ' + res.dbp + ' vs ' + d);
  }
});

test('NIBP fails with a message under strong motion; re-inflates when SBP is above the first target', () => {
  const e = new Engine({ motion: 70 });
  let res = null;
  e.onNibp = r => { res = r; };
  e.startNibp();
  e.advance(120);
  assert.ok(res && res.error && /motion/.test(res.error));
  assert.equal(e.lastFrame.technical.nibpFailed, true);
  const h = new Engine({ sbp: 175, dbp: 105 });
  let r2 = null;
  h.onNibp = r => { r2 = r; };
  h.startNibp();
  h.advance(120);
  assert.ok(r2 && !r2.error && r2.target > 175, 'target ' + (r2 && r2.target));
});

test('oscillogram analysis rejects too few beats', () => {
  assert.match(analyse([{ pc: 100, amp: 1 }], 0.5, 0.8).error, /too few/);
});

test('SpO2 estimator tracks the set point and reports SQI, PI and pulse rate', () => {
  for (const s of [97, 84, 70]) {
    const e = new Engine({ spo2: s });
    e.advance(30);
    const f = e.lastFrame.est;
    assert.ok(Math.abs(f.spo2 - s) < 1, 'SpO2 ' + f.spo2 + ' vs ' + s);
    assert.ok(f.sqi > 80);
    assert.ok(Math.abs(f.pi - 3) < 0.5, 'PI ' + f.pi);
    assert.ok(Math.abs(f.pr - 72) < 3, 'PR ' + f.pr);
  }
});

test('motion biases SpO2 towards R ≈ 1 (≈ 85 %) and lowers SQI', () => {
  const e = new Engine({ motion: 70 });
  e.advance(30);
  const f = e.lastFrame.est;
  assert.ok(f.spo2 < 92, 'SpO2 ' + f.spo2);
  assert.ok(f.sqi < 90, 'SQI ' + f.sqi);
});

test('sensor states give missing values and technical flags, never zeros', () => {
  const cases = [
    [{ spo2_sensor: 'disconnected' }, f => f.est.spo2 === null && f.technical.spo2NoSignal],
    [{ spo2_sensor: 'probe-off' }, f => f.est.spo2 === null && f.technical.spo2ProbeOff],
    [{ contact: 5 }, f => f.est.hr === null && f.technical.ecgLeadsOff],
    [{ temp_sensor: 'unavailable' }, f => f.est.temp === null && f.technical.tempUnavailable],
    [{ temp_sensor: 'error' }, f => f.est.temp === null && f.technical.tempError],
  ];
  for (const [o, ok] of cases) {
    const e = new Engine(o);
    e.advance(15);
    assert.ok(ok(e.lastFrame), JSON.stringify(o));
  }
});

test('apnea: RR = 0 is detected after the apnea delay', () => {
  const e = new Engine({ rr: 0, apnea_delay: 20 });
  e.advance(15);
  assert.equal(e.lastFrame.est.apnea, false);
  e.advance(10);
  assert.equal(e.lastFrame.est.apnea, true);
  assert.equal(e.lastFrame.est.rr, 0);
});

test('§19.16 waveform buffers grow at the configured sampling rates', () => {
  for (const fs of [125, 250, 500, 1000]) {
    const e = new Engine({ ecg_fs: fs });
    e.advance(2);
    assert.equal(e.ecgS.total, 2 * fs);
    assert.equal(e.plethS.total, 250);
    assert.equal(e.respS.total, 100);
    assert.equal(e.cuffS.total, 200);
  }
});

test('changing ecg_fs at run time rebuilds the ECG chain', () => {
  const e = new Engine({});
  e.advance(1);
  e.setParams({ ecg_fs: 500 });
  e.advance(1);
  assert.equal(e.ecgS.fs, 500);
  assert.equal(e.ecgS.total, 500);
});

test('same seed + same settings = identical run', () => {
  const a = new Engine({ motion: 30 }), b = new Engine({ motion: 30 });
  a.advance(10); b.advance(10);
  assert.deepEqual(a.ecgS.last(500), b.ecgS.last(500));
  assert.equal(a.lastFrame.est.spo2, b.lastFrame.est.spo2);
});

test('§19.7/§19.8 presets apply explicit changes and keep processing settings', () => {
  const cur = Object.assign({}, params.DEFAULTS, { sweep: 50, hr: 99 });
  for (const pr of params.PRESETS) {
    const r = params.applyPreset(pr.id, cur);
    assert.equal(r.params.sweep, 50);
    for (const [k, v] of Object.entries(pr.changes)) assert.equal(r.params[k], v);
    assert.deepEqual(r.changed, Object.keys(pr.changes));
    if (!('hr' in pr.changes)) assert.equal(r.params.hr, params.DEFAULTS.hr);
  }
  assert.throws(() => params.applyPreset('nope', cur));
});

test('§19.9 invalid inputs are rejected or clamped with messages', () => {
  const v = params.validate(params.DEFAULTS, { hr: 'abc', spo2: 120, rhythm: 'chaotic', foo: 1, rr: '' });
  assert.equal(v.params.hr, params.DEFAULTS.hr);
  assert.equal(v.params.spo2, 100);
  assert.equal(v.params.rhythm, 'regular');
  assert.equal(v.params.rr, params.DEFAULTS.rr);
  assert.deepEqual(v.errors.map(e => e.key).sort(), ['foo', 'hr', 'rhythm', 'rr']);
  assert.deepEqual(v.warnings.map(e => e.key), ['spo2']);
  const bp = params.validate(params.DEFAULTS, { sbp: 90, dbp: 85 });
  assert.equal(bp.params.sbp, 120); assert.equal(bp.params.dbp, 80);
  assert.ok(bp.errors.some(e => e.key === 'dbp'));
});

test('every preset runs 30 s without exceptions or NaN numerics', () => {
  for (const pr of params.PRESETS) {
    const e = new Engine(params.applyPreset(pr.id, params.DEFAULTS).params);
    e.startNibp();
    e.advance(30);
    for (const [k, v] of Object.entries(e.lastFrame.est)) if (typeof v === 'number') assert.ok(Number.isFinite(v), pr.id + '.' + k);
  }
});
