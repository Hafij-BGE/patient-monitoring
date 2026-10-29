/* Simulation engine: advances the simulated patient and the simulated monitor
 * on a fixed 1 ms base tick (simulation time, independent of screen refresh).
 *   ECG model 1 kHz → acquired at ecg_fs   PPG 125 Hz   impedance 50 Hz
 *   NIBP cuff 100 Hz   capnogram 50 Hz     arterial line 125 Hz
 *   numerics, temperature and rhythm analysis 1 Hz
 * Waveforms go into ring buffers (absolute sample indices) that the UI reads;
 * once per simulated second a numeric frame is emitted. The engine never
 * touches the DOM, so it runs unchanged under Node for the unit tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dsp.js'), require('./rng.js'), require('./ecg.js'), require('./pulse.js'),
      require('./sensors.js'), require('./nibp.js'), require('./detectors.js'), require('./params.js'),
      require('../core/observation.js'), require('./arrhythmia.js'), require('./glucose.js'), require('./ecg12.js'));
  } else {
    const P = root.PM;
    P.engine = factory(P.dsp, P.rng, P.ecg, P.pulse, P.sensors, P.nibp, P.detectors, P.params, P.observation, P.arrhythmia, P.glucose, P.ecg12);
  }
})(this, function (dsp, rngMod, ecgMod, pulse, sensors, nibpMod, det, params, observation, arr, glucoseMod, ecg12) {
  'use strict';

  const DT = 1e-3;
  const PPG_FS = 125, RESP_FS = 50, CUFF_FS = 100, CAP_FS = 50, ART_FS = 125;
  const PAT = 0.20;       // s, R peak → peripheral pulse foot (pulse arrival time, illustrative)
  const BUFFER_S = 60;    // seconds of waveform kept for display
  const TAP_S = 12;       // seconds kept per signal-chain probe point
  const LEAD12_S = 12;    // seconds kept per lead of the derived 12-lead ECG

  const PMSF = 10;        // mmHg, pressure the arteries settle to without heartbeats (illustrative mean systemic filling pressure)
  const HYDRO_MMHG_PER_CM = 0.7356; // 1 cmH2O in mmHg (saline column between transducer and heart level)
  // Catheter–tubing–transducer as a 2nd-order system (natural frequency fn, damping ζ); illustrative values.
  const IBP_DAMPING = { optimal: { fn: 20, zeta: 0.6 }, 'under-damped': { fn: 6, zeta: 0.1 }, 'over-damped': { fn: 4, zeta: 1.5 } };

  const ECG_KEYS = ['hr', 'rhythm', 'hrv_ms', 'ecg_amp_mv', 'p_scale', 't_scale', 'qrs_width', 'arrhythmia', 'pvc_per_min'];
  const ECG_CHAIN_KEYS = ['ecg_fs', 'ecg_filter', 'notch', 'mains_hz'];
  // Changing these restarts the glucose model in steady state; basal_insulin acts as a step change.
  const GLU_RESET_KEYS = ['diabetes', 'fasting_glucose', 'fasting_insulin', 'weight_kg'];

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
      this.pulseBeats = [];   // pulse onsets (s), for the NIBP beat trigger
      this.art = new pulse.Arterial(); this.wk = null; this.artT = -1;
      this.art.prime(this.windkessel(), this.p.dbp, 0);
      this.trueR = []; this.trueKinds = [];
      this.lastBeatT = 0; this.perf = 1;
      if (this.taps) this.taps = {}; // probes stay enabled across a reset
      this.ecg = new ecgMod.EcgGenerator(this.p, new rngMod.Rng(seed + 2), DT, new rngMod.Rng(seed + 10), new rngMod.Rng(seed + 13));
      this.ecg.onR = (tR, rr, beat) => {
        this.trueR.push(tR); if (this.trueR.length > 64) this.trueR.shift();
        this.trueKinds.push(beat.kind); if (this.trueKinds.length > 64) this.trueKinds.shift();
        // stroke volume follows the filling time before this beat (PVC strength is set by arrhythmia.js)
        const prevRR = this.trueR.length > 1 ? tR - this.lastBeatT : 60 / this.p.hr;
        const sv = beat.kind === 'pvc' ? beat.amp : beat.amp * pulse.filling(prevRR, this.p.hr);
        this.lastBeatT = tR;
        this.pulseBeats.push({ t0: tR + PAT }); if (this.pulseBeats.length > 6) this.pulseBeats.shift();
        this.art.beat(tR + PAT, sv, this.windkessel());
      };
      this.ppg = new sensors.PpgSensor(new rngMod.Rng(seed + 3), new rngMod.MotionSource(new rngMod.Rng(seed + 4)));
      this.resp = new sensors.RespSensor(new rngMod.Rng(seed + 5), this.motion);
      this.temp = new sensors.TempSensor(new rngMod.Rng(seed + 6), this.p.temp);
      this.capno = new sensors.CapnoSensor(new rngMod.Rng(seed + 11));
      this.artNoise = new rngMod.Rng(seed + 12);
      this.ibpX = this.p.dbp; this.ibpV = 0;
      this.nibp = new nibpMod.Nibp(new rngMod.Rng(seed + 7), this.motion);
      this.nibp.onDone = res => { this.nibpEvent = res; if (this.onNibp) this.onNibp(res, this.t); };
      this.ecgDrop = new sensors.Dropouts(new rngMod.Rng(seed + 8));
      this.ecgNoise = new rngMod.Rng(seed + 9);
      this.lead12Noise = new rngMod.Rng(seed + 14);
      this.lead12 = null; this.lead12V = new Array(12);
      this.plethS = new dsp.Ring(PPG_FS * BUFFER_S);
      this.respS = new dsp.Ring(RESP_FS * BUFFER_S);
      this.cuffS = new dsp.Ring(CUFF_FS * BUFFER_S);
      this.capS = new dsp.Ring(CAP_FS * BUFFER_S);
      this.artS = new dsp.Ring(ART_FS * BUFFER_S);
      this.capnoDet = new det.CapnoDetector();
      this.spo2Est = new det.SpO2Estimator(PPG_FS);
      this.breath = new det.BreathDetector(RESP_FS);
      this.lastNaN = { ecg: -Infinity, ppg: -Infinity, resp: -Infinity, cap: -Infinity };
      this.lastFrame = null; this.nibpEvent = null;
      this.tempReading = { value: null, status: 'starting' };
      this.glu = new glucoseMod.GlucoseModel(this.p);
      this.scheduleNibp();
      this.buildEcgChain();
    }

    buildEcgChain() {
      const p = this.p, fs = p.ecg_fs;
      if (!this.ecgS || this.ecgS.fs !== fs) {
        this.ecgS = new dsp.Ring(fs * BUFFER_S); this.ecgS.fs = fs;
        this.qrs = new det.PanTompkins(fs);
        this.qrsTimes = [];
        this.rhythm = new arr.RhythmAnalyzer(fs);
        this.rhythm.reset(this.t);
      }
      const chain = () => {
        const st = [];
        if (p.ecg_filter === 'monitor') st.push(dsp.bandpass(0.5, 40, fs));
        else if (p.ecg_filter === 'diagnostic') st.push(dsp.bandpass(0.05, 150, fs));
        if (p.notch === 'on' && p.mains_hz < fs / 2) st.push(dsp.notch(p.mains_hz, fs, 30));
        return new dsp.Chain(st);
      };
      this.ecgFilter = chain();
      // Derived 12-lead ECG: one ring and one copy of the display filter per lead.
      if (!this.lead12 || this.lead12[0].fs !== fs) {
        this.lead12 = [];
        for (let j = 0; j < 12; j++) { const r = new dsp.Ring(fs * LEAD12_S); r.fs = fs; this.lead12.push(r); }
      }
      this.lead12Filter = this.lead12.map(chain);
      this.ecgDec = Math.round(1000 / fs);
    }

    /** Signal-chain probe points for teaching views. Off by default so the
     *  simulation pays nothing for them. Each probe is a Ring with its own fs. */
    enableTaps(on) { this.taps = on ? (this.taps || {}) : null; }
    tap(name, fs, v) {
      let r = this.taps[name];
      if (!r || r.fs !== fs) { r = this.taps[name] = new dsp.Ring(Math.round(fs * TAP_S)); r.fs = fs; }
      r.push(v);
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
      if (changed.some(k => GLU_RESET_KEYS.includes(k))) this.glu.reset(this.p);
      else if (changed.includes('basal_insulin')) this.glu.setParams(this.p);
      return res;
    }

    startNibp() { return this.nibp.start(this.t); }
    cancelNibp() { this.nibp.cancel(this.t); }
    /** Glucose model events: a meal (g carbohydrate) or a subcutaneous insulin bolus (U). */
    giveMeal(grams) { if (grams > 0) this.glu.meal(grams); }
    giveBolus(units) { if (units > 0) this.glu.bolus(units); }
    /** Model projection from the current glucose state; see glucose.js forecast(). */
    glucoseForecast(horizonMin, events) { return this.glu.forecast(horizonMin, events); }

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
      this.updatePerfusion(t);
      this.stepTransducer(t);
      if (this.k % this.ecgDec === 0) this.acquireEcg(t, clean);
      if (this.k % 8 === 0) { this.acquirePpg(t); this.acquireArt(t); }
      if (this.k % 20 === 0) { this.acquireResp(t); this.acquireCapno(t); }
      if (this.k % 10 === 0) this.acquireCuff(t);
      if (this.k % 1000 === 0) this.emitFrame(t);
    }

    acquireEcg(t, clean) {
      const p = this.p, fs = p.ecg_fs, q = p.contact / 100;
      let x = NaN;
      const drop = this.ecgDrop.active(t, p.ecg_dropout, 1 / fs);
      if (p.contact >= 10 && !drop) {
        const wander = p.ecg_wander_mv * (Math.sin(2 * Math.PI * this.resp.phase) + 0.3 * Math.sin(2 * Math.PI * 0.05 * t));
        const noise = this.lastEcgNoise = this.ecgNoise.gauss() * p.ecg_noise_uv / 1000 * (1 + 4 * (1 - q) * (1 - q));
        const mains = p.mains_uv / 1000 * (1 + 4 * (1 - q)) * Math.sin(2 * Math.PI * p.mains_hz * t);
        x = clean + wander + noise + mains;
      } else this.lastNaN.ecg = t;
      const r = this.qrs.process(x, t); // detector sees the acquired (unfiltered-for-display) signal
      this.rhythm.process(x, t);
      if (r !== null) { this.qrsTimes.push(r); if (this.qrsTimes.length > 64) this.qrsTimes.shift(); this.rhythm.onQrs(r); }
      const y = this.ecgFilter.process(x);
      this.ecgS.push(y);
      this.acquireLeads12(x, x - clean);
      if (this.taps) {
        this.tap('ecg.clean', fs, clean); this.tap('ecg.acq', fs, x); this.tap('ecg.disp', fs, y);
        this.tap('ecg.mwi', fs, Number.isFinite(x) ? this.qrs.m1 : NaN);
        this.tap('ecg.thr', fs, Number.isFinite(this.qrs.thr) && Number.isFinite(x) ? this.qrs.thr : NaN);
      }
    }

    /** Derived 12-lead ECG (ecg12.js). Lead II is the monitor signal x itself;
     *  lead I and V1–V6 get the same wander and mains plus their own noise, and
     *  III, aVR, aVL, aVF are formed from the noisy I and II as an ECG cart does. */
    acquireLeads12(x, common) {
      const v = this.lead12V;
      if (Number.isFinite(x)) {
        ecg12.leads(this.ecg.vcg, v);
        const p = this.p, q = p.contact / 100, sd = p.ecg_noise_uv / 1000 * (1 + 4 * (1 - q) * (1 - q));
        // common = wander + noise + mains of lead II; drop lead II's own noise sample
        const shared = common - this.lastEcgNoise;
        const I = v[0] + shared + this.lead12Noise.gauss() * sd, II = x;
        v[0] = I; v[1] = II; v[2] = II - I; v[3] = -(I + II) / 2; v[4] = I - II / 2; v[5] = II - I / 2;
        for (let j = 6; j < 12; j++) v[j] += shared + this.lead12Noise.gauss() * sd;
      } else v.fill(NaN);
      for (let j = 0; j < 12; j++) this.lead12[j].push(this.lead12Filter[j].process(v[j]));
    }

    acquirePpg(t) {
      const s = this.ppg.sample(t, 1 / PPG_FS, this.p, this.pulseLevel(t));
      if (!Number.isFinite(s.ir)) this.lastNaN.ppg = t;
      const pleth = this.spo2Est.process(s.red, s.ir, t, this.p.spo2_avg);
      this.plethS.push(pleth);
      if (this.taps) { this.tap('ppg.red', PPG_FS, s.red); this.tap('ppg.ir', PPG_FS, s.ir); this.tap('ppg.ac', PPG_FS, pleth); }
    }

    acquireResp(t) {
      const z = this.resp.sample(t, 1 / RESP_FS, this.p, this.pulseLevel(t));
      if (!Number.isFinite(z)) this.lastNaN.resp = t;
      this.breath.process(z, t, this.p.resp_thr);
      this.respS.push(z);
      if (this.taps) { this.tap('resp.raw', RESP_FS, z); this.tap('resp.bp', RESP_FS, Number.isFinite(z) ? this.breath.y : NaN); }
    }

    /** Circulation state 0..1 for the capnogram and the truth record: relaxes to 1 (τ 0.8 s)
     *  while beats arrive, decays (τ 1.5 s) when no beat has come for 2 expected intervals
     *  (VF, asystole). Illustrative; arterial pressure comes from the Windkessel instead. */
    updatePerfusion(t) {
      if (t - this.lastBeatT < 2 * 60 / this.p.hr + 0.5) this.perf += (1 - this.perf) * DT / 0.8;
      else this.perf -= this.perf * DT / 1.5;
    }

    /** Three-element Windkessel fitted to the set HR, SBP and DBP (see pulse.js). */
    windkessel() {
      const p = this.p, w = this.wk;
      if (!w || w.hr !== p.hr || w.sbp !== p.sbp || w.dbp !== p.dbp) {
        this.wk = { hr: p.hr, sbp: p.sbp, dbp: p.dbp, fit: pulse.fit(p.hr, p.sbp, p.dbp, PMSF) };
      }
      return this.wk.fit;
    }

    /** True arterial pressure (mmHg) from the Windkessel driven by the simulated beats:
     *  irregular intervals change it beat to beat, weak beats (PVC, VT) eject less, and
     *  without beats it falls towards PMSF with the fitted time constant. */
    arterialPressure(t) {
      if (t !== this.artT) { this.artT = t; this.artTrue = this.art.value(this.windkessel(), t); }
      return this.artTrue;
    }

    /** Arterial pulse normalised to the set pressures: 0 at DBP, 1 at SBP. Drives the
     *  PPG absorbance and the cardiogenic impedance artifact. */
    pulseLevel(t) {
      const p = this.p;
      return (this.arterialPressure(t) - p.dbp) / Math.max(1, p.sbp - p.dbp);
    }

    /** Fluid-filled line: x'' + 2ζωn x' + ωn² x = ωn² (P_art − hydrostatic offset), semi-implicit Euler at 1 kHz. */
    stepTransducer(t) {
      const p = this.p, D = IBP_DAMPING[p.ibp_damping], wn = 2 * Math.PI * D.fn;
      const target = p.ibp_line === 'open-to-air' ? 0 : this.arterialPressure(t) - HYDRO_MMHG_PER_CM * p.ibp_height_cm;
      this.ibpV += (wn * wn * (target - this.ibpX) - 2 * D.zeta * wn * this.ibpV) * DT;
      this.ibpX += this.ibpV * DT;
    }

    acquireArt(t) {
      this.artS.push(this.ibpX + this.artNoise.gauss() * 0.3);
      if (this.taps) { this.tap('art.true', ART_FS, this.arterialPressure(t)); this.tap('art.meas', ART_FS, this.artS.at(this.artS.total - 1)); }
    }

    acquireCapno(t) {
      const c = this.capno.sample(this.resp, this.p, this.perf);
      if (!Number.isFinite(c)) this.lastNaN.cap = t;
      this.capnoDet.process(c, t);
      this.capS.push(c);
      if (this.taps) this.tap('cap.meas', CAP_FS, c);
    }

    /** Systolic = max, diastolic = min, mean = average of the last 4 s of the arterial trace. */
    arterialNumbers() {
      const a = this.artS.last(4 * ART_FS);
      if (a.length < ART_FS) return null;
      let sys = -Infinity, dia = Infinity, sum = 0;
      for (const v of a) { if (v > sys) sys = v; if (v < dia) dia = v; sum += v; }
      return { sys, dia, map: sum / a.length };
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
      const rh = this.rhythm.analyse(t, leadsOff);
      const art = this.arterialNumbers();
      const artNoPulse = art !== null && art.sys - art.dia < 5 && Math.abs(art.map) < 5;
      this.glu.advance(p.glu_clock / 60); // one simulated second = glu_clock/60 model minutes
      const glu = this.glu.values();
      const capFi = p.fico2, capEt = capFi + Math.max(0, p.etco2 - capFi) * (0.15 + 0.85 * this.perf);
      const frame = {
        t, timestamp: this.startEpoch + t * 1000,
        truth: { hr: p.hr, spo2: p.spo2, sbp: p.sbp, dbp: p.dbp, map: p.dbp + (p.sbp - p.dbp) * this.windkessel().meanFraction, rr: p.rr, temp: p.temp,
          etco2: p.capno_sensor === 'ok' ? capEt : null, arrhythmia: p.arrhythmia, perfusion: this.perf,
          glucose: glu.glucose, insulin: glu.insulin, qt: this.ecg.lastQt },
        est: {
          hr: leadsOff || rh.rhythm === 'vfib' || rh.rhythm === 'asystole' ? null : this.qrs.heartRate(t),
          rhythm: rh.rhythm, rhythmLabel: rh.label, pvcPerMin: rh.pvcPerMin, qrsWidthMs: rh.qrsWidthMs,
          pr: spo.pr, spo2: spo.spo2, sqi: spo.sqi, pi: spo.pi, spo2Status: spo.status,
          rr: this.breath.rate(t, p.apnea_delay), apnea,
          temp: this.tempReading.value, tempStatus: this.tempReading.status, tempRaw: this.tempReading.raw,
          etco2: this.capnoDet.etco2(t, p.apnea_delay), fico2: this.capnoDet.fico2(t, p.apnea_delay), awrr: this.capnoDet.rate(t, p.apnea_delay),
          art: art && !artNoPulse ? art : null,
          glucose: glu.glucose, insulin: glu.insulin, gluMin: this.glu.t, // model values, no sensor model
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
          capnoNoSignal: t - this.lastNaN.cap < 1,
          artNoPulse,
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
    if (f.est.etco2 !== undefined)
      sim('etco2', f.est.etco2, { method: 'capnogram peak per breath', setpoint: f.truth.etco2, fico2: f.est.fico2, awrr: f.est.awrr });
    if (f.est.art !== undefined) {
      const a = f.est.art || {}, prov = { method: 'arterial line, 4-s window (max / min / mean)', setpointSbp: f.truth.sbp, setpointDbp: f.truth.dbp };
      sim('art_sys', a.sys === undefined ? null : a.sys, prov);
      sim('art_dia', a.dia === undefined ? null : a.dia, prov);
      sim('art_map', a.map === undefined ? null : a.map, prov);
    }
    if (f.est.glucose !== undefined) {
      sim('glucose', f.est.glucose, { method: 'minimal model + meal and insulin absorption (model value, no sensor)', modelMin: f.est.gluMin });
      sim('insulin', f.est.insulin, { method: 'insulin kinetics of the glucose model (model value, no sensor)', modelMin: f.est.gluMin });
    }
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

  return { Engine, frameObservations, mapFormula, DT, PPG_FS, RESP_FS, CUFF_FS, CAP_FS, ART_FS, PAT, IBP_DAMPING, HYDRO_MMHG_PER_CM, TAP_S, LEAD12_S };
});
