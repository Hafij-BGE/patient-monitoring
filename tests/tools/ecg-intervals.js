'use strict';
// Measures P, PR, QRS and QT of the clean simulated ECG at several heart rates
// and compares QT with the Framingham formula the model follows.
// Each wave's boundary is where that wave's own share of the signal crosses
// 25 µV, so overlapping waves (T and P at 150 bpm) can still be measured.
// Usage: node tests/tools/ecg-intervals.js [qrs_width]
const { EcgGenerator } = require('../../src/sim/ecg.js');
const { Rng } = require('../../src/sim/rng.js');
const params = require('../../src/sim/params.js');

const TH = 0.025, qw = Number(process.argv[2] || 1);
const ms = x => Math.round(x * 1000);
console.log('HR  P   PR  QRS  QT   QT_Framingham  R(mV) T(mV) minTP(mV)  qrs_width=' + qw);
for (const hr of [50, 60, 72, 100, 150]) {
  const p = Object.assign({}, params.DEFAULTS, { hr, hrv_ms: 0, rhythm: 'regular', arrhythmia: 'none', qrs_width: qw });
  const g = new EcgGenerator(p, new Rng(2), 1e-3, new Rng(10));
  const rT = []; g.onR = t => rT.push(t);
  const rec = [];
  for (let k = 0; k < 8000; k++) { const y = g.step(); rec.push({ t: g.t, y, zi: Array.from(g.zi), z: g.z }); }
  // the beat between the 4th and 5th R; output is gain * z
  const i0 = rec.findIndex(r => r.t >= rT[3]), i1 = rec.findIndex(r => r.t >= rT[4]);
  const k = rec[i0].y / rec[i0].z, rr = rT[4] - rT[3];
  const part = (r, ids) => k * ids.reduce((s, i) => s + r.zi[i], 0);
  const first = (a, b, f) => { for (let i = a; i <= b; i++) if (f(rec[i])) return i; return -1; };
  const last = (a, b, f) => { for (let i = b; i >= a; i--) if (f(rec[i])) return i; return -1; };
  // P and QRS of the 5th beat, T of the 4th
  const pOn = first(i0 + 1, i1, r => part(r, [0]) > TH), pOff = last(i0 + 1, i1, r => part(r, [0]) > TH);
  const qOn = first(pOff, i1 + 200, r => Math.abs(part(r, [1, 2, 3])) > TH);
  const qOff = last(i1, i1 + 200, r => Math.abs(part(r, [1, 2, 3])) > TH);
  const qOn0 = first(i0 - 200, i0, r => Math.abs(part(r, [1, 2, 3])) > TH);
  const tEnd = last(i0, i1, r => part(r, [4]) > TH);
  let tPk = i0; for (let i = i0; i < i1; i++) if (part(rec[i], [4]) > part(rec[tPk], [4])) tPk = i;
  let pPk = i0; for (let i = i0; i < i1; i++) if (part(rec[i], [0]) > part(rec[pPk], [0])) pPk = i;
  let minTP = Infinity; for (let i = tPk; i <= pPk; i++) minTP = Math.min(minTP, rec[i].y);
  const qt = rec[tEnd].t - rec[qOn0].t, fr = 0.40 - 0.154 * (1 - Math.min(2, Math.max(0.25, rr)));
  console.log([hr, ms(rec[pOff].t - rec[pOn].t), ms(rec[qOn].t - rec[pOn].t), ms(rec[qOff].t - rec[qOn].t), ms(qt),
    (fr * 1000 + (qw - 1) * 2 * (24 + 22.5)).toFixed(1), rec[i1].y.toFixed(2), rec[tPk].y.toFixed(2), minTP.toFixed(3)].join('  '));
}
