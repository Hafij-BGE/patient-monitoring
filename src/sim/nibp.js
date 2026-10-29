/* Oscillometric non-invasive blood pressure (NIBP) model.
 *
 * Forward model: the brachial artery under the cuff follows an arctangent
 * pressure–volume curve of transmural pressure P = p_art − P_cuff
 *   v(P) = 0.5 + atan(P / w)/π,  w = 6 mmHg (P < 0, collapse) or 8 mmHg (P ≥ 0),
 * both scaled by the stiffness setting (shape after Langewouters 1984 / Drzewiecki
 * 1994). The widths were fitted so that the cuff pressure of the oscillation maximum
 * matches the true (waveform-area) MAP of the Windkessel pulse over 10 pressure/rate
 * cases (RMS error 0.8 mmHg in the analytic envelope); Ks = Kd = 0.55 are the ratios
 * that then return the set SBP and DBP. Real devices use proprietary ratios that differ
 * from these (reported Ks 0.45–0.73, Kd 0.69–0.83; Forouzanfar 2015), because a real
 * artery's pressure–volume curve is not this arctangent. The cuff sees
 *   P_c + G·[v(p_art − P_c) − v(DBP − P_c)]
 * as it deflates linearly. The monitor side extracts one oscillation amplitude per
 * beat, takes MAP at the maximum and SBP/DBP where the envelope falls to Ks·max and
 * Kd·max (fixed-ratio method; Geddes 1982, Forouzanfar 2015). The displayed MAP is the
 * cuff pressure at the maximum, as on real oscillometric monitors.
 *
 * Set-point change: an oscillogram that mixes beats from two pressure levels
 * gives a wrong reading that the envelope analysis can still accept. The
 * measurement is therefore aborted when the simulated SBP or DBP moves more than
 * SETPOINT_TOL from its value at the start, or the arterial stiffness changes.
 * This is a simulator rule (the model knows the set point); a real monitor has
 * to infer instability from the oscillations themselves. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dsp.js'));
  else (root.PM = root.PM || {}).nibp = factory(root.PM.dsp);
})(this, function (dsp) {
  'use strict';

  const W_COLLAPSE = 6, W_DISTEND = 8, GAIN = 3; // mmHg
  const MIN_OSC = 0.5; // mmHg: oscillations below this are treated as noise when deciding to stop
  const INFLATE_RATE = 25, DUMP_RATE = 50, TIMEOUT = 120; // mmHg/s, mmHg/s, s
  const SETPOINT_TOL = 5; // mmHg: larger SBP/DBP changes during a measurement abort it
  const SETPOINT_ERROR = 'patient pressure changed during measurement; repeat';

  function volume(P, stiffness) {
    const w = (P < 0 ? W_COLLAPSE : W_DISTEND) * (stiffness || 1);
    return 0.5 + Math.atan(P / w) / Math.PI;
  }

  /** Oscillogram analysis (pure). beats: [{pc, amp}] in deflation order. */
  function analyse(beats, ks, kd) {
    if (beats.length < 8) return { error: 'too few beats (' + beats.length + ')' };
    // Artifact screening against the local envelope: a beat is rejected when it
    // stands far above the median of its 5-beat neighbourhood (isolated spike);
    // widespread disagreement with the local median means motion.
    const amps = beats.map(b => b.amp);
    const med5 = amps.map((_, i) => { const w = amps.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b); return w[w.length >> 1]; });
    const env = beats.map((b, i) => Object.assign({}, b, { rejected: b.amp > 2 * med5[i] + 0.2 }));
    const kept = env.filter(b => !b.rejected);
    const peak = Math.max(...med5);
    const rough = amps.reduce((s, a, i) => s + Math.abs(a - med5[i]), 0) / amps.length / Math.max(peak, 1e-6);
    if (env.length - kept.length > 0.3 * env.length || rough > 0.15)
      return { error: 'motion artifact (irregular oscillations)', envelope: env };
    const sm = kept.map((b, i) => {
      const w = kept.slice(Math.max(0, i - 1), i + 2);
      return { pc: b.pc, amp: w.reduce((s, x) => s + x.amp, 0) / w.length };
    });
    let im = 0;
    sm.forEach((b, i) => { if (b.amp > sm[im].amp) im = i; });
    const am = sm[im].amp, mapOsc = sm[im].pc;
    const cross = (from, dir, level) => {
      for (let i = from; i + dir >= 0 && i + dir < sm.length; i += dir) {
        const a = sm[i], b = sm[i + dir];
        if (b.amp < level) return b.pc + (a.pc - b.pc) * (level - b.amp) / (a.amp - b.amp);
      }
      return null;
    };
    const sbp = cross(im, -1, ks * am), dbp = cross(im, 1, kd * am);
    if (sbp === null) return { error: 'systolic point not found (cuff not inflated high enough)', retryHigher: true, envelope: env, smooth: sm };
    if (dbp === null) return { error: 'diastolic point not found', envelope: env, smooth: sm };
    return { sbp, dbp, mapOsc, map: (sbp + 2 * dbp) / 3, pp: sbp - dbp, envelope: env, smooth: sm };
  }

  class Nibp {
    constructor(rng, motion) { this.rng = rng; this.motion = motion; this.reset(); }
    reset() { this.state = 'idle'; this.cuff = 0; this.last = null; this.extra = 0; this.history = []; this.seg = []; this.beats = []; this.msg = ''; }
    start(t) {
      if (this.state === 'inflating' || this.state === 'deflating') return false;
      const lastS = this.last && this.last.sbp ? this.last.sbp : 0;
      this.target = Math.min(280, Math.max(160, lastS + 30) + this.extra);
      this.state = 'inflating'; this.t0 = t; this.seg = []; this.beats = []; this.msg = 'inflating'; this.retried = false;
      this.ref = null; // set point, taken on the first step
      return true;
    }
    cancel(t) { if (this.state === 'inflating' || this.state === 'deflating') this.finish(t, { error: 'cancelled by user' }); }
    finish(t, res) {
      if (res.retryHigher && !this.retried && this.target < 280) {
        // pulsations still present at the inflation pressure: re-inflate 50 mmHg higher once
        this.retried = true; this.target = Math.min(280, this.target + 50);
        this.state = 'inflating'; this.seg = []; this.beats = []; this.msg = 're-inflating'; this.t0 = t;
        return;
      }
      res.t = t; res.target = this.target;
      if (res.error) { this.state = 'failed'; this.msg = res.error; this.extra = res.retryHigher ? Math.min(100, this.extra + 50) : 0; }
      else { this.state = 'completed'; this.msg = 'completed'; this.extra = 0; }
      this.last = res; this.history.push(res);
      if (this.onDone) this.onDone(res);
    }
    /** Called at 100 Hz. art = true arterial pressure, beatStart = a pulse onset occurred since the last call. */
    step(t, dt, p, art, beatStart) {
      if (this.state === 'inflating' || this.state === 'deflating') {
        if (!this.ref) this.ref = { sbp: p.sbp, dbp: p.dbp, stiffness: p.stiffness };
        else if (Math.abs(p.sbp - this.ref.sbp) > SETPOINT_TOL || Math.abs(p.dbp - this.ref.dbp) > SETPOINT_TOL || p.stiffness !== this.ref.stiffness)
          this.finish(t, { error: SETPOINT_ERROR });
      }
      if (this.state === 'inflating') {
        this.cuff = Math.min(this.target, this.cuff + INFLATE_RATE * dt);
        if (this.cuff >= this.target) { this.state = 'deflating'; this.msg = 'deflating'; this.seg = []; this.segOk = false; }
      } else if (this.state === 'deflating') {
        this.cuff -= p.nibp_deflate * dt;
      } else if (this.cuff > 0) this.cuff = Math.max(0, this.cuff - DUMP_RATE * dt);

      const osc = this.state === 'idle' && this.cuff === 0 ? 0
        : GAIN * (volume(art - this.cuff, p.stiffness) - volume(p.dbp - this.cuff, p.stiffness));
      const mot = p.motion / 100 * 2 * this.motion.at(t * 1.3);
      const reading = this.cuff + osc + mot + this.rng.gauss() * 0.05;

      if (this.state === 'deflating') {
        if (beatStart && this.segOk && this.seg.length > 3) this.closeBeat();
        if (beatStart) { this.seg = []; this.segOk = true; } // the partial segment before the first onset is discarded
        if (this.beats.length === 2 && !this.retried && this.beats.every(b => b.amp > 2 * MIN_OSC)) {
          this.finish(t, { error: 'systolic point not found (cuff not inflated high enough)', retryHigher: true });
          return reading;
        }
        this.seg.push(reading);
        const n = this.beats.length;
        let im = 0; this.beats.forEach((b, i) => { if (b.amp > this.beats[im].amp) im = i; });
        const after = n ? this.beats.slice(im + 1) : [];
        const fallen = n >= 8 && im >= 2 && this.beats[im].amp > MIN_OSC && after.length >= 2 && after.slice(-2).every(b => b.amp < 0.45 * this.beats[im].amp);
        if ((fallen && this.cuff < this.beats[im].pc - 10) || this.cuff < 25 || t - this.t0 > TIMEOUT) {
          const res = t - this.t0 > TIMEOUT ? { error: 'timeout' } : analyse(this.beats, p.nibp_ks, p.nibp_kd);
          this.finish(t, res);
        }
      }
      return reading;
    }
    /** Oscillation amplitude of one beat: peak above the straight line joining its ends. */
    closeBeat() {
      const s = this.seg, n = s.length;
      let amp = -Infinity;
      for (let i = 0; i < n; i++) amp = Math.max(amp, s[i] - (s[0] + (s[n - 1] - s[0]) * i / (n - 1)));
      // beat ends sit at diastole, where the oscillation is ~0, so their mean ≈ cuff pressure
      this.beats.push({ pc: (s[0] + s[n - 1]) / 2, amp });
    }
  }

  return { Nibp, analyse, volume, W_COLLAPSE, W_DISTEND, GAIN, SETPOINT_TOL };
});
