/* Monitor-side estimators. They see only the sampled signals, never the
 * simulator's "true" settings, so their outputs carry real measurement error. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dsp.js'));
  else (root.PM = root.PM || {}).detectors = factory(root.PM.dsp);
})(this, function (dsp) {
  'use strict';

  function meanOfLast(arr, n) { const a = arr.slice(-n); return a.reduce((s, x) => s + x, 0) / a.length; }

  /**
   * Simplified Pan–Tompkins QRS detector (Pan & Tompkins, IEEE TBME 1985;32(3):230–6):
   * band-pass 5–15 Hz → 5-point derivative → squaring → 150 ms moving-window
   * integration → adaptive thresholds (SPKI/NPKI) with 200 ms refractory period and
   * a T-wave slope check within 360 ms (largest slope over the 150 ms integration window,
   * compared with the previous QRS). The beat time is the largest band-passed sample in
   * that window (the R peak), not the integrator peak, whose small ripples would move the
   * mark by up to ±60 ms. Search-back for missed beats is not implemented.
   */
  class PanTompkins {
    constructor(fs) {
      this.fs = fs;
      this.bp = dsp.bandpass(5, 15, fs);
      this.mwi = new dsp.MovingAverage(Math.round(0.15 * fs));
      this.slopeN = Math.round(0.15 * fs);
      this.reset();
    }
    reset() {
      this.bp.reset(); this.mwi.reset();
      this.x = [0, 0, 0, 0];
      this.n = 0; this.learnN = Math.round(2 * this.fs);
      this.learnMax = 0; this.learnSum = 0;
      this.spki = 0; this.npki = 0; this.thr = Infinity;
      this.m1 = 0; this.m2 = 0; this.slopes = new Float64Array(this.slopeN); this.ys = new Float64Array(this.slopeN); this.si = 0;
      this.lastQRS = null; this.lastSlope = 0;
      this.rrs = []; this.beats = [];
    }
    /** Feed one sample; returns QRS time (s) when a beat is detected, else null. */
    process(x, t) {
      if (!Number.isFinite(x)) { if (this.n) this.reset(); return null; }
      const y = this.bp.process(x);
      const d = (2 * y + this.x[0] - this.x[2] - 2 * this.x[3]) * this.fs / 8;
      this.x = [y, this.x[0], this.x[1], this.x[2]];
      const m = this.mwi.process(d * d);
      this.n++;
      this.slopes[this.si] = Math.abs(d); this.ys[this.si] = Math.abs(y); this.si = (this.si + 1) % this.slopeN;
      let out = null;
      if (this.n <= this.learnN) {
        this.learnMax = Math.max(this.learnMax, m); this.learnSum += m;
        if (this.n === this.learnN) {
          this.spki = 0.25 * this.learnMax; this.npki = 0.5 * this.learnSum / this.learnN;
          this.thr = this.npki + 0.25 * (this.spki - this.npki);
        }
      } else if (this.m1 > this.m2 && this.m1 >= m) {
        // local maximum of the integrated signal at the previous sample
        const pk = this.m1;
        let slope = 0, k = 0;
        for (const v of this.slopes) if (v > slope) slope = v;
        for (let j = 1; j < this.slopeN; j++) if (this.ys[(this.si - 1 - j + this.slopeN) % this.slopeN] > this.ys[(this.si - 1 - k + this.slopeN) % this.slopeN]) k = j;
        const tp = t - k / this.fs;
        const since = this.lastQRS === null ? Infinity : tp - this.lastQRS;
        if (pk > this.thr && since > 0.2) {
          if (since < 0.36 && slope < 0.5 * this.lastSlope) {
            this.npki = 0.125 * pk + 0.875 * this.npki; // T wave: treat as noise
          } else {
            this.spki = 0.125 * pk + 0.875 * this.spki;
            if (this.lastQRS !== null) { const rr = since; if (rr > 0.2 && rr < 3) { this.rrs.push(rr); if (this.rrs.length > 16) this.rrs.shift(); } }
            this.lastQRS = tp; this.lastSlope = slope; out = tp;
            this.beats.push(tp); if (this.beats.length > 32) this.beats.shift();
          }
        } else this.npki = 0.125 * pk + 0.875 * this.npki;
        this.thr = this.npki + 0.25 * (this.spki - this.npki);
      }
      this.m2 = this.m1; this.m1 = m;
      return out;
    }
    /** Heart rate = 60 / mean of the last 8 RR intervals; null if no recent beats. */
    heartRate(tNow) {
      if (this.rrs.length < 2 || this.lastQRS === null) return null;
      const rrMean = meanOfLast(this.rrs, 8);
      if (tNow - this.lastQRS > Math.max(3, 2.5 * rrMean)) return null;
      return 60 / rrMean;
    }
  }

  /** Breath detector for impedance pneumography: band-pass 0.1–1 Hz, hysteresis
   *  threshold h (Ω), RR = 60 / mean of last 4 breath intervals, apnea after delay. */
  class BreathDetector {
    constructor(fs) { this.fs = fs; this.bp = dsp.bandpass(0.1, 1.0, fs); this.reset(0); }
    reset(t) { this.bp.reset(); this.state = 0; this.lastBreath = null; this.startT = t || 0; this.intervals = []; this.breaths = []; }
    process(x, t, h) {
      if (!Number.isFinite(x)) return null;
      const y = this.bp.process(x);
      let out = null;
      if (this.state <= 0 && y > h) {
        if (this.state === -1) {
          if (this.lastBreath !== null) { this.intervals.push(t - this.lastBreath); if (this.intervals.length > 8) this.intervals.shift(); }
          this.lastBreath = t; out = t;
          this.breaths.push(t); if (this.breaths.length > 32) this.breaths.shift();
        }
        this.state = 1;
      } else if (this.state >= 0 && y < -h) this.state = -1;
      this.y = y;
      return out;
    }
    apnea(t, delay) { const ref = this.lastBreath === null ? this.startT : this.lastBreath; return t - ref > delay; }
    rate(t, delay) {
      if (this.apnea(t, delay)) return 0;
      if (this.intervals.length < 2) return null;
      return 60 / meanOfLast(this.intervals, 4);
    }
  }

  /**
   * Ratio-of-ratios SpO2 estimator. ln(I) of each wavelength is band-passed
   * 0.5–5 Hz; R = RMS(red AC)/RMS(IR AC) over a 4 s window, updated every 1 s.
   * SpO2 = 110 − 25·R: an empirical straight-line calibration given as an example in
   * TI application report SLAA655 (real devices use device-specific calibration
   * curves from desaturation studies). A pulse is accepted only when the band-passed
   * red and IR signals are correlated (Pearson r ≥ 0.6 over the 4 s window): the
   * arterial volume change is common to both wavelengths, while detector noise is
   * independent. Otherwise status is 'no-pulse' and SpO2/PR are blanked, as oximeters
   * do when no pulsatile component is found (noise alone gives a ratio near 1 and a
   * spurious ~85 %). Unlike a periodicity test this also accepts irregular rhythms
   * such as AF; common-mode motion passes it too, as it fools real oximeters.
   * SQI = min(consistency of R across four 1-s sub-windows, red/IR correlation). PI = peak-to-peak of ln(IR)
   * band-passed 0.1–10 Hz over the 4 s window × 100, i.e. AC/DC in % (the narrower
   * 0.5–5 Hz SpO2 band trims ~12 % of the pulse amplitude). Pulse rate from peaks of the
   * inverted 0.5–5 Hz IR signal. The displayed pleth is the inverted 0.1–10 Hz IR signal.
   */
  const PULSE_CORR_MIN = 0.6;
  /** Pearson correlation of two equal-length arrays. */
  function corr(a, b) {
    const ma = dsp.mean(a), mb = dsp.mean(b);
    let ab = 0, aa = 0, bb = 0;
    for (let n = 0; n < a.length; n++) { const x = a[n] - ma, y = b[n] - mb; ab += x * y; aa += x * x; bb += y * y; }
    return ab / Math.sqrt(Math.max(aa * bb, 1e-30));
  }

  class SpO2Estimator {
    constructor(fs) {
      this.fs = fs;
      this.bpR = dsp.bandpass(0.5, 5, fs); this.bpI = dsp.bandpass(0.5, 5, fs);
      this.lpDC = dsp.rbj('lowpass', 0.3, fs);
      this.hpPI = dsp.bandpass(0.1, 10, fs); // wider band for PI: keeps the pulse amplitude
      const n = 4 * fs;
      this.acR = new dsp.Ring(n); this.acI = new dsp.Ring(n); this.piI = new dsp.Ring(n);
      this.reset();
    }
    reset() {
      this.bpR.reset(); this.bpI.reset(); this.lpDC.reset(); this.hpPI.reset(); this.acR.clear(); this.acI.clear(); this.piI.clear();
      this.k = 0; this.inst = []; this.dc = null; this.warm = 0;
      this.pk = { y1: 0, y2: 0, last: null, intervals: [], max: 0 };
      this.out = { spo2: null, sqi: null, pi: null, pr: null, status: 'searching' };
    }
    /** Feed one sample pair (normalised intensities). Returns the pleth display value (or NaN). */
    process(red, ir, t, avgN) {
      if (!Number.isFinite(red) || !Number.isFinite(ir)) {
        this.bpR.reset(); this.bpI.reset(); this.hpPI.reset(); this.acR.clear(); this.acI.clear(); this.piI.clear(); this.warm = 0;
        this.pk.last = null; this.pk.max = 0; // do not measure a pulse interval across a gap
        this.out = { spo2: null, sqi: null, pi: null, pr: null, status: 'no-signal' };
        return NaN;
      }
      this.dc = this.lpDC.process(ir);
      const r = this.bpR.process(Math.log(Math.max(red, 1e-6)));
      const lnIr = Math.log(Math.max(ir, 1e-6));
      const i = this.bpI.process(lnIr), w = this.hpPI.process(lnIr);
      this.warm++;
      // Absorbance rises with blood volume, so both are inverted. Pulse peaks are found in
      // the 0.5–5 Hz band; the displayed pleth uses the 0.1–10 Hz band, which keeps the
      // diastolic decay, the dicrotic notch and the diastolic wave of the volume pulse.
      if (this.warm > this.fs) { this.acR.push(r); this.acI.push(i); this.piI.push(w); this.detectPulse(-i, t); }
      if (++this.k >= this.fs) { this.k = 0; this.update(t, avgN); }
      return -w;
    }
    detectPulse(y, t) {
      const p = this.pk;
      p.max = Math.max(p.max * Math.exp(-1 / (2 * this.fs)), y); // decaying peak tracker (~2 s)
      if (p.y1 > p.y2 && p.y1 >= y && p.y1 > 0.6 * p.max && (p.last === null || t - p.last > 0.25)) {
        if (p.last !== null) { const iv = t - p.last; if (iv < 3) { p.intervals.push(iv); if (p.intervals.length > 8) p.intervals.shift(); } }
        p.last = t;
      }
      p.y2 = p.y1; p.y1 = y;
    }
    update(t, avgN) {
      if (this.dc !== null && this.dc > 1.5) { this.out = { spo2: null, sqi: null, pi: null, pr: null, status: 'probe-off' }; this.inst = []; return; }
      if (this.acI.total < 4 * this.fs) { this.out = { spo2: null, sqi: null, pi: null, pr: null, status: 'searching' }; return; }
      const R = this.acR.last(4 * this.fs), I = this.acI.last(4 * this.fs);
      const rmsI = dsp.rms(I);
      const ratio = dsp.rms(R) / Math.max(rmsI, 1e-12);
      const subs = [];
      for (let j = 0; j < 4; j++) {
        const a = R.slice(j * this.fs, (j + 1) * this.fs), b = I.slice(j * this.fs, (j + 1) * this.fs);
        subs.push(dsp.rms(a) / Math.max(dsp.rms(b), 1e-12));
      }
      const cv = dsp.std(subs) / Math.max(dsp.mean(subs), 1e-9);
      const rc = corr(R, I);
      const sqi = Math.min(dsp.clamp(1 - cv / 0.2, 0, 1), dsp.clamp((rc - PULSE_CORR_MIN) / 0.3, 0, 1)) * 100;
      const inst = dsp.clamp(110 - 25 * ratio, 0, 100);
      this.inst.push(inst); while (this.inst.length > (avgN || 8)) this.inst.shift();
      const W = this.piI.last(4 * this.fs), pi = (Math.max(...W) - Math.min(...W)) * 100;
      const p = this.pk;
      const pr = (p.intervals.length >= 2 && p.last !== null && t - p.last < 3) ? 60 / meanOfLast(p.intervals, 8) : null;
      const pulsatile = rmsI >= 1e-5 && rc >= PULSE_CORR_MIN;
      this.out = { spo2: dsp.mean(this.inst), spo2Inst: inst, ratio, sqi, pi, pr, redIrCorr: rc, status: pulsatile ? 'ok' : 'no-pulse' };
      if (!pulsatile) { Object.assign(this.out, { spo2: null, pr: null, pi: null, sqi: 0 }); this.inst = []; }
    }
  }

  /** Capnogram breath detector. An expiration starts when CO2 rises above the inspired
   *  minimum by half of the last end-tidal swing (≥ 2 mmHg; the threshold relaxes over
   *  ~6 s so a falling EtCO2 is still followed) and ends when it falls back through the
   *  midpoint. EtCO2 = peak of the last expiration, FiCO2 = minimum before it,
   *  awRR = 60 / mean of the last 4 breath intervals. All null after `delay` s without a breath.
   *  The input is first smoothed by a 5-sample moving average (100 ms at 50 Hz): the peak of
   *  the raw samples picks the largest noise excursion on the plateau and read EtCO2
   *  0.3–0.4 mmHg high; the averaged peak is within 0.1 mmHg of the plateau. */
  class CapnoDetector {
    constructor() { this.reset(); }
    reset() {
      this.high = false; this.min = Infinity; this.max = -Infinity; this.fiCycle = 0;
      this.lastEt = null; this.lastFi = null; this.lastEnd = null; this.intervals = []; this.win = [];
    }
    process(raw, t) {
      if (!Number.isFinite(raw)) { this.high = false; this.min = Infinity; this.win = []; return null; }
      this.win.push(raw); if (this.win.length > 5) this.win.shift();
      const c = dsp.mean(this.win);
      let out = null;
      if (!this.high) {
        this.min = Math.min(this.min, c);
        const relax = this.lastEnd === null ? 0 : Math.exp(-(t - this.lastEnd) / 6);
        const rise = this.lastEt === null ? 4 : Math.max(2, 0.5 * (this.lastEt - this.min) * relax);
        if (c > this.min + rise) { this.high = true; this.max = c; this.fiCycle = this.min; }
      } else {
        this.max = Math.max(this.max, c);
        if (c < this.fiCycle + 0.5 * (this.max - this.fiCycle)) {
          this.high = false; this.lastEt = this.max; this.lastFi = this.fiCycle; this.min = c;
          if (this.lastEnd !== null) { this.intervals.push(t - this.lastEnd); if (this.intervals.length > 8) this.intervals.shift(); }
          this.lastEnd = t; out = t;
        }
      }
      return out;
    }
    recent(t, delay) { return this.lastEnd !== null && t - this.lastEnd <= delay; }
    etco2(t, delay) { return this.recent(t, delay) ? this.lastEt : null; }
    fico2(t, delay) { return this.recent(t, delay) ? this.lastFi : null; }
    rate(t, delay) { return this.recent(t, delay) && this.intervals.length >= 2 ? 60 / meanOfLast(this.intervals, 4) : null; }
  }

  return { PanTompkins, BreathDetector, SpO2Estimator, CapnoDetector };
});
