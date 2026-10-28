/* Data tab: file import (CSV/JSON, HL7 v2, FHIR, SDC XML), manual entry, export and the store summary.
 * Files are read with FileReader inside this tab; nothing leaves the browser. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, el, fmt, download, stamp } = PM.dom;
  const { ObservationStore, summary, toCSV, toJSON } = PM.store;
  const SOURCES = Object.values(PM.observation.SOURCE);

  // Units offered in the manual-entry form (first = canonical). All are accepted by units.toCanonical.
  const UNIT_CHOICES = {
    weight: ['kg', 'lb', 'g'], height: ['cm', 'in', 'm'], temp: ['°C', '°F'],
    sbp: ['mmHg', 'kPa'], dbp: ['mmHg', 'kPa'], map: ['mmHg', 'kPa'], pp: ['mmHg', 'kPa'],
    art_sys: ['mmHg', 'kPa'], art_dia: ['mmHg', 'kPa'], art_map: ['mmHg', 'kPa'], etco2: ['mmHg', 'kPa'],
  };
  const MANUAL_PARAMS = ['sbp', 'dbp', 'hr', 'pr', 'spo2', 'rr', 'temp', 'etco2', 'art_sys', 'art_dia', 'art_map', 'weight', 'height', 'steps'];

  function init(o) {
    const store = o.store, U = PM.units;

    // ---------------------------------------------------------- import
    const drop = $('#drop'), fileIn = $('#fileIn');
    fileIn.addEventListener('change', () => { readFiles(fileIn.files); fileIn.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); readFiles(e.dataTransfer.files); });

    function readFiles(files) {
      for (const f of Array.from(files || [])) {
        if (f.size > 20 * 1024 * 1024) { showReport({ file: f.name, errors: ['file larger than 20 MB, not read'] }); continue; }
        const fr = new FileReader();
        fr.onload = () => importOne(String(fr.result), f.name);
        fr.onerror = () => showReport({ file: f.name, errors: ['could not read file: ' + (fr.error && fr.error.message)] });
        fr.readAsText(f);
      }
    }

    /** Detects the format (CSV/JSON table, HL7 v2, FHIR, SDC) and stores the result. extra: { acceptLocation, source, box } */
    function importOne(text, name, extra) {
      extra = extra || {};
      const opts = { timezone: $('#impTz').value.trim() || 'local', dateOrder: $('#impOrder').value, duplicates: $('#impDup').value,
        acceptLocation: extra.acceptLocation, source: extra.source };
      const r = PM.catalog.importAny(text, name, opts);
      store.addMany(r.observations);
      showReport(r.report, extra.box);
      renderSummary();
      if (o.onChange) o.onChange();
      return r;
    }

    function showReport(rep, target) {
      const box = target || $('#impReport');
      const ok = !(rep.errors && rep.errors.length);
      const d = el('details.report', { open: true });
      const tr = rep.timeRange && rep.timeRange.start !== null && rep.timeRange.start !== undefined
        ? new Date(rep.timeRange.start).toLocaleString() + ' → ' + new Date(rep.timeRange.end).toLocaleString() : '';
      d.append(el('summary', null, el('b', { text: rep.file }), ' ',
        ok ? el('span.ok', { text: rep.accepted + ' values imported' }) : el('span.err', { text: 'not imported' })));
      const ul = el('ul');
      const li = t => ul.append(el('li', { text: t }));
      for (const e of rep.errors || []) ul.append(el('li.err', { text: e }));
      if (ok) {
        li('Format: ' + rep.format + (rep.mapping ? ' (' + rep.mapping.format + ' table)' : '') + '; rows read: ' + rep.rowsRead);
        if (rep.mapping) {
          li('Timestamp column: ' + (rep.mapping.timestamp || '?'));
          li('Columns mapped: ' + (rep.mapping.columns || []).map(c => c.column + ' → ' + c.param + (c.unit ? ' [' + c.unit + ']' : '')).join(', '));
          if (rep.mapping.ignored && rep.mapping.ignored.length) li('Columns ignored: ' + rep.mapping.ignored.join(', '));
        }
        li('Parameters: ' + (rep.params || []).join(', ') + (tr ? '; time range ' + tr : ''));
        li('Accepted ' + rep.accepted + ', missing ' + rep.missing + ', empty cells ' + rep.empty + ', duplicates removed ' + rep.duplicates + ', invalid ' + (rep.invalid || []).length);
        if (rep.naiveTimestamps) li(rep.naiveTimestamps + ' timestamps had no time zone; read as "' + ($('#impTz').value.trim() || 'local') + '".');
        for (const c of rep.conflicts || []) ul.append(el('li.warn', { text: 'Conflict ' + c.param + ' at ' + new Date(c.time).toISOString() + ': kept ' + c.kept + ', dropped ' + c.dropped + ' (lines ' + c.lines.join(', ') + ')' }));
        for (const w of rep.warnings || []) ul.append(el('li.warn', { text: w }));
      }
      d.append(ul);
      if (rep.invalid && rep.invalid.length) {
        d.append(el('div.table-wrap', null, el('table', null,
          el('thead', null, el('tr', null, el('th', { text: 'Line' }), el('th', { text: 'Column' }), el('th', { text: 'Reason' }))),
          el('tbody', null, rep.invalid.slice(0, 200).map(x => el('tr', null, el('td.num', { text: x.line }), el('td', { text: x.column || '' }), el('td', { text: x.reason })))))));
        if (rep.invalid.length > 200) d.append(el('p.muted', { text: (rep.invalid.length - 200) + ' more invalid rows not shown' }));
      }
      box.prepend(d);
    }

    $('#btnClearImported').addEventListener('click', () => { store.clear('imported'); renderSummary(); if (o.onChange) o.onChange(); });

    // ---------------------------------------------------------- manual entry
    const mParam = $('#mParam'), mUnit = $('#mUnit');
    for (const p of MANUAL_PARAMS) mParam.append(el('option', { value: p, text: U.PARAMS[p].label }));
    const fillUnits = () => {
      mUnit.textContent = '';
      for (const u of UNIT_CHOICES[mParam.value] || [U.PARAMS[mParam.value].unit]) mUnit.append(el('option', { value: u, text: u }));
    };
    mParam.addEventListener('change', fillUnits);
    fillUnits();
    const nowLocal = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 19); };
    $('#mTime').value = nowLocal();
    $('#manualForm').addEventListener('submit', e => {
      e.preventDefault();
      const msg = $('#mMsg'); msg.textContent = '';
      const r = PM.importer.manualEntry({ param: mParam.value, value: $('#mValue').value.replace(',', '.'), unit: mUnit.value,
        timestamp: $('#mTime').value || nowLocal(), timezone: 'local', note: $('#mNote').value.trim(), device: $('#mDevice').value.trim() });
      if (r.error) { msg.append(el('span.err', { text: r.error })); return; }
      store.add(r.observation);
      msg.append(el('span.ok', { text: 'Added ' + U.PARAMS[r.observation.param].label + ' ' + fmt(r.observation.value, 1) + ' ' + r.observation.unit + ' (source: user)' }));
      $('#mValue').value = '';
      renderSummary();
      if (o.onChange) o.onChange();
    });

    // ---------------------------------------------------------- export
    const expBox = $('#expSources');
    const expChecks = {};
    for (const s of SOURCES) {
      const c = el('input', { type: 'checkbox', checked: true });
      expChecks[s] = c;
      expBox.append(el('label.inline', null, c, ' ', el('span.badge.' + s, { text: s })));
    }
    const chosen = () => store.all().filter(x => expChecks[x.source].checked);
    $('#btnExpCsv').addEventListener('click', () => download('pm-sim-observations-' + stamp() + '.csv', toCSV(chosen()), 'text/csv'));
    $('#btnExpJson').addEventListener('click', () => download('pm-sim-observations-' + stamp() + '.json',
      toJSON(chosen(), { notice: 'Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.' }), 'application/json'));
    $('#btnExpWave').addEventListener('click', () => download('pm-sim-waveforms-' + stamp() + '.csv', waveCSV(o.getEngine(), 10), 'text/csv'));

    // ---------------------------------------------------------- summary
    function renderSummary() {
      const box = $('#storeSummary'); box.textContent = '';
      const rows = [];
      for (const s of store.sources()) for (const p of store.params(s)) {
        const list = store.get(s, p), st = summary(list), last = list[list.length - 1];
        rows.push(el('tr', null, el('td', null, el('span.badge.' + s, { text: s })), el('td', { text: p }),
          el('td.num', { text: st.n }), el('td.num', { text: st.missing }), el('td.num', { text: fmt(st.mean, 1) }),
          el('td.num', { text: fmt(st.min, 1) + '–' + fmt(st.max, 1) }), el('td', { text: last ? new Date(ObservationStore.timeOf(last)).toLocaleTimeString() : '' })));
      }
      if (!rows.length) { box.append(el('p.muted', { text: 'Nothing stored yet' })); return; }
      box.append(el('table', null, el('thead', null, el('tr', null, ['Source', 'Param', 'n', 'missing', 'mean', 'range', 'latest'].map(h => el('th', { text: h })))),
        el('tbody', null, rows)));
    }
    renderSummary();
    return { renderSummary, importOne, showReport };
  }

  /** Last `seconds` of every waveform, long format. NaN (no signal) is written as an empty cell, never 0. */
  function waveCSV(engine, seconds) {
    const E = PM.engine;
    const ch = [['ecg', engine.ecgS, engine.ecgS.fs, 'mV'], ['pleth', engine.plethS, E.PPG_FS, 'a.u.'],
      ['resp', engine.respS, E.RESP_FS, 'a.u.'], ['cuff', engine.cuffS, E.CUFF_FS, 'mmHg']];
    const out = ['# Educational simulation only. Simulated waveforms; not clinical data.', 'channel,fs_hz,sim_time_s,value,unit'];
    for (const [name, ring, fs, unit] of ch) {
      const n = Math.min(ring.total, ring.cap, Math.round(seconds * fs));
      const arr = ring.last(n);
      for (let j = 0; j < n; j++) {
        const v = arr[j];
        out.push(name + ',' + fs + ',' + (engine.t - (n - 1 - j) / fs).toFixed(4) + ',' + (Number.isFinite(v) ? v.toFixed(5) : '') + ',' + unit);
      }
    }
    return out.join('\n') + '\n';
  }

  PM.dataPanel = { init, waveCSV };
})(this);
