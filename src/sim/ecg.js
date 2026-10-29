/* Synthetic ECG after the dynamical model of McSharry et al., IEEE TBME 2003;50(3):289–94.
 * The trajectory moves round a unit limit cycle at angular velocity ω = 2π/RR
 * (on the limit cycle the x,y equations reduce to dθ/dt = ω); z (the ECG) is driven
 * by five Gaussian events P,Q,R,S,T:
 *   dz/dt = −Σ a_i Δθ_i exp(−Δθ_i² / 2b_i²) − (z − z0),  Δθ_i = (θ − θ_i) mod 2π.
 * Without the −(z − z0) term this integrates exactly to the Gaussian sum
 *   z = Σ A_i exp(−Δθ_i² / 2b_i²),  A_i = a_i b_i² / ω,
 * which is what is evaluated here. The relaxation term only pulled z towards 0 with
 * τ = 1 s, which shifted the T–P baseline by −0.05 to −0.3 mV depending on heart rate;
 * a real T–P segment is isoelectric. The waveform is synthetic, single-lead and not diagnostic.
 * Timing: every event is defined in seconds relative to the R peak and converted to
 * phase with the ω of the interval it sits in (θ_i = ω·t_i, b_i = ω·σ_i, a_i = A_i·ω/b_i²),
 * so P, QRS and T keep their durations and heights when the beat interval changes
 * (ecgsyn's θ and b scaling made QRS width and height grow with each cycle's length,
 * which mattered for AF). P, PR and QRS are fixed; QT follows the preceding R–R
 * interval (Framingham linear correction). ω changes at the R peak (θ = 0), so the
 * drawn interval is the R–R interval itself.
 * Arrhythmia teaching patterns (arrhythmia.js) change the beat kind per cycle:
 *   af   no P wave, f-waves added, irregular intervals
 *   svt  normal narrow beat without a P wave (hidden in the QRS); timing as set
 *   pvc  occasional early wide beat (R at 0.6 × mean interval) + compensatory pause
 *   vt   every beat wide at the set rate      vf  fibrillatory signal, no beats
 *   asystole  flat line, no beats
 * Each event's share z_i = A_i exp(…) is placed along its own spatial direction to give a dipole (vector) ECG for the derived
 * 12-lead view (ecg12.js). Lead II of that view equals the monitor ECG. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./arrhythmia.js'), require('./ecg12.js'));
  else (root.PM = root.PM || {}).ecg = factory(root.PM.rng, root.PM.arrhythmia, root.PM.ecg12);
})(this, function (rngMod, arr, e12) {
  'use strict';

  const TWO_PI = 2 * Math.PI;
  // Table I of McSharry 2003 (P, Q, R, S, T), kept for reference.
  const BASE = {
    theta: [-Math.PI / 3, -Math.PI / 12, 0, Math.PI / 12, Math.PI / 2],
    a: [1.2, -5, 30, -7.5, 0.75],
    b: [0.25, 0.1, 0.1, 0.1, 0.4],
  };
  // Normal beat: [time from R (s), SD (s), peak height A (model units)]. Heights are those of
  // Table I at 60 bpm (A = a·b²/ω), so P:Q:R:S:T stay as in McSharry. Times and widths give
  // adult reference ranges (Ramirez 2011, 95 % range PR 125–196 ms, QRS 69–103 ms; Palhares 2017):
  // measured at the 25 µV level the simulated P is 86 ms, PR 167 ms and QRS 84 ms at every rate
  // (tests/tools/ecg-intervals.js).
  const NORMAL = [[-0.165, 0.020, 0.0119], [-0.024, 0.009, -0.0080], [0, 0.009, 0.0477], [0.024, 0.009, -0.0119], [0, 0, 0.0191]];
  const QTC = 0.40;
  /** QT (s) after an R–R interval rr (s): Framingham linear formula, QT = QTc − 0.154·(1 − RR) (Sagie 1992);
   *  Framingham and Fridericia correct for rate best (Vandenberk 2016). */
  const qtFor = rr => QTC - 0.154 * (1 - Math.min(2, Math.max(0.25, rr)));

  const wrap = d => { d = (d + Math.PI) % TWO_PI; if (d < 0) d += TWO_PI; return d - Math.PI; };

  /** Normal-beat morphology in phase units for a beat interval L (s, default 60/HR),
   *  after a preceding R–R interval rrPrev (s, default L), with the shape controls of p.
   *  qrs_width stretches Q, R and S in time (height kept) and lengthens QT by the same amount. */
  function waveParams(p, L, rrPrev) {
    L = L || 60 / p.hr;
    const om = TWO_PI / L, qw = p.qrs_width || 1;
    const ev = NORMAL.map(e => e.slice());
    for (const i of [1, 2, 3]) { ev[i][0] *= qw; ev[i][1] *= qw; }
    // QRS onset where the 0.17 mV Q wave (plus the rising R) crosses 25 µV: about 2 SD before the Q peak
    const qrsOn = ev[1][0] - 2.05 * ev[1][1];
    ev[0][0] += qrsOn - (NORMAL[1][0] - 2.05 * NORMAL[1][1]); // P moves with the QRS onset, so PR stays the same
    const qt = qtFor(rrPrev || L) + (qw - 1) * 2 * (0.024 + 2.5 * 0.009);
    ev[4][1] = 0.05 * qt / QTC;
    // T end = where the T wave falls to 25 µV: peak + SD·√(2 ln(0.41 mV / 25 µV)) ≈ peak + 2.37 SD
    // for the default 0.41 mV T (R 1 mV), so the measured QT equals qtFor() at t_scale 1.
    ev[4][0] = qrsOn + qt - 2.37 * ev[4][1];
    ev[0][2] *= (p.p_scale === undefined ? 1 : p.p_scale);
    ev[4][2] *= (p.t_scale === undefined ? 1 : p.t_scale);
    const theta = [], a = [], b = [];
    for (const [tau, sd, A] of ev) { const bb = om * sd; theta.push(om * tau); b.push(bb); a.push(A * om / (bb * bb)); }
    return { theta, a, b, qt };
  }

  /** Height A_i (model units) of each event of a phase-unit morphology w built for omega. */
  const heights = (w, omega) => w.a.map((a, i) => a * w.b[i] * w.b[i] / omega);

  /** Gain (mV per model unit) so that the clean R peak equals ampMv above the isoelectric line.
   *  Heights do not depend on the interval, so w is evaluated at the rate it was built for. */
  function calibrate(w, hr, ampMv) {
    const omega = TWO_PI * hr / 60, A = heights(w, omega);
    let zmax = -Infinity;
    for (let k = 0; k < 4000; k++) {
      const th = -Math.PI + TWO_PI * k / 4000;
      let z = 0;
      for (let i = 0; i < 5; i++) { const d = wrap(th - w.theta[i]); z += A[i] * Math.exp(-d * d / (2 * w.b[i] * w.b[i])); }
      if (z > zmax) zmax = z;
    }
    return ampMv / Math.max(1e-9, zmax);
  }

  // R phase of a premature beat: the cycle starts half an interval after the previous R,
  // so an R at −0.8π comes 0.1 interval later → coupling ≈ 0.6 × interval; the next normal
  // R follows 0.4 + 1 interval later (compensatory pause, total 2 intervals).
  const PVC_THETA_R = -0.8 * Math.PI;

  /** Streaming generator at a fixed internal step (default 1 ms). */
  class EcgGenerator {
    constructor(params, rng, dt, fibRng, vcgRng) {
      this.dt = dt || 1e-3;
      this.rng = rng || new rngMod.Rng(1);
      this.fibRng = fibRng || new rngMod.Rng(97531);
      this.theta = -Math.PI;
      this.z = 0;
      this.zi = new Float64Array(5);       // share of z from each event P, Q, R, S, T
      this.vcg = new Float64Array(3);      // dipole (Frank X, Y, Z) in mV, see ecg12.js
      this.vcgRng = vcgRng || new rngMod.Rng(24680);
      this.t = 0;
      this.kind = 'normal';
      this.setParams(params, true);
      this.rr = this.drawRR(); this.rrPrev = this.rr;
      this.w = this.buildW();
      this.onR = null;     // callback(tR, rr, {kind, amp}) at each R peak (θ crosses the R phase)
      this.onBeat = null;  // callback(tStart, rr) at each new cycle (θ wraps)
    }

    setParams(p, immediate) {
      this.p = Object.assign({}, p);
      const mode = p.arrhythmia || 'none', mean = 60 / p.hr;
      const wp = mode === 'af' || mode === 'svt' ? Object.assign({}, p, { p_scale: 0 }) : p;
      // heights do not depend on the interval, so one gain at the mean rate holds for every beat
      const w = waveParams(wp, 1); // morphology at 60 bpm, for calibration and inspection
      this.pending = { mode, wp, w, gain: calibrate(w, 60, p.ecg_amp_mv),
        vgain: calibrate(arr.ventricularParams(1, 0), 60, 1.3 * p.ecg_amp_mv) };
      if (immediate || !this.cur) this.startCycle(false);
    }

    /** Phase-unit morphology of the current beat kind for the current interval. */
    buildW() {
      const L = this.rr;
      const w = this.kind === 'vt' ? arr.ventricularParams(L, 0) : this.kind === 'pvc' ? arr.ventricularParams(L, PVC_THETA_R)
        : waveParams(this.cur.wp, L, this.rrPrev);
      w.A = heights(w, TWO_PI / L);
      // QT of this beat and the R–R interval it followed (supraventricular beats only)
      this.lastQt = this.kind === 'normal' ? { qt: w.qt, rr: this.rrPrev || L } : null;
      return w;
    }

    /** Pick up pending settings and choose the kind of the cycle that starts now. */
    startCycle(allowPvc) {
      const P = this.cur = this.pending, mode = this.mode = P.mode;
      let kind = 'normal';
      if (mode === 'vt') kind = 'vt';
      else if (mode === 'vf' || mode === 'asystole') kind = 'none';
      else if (mode === 'pvc' && allowPvc && this.kind !== 'pvc' &&
        this.rng.uniform() < Math.min(0.5, (this.p.pvc_per_min || 0) / this.p.hr)) kind = 'pvc';
      this.kind = kind;
      if (this.rr) this.w = this.buildW();
      this.gain = kind === 'vt' || kind === 'pvc' ? P.vgain : P.gain;
      if (!this.fib && (mode === 'af' || mode === 'vf')) this.fib = {};
      if (mode === 'af' && !this.fib.af) this.fib.af = new arr.Fibrillation(this.fibRng, 6, 9, 4);
      if (mode === 'vf' && !this.fib.vf) this.fib.vf = new arr.Fibrillation(this.fibRng, 3, 7, 4);
      // second VF source for the chest leads only, from its own random stream
      if (mode === 'vf' && !this.fib.vf2) this.fib.vf2 = new arr.Fibrillation(this.vcgRng, 3, 7, 4);
    }

    drawRR() {
      const mean = 60 / this.p.hr;
      let rr;
      if (this.mode === 'af') rr = mean * (0.55 + 0.9 * this.rng.uniform());
      else if (this.p.rhythm === 'irregular') rr = mean * (0.65 + 0.7 * this.rng.uniform());
      else rr = mean;
      rr += this.rng.gauss() * (this.p.hrv_ms || 0) / 1000;
      return Math.min(3, Math.max(0.25, Math.min(mean * 1.6, Math.max(mean * 0.5, rr))));
    }

    /** Advance one internal step; returns the clean ECG value in mV. */
    step() {
      const omega = TWO_PI / this.rr;
      const th0 = this.theta, thR = this.w.theta[2], dt = this.dt, zi = this.zi;
      let th1 = th0 + omega * this.dt;
      if (th0 < 0 && th1 >= 0) {
        // R phase: draw the interval to the next R and rebuild the timing for it
        this.rrPrev = this.rr; this.rr = this.drawRR(); this.w = this.buildW();
      }
      if (th0 < thR && th1 >= thR && this.kind !== 'none' && this.onR) {
        // interval until the next R: for a premature beat the rest of this one plus the next
        const next = thR < 0 ? -thR / omega + this.rr : this.rr;
        this.onR(this.t + this.dt * (thR - th0) / (th1 - th0), next, { kind: this.kind, amp: arr.PULSE_AMP[this.kind] });
      }
      this.t += this.dt;
      if (th1 >= Math.PI) {
        th1 -= TWO_PI;
        // new cardiac cycle: pick up any morphology change and choose the beat kind
        this.startCycle(true);
        if (this.onBeat) this.onBeat(this.t, this.rr);
      }
      this.theta = th1;
      const w = this.w;
      let z = 0;
      for (let i = 0; i < 5; i++) { const d = wrap(th1 - w.theta[i]); z += zi[i] = w.A[i] * Math.exp(-d * d / (2 * w.b[i] * w.b[i])); }
      this.z = z;
      const amp = this.p.ecg_amp_mv, v = this.vcg;
      if (this.mode === 'asystole') { v.fill(0); return 0; }
      if (this.mode === 'vf') {
        const a = 0.5 * amp * this.fib.vf.step(dt), b = 0.5 * amp * this.fib.vf2.step(dt), R = e12.BASIS.ventricular[2], N = e12.N_II;
        for (let j = 0; j < 3; j++) v[j] = a * R[j] + b * N[j];
        return a;
      }
      const B = e12.BASIS[this.kind === 'vt' || this.kind === 'pvc' ? 'ventricular' : 'normal'];
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let i = 0; i < 5; i++) s += zi[i] * B[i][j];
        v[j] = this.gain * s;
      }
      if (this.mode === 'af') {
        const fa = 0.07 * amp * this.fib.af.step(dt);
        for (let j = 0; j < 3; j++) v[j] += fa * e12.F_AF[j];
        return this.gain * this.z + fa;
      }
      return this.gain * this.z;
    }
  }

  /** Frontal-plane QRS axis (degrees) of the clean model beat for settings p: net
   *  area of the Q, R and S events only (P and T left out, so overlap with a T wave at
   *  high rates does not shift it) in leads I and aVF of the derived 12-lead ECG.
   *  For PVCs it is the axis of the dominant (normal) beat; NaN without beats. */
  function qrsAxis(p) {
    const mode = p.arrhythmia || 'none';
    if (mode === 'vf' || mode === 'asystole') return NaN;
    const q = Object.assign({}, p, { arrhythmia: mode === 'vt' ? 'vt' : 'none', hrv_ms: 0, rhythm: 'regular' });
    const g = new EcgGenerator(q, new rngMod.Rng(1), 1e-3, new rngMod.Rng(2), new rngMod.Rng(3));
    const B = e12.BASIS[mode === 'vt' ? 'ventricular' : 'normal'], n = Math.round(60 / q.hr / g.dt);
    const v = [0, 0, 0], out = new Array(12);
    for (let k = 0; k < 3 * n; k++) {
      g.step();
      if (k < 2 * n) continue; // let the start-up transient settle, then sum one full cycle
      for (let j = 0; j < 3; j++) v[j] += g.zi[1] * B[1][j] + g.zi[2] * B[2][j] + g.zi[3] * B[3][j];
    }
    e12.leads(v, out);
    return e12.frontalAxis(out[0], out[5]);
  }

  return { EcgGenerator, waveParams, calibrate, qrsAxis, qtFor, BASE, NORMAL, wrap };
});
