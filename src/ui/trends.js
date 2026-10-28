/* Trend plot (one parameter, one line/marker set per source, gaps hatched)
 * and the NIBP oscillogram plot. Browser only. */
(function (root) {
  'use strict';
  const { fitCanvas, hatch, cssVar } = root.PM.dom;
  const { ObservationStore, findGaps } = root.PM.store;
  const timeOf = ObservationStore.timeOf;

  const MARKERS = { simulated: 'none', derived: 'diamond', device: 'circle', imported: 'square', user: 'triangle' };
  const srcColor = s => cssVar('--src-' + s) || '#999';

  function marker(ctx, kind, x, y) {
    ctx.beginPath();
    if (kind === 'circle') ctx.arc(x, y, 3.2, 0, 2 * Math.PI);
    else if (kind === 'square') ctx.rect(x - 3, y - 3, 6, 6);
    else if (kind === 'triangle') { ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); ctx.closePath(); }
    else if (kind === 'diamond') { ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); }
    ctx.fill();
  }

  function niceTicks(lo, hi, n) {
    const span = hi - lo, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  const fmtTime = (ms, span) => {
    const d = new Date(ms);
    const p = x => String(x).padStart(2, '0');
    const hms = p(d.getHours()) + ':' + p(d.getMinutes()) + (span < 3 * 3600e3 ? ':' + p(d.getSeconds()) : '');
    return span > 36 * 3600e3 ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hms : hms;
  };

  /**
   * @param canvas
   * @param o {store, param, sources[], t0, t1 (ms or null = fit), unit, label}
   * @returns stats per source and the gaps found
   */
  function drawTrend(canvas, o) {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const series = o.sources.map(s => ({ source: s, obs: o.store.get(s, o.param) })).filter(s => s.obs.length);
    let t0 = o.t0, t1 = o.t1;
    if (t0 === null || t1 === null) {
      const ts = series.flatMap(s => [timeOf(s.obs[0]), timeOf(s.obs[s.obs.length - 1])]);
      if (!ts.length) { empty(ctx, w, h, 'No ' + o.label + ' data from the selected sources'); return { series: [] }; }
      t0 = Math.min(...ts); t1 = Math.max(...ts);
      if (t1 - t0 < 60e3) { t0 -= 30e3; t1 += 30e3; }
    }
    const inWin = s => s.obs.filter(x => { const t = timeOf(x); return t >= t0 && t <= t1; });
    series.forEach(s => { s.win = inWin(s); });
    const vals = series.flatMap(s => s.win.map(x => x.value).filter(v => v !== null));
    if (!vals.length) { empty(ctx, w, h, 'No ' + o.label + ' values in this window'); return { series: [] }; }
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const L = 48, R = 10, T = 10, B = 24, pw = w - L - R, ph = h - T - B;
    const X = t => L + (t - t0) / (t1 - t0) * pw, Y = v => T + (1 - (v - lo) / (hi - lo)) * ph;

    // axes
    ctx.strokeStyle = 'rgba(140,155,175,0.25)'; ctx.fillStyle = '#9fb0c4'; ctx.font = '11px system-ui, sans-serif'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const v of niceTicks(lo, hi, 5)) { const y = Math.round(Y(v)) + 0.5; ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.fillText(String(v), 4, y + 4); }
    const span = t1 - t0, nt = Math.max(2, Math.floor(pw / 110));
    for (let i = 0; i <= nt; i++) { const t = t0 + span * i / nt, x = Math.round(X(t)) + 0.5; ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.fillText(fmtTime(t, span), Math.min(x - 20, w - 70), h - 6); }
    ctx.stroke();
    ctx.fillText(o.unit, 4, T + 2 + 8);

    const out = [];
    for (const s of series) {
      const color = srcColor(s.source), win = s.win;
      // expected spacing: median step; a gap is > 3× that (simulated: 1 s)
      const steps = [];
      for (let i = 1; i < s.obs.length; i++) steps.push(timeOf(s.obs[i]) - timeOf(s.obs[i - 1]));
      steps.sort((a, b) => a - b);
      const med = steps.length ? steps[steps.length >> 1] : 1000;
      const maxGap = Math.max(3 * med, 3000);
      const gaps = findGaps(win, maxGap);
      for (const g of gaps) hatch(ctx, X(Math.max(g.start, t0)), T, X(Math.min(g.end, t1)) - X(Math.max(g.start, t0)), ph, color);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6;
      ctx.beginPath();
      let prev = null;
      for (const x of win) {
        const t = timeOf(x);
        if (x.value === null) { prev = null; continue; }
        const px = X(t), py = Y(x.value);
        if (prev && t - prev <= maxGap) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        prev = t;
      }
      ctx.stroke();
      if (MARKERS[s.source] !== 'none' || win.length < 40) {
        for (const x of win) if (x.value !== null) {
          ctx.globalAlpha = x.quality === 'ok' ? 1 : 0.45;
          marker(ctx, MARKERS[s.source] === 'none' ? 'circle' : MARKERS[s.source], X(timeOf(x)), Y(x.value));
        }
        ctx.globalAlpha = 1;
      }
      out.push({ source: s.source, n: win.length, gaps, values: win });
    }
    // legend
    let lx = L + 6;
    ctx.font = '11px system-ui, sans-serif';
    for (const s of out) {
      ctx.fillStyle = srcColor(s.source);
      marker(ctx, MARKERS[s.source] === 'none' ? 'square' : MARKERS[s.source], lx + 4, T + 8);
      ctx.fillText(s.source + ' (' + s.n + ')', lx + 12, T + 12);
      lx += ctx.measureText(s.source + ' (' + s.n + ')').width + 28;
    }
    return { series: out, t0, t1 };
  }

  function empty(ctx, w, h, msg) {
    ctx.fillStyle = '#8a98aa'; ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(msg, 16, h / 2);
  }

  /** NIBP oscillogram: beat amplitudes vs cuff pressure, envelope, Ks/Kd crossings. */
  function drawOscillogram(canvas, res, ks, kd) {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!res || !res.envelope) { empty(ctx, w, h, res && res.error ? 'Last measurement failed: ' + res.error : 'No measurement yet. Press "Start NIBP".'); return; }
    const env = res.envelope, sm = res.smooth || [];
    const ps = env.map(b => b.pc), as = env.map(b => b.amp);
    const p0 = Math.min(...ps, res.dbp || Infinity) - 10, p1 = Math.max(...ps, res.sbp || -Infinity) + 10;
    const aMax = Math.max(...as) * 1.15 || 1;
    const L = 44, R = 10, T = 12, B = 26, pw = w - L - R, ph = h - T - B;
    const X = p => L + (p - p0) / (p1 - p0) * pw, Y = a => T + (1 - a / aMax) * ph;
    ctx.strokeStyle = 'rgba(140,155,175,0.25)'; ctx.fillStyle = '#9fb0c4'; ctx.font = '11px system-ui, sans-serif';
    ctx.beginPath();
    for (const p of niceTicks(p0, p1, 8)) { const x = Math.round(X(p)) + 0.5; ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.fillText(String(p), x - 8, h - 8); }
    ctx.stroke();
    ctx.fillText('cuff pressure (mmHg)', w - 130, h - 8);
    ctx.save(); ctx.translate(12, T + ph / 2 + 50); ctx.rotate(-Math.PI / 2); ctx.fillText('oscillation amplitude (mmHg)', 0, 0); ctx.restore();
    for (const b of env) { ctx.fillStyle = b.rejected ? '#ff5d5d' : '#ef7fb8'; marker(ctx, 'circle', X(b.pc), Y(b.amp)); }
    if (sm.length) {
      ctx.strokeStyle = '#f7d0e4'; ctx.lineWidth = 1.8; ctx.beginPath();
      sm.forEach((b, i) => i ? ctx.lineTo(X(b.pc), Y(b.amp)) : ctx.moveTo(X(b.pc), Y(b.amp)));
      ctx.stroke();
    }
    if (!res.error) {
      const am = Math.max(...sm.map(b => b.amp));
      const vline = (p, label, color) => {
        ctx.strokeStyle = color; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(p), T); ctx.lineTo(X(p), T + ph); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.fillText(label, X(p) + 3, T + 10);
      };
      vline(res.sbp, 'SYS ' + res.sbp.toFixed(0), '#ffd27a');
      vline(res.mapOsc, 'MAP ' + res.mapOsc.toFixed(0), '#9ae6b4');
      vline(res.dbp, 'DIA ' + res.dbp.toFixed(0), '#7cc7ff');
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      for (const [k, lab] of [[ks, 'Ks'], [kd, 'Kd']]) {
        const y = Y(k * am); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
        ctx.fillStyle = '#cbd5e1'; ctx.fillText(lab + ' = ' + k + ' × max', L + 4, y - 3);
      }
    } else {
      ctx.fillStyle = '#ff9b9b'; ctx.fillText('Failed: ' + res.error, L + 6, T + 12);
    }
  }

  root.PM.trends = { drawTrend, drawOscillogram, niceTicks };
})(this);
