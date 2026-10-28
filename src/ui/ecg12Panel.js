/* Derived 12-lead ECG view. Opens from the ECG waveform (click, or the
 * "12-lead" button for keyboard users) and shows the last 10 s of the engine's
 * twelve lead rings in the standard 3 × 4 layout (each column 2.5 s of the same
 * 10 s, like an ECG cart printout) plus a 10 s lead II rhythm strip, on 1 mm / 5 mm
 * grid paper at 25 mm/s and 10 mm/mV with a 1 mV calibration pulse per row.
 * The leads come from the model dipole through the Dower transform (ecg12.js);
 * this is a teaching view, not a diagnostic ECG. */
(function (root) {
  'use strict';
  const { $, el, fitCanvas, canvasPng, stamp } = root.PM.dom;
  const E12 = root.PM.ecg12;
  const MM_S = 25, MM_MV = 10;         // paper speed and gain
  const COL_S = 2.5, REC_S = 10;       // seconds per column, seconds per recording
  const CAL_MM = 7, ROW_MM = 27, HEAD_MM = 16, FOOT_MM = 4;
  const LAYOUT = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
  const NOTICE = 'Educational simulation only. Simulated values and consumer wearable readings are not a substitute for clinical monitoring or medical advice.';

  let dlg, cv, info, holdBtn, timer = 0, held = false, engine = null;

  function build() {
    holdBtn = el('button', { type: 'button', 'aria-pressed': 'false', text: 'Hold', onclick: () => setHold(!held) });
    cv = el('canvas', { 'aria-label': 'Derived 12-lead ECG, 10 seconds' });
    info = el('p.e12-info', { 'aria-live': 'polite' });
    dlg = el('dialog.e12', { id: 'dlg12', 'aria-labelledby': 'dlg12Title' },
      el('div.e12-head', null,
        el('h2', { id: 'dlg12Title', text: 'Derived 12-lead ECG' }),
        el('div.e12-btns', null, holdBtn,
          el('button', { type: 'button', text: 'Save PNG', onclick: () => canvasPng(cv, 'pm-sim-12lead-' + stamp() + '.png') }),
          el('button.primary', { type: 'button', text: 'Close', onclick: () => dlg.close() }))),
      info,
      el('div.e12-paper', null, cv),
      el('p.hint', { text: 'The 12 leads are computed from the simulated heart vector with the Dower transform; lead II is the monitor ECG. ' +
        'Each column shows 2.5 s of the same 10 s recording; the bottom strip is lead II over all 10 s. ' +
        'A single moving dipole gives textbook shapes only: no regional ST changes, no infarct Q waves. Not a diagnostic ECG.' }));
    dlg.addEventListener('close', () => { clearInterval(timer); timer = 0; setHold(false); });
    document.body.append(dlg);
  }

  function setHold(on) {
    held = on; holdBtn.setAttribute('aria-pressed', String(on)); holdBtn.textContent = on ? 'Held (resume)' : 'Hold';
    if (!on && dlg.open) draw();
  }

  function open(eng) {
    engine = eng;
    if (!dlg) build();
    if (!dlg.open) dlg.showModal();
    draw();
    if (!timer) timer = setInterval(() => { if (!held) draw(); }, 1000);
  }

  /** Last REC_S seconds of a ring, NaN-padded at the start when less is stored. */
  function lastRec(ring, fs) {
    const N = Math.round(REC_S * fs), n = Math.min(N, ring.total, ring.cap);
    const out = new Float64Array(N).fill(NaN);
    if (n > 0) out.set(ring.last(n), N - n);
    return out;
  }

  function grid(g, x0, y0, w, h, mm) {
    g.fillStyle = '#fffaf8'; g.fillRect(x0, y0, w, h);
    g.lineWidth = 1;
    for (const [step, col] of [[1, 'rgba(232,120,120,0.28)'], [5, 'rgba(214,72,72,0.55)']]) {
      g.strokeStyle = col; g.beginPath();
      for (let x = x0; x <= x0 + w + 0.5; x += step * mm) { const px = Math.round(x) + 0.5; g.moveTo(px, y0); g.lineTo(px, y0 + h); }
      for (let y = y0; y <= y0 + h + 0.5; y += step * mm) { const py = Math.round(y) + 0.5; g.moveTo(x0, py); g.lineTo(x0 + w, py); }
      g.stroke();
    }
  }

  /** One trace segment; NaN samples break the line. Returns the fraction of NaN. */
  function trace(g, data, i0, i1, fs, x0, yMid, mm) {
    let pen = false, nan = 0;
    g.beginPath();
    for (let i = i0; i < i1; i++) {
      const v = data[i];
      if (!Number.isFinite(v)) { pen = false; nan++; continue; }
      const x = x0 + (i - i0) / fs * MM_S * mm, y = yMid - v * MM_MV * mm;
      if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
    }
    g.stroke();
    return nan / Math.max(1, i1 - i0);
  }

  function calPulse(g, x0, yMid, mm) {
    const w = 0.2 * MM_S * mm, hgt = MM_MV * mm; // 1 mV for 200 ms
    g.beginPath(); g.moveTo(x0, yMid); g.lineTo(x0 + mm, yMid); g.lineTo(x0 + mm, yMid - hgt);
    g.lineTo(x0 + mm + w, yMid - hgt); g.lineTo(x0 + mm + w, yMid); g.lineTo(x0 + CAL_MM * mm - mm, yMid); g.stroke();
  }

  function axisText(a) {
    if (!Number.isFinite(a)) return 'no QRS';
    const r = Math.round(a), s = (r > 0 ? '+' : '') + r + '°';
    const zone = a >= -30 && a <= 90 ? 'normal' : a < -30 && a >= -90 ? 'left axis deviation' : a > 90 && a <= 180 ? 'right axis deviation' : 'extreme axis';
    return s + ' (' + zone + ')';
  }

  function draw() {
    const rings = engine && engine.lead12;
    if (!rings) return;
    const p = engine.p, fs = rings[0].fs;
    const totalMm = CAL_MM + REC_S * MM_S + 2;
    const heightMm = HEAD_MM + 4 * ROW_MM + FOOT_MM;
    cv.style.aspectRatio = totalMm + ' / ' + heightMm;
    const { ctx: g, w, h } = fitCanvas(cv);
    const mm = Math.min(w / totalMm, h / heightMm);
    const data = rings.map(r => lastRec(r, fs));
    const N = data[0].length, perCol = Math.round(COL_S * fs);

    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const gy = HEAD_MM * mm;
    grid(g, 0, gy, totalMm * mm, 4 * ROW_MM * mm, mm);

    // header: settings, axis and the notice (it travels with a saved PNG)
    const axis = PM.ecg.qrsAxis(p), f = engine.lastFrame;
    const hr = f && Number.isFinite(f.est.hr) ? Math.round(f.est.hr) + ' bpm (monitor)' : '-- bpm';
    const filt = p.ecg_filter === 'monitor' ? 'monitor 0.5–40 Hz' : p.ecg_filter === 'diagnostic' ? 'diagnostic 0.05–150 Hz' : 'no filter';
    g.fillStyle = '#1d2330'; g.font = '600 ' + Math.max(10, 3.4 * mm) + 'px system-ui, sans-serif'; g.textBaseline = 'alphabetic';
    g.fillText('PM-SIM derived 12-lead ECG  ·  HR ' + hr + '  ·  ' + (Number.isFinite(axis) ? 'QRS axis ' + axisText(axis) : 'no QRS complexes'), 2 * mm, 6 * mm);
    g.font = Math.max(9, 2.8 * mm) + 'px system-ui, sans-serif'; g.fillStyle = '#5d6677';
    g.fillText(MM_S + ' mm/s  ·  ' + MM_MV + ' mm/mV  ·  ' + filt + (p.notch === 'on' ? ' + ' + p.mains_hz + ' Hz notch' : '') +
      '  ·  ' + fs + ' Hz  ·  sim t = ' + engine.t.toFixed(1) + ' s  ·  ' + new Date().toISOString().slice(0, 19).replace('T', ' '), 2 * mm, 10.2 * mm);
    g.fillStyle = '#8a5a00';
    g.fillText(NOTICE, 2 * mm, 14 * mm);

    g.strokeStyle = '#111'; g.lineWidth = Math.max(1, 0.28 * mm); g.lineJoin = 'round';
    const labelFont = '600 ' + Math.max(10, 3.2 * mm) + 'px system-ui, sans-serif';
    const x0 = CAL_MM * mm, colW = COL_S * MM_S * mm;
    let lost = 0;
    for (let r = 0; r < 4; r++) {
      const yMid = gy + (r + 0.62) * ROW_MM * mm;
      calPulse(g, 0, yMid, mm);
      const cols = r < 3 ? LAYOUT[r] : ['II'];
      for (let c = 0; c < cols.length; c++) {
        const j = E12.LEADS.indexOf(cols[c]);
        const i0 = r < 3 ? c * perCol : 0, i1 = r < 3 ? Math.min(N, (c + 1) * perCol) : N;
        const xc = x0 + (r < 3 ? c * colW : 0);
        const gap = trace(g, data[j], i0, i1, fs, xc, yMid, mm);
        if (r === 3) lost = gap; // the rhythm strip spans the whole 10 s
        g.fillStyle = '#111'; g.font = labelFont;
        g.fillText(cols[c], xc + 1.2 * mm, yMid - 9.5 * mm);
        if (r < 3 && c > 0) { g.beginPath(); g.moveTo(xc, yMid - 3 * mm); g.lineTo(xc, yMid + 3 * mm); g.stroke(); }
      }
      if (r === 3) { g.fillStyle = '#5d6677'; g.font = Math.max(9, 2.6 * mm) + 'px system-ui, sans-serif'; g.fillText('rhythm strip, 10 s', x0 + 8 * mm, yMid - 9.5 * mm); }
    }

    const msg = [];
    if (lost > 0.999) msg.push('No ECG signal: leads off, or less than 10 s recorded yet.');
    else if (lost > 0) msg.push('Part of this recording has no signal (leads off, dropout or start-up); gaps are left blank, never drawn as zero.');
    if (p.arrhythmia === 'vf') msg.push('VF: chaotic activity, no QRS complexes, no axis.');
    else if (p.arrhythmia === 'asystole') msg.push('Asystole: no electrical activity.');
    if (Number.isFinite(axis) && lost < 0.999) msg.push('Frontal QRS axis ' + axisText(axis) + ', from the model beat (net QRS area in I and aVF).');
    info.textContent = msg.join(' ');
  }

  /** Hook the monitor's ECG waveform: click it, or use the 12-lead button. */
  function attach(eng) {
    const wave = document.querySelector('.wave[data-ch="ecg"]');
    if (!wave) return;
    const btn = el('button.wave-btn', { type: 'button', id: 'btn12', text: '12-lead', title: 'Show the derived 12-lead ECG' });
    btn.addEventListener('click', e => { e.stopPropagation(); open(eng); });
    wave.append(btn);
    wave.classList.add('clickable');
    wave.title = 'Click to show the derived 12-lead ECG';
    wave.addEventListener('click', () => open(eng));
  }

  (root.PM = root.PM || {}).ecg12Panel = { attach, open, isOpen: () => !!(dlg && dlg.open), draw: () => draw() };
})(this);
