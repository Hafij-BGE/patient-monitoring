/* Synthetic ECG: dynamical model of McSharry et al., IEEE TBME 2003;50(3):289–94.
 * The trajectory moves round a unit limit cycle in the (x,y) plane at angular
 * velocity ω = 2π/RR; z (the ECG) is pushed by five Gaussian events P,Q,R,S,T:
 *   dz/dt = −Σ a_i Δθ_i exp(−Δθ_i² / 2b_i²) − (z − z0),  Δθ_i = (θ − θ_i) mod 2π.
 * On the limit cycle (r = 1) the x,y equations reduce to dθ/dt = ω, which is
 * what is integrated here. Heart-rate scaling of θ_i and b_i follows ecgsyn.m
 * (PhysioNet ECGSYN). The waveform is synthetic, single-lead and not diagnostic.
 * Arrhythmia teaching patterns (arrhythmia.js) change the beat kind per cycle:
 *   af   no P wave, f-waves added, irregular intervals
 *   svt  normal narrow beat without a P wave (hidden in the QRS); timing as set
 *   pvc  occasional early wide beat (R at 0.6 × mean interval) + compensatory pause
 *   vt   every beat wide at the set rate      vf  fibrillatory signal, no beats
 *   asystole  flat line, no beats
 * The equation is linear in z, so z = Σ z_i with dz_i/dt = −a_i Δθ_i exp(…) − z_i.
 * Each event's share z_i is integrated alongside z (same RK4 points) and placed
 * along its own spatial direction to give a dipole (vector) ECG for the derived
 * 12-lead view (ecg12.js). Lead II of that view equals the monitor ECG. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./arrhythmia.js'), require('./ecg12.js'));
  else (root.PM = root.PM || {}).ecg = factory(root.PM.rng, root.PM.arrhythmia, root.PM.ecg12);
})(this, function (rngMod, arr, e12) {
  'use strict';

  const TWO_PI = 2 * Math.PI;
  // Table I of McSharry 2003 (P, Q, R, S, T).
  const BASE = {
    theta: [-Math.PI / 3, -Math.PI / 12, 0, Math.PI / 12, Math.PI / 2],
    a: [1.2, -5, 30, -7.5, 0.75],
    b: [0.25, 0.1, 0.1, 0.1, 0.4],
  };

  const wrap = d => { d = (d + Math.PI) % TWO_PI; if (d < 0) d += TWO_PI; return d - Math.PI; };

  /** Morphology for a mean heart rate and shape controls. */
  function waveParams(p) {
    const hrfact = Math.sqrt(p.hr / 60), hrfact2 = Math.sqrt(hrfact);
    const sc = [hrfact2, hrfact, 1, hrfact, hrfact2];
    const theta = BASE.theta.map((t, i) => t * sc[i]);
    const b = BASE.b.map(v => v * hrfact);
    const qw = p.qrs_width || 1;
    const a = BASE.a.slice();
    for (const i of [1, 2, 3]) { b[i] *= qw; a[i] /= qw * qw; } // keep QRS area/height roughly constant
    a[0] *= (p.p_scale === undefined ? 1 : p.p_scale);
    a[4] *= (p.t_scale === undefined ? 1 : p.t_scale);
    return { theta, a, b };
  }

  function dz(theta, z, w) {
    let s = 0;
    for (let i = 0; i < 5; i++) {
      const d = wrap(theta - w.theta[i]);
      s += w.a[i] * d * Math.exp(-d * d / (2 * w.b[i] * w.b[i]));
    }
    return -s - z; // z0 = 0; baseline wander is added later in mV
  }

  function rk4(theta, z, omega, dt, w) {
    const h = omega * dt;
    const k1 = dz(theta, z, w);
    const k2 = dz(theta + h / 2, z + dt * k1 / 2, w);
    const k3 = dz(theta + h / 2, z + dt * k2 / 2, w);
    const k4 = dz(theta + h, z + dt * k3, w);
    return z + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
  }

  /** Per-event forcing a_i Δθ_i exp(−Δθ_i²/2b_i²) at phase theta, written into f. */
  function forcing(theta, w, f) {
    for (let i = 0; i < 5; i++) {
      const d = wrap(theta - w.theta[i]);
      f[i] = w.a[i] * d * Math.exp(-d * d / (2 * w.b[i] * w.b[i]));
    }
  }

  /** Gain (mV per model unit) so that the clean R peak equals ampMv above baseline. */
  function calibrate(w, hr, ampMv) {
    const dt = 1e-3, omega = TWO_PI * hr / 60;
    let theta = -Math.PI, z = 0, zmax = -Infinity, zIso = 0;
    const steps = Math.round(60 / hr / dt);
    for (let beat = 0; beat < 3; beat++) {
      for (let i = 0; i < steps; i++) {
        z = rk4(theta, z, omega, dt, w);
        theta += omega * dt;
        if (theta >= Math.PI) theta -= TWO_PI;
        if (beat === 2 && z > zmax) zmax = z;
      }
      if (beat === 1) zIso = z; // end of beat ≈ isoelectric level
    }
    return ampMv / Math.max(1e-6, zmax - zIso);
  }

  // R phase of a premature beat: the cycle starts mean/2 after the previous R, so an
  // R at −0.8π comes 0.1 cycle later → coupling ≈ 0.6 × mean, then a compensatory pause.
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
      this.f = [new Float64Array(5), new Float64Array(5), new Float64Array(5)];
      this.vcg = new Float64Array(3);      // dipole (Frank X, Y, Z) in mV, see ecg12.js
      this.vcgRng = vcgRng || new rngMod.Rng(24680);
      this.t = 0;
      this.kind = 'normal';
      this.setParams(params, true);
      this.rr = this.drawRR();
      this.onR = null;     // callback(tR, rr, {kind, amp}) at each R peak (θ crosses the R phase)
      this.onBeat = null;  // callback(tStart, rr) at each new cycle (θ wraps)
    }

    setParams(p, immediate) {
      this.p = Object.assign({}, p);
      const mode = p.arrhythmia || 'none', mean = 60 / p.hr;
      const w = waveParams(mode === 'af' || mode === 'svt' ? Object.assign({}, p, { p_scale: 0 }) : p);
      const vw = arr.ventricularParams(mean, 0);
      this.pending = { mode, w, gain: calibrate(w, p.hr, p.ecg_amp_mv), vw, pw: arr.ventricularParams(mean, PVC_THETA_R),
        vgain: calibrate(vw, p.hr, 1.3 * p.ecg_amp_mv) };
      if (immediate || !this.w) this.startCycle(false);
    }

    /** Pick up pending settings and choose the kind of the cycle that starts now. */
    startCycle(allowPvc) {
      const P = this.pending, mode = this.mode = P.mode;
      let kind = 'normal';
      if (mode === 'vt') kind = 'vt';
      else if (mode === 'vf' || mode === 'asystole') kind = 'none';
      else if (mode === 'pvc' && allowPvc && this.kind !== 'pvc' &&
        this.rng.uniform() < Math.min(0.5, (this.p.pvc_per_min || 0) / this.p.hr)) kind = 'pvc';
      this.kind = kind;
      this.w = kind === 'vt' ? P.vw : kind === 'pvc' ? P.pw : P.w;
      const gain = kind === 'vt' || kind === 'pvc' ? P.vgain : P.gain;
      if (this.gain) { // keep the output continuous when the beat scale changes
        const k = this.gain / gain;
        this.z *= k;
        for (let i = 0; i < 5; i++) this.zi[i] *= k;
      }
      this.gain = gain;
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
      const th0 = this.theta, thR = this.w.theta[2], dt = this.dt, h = omega * dt;
      const [f0, f1, f2] = this.f, zi = this.zi;
      forcing(th0, this.w, f0); forcing(th0 + h / 2, this.w, f1); forcing(th0 + h, this.w, f2);
      // RK4 on the sum (bit-identical to rk4()) and on each event's share
      let s0 = 0, s1 = 0, s2 = 0;
      for (let i = 0; i < 5; i++) {
        s0 += f0[i]; s1 += f1[i]; s2 += f2[i];
        const z = zi[i], k1 = -f0[i] - z, k2 = -f1[i] - (z + dt * k1 / 2), k3 = -f1[i] - (z + dt * k2 / 2), k4 = -f2[i] - (z + dt * k3);
        zi[i] = z + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
      }
      const z = this.z, k1 = -s0 - z, k2 = -s1 - (z + dt * k1 / 2), k3 = -s1 - (z + dt * k2 / 2), k4 = -s2 - (z + dt * k3);
      this.z = z + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
      let th1 = th0 + omega * this.dt;
      if (th0 < thR && th1 >= thR && this.kind !== 'none' && this.onR)
        this.onR(this.t + this.dt * (thR - th0) / (th1 - th0), this.rr, { kind: this.kind, amp: arr.PULSE_AMP[this.kind] });
      this.t += this.dt;
      if (th1 >= Math.PI) {
        th1 -= TWO_PI;
        // new cardiac cycle: pick up any morphology change and draw the next interval
        this.startCycle(true);
        this.rr = this.drawRR();
        if (this.onBeat) this.onBeat(this.t, this.rr);
      }
      this.theta = th1;
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

  return { EcgGenerator, waveParams, calibrate, qrsAxis, BASE, wrap };
});
