/* Glucose tab: meal and insulin events "now", and a model projection (forecast)
 * with planned events. All model maths is in src/sim/glucose.js; this file only
 * reads the engine and draws. Browser only. */
(function (root) {
  'use strict';
  const PM = root.PM;
  const { $, el, fmt, fitCanvas, canvasPng, stamp } = PM.dom;
  const G = PM.glucose;

  // Input limits for events (illustrative teaching ranges, not dosing guidance).
  const LIM = { carbs: [0, 200, 'g'], units: [0, 30, 'U'] };
  const LINES = [[54, '54 level 2 low', '#ff4d4f'], [70, '70', '#ffb020'], [180, '180', '#ffb020'], [250, '250 level 2 high', '#ff4d4f']];

  function init(opts) {
    const eng = () => opts.getEngine();
    const msg = $('#gluMsg');
    $('#gluNotice').textContent = G.NOTICE + ' The forecast runs the same population model forward; it does not learn from data and is not dosing advice.';

    /** Reads a number field; returns null (and a message) when outside its range. */
    function read(id, kind, label, max) {
      const v = Number($(id).value), [lo, hi, unit] = LIM[kind] || [0, max, 'min'];
      const top = max === undefined ? hi : max;
      if ($(id).value.trim() === '' || !Number.isFinite(v) || v < lo || v > top) {
        msg.append(el('div.err', { text: label + ' must be ' + lo + '–' + top + ' ' + unit + '.' }));
        return null;
      }
      return v;
    }

    function give(kind) {
      msg.textContent = '';
      const id = kind === 'carbs' ? '#gluMealNow' : '#gluBolusNow';
      const v = read(id, kind, kind === 'carbs' ? 'Meal' : 'Bolus');
      if (v === null || v === 0) return;
      const e = eng();
      if (kind === 'carbs') e.giveMeal(v); else e.giveBolus(v);
      const at = e.lastFrame ? e.lastFrame.est.gluMin : 0;
      msg.append(el('div.ok', { text: (kind === 'carbs' ? 'Meal ' + v + ' g carbohydrate' : 'Insulin bolus ' + v + ' U') + ' given at model minute ' + fmt(at) + '.' }));
      draw();
    }
    $('#gluMealBtn').addEventListener('click', () => give('carbs'));
    $('#gluBolusBtn').addEventListener('click', () => give('units'));
    for (const id of ['#gluHorizon', '#gluPlanMeal', '#gluPlanMealAt', '#gluPlanBolus', '#gluPlanBolusAt'])
      $(id).addEventListener('change', () => { msg.textContent = ''; draw(); });
    $('#gluPng').addEventListener('click', () => canvasPng($('#cvGlu'), 'vitalslab-glucose-projection-' + stamp() + '.png'));

    let last = null;
    /** Planned events from the form, or null when a field is invalid. */
    function plan(horizon) {
      const carbs = read('#gluPlanMeal', 'carbs', 'Planned meal'), cAt = read('#gluPlanMealAt', 'at', 'Meal time', horizon);
      const units = read('#gluPlanBolus', 'units', 'Planned bolus'), uAt = read('#gluPlanBolusAt', 'at', 'Bolus time', horizon);
      if ([carbs, cAt, units, uAt].includes(null)) return null;
      const ev = [];
      if (carbs > 0) ev.push({ at: cAt, carbs });
      if (units > 0) ev.push({ at: uAt, units });
      return ev;
    }

    function draw() {
      const e = eng(), horizon = Number($('#gluHorizon').value);
      const ev = plan(horizon);
      if (ev === null) return;
      const withPlan = e.glucoseForecast(horizon, ev), none = e.glucoseForecast(horizon, []);
      last = { withPlan, none, ev, horizon };
      plot($('#cvGlu'), last);
      summary(last, e);
    }

    function summary(r, e) {
      const c = r.withPlan.cross, box = $('#gluSummary'); box.textContent = '';
      const when = m => m === null ? 'not within ' + r.horizon / 60 + ' h' : 'in ' + m + ' min';
      const v = e.lastFrame ? e.lastFrame.est : null;
      box.append(
        el('div', null, 'Now: ', el('b', { text: v ? fmt(v.glucose) + ' mg/dL' : '--' }), ' (', v ? G.toMmol(v.glucose).toFixed(1) : '--', ' mmol/L) · insulin ',
          el('b', { text: v ? fmt(v.insulin, 1) + ' µU/mL' : '--' }), ' · model minute ', v ? fmt(v.gluMin) : '--',
          ' · ', G.TYPES[e.p.diabetes].label),
        el('div', null, 'Projection with plan: range ', el('b', { text: fmt(r.withPlan.minG) + '–' + fmt(r.withPlan.maxG) + ' mg/dL' }),
          ' · time in 70–180 mg/dL ', el('b', { text: fmt(r.withPlan.tir) + ' %' }), ' of the next ' + r.horizon / 60 + ' h'),
        el('div', null, 'Below 70: ', el('b', { text: when(c.below70) }), ' · below 54: ', el('b', { text: when(c.below54) }),
          ' · above 180: ', el('b', { text: when(c.above180) }), ' · above 250: ', el('b', { text: when(c.above250) })),
        el('div.muted', { text: 'Without the plan (dashed): ' + fmt(r.none.minG) + '–' + fmt(r.none.maxG) + ' mg/dL, time in range ' + fmt(r.none.tir) + ' %.' }));
    }

    function plot(cv, r) {
      const { ctx, w, h } = fitCanvas(cv);
      ctx.clearRect(0, 0, w, h);
      const all = r.withPlan.G.concat(r.none.G);
      const g0 = Math.max(0, Math.min(40, Math.min(...all) - 10)), g1 = Math.max(260, Math.max(...all) + 20);
      const L = 48, R = 12, T = 24, B = 40, pw = w - L - R, ph = h - T - B;
      const X = m => L + m / r.horizon * pw, Y = g => T + (1 - (g - g0) / (g1 - g0)) * ph;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(80,200,120,0.10)'; ctx.fillRect(L, Y(180), pw, Y(70) - Y(180));
      ctx.strokeStyle = 'rgba(140,155,175,0.25)'; ctx.fillStyle = '#9fb0c4'; ctx.beginPath();
      for (let m = 0; m <= r.horizon; m += 30) { const x = Math.round(X(m)) + 0.5; ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.fillText(String(m), x - 8, h - 24); }
      for (let g = 50 * Math.ceil(g0 / 50); g <= g1; g += 50) { const y = Math.round(Y(g)) + 0.5; ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.fillText(String(g), 8, y + 4); }
      ctx.stroke();
      ctx.fillText('minutes from now (model time)', L + pw / 2 - 80, h - 6);
      ctx.fillText('mg/dL', 8, 14);
      for (const [g, lab, col] of LINES) {
        if (g < g0 || g > g1) continue;
        ctx.strokeStyle = col; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(L, Y(g)); ctx.lineTo(L + pw, Y(g)); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = col; ctx.fillText(lab, L + pw - ctx.measureText(lab).width - 2, Y(g) - 3);
      }
      const line = (arr, col, dash) => {
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath();
        arr.forEach((g, m) => m ? ctx.lineTo(X(m), Y(g)) : ctx.moveTo(X(m), Y(g)));
        ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      };
      line(r.none.G, '#7d8a9c', [6, 4]);
      line(r.withPlan.G, '#5ec8ff', []);
      for (const e of r.ev) {
        ctx.fillStyle = e.carbs ? '#f2c94c' : '#b9a6ff';
        const x = X(e.at); ctx.fillRect(x - 1, T, 2, ph);
        ctx.fillText(e.carbs ? e.carbs + ' g' : e.units + ' U', x + 3, T + ph - 4);
      }
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('MODEL PROJECTION, NOT A CLINICAL PREDICTION', L + 6, 14);
    }

    return { draw, last: () => last };
  }

  (PM.glucosePanel = {}).init = init;
})(this);
