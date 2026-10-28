/* Simulation engine: advances the simulated patient and the simulated monitor
 * on a fixed 1 ms base tick (simulation time, independent of screen refresh).
 *   ECG model 1 kHz → acquired at ecg_fs   PPG 125 Hz   impedance 50 Hz
 *   NIBP cuff 100 Hz                       numerics + temperature 1 Hz
 * Waveforms go into ring buffers (absolute sample indices) that the UI reads;
 * once per simulated second a numeric frame is emitted. The engine never
 * touches the DOM, so it runs unchanged under Node for the unit tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dsp.js'), require('./rng.js'), require('./ecg.js'), require('./pulse.js'),
      require('./sensors.js'), require('./nibp.js'), require('./detectors.js'), require('./params.js'),
      require('../core/observation.js'));
  } else {
    const P = root.PM;
    P.engine = factory(P.dsp, P.rng, P.ecg, P.pulse, P.sensors, P.nibp, P.detectors, P.params, P.observation);
  }
})(this, function (dsp, rngMod, ecgMod, pulse, sensors, nibpMod, det, params, observation) {
  'use strict';

  const DT = 1e-3;
  const PPG_FS = 125, RESP_FS = 50, CUFF_FS = 100;
  const PAT = 0.20;       // s, R peak → peripheral pulse foot (pulse arrival time, illustrative)
  const BUFFER_S = 60;    // seconds of waveform kept for display

  const ECG_KEYS = ['hr', 'rhythm', 'hrv_ms', 'ecg_amp_mv', 'p_scale', 't_scale', 'qrs_width'];
  const ECG_CHAIN_KEYS = ['ecg_fs', 'ecg_filter', 'notch', 'mains_hz'];

  class Engine {
    constructor(p) { this.onFrame = null; this.onNibp = null; this.reset(p); }

    reset(p) {
      this.p = Object.assign({}, params.DEFAULTS, p || {});
      const seed = this.p.seed;
      this.rng = new rngMod.Rng(seed);
      const mrng = new rngMod.Rng(seed + 1);
      this.motion = new rngMod.MotionSource(mrng);
      this.k = 0; this.t = 0; this.carry = 0;
      this.startEpoch = Date.now();
      this.pulseBeats = [];
      this.trueR = [];
      this.ecg = new ecgMod.EcgGenerator(this.p, new rngMod.Rng(seed + 2), DT);
      this.ecg.onR = (tR, rr) => {
        this.trueR.push(tR); if (this.trueR.length > 64) this.trueR.shift();
        this.pulseBeats.push({ t0: tR + PAT, T: rr }); if (this.pulseBeats.length > 6) this.pulseBeats.shift();
      };
      this.ppg = new sensors.PpgSensor(new rngMod.Rng(seed + 3), new rngMod.MotionSource(new rngMod.Rng(seed + 4)));
      this.resp = new sensors.RespSensor(new rngMod.Rng(seed + 5), this.motion);
      this.temp = new sensors.TempSensor(new rngMod.Rng(seed + 6), this.p.temp);
      this.nibp = new nibpMod.Nibp(new rngMod.Rng(seed + 7), this.motion);
      this.nibp.onDone = res => { this.nibpEvent = res; if (this.onNibp) this.onNibp(res, this.t); };
      this.ecgDrop = new sensors.Dropouts(new rngMod.Rng(seed + 8));
      this.ecgNoise = new rngMod.Rng(seed + 9);
      this.plethS = new dsp.Ring(PPG_FS * BUFFER_S);
      this.respS = new dsp.Ring(RESP_FS * BUFFER_S);
      this.cuffS = new dsp.Ring(CUFF_FS * BUFFER_S);
      this.spo2Est = new det.SpO2Estimator(PPG_FS);
      this.breath = new det.BreathDetector(RESP_FS);
      this.lastNaN = { ecg: -Infinity, ppg: -Infinity, resp: -Infinity };
      this.lastFrame = null; this.nibpEvent = null;
      this.tempReading = { value: null, status: 'starting' };
      this.scheduleNibp();
      this.buildEcgChain();
    }

    buildEcgChain() {
      const p = this.p, fs = p.ecg_fs;
      if (!this.ecgS || this.ecgS.fs !== fs) {
        this.ecgS = new dsp.Ring(fs * BUFFER_S); this.ecgS.fs = fs;
        this.qrs = new det.PanTompkins(fs);
        this.qrsTimes = [];
      }
      const st = [];
      if (p.ecg_filter === 'monitor') st.push(dsp.bandpass(0.5, 40, fs));
      else if (p.ecg_filter === 'diagnostic') st.push(dsp.bandpass(0.05, 150, fs));
      if (p.notch === 'on' && p.mains_hz < fs / 2) st.push(dsp.notch(p.mains_hz, fs, 30));
      this.ecgFilter = new dsp.Chain(st);
      this.ecgDec = Math.round(1000 / fs);
    }

    scheduleNibp() { this.nextAutoNibp = this.p.nibp_interval > 0 ? this.t + this.p.nibp_interval * 60 : Infinity; }

    /** Validated parameter update; returns { params, errors, warnings, changed }. */
    setParams(update) {
      const res = params.validate(this.p, update);
      const old = this.p;
      this.p = res.params;
      const changed = Object.keys(this.p).filter(k => this.p[k] !== old[k]);
      res.changed = changed;
      if (changed.some(k => ECG_KEYS.includes(k))) this.ecg.setParams(this.p);
      if (changed.some(k => ECG_CHAIN_KEYS.includes(k))) this.buildEcgChain();
      if (changed.includes('nibp_interval')) this.scheduleNibp();
      return res;
    }

    startNibp() { return this.nibp.start(this.t); }
    cancelNibp() { this.nibp.cancel(this.t); }

    /** Advance by dtSim seconds of simulation time. */
    advance(dtSim) {
      this.carry += dtSim / DT;
      let n = Math.floor(this.carry + 1e-9);
      this.carry -= n;
      while (n-- > 0) this.step();
    }

    step() {
      const p = this.p;
      this.k++;
      const t = this.t = this.k * DT;
      const clean = this.ecg.step();
      this.resp.advance(DT, p.rr);
      if (this.k % this.ecgDec === 0) this.acquireEcg(t, clean);
      if (this.k % 8 === 0) this.acquirePpg(t);
      if (this.k % 20 === 0) this.acquireResp(t);
      if (this.k % 10 === 0) this.acquireCuff(t);
      if (this.k % 1000 === 0) this.emitFrame(t);
    }

    acquireEcg(t, clean) {
      const p = this.p, fs = p.ecg_fs, q = p.contact / 100;
      let x = NaN;
      const drop = this.ecgDrop.active(t, p.ecg_dropout, 1 / fs);
      if (p.contact >= 10 && !drop) {
        const wander = p.ecg_wander_mv * (Math.sin(2 * Math.PI * this.resp.phase) + 0.3 * Math.sin(2 * Math.PI * 0.05 * t));
        const noise = this.ecgNoise.gauss() * p.ecg_noise_uv / 1000 * (1 + 4 * (1 - q) * (1 - q));
        const mains = p.mains_uv / 1000 * (1 + 4 * (1 - q)) * Math.sin(2 * Math.PI * p.mains_hz * t);
        x = clean + wander + noise + mains;
      } else this.lastNaN.ecg = t;
      const r = this.qrs.process(x, t); // detector sees the acquired (unfiltered-for-display) signal
      if (r !== null) { this.qrsTimes.push(r); if (this.qrsTimes.length > 64) this.qrsTimes.shift(); }
      this.ecgS.push(this.ecgFilter.process(x));
    }

    acquirePpg(t) {
      const s = this.ppg.sample(t, 1 / PPG_FS, this.p, this.pulseBeats);
      if (!Number.isFinite(s.ir)) this.lastNaN.ppg = t;
      this.plethS.push(this.spo2Est.process(s.red, s.ir, t, this.p.spo2_avg));
    }

    acquireResp(t) {
      const z = this.resp.sample(t, 1 / RESP_FS, this.p, this.pulseBeats);
      if (!Number.isFinite(z)) this.lastNaN.resp = t;
      this.breath.process(z, t, this.p.resp_thr);
      this.respS.push(z);
    }

    arterialPressure(t) {
      const p = this.p;
      return p.dbp + (p.sbp - p.dbp) * Math.min(1, pulse.train(this.pulseBeats, t));
    }

    acquireCuff(t) {
      if (t >= this.nextAutoNibp) { this.nibp.start(t); this.nextAutoNibp += this.p.nibp_interval * 60; }
      const prev = t - 1 / CUFF_FS;
      const beatStart = this.pulseBeats.some(b => b.t0 > prev && b.t0 <= t); // simulator beat timing (simplification)
      this.cuffS.push(this.nibp.step(t, 1 / CUFF_FS, this.p, this.arterialPressure(t), beatStart));
    }

    emitFrame(t) {
      const p = this.p;
      this.tempReading = this.temp.sample(1, p);
      const spo = this.spo2Est.out;
      const leadsOff = p.contact < 10;
      const apnea = this.breath.apnea(t, p.apnea_delay);
      const frame = {
        t, timestamp: this.startEpoch + t * 1000,
        truth: { hr: p.hr, spo2: p.spo2, sbp: p.sbp, dbp: p.dbp, map: (p.sbp + 2 * p.dbp) / 3, rr: p.rr, temp: p.temp },
        est: {
          hr: leadsOff ? null : this.qrs.heartRate(t),
          pr: spo.pr, spo2: spo.spo2, sqi: spo.sqi, pi: spo.pi, spo2Status: spo.status,
          rr: this.breath.rate(t, p.apnea_delay), apnea,
          temp: this.tempReading.value, tempStatus: this.tempReading.status, tempRaw: this.tempReading.raw,
        },
        nibp: { state: this.nibp.state, cuff: this.nibp.cuff, msg: this.nibp.msg, last: this.nibp.last, result: this.nibpEvent },
        technical: {
          ecgLeadsOff: leadsOff,
          ecgNoSignal: !leadsOff && t - this.lastNaN.ecg < 1,
          spo2NoSignal: spo.status === 'no-signal',
          spo2ProbeOff: spo.status === 'probe-off',
          spo2LowSQI: spo.status === 'ok' && spo.sqi !== null && spo.sqi < 40,
          respNoSignal: t - this.lastNaN.resp < 1,
          tempUnavailable: this.tempReading.status === 'unavailable',
          tempError: this.tempReading.status === 'error',
          nibpFailed: this.nibp.state === 'failed',
        },
      };
      this.nibpEvent = null;
      this.lastFrame = frame;
      if (this.onFrame) this.onFrame(frame);
      return frame;
    }
  }

  /** Convert a frame into Observations (source "simulated" or "derived", with provenance). */
  function frameObservations(f) {
    const O = observation, out = [];
    const base = { timestamp: f.timestamp, simTime: f.t };
    const sim = (param, value, prov, quality) => out.push(O.make(Object.assign({ param, value, source: O.SOURCE.SIMULATED, quality,
      provenance: Object.assign({ engine: 'pm-sim' }, prov) }, base)));
    const lowSqi = f.est.sqi !== null && f.est.sqi < 50 ? O.QUALITY.LOW : undefined;
    sim('hr', f.est.hr, { method: 'pan-tompkins (simplified) on synthetic ECG', setpoint: f.truth.hr });
    sim('pr', f.est.pr, { method: 'PPG peak intervals', setpoint: f.truth.hr }, lowSqi);
    sim('spo2', f.est.spo2, { method: 'ratio of ratios, 110 − 25R', setpoint: f.truth.spo2 }, lowSqi);
    sim('spo2_sqi', f.est.sqi, { method: 'R consistency over 4 × 1 s' });
    sim('pi', f.est.pi, { method: 'IR AC/DC × 100' }, lowSqi);
    sim('rr', f.est.rr, { method: 'impedance breath detector', setpoint: f.truth.rr, apnea: f.est.apnea });
    if (f.est.tempStatus === 'error') sim('temp', f.est.tempRaw, { method: 'probe', status: 'error' }, O.QUALITY.INVALID);
    else sim('temp', f.est.temp, { method: 'probe, first-order lag', setpoint: f.truth.temp, status: f.est.tempStatus });
    const r = f.nibp.result;
    if (r && !r.error) {
      const prov = { engine: 'pm-sim', method: 'oscillometric fixed-ratio', setpointSbp: f.truth.sbp, setpointDbp: f.truth.dbp };
      sim('sbp', r.sbp, prov); sim('dbp', r.dbp, prov);
      out.push(O.make(Object.assign({ param: 'map', value: r.mapOsc, source: O.SOURCE.SIMULATED, provenance: Object.assign({}, prov, { method: 'oscillometric maximum' }) }, base)));
      out.push(O.make(Object.assign({ param: 'pp', value: r.pp, source: O.SOURCE.DERIVED, provenance: { formula: 'SBP − DBP' } }, base)));
    }
    return out;
  }

  /** MAP ≈ (SBP + 2·DBP)/3 — the textbook single-beat approximation (derived, not measured). */
  const mapFormula = (sbp, dbp) => (sbp + 2 * dbp) / 3;

  return { Engine, frameObservations, mapFormula, DT, PPG_FS, RESP_FS, CUFF_FS, PAT };
});
