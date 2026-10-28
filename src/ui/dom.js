/* Small DOM helpers shared by the UI modules. Browser only. */
(function (root) {
  'use strict';

  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));

  /** el('div.cls', {attr}, children...) — text children are escaped. */
  function el(tag, attrs, ...kids) {
    const [name, ...cls] = tag.split('.');
    const n = document.createElement(name);
    if (cls.length) n.className = cls.join(' ');
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked') n.checked = !!v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
  }

  /** Number formatting that never turns missing into 0. */
  function fmt(v, digits) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '--';
    return digits === undefined ? String(Math.round(v)) : v.toFixed(digits);
  }

  function download(name, text, type) {
    // Android app: <a download> does nothing in the WebView, so use the native save dialog.
    const A = root.PMAndroid;
    if (A && root.PM.androidBridge) {
      if (typeof text === 'string') A.saveText(name, type || 'text/plain', text);
      else text.arrayBuffer().then(buf => A.saveBase64(name, text.type || type || 'application/octet-stream', root.PM.androidBridge.toBase64(buf)));
      return;
    }
    const blob = text instanceof Blob ? text : new Blob([text], { type: type || 'text/plain' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function canvasPng(canvas, name) {
    canvas.toBlob(b => { if (b) download(name, b); }, 'image/png');
  }

  /** Size a canvas backing store to its CSS box × devicePixelRatio. Returns {ctx, w, h} in CSS px. */
  function fitCanvas(cv) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, cv.clientWidth), h = Math.max(10, cv.clientHeight);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /** Diagonal hatch fill for "no data" regions. */
  function hatch(ctx, x, y, w, h, color) {
    if (w <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = 'rgba(120,130,145,0.12)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color || 'rgba(140,150,165,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = x - h; k < x + w; k += 8) { ctx.moveTo(k, y + h); ctx.lineTo(k + h, y); }
    ctx.stroke(); ctx.restore();
  }

  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  (root.PM = root.PM || {}).dom = { $, $$, el, fmt, download, canvasPng, fitCanvas, hatch, cssVar, stamp };
})(this);
