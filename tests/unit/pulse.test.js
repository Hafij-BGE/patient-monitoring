'use strict';
const test = require('node:test');
const assert = require('node:assert');
const pulse = require('../../src/sim/pulse.js');
const { Engine } = require('../../src/sim/engine.js');

function run(hr, sbp, dbp, seconds) {
  const w = pulse.fit(hr, sbp, dbp, 10), a = new pulse.Arterial(), rr = 60 / hr;
  let nb = 0, hi = -Infinity, lo = Infinity, sum = 0, n = 0;
  for (let t = 0; t < seconds; t += pulse.DT) {
    if (t >= nb * rr) { a.beat(nb * rr, 1, w); nb++; }
    const p = a.value(w, t);
    if (t > seconds - 10) { hi = Math.max(hi, p); lo = Math.min(lo, p); sum += p; n++; }
  }
  return { w, a, hi, lo, map: sum / n };
}

test('Windkessel fit reproduces the set SBP/DBP over rate and pulse-pressure range', () => {
  for (const [hr, s, d] of [[72, 120, 80], [40, 120, 80], [180, 120, 80], [72, 170, 70], [60, 100, 90], [150, 95, 85], [50, 80, 40]]) {
    const r = run(hr, s, d, 60);
    assert.ok(Math.abs(r.hi - s) < 1 && Math.abs(r.lo - d) < 1, `${hr} bpm ${s}/${d}: ${r.hi.toFixed(1)}/${r.lo.toFixed(1)}`);
    // waveform-area MAP lies between the 1/3 rule and the midpoint (form factor 0.33–0.55)
    const ff = (r.map - d) / (s - d);
    assert.ok(ff > 0.33 && ff < 0.55, 'form factor ' + ff.toFixed(2));
    assert.ok(Math.abs(ff - r.w.meanFraction) < 0.02, 'meanFraction matches simulated mean');
  }
});

test('ejection time follows Weissler (413 − 1.7·HR ms) within its limits', () => {
  assert.ok(Math.abs(pulse.ejectionTime(72) - 0.2906) < 1e-3);
  assert.equal(pulse.ejectionTime(30), 0.413 - 0.0017 * 30);
  assert.ok(pulse.ejectionTime(250) <= 0.6 * 60 / 250 + 1e-12);
});

test('without beats the pressure decays towards the filling pressure with time constant τ', () => {
  const r = run(72, 120, 80, 40), w = r.w;
  const p0 = r.a.value(w, 40), p1 = r.a.value(w, 40 + w.tau);
  // one τ later the excess over P∞ has fallen to ~1/e (the last beat may still be ejecting at 40 s)
  assert.ok((p1 - 10) / (p0 - 10) < 0.45, `${p0.toFixed(1)} → ${p1.toFixed(1)}`);
  assert.ok(r.a.value(w, 40 + 10 * w.tau) < 11);
});

test('stroke volume depends on the preceding filling time (pulse deficit after short R–R)', () => {
  assert.ok(Math.abs(pulse.filling(60 / 110, 110) - 1) < 1e-9);
  assert.ok(pulse.filling(0.35, 110) < 0.7, 'short interval: weak beat');
  assert.ok(pulse.filling(1.0, 110) > 1.2, 'long interval: stronger beat');
  assert.ok(pulse.filling(0.2, 110) === 0, 'no filling time: no ejection');
});

test('engine: true MAP uses the waveform area; NIBP reads SBP/DBP/MAP within 3 mmHg', () => {
  for (const [s, d] of [[120, 80], [80, 46], [140, 90]]) {
    const e = new Engine({ sbp: s, dbp: d });
    let res = null, f = null;
    e.onNibp = r => { res = r; };
    e.onFrame = x => { f = x; };
    e.startNibp();
    e.advance(90);
    assert.ok(Math.abs(f.truth.map - (d + (s - d) * pulse.fit(72, s, d, 10).meanFraction)) < 1e-9);
    assert.ok(Math.abs(res.sbp - s) <= 3 && Math.abs(res.dbp - d) <= 3, `${res.sbp.toFixed(1)}/${res.dbp.toFixed(1)}`);
    assert.ok(Math.abs(res.mapOsc - f.truth.map) <= 3.5, `MAP ${res.mapOsc.toFixed(1)} vs ${f.truth.map.toFixed(1)}`);
  }
});

// Last full beat of a steady regular rhythm, sampled at fs (noise-free model output).
function lastBeat(hr, fs, map) {
  const w = pulse.fit(hr, 120, 80, 10), a = new pulse.Arterial(), rr = 60 / hr, out = [];
  let nb = 0;
  for (let i = 0; i / fs < 20 * rr; i++) {
    const t = i / fs;
    if (t >= nb * rr) { a.beat(nb * rr, 1, w); nb++; }
    const v = map ? map(a.value(w, t), w) : a.value(w, t);
    if (t >= 19 * rr) out.push(v);
  }
  return { w, rr, y: out };
}
function extrema(y) {
  const mx = [], mn = [];
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] > y[i - 1] && y[i] >= y[i + 1]) mx.push(i);
    if (y[i] < y[i - 1] && y[i] <= y[i + 1]) mn.push(i);
  }
  return { mx, mn };
}

test('arterial pressure: dicrotic notch (local minimum then rebound) just after ejection at 72 bpm', () => {
  const fs = 1000, { w, y } = lastBeat(72, fs);
  const te = pulse.ejectionTime(72), { mx, mn } = extrema(y);
  const notch = mn.find(i => i / fs > te * 0.9 && i / fs < te + 0.15);
  assert.ok(notch !== undefined, 'notch minimum after end of ejection');
  const reb = mx.find(i => i > notch && i / fs < te + 0.25);
  assert.ok(reb !== undefined, 'rebound maximum after the notch');
  const depth = y[reb] - y[notch];
  assert.ok(depth > 0.5 && depth < 8, `notch depth ${depth.toFixed(2)} mmHg`);
  // notch sits on the downstroke: below systolic, above diastolic
  assert.ok(y[notch] < 120 - 5 && y[notch] > 80 + 5, `notch at ${y[notch].toFixed(1)} mmHg`);
  assert.ok(Math.abs(Math.max(...y) - 120) < 2 && Math.abs(Math.min(...y) - 80) < 2, 'fit still holds SBP/DBP');
  assert.ok(w.k.len > te, 'kernel spans the incisura');
});

test('arterial pressure: incisura shrinks at high rate (no diastole left for the rebound)', () => {
  const depth = hr => {
    const { y } = lastBeat(hr, 1000), te = pulse.ejectionTime(hr), { mx, mn } = extrema(y);
    const n = mn.find(i => i / 1000 > te * 0.9 && i / 1000 < te + 0.15);
    if (n === undefined) return 0;
    const r = mx.find(i => i > n);
    return r === undefined ? 0 : y[r] - y[n];
  };
  assert.ok(depth(150) < depth(72), `${depth(150).toFixed(2)} < ${depth(72).toFixed(2)}`);
});

test('finger volume pulse: systolic peak, then a reflected (diastolic) peak about ΔT later', () => {
  const fs = 125, dT = pulse.reflectionDelay(40, 93, 170);
  assert.ok(dT > 0.15 && dT < 0.3, `ΔT ${dT.toFixed(3)} s (Millasseau 2002, age 40)`);
  const fv = new pulse.FingerVolume(fs);
  const { y } = lastBeat(72, fs, p => fv.raw((p - 80) / 40, dT, 0.3));
  const { mx } = extrema(y);
  assert.equal(mx.length, 2, `two maxima per beat, got ${mx.length}`);
  const sep = (mx[1] - mx[0]) / fs;
  assert.ok(sep > 0.6 * dT && sep < 1.4 * dT, `peak separation ${sep.toFixed(3)} s vs ΔT ${dT.toFixed(3)} s`);
  assert.ok(y[mx[1]] < y[mx[0]], 'diastolic peak below systolic peak (young adult, RI < 1)');
  // upstroke shorter than the decay (fast rise, slow diastolic runoff)
  const lo = y.indexOf(Math.min(...y));
  assert.ok(mx[0] / fs < 0.25 * (y.length / fs), `time to peak ${(mx[0] / fs).toFixed(3)} s`);
  assert.ok(lo === 0 || lo > mx[1], 'trough at end-diastole');
});

test('finger volume pulse without reflection has a single maximum per beat', () => {
  const fs = 125, fv = new pulse.FingerVolume(fs);
  const { y } = lastBeat(72, fs, p => fv.raw((p - 80) / 40, 0.2, 0));
  assert.equal(extrema(y).mx.length, 1);
});

test('engine pleth: PR and PI stay on the set values with and without reflection', () => {
  for (const c of [{}, { ppg_reflection: 0 }, { ppg_reflection: 0.8 }, { hr: 120, ppg_reflection: 0.8 }, { pi: 0.3 }]) {
    const e = new Engine(c);
    let f = null;
    e.onFrame = x => { f = x; };
    e.advance(30);
    assert.ok(Math.abs(f.est.pr - e.p.hr) <= 3, `${JSON.stringify(c)} PR ${f.est.pr.toFixed(1)}`);
    assert.ok(Math.abs(f.est.pi - e.p.pi) <= 0.15 * e.p.pi + 0.05, `${JSON.stringify(c)} PI ${f.est.pi.toFixed(2)}`);
  }
});
