/* UI panels: generated controls, alarm bar / limits / history, NIBP history
 * table and the profile panel. They read and call the logic modules; they
 * contain no simulation logic. Browser only. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, el, fmt } = PM.dom;

  // ------------------------------------------------------------- controls
  // Simple view: the patient profile, the vital-sign set points and the two most
  // used sensor faults.
  // Any other control is still shown when it is not at its default value or is
  // linked to an active alarm, so a scenario never hides what it changed.
  const SIMPLE = new Set(['age_years', 'sex', 'height_cm', 'weight_kg', 'diabetes',
    'hr', 'arrhythmia', 'sbp', 'dbp', 'spo2', 'rr', 'etco2', 'temp',
    'motion', 'spo2_sensor', 'nibp_interval']);
  const VIEW_KEY = 'pmsim.controls.v1';

  // Profile use-case switches (Profile tab), kept per browser. calc: bedside
  // calculators; si: shock index in the monitor banner; ageBp: a hand edit of age or
  // sex also sets SBP/DBP to the age-typical values (applied in app.js).
  const USECASE_KEY = 'pmsim.usecases.v1';
  const useCases = { calc: true, si: true, ageBp: false };
  try { Object.assign(useCases, JSON.parse(localStorage.getItem(USECASE_KEY)) || {}); } catch (e) { /* no storage */ }
  function saveUseCases() { try { localStorage.setItem(USECASE_KEY, JSON.stringify(useCases)); } catch (e) { /* no storage */ } }

  // Formula choices (PM.profile.FORMULAS); the first entry of each list is the default.
  const FORMULA_KEY = 'pmsim.formulas.v1';
  const formulas = {};
  for (const k of Object.keys(PM.profile.FORMULAS)) formulas[k] = PM.profile.FORMULAS[k][0].id;
  try {
    const saved = JSON.parse(localStorage.getItem(FORMULA_KEY)) || {};
    for (const k of Object.keys(formulas)) if (PM.profile.FORMULAS[k].some(x => x.id === saved[k])) formulas[k] = saved[k];
  } catch (e) { /* no storage */ }
  function saveFormulas() { try { localStorage.setItem(FORMULA_KEY, JSON.stringify(formulas)); } catch (e) { /* no storage */ } }

  /**
   * Build one control per SPEC entry, grouped. `apply(update)` must return the
   * engine's {params, errors, warnings}. Returns {sync(params, changedKeys)}.
   */
  function buildControls(container, msgs, apply) {
    const { SPEC, GROUPS } = PM.params;
    const rows = {}, boxes = [];
    container.textContent = '';
    for (const [g, title] of Object.entries(GROUPS)) {
      const box = el('div.cgroup', null, el('h3', { text: title }));
      boxes.push(box);
      for (const [key, s] of Object.entries(SPEC)) {
        if (s.group !== g) continue;
        const id = 'ctl-' + key;
        const row = el('div.ctl', { 'data-key': key });
        const range = s.unit ? ' (' + s.min + '–' + s.max + ' ' + s.unit + ')' : '';
        row.append(el('label', { for: id }, s.label, ' ', el('span.u', { text: s.type === 'num' ? (s.unit || '') + range.replace(' ' + (s.unit || ''), '') : '' })));
        let input, slider = null;
        if (s.type === 'sel') {
          input = el('select', { id }, s.options.map(o => el('option', { value: String(o), text: String(o) })));
          input.addEventListener('change', () => send(key, input.value));
          row.append(input);
        } else {
          input = el('input', { id, type: 'number', min: s.min, max: s.max, step: s.step });
          slider = el('input', { type: 'range', min: s.min, max: s.max, step: s.step, 'aria-label': s.label + ' slider' });
          input.addEventListener('change', () => send(key, input.value));
          slider.addEventListener('input', () => { input.value = slider.value; send(key, Number(slider.value), true); });
          row.append(input, slider);
        }
        const issue = el('div.ctl-issue', { 'aria-live': 'polite' });
        row.append(issue, el('div.help', { text: s.help || '' }));
        if (s.help) row.querySelector('label').title = s.help;
        rows[key] = { row, input, slider, issue, spec: s };
        box.append(row);
      }
      container.append(box);
    }

    function send(key, value, quiet) {
      const r = apply({ [key]: value });
      const row = rows[key];
      row.row.classList.toggle('invalid', r.errors.some(e => e.key === key));
      if (!quiet || r.errors.length || r.warnings.length) showMsgs(r);
      sync(r.params);
    }

    function showMsgs(r) {
      msgs.textContent = '';
      const name = k => (SPEC[k] ? SPEC[k].label : k);
      for (const e of r.errors) msgs.append(el('div.err', { text: name(e.key) + ': ' + e.msg + ' (value not applied)' }));
      for (const w of r.warnings) msgs.append(el('div', null, el('span.warn', { text: name(w.key) + ': ' + w.msg })));
      if (r.note) msgs.append(el('div.ok', { text: r.note }));
    }

    // Every row whose value differs from the default is marked, whatever changed it.
    function sync(params) {
      for (const [key, r] of Object.entries(rows)) {
        const v = params[key];
        if (document.activeElement !== r.input) r.input.value = String(v);
        if (r.slider && document.activeElement !== r.slider) r.slider.value = String(v);
        r.row.classList.toggle('changed', String(v) !== String(PM.params.DEFAULTS[key]));
      }
      applyView();
    }

    // View options: simple/advanced and help text on/off, kept per browser.
    const view = { mode: 'simple', help: false };
    try { Object.assign(view, JSON.parse(localStorage.getItem(VIEW_KEY)) || {}); } catch (e) { /* no storage */ }
    const radio = m => el('input', { type: 'radio', name: 'ctlView', value: m });
    const rSimple = radio('simple'), rAdv = radio('advanced');
    const cHelp = el('input', { type: 'checkbox', id: 'ctlHelp' });
    const note = el('span.ctl-note', { 'aria-live': 'polite' });
    const bar = el('div.ctl-view', { role: 'group', 'aria-label': 'Control view' },
      el('label', null, rSimple, ' Simple'), el('label', null, rAdv, ' Advanced'),
      el('label', null, cHelp, ' Show explanations'), note);
    container.before(bar);
    rSimple.addEventListener('change', () => setView({ mode: 'simple' }));
    rAdv.addEventListener('change', () => setView({ mode: 'advanced' }));
    cHelp.addEventListener('change', () => setView({ help: cHelp.checked }));
    function setView(v) {
      Object.assign(view, v);
      if (view.mode !== 'advanced') view.mode = 'simple';
      try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) { /* no storage */ }
      rSimple.checked = view.mode === 'simple'; rAdv.checked = !rSimple.checked; cHelp.checked = !!view.help;
      container.classList.toggle('show-help', !!view.help);
      applyView();
    }
    function applyView() {
      const simple = view.mode === 'simple';
      let extra = 0;
      for (const [key, r] of Object.entries(rows)) {
        const cl = r.row.classList;
        const flagged = cl.contains('changed') || cl.contains('sev-high') || cl.contains('sev-medium') || cl.contains('sev-low');
        const hide = simple && !SIMPLE.has(key) && !flagged;
        if (r.row.hidden !== hide) r.row.hidden = hide;
        if (simple && !SIMPLE.has(key) && flagged) extra++;
      }
      for (const b of boxes) {
        const hide = !b.querySelector('.ctl:not([hidden])');
        if (b.hidden !== hide) b.hidden = hide;
      }
      const text = simple
        ? SIMPLE.size + ' main controls' + (extra ? ' + ' + extra + ' changed by the scenario or linked to an alarm' : '') + '. Advanced shows all ' + Object.keys(rows).length + '.'
        : 'All ' + Object.keys(rows).length + ' controls.';
      if (note.textContent !== text) note.textContent = text;
    }
    setView({});

    /** graded: {key: {sev, messages}} from PM.severity.grade(...).controls. */
    function markSeverity(graded) {
      for (const [key, r] of Object.entries(rows)) {
        const g = graded[key];
        for (const p of ['high', 'medium', 'low']) r.row.classList.toggle('sev-' + p, !!g && g.sev === p);
        const text = g ? '⚠ ' + g.messages.join(' · ') : '';
        if (r.issue.textContent !== text) r.issue.textContent = text;
      }
      applyView();
    }
    return { sync, showMsgs, markSeverity, setView, get view() { return Object.assign({}, view); }, SIMPLE };
  }

  // ------------------------------------------------------------- alarms
  function renderAlarmBar(listEl, st, onAck) {
    listEl.textContent = '';
    if (!st.active.length) { listEl.append(el('span.muted', { text: 'No active alarms' })); return; }
    const c = PM.severity.counts(st.active);
    listEl.append(el('span.alarm-count.' + st.highest, { title: 'All active alarms are listed, highest priority first',
      text: st.active.length + (st.active.length === 1 ? ' alarm' : ' alarms') + ': ' +
        ['high', 'medium', 'low'].filter(p => c[p]).map(p => c[p] + ' ' + p).join(', ') }));
    for (const a of st.active) {
      const unack = a.ackAt === null;
      const val = a.value !== null && a.value !== undefined && a.kind === 'physiological' && a.id !== 'apnea'
        ? ' ' + fmt(a.value, Number.isInteger(a.value) ? undefined : 1) + (a.limit !== null ? ' (limit ' + a.limit + ')' : '') : '';
      listEl.append(el('button.alarm.' + a.priority + (unack ? '.unack' : '.acked'), {
        title: (a.kind === 'technical' ? 'Technical alarm' : 'Physiological alarm') + ', ' + a.priority + ' priority, active since t = ' + a.tOn.toFixed(0) + ' s' + (unack ? '. Click to acknowledge.' : '. Acknowledged.'),
        onclick: () => onAck(a.id),
      }, el('span.tag', { text: a.kind === 'technical' ? 'TECH' : a.priority.toUpperCase() }), ' ', a.message + val, unack ? '' : ' ✓'));
    }
  }

  function buildLimits(tbody, alarms, msgEl, onChange) {
    function render() {
      tbody.textContent = '';
      for (const [param, L] of Object.entries(alarms.limits)) {
        const inp = (k, w) => {
          const i = el('input', { type: 'number', step: param === 'temp' ? 0.1 : 1, value: L[k] === null ? '' : String(L[k]),
            style: 'width:' + w + 'px', 'aria-label': L.label + ' ' + k, placeholder: k === 'delay' ? '' : 'off' });
          i.addEventListener('change', () => commit(param, { [k]: i.value === '' ? null : Number(i.value) }));
          return i;
        };
        const on = el('input', { type: 'checkbox', checked: L.enabled, 'aria-label': L.label + ' alarm enabled' });
        on.addEventListener('change', () => commit(param, { enabled: on.checked }));
        tbody.append(el('tr', null,
          el('td', null, L.label + ' ', el('span.muted', { text: L.unit })),
          el('td', null, inp('low', 70)), el('td', null, inp('high', 70)), el('td', null, inp('delay', 56)), el('td', null, on)));
      }
    }
    function commit(param, change) {
      const r = alarms.setLimit(param, change);
      msgEl.textContent = '';
      msgEl.append(r.ok ? el('span.ok', { text: alarms.limits[param].label + ' limits updated.' }) : el('span.err', { text: alarms.limits[param].label + ': ' + r.error + '. Not applied.' }));
      render();
      onChange();
    }
    render();
    return { render };
  }

  function renderAlarmHistory(tbody, history) {
    tbody.textContent = '';
    const n = v => (v === null || v === undefined ? '' : v.toFixed(0));
    for (const a of history.slice().reverse().slice(0, 300)) {
      tbody.append(el('tr', null, el('td', { text: a.message }), el('td', { text: a.kind }), el('td', { text: a.priority }),
        el('td.num', { text: n(a.tOn) }), el('td.num', { text: a.tOff === null ? 'active' : n(a.tOff) }), el('td.num', { text: n(a.ackAt) })));
    }
    if (!history.length) tbody.append(el('tr', null, el('td.muted', { colspan: 6, text: 'No alarms yet' })));
  }

  // ------------------------------------------------------------- NIBP
  function renderNibpTable(tbody, rows) {
    tbody.textContent = '';
    for (const r of rows.slice().reverse()) {
      const x = r.res;
      tbody.append(el('tr', null,
        el('td.num', { text: r.t.toFixed(0) }),
        el('td.num', { text: x.error ? '--' : fmt(x.sbp) }), el('td.num', { text: x.error ? '--' : fmt(x.dbp) }),
        el('td.num', { text: x.error ? '--' : fmt(x.mapOsc) }), el('td.num', { text: x.error ? '--' : fmt(x.map) }),
        el('td.num', { text: r.set.sbp + '/' + r.set.dbp }),
        el('td', { class: x.error ? 'err' : 'ok', text: x.error ? 'failed: ' + x.error : 'ok' })));
    }
    if (!rows.length) tbody.append(el('tr', null, el('td.muted', { colspan: 7, text: 'No measurements yet' })));
  }

  // ------------------------------------------------------------- profile
  /** Profile panel. `onDerived(list)` receives derived BMI/BSA observations. */
  /**
   * Profile tab. Age, sex, height and weight are simulation parameters (the same
   * values as the "Patient profile" controls), so both views always agree.
   * opts: { apply(update) -> {params, errors, warnings}, onDerived(observations) }.
   * Returns { refresh(params) }, called after any parameter change.
   */
  function buildProfile(opts) {
    const P = PM.profile, U = PM.units, S = PM.params.SPEC;
    const local = { label: P.DEFAULT_PROFILE.label, weightHistory: [] };
    let cur = PM.params.DEFAULTS;
    for (const o of S.sex.options) $('#pSex').append(el('option', { value: o, text: o }));
    $('#pLabel').value = local.label;
    let hUnit = 'cm', wUnit = 'kg';
    $('#pHeightUnit').addEventListener('change', e => { hUnit = e.target.value; fill(true); });
    $('#pWeightUnit').addEventListener('change', e => { wUnit = e.target.value; fill(true); });

    // Use-case switches. Turning "age sets blood pressure" on applies it at once.
    const ucBox = { calc: $('#ucCalc'), si: $('#ucSi'), ageBp: $('#ucAgeBp') };
    for (const [k, box] of Object.entries(ucBox)) {
      box.checked = useCases[k];
      box.addEventListener('change', () => {
        useCases[k] = box.checked; saveUseCases();
        const msg = $('#ucMsg'); msg.textContent = '';
        if (k === 'ageBp' && box.checked) {
          const r = opts.apply({ age_years: cur.age_years });
          if (r.note) msg.append(el('span.ok', { text: r.note }));
          cur = r.params;
        }
        render(false);
      });
    }

    // Formula selectors. The monitor reads PM.panels.formulas on every frame.
    const fSel = { qtc: $('#fQtc'), bsa: $('#fBsa'), hrmax: $('#fHrmax'), map: $('#fMap') };
    function formulaNote() {
      $('#fNote').textContent = Object.keys(fSel).map(k => {
        const x = P.formulaInfo(k, formulas[k]);
        return x.name + ': ' + x.eq + (x.ref ? ' [' + x.ref + ']' : '');
      }).join(' · ');
    }
    for (const [k, sel] of Object.entries(fSel)) {
      for (const x of P.FORMULAS[k]) sel.append(el('option', { value: x.id, text: x.name }));
      sel.value = formulas[k];
      sel.addEventListener('change', () => { formulas[k] = sel.value; saveFormulas(); formulaNote(); render(false); });
    }
    formulaNote();

    function num(id) { const s = $(id).value.trim().replace(',', '.'); return s === '' ? null : Number(s); }
    const range = k => S[k].min + '–' + S[k].max + ' ' + S[k].unit;

    // Writes the current parameters into the form (unless the user is typing there).
    function fill(force) {
      const form = $('#profileForm');
      if (!force && form.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
      $('#pAge').value = cur.age_years;
      $('#pSex').value = cur.sex;
      $('#pHeight').value = hUnit === 'in' ? (cur.height_cm / 2.54).toFixed(1) : String(cur.height_cm);
      $('#pWeight').value = wUnit === 'lb' ? U.kgToLb(cur.weight_kg).toFixed(1) : String(cur.weight_kg);
    }

    $('#profileForm').addEventListener('submit', e => {
      e.preventDefault();
      const msg = $('#pMsg'); msg.textContent = '';
      const age = num('#pAge'), h = num('#pHeight'), w = num('#pWeight');
      const hCm = h === null ? null : (hUnit === 'in' ? h * 2.54 : h);
      const wKg = w === null ? null : (wUnit === 'lb' ? U.lbToKg(w) : w);
      const errs = [];
      const check = (k, v, name) => { if (v === null || !Number.isFinite(v) || v < S[k].min || v > S[k].max) errs.push(name + ' must be ' + range(k)); };
      check('age_years', age, 'age'); check('height_cm', hCm, 'height'); check('weight_kg', wKg, 'weight');
      if (errs.length) { msg.append(el('span.err', { text: errs.join('; ') + '. Not updated.' })); return; }
      local.label = $('#pLabel').value.trim().slice(0, 40) || P.DEFAULT_PROFILE.label;
      const r = opts.apply({ age_years: Math.round(age), sex: $('#pSex').value,
        height_cm: Math.round(hCm), weight_kg: Math.round(wKg * 2) / 2 });
      if (r.errors.length) { msg.append(el('span.err', { text: r.errors.map(x => x.key + ': ' + x.msg).join('; ') })); return; }
      msg.append(el('span.ok', { text: 'Profile updated. The same values are in Controls → Patient profile.' + (r.note ? ' ' + r.note : '') }));
      cur = r.params; fill(true); render(true);
    });

    $('#whForm').addEventListener('submit', e => {
      e.preventDefault();
      const msg = $('#whMsg'); msg.textContent = '';
      const d = $('#whDate').value, kg = num('#whKg');
      if (!d) { msg.append(el('span.err', { text: 'choose a date' })); return; }
      if (kg === null || !U.inRange('weight', kg)) { msg.append(el('span.err', { text: 'weight must be ' + U.PARAMS.weight.min + '–' + U.PARAMS.weight.max + ' kg' })); return; }
      local.weightHistory = local.weightHistory.filter(x => x.date !== d).concat([{ date: d, kg }]);
      $('#whKg').value = '';
      render(false);
    });

    function render(emit) {
      const hCm = cur.height_cm, wKg = cur.weight_kg;
      const b = P.bmi(wKg, hCm), bsa = P.bsa(wKg, hCm, formulas.bsa), bsaF = P.formulaInfo('bsa', formulas.bsa);
      const cat = P.bmiCategory(b, cur.age_years);
      const ft = U.cmToFtIn(hCm);
      const card = (title, val, sub) => el('div.card', null, el('div.muted', { text: title }), el('b', { text: val }), sub ? el('div.hint', { text: sub }) : null);
      const box = $('#pDerived'); box.textContent = '';
      box.append(
        card('BMI', b === null ? '--' : b.toFixed(1) + ' kg/m²', cat.category ? cat.category + '. ' + cat.note : cat.note),
        card('BSA (' + bsaF.name + ')', bsa === null ? '--' : bsa.toFixed(2) + ' m²', bsaF.eq + ', H in cm, W in kg'),
        card('Height', hCm.toFixed(1) + ' cm', ft.ft + ' ft ' + ft.in + ' in'),
        card('Weight', wKg.toFixed(1) + ' kg', U.kgToLb(wKg).toFixed(1) + ' lb'),
        card('Diabetes status', cur.diabetes, 'Selects the glucose model parameters'));
      renderCalc(card);
      const hist = P.normaliseHistory(local.weightHistory), ch = P.weightChange(local.weightHistory);
      const list = $('#whList'); list.textContent = '';
      if (hist.length) {
        list.append(el('table', null, el('thead', null, el('tr', null, el('th', { text: 'Date' }), el('th.num', { text: 'kg' }), el('th', { text: '' }))),
          el('tbody', null, hist.map(x => el('tr', null, el('td', { text: x.date }), el('td.num', { text: x.kg.toFixed(1) }),
            el('td', null, el('button', { text: 'remove', onclick: () => { local.weightHistory = local.weightHistory.filter(y => y.date !== x.date); render(false); } })))))));
        if (ch) list.append(el('p.hint', { text: 'Change ' + ch.from.date + ' → ' + ch.to.date + ' (' + ch.days + ' days): ' + (ch.absKg >= 0 ? '+' : '') + ch.absKg.toFixed(1) + ' kg (' + (ch.pct >= 0 ? '+' : '') + ch.pct.toFixed(1) + ' %)' }));
      } else list.append(el('p.muted', { text: 'No weight entries' }));
      if (emit && opts.onDerived) {
        const O = PM.observation, now = Date.now(), out = [];
        const prov = { formula: '', inputs: { heightCm: hCm, weightKg: wKg }, profile: local.label };
        if (b !== null) out.push(O.make({ param: 'bmi', value: b, source: O.SOURCE.DERIVED, timestamp: now, provenance: Object.assign({}, prov, { formula: 'weight / height²' }) }));
        if (bsa !== null) out.push(O.make({ param: 'bsa', value: bsa, source: O.SOURCE.DERIVED, timestamp: now, provenance: Object.assign({}, prov, { formula: bsaF.name + ' ' + bsaF.eq }) }));
        opts.onDerived(out);
      }
    }

    // Bedside calculators from the profile (sources in REFERENCES.md 72-75).
    function renderCalc(card) {
      const box = $('#pCalc'); box.textContent = '';
      box.hidden = !useCases.calc;
      if (!useCases.calc) return;
      const hCm = cur.height_cm, wKg = cur.weight_kg, ml = v => v === null ? '--' : Math.round(v) + ' mL';
      const pbw = P.predictedBodyWeight(hCm, cur.sex);
      if (pbw === null) {
        const m = P.predictedBodyWeight(hCm, 'male'), f = P.predictedBodyWeight(hCm, 'female');
        box.append(card('Predicted body weight', 'set sex', 'The ARDS Network formula differs by sex: ' + f.toFixed(1) + ' kg if female, ' + m.toFixed(1) + ' kg if male at ' + hCm + ' cm.'));
      } else {
        box.append(card('Predicted body weight', pbw.toFixed(1) + ' kg', (cur.sex === 'male' ? '50' : '45.5') + ' + 0.91 × (' + hCm + ' − 152.4). From height and sex only; actual weight ' + wKg + ' kg.'),
          card('Low tidal volume (6 mL/kg PBW)', ml(P.tidalVolume(pbw, 6)), 'Lung-protective ventilation target in ARDS; 4–8 mL/kg PBW = ' + ml(P.tidalVolume(pbw, 4)) + '–' + ml(P.tidalVolume(pbw, 8)) + '.'));
      }
      const pbwTxt = pbw === null ? '' : ' With predicted body weight: ' + ml(P.weightDose(pbw, 30)) + '.';
      const uo = P.weightDose(wKg, 0.5);
      const hrMax = P.hrMax(cur.age_years, formulas.hrmax), hrF = P.formulaInfo('hrmax', formulas.hrmax);
      box.append(
        card('Sepsis fluid, 30 mL/kg', ml(P.weightDose(wKg, 30)), 'At least this much IV crystalloid within the first 3 h for sepsis-induced hypoperfusion (weak recommendation, low-quality evidence), using actual weight.' + pbwTxt),
        card('Urine output threshold', uo === null ? '--' : uo.toFixed(0) + ' mL/h', '0.5 mL/kg/h. Below this for 6 h (under ' + (uo * 6).toFixed(0) + ' mL in 6 h) meets the KDIGO stage 1 AKI urine criterion.'),
        card('Age-predicted max HR', hrMax === null ? '--' : Math.round(hrMax) + ' /min', hrF.name + ': ' + hrF.eq + ', age ' + cur.age_years + ' y. Set HR ' + cur.hr + ' /min = ' + (hrMax ? Math.round(cur.hr / hrMax * 100) : '--') + ' % of it. Population mean; individuals vary.'));
    }

    function refresh(params) {
      const same = ['age_years', 'sex', 'height_cm', 'weight_kg', 'diabetes', 'hr'].every(k => params[k] === cur[k]);
      cur = params;
      if (!same) { fill(false); render(false); }
    }
    fill(true); render(false);
    return { refresh };
  }

  PM.panels = { buildControls, renderAlarmBar, buildLimits, renderAlarmHistory, renderNibpTable, buildProfile, useCases, formulas };
})(this);
