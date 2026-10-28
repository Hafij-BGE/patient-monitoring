/* Small streaming DSP toolkit: RBJ biquads, filter chains, moving windows,
 * ring buffers and statistics. NaN in -> NaN out, filter state is untouched. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).dsp = factory();
})(this, function () {
  'use strict';

  class Biquad {
    constructor(c) { Object.assign(this, c); this.z1 = 0; this.z2 = 0; }
    // Transposed direct form II.
    process(x) {
      if (!Number.isFinite(x)) return NaN;
      const y = this.b0 * x + this.z1;
      this.z1 = this.b1 * x - this.a1 * y + this.z2;
      this.z2 = this.b2 * x - this.a2 * y;
      return y;
    }
    reset() { this.z1 = 0; this.z2 = 0; }
  }

  /** Coefficients from R. Bristow-Johnson, "Cookbook formulae for audio EQ biquad filter coefficients". */
  function rbj(type, f0, fs, Q) {
    const w0 = 2 * Math.PI * Math.min(f0, fs * 0.49) / fs;
    const cw = Math.cos(w0), sw = Math.sin(w0), alpha = sw / (2 * (Q || Math.SQRT1_2));
    let b0, b1, b2;
    const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
    if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
    else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
    else if (type === 'notch') { b0 = 1; b1 = -2 * cw; b2 = 1; }
    else throw new Error('unknown filter type ' + type);
    return new Biquad({ b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 });
  }

  class Chain {
    constructor(stages) { this.stages = stages; }
    process(x) { for (const s of this.stages) x = s.process(x); return x; }
    reset() { this.stages.forEach(s => s.reset()); }
  }

  /** 2nd-order Butterworth high-pass at lo + 2nd-order low-pass at hi. */
  function bandpass(lo, hi, fs) { return new Chain([rbj('highpass', lo, fs), rbj('lowpass', hi, fs)]); }
  function notch(f0, fs, Q) { return rbj('notch', f0, fs, Q || 30); }
  const passthrough = () => ({ process: x => x, reset() {} });

  /** Moving-window mean over n samples (Pan–Tompkins integrator). */
  class MovingAverage {
    constructor(n) { this.n = Math.max(1, n | 0); this.buf = new Float64Array(this.n); this.i = 0; this.sum = 0; this.count = 0; }
    process(x) {
      if (!Number.isFinite(x)) return NaN;
      this.sum += x - this.buf[this.i];
      this.buf[this.i] = x;
      this.i = (this.i + 1) % this.n;
      if (this.count < this.n) this.count++;
      return this.sum / this.n;
    }
    reset() { this.buf.fill(0); this.i = 0; this.sum = 0; this.count = 0; }
  }

  /** Fixed-capacity ring buffer with absolute sample indexing. */
  class Ring {
    constructor(capacity) { this.cap = capacity; this.data = new Float64Array(capacity); this.total = 0; }
    push(v) { this.data[this.total % this.cap] = v; this.total++; }
    /** absolute index i (0 = first sample ever pushed); undefined if overwritten */
    at(i) { return (i < this.total && i >= this.total - this.cap && i >= 0) ? this.data[i % this.cap] : undefined; }
    /** last n samples, oldest first */
    last(n) {
      n = Math.min(n, this.total, this.cap);
      const out = new Array(n);
      for (let k = 0; k < n; k++) out[k] = this.data[(this.total - n + k) % this.cap];
      return out;
    }
    clear() { this.total = 0; }
  }

  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
  function std(a) { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, a.length - 1)); }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  return { Biquad, rbj, Chain, bandpass, notch, passthrough, MovingAverage, Ring, mean, rms, std, clamp };
});
