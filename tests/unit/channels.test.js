'use strict';
// Per-channel waveform checks from the waveform audit (SIMULATION_AUDIT.md §9a).
// Deterministic: fixed seeds, sensor noise off where the check is about the model.
// Tolerances are stated in each assertion message.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Engine } = require('../../src/sim/engine.js');
const { Ring } = require('../../src/sim/dsp.js');

const QUIET = { hrv_ms: 0, ecg_noise_uv: 0, mains_uv: 0, ecg_wander_mv: 0, ppg_noise: 0, resp_noise: 0, nibp_interval: 0, cardiogenic: 0 };
const run = (p, s) => { const e = new Engine(Object.assign({}, QUIET, p)); e.advance(s); return e; };
const diffs = a => a.slice(1).map((x, i) => x - a[i]);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const maxStep = (ring, n) => {
  const a = ring.last(n); let m = 0;
  for (let i = 1; i < a.length; i++) if (Number.isFinite(a[i]) && Number.isFinite(a[i - 1])) m = Math.max(m, Math.abs(a[i] - a[i - 1]));
  return m;
};
/** Time from t0 to the minimum of ring (fs Hz) within the next `win` s: the pulse foot. */
const footAfter = (ring, fs, t0, win) => {
  const a = ring.last(ring.total), i0 = Math.round(t0 * fs) - 1;
  let im = i0;
  for (let i = i0; i < i0 + win * fs; i++) if (a[i] < a[im]) im = i;
  return (im + 1) / fs - t0;
};

// ------------------------------------------------------------------ ECG
test('ECG at 120 bpm: R–R 0.500 s in the model and the detector, HR reads 120', () => {
  const e = run({ hr: 120 }, 20);
  for (const d of diffs(e.trueR.slice(-12))) assert.ok(Math.abs(d - 0.5) < 0.002, 'model R–R ' + d + ' (±2 ms)');
  for (const d of diffs(e.qrsTimes.slice(-12))) assert.ok(Math.abs(d - 0.5) < 0.012, 'detected R–R ' + d + ' (±12 ms)');
  assert.ok(Math.abs(e.lastFrame.est.hr - 120) <= 1, 'HR ' + e.lastFrame.est.hr);
});

test('ECG has no jump when the heart rate changes (the new rate starts at the next cycle)', () => {
  for (const hr of [40, 140]) {
    const e = run({ hr: 72 }, 20), steady = maxStep(e.ecgS, 2500);
    e.setParams({ hr }); e.advance(3);
    const after = maxStep(e.ecgS, 750);
    assert.ok(after <= steady * 1.25 + 0.02, 'HR 72→' + hr + ': max step ' + after.toFixed(3) + ' mV vs steady ' + steady.toFixed(3));
  }
});

// ------------------------------------------------------------------ ART
test('arterial line (optimal damping) reaches the set SBP/DBP within 1.5 mmHg', () => {
  for (const [s, d] of [[120, 80], [160, 95], [90, 55]]) {
    const a = run({ sbp: s, dbp: d }, 20).arterialNumbers();
    assert.ok(Math.abs(a.sys - s) <= 1.5 && Math.abs(a.dia - d) <= 1.5, s + '/' + d + ' → ' + a.sys.toFixed(1) + '/' + a.dia.toFixed(1));
  }
});

test('arterial line damping changes the shape but keeps MAP (±1.5 mmHg); under-damping overshoots', () => {
  const ref = run({}, 20).arterialNumbers();
  const u = run({ ibp_damping: 'under-damped' }, 20).arterialNumbers();
  const o = run({ ibp_damping: 'over-damped' }, 20).arterialNumbers();
  for (const x of [u, o]) assert.ok(Math.abs(x.map - ref.map) <= 1.5, 'MAP ' + x.map.toFixed(1) + ' vs ' + ref.map.toFixed(1));
  assert.ok(u.sys > ref.sys + 8, 'under-damped SBP ' + u.sys.toFixed(1));
  assert.ok(o.sys < ref.sys - 5 && o.dia > ref.dia + 1, 'over-damped ' + o.sys.toFixed(1) + '/' + o.dia.toFixed(1));
});

test('arterial pressure has no jump when HR, SBP or DBP is changed (regression: up to 75 mmHg in 16 ms)', () => {
  for (const upd of [{ hr: 120 }, { hr: 40 }, { sbp: 150 }, { dbp: 60 }]) {
    const e = run({}, 20), steady = maxStep(e.artS, 1250);
    e.setParams(upd); e.advance(3);
    const after = maxStep(e.artS, 375);
    assert.ok(after <= steady * 1.5 + 1, JSON.stringify(upd) + ': max step ' + after.toFixed(1) + ' mmHg per sample vs steady ' + steady.toFixed(1));
  }
});

// ------------------------------------------------------------------ PLETH / pulse arrival
test('pulse arrival time follows pat_ms: ART foot at R + PAT, pleth foot 0–40 ms later', () => {
  for (const pat of [150, 300]) {
    const e = run({ hr: 60, pat_ms: pat }, 30);
    const R = e.trueR.filter(t => t > 20 && t < 28);
    const art = mean(R.map(t => footAfter(e.artS, 125, t, 0.6))) * 1000;
    const pl = mean(R.map(t => footAfter(e.plethS, 125, t, 0.6))) * 1000;
    assert.ok(Math.abs(art - pat) <= 12, 'PAT ' + pat + ': ART R→foot ' + art.toFixed(0) + ' ms (±12 ms, one sample at 125 Hz + filter)');
    assert.ok(pl >= art - 8 && pl <= art + 40, 'PAT ' + pat + ': pleth R→foot ' + pl.toFixed(0) + ' ms');
  }
});

// ------------------------------------------------------------------ RESP / CO2
test('EtCO2 reads the modelled end-expiratory plateau within ±0.3 mmHg (no noise-peak bias)', () => {
  for (const [rr, et] of [[12, 38], [30, 24], [8, 55]]) {
    const vals = [];
    for (let seed = 1; seed <= 4; seed++) {
      const e = run({ rr, etco2: et, seed }, 40);
      vals.push(e.lastFrame.est.etco2);
      assert.ok(Math.abs(e.lastFrame.est.awrr - rr) <= 0.5, 'awRR ' + e.lastFrame.est.awrr);
    }
    const m = mean(vals);
    assert.ok(Math.abs(m - et) <= 0.3, 'RR ' + rr + ' set ' + et + ': mean EtCO2 ' + m.toFixed(2) + ' ' + vals.map(v => v.toFixed(2)).join(' '));
  }
});

test('capnogram and impedance share one breathing clock: CO2 rises after end-inspiration', () => {
  const e = run({ rr: 12 }, 40);
  const r = e.respS.last(50 * 30), c = e.capS.last(50 * 30);
  const peaks = [];
  for (let i = 1; i < r.length - 1; i++) if (r[i] >= r[i - 1] && r[i] > r[i + 1] && r[i] > 0.9) peaks.push(i);
  assert.ok(peaks.length >= 5, 'breaths ' + peaks.length);
  for (const p of peaks.slice(0, -1)) {
    let k = p; while (k < c.length && c[k] < 19) k++;  // half of EtCO2 38
    const d = (k - p) / 50;
    assert.ok(d > 0 && d < 0.8, 'CO2 half-rise ' + d.toFixed(2) + ' s after end-inspiration (0–0.8 s at RR 12)');
  }
  for (const d of diffs(peaks)) assert.ok(Math.abs(d / 50 - 5) <= 0.02, 'impedance cycle ' + (d / 50) + ' s');
});

// ------------------------------------------------------------------ CUFF
test('NIBP stop by the user: state cancelled, cuff dumped, no failure alarm, last result kept', () => {
  const e = run({}, 1);
  let res = null; e.onNibp = r => { res = r; };
  e.startNibp(); e.advance(60);
  assert.equal(e.nibp.state, 'completed');
  const good = e.nibp.last;
  e.startNibp(); e.advance(5); e.cancelNibp(); e.advance(10);
  assert.equal(e.nibp.state, 'cancelled');
  assert.ok(res.cancelled && /cancelled/.test(res.error));
  assert.equal(e.nibp.cuff, 0);
  assert.equal(e.lastFrame.technical.nibpFailed, false);
  assert.equal(e.nibp.last, good, 'previous valid result stays current');
  assert.ok(e.startNibp(), 'a new measurement can start after a cancel');
});

// ------------------------------------------------------------------ dropouts, repeatability
test('signal dropouts are NaN in the buffers, and numerics are numbers or null, never NaN', () => {
  const e = run({ ecg_dropout: 20, ppg_dropout: 20, resp_dropout: 20 }, 40);
  for (const ring of [e.ecgS, e.plethS, e.respS]) assert.ok(ring.last(ring.total).some(v => Number.isNaN(v)), 'gap present');
  for (const [k, v] of Object.entries(e.lastFrame.est)) if (typeof v === 'number') assert.ok(Number.isFinite(v), k + ' = ' + v);
});

test('reset reproduces a fresh run, and advancing in frame-sized steps equals one long step', () => {
  const p = { seed: 9, hrv_ms: 40, motion: 20 };
  const a = new Engine(p); a.advance(10);
  const b = new Engine({ seed: 3 }); b.advance(7); b.reset(p); b.advance(10);
  const c = new Engine(p); for (let i = 0; i < 625; i++) c.advance(0.016);
  for (const k of ['ecgS', 'artS', 'plethS', 'respS', 'capS', 'cuffS']) {
    assert.deepEqual(b[k].last(400), a[k].last(400), 'reset: ' + k);
    assert.deepEqual(c[k].last(400), a[k].last(400), 'chunked: ' + k);
  }
});

// ------------------------------------------------------------------ renderer
/** Loads src/ui/waveforms.js in a sandbox with a canvas stub. ctx.pts holds the points of the
 *  last stroked path, which is the trace (calibration pulse and reference lines come first). */
function renderer() {
  const src = fs.readFileSync(path.join(__dirname, '../../src/ui/waveforms.js'), 'utf8');
  const ctx = {
    pts: [], path: [], hatches: 0,
    clearRect() {}, fillRect() {}, fillText() {}, setLineDash() {},
    beginPath() { this.path = []; }, stroke() { this.pts = this.path; },
    moveTo(x, y) { this.path.push([x, y]); }, lineTo(x, y) { this.path.push([x, y]); },
  };
  const sandbox = { PM: { dom: { fitCanvas: cv => ({ ctx, w: cv.clientWidth, h: cv.clientHeight }), hatch: () => { ctx.hatches++; } } } };
  vm.runInNewContext(src, sandbox);
  return { ctx, W: sandbox.PM.waveforms };
}
const canvas = (w, h) => ({ clientWidth: w, clientHeight: h });

test('renderer: ECG 10 mm/mV and 25 mm/s map to the right pixel distances', () => {
  const { ctx, W } = renderer();
  const fs = 250, ring = new Ring(fs * 10);
  for (let i = 0; i < fs * 4; i++) ring.push(i % fs === 0 ? 1 : 0); // 1 mV spike once per second
  const v = new W.SweepView(canvas(1200, 200), { ring: () => ring, fs: () => fs, scale: 'ecg' });
  v.draw(4 - 1 / fs, 25, 10);
  const ys = ctx.pts.map(p => p[1]), base = Math.max(...ys), top = Math.min(...ys);
  assert.ok(Math.abs((base - top) - 10 * W.PX_PER_MM) < 0.01, '1 mV = ' + (base - top).toFixed(2) + ' px');
  const xs = ctx.pts.filter(p => p[1] === top).map(p => p[0]).sort((a, b) => a - b);
  for (const d of diffs(xs)) assert.ok(Math.abs(d - 25 * W.PX_PER_MM) < 0.01, '1 s = ' + d.toFixed(2) + ' px');
});

test('renderer: optimum scale brackets the arterial trace and is stable beat to beat', () => {
  const { ctx, W } = renderer();
  const fs = 125, ring = new Ring(fs * 10);
  const v = new W.SweepView(canvas(800, 120), { ring: () => ring, fs: () => fs, scale: 'optimum' });
  const ranges = [];
  for (let s = 0; s < 8; s++) {
    for (let i = 0; i < fs; i++) ring.push(80 + 40 * Math.sin(Math.PI * i / fs) ** 2 + (s % 2 ? 1.5 : -1.5));
    v.draw(s + 1, 25, 10); ranges.push(v.range.join('–'));
  }
  const [lo, hi] = v.range;
  assert.ok(lo <= 78.5 - 5 && hi >= 121.5 + 5 && hi - lo >= 40, 'range ' + lo + '–' + hi);
  assert.equal(new Set(ranges.slice(1)).size, 1, 'range changed: ' + ranges.join(', '));
});

test('renderer: NaN samples become hatched gaps; every point stays inside the canvas at several sizes', () => {
  for (const [w, h] of [[320, 60], [800, 160], [1920, 300]]) {
    const { ctx, W } = renderer();
    const fs = 125, ring = new Ring(fs * 60);
    for (let i = 0; i < fs * 20; i++) ring.push(i % (fs * 2) < 40 ? NaN : 300 * Math.sin(i / 10));
    const v = new W.SweepView(canvas(w, h), { ring: () => ring, fs: () => fs, scale: [0, 200] });
    ctx.hatches = 0;
    const out = v.draw(20, 25, 10);
    assert.ok(out.gaps > 0 && ctx.hatches === out.gaps, w + '×' + h + ': gaps ' + out.gaps);
    for (const [x, y] of ctx.pts) assert.ok(x >= 0 && x <= w && y >= 1 && y <= h - 1, w + '×' + h + ': point ' + x + ',' + y);
    assert.ok(Math.abs(out.Tw - w / (25 * W.PX_PER_MM)) < 1e-9, 'sweep window ' + out.Tw);
  }
});
