/* Normalised arterial pulse shape shared by the PPG and the NIBP arterial
 * pressure model. Illustrative shape (systolic wave + reflected/diastolic wave),
 * not fitted to patient data. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).pulse = factory();
})(this, function () {
  'use strict';

  const g = (u, c, w) => Math.exp(-0.5 * ((u - c) / w) * ((u - c) / w));
  const raw = u => g(u, 0.18, 0.07) + 0.45 * g(u, 0.45, 0.09);
  const r0 = raw(0), r1 = raw(1);
  // Remove the linear trend between u=0 and u=1 so the beat starts and ends at 0, then scale peak to 1.
  const detr = u => raw(u) - (r0 + (r1 - r0) * u);
  let peak = 0, acc = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) { const v = detr(i / N); if (v > peak) peak = v; acc += v; }
  const MEAN_FRACTION = acc / N / peak; // time-average of the shape (for "true" waveform mean)

  /** u = time since beat onset / beat duration, in [0,1). Returns 0..1. */
  function shape(u) { return (u < 0 || u >= 1) ? 0 : Math.max(0, detr(u) / peak); }

  /** Sum of the pulse shapes of recent beats at time t.
   *  beats: [{t0: onset time (s), T: duration (s), amp: relative stroke volume (default 1)}] */
  function train(beats, t) {
    let s = 0;
    for (let i = beats.length - 1; i >= 0; i--) {
      const b = beats[i];
      if (t >= b.t0 && t < b.t0 + b.T) s += (b.amp === undefined ? 1 : b.amp) * shape((t - b.t0) / b.T);
    }
    return s;
  }

  return { shape, train, MEAN_FRACTION };
});
