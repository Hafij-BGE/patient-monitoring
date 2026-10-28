/* Links active alarms to the monitor tiles and the controls they concern, so the
 * UI can colour each one by the highest alarm priority present. There are no
 * thresholds here: the colours follow only what the alarm engine reports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.PM = root.PM || {}).severity = factory();
})(this, function () {
  'use strict';

  const RANK = { low: 1, medium: 2, high: 3 };

  // Alarm param (physiological) or technical flag → tiles and controls it concerns.
  const LINKS = {
    hr:      { tiles: ['tHr'], controls: ['hr'] },
    rhythm:  { tiles: ['tHr'], controls: ['arrhythmia', 'rhythm', 'pvc_per_min'] },
    spo2:    { tiles: ['tSpo2'], controls: ['spo2'] },
    sbp:     { tiles: ['tNibp'], controls: ['sbp'] },
    dbp:     { tiles: ['tNibp'], controls: ['dbp'] },
    map:     { tiles: ['tNibp'], controls: ['sbp', 'dbp'] },
    art_sys: { tiles: ['tArt'], controls: ['sbp'] },
    art_map: { tiles: ['tArt'], controls: ['sbp', 'dbp'] },
    etco2:   { tiles: ['tCo2'], controls: ['etco2'] },
    rr:      { tiles: ['tRr'], controls: ['rr'] },
    temp:    { tiles: ['tTemp'], controls: ['temp'] },
    glucose: { tiles: ['tGlu'], controls: ['fasting_glucose', 'basal_insulin', 'diabetes'] },
    ecgLeadsOff:     { tiles: ['tHr'], controls: ['contact'] },
    ecgNoSignal:     { tiles: ['tHr'], controls: ['ecg_dropout'] },
    spo2NoSignal:    { tiles: ['tSpo2'], controls: ['spo2_sensor'] },
    spo2ProbeOff:    { tiles: ['tSpo2'], controls: ['spo2_sensor'] },
    spo2LowSQI:      { tiles: ['tSpo2'], controls: ['motion', 'ppg_noise', 'pi'] },
    respNoSignal:    { tiles: ['tRr'], controls: ['resp_dropout'] },
    tempUnavailable: { tiles: ['tTemp'], controls: ['temp_sensor'] },
    tempError:       { tiles: ['tTemp'], controls: ['temp_sensor'] },
    nibpFailed:      { tiles: ['tNibp'], controls: ['motion'] },
    capnoNoSignal:   { tiles: ['tCo2'], controls: ['capno_sensor'] },
    artNoPulse:      { tiles: ['tArt'], controls: ['ibp_line'] },
  };

  function add(map, key, a) {
    const cur = map[key] || (map[key] = { sev: a.priority, messages: [] });
    if (RANK[a.priority] > RANK[cur.sev]) cur.sev = a.priority;
    if (!cur.messages.includes(a.message)) cur.messages.push(a.message);
  }

  /** active: alarm records ({param, priority, message}). Returns
   *  { tiles: {tileId: {sev, messages}}, controls: {paramKey: {sev, messages}} }. */
  function grade(active) {
    const out = { tiles: {}, controls: {} };
    for (const a of active || []) {
      const l = LINKS[a.param];
      if (!l) continue;
      for (const t of l.tiles) add(out.tiles, t, a);
      for (const c of l.controls) add(out.controls, c, a);
    }
    return out;
  }

  /** Counts per priority, highest first, e.g. {high: 1, medium: 2, low: 0}. */
  function counts(active) {
    const c = { high: 0, medium: 0, low: 0 };
    for (const a of active || []) c[a.priority]++;
    return c;
  }

  return { RANK, LINKS, grade, counts };
});
