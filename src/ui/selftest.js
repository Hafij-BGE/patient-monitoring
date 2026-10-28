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
    { name: 'Bluetooth Heart Rate Measurement parser (used by the Android app)', expected: 'u16 HR, contact and RR intervals decoded; no-contact packet flagged artifact; truncated packet rejected',
      run() {
        const p = PM.gatt.parseHeartRate('1F 2C 01 0A 00 00 04 00 02');
        const art = PM.gatt.toObservations(PM.gatt.parseHeartRate('04 50'), {})[0];
        let rejected = false; try { PM.gatt.parseHeartRate('01 48'); } catch (e) { rejected = true; }
        const ok = p.hr === 300 && p.contact === 'detected' && p.rrIntervals.join() === '1,0.5' && art.quality === 'artifact' && art.source === 'device' && rejected;
        return { pass: ok, observed: 'hr ' + p.hr + ', contact ' + p.contact + ', RR ' + p.rrIntervals.join('/') + ' s; no-contact ' + art.quality + '; truncated rejected: ' + rejected };
      } },
    { name: 'V-Tach pattern preset', expected: 'rhythm classified vtach and rhythm:vtach alarm active',
      run() { const r = sim(preset('vt'), 20, { alarms: true }); const on = r.st.active.some(a => a.id === 'rhythm:vtach');
        return { pass: r.f.est.rhythm === 'vtach' && on, observed: 'rhythm ' + r.f.est.rhythm + ', HR ' + fmt(r.f.est.hr) + ', rhythm:vtach ' + (on ? 'active' : 'not active') }; } },
    { name: 'Hypoventilation preset: capnography', expected: 'EtCO₂ within ±3 mmHg of 58, EtCO₂ high alarm active after its 10 s delay',
      run() { const r = sim(preset('hypovent'), 30, { alarms: true }); const on = r.st.active.some(a => a.id === 'etco2:high');
        return { pass: near(r.f.est.etco2, 58, 3) && on, observed: 'EtCO₂ ' + fmt(r.f.est.etco2, 1) + ' mmHg, etco2:high ' + (on ? 'active' : 'not active') }; } },
    { name: 'Arterial line: optimal vs under-damped', expected: 'optimal SYS/DIA within ±5 of 120/80; under-damped SYS ≥ 8 mmHg higher with MAP within ±2',
      run() { const a = sim(preset('baseline'), 20).f.est.art, b = sim(preset('underdamped'), 20).f.est.art;
        const ok = a && b && near(a.sys, 120, 5) && near(a.dia, 80, 5) && b.sys - a.sys >= 8 && Math.abs(b.map - a.map) <= 2;
        return { pass: !!ok, observed: a && b ? 'optimal ' + fmt(a.sys) + '/' + fmt(a.dia) + ' (' + fmt(a.map) + '), under-damped ' + fmt(b.sys) + '/' + fmt(b.dia) + ' (' + fmt(b.map) + ')' : 'no ART value' }; } },
    { name: 'Health Connect records (Android bridge logic)', expected: 'valid record stored as source "device"; SpO₂ 150 % rejected, not clamped',
      run() { const r = PM.androidBridge.healthConnectToObservations({ records: [
          { param: 'hr', value: 61, unit: 'bpm', time: Date.UTC(2026, 0, 1), type: 'HeartRateRecord' },
          { param: 'spo2', value: 150, unit: '%', time: Date.UTC(2026, 0, 1), type: 'OxygenSaturationRecord' }] });
        const o = r.observations[0];
        return { pass: r.observations.length === 1 && o.source === 'device' && o.provenance.route === 'health-connect' && r.rejected.length === 1,
          observed: r.observations.length + ' stored (' + (o ? o.param + ' ' + o.value + ', ' + o.source : '-') + '), ' + r.rejected.length + ' rejected' }; } },
    { name: 'Glucose model: meal and insulin bolus projection', expected: 'no diabetes: 50 g meal peaks above 120 mg/dL and returns within ±15 of 90 by 5 h; type 1: 6 U bolus lowers the 4 h value by ≥ 10 mg/dL; glucose low alarm below 70',
      run() {
        const base = { weight_kg: 70, diabetes: 'none', fasting_glucose: 90, fasting_insulin: 10, basal_insulin: 0 };
        const m = PM.glucose.GlucoseModel, f = new m(base).forecast(300, [{ at: 0, carbs: 50 }]);
        const t1 = new m(Object.assign({}, base, { diabetes: 'type1', fasting_glucose: 200, basal_insulin: 0.8 }));
        const off = t1.forecast(240, []).G[240], on = t1.forecast(240, [{ at: 0, units: 6 }]).G[240];
        const st = new PM.alarms.AlarmEngine().evaluate({ t: 1, est: { glucose: 60, rhythm: 'sinus' }, technical: {}, nibp: {} });
        const low = st.active.some(a => a.id === 'glucose:low');
        return { pass: f.maxG > 120 && near(f.G[300], 90, 15) && on < off - 10 && low,
          observed: 'peak ' + fmt(f.maxG) + ', 5 h ' + fmt(f.G[300]) + ' mg/dL; type 1 at 4 h ' + fmt(off) + ' → ' + fmt(on) + ' mg/dL with bolus; glucose:low ' + (low ? 'active' : 'not active') }; } },
    { name: 'Derived 12-lead ECG', expected: 'lead II identical to the monitor trace; I + III = II; normal axis +30…+75°; leads off gives no signal',
      run() { const e = sim(preset('baseline'), 12).e, n = 1500;
        const II = e.lead12[1].last(n), mon = e.ecgS.last(n), I = e.lead12[0].last(n), III = e.lead12[2].last(n);
        let dII = 0, dE = 0;
        for (let i = 0; i < n; i++) { dII = Math.max(dII, Math.abs(II[i] - mon[i])); dE = Math.max(dE, Math.abs(I[i] + III[i] - II[i])); }
        const axis = PM.ecg.qrsAxis(e.p);
        e.p.contact = 5; e.advance(2);
        const off = e.lead12.every(rg => rg.last(200).every(Number.isNaN));
        return { pass: dII < 1e-9 && dE < 1e-9 && axis > 30 && axis < 75 && off,
          observed: 'max |II − monitor| ' + dII.toExponential(1) + ' mV, max |I + III − II| ' + dE.toExponential(1) + ' mV, axis ' + fmt(axis) + '°, leads off ' + (off ? 'no signal' : 'signal drawn') }; } },
    { name: 'Watch data on Android (Health Connect / BLE / export file, hardware)', expected: 'readings arrive with source "device" and the route in the provenance', hardware: true },
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
