/* UI panels: generated controls, alarm bar / limits / history, NIBP history
 * table and the profile panel. They read and call the logic modules; they
 * contain no simulation logic. Browser only. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, el, fmt } = PM.dom;

  // ------------------------------------------------------------- controls
  /**
   * Build one control per SPEC entry, grouped. `apply(update)` must return the
   * engine's {params, errors, warnings}. Returns {sync(params, changedKeys)}.
   */
  function buildControls(container, msgs, apply) {
    const { SPEC, GROUPS } = PM.params;
    const rows = {};
    container.textContent = '';
    for (const [g, title] of Object.entries(GROUPS)) {
      const box = el('div.cgroup', null, el('h3', { text: title }));
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
        row.append(el('div.help', { text: s.help || '' }));
        rows[key] = { row, input, slider, spec: s };
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
    }

    function sync(params, changed) {
      for (const [key, r] of Object.entries(rows)) {
        const v = params[key];
        if (document.activeElement !== r.input) r.input.value = String(v);
        if (r.slider && document.activeElement !== r.slider) r.slider.value = String(v);
        if (changed) r.row.classList.toggle('changed', changed.includes(key));
      }
    }
    return { sync, showMsgs };
  }

  // ------------------------------------------------------------- alarms
  function renderAlarmBar(listEl, st, onAck) {
    listEl.textContent = '';
    if (!st.active.length) { listEl.append(el('span.muted', { text: 'No active alarms' })); return; }
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
  function buildProfile(onDerived) {
    const P = PM.profile, U = PM.units;
    const state = JSON.parse(JSON.stringify(P.DEFAULT_PROFILE));
    $('#pLabel').value = state.label; $('#pAge').value = state.ageYears;
    $('#pHeight').value = state.heightCm; $('#pWeight').value = state.weightKg;
    let hUnit = 'cm', wUnit = 'kg';
    $('#pHeightUnit').addEventListener('change', e => {
      const v = Number($('#pHeight').value);
      if (Number.isFinite(v) && $('#pHeight').value !== '') $('#pHeight').value = e.target.value === 'in' ? (v / 2.54).toFixed(1) : (v * 2.54).toFixed(1);
      hUnit = e.target.value;
    });
    $('#pWeightUnit').addEventListener('change', e => {
      const v = Number($('#pWeight').value);
      if (Number.isFinite(v) && $('#pWeight').value !== '') $('#pWeight').value = e.target.value === 'lb' ? U.kgToLb(v).toFixed(1) : U.lbToKg(v).toFixed(1);
      wUnit = e.target.value;
    });

    function num(id) { const s = $(id).value.trim().replace(',', '.'); return s === '' ? null : Number(s); }

    $('#profileForm').addEventListener('submit', e => {
      e.preventDefault();
      const msg = $('#pMsg'); msg.textContent = '';
      const age = num('#pAge'), h = num('#pHeight'), w = num('#pWeight');
      const errs = [];
      if (age !== null && (!Number.isFinite(age) || age < 0 || age > 120)) errs.push('age must be 0–120 years');
      const hCm = h === null ? null : (hUnit === 'in' ? h * 2.54 : h);
      const wKg = w === null ? null : (wUnit === 'lb' ? U.lbToKg(w) : w);
      if (hCm !== null && !U.inRange('height', hCm)) errs.push('height must be ' + U.PARAMS.height.min + '–' + U.PARAMS.height.max + ' cm');
      if (wKg !== null && !U.inRange('weight', wKg)) errs.push('weight must be ' + U.PARAMS.weight.min + '–' + U.PARAMS.weight.max + ' kg');
      if (errs.length) { msg.append(el('span.err', { text: errs.join('; ') + '. Not updated.' })); return; }
      state.label = $('#pLabel').value.trim().slice(0, 40) || 'SIM-PATIENT-01';
      state.ageYears = age; state.heightCm = hCm; state.weightKg = wKg;
      msg.append(el('span.ok', { text: 'Profile updated.' }));
      render(true);
    });

    $('#whForm').addEventListener('submit', e => {
      e.preventDefault();
      const msg = $('#whMsg'); msg.textContent = '';
      const d = $('#whDate').value, kg = num('#whKg');
      if (!d) { msg.append(el('span.err', { text: 'choose a date' })); return; }
      if (kg === null || !U.inRange('weight', kg)) { msg.append(el('span.err', { text: 'weight must be ' + U.PARAMS.weight.min + '–' + U.PARAMS.weight.max + ' kg' })); return; }
      state.weightHistory = state.weightHistory.filter(x => x.date !== d).concat([{ date: d, kg }]);
      $('#whKg').value = '';
      render(false);
    });

    function render(emit) {
      const b = P.bmi(state.weightKg, state.heightCm), bsa = P.bsaMosteller(state.weightKg, state.heightCm);
      const cat = P.bmiCategory(b, state.ageYears === null ? NaN : state.ageYears);
      const ft = state.heightCm ? U.cmToFtIn(state.heightCm) : null;
      const card = (title, val, sub) => el('div.card', null, el('div.muted', { text: title }), el('b', { text: val }), sub ? el('div.hint', { text: sub }) : null);
      const box = $('#pDerived'); box.textContent = '';
      box.append(
        card('BMI', b === null ? '--' : b.toFixed(1) + ' kg/m²', cat.category ? cat.category + '. ' + cat.note : cat.note),
        card('BSA (Mosteller)', bsa === null ? '--' : bsa.toFixed(2) + ' m²', 'Derived from height and weight'),
        card('Height', state.heightCm === null ? '--' : state.heightCm.toFixed(1) + ' cm', ft ? ft.ft + ' ft ' + ft.in + ' in' : ''),
        card('Weight', state.weightKg === null ? '--' : state.weightKg.toFixed(1) + ' kg', state.weightKg === null ? '' : U.kgToLb(state.weightKg).toFixed(1) + ' lb'));
      const hist = P.normaliseHistory(state.weightHistory), ch = P.weightChange(state.weightHistory);
      const list = $('#whList'); list.textContent = '';
      if (hist.length) {
        list.append(el('table', null, el('thead', null, el('tr', null, el('th', { text: 'Date' }), el('th.num', { text: 'kg' }), el('th', { text: '' }))),
          el('tbody', null, hist.map(x => el('tr', null, el('td', { text: x.date }), el('td.num', { text: x.kg.toFixed(1) }),
            el('td', null, el('button', { text: 'remove', onclick: () => { state.weightHistory = state.weightHistory.filter(y => y.date !== x.date); render(false); } })))))));
        if (ch) list.append(el('p.hint', { text: 'Change ' + ch.from.date + ' → ' + ch.to.date + ' (' + ch.days + ' days): ' + (ch.absKg >= 0 ? '+' : '') + ch.absKg.toFixed(1) + ' kg (' + (ch.pct >= 0 ? '+' : '') + ch.pct.toFixed(1) + ' %)' }));
      } else list.append(el('p.muted', { text: 'No weight entries' }));
      if (emit && onDerived) {
        const O = PM.observation, now = Date.now(), out = [];
        const prov = { formula: '', inputs: { heightCm: state.heightCm, weightKg: state.weightKg }, profile: state.label };
        if (b !== null) out.push(O.make({ param: 'bmi', value: b, source: O.SOURCE.DERIVED, timestamp: now, provenance: Object.assign({}, prov, { formula: 'weight / height²' }) }));
        if (bsa !== null) out.push(O.make({ param: 'bsa', value: bsa, source: O.SOURCE.DERIVED, timestamp: now, provenance: Object.assign({}, prov, { formula: 'Mosteller √(h·w/3600)' }) }));
        onDerived(out);
      }
    }
    render(false);
    return { state, render };
  }

  PM.panels = { buildControls, renderAlarmBar, buildLimits, renderAlarmHistory, renderNibpTable, buildProfile };
})(this);
