/* Browser self-test: runs the core scenarios on fresh engine instances (the live
 * monitor is not touched) and fills the Tests tab. Results are also exposed as
 * window.__TEST_RESULTS__ for automated checks. Open index.html?selftest=1 to run on load.
 * Hardware tests are listed as "not run"; they are never marked passed. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, el, fmt } = PM.dom;

  function sim(params, seconds, opts) {
    const e = new PM.engine.Engine(params);
    const a = opts && opts.alarms ? new PM.alarms.AlarmEngine() : null;
    let nibp = null, st = null;
    e.onNibp = r => { nibp = r; };
    if (a) e.onFrame = f => { st = a.evaluate(f); };
    if (opts && opts.nibp) e.startNibp();
    e.advance(seconds);
    return { e, f: e.lastFrame, nibp, alarms: a, st };
  }
  const near = (a, b, tol) => a !== null && Number.isFinite(a) && Math.abs(a - b) <= tol;
  const preset = id => PM.params.applyPreset(id, PM.params.DEFAULTS).params;

  const TESTS = [
    { name: 'Baseline: HR estimate follows the set heart rate', expected: 'HR within ±3 bpm of 72',
      run() { const r = sim(preset('baseline'), 20); return { pass: near(r.f.est.hr, 72, 3), observed: 'HR ' + fmt(r.f.est.hr, 1) + ' bpm' }; } },
    { name: 'Tachycardia preset', expected: 'HR within ±4 bpm of 135, HR high alarm active',
      run() { const r = sim(preset('tachy'), 25, { alarms: true }); const on = r.st.active.some(a => a.id === 'hr:high');
        return { pass: near(r.f.est.hr, 135, 4) && on, observed: 'HR ' + fmt(r.f.est.hr, 1) + ' bpm, hr:high ' + (on ? 'active' : 'not active') }; } },
    { name: 'Desaturation preset: SpO₂ from red/IR ratio', expected: 'SpO₂ within ±3 % of 84, SpO₂ low alarm active',
      run() { const r = sim(preset('desat'), 30, { alarms: true }); const on = r.st.active.some(a => a.id === 'spo2:low');
        return { pass: near(r.f.est.spo2, 84, 3) && on, observed: 'SpO₂ ' + fmt(r.f.est.spo2, 1) + ' %, SQI ' + fmt(r.f.est.sqi, 2) + ', spo2:low ' + (on ? 'active' : 'not active') }; } },
    { name: 'Sensor disconnected: missing is not zero', expected: 'SpO₂ value null, quality "missing", technical alarm, no SpO₂ low alarm',
      run() { const r = sim(preset('disconnect'), 15, { alarms: true });
        const o = PM.engine.frameObservations(r.f).find(x => x.param === 'spo2');
        const tech = r.st.active.some(a => a.kind === 'technical' && /spo2/i.test(a.id)), phys = r.st.active.some(a => a.id === 'spo2:low');
        return { pass: o && o.value === null && o.quality === 'missing' && tech && !phys,
          observed: 'value ' + (o ? String(o.value) : 'none') + ', quality ' + (o ? o.quality : '-') + ', technical ' + tech + ', spo2:low ' + phys }; } },
    { name: 'Oscillometric NIBP at baseline', expected: 'SYS/DIA within ±10 mmHg of 120/80; MAP formula = (SYS + 2·DIA)/3',
      run() { const r = sim(preset('baseline'), 70, { nibp: true }); const n = r.nibp;
        if (!n || n.error) return { pass: false, observed: n ? 'failed: ' + n.error : 'no result' };
        const mf = (n.sbp + 2 * n.dbp) / 3;
        return { pass: near(n.sbp, 120, 10) && near(n.dbp, 80, 10) && Math.abs(n.map - mf) < 1e-9,
          observed: fmt(n.sbp) + '/' + fmt(n.dbp) + ' mmHg, MAP osc. ' + fmt(n.mapOsc) + ', MAP formula ' + fmt(n.map, 1) }; } },
    { name: 'NIBP under heavy motion', expected: 'measurement fails with a technical alarm; no numbers reported',
      run() { const r = sim(preset('motion'), 120, { nibp: true }); const n = r.nibp;
        return { pass: !!(n && n.error) && r.f.technical.nibpFailed, observed: n ? (n.error ? 'failed: ' + n.error : fmt(n.sbp) + '/' + fmt(n.dbp)) : 'no result' }; } },
    { name: 'Apnea demonstration', expected: 'apnea flagged and apnea alarm active after the 20 s delay',
      run() { const r = sim(preset('apnea'), 30, { alarms: true }); const on = r.st.active.some(a => a.id === 'apnea');
        return { pass: r.f.est.apnea === true && on, observed: 'apnea ' + r.f.est.apnea + ', alarm ' + (on ? 'active' : 'not active') }; } },
    { name: 'Input validation: DIA above SYS', expected: 'rejected with an error, previous BP kept',
      run() { const v = PM.params.validate(PM.params.DEFAULTS, { dbp: 130 });
        return { pass: v.errors.length > 0 && v.params.dbp === 80, observed: v.errors.length ? v.errors[0].msg + '; DIA kept at ' + v.params.dbp : 'accepted' }; } },
    { name: 'Import with unit conversion', expected: '98.6 °F → 37.0 °C, 154 lb → 69.9 kg, empty cell stays missing',
      run() {
        const csv = 'timestamp,temp (°F),weight (lb),hr\n2026-01-01T08:00:00Z,98.6,154,\n';
        const r = PM.importer.importText(csv, 'selftest.csv', { timezone: 'UTC' });
        const g = p => r.observations.find(o => o.param === p);
        const t = g('temp'), w = g('weight'), h = g('hr');
        const ok = t && near(t.value, 37, 0.05) && w && near(w.value, 69.85, 0.05) && (!h || h.value === null);
        return { pass: !!ok, observed: 'temp ' + fmt(t && t.value, 2) + ' °C, weight ' + fmt(w && w.value, 2) + ' kg, hr ' + (h ? String(h.value) : 'not stored') };
      } },
    { name: 'BLE packet replay through the GATT parser', expected: 'truncated packet rejected; NaN temperature stored as missing; all replay values flagged synthetic',
      run() {
        const res = PM.replay.script().map(it => PM.replay.decode(it, Date.now()));
        const errs = res.filter(x => x.error).length, obs = res.flatMap(x => x.observations);
        const nanTemp = obs.some(o => o.param === 'temp' && o.value === null && o.quality === 'missing');
        const allSyn = obs.every(o => o.source === 'device' && o.provenance && !!o.provenance.replay);
        return { pass: errs >= 1 && nanTemp && allSyn, observed: res.length + ' packets, ' + errs + ' parse error(s), ' + obs.length + ' observations, NaN temp missing: ' + nanTemp };
      } },
    { name: 'Real BLE health device (hardware)', expected: 'live readings from a standard-profile device', hardware: true },
    { name: 'HL7 v2 ORU^R01 import (PCD-01 style)', expected: 'kPa and °F converted to mmHg and °C; empty OBX-5 stored as missing; identity segments not stored; values flagged synthetic',
      run() {
        const r = PM.hl7v2.importText(PM.samples.hl7(Date.now(), 'ICU^01^01'), { source: 'imported', file: 'selftest.hl7' });
        const obs = r.observations, last = p => obs.filter(o => o.param === p).pop();
        const sbp = last('sbp'), temp = last('temp'), rr = last('rr');
        const noId = obs.every(o => !JSON.stringify(o.provenance).includes('PID'));
        const ok = near(sbp && sbp.value, 123, 1) && near(temp && temp.value, 37.2, 0.1) && rr && rr.value === null && noId && obs.every(o => o.provenance.replay);
        return { pass: !!ok, observed: obs.length + ' observations; sbp ' + fmt(sbp && sbp.value, 1) + ' mmHg, temp ' + fmt(temp && temp.value, 2) + ' °C, rr ' + (rr && rr.value === null ? 'missing' : '?') };
      } },
    { name: 'HL7 bed filter and MLLP framing/ACK', expected: 'messages for another bed dropped; framed message recovered; ACK carries MSA|AA and the control ID',
      run() {
        const feed = PM.samples.feed({ count: 8, now: Date.now(), location: 'ICU^01^01', otherLocation: 'ICU^01^02' });
        let dropped = 0;
        for (const it of feed) { const p = PM.hl7v2.parseMessage(it.text); if (PM.hl7v2.toObservations(p, { source: 'device', acceptLocation: 'ICU^01^01' }).rejected) dropped++; }
        const d = PM.hl7v2.deframe('junk' + PM.hl7v2.frame(feed[0].text) + PM.hl7v2.VT + 'MSH|partial');
        const ack = PM.hl7v2.ack(PM.hl7v2.parseMessage(d.messages[0] || ''), 'AA');
        const ok = dropped === 2 && d.messages.length === 1 && d.rest.startsWith(PM.hl7v2.VT) && /MSA\|AA\|FEED0001/.test(ack);
        return { pass: ok, observed: dropped + ' of ' + feed.length + ' dropped; ' + d.messages.length + ' framed message(s); ACK ' + (ack.match(/MSA\|[^\r]*/) || ['?'])[0] };
      } },
    { name: 'FHIR R4 Bundle and SDC MDIB import', expected: 'BP panel split into SBP/DBP/MAP; dataAbsentReason stored as missing; SDC questionable validity flagged low-quality',
      run() {
        const f = PM.fhir.importJSON(PM.samples.fhirBundle(Date.now()), { source: 'imported' }).observations;
        const x = PM.sdc.importXML(PM.samples.sdcMdib(Date.now()), { source: 'imported' }).observations;
        const has = (l, p) => l.some(o => o.param === p && o.value !== null);
        const rrMissing = f.some(o => o.param === 'rr' && o.value === null);
        const spo2 = x.find(o => o.param === 'spo2'), tMissing = x.some(o => o.param === 'temp' && o.value === null);
        const ok = has(f, 'sbp') && has(f, 'dbp') && has(f, 'map') && rrMissing && spo2 && spo2.quality === 'low-quality' && tMissing;
        return { pass: !!ok, observed: 'FHIR ' + f.length + ' observations (rr missing: ' + rrMissing + '); SDC ' + x.length + ' observations, spo2 ' + (spo2 ? spo2.quality : '?') };
      } },
    { name: 'Live HL7 feed from a real monitor or gateway (hardware)', expected: 'ORU^R01 messages arrive over MLLP or serial and are acknowledged', hardware: true },
  ];

  function run(done) {
    const body = $('#stTable tbody'); body.textContent = '';
    const results = [];
    let i = 0;
    $('#stSummary').textContent = 'Running…';
    const btn = $('#btnSelfTest'); btn.disabled = true;
    const step = () => {
      if (i >= TESTS.length) return finish();
      const T = TESTS[i++];
      let r;
      const t0 = performance.now();
      if (T.hardware) r = { status: 'not run', observed: 'not run: no hardware available in this test session' };
      else {
        try { const x = T.run(); r = { status: x.pass ? 'pass' : 'fail', observed: x.observed }; }
        catch (e) { r = { status: 'fail', observed: 'error: ' + e.message }; }
      }
      r.ms = Math.round(performance.now() - t0);
      results.push(Object.assign({ n: i, name: T.name, expected: T.expected }, r));
      body.append(el('tr', null, el('td.num', { text: i }), el('td', { text: T.name }), el('td', { text: T.expected }), el('td', { text: r.observed }),
        el('td', { class: r.status === 'pass' ? 'result-pass' : r.status === 'fail' ? 'result-fail' : 'result-skip', text: r.status })));
      setTimeout(step, 0); // keep the page responsive between scenarios
    };
    const finish = () => {
      const c = s => results.filter(r => r.status === s).length;
      const sum = { pass: c('pass'), fail: c('fail'), notRun: c('not run'), total: results.length };
      $('#stSummary').textContent = sum.pass + ' passed, ' + sum.fail + ' failed, ' + sum.notRun + ' not run (hardware)';
      btn.disabled = false;
      root.__TEST_RESULTS__ = { summary: sum, results };
      if (done) done(root.__TEST_RESULTS__);
    };
    step();
  }

  PM.selftest = { run, TESTS };
})(this);
