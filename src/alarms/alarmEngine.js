/* Educational alarm engine — not a certified clinical alarm system.
 *
 * Pure logic on the simulation clock (frame.t, seconds); no timers, no audio.
 * Concepts follow IEC 60601-1-8 vocabulary (alarm condition, delay, priority,
 * acknowledge, audio paused) but the defaults below are illustrative teaching
 * values, not taken from any device or guideline, and must not be used clinically.
 *
 * Rules:
 *  - Physiological alarm when value < low or value > high (strict). A missing
 *    value (null) never raises a physiological alarm; the related technical
 *    alarm reports the missing signal instead.
 *  - A condition must persist for `delay` seconds before the alarm activates.
 *  - Non-latching: the alarm ends when the condition ends (it stays in history).
 *  - Acknowledge silences one active alarm until it ends; a new occurrence is new.
 *  - Mute (audio paused) silences all audio for a countdown (default 120 s);
 *    visual indication continues.
 *  - Priorities: apnea = high, limit alarms = medium, technical = low. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).alarms = factory();
})(this, function () {
  'use strict';

  const PRIORITY = { high: 3, medium: 2, low: 1 };

  /** Illustrative adult defaults (educational; configurable in the UI). */
  const DEFAULT_LIMITS = {
    hr:   { label: 'HR',   unit: 'bpm',   low: 50,   high: 120,  delay: 5,  enabled: true },
    spo2: { label: 'SpO₂', unit: '%',     low: 90,   high: null, delay: 10, enabled: true },
    rr:   { label: 'RR',   unit: 'br/min', low: 8,   high: 30,   delay: 10, enabled: true },
    temp: { label: 'Temp', unit: '°C',    low: 35.5, high: 38.5, delay: 10, enabled: true },
    sbp:  { label: 'NIBP SYS', unit: 'mmHg', low: 90, high: 160, delay: 0, enabled: true },
    dbp:  { label: 'NIBP DIA', unit: 'mmHg', low: 50, high: 95,  delay: 0, enabled: true },
    map:  { label: 'NIBP MAP', unit: 'mmHg', low: 65, high: 115, delay: 0, enabled: true },
  };

  const TECHNICAL = {
    ecgLeadsOff:     'ECG leads off',
    ecgNoSignal:     'ECG signal lost',
    spo2NoSignal:    'SpO₂ no signal (sensor disconnected)',
    spo2ProbeOff:    'SpO₂ probe off',
    spo2LowSQI:      'SpO₂ poor signal quality',
    respNoSignal:    'Resp signal lost',
    tempUnavailable: 'Temp probe unavailable',
    tempError:       'Temp probe error (implausible reading rejected)',
    nibpFailed:      'NIBP measurement failed',
  };
  const TECH_DELAY = 2; // s; hides sub-second flicker of short dropouts

  const clone = o => JSON.parse(JSON.stringify(o));

  /** Check a proposed limit change. Returns {ok, limit} or {ok:false, error}. */
  function validateLimit(cur, change) {
    const n = Object.assign({}, cur, change);
    for (const k of ['low', 'high', 'delay']) {
      if (n[k] === '' || n[k] === undefined) n[k] = null;
      if (n[k] !== null && (typeof n[k] !== 'number' || !Number.isFinite(n[k]))) {
        const v = Number(n[k]);
        if (!Number.isFinite(v)) return { ok: false, error: k + ' must be a number or empty' };
        n[k] = v;
      }
    }
    if (n.low !== null && n.high !== null && n.low >= n.high) return { ok: false, error: 'low limit must be below high limit' };
    if (n.delay === null || n.delay < 0 || n.delay > 60) return { ok: false, error: 'delay must be 0–60 s' };
    n.enabled = n.enabled !== false;
    return { ok: true, limit: n };
  }

  /** Values the alarms look at, taken from an engine frame. */
  function frameValues(f) {
    const nb = f.nibp && f.nibp.last && !f.nibp.last.error ? f.nibp.last : null;
    return {
      hr: f.est.hr, spo2: f.est.spo2, rr: f.est.apnea ? null : f.est.rr, temp: f.est.temp,
      sbp: nb ? nb.sbp : null, dbp: nb ? nb.dbp : null, map: nb ? nb.map : null,
    };
  }

  class AlarmEngine {
    constructor(limits) {
      this.limits = clone(limits || DEFAULT_LIMITS);
      this.history = [];
      this.reset();
    }
    reset() {
      this.since = {};    // id → time the condition was first seen (pending)
      this.active = {};   // id → alarm record
      this.muteUntil = null;
      this.t = 0;
      this.history = [];
    }
    setLimit(param, change) {
      if (!this.limits[param]) return { ok: false, error: 'unknown alarm parameter "' + param + '"' };
      const r = validateLimit(this.limits[param], change);
      if (r.ok) this.limits[param] = r.limit;
      return r;
    }
    restoreDefaultLimits() { this.limits = clone(DEFAULT_LIMITS); }

    /** Evaluate one frame. Returns the current alarm state. */
    evaluate(frame) {
      const t = this.t = frame.t;
      const cond = {}; // id → {kind, param, priority, message, value, limit}
      const vals = frameValues(frame);
      for (const [param, L] of Object.entries(this.limits)) {
        const v = vals[param];
        if (!L.enabled || v === null || v === undefined || !Number.isFinite(v)) continue;
        if (L.low !== null && v < L.low)
          cond[param + ':low'] = { kind: 'physiological', param, priority: 'medium', delay: L.delay, value: v, limit: L.low, message: L.label + ' low' };
        else if (L.high !== null && v > L.high)
          cond[param + ':high'] = { kind: 'physiological', param, priority: 'medium', delay: L.delay, value: v, limit: L.high, message: L.label + ' high' };
      }
      if (frame.est.apnea)
        cond['apnea'] = { kind: 'physiological', param: 'rr', priority: 'high', delay: 0, value: 0, limit: null, message: 'APNEA' };
      for (const [flag, text] of Object.entries(TECHNICAL)) {
        if (!frame.technical[flag]) continue;
        const msg = flag === 'nibpFailed' && frame.nibp && frame.nibp.msg ? text + ': ' + frame.nibp.msg : text;
        cond['tech:' + flag] = { kind: 'technical', param: flag, priority: 'low', delay: TECH_DELAY, value: null, limit: null, message: msg };
      }

      for (const id of Object.keys(this.since)) if (!cond[id]) delete this.since[id];
      for (const [id, a] of Object.entries(this.active)) {
        if (!cond[id]) { a.tOff = t; delete this.active[id]; }
        else a.value = cond[id].value;
      }
      for (const [id, c] of Object.entries(cond)) {
        if (this.active[id]) continue;
        if (!(id in this.since)) this.since[id] = t;
        if (t - this.since[id] >= c.delay) {
          const rec = { id, kind: c.kind, param: c.param, priority: c.priority, message: c.message,
            value: c.value, limit: c.limit, tCond: this.since[id], tOn: t, tOff: null, ackAt: null };
          this.active[id] = rec;
          this.history.push(rec);
        }
      }
      return this.state();
    }

    acknowledge(id) {
      const a = this.active[id];
      if (!a || a.ackAt !== null) return false;
      a.ackAt = this.t;
      return true;
    }
    acknowledgeAll() { let n = 0; for (const id of Object.keys(this.active)) if (this.acknowledge(id)) n++; return n; }
    mute(seconds) { this.muteUntil = this.t + (seconds === undefined ? 120 : seconds); }
    unmute() { this.muteUntil = null; }
    muteRemaining() { return this.muteUntil === null ? 0 : Math.max(0, this.muteUntil - this.t); }

    state() {
      if (this.muteUntil !== null && this.t >= this.muteUntil) this.muteUntil = null;
      const list = Object.values(this.active).sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority] || a.tOn - b.tOn);
      const sounding = list.filter(a => a.ackAt === null);
      const top = sounding.length ? sounding[0].priority : null;
      return {
        t: this.t,
        active: list.map(a => Object.assign({}, a)),
        highest: list.length ? list[0].priority : null,
        audio: this.muteUntil === null ? top : null, // priority of the tone to play, or null
        muted: this.muteUntil !== null,
        muteRemaining: this.muteRemaining(),
      };
    }
  }

  function historyCSV(history) {
    const head = 'alarm_id,kind,priority,message,value,limit,condition_start_s,active_from_s,ended_s,acknowledged_s';
    const cell = v => v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const num = v => typeof v === 'number' ? Number(v.toFixed(2)) : v;
    return [head].concat(history.map(a => [a.id, a.kind, a.priority, a.message, num(a.value), a.limit, num(a.tCond), num(a.tOn), num(a.tOff), num(a.ackAt)].map(cell).join(','))).join('\n') + '\n';
  }

  return { AlarmEngine, DEFAULT_LIMITS, TECHNICAL, TECH_DELAY, PRIORITY, validateLimit, frameValues, historyCSV,
    NOTICE: 'Educational alarm logic — not a certified clinical alarm system.' };
});
