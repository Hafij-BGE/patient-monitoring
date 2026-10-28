/**
 * Bedside view: a full-screen monitor layout for the same live simulation.
 * It re-arranges the existing monitor with CSS (css/bedside.css) and adds a status
 * strip and a softkey bar. Every softkey forwards to an existing control, so the
 * simulation logic is unchanged. Toggle: toolbar button, the B key, or ?bedside=1.
 */
(function (root) {
  'use strict';
  const { $, el } = root.PM.dom;
  const KEY = 'pmsim.bedside';
  const body = document.body;
  let top = null, keys = null, scn = null, timer = 0;

  function pref(v) {
    try { if (v === undefined) return root.localStorage.getItem(KEY) === '1'; root.localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* storage blocked */ }
    return false;
  }

  /** A softkey that clicks an existing button and mirrors its label and pressed state. */
  function proxy(id, label) {
    const b = el('button', { type: 'button', text: label, 'data-for': id, title: ($(id) && $(id).title) || label });
    b.addEventListener('click', () => { const t = $(id); if (t) t.click(); sync(); });
    return b;
  }

  function build() {
    top = el('div.bs-top', { role: 'status', 'aria-label': 'Bedside status' }, [
      el('span.bs-bed', { text: 'PM-SIM · BED 01' }),
      el('span.bs-sim', { text: 'SIMULATED' }),
      el('span.bs-scn', { id: 'bsScn' }),
      el('span.bs-muted', { id: 'bsSpeed' }),
      el('span.bs-state', { id: 'bsState' }),
      el('span.bs-clock', { id: 'bsClock' })
    ]);
    $('#alarmbar').before(top);

    scn = el('select', { 'aria-label': 'Scenario (bedside)', title: 'Scenario preset' });
    scn.addEventListener('change', () => {
      const s = $('#selPreset'); s.value = scn.value; s.dispatchEvent(new Event('change', { bubbles: true })); sync();
    });
    const fs = el('button', { type: 'button', text: 'Full screen', title: 'Toggle browser full screen' });
    fs.addEventListener('click', () => {
      const d = document;
      if (d.fullscreenElement) d.exitFullscreen().catch(() => {});
      else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {});
    });
    fs.hidden = !document.fullscreenEnabled;
    const exit = el('button.bs-exit', { type: 'button', text: 'Exit bedside', title: 'Back to the full simulator (Esc)' });
    exit.addEventListener('click', () => set(false));
    keys = el('nav.bs-keys', { 'aria-label': 'Bedside softkeys' }, [
      proxy('#btnAckAll', 'Acknowledge'), proxy('#btnMute', 'Audio pause'),
      proxy('#btnNibp', 'NIBP start'), proxy('#btnNibpStop', 'NIBP stop'),
      proxy('#btnFreeze', 'Freeze'), proxy('#btnRun', 'Pause'), proxy('#btnPng', 'Snapshot'),
      scn, fs, exit
    ]);
    $('#monitor').after(keys);
  }

  /** Copy the live state of the normal controls into the strip and softkeys. */
  function sync() {
    if (!top) return;
    const sel = $('#selPreset'), opt = sel.options[sel.selectedIndex];
    if (scn.options.length !== sel.options.length) scn.replaceChildren(...[...sel.options].map(o => el('option', { value: o.value, text: o.text })));
    scn.value = sel.value;
    $('#bsScn').textContent = 'Scenario: ' + (opt ? opt.text : '--');
    const sp = $('#selSpeed'); $('#bsSpeed').textContent = sp && sp.selectedIndex >= 0 ? 'Speed ' + sp.options[sp.selectedIndex].text : '';
    const paused = /resume|run|start/i.test($('#btnRun').textContent);
    const st = $('#bsState'); st.textContent = paused ? 'PAUSED' : 'RUNNING'; st.classList.toggle('paused', paused);
    $('#bsClock').textContent = $('#clock').textContent;
    for (const b of keys.querySelectorAll('button[data-for]')) {
      const t = $(b.dataset.for); if (!t) continue;
      if (b.dataset.for === '#btnRun' || b.dataset.for === '#btnFreeze') b.textContent = t.textContent.replace(' display', '');
      if (b.dataset.for === '#btnMute') b.textContent = t.textContent.replace(' (resume)', '');
      if (t.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', t.getAttribute('aria-pressed')); else b.removeAttribute('aria-pressed');
      b.disabled = t.disabled;
    }
  }

  function set(on) {
    on = !!on;
    if (on && !top) build();
    body.classList.toggle('bedside', on);
    const tb = $('#btnBedside'); if (tb) tb.setAttribute('aria-pressed', String(on));
    clearInterval(timer); timer = 0;
    if (on) { sync(); timer = setInterval(sync, 250); }
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    pref(on);
    root.dispatchEvent(new Event('resize'));
  }

  const tb = el('button', { id: 'btnBedside', type: 'button', text: 'Bedside view', 'aria-pressed': 'false',
    title: 'Full-screen bedside monitor layout (B). Same simulation, different screen.' });
  tb.addEventListener('click', () => set(!body.classList.contains('bedside')));
  $('#btnPng').after(tb);

  document.addEventListener('keydown', e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, [contenteditable]')) return;
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); set(!body.classList.contains('bedside')); }
    else if (e.key === 'Escape' && body.classList.contains('bedside') && !document.fullscreenElement) set(false);
  });

  const q = new URLSearchParams(root.location.search);
  if (!q.has('selftest') && (q.get('bedside') === '1' || (!q.has('bedside') && pref()))) set(true);

  root.PM.bedside = { set, isOn: () => body.classList.contains('bedside') };
})(this);
