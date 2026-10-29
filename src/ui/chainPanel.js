/* Signal-chain view: the same beat or breath shown at each stage between the
 * simulated patient and the number on the screen. It reads the engine's probe
 * points (engine.enableTaps) and draws them; it does no signal processing itself.
 * Browser only. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, el, fmt, fitCanvas, hatch, cssVar, canvasPng, stamp } = PM.dom;

  /** Stage lists per channel. `tap` names match engine.tap() calls. */
  const CHAINS = {
    ecg: {
      title: 'ECG', color: '--ecg', window: 4,
      intro: 'Electrical activity of the heart → electrodes → amplifier and ADC → display filter → QRS detector → heart rate.',
      stages: [
        { tap: 'ecg.clean', name: 'Patient model', unit: 'mV',
          note: 'Output of the McSharry generator: the signal the heart "produces". The monitor never sees this trace.' },
        { tap: 'ecg.acq', name: 'Electrodes, amplifier, ADC', unit: 'mV',
          note: 'Baseline wander from breathing, broadband noise and mains interference are added, then the signal is sampled at the ECG sample rate. Leads off or dropouts leave a gap.' },
        { tap: 'ecg.disp', name: 'Display filter', unit: 'mV',
          note: 'Monitor (0.5–40 Hz) or diagnostic (0.05–150 Hz) band-pass and the optional mains notch. The low-pass corner is capped at 0.49 × the sampling rate (122.5 Hz at 250 Hz, 61 Hz at 125 Hz). This is the trace on the main screen.' },
        { tap: 'ecg.mwi', name: 'Pan–Tompkins detector feature', unit: 'a.u.', floor0: true, line: 'ecg.thr', marks: e => e.qrsTimes,
          note: '5–15 Hz band-pass → derivative → square → 150 ms moving-window integral. Dashed line: adaptive threshold. Ticks: detected QRS complexes. HR = 60 / mean of the last 8 RR intervals.' },
      ],
      readout: f => 'HR ' + fmt(f.est.hr) + ' bpm · rhythm ' + (f.est.rhythmLabel || '--') + ' · QRS width ' + fmt(f.est.qrsWidthMs) + ' ms (filtered trace)',
    },
    ppg: {
      title: 'SpO₂ / pleth', color: '--pleth', window: 6,
      intro: 'Two LEDs shine through the finger → one photodiode → red and infrared signals → AC/DC separation → ratio of ratios → calibration line → SpO₂.',
      stages: [
        { tap: 'ppg.red', name: 'Red channel at the photodiode', unit: 'norm.',
          note: 'Transmitted red light. Each pulse adds blood, absorbs more light and makes a small dip on a large DC level.' },
        { tap: 'ppg.ir', name: 'Infrared channel at the photodiode', unit: 'norm.',
          note: 'Transmitted infrared light. Its pulsatile part relative to red depends on the oxygen saturation.' },
        { tap: 'ppg.ac', name: 'ln, 0.1–10 Hz band-pass, inverted (IR)', unit: 'a.u.',
          note: 'The AC part of ln(I). This is the pleth trace: systolic peak, dicrotic notch, diastolic (reflected) wave. R uses the 0.5–5 Hz band: R = RMS(AC red) / RMS(AC IR) over 4 s, then SpO₂ ≈ 110 − 25·R.' },
      ],
      readout: (f, e) => {
        const o = e.spo2Est.out;
        return 'R ' + fmt(o.ratio, 3) + ' → SpO₂ (instant) ' + fmt(o.spo2Inst, 1) + ' % · averaged ' + fmt(f.est.spo2) + ' % · SQI ' + fmt(f.est.sqi) + ' · ' + f.est.spo2Status;
      },
    },
    resp: {
      title: 'Respiration', color: '--resp', window: 20,
      intro: 'Small carrier current through the ECG electrodes → chest impedance change → demodulation → band-pass → hysteresis breath counter.',
      stages: [
        { tap: 'resp.raw', name: 'Demodulated impedance', unit: 'Ω',
          note: 'Breathing changes the chest impedance. A small cardiogenic ripple and noise ride on top.' },
        { tap: 'resp.bp', name: '0.1–1 Hz band-pass and hysteresis', unit: 'Ω', marks: e => e.breath.breaths,
          lines: e => [e.p.resp_thr, -e.p.resp_thr],
          note: 'Dashed lines: ± detection threshold. A breath counts when the signal crosses below −h and then above +h. Ticks: counted breaths.' },
      ],
      readout: (f, e) => 'RR ' + (f.est.apnea ? 'APNEA' : fmt(f.est.rr)) + ' br/min · threshold ±' + e.p.resp_thr + ' Ω',
    },
    art: {
      title: 'Arterial line', color: '--art', window: 5, shared: true,
      intro: 'Arterial pressure → fluid-filled catheter and tubing → transducer (2nd-order system) → hydrostatic offset → numbers over 4 s.',
      stages: [
        { tap: 'art.true', name: 'Pressure in the artery', unit: 'mmHg',
          note: 'Set systolic and diastolic pressure, scaled by the perfusion state. The transducer has to reproduce this.' },
        { tap: 'art.meas', name: 'Transducer output', unit: 'mmHg', ghost: 'art.true',
          note: 'Grey: the true pressure. Under-damping overshoots and rings, over-damping blunts the peaks, a transducer above the heart reads low.' },
      ],
      readout: (f, e) => {
        const a = f.est.art, d = PM.engine.IBP_DAMPING[e.p.ibp_damping];
        return (a ? 'ART ' + fmt(a.sys) + '/' + fmt(a.dia) + ' (' + fmt(a.map) + ') mmHg' : 'ART --') + ' · fn ' + d.fn + ' Hz, ζ ' + d.zeta + ' · height ' + e.p.ibp_height_cm + ' cm';
      },
    },
    cap: {
      title: 'Capnography', color: '--co2', window: 20,
      intro: 'Gas sample from the airway → infrared CO₂ absorption → CO₂ partial pressure → breath detector → EtCO₂, FiCO₂ and airway RR.',
      stages: [
        { tap: 'cap.meas', name: 'CO₂ partial pressure', unit: 'mmHg', floor0: true,
          note: 'Phase I: dead space. Phase II: rise. Phase III: alveolar plateau. EtCO₂ is the peak of each breath; FiCO₂ the inspired minimum.' },
      ],
      readout: f => 'EtCO₂ ' + fmt(f.est.etco2) + ' · FiCO₂ ' + fmt(f.est.fico2) + ' mmHg · awRR ' + fmt(f.est.awrr) + ' br/min',
    },
  };

  function range(arrs, floor0) {
    let lo = Infinity, hi = -Infinity;
    for (const a of arrs) for (const v of a) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo === Infinity) return null;
    if (floor0) lo = Math.min(0, lo);
    if (hi - lo < 1e-9) { hi += 0.5; lo -= 0.5; }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
  }

  /** Scrolling plot: newest sample at the right edge. */
  function drawStage(cv, o) {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const { data, fs, win, tEnd, color, ghost, lines, marks, thr, lohi, unit } = o;
    const top = 6, bot = h - 16;
    const xOf = t => w - (tEnd - t) / win * w;
    // time grid every second
    ctx.strokeStyle = 'rgba(120,140,160,0.18)'; ctx.fillStyle = 'rgba(160,175,190,0.75)'; ctx.font = '10px system-ui, sans-serif'; ctx.lineWidth = 1;
    const step = win > 10 ? 5 : 1;
    for (let s = Math.ceil((tEnd - win) / step) * step; s <= tEnd; s += step) {
      const x = Math.round(xOf(s)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
      ctx.fillText(s.toFixed(0) + ' s', x + 2, h - 4);
    }
    if (!data || data.length < 2 || !lohi) {
      ctx.fillText('collecting samples…', 10, h / 2);
      return;
    }
    const [lo, hi] = lohi;
    const yOf = v => bot - (v - lo) / (hi - lo) * (bot - top);
    ctx.fillText(fmt(hi, Math.abs(hi) < 10 ? 2 : 0) + ' ' + unit, 4, top + 9);
    ctx.fillText(fmt(lo, Math.abs(lo) < 10 ? 2 : 0), 4, bot - 2);
    const trace = (arr, style, width, dash) => {
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      let pen = false, gapStart = null;
      const t0 = tEnd - (arr.length - 1) / fs;
      for (let j = 0; j < arr.length; j++) {
        const v = arr[j], x = xOf(t0 + j / fs);
        if (!Number.isFinite(v)) { pen = false; if (gapStart === null) gapStart = x; continue; }
        if (gapStart !== null && !dash) { hatch(ctx, gapStart, top, x - gapStart, bot - top); gapStart = null; }
        const y = Math.max(top, Math.min(bot, yOf(v)));
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      }
      ctx.stroke(); ctx.setLineDash([]);
      if (gapStart !== null && !dash) hatch(ctx, gapStart, top, w - gapStart, bot - top);
    };
    if (ghost) trace(ghost, 'rgba(200,210,225,0.45)', 1.2);
    if (thr) trace(thr, 'rgba(255,255,255,0.7)', 1, [5, 4]);
    for (const v of lines || []) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, yOf(v)); ctx.lineTo(w, yOf(v)); ctx.stroke(); ctx.setLineDash([]);
    }
    trace(data, color, 1.5);
    ctx.fillStyle = '#ffffff';
    for (const t of marks || []) {
      const x = xOf(t);
      if (x >= 0 && x <= w) ctx.fillRect(Math.round(x) - 1, top, 2, 9);
    }
  }

  function init(opts) {
    const getEngine = opts.getEngine;
    const sel = $('#chSel'), box = $('#chStages');
    for (const [id, c] of Object.entries(CHAINS)) sel.append(el('option', { value: id, text: c.title }));
    let canvases = [];

    function build() {
      const c = CHAINS[sel.value];
      $('#chIntro').textContent = c.intro;
      box.textContent = '';
      canvases = c.stages.map((s, i) => {
        const cv = el('canvas.plot.stage-plot', { 'aria-label': c.title + ' stage ' + (i + 1) + ': ' + s.name });
        box.append(el('div.stage', null,
          el('div.stage-head', null, el('span.stage-n', { text: String(i + 1) }), el('b', { text: s.name }), el('span.muted', { text: ' ' + s.unit })),
          cv, el('p.hint', { text: s.note })));
        return cv;
      });
    }
    sel.addEventListener('change', () => { build(); draw(); });
    $('#chPng').addEventListener('click', () => {
      if (canvases.length) canvasPng(canvases[canvases.length - 1], 'pm-sim-chain-' + sel.value + '-' + stamp() + '.png');
    });

    function draw() {
      const e = getEngine(), c = CHAINS[sel.value];
      if (!e.taps) return;
      const color = cssVar(c.color) || '#9ad', get = (name, sec) => {
        const r = e.taps[name];
        return r ? { fs: r.fs, data: r.last(Math.round(sec * r.fs)) } : { fs: 1, data: null };
      };
      const series = c.stages.map(s => get(s.tap, c.window));
      const shared = c.shared ? range([...series.map(x => x.data || []), ...c.stages.map(s => (s.ghost ? get(s.ghost, c.window).data || [] : []))]) : null;
      c.stages.forEach((s, i) => {
        const x = series[i], ghost = s.ghost ? get(s.ghost, c.window).data : null;
        const thr = s.line ? get(s.line, c.window).data : null;
        drawStage(canvases[i], {
          data: x.data, fs: x.fs, win: c.window, tEnd: e.t, color, unit: s.unit, ghost, thr,
          lines: s.lines ? s.lines(e) : null, marks: s.marks ? s.marks(e) : null,
          lohi: shared || range([x.data || [], thr ? thr.filter(Number.isFinite).slice(-1) : []], s.floor0),
        });
      });
      const f = e.lastFrame;
      $('#chReadout').textContent = f ? c.readout(f, e) : '';
    }

    build();
    return { draw, CHAINS };
  }

  root.PM.chainPanel = { init, CHAINS };
})(this);
