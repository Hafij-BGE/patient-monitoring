/* Refit of the NIBP arctangent widths (src/sim/nibp.js) to the current pulse model.
 * For a monotonic v(P) the per-beat oscillation amplitude at cuff pressure Pc is
 * G·[v(SBP − Pc) − v(DBP − Pc)], so the cuff pressure of the oscillation maximum
 * depends only on SBP, DBP and the widths. The widths are chosen so that this
 * maximum matches the waveform-area MAP of the Windkessel pulse over a set of cases.
 * Usage: node tests/tools/nibp-fit.js   (prints the best widths, RMS error and Ks/Kd) */
'use strict';
const pulse = require('../../src/sim/pulse.js');
const CASES = [[72, 120, 80], [72, 140, 90], [72, 100, 60], [72, 160, 100], [90, 90, 50],
  [110, 80, 46], [60, 180, 90], [50, 110, 70], [100, 130, 85], [130, 95, 65]];

const v = (P, wc, wd) => 0.5 + Math.atan(P / (P < 0 ? wc : wd)) / Math.PI;
const env = (s, d, pc, wc, wd) => v(s - pc, wc, wd) - v(d - pc, wc, wd);

function analyse(s, d, wc, wd) {
  let best = -Infinity, pm = 0;
  for (let pc = d - 40; pc <= s + 40; pc += 0.05) { const a = env(s, d, pc, wc, wd); if (a > best) { best = a; pm = pc; } }
  return { pm, ks: env(s, d, s, wc, wd) / best, kd: env(s, d, d, wc, wd) / best };
}

const truth = CASES.map(([hr, s, d]) => d + (s - d) * pulse.fit(hr, s, d, 10).meanFraction);
let best = null;
for (let wc = 1; wc <= 10; wc += 0.25) for (let wd = 2; wd <= 14; wd += 0.25) {
  let e2 = 0;
  CASES.forEach(([, s, d], i) => { const r = analyse(s, d, wc, wd); e2 += (r.pm - truth[i]) ** 2; });
  const rms = Math.sqrt(e2 / CASES.length);
  if (!best || rms < best.rms) best = { wc, wd, rms };
}
const ks = [], kd = [];
CASES.forEach(([hr, s, d], i) => {
  const r = analyse(s, d, best.wc, best.wd); ks.push(r.ks); kd.push(r.kd);
  console.log(`${hr} bpm ${s}/${d}: true MAP ${truth[i].toFixed(1)}, max at ${r.pm.toFixed(1)}, Ks ${r.ks.toFixed(3)}, Kd ${r.kd.toFixed(3)}`);
});
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`W_COLLAPSE ${best.wc}, W_DISTEND ${best.wd}: RMS ${best.rms.toFixed(2)} mmHg; Ks ${mean(ks).toFixed(3)}, Kd ${mean(kd).toFixed(3)}`);
