/* Seeded pseudo-random numbers so every run (and every test) is reproducible. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).rng = factory();
})(this, function () {
  'use strict';

  // mulberry32: small, fast 32-bit generator; adequate for simulation noise (not cryptographic).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Rng {
    constructor(seed) { this.uniform = mulberry32(seed === undefined ? 1 : seed); this.spare = null; }
    /** Standard normal deviate (Box–Muller). */
    gauss() {
      if (this.spare !== null) { const s = this.spare; this.spare = null; return s; }
      let u = 0, v = 0;
      while (u === 0) u = this.uniform();
      v = this.uniform();
      const r = Math.sqrt(-2 * Math.log(u));
      this.spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    }
    range(lo, hi) { return lo + (hi - lo) * this.uniform(); }
  }

  /** Band-limited random motion signal: sum of a few sinusoids with random
   *  frequencies (0.5–3 Hz) and phases, unit RMS. Deterministic for a given Rng. */
  class MotionSource {
    constructor(rng, n) {
      this.c = [];
      n = n || 5;
      for (let i = 0; i < n; i++) this.c.push({ f: rng.range(0.5, 3), ph: rng.range(0, 2 * Math.PI), a: rng.range(0.5, 1) });
      const pow = this.c.reduce((s, k) => s + k.a * k.a / 2, 0);
      this.norm = 1 / Math.sqrt(pow);
    }
    at(t) { let s = 0; for (const k of this.c) s += k.a * Math.sin(2 * Math.PI * k.f * t + k.ph); return s * this.norm; }
  }

  return { Rng, MotionSource, mulberry32 };
});
