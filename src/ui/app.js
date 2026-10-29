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
    art: new SV($('#cvArt'), { ring: () => engine.artS, fs: () => E.ART_FS, color: cssVar('--art') || '#ff5a5a', scale: 'optimum', unit: 'mmHg', label: $('.wave[data-ch="art"] .wave-scale') }),
    co2: new SV($('#cvCo2'), { ring: () => engine.capS, fs: () => E.CAP_FS, color: cssVar('--co2') || '#e6e6e6', scale: [0, 60], ticks: [0, 20, 40] }),
    cuff: new SV($('#cvCuff'), { ring: () => engine.cuffS, fs: () => E.CUFF_FS, color: cssVar('--cuff') || '#ff9de2', scale: [0, 300], ticks: [0, 50, 100, 150, 200, 250] }),
  };
  $$('.wave[data-ch="resp"] .wave-scale, .wave[data-ch="co2"] .wave-scale, .wave[data-ch="cuff"] .wave-scale').forEach(s => { s.textContent += ' · ' + SLOW_SWEEP + ' mm/s'; });

  const cuffScale = $('.wave[data-ch="cuff"] .wave-scale'), cuffLive = cuffScale.textContent;
  const setText = (node, s) => { if (node.textContent !== s) node.textContent = s; };
  const ago = s => s < 90 ? Math.round(s) + ' s ago' : Math.round(s / 60) + ' min ago';
  /** Between measurements (cuff empty) the cuff strip shows the last whole cycle instead of a flat line. */
  function cuffCycleRow() {
    const n = engine.nibp;
    if (n.state === 'inflating' || n.state === 'deflating' || n.cuff > 0) return null;
    for (let i = nibpRows.length - 1; i >= 0; i--) {
      if (nibpRows[i].res.cancelled) continue;
      return nibpRows[i].res.trace ? nibpRows[i] : null;
    }
    return null;
  }
  function drawCuff() {
    const row = cuffCycleRow();
    if (!row) { views.cuff.draw(engine.t, SLOW_SWEEP); setText(cuffScale, cuffLive); return; }
    PM.trends.drawCuffCycle($('#cvCuff'), { res: row.res, art: row.art, set: row.set, truthMap: row.truthMap,
      color: cssVar('--cuff') || '#ff9de2', artColor: cssVar('--art') || '#ff5a5a' });
    setText(cuffScale, 'last NIBP cycle, ' + ago(engine.t - row.t) + ' (simulated time)');
  }

  function drawWaves() {
    const sw = engine.p.sweep;
    views.ecg.draw(engine.t, sw, engine.p.ecg_gain);
    views.pleth.draw(engine.t, sw);
    views.art.draw(engine.t, sw);
    views.resp.draw(engine.t, SLOW_SWEEP);
    views.co2.draw(engine.t, SLOW_SWEEP);
    drawCuff();
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
    const f = engine.lastFrame; // arterial-line reading and model MAP at the moment of the result, for comparison
    nibpRows.push({ t, res, set: { sbp: engine.p.sbp, dbp: engine.p.dbp }, art: f && f.est ? f.est.art : null, truthMap: f ? f.truth.map : null });
    if (nibpRows.length > 500) nibpRows.shift();
    PM.panels.renderNibpTable($('#nibpTable tbody'), nibpRows);
    drawOsc();
  };
  const drawOsc = () => {
    const last = nibpRows.slice().reverse().find(r => !r.res.cancelled);
    PM.trends.drawOscillogram($('#cvOsc'), last ? last.res : null, engine.p.nibp_ks, engine.p.nibp_kd);
  };

  // ------------------------------------------------------------- tiles
  const limText = param => {
    const L = alarms.limits[param];
    if (!L || !L.enabled) return 'alarm off';
    // Plain alarm band: "alarm 50–120", or one side only ("alarm < 90") when the other limit is off.
    if (L.low === null && L.high === null) return 'alarm off';
    if (L.high === null) return 'alarm < ' + L.low;
    if (L.low === null) return 'alarm > ' + L.high;
    return 'alarm ' + L.low + '–' + L.high;
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

  // Patient banner on the monitor: profile numbers that matter at the bedside.
  function updateBanner() {
    const p = engine.p, P = PM.profile, fm = PM.panels.formulas;
    setTxt('#bPt', p.age_years + ' y' + (p.sex ? ' ' + p.sex : '') + ' · ' + p.height_cm + ' cm · ' + p.weight_kg + ' kg');
    const b = P.bmi(p.weight_kg, p.height_cm), cat = P.bmiCategory(b, p.age_years);
    setTxt('#bBmi', b === null ? '--' : b.toFixed(1)); setTxt('#bBmiCat', cat.category || 'no adult category under 20 y');
    const bsa = P.bsa(p.weight_kg, p.height_cm, fm.bsa);
    setTxt('#bBsa', bsa === null ? '--' : bsa.toFixed(2)); setTxt('#bBsaF', P.formulaInfo('bsa', fm.bsa).name);
    const bp = P.bpForAge(p.age_years, p.sex);
    setTxt('#bBpAge', bp ? bp.sbp + '/' + bp.dbp : 'adults only');
    const hm = P.hrMax(p.age_years, fm.hrmax);
    setTxt('#bHrMax', hm === null ? '--' : Math.round(hm) + ' /min'); setTxt('#bHrMaxF', P.formulaInfo('hrmax', fm.hrmax).name);
  }

  function updateTiles(f) {
    const est = f.est, tr = f.truth;
    setTxt('#vHr', fmt(est.hr)); setTxt('#sHr', f.technical.ecgLeadsOff ? 'leads off' : 'set ' + tr.hr); setTxt('#lHr', limText('hr'));
    setTxt('#vRhythm', est.rhythmLabel || '--'); setTxt('#vPvc', fmt(est.pvcPerMin));
    // QT of the model's last supraventricular beat and its QTc by the chosen formula
    const fm = PM.panels.formulas, q = f.technical.ecgLeadsOff ? null : tr.qt;
    const qtc = q ? PM.profile.qtc(q.qt * 1000, q.rr, fm.qtc) : null;
    setTxt('#vQt', q ? String(Math.round(q.qt * 1000)) : '--'); setTxt('#vQtc', qtc === null ? '--' : String(Math.round(qtc)));
    setTxt('#vQtcF', PM.profile.formulaInfo('qtc', fm.qtc).name);

    setTxt('#vSpo2', fmt(est.spo2)); setTxt('#vPr', fmt(est.pr)); setTxt('#vPi', fmt(est.pi, 1)); setTxt('#vSqi', fmt(est.sqi));
    setTxt('#sSpo2', est.spo2Status !== 'ok' ? est.spo2Status : 'set ' + tr.spo2); setTxt('#lSpo2', limText('spo2'));
    $('#sqiBar').style.width = (Number.isFinite(est.sqi) ? Math.max(0, Math.min(100, est.sqi)) : 0) + '%';

    const n = f.nibp;
    setTxt('#nibpState', n.state + (n.state === 'inflating' || n.state === 'deflating' ? ' ' + fmt(n.cuff) + ' mmHg' : '') + (n.msg && n.state === 'failed' ? ': ' + n.msg : ''));
    const lastOk = nibpRows.slice().reverse().find(r => !r.res.error);
    if (lastOk) {
      const x = lastOk.res, age = f.t - lastOk.t;
      setTxt('#vNibp', fmt(x.sbp) + '/' + fmt(x.dbp)); setTxt('#vMap', fmt(fm.map === 'formula' ? x.map : x.mapOsc));
      setTxt('#vMapOsc', fmt(x.mapOsc)); setTxt('#vMapF', fmt(x.map)); setTxt('#vPp', fmt(x.pp));
      setTxt('#nibpAge', age < 60 ? Math.round(age) + ' s ago' : Math.round(age / 60) + ' min ago');
      $('#tNibp .t-val').classList.toggle('stale', age > engine.p.nibp_interval * 60 + 60 || engine.p.nibp_interval === 0 && age > 900);
    }
    setTxt('#sNibp', 'set ' + tr.sbp + '/' + tr.dbp);
    updateBanner();
    // Shock index from the displayed HR and the last good NIBP systolic.
    const siRow = $('#siRow');
    siRow.hidden = !PM.panels.useCases.si;
    if (!siRow.hidden) {
      const hr = f.technical.ecgLeadsOff ? null : est.hr, sbp = lastOk ? lastOk.res.sbp : null;
      const si = PM.profile.shockIndex(hr, sbp);
      setTxt('#vSi', si === null ? '--' : si.toFixed(2));
      $('#vSi').classList.toggle('si-high', si !== null && si > PM.profile.SI_NORMAL.hi);
    }

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

  // Alarm tones (Web Audio), off by default. Burst patterns follow the IEC 60601-1-8
  // timing tables: high = 10 pulses (3+2, pause, 3+2), pulse 150 ms, spacing 100 ms,
  // 350 ms after pulses 3 and 8, 600 ms after pulse 5, then 3.1 s until the next burst;
  // medium = 3 pulses of 200 ms (spacing 200 ms) every 7.5 s; low = 2 pulses every 16 s. Each
  // pulse has a 10–20 % rise/fall and a fundamental plus four harmonics (the standard asks
  // for ≥ 4 harmonics within ±15 dB). Timing approximates the standard; the sound is not
  // a certified alarm signal (loudness, masking and acoustic tests are not covered).
  let actx = null, nextBeep = 0, wave = null;
  $('#chkSound').addEventListener('change', e => {
    if (e.target.checked && !actx && root.AudioContext) actx = new root.AudioContext();
    if (actx && e.target.checked) actx.resume();
  });
  function beep(freq, at, dur) {
    if (!wave) wave = actx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.7, 0.55, 0.45, 0.35]));
    const o = actx.createOscillator(), g = actx.createGain(), edge = 0.15 * dur;
    o.setPeriodicWave(wave); o.frequency.value = freq;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.1, at + edge);
    g.gain.setValueAtTime(0.1, at + dur - edge); g.gain.linearRampToValueAtTime(0, at + dur);
    o.connect(g).connect(actx.destination); o.start(at); o.stop(at + dur + 0.01);
  }
  // pulse onsets (s) within one burst, pulse duration (s), burst repeat interval (ms)
  const BURSTS = {
    high: [[0, 0.25, 0.5, 1.0, 1.25, 2.0, 2.25, 2.5, 3.0, 3.25], 0.15, 523, 6500],
    medium: [[0, 0.4, 0.8], 0.2, 440, 7500],
    low: [[0, 0.4], 0.2, 330, 16000],
  };
  function sound(ts) {
    if (!actx || !$('#chkSound').checked || !running || !alarmState.audio || ts < nextBeep) return;
    const [onsets, dur, freq, gap] = BURSTS[alarmState.audio];
    for (const o of onsets) beep(freq, actx.currentTime + o, dur);
    nextBeep = ts + gap;
  }

  // ------------------------------------------------------------- controls & toolbar
  let dataPanel = null; // set once the Data tab is built (below)
  let profile = null;   // set once the Profile tab is built (below)
  let glucose = { draw() {} }; // replaced once the Glucose tab is built (below)
  // "Age and sex set typical blood pressure" (Profile tab switch): a hand edit of
  // age or sex also sets SBP/DBP to the NHANES mean for that age and sex. Scenarios
  // never pass through here, so their pressures stay as published.
  function setParamsByHand(update) {
    let note = null;
    if (PM.panels.useCases.ageBp && ('age_years' in update || 'sex' in update)) {
      const age = 'age_years' in update ? Number(update.age_years) : engine.p.age_years;
      const sex = 'sex' in update ? update.sex : engine.p.sex;
      const bp = PM.profile.bpForAge(age, sex);
      if (bp) {
        update = Object.assign({}, update, bp);
        note = 'Age ' + age + ' y, sex ' + sex + ': SBP/DBP set to ' + bp.sbp + '/' + bp.dbp +
          ' mmHg (US adult mean for this age, NHANES 2001–2008, interpolated; REFERENCES.md [78]).';
      }
    }
    return Object.assign(engine.setParams(update), { note });
  }
  const controls = PM.panels.buildControls($('#controls'), $('#controlMsgs'), update => {
    const r = setParamsByHand(update);
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
    apply: update => { const r = setParamsByHand(update); controls.sync(engine.p); afterParams(); return r; },
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
  PM.ecg12Panel.attach(engine);

  root.PM.app = { engine, alarms, store, showTab, setRunning, glucose: () => glucose };
  requestAnimationFrame(loop);
  if (/[?&]selftest=1\b/.test(root.location.search)) { showTab('tests'); PM.selftest.run(); }
})(this);
