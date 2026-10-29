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
