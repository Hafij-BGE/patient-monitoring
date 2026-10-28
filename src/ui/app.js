/* Application wiring: creates the engine, alarm engine and observation store,
 * runs the display loop and connects the toolbar, tiles and tabs.
 * All physiology and signal processing lives in src/sim; this file only reads it. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, $$, el, fmt, canvasPng, download, stamp, cssVar } = PM.dom;
  const P = PM.params, E = PM.engine, U = PM.units;
  const EXTERNAL = ['device', 'imported', 'user'];

  const engine = new E.Engine(Object.assign({}, P.DEFAULTS));
  const alarms = new PM.alarms.AlarmEngine();
  const store = new PM.store.ObservationStore({ maxPerSeries: 20000 });
  const nibpRows = [];
  let running = true, frozen = false, lastTs = null, chainTs = 0, alarmState = alarms.state();

  // ------------------------------------------------------------- waveforms
  const SV = PM.waveforms.SweepView;
  const SLOW_SWEEP = 6.25; // mm/s for respiration and cuff pressure
  const views = {
    ecg: new SV($('#cvEcg'), { ring: () => engine.ecgS, fs: () => engine.ecgS.fs, color: cssVar('--ecg') || '#5ee07a', scale: 'ecg', grid: true }),
    pleth: new SV($('#cvPleth'), { ring: () => engine.plethS, fs: () => E.PPG_FS, color: cssVar('--pleth') || '#5ec8ff', scale: 'auto' }),
    resp: new SV($('#cvResp'), { ring: () => engine.respS, fs: () => E.RESP_FS, color: cssVar('--resp') || '#ffd36b', scale: 'auto' }),
    art: new SV($('#cvArt'), { ring: () => engine.artS, fs: () => E.ART_FS, color: cssVar('--art') || '#ff5a5a', scale: [0, 200] }),
    co2: new SV($('#cvCo2'), { ring: () => engine.capS, fs: () => E.CAP_FS, color: cssVar('--co2') || '#e6e6e6', scale: [0, 60] }),
    cuff: new SV($('#cvCuff'), { ring: () => engine.cuffS, fs: () => E.CUFF_FS, color: cssVar('--cuff') || '#ff9de2', scale: [0, 300] }),
  };
  $$('.wave[data-ch="resp"] .wave-scale, .wave[data-ch="co2"] .wave-scale, .wave[data-ch="cuff"] .wave-scale').forEach(s => { s.textContent += ' · ' + SLOW_SWEEP + ' mm/s'; });

  function drawWaves() {
    const sw = engine.p.sweep;
    views.ecg.draw(engine.t, sw, engine.p.ecg_gain);
    views.pleth.draw(engine.t, sw);
    views.art.draw(engine.t, sw);
    views.resp.draw(engine.t, SLOW_SWEEP);
    views.co2.draw(engine.t, SLOW_SWEEP);
    views.cuff.draw(engine.t, SLOW_SWEEP);
  }

  function loop(ts) {
    const dt = lastTs === null ? 0 : Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    if (running && dt > 0) engine.advance(dt * engine.p.speed);
    if (!frozen) drawWaves();
    if (!frozen && visible('chain') && ts - chainTs > 66) { chainTs = ts; chain.draw(); }
    sound(ts);
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------- frames
  engine.onFrame = f => {
    alarmState = alarms.evaluate(f);
    store.addMany(E.frameObservations(f));
    updateTiles(f);
    renderAlarms();
    applySeverity();
    if (visible('alarms')) PM.panels.renderAlarmHistory($('#alarmHistory tbody'), alarms.history);
    if (visible('trends') && !trendPaused && Math.floor(f.t) % 2 === 0) drawTrendNow();
    if (visible('glucose') && Math.floor(f.t) % 2 === 0) glucose.draw();
    $('#clock').textContent = 't = ' + f.t.toFixed(0) + ' s';
    if (Math.floor(f.t) % 5 === 0) refreshExt();
  };
  engine.onNibp = (res, t) => {
    nibpRows.push({ t, res, set: { sbp: engine.p.sbp, dbp: engine.p.dbp } });
    if (nibpRows.length > 500) nibpRows.shift();
    PM.panels.renderNibpTable($('#nibpTable tbody'), nibpRows);
    drawOsc();
  };
  const drawOsc = () => {
    const last = nibpRows[nibpRows.length - 1];
    PM.trends.drawOscillogram($('#cvOsc'), last ? last.res : null, engine.p.nibp_ks, engine.p.nibp_kd);
  };

  // ------------------------------------------------------------- tiles
  const limText = param => {
    const L = alarms.limits[param];
    if (!L || !L.enabled) return 'alarm off';
    return (L.low === null ? '–' : L.low) + '…' + (L.high === null ? '–' : L.high);
  };
  const setTxt = (id, t) => { const n = $(id); if (n.textContent !== t) n.textContent = t; };

  /** Colours tiles and controls by the highest active alarm priority they concern. */
  const TILE_IDS = ['tHr', 'tSpo2', 'tNibp', 'tArt', 'tCo2', 'tRr', 'tTemp', 'tGlu'];
  function applySeverity() {
    const g = PM.severity.grade(alarmState.active);
    for (const id of TILE_IDS) {
      const tile = $('#' + id), s = g.tiles[id];
      for (const p of ['high', 'medium', 'low']) tile.classList.toggle('sev-' + p, !!s && s.sev === p);
      let issue = tile.querySelector('.t-issue');
      if (!issue) { issue = el('div.t-issue'); tile.append(issue); }
      const text = s ? s.messages.join(' · ') : '';
      if (issue.textContent !== text) issue.textContent = text;
    }
    controls.markSeverity(g.controls);
  }

  function updateTiles(f) {
    const est = f.est, tr = f.truth;
    setTxt('#vHr', fmt(est.hr)); setTxt('#sHr', f.technical.ecgLeadsOff ? 'leads off' : 'set ' + tr.hr); setTxt('#lHr', limText('hr'));
    setTxt('#vRhythm', est.rhythmLabel || '--'); setTxt('#vPvc', fmt(est.pvcPerMin));

    setTxt('#vSpo2', fmt(est.spo2)); setTxt('#vPr', fmt(est.pr)); setTxt('#vPi', fmt(est.pi, 1)); setTxt('#vSqi', fmt(est.sqi));
    setTxt('#sSpo2', est.spo2Status !== 'ok' ? est.spo2Status : 'set ' + tr.spo2); setTxt('#lSpo2', limText('spo2'));
    $('#sqiBar').style.width = (Number.isFinite(est.sqi) ? Math.max(0, Math.min(100, est.sqi)) : 0) + '%';

    const n = f.nibp;
    setTxt('#nibpState', n.state + (n.state === 'inflating' || n.state === 'deflating' ? ' ' + fmt(n.cuff) + ' mmHg' : '') + (n.msg && n.state === 'failed' ? ': ' + n.msg : ''));
    const lastOk = nibpRows.slice().reverse().find(r => !r.res.error);
    if (lastOk) {
      const x = lastOk.res, age = f.t - lastOk.t;
      setTxt('#vNibp', fmt(x.sbp) + '/' + fmt(x.dbp)); setTxt('#vMap', fmt(x.mapOsc));
      setTxt('#vMapOsc', fmt(x.mapOsc)); setTxt('#vMapF', fmt(x.map)); setTxt('#vPp', fmt(x.pp));
      setTxt('#nibpAge', age < 60 ? Math.round(age) + ' s ago' : Math.round(age / 60) + ' min ago');
      $('#tNibp .t-val').classList.toggle('stale', age > engine.p.nibp_interval * 60 + 60 || engine.p.nibp_interval === 0 && age > 900);
    }
    setTxt('#sNibp', 'set ' + tr.sbp + '/' + tr.dbp);

    const a = est.art;
    setTxt('#vArt', a ? fmt(a.sys) + '/' + fmt(a.dia) : '--/--'); setTxt('#vArtMap', a ? fmt(a.map) : '--');
    setTxt('#sArt', f.technical.artNoPulse ? 'no pulse (line open?)' : 'set ' + tr.sbp + '/' + tr.dbp);
    setTxt('#lArt', 'SYS ' + limText('art_sys'));

    setTxt('#vEtco2', fmt(est.etco2)); setTxt('#vFico2', fmt(est.fico2)); setTxt('#vAwrr', fmt(est.awrr));
    setTxt('#sEtco2', f.technical.capnoNoSignal ? 'no CO₂ signal' : tr.etco2 === null ? '' : 'set ' + Math.round(tr.etco2));
    setTxt('#lEtco2', limText('etco2'));

    setTxt('#vRr', est.apnea ? 'APNEA' : fmt(est.rr)); setTxt('#sRr', 'set ' + tr.rr); setTxt('#lRr', limText('rr'));

    setTxt('#vTemp', fmt(est.temp, 1)); setTxt('#sTemp', est.tempStatus !== 'ok' ? 'probe ' + est.tempStatus : 'set ' + tr.temp.toFixed(1)); setTxt('#lTemp', limText('temp'));

    // Glucose is a model value (no sensor model): shown with its model clock.
    setTxt('#vGlu', fmt(est.glucose)); setTxt('#vGluMmol', fmt(PM.glucose.toMmol(est.glucose), 1)); setTxt('#vIns', fmt(est.insulin, 1));
    setTxt('#sGlu', engine.p.diabetes === 'none' ? 'no diabetes' : engine.p.diabetes.replace('type', 'type ')); setTxt('#lGlu', limText('glucose'));
    const gm = est.gluMin;
    setTxt('#vGluClock', 'model ' + Math.floor(gm / 60) + ' h ' + String(Math.floor(gm % 60)).padStart(2, '0') + ' min');
  }

  /** Latest value per external source and parameter. Never merged with simulated data. */
  function refreshExt() {
    const byTime = (a, b) => PM.store.ObservationStore.timeOf(b) - PM.store.ObservationStore.timeOf(a);
    const rows = [];
    for (const s of EXTERNAL) { // newest 3 per source so one busy source cannot hide the others
      const latest = store.params(s).map(p => store.latest(s, p)).filter(Boolean).sort(byTime);
      rows.push(...latest.slice(0, 3));
    }
    rows.sort(byTime);
    const box = $('#extList'); box.textContent = '';
    if (!rows.length) { box.append(el('span.muted', { text: 'No device, imported or manual data yet' })); return; }
    for (const o of rows) {
      const P0 = U.PARAMS[o.param] || { label: o.param, unit: o.unit };
      const age = (Date.now() - PM.store.ObservationStore.timeOf(o)) / 1000;
      const ageTxt = age < 0 ? 'future time' : age < 90 ? Math.round(age) + ' s ago' : age < 5400 ? Math.round(age / 60) + ' min ago' : age < 172800 ? Math.round(age / 3600) + ' h ago' : Math.round(age / 86400) + ' d ago';
      box.append(el('div.ext-row', null,
        el('span.badge.' + o.source, { text: o.source }),
        o.provenance && o.provenance.replay ? el('span.badge.replay', { text: 'SYNTHETIC' }) : null,
        el('span', { text: P0.label + ' ' }), el('b', { text: o.value === null ? '--' : fmt(o.value, Number.isInteger(o.value) ? undefined : 1) }),
        el('span', { text: ' ' + o.unit }), o.quality !== 'ok' ? el('span.badge.q', { text: o.quality }) : null,
        el('span.age', { text: ageTxt })));
    }
  }

  // ------------------------------------------------------------- alarms
  function renderAlarms() {
    PM.panels.renderAlarmBar($('#alarmList'), alarmState, id => { alarms.acknowledge(id); alarmState = alarms.state(); renderAlarms(); });
    const m = $('#btnMute'), r = alarmState.muteRemaining;
    m.textContent = alarmState.muted ? 'Audio paused ' + Math.floor(r / 60) + ':' + String(Math.floor(r % 60)).padStart(2, '0') + ' (resume)' : 'Audio pause 2 min';
    m.setAttribute('aria-pressed', alarmState.muted ? 'true' : 'false');
  }
  $('#btnAckAll').addEventListener('click', () => { alarms.acknowledgeAll(); alarmState = alarms.state(); renderAlarms(); });
  $('#btnMute').addEventListener('click', () => { if (alarmState.muted) alarms.unmute(); else alarms.mute(120); alarmState = alarms.state(); renderAlarms(); });
  $('#alarmNotice').textContent = PM.alarms.NOTICE + ' Limits, delays and priorities below are illustrative.';
  const limits = PM.panels.buildLimits($('#limitTable tbody'), alarms, $('#limitMsg'), () => engine.lastFrame && updateTiles(engine.lastFrame));
  $('#btnLimitsDefault').addEventListener('click', () => { alarms.restoreDefaultLimits(); limits.render(); $('#limitMsg').textContent = 'Default limits restored.'; });
  $('#btnAlarmCsv').addEventListener('click', () => download('pm-sim-alarm-history-' + stamp() + '.csv', PM.alarms.historyCSV(alarms.history), 'text/csv'));
  $('#btnAlarmClear').addEventListener('click', () => { alarms.history.length = 0; PM.panels.renderAlarmHistory($('#alarmHistory tbody'), alarms.history); });

  // Illustrative tones (Web Audio). Off by default; not a standards-compliant alarm sound.
  let actx = null, nextBeep = 0;
  $('#chkSound').addEventListener('change', e => {
    if (e.target.checked && !actx && root.AudioContext) actx = new root.AudioContext();
    if (actx && e.target.checked) actx.resume();
  });
  function beep(freq, at) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.12, at + 0.02); g.gain.linearRampToValueAtTime(0, at + 0.14);
    o.connect(g).connect(actx.destination); o.start(at); o.stop(at + 0.16);
  }
  function sound(ts) {
    if (!actx || !$('#chkSound').checked || !running || !alarmState.audio || ts < nextBeep) return;
    const [freq, n, gap] = { high: [880, 3, 1500], medium: [660, 2, 3000], low: [440, 1, 8000] }[alarmState.audio];
    for (let i = 0; i < n; i++) beep(freq, actx.currentTime + i * 0.2);
    nextBeep = ts + gap;
  }

  // ------------------------------------------------------------- controls & toolbar
  let dataPanel = null; // set once the Data tab is built (below)
  let profile = null;   // set once the Profile tab is built (below)
  let glucose = { draw() {} }; // replaced once the Glucose tab is built (below)
  const controls = PM.panels.buildControls($('#controls'), $('#controlMsgs'), update => {
    const r = engine.setParams(update);
    afterParams();
    return r;
  });
  // The scenario select names the preset the patient and sensor settings match, or
  // "Custom" once any of them was edited by hand (display settings do not count).
  function syncScenario() {
    const sel = $('#selPreset');
    sel.value = P.matchPreset(engine.p, sel.value);
  }
  function afterParams() {
    syncScenario();
    if (profile) profile.refresh(engine.p);
    $('#selSpeed').value = String(engine.p.speed);
    $('#ecgScale').textContent = engine.p.sweep + ' mm/s · ' + engine.p.ecg_gain + ' mm/mV';
  }
  for (const s of P.SPEC.speed.options) $('#selSpeed').append(el('option', { value: String(s), text: s + '×' }));
  $('#selSpeed').addEventListener('change', e => { engine.setParams({ speed: e.target.value }); controls.sync(engine.p); afterParams(); });
  for (const p of P.PRESETS) $('#selPreset').append(el('option', { value: p.id, text: p.name }));
  $('#selPreset').append(el('option', { value: 'custom', text: 'Custom (edited)', disabled: true }));
  $('#selPreset').addEventListener('change', e => {
    if (e.target.value === 'custom') return;
    const r = P.applyPreset(e.target.value, engine.p);
    const s = engine.setParams(r.params);
    controls.sync(engine.p);
    engine.startNibp(); // a fresh cuff reading for the new scenario
    controls.showMsgs({ errors: s.errors, warnings: s.warnings });
    $('#controlMsgs').prepend(el('div.ok', { text: 'Scenario "' + r.preset.name + '" applied' + (r.changed.length ? '. Changed: ' + r.changed.map(k => P.SPEC[k].label).join(', ') + '.' : ' (all patient and sensor settings at default).') }));
    if (r.preset.note) $('#controlMsgs').prepend(el('div.ok', { text: r.preset.note + ' References: ' + r.preset.refs.map(n => '[' + n + ']').join(' ') + ' in REFERENCES.md. Illustrative pattern for education only; real presentations vary and values are not diagnostic.' }));
    afterParams();
  });

  function setRunning(on) {
    running = on;
    $('#btnRun').textContent = on ? 'Pause' : 'Run';
    $('#btnRun').setAttribute('aria-pressed', on ? 'false' : 'true');
    if (!on) $('#clock').textContent = 't = ' + engine.t.toFixed(0) + ' s (paused)';
  }
  $('#btnRun').addEventListener('click', () => setRunning(!running));
  $('#btnReset').addEventListener('click', () => {
    engine.reset(Object.assign({}, P.DEFAULTS));
    alarms.reset();
    alarms.restoreDefaultLimits();
    alarmState = alarms.state();
    store.clear('simulated'); store.clear('derived');
    nibpRows.length = 0;
    views.pleth.lo = views.resp.lo = null;
    $('#selPreset').value = 'baseline';
    controls.sync(engine.p);
    engine.startNibp();
    $('#controlMsgs').textContent = '';
    $('#controlMsgs').append(el('div.ok', { text: 'Reset: simulation, alarms, alarm limits and simulated data are back to defaults. Imported, device and manual data are kept.' }));
    limits.render();
    PM.panels.renderNibpTable($('#nibpTable tbody'), nibpRows);
    PM.panels.renderAlarmHistory($('#alarmHistory tbody'), alarms.history);
    renderAlarms(); drawOsc(); afterParams();
    for (const id of ['#vHr', '#vSpo2', '#vPr', '#vPi', '#vSqi', '#vMap', '#vMapOsc', '#vMapF', '#vPp', '#vRr', '#vTemp',
      '#vRhythm', '#vPvc', '#vArtMap', '#vEtco2', '#vFico2', '#vAwrr', '#vGlu', '#vGluMmol', '#vIns']) $(id).textContent = '--';
    $('#vNibp').textContent = '--/--'; $('#vArt').textContent = '--/--'; $('#nibpAge').textContent = '';
    setRunning(true);
  });
  $('#btnFreeze').addEventListener('click', () => {
    frozen = !frozen;
    $('#btnFreeze').setAttribute('aria-pressed', String(frozen));
    $('#btnFreeze').textContent = frozen ? 'Unfreeze display' : 'Freeze display';
  });
  $('#btnPng').addEventListener('click', snapshot);
  $('#btnNibp').addEventListener('click', () => engine.startNibp());
  $('#btnNibpStop').addEventListener('click', () => engine.cancelNibp());

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.repeat) return;
    if (e.target.closest && e.target.closest('input, select, textarea, button, summary, a')) return;
    e.preventDefault();
    setRunning(!running);
  });

  /** PNG of the four waveforms plus the current numbers and the notice. */
  function snapshot() {
    const cvs = ['#cvEcg', '#cvPleth', '#cvArt', '#cvResp', '#cvCo2', '#cvCuff'].map(id => $(id));
    const dpr = root.devicePixelRatio || 1, head = Math.round(64 * dpr);
    const w = Math.max(...cvs.map(c => c.width)), h = head + cvs.reduce((s, c) => s + c.height, 0);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const g = out.getContext('2d');
    g.fillStyle = '#0b0f14'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2e8f0'; g.font = Math.round(14 * dpr) + 'px system-ui, sans-serif';
    const f = engine.lastFrame;
    const txt = f ? 'PM-SIM  t = ' + f.t.toFixed(0) + ' s   HR ' + fmt(f.est.hr) + '   SpO2 ' + fmt(f.est.spo2) + ' %   NIBP ' + $('#vNibp').textContent + '   ART ' + $('#vArt').textContent + '   RR ' + $('#vRr').textContent + '   EtCO2 ' + fmt(f.est.etco2) + '   Temp ' + fmt(f.est.temp, 1) + ' °C' : 'PM-SIM';
    g.fillText(txt, 10 * dpr, 24 * dpr);
    g.fillStyle = '#fbbf24'; g.font = Math.round(12 * dpr) + 'px system-ui, sans-serif';
    g.fillText('Educational simulation only. Simulated values are not clinical data. ' + new Date().toISOString(), 10 * dpr, 48 * dpr);
    let y = head;
    for (const c of cvs) { g.drawImage(c, 0, y); y += c.height; }
    canvasPng(out, 'pm-sim-monitor-' + stamp() + '.png');
  }

  // ------------------------------------------------------------- signal chain
  // Probe points cost a few ring-buffer pushes per sample; always on so the plots
  // already hold the last 12 s when the tab opens.
  engine.enableTaps(true);
  const chain = PM.chainPanel.init({ getEngine: () => engine });

  // ------------------------------------------------------------- lessons
  PM.lessonsPanel.init({
    applyPreset: id => { $('#selPreset').value = id; $('#selPreset').dispatchEvent(new Event('change')); },
    setParams: update => {
      const r = engine.setParams(update);
      controls.sync(engine.p);
      controls.showMsgs({ errors: r.errors, warnings: r.warnings });
      afterParams();
    },
    showTab,
    tabLabel: name => $('#tabs [data-tab="' + name + '"]').textContent,
  });

  // ------------------------------------------------------------- tabs
  const visible = name => !$('section.panel[data-panel="' + name + '"]').hidden;
  function showTab(name) {
    $$('#tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('section.panel').forEach(s => { s.hidden = s.dataset.panel !== name; });
    if (name === 'nibp') drawOsc();
    if (name === 'trends') drawTrendNow();
    if (name === 'alarms') PM.panels.renderAlarmHistory($('#alarmHistory tbody'), alarms.history);
    if (name === 'data' && dataPanel) dataPanel.renderSummary();
    if (name === 'chain') chain.draw();
    if (name === 'glucose') glucose.draw();
  }
  $$('#tabs [role=tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ------------------------------------------------------------- trends
  let trendPaused = false, lastTrend = null;
  const TREND_PARAMS = ['hr', 'pr', 'spo2', 'spo2_sqi', 'pi', 'sbp', 'dbp', 'map', 'pp', 'art_sys', 'art_dia', 'art_map', 'rr', 'etco2', 'temp', 'glucose', 'insulin', 'weight', 'bmi', 'bsa', 'steps'];
  for (const p of TREND_PARAMS) $('#trParam').append(el('option', { value: p, text: U.PARAMS[p].label + ' (' + U.PARAMS[p].unit + ')' }));
  const trChecks = {};
  for (const s of Object.values(PM.observation.SOURCE)) {
    trChecks[s] = el('input', { type: 'checkbox', checked: true });
    trChecks[s].addEventListener('change', drawTrendNow);
    $('#trSources').append(el('label.inline', null, trChecks[s], ' ', el('span.badge.' + s, { text: s })));
  }
  $('#trParam').addEventListener('change', drawTrendNow);
  $('#trWindow').addEventListener('change', drawTrendNow);
  $('#trPause').addEventListener('click', () => {
    trendPaused = !trendPaused;
    $('#trPause').textContent = trendPaused ? 'Resume trend' : 'Pause trend';
    $('#trPause').setAttribute('aria-pressed', String(trendPaused));
  });
  $('#trPng').addEventListener('click', () => canvasPng($('#cvTrend'), 'pm-sim-trend-' + $('#trParam').value + '-' + stamp() + '.png'));
  $('#trCsv').addEventListener('click', () => {
    const list = lastTrend ? lastTrend.series.flatMap(s => s.values) : [];
    download('pm-sim-trend-' + $('#trParam').value + '-' + stamp() + '.csv', PM.store.toCSV(list), 'text/csv');
  });

  function drawTrendNow() {
    const param = $('#trParam').value, win = $('#trWindow').value;
    const sources = Object.keys(trChecks).filter(s => trChecks[s].checked);
    let t0 = null, t1 = null;
    if (win !== 'fit') {
      const ends = sources.map(s => store.latest(s, param)).filter(Boolean).map(PM.store.ObservationStore.timeOf);
      t1 = Math.max(Date.now(), ...ends);
      t0 = t1 - Number(win) * 1000;
    }
    lastTrend = PM.trends.drawTrend($('#cvTrend'), { store, param, sources, t0, t1, unit: U.PARAMS[param].unit, label: U.PARAMS[param].label });
    const box = $('#trStats'); box.textContent = '';
    for (const s of lastTrend.series) {
      const st = PM.store.summary(s.values);
      box.append(el('div', null, el('span.badge.' + s.source, { text: s.source }),
        ' n ' + st.n + ' · missing ' + st.missing + ' · mean ' + fmt(st.mean, 1) + ' · SD ' + fmt(st.sd, 1) + ' · min ' + fmt(st.min, 1) + ' · max ' + fmt(st.max, 1) + ' · gaps ' + s.gaps.length));
    }
  }

  // ------------------------------------------------------------- other panels
  profile = PM.panels.buildProfile({
    apply: update => { const r = engine.setParams(update); controls.sync(engine.p); afterParams(); return r; },
    onDerived: list => { store.addMany(list); refreshExt(); },
  });
  profile.refresh(engine.p);
  dataPanel = PM.dataPanel.init({ store, getEngine: () => engine, onChange: refreshExt });
  PM.androidPanel.init({ store, onChange: refreshExt });
  glucose = PM.glucosePanel.init({ getEngine: () => engine });
  $('#btnSelfTest').addEventListener('click', () => PM.selftest.run());

  // ------------------------------------------------------------- start
  controls.sync(engine.p);
  $('#selPreset').value = 'baseline';
  afterParams();
  engine.startNibp(); // first cuff reading at start-up; then every nibp_interval minutes
  renderAlarms();
  PM.panels.renderNibpTable($('#nibpTable tbody'), nibpRows);
  root.PM.app = { engine, alarms, store, showTab, setRunning, glucose: () => glucose };
  requestAnimationFrame(loop);
  if (/[?&]selftest=1\b/.test(root.location.search)) { showTab('tests'); PM.selftest.run(); }
})(this);
