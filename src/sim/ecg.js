/* Synthetic ECG: dynamical model of McSharry et al., IEEE TBME 2003;50(3):289–94.
 * The trajectory moves round a unit limit cycle in the (x,y) plane at angular
 * velocity ω = 2π/RR; z (the ECG) is pushed by five Gaussian events P,Q,R,S,T:
 *   dz/dt = −Σ a_i Δθ_i exp(−Δθ_i² / 2b_i²) − (z − z0),  Δθ_i = (θ − θ_i) mod 2π.
 * On the limit cycle (r = 1) the x,y equations reduce to dθ/dt = ω, which is
 * what is integrated here. Heart-rate scaling of θ_i and b_i follows ecgsyn.m
 * (PhysioNet ECGSYN). The waveform is synthetic, single-lead and not diagnostic. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else (root.PM = root.PM || {}).ecg = factory(root.PM.rng);
})(this, function (rngMod) {
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

  /** Streaming generator at a fixed internal step (default 1 ms). */
  class EcgGenerator {
    constructor(params, rng, dt) {
      this.dt = dt || 1e-3;
      this.rng = rng || new rngMod.Rng(1);
      this.theta = -Math.PI;
      this.z = 0;
      this.t = 0;
      this.setParams(params, true);
      this.rr = this.drawRR();
      this.onR = null;     // callback(tR, rr) at each R peak (θ crosses 0)
      this.onBeat = null;  // callback(tStart, rr) at each new cycle (θ wraps)
    }

    setParams(p, immediate) {
      this.p = Object.assign({}, p);
      this.pending = { w: waveParams(p) };
      this.pending.gain = calibrate(this.pending.w, p.hr, p.ecg_amp_mv);
      if (immediate || !this.w) { this.w = this.pending.w; this.gain = this.pending.gain; }
    }

    drawRR() {
      const mean = 60 / this.p.hr;
      let rr;
      if (this.p.rhythm === 'irregular') rr = mean * (0.65 + 0.7 * this.rng.uniform());
      else rr = mean;
      rr += this.rng.gauss() * (this.p.hrv_ms || 0) / 1000;
      return Math.min(3, Math.max(0.25, Math.min(mean * 1.6, Math.max(mean * 0.5, rr))));
    }

    /** Advance one internal step; returns the clean ECG value in mV. */
    step() {
      const omega = TWO_PI / this.rr;
      const th0 = this.theta;
      this.z = rk4(th0, this.z, omega, this.dt, this.w);
      let th1 = th0 + omega * this.dt;
      if (th0 < 0 && th1 >= 0 && this.onR) this.onR(this.t + this.dt * (-th0) / (th1 - th0), this.rr);
      this.t += this.dt;
      if (th1 >= Math.PI) {
        th1 -= TWO_PI;
        // new cardiac cycle: pick up any morphology change and draw the next interval
        this.w = this.pending.w; this.gain = this.pending.gain;
        this.rr = this.drawRR();
        if (this.onBeat) this.onBeat(this.t, this.rr);
      }
      this.theta = th1;
      return this.gain * this.z;
    }
  }

  return { EcgGenerator, waveParams, calibrate, BASE, wrap };
});
