'use strict';
// The cuff strip between measurements: the recorded NIBP cycle, its split into cuff pressure
// and oscillation, and the renderer that sets the reading against the arterial line.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Engine } = require('../../src/sim/engine.js');

const QUIET = { hrv_ms: 0, ecg_noise_uv: 0, mains_uv: 0, ecg_wander_mv: 0, ppg_noise: 0, resp_noise: 0, nibp_interval: 0, cardiogenic: 0 };

/** Loads src/ui/trends.js in a sandbox with a canvas stub that records every stroked point and text. */
function trends() {
  const src = fs.readFileSync(path.join(__dirname, '../../src/ui/trends.js'), 'utf8');
  const ctx = {
    pts: [], texts: [], path: [],
    clearRect() {}, fillRect() {}, setLineDash() {}, fill() {}, arc() {}, save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() { this.path = []; }, stroke() { this.pts.push(...this.path); },
    moveTo(x, y) { this.path.push([x, y]); }, lineTo(x, y) { this.path.push([x, y]); },
    fillText(t, x, y) { this.texts.push({ t, x, y, align: this.textAlign }); }, measureText(t) { return { width: t.length * 6 }; },
  };
  const sandbox = { PM: {
    dom: { fitCanvas: cv => ({ ctx, w: cv.clientWidth, h: cv.clientHeight }), hatch() {}, cssVar: () => '' },
    store: { ObservationStore: { timeOf: () => 0 }, findGaps: () => [] },
  } };
  vm.runInNewContext(src, sandbox);
  return { ctx, T: sandbox.PM.trends };
}

/** One completed measurement on a quiet patient at 120/80. */
function measure(e) {
  e.startNibp();
  for (let s = 0; s < 90 && (e.nibp.state === 'inflating' || e.nibp.state === 'deflating'); s++) e.advance(1);
  return e.nibp.last;
}

test('NIBP result keeps its whole cycle; only the newest result keeps it', () => {
  const e = new Engine(Object.assign({}, QUIET, { sbp: 120, dbp: 80 }));
  e.advance(3);
  const r1 = measure(e);
  assert.equal(e.nibp.state, 'completed');
  const tr = r1.trace;
  assert.equal(tr.fs, 100, 'trace rate');
  assert.ok(tr.defl > 0 && tr.defl < tr.samples.length, 'deflation start index ' + tr.defl);
  const peak = Math.max(...tr.samples);
  assert.ok(Math.abs(peak - r1.target) < 5, 'peak ' + peak.toFixed(1) + ' vs target ' + r1.target);
  assert.ok(tr.samples.length / tr.fs > 20 && tr.samples.length / tr.fs < 60, 'cycle ' + tr.samples.length / tr.fs + ' s');
  const r2 = measure(e);
  assert.ok(r2.trace, 'newest keeps trace');
  assert.equal(r1.trace, undefined, 'older result dropped its trace');
});

test('cuff cycle: deflation passes SYS, MAP, DIA in order, at the reported pressures; oscillation peaks near MAP', () => {
  const e = new Engine(Object.assign({}, QUIET, { sbp: 120, dbp: 80 }));
  e.advance(3);
  const res = measure(e), tr = res.trace;
  const { T } = trends();
  const c = T.cuffCycle(tr, res);
  assert.ok(c.sys < c.map && c.map < c.dia, 'order ' + [c.sys, c.map, c.dia].join(', '));
  for (const [s, p] of [[c.sys, res.sbp], [c.map, res.mapOsc], [c.dia, res.dbp]]) {
    const v = c.slow[Math.round(s * tr.fs)];
    assert.ok(Math.abs(v - p) < 1, 'cuff ' + v.toFixed(2) + ' at a reported ' + p.toFixed(2) + ' (±1 mmHg)');
  }
  for (let i = 0; i < tr.defl + tr.fs; i++) assert.ok(Number.isNaN(c.osc[i]), 'no oscillation shown before deflation, i=' + i);
  assert.ok(c.oscMax > 0.3 && c.oscMax < 10, 'oscillation peak ' + c.oscMax.toFixed(2) + ' mmHg');
  // peak-to-trough within ±0.5 s (about one beat at 72 bpm): largest at MAP, a fraction of it at SYS and DIA
  const p2p = s => { let lo = Infinity, hi = -Infinity; for (let i = Math.round((s - 0.5) * tr.fs); i < Math.round((s + 0.5) * tr.fs); i++) { lo = Math.min(lo, c.osc[i]); hi = Math.max(hi, c.osc[i]); } return hi - lo; };
  const m = p2p(c.map);
  for (const [s, lab] of [[c.sys, 'SYS'], [c.dia, 'DIA']]) {
    const k = p2p(s) / m;
    assert.ok(k > 0.4 && k < 0.85, lab + '/MAP oscillation ' + k.toFixed(2) + ' (K = 0.55; 0.4–0.85 allowed for the window)');
  }
});

test('renderer: cuff cycle view has axes, markers and the comparison line, inside the canvas at several widths', () => {
  const e = new Engine(Object.assign({}, QUIET, { sbp: 120, dbp: 80 }));
  e.advance(3);
  const res = measure(e);
  const o = { res, art: { sys: 121, dia: 79, map: 96 }, set: { sbp: 120, dbp: 80 }, truthMap: 95, color: '#f9c', artColor: '#f55' };
  for (const [w, h] of [[340, 160], [800, 170], [1600, 170], [900, 110]]) {
    const { ctx, T } = trends();
    const out = T.drawCuffCycle({ clientWidth: w, clientHeight: h }, o);
    const texts = ctx.texts.map(x => x.t);
    assert.ok(out.shown[0].startsWith('NIBP 1'), w + ': comparison starts with the NIBP reading');
    if (w >= 800) assert.deepEqual(Array.from(out.shown, s => s.split(' ')[0]), ['NIBP', 'ART', 'NIBP−ART', 'set'], w + ': all comparisons');
    for (const m of ['SYS', 'MAP', 'DIA']) assert.ok(texts.some(t => t.startsWith(m + ' ')), w + ': ' + m + ' marker');
    const ticks = texts.filter(t => /^\d+$/.test(t));
    // 50 mmHg steps from 150 px up; a squeezed strip still gets a labelled axis
    assert.ok(h >= 150 ? ticks.includes('50') && ticks.includes('100') : ticks.length >= 3, w + 'x' + h + ': pressure ticks ' + ticks);
    assert.ok(texts.some(t => / s$/.test(t)), w + ': time ticks');
    assert.ok(/bar \d/.test(out.bandText) || w < 400, w + ': band scale "' + out.bandText + '"');
    assert.ok([1, 2, 5].includes(out.gain / Math.pow(10, Math.floor(Math.log10(out.gain)))), 'gain ' + out.gain);
    for (const t of ctx.texts) {
      const tw = t.t.length * 6, x0 = t.align === 'right' ? t.x - tw : t.align === 'center' ? t.x - tw / 2 : t.x;
      assert.ok(x0 >= 0 && x0 + tw <= w + 1, w + ': text "' + t.t + '" spans ' + x0 + '–' + (x0 + tw));
    }
    for (const [x, y] of ctx.pts) assert.ok(x >= 0 && x <= w && y >= 0 && y <= h, w + ': point ' + x + ',' + y);
  }
  const { T } = trends();
  const failed = T.drawCuffCycle({ clientWidth: 800, clientHeight: 170 }, Object.assign({}, o, { res: Object.assign({}, res, { error: 'Excessive motion' }) }));
  assert.ok(failed.shown[0].startsWith('Failed: '), 'failed result says so');
});
