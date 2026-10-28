/* Arrhythmia teaching patterns: the pieces of the simulated patient that the
 * McSharry beat model cannot express on its own, plus the monitor-side rhythm
 * analyser that looks at the acquired ECG.
 *
 * Patient side (used by ecg.js):
 *   SVT                  narrow beats at a fast, very regular rate with no visible P wave
 *                        (hidden in the QRS); handled in ecg.js like a normal beat without P
 *   ventricularParams()  wide ventricular complex (no P, broad R, S, inverted T),
 *                        defined in seconds and converted to the model's phase units
 *   Fibrillation         sum of slowly drifting sinusoids: AF f-waves (6–9 Hz, small)
 *                        or VF (3–7 Hz, coarse, no organised QRS)
 * Monitor side (used by engine.js):
 *   RhythmAnalyzer       rule-based labels from QRS times, QRS width and signal shape
 *
 * All shapes, rates and thresholds are illustrative teaching values chosen for
 * this simulator. They are not a validated arrhythmia algorithm (IEC 60601-2-27
 * requires one to be tested against annotated databases) and give no diagnosis. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dsp.js'));
  else (root.PM = root.PM || {}).arrhythmia = factory(root.PM.dsp);
})(this, function (dsp) {
  'use strict';

  const TWO_PI = 2 * Math.PI;
  const MODES = ['none', 'af', 'svt', 'pvc', 'vt', 'vf', 'asystole'];

  /** Pulse amplitude (relative stroke volume) of each beat kind; illustrative. */
  const PULSE_AMP = { normal: 1, pvc: 0.4, vt: 0.5 };

  /**
   * Wide ventricular complex for a cycle of length L seconds, R at phase thetaR.
   * Each event: [time from R (s), Gaussian SD (s), relative amplitude]. The McSharry
   * forcing a·Δθ·exp(−Δθ²/2b²) produces a bump of height ≈ a·b²/ω, so a = A·ω/b².
   */
  function ventricularParams(L, thetaR) {
    const om = TWO_PI / L;
    const ev = [
      [-0.5 * L, 0.05, 0],                  // P: absent (atria not driving the beat)
      [-0.035, 0.03, -0.08],                // small Q
      [0, 0.04, 1],                         // broad R (QRS well over 120 ms)
      [0.075, 0.04, -0.45],                 // S
      [Math.min(0.3, 0.42 * L), 0.075, -0.35], // T opposite to the main QRS deflection
    ];
    const theta = [], a = [], b = [];
    for (const [tau, sd, A] of ev) {
      const th = thetaR + om * tau, bb = om * sd;
      theta.push(th); b.push(bb); a.push(A * om / (bb * bb));
    }
    return { theta, a, b };
  }

  /** Drifting multi-sine generator for fibrillatory activity (unit peak ≈ 1). */
  class Fibrillation {
    constructor(rng, fLo, fHi, n) {
      this.rng = rng; this.fLo = fLo; this.fHi = fHi; this.t = 0;
      this.c = [];
      for (let i = 0; i < (n || 4); i++)
        this.c.push({ f: rng.range(fLo, fHi), ph: rng.range(0, TWO_PI), em: rng.range(0.1, 0.35), ep: rng.range(0, TWO_PI) });
      this.norm = 1 / Math.sqrt(this.c.length);
    }
    /** Advance by dt seconds and return the value. */
    step(dt) {
      this.t += dt;
      let s = 0;
      for (const c of this.c) {
        c.f += this.rng.gauss() * 0.02;                       // slow frequency random walk
        if (c.f < this.fLo || c.f > this.fHi) c.f = Math.min(this.fHi, Math.max(this.fLo, c.f));
        c.ph += TWO_PI * c.f * dt;
        if (c.ph > TWO_PI) c.ph -= TWO_PI;
        const env = 0.6 + 0.4 * Math.sin(TWO_PI * c.em * this.t + c.ep); // waxing and waning amplitude
        s += env * Math.sin(c.ph);
      }
      return s * this.norm;
    }
  }

  const LABELS = {
    learning: 'Learning', unavailable: 'Not analysed', regular: 'Regular', irregular: 'Irregular',
    svt: 'SVT', pvc: 'PVCs', vtach: 'V-Tach', vfib: 'V-Fib', asystole: 'Asystole',
  };

  function median(a) { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; }
  function quantile(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]; }

  /**
   * Rule-based rhythm labels from the acquired ECG (what the monitor can see).
   *  - QRS width: span around the largest deflection where |x − baseline| stays above
   *    15 % of its peak; wide if > WIDE_S.
   *  - asystole: almost no signal (peak-to-peak < 0.3 mV over 4 s), or no QRS for
   *    4 s while the trace keeps an isoelectric baseline.
   *  - V-Fib: no QRS for 4 s on a busy trace (no isoelectric baseline), or the
   *    detected "complexes" are wide and chaotic (RR coefficient of variation > 0.3).
   *  - V-Tach: the last 4 complexes are wide at a rate > 100 bpm.
   *  - SVT: the last 8 complexes are narrow, very regular (RR coefficient of variation
   *    < 0.06) and faster than 150 bpm. Rate, width and regularity only: P waves are not
   *    looked for, so a sinus rhythm above 150 bpm gets the same label.
   *  - irregular: coefficient of variation of narrow-to-narrow RR > 0.12.
   *  - PVCs: wide complexes counted over the last 60 s.
   */
  class RhythmAnalyzer {
    constructor(fs) {
      this.fs = fs;
      this.filter = dsp.bandpass(0.5, Math.min(40, 0.4 * fs), fs);
      this.buf = new dsp.Ring(Math.round(6 * fs));
      this.reset(0);
    }
    reset(t) {
      this.filter.reset(); this.buf.clear();
      this.qrs = []; this.t0 = t; this.tLast = t; this.lostAt = -Infinity;
      this.out = { rhythm: 'learning', label: LABELS.learning, pvcPerMin: null, qrsWidthMs: null, rrCv: null };
    }
    process(x, t) {
      this.tLast = t;
      if (!Number.isFinite(x)) { this.lostAt = t; this.filter.reset(); this.buf.push(0); return; }
      this.buf.push(this.filter.process(x));
    }
    /** QRS time from the beat detector; the width is measured on the samples already buffered. */
    onQrs(tq) {
      const fs = this.fs, seg = this.buf.last(Math.round(0.32 * fs));
      const base = median(this.buf.last(Math.round(2 * fs)));
      let ip = 0, peak = 0;
      for (let i = 0; i < seg.length; i++) { const a = Math.abs(seg[i] - base); if (a > peak) { peak = a; ip = i; } }
      const sign = Math.sign(seg[ip] - base), thr = 0.15 * peak;
      let l = ip, r = ip;
      while (l > 0 && sign * (seg[l - 1] - base) > thr) l--;
      while (r < seg.length - 1 && sign * (seg[r + 1] - base) > thr) r++;
      const width = (r - l + 1) / fs;
      this.qrs.push({ t: tq, width, wide: width > RhythmAnalyzer.WIDE_S, amp: peak });
      while (this.qrs.length && this.qrs[0].t < tq - 60) this.qrs.shift();
    }
    /** Run the rules once (1 Hz). leadsOff: no analysis possible. */
    analyse(t, leadsOff) {
      const o = this.out;
      const set = (rhythm, extra) => {
        Object.assign(o, { rhythm, label: LABELS[rhythm] }, extra || {});
        if (rhythm === 'vfib' || rhythm === 'vtach' || rhythm === 'asystole') o.pvcPerMin = null; // count means nothing here
        return o;
      };
      if (leadsOff || t - this.lostAt < 2) return set('unavailable', { pvcPerMin: null, qrsWidthMs: null, rrCv: null });
      if (t - Math.max(this.t0, this.lostAt) < RhythmAnalyzer.LEARN_S) return set('learning');

      const sig = this.buf.last(Math.round(4 * this.fs));
      const sorted = sig.slice().sort((x, y) => x - y);
      const med = quantile(sorted, 0.5), range = quantile(sorted, 0.95) - quantile(sorted, 0.05);
      const ptp = sorted[sorted.length - 1] - sorted[0];
      let near = 0;
      for (const v of sig) if (Math.abs(v - med) < 0.1 * ptp) near++;
      const flat = near / sig.length; // fraction of time near the baseline

      const recent = this.qrs.filter(q => q.t > t - 10), last4s = recent.filter(q => q.t > t - 4);
      const rr = [];
      for (let i = 1; i < recent.length; i++) rr.push(recent[i].t - recent[i - 1].t);
      const cv = rr.length >= 3 ? dsp.std(rr) / dsp.mean(rr) : null;
      const widths = recent.map(q => q.width);
      const extra = { flat: Number(flat.toFixed(3)), rangeMv: Number(range.toFixed(3)), ptpMv: Number(ptp.toFixed(3)), qrsWidthMs: widths.length ? Math.round(1000 * median(widths)) : null, rrCv: cv === null ? null : Number(cv.toFixed(3)) };

      const span = Math.min(60, t - this.t0);
      const wideCount = this.qrs.filter(q => q.wide).length;
      extra.pvcPerMin = Math.round(wideCount * 60 / Math.max(10, span));

      if (ptp < 0.3) return set('asystole', extra);
      if (!last4s.length) return set(flat < 0.5 ? 'vfib' : 'asystole', extra);
      if (widths.length >= 3 && median(widths) > RhythmAnalyzer.WIDE_S && (cv === null || cv > 0.3)) return set('vfib', extra);
      const tail = recent.slice(-4);
      if (tail.length === 4 && tail.every(q => q.wide)) {
        const hr = 60 / median(rr.slice(-3));
        if (hr > 100) return set('vtach', extra);
      }
      const run = recent.slice(-RhythmAnalyzer.SVT_BEATS);
      if (run.length === RhythmAnalyzer.SVT_BEATS && run.every(q => !q.wide)) {
        const rrRun = [];
        for (let i = 1; i < run.length; i++) rrRun.push(run[i].t - run[i - 1].t);
        if (60 / median(rrRun) > RhythmAnalyzer.SVT_HR && dsp.std(rrRun) / dsp.mean(rrRun) < RhythmAnalyzer.SVT_CV) return set('svt', extra);
      }
      const nn = [];
      for (let i = 1; i < recent.length; i++) if (!recent[i].wide && !recent[i - 1].wide) nn.push(recent[i].t - recent[i - 1].t);
      if (nn.length >= 6 && dsp.std(nn) / dsp.mean(nn) > 0.12) return set('irregular', extra);
      if (wideCount > 0 && this.qrs.some(q => q.wide && q.t > t - 60)) return set('pvc', extra);
      return set('regular', extra);
    }
  }
  // Tuned on this simulator's own waveforms (see tests/unit/arrhythmia.test.js). The width
  // is measured on a 0.5–40 Hz band-passed trace at 15 % of the peak, so it reads lower
  // than a clinical QRS duration; 75 ms separates the model's narrow (≈ 45 ms) and
  // ventricular (≈ 95–140 ms) complexes.
  RhythmAnalyzer.WIDE_S = 0.075;
  RhythmAnalyzer.LEARN_S = 8;
  // SVT rule: illustrative teaching thresholds (not taken from a product or a standard).
  RhythmAnalyzer.SVT_BEATS = 8;
  RhythmAnalyzer.SVT_HR = 150;
  RhythmAnalyzer.SVT_CV = 0.06;

  return { MODES, PULSE_AMP, LABELS, ventricularParams, Fibrillation, RhythmAnalyzer, median };
});
