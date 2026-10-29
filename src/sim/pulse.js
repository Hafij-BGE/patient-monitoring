/* Arterial pressure pulse from a three-element Windkessel (Westerhof N, Lankhaar JW,
 * Westerhof BE. The arterial Windkessel. Med Biol Eng Comput 2009;47:131–141):
 *   P = P∞ + Zc·Q + Pc,   C·dPc/dt = Q − Pc/R,   τ = R·C.
 * Q(t) is the ejection flow of one beat: a skewed half-sine lasting the ejection time
 * Te, with unit area (one stroke volume). Pressure is the superposition of the
 * responses of all past beats, so a long R–R gives a lower diastolic pressure, a
 * short one a higher, and the pressure falls towards P∞ with time constant τ when
 * the beats stop.
 * Te follows Weissler's regression for men, LVET = 413 − 1.7·HR ms (Weissler AM,
 * Harris WS, Schoenfeld CD. Circulation 1968;37:149–159), limited to 0.16 s … 0.6·RR.
 * For a set HR, SBP, DBP and P∞, τ is solved so that the regular-rhythm steady state
 * has exactly the set systolic and diastolic pressures, with Zc = 0.06·R. Zc is the
 * aortic characteristic impedance and does not rise with R, so a narrow pulse pressure
 * (high R, e.g. tamponade, cardiogenic shock) cannot be met with Zc = 0.06·R and a
 * physiological τ; then τ stays at TAU_PHYS (4 s) and Zc/R is lowered instead, and only
 * with Zc = 0 is τ allowed to grow further. The flow shape and Zc are illustrative; no
 * reflected wave or dicrotic notch is modelled. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).pulse = factory();
})(this, function () {
  'use strict';

  const DT = 1e-3;          // s, kernel resolution (the engine's base tick)
  const ZC = 0.06;          // default characteristic impedance as a fraction of R
  const TAU_MIN = 0.05, TAU_PHYS = 4, TAU_MAX = 60;
  const TAU_FILL = 0.25;    // s, diastolic filling time constant (illustrative)

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

  /** One beat's pressure response (per unit R × stroke volume) during ejection, sampled
   *  every DT, and the Windkessel pressure Pc at the end of ejection. */
  function kernel(te, tau, zc) {
    if (zc === undefined) zc = ZC;
    const n = Math.max(2, Math.round(te / DT)), q = new Float64Array(n);
    let area = 0;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; q[i] = Math.sin(Math.PI * u) * (1 - 0.7 * u); area += q[i] * DT; }
    const h = new Float64Array(n), e = Math.exp(-DT / tau);
    let pc = 0;
    for (let i = 0; i < n; i++) {
      q[i] /= area;                         // unit stroke volume
      pc = pc * e + (1 - e) * q[i];         // exact for flow held constant over DT (R = 1)
      h[i] = pc + zc * q[i];
    }
    return { te: n * DT, tau, zc, h, pcEnd: pc };
  }

  /** Response at age a (s) after the onset of a beat. */
  function respond(k, a) {
    if (a < 0) return 0;
    if (a < k.te) return k.h[Math.min(k.h.length - 1, Math.floor(a / DT))];
    return k.pcEnd * Math.exp(-(a - k.te) / k.tau);
  }

  /** Steady state of a regular rhythm with period rr: min, max and mean of Σ_k h(t + k·rr). */
  function steady(k, rr) {
    const n = Math.round(rr / DT), g = 1 / (1 - Math.exp(-rr / k.tau));
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (let i = 0; i < n; i++) {
      const t = i * DT;
      // During ejection: the current beat plus the tails of all earlier beats (geometric
      // series); after ejection every beat, the current one included, is in its tail.
      const v = t < k.te ? k.h[i] + g * k.pcEnd * Math.exp(-(t + rr - k.te) / k.tau)
        : g * k.pcEnd * Math.exp(-(t - k.te) / k.tau);
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
    const ratio = (tau, zc) => { const kk = kernel(te, tau, zc), ss = steady(kk, rr); return { k: kk, s: ss, r: ss.min / ss.max }; };
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

  /** Pressure generator. Beats still ejecting are summed from their kernels; once a beat
   *  has finished ejecting, its exponential tail is folded into one accumulator that
   *  decays with the current τ, so the cost does not grow with τ. */
  class Arterial {
    constructor() { this.beats = []; this.tail = 0; this.tTail = 0; }
    /** Start at pressure p (mmHg) at time t, as if the circulation were already running. */
    prime(w, p, t) { this.beats = []; this.tail = Math.max(0, (p - w.pInf) / w.gain); this.tTail = t; }
    /** A beat ejecting from t0 with relative stroke volume amp, shaped by the current fit w. */
    beat(t0, amp, w) { this.beats.push({ t0, amp: amp === undefined ? 1 : amp, k: w.k }); }
    /** Pressure (mmHg) at time t; t must not decrease between calls. */
    value(w, t) {
      this.tail *= Math.exp(-(t - this.tTail) / w.tau);
      this.tTail = t;
      let s = 0;
      for (let i = this.beats.length - 1; i >= 0; i--) {
        const b = this.beats[i], a = t - b.t0;
        if (a >= b.k.te) { this.tail += b.amp * b.k.pcEnd * Math.exp(-(a - b.k.te) / w.tau); this.beats.splice(i, 1); }
        else if (a >= 0) s += b.amp * b.k.h[Math.floor(a / DT)];
      }
      return w.pInf + w.gain * (s + this.tail);
    }
  }

  return { DT, ZC, TAU_FILL, ejectionTime, filling, kernel, respond, steady, fit, Arterial };
});
