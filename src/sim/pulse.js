/* Arterial pressure pulse from a three-element Windkessel (Westerhof N, Lankhaar JW,
 * Westerhof BE. The arterial Windkessel. Med Biol Eng Comput 2009;47:131–141):
 *   P = P∞ + Zc·Q + Pc,   C·dPc/dt = Q − Pc/R,   τ = R·C.
 * Q(t) is the ejection flow of one beat: sin(πu)·(1 − u), u = t/Te, a half-sine skewed
 * to an early peak, lasting the ejection time Te, with unit area (one stroke volume).
 * At aortic valve closure the flow is followed by a brief backflow (2.5 % of the stroke
 * volume over 30 ms) and a small forward rebound (3 % over 100 ms). Through Zc this gives
 * the incisura (dicrotic notch) and the dicrotic wave on the downstroke: the notch is a
 * valve-closure event, while the following wave is in reality shaped by wave reflection,
 * which a lumped Windkessel cannot represent, so the rebound is an illustrative stand-in.
 * When the R–R interval is too short to fit these after ejection (tachycardia) they are
 * shortened and weakened, so the notch fades at high rates as it does on real traces.
 * Pressure is the superposition of the responses of all past beats, so a long R–R gives a lower diastolic pressure, a
 * short one a higher, and the pressure falls towards P∞ with time constant τ when
 * the beats stop.
 * Te follows Weissler's regression for men, LVET = 413 − 1.7·HR ms (Weissler AM,
 * Harris WS, Schoenfeld CD. Circulation 1968;37:149–159), limited to 0.16 s … 0.6·RR.
 * For a set HR, SBP, DBP and P∞, τ is solved so that the regular-rhythm steady state
 * has exactly the set systolic and diastolic pressures, with Zc = 0.07·R. Zc is the
 * aortic characteristic impedance and does not rise with R, so a narrow pulse pressure
 * (high R, e.g. tamponade, cardiogenic shock) cannot be met with Zc = 0.07·R and a
 * physiological τ; then τ stays at TAU_PHYS (4 s) and Zc/R is lowered instead, and only
 * with Zc = 0 is τ allowed to grow further. The flow shape, the incisura terms and Zc are
 * illustrative.
 *
 * Finger volume pulse (digital volume pulse, DVP) for the PPG: the normalised pressure
 * plus a copy delayed by ΔT = height / SI, where SI = 0.63 + 0.086·age + 0.042·MAP m/s is
 * the stiffness-index regression of Millasseau SC et al. (Clin Sci 2002;103:371–377):
 * the delay between the direct systolic peak and the peak of the wave reflected from the
 * lower body. The sum passes a first-order low-pass (vessel compliance, τv 40 ms,
 * illustrative) and is scaled to unit peak-to-trough, so the perfusion index keeps its
 * set value. The reflected-wave gain is a parameter; vasoconstriction raises it,
 * nitrates lower it (Chowienczyk PJ et al. JACC 1999;34:2007–2014). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).pulse = factory();
})(this, function () {
  'use strict';

  const DT = 1e-3;          // s, kernel resolution (the engine's base tick)
  const ZC = 0.07;          // default characteristic impedance as a fraction of R
  const TAU_MIN = 0.05, TAU_PHYS = 4, TAU_MAX = 60;
  const TAU_FILL = 0.25;    // s, diastolic filling time constant (illustrative)
  // Valve closure: backflow then rebound, as fractions of the stroke volume and durations (s); illustrative.
  const INCISURA = { back: 0.025, tBack: 0.03, rebound: 0.03, tRebound: 0.10 };
  const TAU_VESSEL = 0.04;  // s, finger vessel low-pass for the volume pulse (illustrative)

  /** Ejection time (s) at a heart rate (Weissler 1968, men), limited to 0.16 s … 0.6·RR. */
  function ejectionTime(hr) {
    const rr = 60 / hr;
    return Math.min(0.6 * rr, Math.max(0.16, 0.413 - 0.0017 * hr));
  }

  /** Relative stroke volume of a beat after an R–R interval rr, at a set heart rate hr:
   *  filling during diastole (rr − Te) saturates as 1 − exp(−t/TAU_FILL), normalised to 1
   *  at the set rate. A beat after a short interval ejects less (pulse deficit in atrial
   *  fibrillation), one after a long pause more. This is the usual explanation of the
   *  beat-to-beat pulse variation in AF; Brookes et al. (Circulation 1998;98:1762–1768)
   *  showed that contractility also changes from beat to beat (mechanical restitution,
   *  post-extrasystolic potentiation). Those contractility effects are not modelled. */
  function filling(rr, hr) {
    const te = ejectionTime(hr), f = d => 1 - Math.exp(-Math.max(0, d - te) / TAU_FILL);
    return f(rr) / Math.max(1e-3, f(60 / hr));
  }

  /** One beat's pressure response (per unit R × stroke volume) while blood flows through
   *  the valve (ejection, backflow, rebound), sampled every DT, and the Windkessel pressure
   *  Pc at its end (len). rr limits the valve-closure terms to 0.9·rr − te. */
  function kernel(te, tau, zc, rr) {
    if (zc === undefined) zc = ZC;
    const n = Math.max(2, Math.round(te / DT)), I = INCISURA;
    const room = rr === undefined ? Infinity : 0.9 * rr - n * DT;
    const f = Math.min(1, Math.max(0, room / (I.tBack + I.tRebound)));
    const nb = Math.round(f * I.tBack / DT), nr = Math.round(f * I.tRebound / DT), m = n + nb + nr;
    const q = new Float64Array(m);
    let area = 0;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; q[i] = Math.sin(Math.PI * u) * (1 - u); area += q[i] * DT; }
    for (let i = 0; i < n; i++) q[i] /= area; // unit stroke volume
    // half-sines of the given areas (weakened by f along with their duration)
    for (let i = 0; i < nb; i++) q[n + i] = -f * I.back * Math.PI / (2 * nb * DT) * Math.sin(Math.PI * (i + 0.5) / nb);
    for (let i = 0; i < nr; i++) q[n + nb + i] = f * I.rebound * Math.PI / (2 * nr * DT) * Math.sin(Math.PI * (i + 0.5) / nr);
    const h = new Float64Array(m), e = Math.exp(-DT / tau);
    let pc = 0;
    for (let i = 0; i < m; i++) {
      pc = pc * e + (1 - e) * q[i];         // exact for flow held constant over DT (R = 1)
      h[i] = pc + zc * q[i];
    }
    return { te: n * DT, len: m * DT, tau, zc, h, pcEnd: pc };
  }

  /** Response at age a (s) after the onset of a beat. */
  function respond(k, a) {
    if (a < 0) return 0;
    if (a < k.len) return k.h[Math.min(k.h.length - 1, Math.floor(a / DT))];
    return k.pcEnd * Math.exp(-(a - k.len) / k.tau);
  }

  /** Steady state of a regular rhythm with period rr: min, max and mean of Σ_k h(t + k·rr). */
  function steady(k, rr) {
    const n = Math.round(rr / DT), g = 1 / (1 - Math.exp(-rr / k.tau));
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (let i = 0; i < n; i++) {
      const t = i * DT;
      // While the valve is open: the current beat plus the tails of all earlier beats
      // (geometric series); afterwards every beat, the current one included, is in its tail.
      const v = t < k.len ? k.h[i] + g * k.pcEnd * Math.exp(-(t + rr - k.len) / k.tau)
        : g * k.pcEnd * Math.exp(-(t - k.len) / k.tau);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      sum += v;
    }
    return { min: lo, max: hi, mean: sum / n };
  }

  const cache = new Map();
  /** Windkessel fitted to a heart rate and set pressures (mmHg) with floor pInf.
   *  Returns { k: beat kernel, gain: mmHg per unit, pInf, tau, te, zc,
   *  meanFraction: (MAP − DBP)/(SBP − DBP) }. */
  function fit(hr, sbp, dbp, pInf) {
    hr = Math.max(20, Math.min(300, hr));
    const key = hr.toFixed(1) + '|' + sbp.toFixed(1) + '|' + dbp.toFixed(1) + '|' + pInf;
    let w = cache.get(key);
    if (w) return w;
    const rr = 60 / hr, te = ejectionTime(hr);
    const target = Math.min(0.97, Math.max(0.02, (dbp - pInf) / Math.max(1, sbp - pInf)));
    const ratio = (tau, zc) => { const kk = kernel(te, tau, zc, rr), ss = steady(kk, rr); return { k: kk, s: ss, r: ss.min / ss.max }; };
    // min/max rises with τ and falls with Zc; bisect whichever parameter is free.
    const bisect = (lo, hi, f, rising) => {
      let r;
      for (let it = 0; it < 40; it++) {
        const mid = (lo + hi) / 2; r = f(mid);
        if ((r.r < target) === rising) lo = mid; else hi = mid;
      }
      return r;
    };
    let r;
    if (ratio(TAU_PHYS, ZC).r >= target) r = bisect(Math.log(TAU_MIN), Math.log(TAU_PHYS), m => ratio(Math.exp(m), ZC), true);
    else if (ratio(TAU_PHYS, 0).r >= target) r = bisect(0, ZC, z => ratio(TAU_PHYS, z), false);
    else r = bisect(Math.log(TAU_PHYS), Math.log(TAU_MAX), m => ratio(Math.exp(m), 0), true);
    const k = r.k, s = r.s;
    const gain = Math.max(1, sbp - pInf) / s.max;
    w = { k, gain, pInf, tau: k.tau, te: k.te, zc: k.zc, meanFraction: (s.mean - s.min) / Math.max(1e-9, s.max - s.min) };
    if (cache.size > 256) cache.clear();
    cache.set(key, w);
    return w;
  }

  /** Pressure generator. Beats still in their kernel are summed; once a beat's kernel
   *  has ended, its exponential tail is folded into one accumulator that
   *  decays with the current τ, so the cost does not grow with τ.
   *  Each beat keeps the gain (mmHg per kernel unit) of the fit it was ejected with, and
   *  the tail is held in mmHg above pInf. A new fit (HR or pressure set point changed)
   *  therefore acts from the next beat on and through the decay of the tail; it does not
   *  rescale beats already ejected, which made the pressure jump by up to 75 mmHg within
   *  a few milliseconds when the heart rate was changed. */
  class Arterial {
    constructor() { this.beats = []; this.tail = 0; this.tTail = 0; }
    /** Start at pressure p (mmHg) at time t, as if the circulation were already running. */
    prime(w, p, t) { this.beats = []; this.tail = Math.max(0, p - w.pInf); this.tTail = t; }
    /** A beat ejecting from t0 with relative stroke volume amp, shaped and scaled by the current fit w. */
    beat(t0, amp, w) { this.beats.push({ t0, amp: (amp === undefined ? 1 : amp) * w.gain, k: w.k }); }
    /** Pressure (mmHg) at time t; t must not decrease between calls. */
    value(w, t) {
      this.tail *= Math.exp(-(t - this.tTail) / w.tau);
      this.tTail = t;
      let s = 0;
      for (let i = this.beats.length - 1; i >= 0; i--) {
        const b = this.beats[i], a = t - b.t0;
        if (a >= b.k.len) { this.tail += b.amp * b.k.pcEnd * Math.exp(-(a - b.k.len) / w.tau); this.beats.splice(i, 1); }
        else if (a >= 0) s += b.amp * b.k.h[Math.floor(a / DT)];
      }
      return w.pInf + s + this.tail;
    }
  }

  /** Delay (s) of the reflected wave in the finger volume pulse: height / SI with
   *  SI = 0.63 + 0.086·age + 0.042·MAP m/s (Millasseau et al. 2002). */
  function reflectionDelay(ageYears, map, heightCm) {
    return heightCm / 100 / (0.63 + 0.086 * ageYears + 0.042 * map);
  }

  /** Finger volume pulse from the normalised pressure s (0 at DBP, 1 at SBP), sampled at fs. */
  class FingerVolume {
    constructor(fs) { this.fs = fs; this.hist = new Float64Array(Math.ceil(fs)); this.reset(); }
    reset() { this.n = 0; this.y = null; }
    raw(s, dT, gain) {
      const N = this.hist.length, d = Math.min(N - 1, Math.max(0, Math.round(dT * this.fs)));
      this.hist[this.n % N] = s;
      const del = this.n >= d ? this.hist[(this.n - d) % N] : s;
      this.n++;
      const drive = (s + gain * del) / (1 + gain);
      this.y = this.y === null ? drive : this.y + (1 - Math.exp(-1 / (this.fs * TAU_VESSEL))) * (drive - this.y);
      return this.y;
    }
    /** Volume pulse scaled to unit peak-to-trough at the steady state of fit w. */
    process(s, w, hr, dT, gain) { return this.raw(s, dT, gain) * volumeScale(w, hr, dT, gain, this.fs); }
  }

  const vcache = new Map();
  /** 1 / peak-to-trough of the volume pulse for a regular rhythm at fit w (cached). */
  function volumeScale(w, hr, dT, gain, fs) {
    const rr = 60 / Math.max(20, Math.min(300, hr));
    const key = w.k.tau + '|' + w.gain + '|' + rr.toFixed(4) + '|' + dT.toFixed(3) + '|' + gain + '|' + fs;
    let v = vcache.get(key);
    if (v !== undefined) return v;
    const a = new Arterial(), fv = new FingerVolume(fs), pk = w.pInf + w.gain * steady(w.k, rr).max;
    const p0 = w.pInf + w.gain * steady(w.k, rr).min, span = Math.max(1e-9, pk - p0);
    a.prime(w, p0, 0);
    let nb = 0, lo = Infinity, hi = -Infinity;
    const T = Math.max(8 * rr, 4);
    for (let i = 0; i * (1 / fs) < T; i++) {
      const t = i / fs;
      if (t >= nb * rr) { a.beat(nb * rr, 1, w); nb++; }
      const y = fv.raw((a.value(w, t) - p0) / span, dT, gain);
      if (t > T - 2 * rr) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
    v = 1 / Math.max(1e-6, hi - lo);
    if (vcache.size > 256) vcache.clear();
    vcache.set(key, v);
    return v;
  }

  return { DT, ZC, TAU_FILL, TAU_VESSEL, INCISURA, ejectionTime, filling, kernel, respond, steady, fit, Arterial,
    reflectionDelay, FingerVolume, volumeScale };
});
