/* In-memory observation store with trend queries, gap detection and export. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./observation.js'));
  else (root.PM = root.PM || {}).store = factory(root.PM.observation);
})(this, function (observation) {
  'use strict';

  class ObservationStore {
    constructor(opts) {
      this.maxPerSeries = (opts && opts.maxPerSeries) || 20000;
      this.series = new Map(); // key "source|param" -> Observation[] sorted by time
      this.listeners = new Set();
    }

    static key(source, param) { return source + '|' + param; }

    static timeOf(o) { return o.timestamp !== null ? o.timestamp : (o.simTime !== null ? o.simTime * 1000 : 0); }

    add(obs) {
      const k = ObservationStore.key(obs.source, obs.param);
      let arr = this.series.get(k);
      if (!arr) { arr = []; this.series.set(k, arr); }
      const t = ObservationStore.timeOf(obs);
      if (arr.length === 0 || ObservationStore.timeOf(arr[arr.length - 1]) <= t) arr.push(obs);
      else { // keep sorted (imports may arrive out of order)
        let i = arr.length - 1;
        while (i >= 0 && ObservationStore.timeOf(arr[i]) > t) i--;
        arr.splice(i + 1, 0, obs);
      }
      if (arr.length > this.maxPerSeries) arr.splice(0, arr.length - this.maxPerSeries);
      this.listeners.forEach(fn => fn(obs));
      return obs;
    }

    addMany(list) { list.forEach(o => this.add(o)); }

    /** @returns Observation[] for one source+param, optionally within [t0,t1] ms */
    get(source, param, t0, t1) {
      const arr = this.series.get(ObservationStore.key(source, param)) || [];
      if (t0 === undefined && t1 === undefined) return arr.slice();
      return arr.filter(o => {
        const t = ObservationStore.timeOf(o);
        return (t0 === undefined || t >= t0) && (t1 === undefined || t <= t1);
      });
    }

    latest(source, param) {
      const arr = this.series.get(ObservationStore.key(source, param));
      return arr && arr.length ? arr[arr.length - 1] : null;
    }

    all() {
      const out = [];
      this.series.forEach(arr => out.push(...arr));
      return out.sort((a, b) => ObservationStore.timeOf(a) - ObservationStore.timeOf(b));
    }

    sources() { return Array.from(new Set(Array.from(this.series.keys()).map(k => k.split('|')[0]))); }

    params(source) {
      return Array.from(this.series.keys()).filter(k => !source || k.startsWith(source + '|')).map(k => k.split('|')[1]);
    }

    clear(source) {
      if (!source) { this.series.clear(); return; }
      Array.from(this.series.keys()).forEach(k => { if (k.startsWith(source + '|')) this.series.delete(k); });
    }

    onAdd(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  }

  /**
   * Find missing-data intervals in a series: explicit null values, or a time step
   * larger than `maxGapMs`. Gaps are reported, never filled.
   */
  function findGaps(series, maxGapMs) {
    const gaps = [];
    let openStart = null;
    for (let i = 0; i < series.length; i++) {
      const o = series[i], t = ObservationStore.timeOf(o);
      if (o.value === null) { if (openStart === null) openStart = t; continue; }
      if (openStart !== null) { gaps.push({ start: openStart, end: t, reason: 'missing values' }); openStart = null; }
      if (i > 0 && series[i - 1].value !== null) {
        const tp = ObservationStore.timeOf(series[i - 1]);
        if (t - tp > maxGapMs) gaps.push({ start: tp, end: t, reason: 'no data for ' + Math.round((t - tp) / 1000) + ' s' });
      }
    }
    if (openStart !== null) gaps.push({ start: openStart, end: ObservationStore.timeOf(series[series.length - 1]), reason: 'missing values' });
    return gaps;
  }

  function summary(series) {
    const v = series.map(o => o.value).filter(x => x !== null);
    if (!v.length) return { n: 0, missing: series.length };
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, v.length - 1));
    return { n: v.length, missing: series.length - v.length, mean, sd, min: Math.min(...v), max: Math.max(...v) };
  }

  const CSV_COLUMNS = ['timestamp_iso', 'sim_time_s', 'param', 'value', 'unit', 'source', 'quality', 'provenance'];

  function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(list) {
    const rows = [CSV_COLUMNS.join(',')];
    for (const o of list) {
      rows.push([
        o.timestamp !== null ? new Date(o.timestamp).toISOString() : '',
        o.simTime !== null ? o.simTime.toFixed(3) : '',
        o.param, o.value === null ? '' : o.value, o.unit, o.source, o.quality,
        JSON.stringify(o.provenance),
      ].map(csvCell).join(','));
    }
    return rows.join('\n') + '\n';
  }

  function toJSON(list, meta) {
    return JSON.stringify({
      format: 'pm-sim-observations',
      version: 1,
      exportedAt: new Date().toISOString(),
      notice: 'Educational simulation export. Simulated values are not clinical measurements.',
      meta: meta || {},
      observations: list.map(o => ({
        timestamp: o.timestamp !== null ? new Date(o.timestamp).toISOString() : null,
        simTime: o.simTime, param: o.param, value: o.value, unit: o.unit,
        source: o.source, quality: o.quality, provenance: o.provenance,
      })),
    }, null, 2);
  }

  return { ObservationStore, findGaps, summary, toCSV, toJSON, CSV_COLUMNS };
});
