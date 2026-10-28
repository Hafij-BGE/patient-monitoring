/* Sensor forward models: pulse-oximeter optics (PPG), impedance pneumography
 * and a temperature probe, plus random signal dropouts. Each model turns the
 * simulated physiology into what a sensor would deliver, including artifacts. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pulse.js'));
  else (root.PM = root.PM || {}).sensors = factory(root.PM.pulse);
})(this, function (pulse) {
  'use strict';

  /** Poisson-timed signal losses: rate (events/min), each lasting 0.3–1.5 s. */
  class Dropouts {
    constructor(rng) { this.rng = rng; this.until = -1; }
    active(t, ratePerMin, dt) {
      if (t < this.until) return true;
      if (ratePerMin > 0 && this.rng.uniform() < ratePerMin / 60 * dt) { this.until = t + this.rng.range(0.3, 1.5); return true; }
      return false;
    }
  }

  /**
   * Two-wavelength transmission PPG (normalised so the tissue DC level = 1).
   *   I_ir  = exp(−k·s(t) − m(t)),   I_red = exp(−R·k·s(t) − m(t))
   * s(t) = pulse train (0..1), k = PI/100 (pulsatile absorbance of the IR channel),
   * R = (110 − SpO2)/25 — the inverse of the linear calibration used by the estimator,
   * m(t) = common-mode motion absorbance. Ratio-of-ratios background: Webster 1997,
   * Allen 2007. Probe-off: light reaches the detector directly (DC ≈ 3, no pulse).
   */
  class PpgSensor {
    constructor(rng, motion) { this.rng = rng; this.motion = motion; this.drop = new Dropouts(rng); }
    static ratioFor(spo2) { return (110 - spo2) / 25; }
    sample(t, dt, p, beats) {
      if (p.spo2_sensor === 'disconnected' || this.drop.active(t, p.ppg_dropout, dt)) return { red: NaN, ir: NaN };
      const n = () => this.rng.gauss() * p.ppg_noise / 1000;
      if (p.spo2_sensor === 'probe-off') return { red: 3 + n(), ir: 3 + n() };
      const k = p.pi / 100, R = PpgSensor.ratioFor(p.spo2);
      const s = pulse.train(beats, t);
      const m = p.motion / 100 * 0.05 * this.motion.at(t); // up to ±5 % absorbance at 100 %
      return { red: Math.exp(-R * k * s - m) + n(), ir: Math.exp(-k * s - m) + n() };
    }
  }

  /**
   * Transthoracic impedance pneumogram. A phase oscillator advances at RR/60
   * cycles/s; each breath is a raised-cosine inspiration (1/3 of the cycle)
   * followed by a slower expiration (I:E = 1:2). Cardiogenic artifact uses the
   * arterial pulse shape. With RR = 0 the current breath finishes, then the
   * signal holds (apnea). Illustrative, not a ventilation model.
   */
  class RespSensor {
    constructor(rng, motion) { this.rng = rng; this.motion = motion; this.drop = new Dropouts(rng); this.phase = 0; this.rate = 14; this.holding = false; }
    static shape(ph) {
      return ph < 1 / 3 ? (1 - Math.cos(3 * Math.PI * ph)) / 2 : (1 + Math.cos(1.5 * Math.PI * (ph - 1 / 3))) / 2;
    }
    /** Advance the breathing oscillator (called at the base tick). Returns true at a breath start. */
    advance(dt, rr) {
      if (rr > 0) { this.rate = rr; this.holding = false; }
      if (this.holding) return false;
      this.phase += dt * this.rate / 60;
      if (this.phase >= 1) { this.phase -= 1; if (rr <= 0) { this.phase = 0; this.holding = true; } return true; }
      return false;
    }
    volume() { return this.holding ? 0 : RespSensor.shape(this.phase); }
    sample(t, dt, p, beats) {
      if (this.drop.active(t, p.resp_dropout, dt)) return NaN;
      const breath = p.resp_amp * this.volume();
      const cardio = p.cardiogenic / 100 * p.resp_amp * 0.5 * pulse.train(beats, t);
      const mot = p.motion / 100 * 0.5 * this.motion.at(t * 0.7);
      return breath + cardio + mot + this.rng.gauss() * p.resp_noise;
    }
  }

  /** Mainstream-style capnogram (mmHg) driven by the breathing oscillator phase.
   *  Inspiration (phase < 1/3): CO2 washes out to the inspired level within ~50 ms.
   *  Expiration: dead space first (6 %), then an exponential upstroke with time constant
   *  τ = 0.035 + 0.35 × obstruction (fraction of the expiration) and a small phase-III slope.
   *  The plateau falls with circulation: fi + (EtCO2 − fi) × (0.15 + 0.85 × perfusion).
   *  Breath hold / apnea: flat at the inspired level. Shape is illustrative. */
  class CapnoSensor {
    constructor(rng) { this.rng = rng; this.endExp = 0; }
    sample(resp, p, perf) {
      if (p.capno_sensor === 'disconnected') return NaN;
      const fi = p.fico2;
      const plateau = fi + Math.max(0, p.etco2 - fi) * (0.15 + 0.85 * perf);
      let c;
      if (resp.holding) c = fi;
      else if (resp.phase < 1 / 3) c = fi + (this.endExp - fi) * Math.exp(-resp.phase / 0.012);
      else {
        const u = (resp.phase - 1 / 3) / (2 / 3), u0 = 0.06;
        if (u < u0) c = fi;
        else {
          const v = (u - u0) / (1 - u0), tau = 0.035 + 0.35 * p.airway_obstr / 100;
          c = fi + (plateau - fi) * (1 - Math.exp(-v / tau)) / (1 - Math.exp(-1 / tau)) * (0.94 + 0.06 * v);
        }
        this.endExp = c;
      }
      return Math.max(0, c + this.rng.gauss() * 0.25);
    }
  }

  /** Temperature probe: first-order lag dT/dt = (T_true − T)/τ plus 0.02 °C noise. */
  class TempSensor {
    constructor(rng, initial) { this.rng = rng; this.T = initial; }
    sample(dt, p) {
      this.T += (p.temp - this.T) * Math.min(1, dt / p.temp_tau);
      if (p.temp_sensor === 'unavailable') return { value: null, status: 'unavailable' };
      if (p.temp_sensor === 'error') return { value: null, raw: -40, status: 'error' }; // implausible raw value, rejected
      return { value: this.T + this.rng.gauss() * 0.02, status: 'ok' };
    }
  }

  return { Dropouts, PpgSensor, RespSensor, CapnoSensor, TempSensor };
});
