'use strict';
// Derived 12-lead ECG (src/sim/ecg12.js): the dipole model must give back the
// monitor's lead II exactly, obey Einthoven's and Goldberger's relations, and
// show the textbook normal and ventricular patterns the teaching view claims.
const test = require('node:test');
const assert = require('node:assert/strict');
const e12 = require('../../src/sim/ecg12.js');
const { EcgGenerator, qrsAxis } = require('../../src/sim/ecg.js');
const { Rng } = require('../../src/sim/rng.js');
const params = require('../../src/sim/params.js');
const { Engine } = require('../../src/sim/engine.js');

const L = name => e12.LEADS.indexOf(name);
const pOf = changes => Object.assign({}, params.DEFAULTS, changes);

/** Run the generator for `seconds` at 1 kHz; returns scalar output, 12 leads and R times. */
function record(changes, seconds) {
  const g = new EcgGenerator(pOf(changes), new Rng(2), 1e-3, new Rng(10));
  const out = [], leads = [], rT = [];
  g.onR = t => rT.push(t);
  for (let k = 0; k < seconds * 1000; k++) { out.push(g.step()); leads.push(e12.leads(g.vcg)); }
  return { out, leads, rT };
}

/** Peak-to-baseline features of one beat (the second-to-last R) in every lead. */
function beat(changes) {
  const r = record(Object.assign({ hrv_ms: 0, rhythm: 'regular', hr: 70 }, changes), 5);
  const vt = changes.arrhythmia === 'vt';
  const iR = Math.round(r.rT[r.rT.length - 2] * 1000) - 1, qw = vt ? 90 : 50;
  const base = r.leads[iR - (vt ? 120 : 70)];
  const rel = (i, j) => r.leads[i][j] - base[j];
  const ext = (a, b, j, f) => { let v = f === Math.max ? -1e9 : 1e9; for (let i = iR + a; i <= iR + b; i++) v = f(v, rel(i, j)); return v; };
  let tI = 0, tm = -1;
  for (let i = iR + 150; i < iR + 450; i++) { const v = Math.abs(rel(i, L('II'))); if (v > tm) { tm = v; tI = i; } }
  return e12.LEADS.map((_, j) => ({ R: ext(-qw, qw, j, Math.max), S: ext(-qw, qw, j, Math.min), T: rel(tI, j) }));
}

test('derived lead II equals the single-lead monitor ECG in every rhythm', () => {
  for (const arrhythmia of ['none', 'af', 'pvc', 'vt', 'vf', 'asystole', 'svt']) {
    const { out, leads } = record({ arrhythmia }, 6);
    let worst = 0;
    for (let i = 0; i < out.length; i++) worst = Math.max(worst, Math.abs(leads[i][L('II')] - out[i]));
    assert.ok(worst < 1e-9, arrhythmia + ': max |II − ECG| = ' + worst);
  }
});

test('limb leads obey Einthoven (I + III = II) and Goldberger (aVR + aVL + aVF = 0)', () => {
  const { leads } = record({ arrhythmia: 'none' }, 3);
  for (const v of leads) {
    assert.ok(Math.abs(v[L('I')] + v[L('III')] - v[L('II')]) < 1e-12);
    assert.ok(Math.abs(v[L('aVR')] + v[L('aVL')] + v[L('aVF')]) < 1e-12);
  }
});

test('every event direction projects on lead II with the sign the scalar model assumes', () => {
  for (const k of Object.keys(e12.BASIS))
    for (const b of e12.BASIS[k]) assert.ok(Math.abs(e12.dot(e12.DOWER.II, b) - 1) < 1e-12, k);
  assert.ok(Math.abs(e12.dot(e12.DOWER.II, e12.N_II)) < 1e-12, 'VF extra component is invisible in II');
});

test('normal beat: axis +30…+75°, R-wave progression, upright T where expected', () => {
  const b = beat({ arrhythmia: 'none' });
  const axis = qrsAxis(pOf({ arrhythmia: 'none' }));
  assert.ok(axis > 30 && axis < 75, 'axis ' + axis);
  const ratio = n => b[L(n)].R / -b[L(n)].S;
  assert.ok(ratio('V1') < 1, 'V1 rS');
  assert.ok(ratio('V5') > 1 && ratio('V6') > 1, 'V5–V6 R dominant');
  assert.ok(ratio('V1') < ratio('V3') && ratio('V3') < ratio('V5'), 'R grows V1 → V5');
  for (const n of ['I', 'II', 'V3', 'V4', 'V5', 'V6']) assert.ok(b[L(n)].T > 0, 'T upright in ' + n);
  assert.ok(b[L('aVR')].T < 0, 'T inverted in aVR');
  assert.ok(b[L('aVR')].S < -b[L('aVR')].R, 'aVR mainly negative');
});

test('ventricular beat: wide QS in V1, positive V6, inferior axis, discordant T', () => {
  const b = beat({ arrhythmia: 'vt' }); // 70 bpm: T clear of the next beat
  assert.ok(-b[L('V1')].S > 2 * b[L('V1')].R, 'V1 negative');
  assert.ok(b[L('V6')].R > -b[L('V6')].S, 'V6 positive');
  const axis = qrsAxis(pOf({ arrhythmia: 'vt' }));
  assert.ok(axis > 60 && axis < 100, 'inferior axis ' + axis);
  assert.ok(Math.sign(b[L('II')].T) !== Math.sign(b[L('II')].R + b[L('II')].S), 'T opposite QRS in II');
});

test('QRS axis does not drift with heart rate or QRS width; none for VF and asystole', () => {
  for (const arrhythmia of ['none', 'vt']) {
    const ref = qrsAxis(pOf({ arrhythmia }));
    for (const hr of [40, 90, 150, 200])
      for (const qrs_width of [0.8, 1, 1.5])
        assert.ok(Math.abs(qrsAxis(pOf({ arrhythmia, hr, qrs_width })) - ref) < 5, arrhythmia + ' hr ' + hr + ' w ' + qrs_width);
  }
  assert.ok(Number.isNaN(qrsAxis(pOf({ arrhythmia: 'vf' }))));
  assert.ok(Number.isNaN(qrsAxis(pOf({ arrhythmia: 'asystole' }))));
});

test('engine: 12 lead rings fill, lead II matches the monitor trace, leads off gives NaN', () => {
  const e = new Engine(params.applyPreset('baseline', params.DEFAULTS).params);
  e.advance(12);
  assert.equal(e.lead12.length, 12);
  const n = 2000, II = e.lead12[L('II')].last(n), mon = e.ecgS.last(n);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(II[i] - mon[i]) < 1e-9, 'sample ' + i);
  for (const r of e.lead12) assert.ok(r.last(n).every(Number.isFinite));
  e.p.contact = 5;
  e.advance(2);
  for (const r of e.lead12) assert.ok(r.last(200).every(Number.isNaN), 'NaN while leads off');
});
