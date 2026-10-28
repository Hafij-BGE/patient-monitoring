/* Sweep-mode waveform renderer. Reads the engine's ring buffers; draws NaN
 * samples (signal lost) as hatched gaps, never as a flat line or zero.
 * Horizontal scale: sweep speed in mm/s; vertical ECG scale: gain in mm/mV.
 * Screen calibration assumes the CSS reference of 96 px per inch. */
(function (root) {
  'use strict';
  const { fitCanvas, hatch } = root.PM.dom;
  const PX_PER_MM = 96 / 25.4;
  const ERASE_PX = 14; // blank bar ahead of the write cursor

  class SweepView {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} o  ring(): Ring, fs(): Hz, color, scale: 'ecg' | 'auto' | [lo, hi], grid: bool
     */
    constructor(canvas, o) {
      this.cv = canvas; this.o = o;
      this.lo = null; this.hi = null; // smoothed auto-scale range
    }

    draw(tNow, sweep, gain) {
      const { ctx, w, h } = fitCanvas(this.cv);
      ctx.clearRect(0, 0, w, h);
      const ring = this.o.ring(), fs = this.o.fs();
      const pxPerSec = sweep * PX_PER_MM;
      const Tw = w / pxPerSec;
      if (this.o.grid) this.grid(ctx, w, h);
      const n = Math.max(0, Math.min(ring.total, ring.cap, Math.floor((Tw - ERASE_PX / pxPerSec) * fs)));
      if (n < 2) return { n };
      const arr = ring.last(n);

      // vertical mapping
      let map;
      if (this.o.scale === 'ecg') {
        const pxPerMv = gain * PX_PER_MM, mid = h * 0.55;
        map = v => mid - v * pxPerMv;
        this.calPulse(ctx, mid, pxPerMv);
      } else if (Array.isArray(this.o.scale)) {
        const [lo, hi] = this.o.scale;
        map = v => h - 4 - (v - lo) / (hi - lo) * (h - 18);
      } else {
        let lo = Infinity, hi = -Infinity;
        for (const v of arr) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
        if (lo === Infinity) { lo = 0; hi = 1; }
        if (hi - lo < 1e-9) { hi += 0.5; lo -= 0.5; }
        if (this.lo === null) { this.lo = lo; this.hi = hi; }
        else { this.lo += (lo - this.lo) * 0.08; this.hi += (hi - this.hi) * 0.08; }
        const L = Math.min(this.lo, lo), H = Math.max(this.hi, hi), pad = (H - L) * 0.1;
        map = v => h - 6 - (v - (L - pad)) / ((H + pad) - (L - pad)) * (h - 22);
      }

      const xOf = j => (((tNow - (n - 1 - j) / fs) % Tw) + Tw) % Tw * pxPerSec;
      const spp = fs / pxPerSec;                    // samples per pixel
      const stride = spp > 3 ? Math.floor(spp / 2) : 1;
      ctx.strokeStyle = this.o.color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false, prevX = -1, nanX = null;
      const gaps = [];
      const closeGap = x => {
        if (nanX === null) return;
        if (x >= nanX) gaps.push([nanX, x]); else { gaps.push([nanX, w]); gaps.push([0, x]); }
        nanX = null;
      };
      for (let j = 0; j < n; j += stride) {
        const x = xOf(j);
        if (x < prevX) started = false; // wrapped to the left edge
        prevX = x;
        let iMin = -1, iMax = -1, bad = false;
        for (let k = j; k < Math.min(n, j + stride); k++) {
          const v = arr[k];
          if (!Number.isFinite(v)) { bad = true; break; }
          if (iMin < 0 || v < arr[iMin]) iMin = k;
          if (iMax < 0 || v > arr[iMax]) iMax = k;
        }
        if (bad) { if (nanX === null) nanX = x; started = false; continue; }
        closeGap(x);
        const pts = iMin === iMax ? [iMin] : iMin < iMax ? [iMin, iMax] : [iMax, iMin];
        for (const k of pts) {
          const y = Math.max(1, Math.min(h - 1, map(arr[k])));
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      if (nanX !== null) closeGap(xOf(n - 1) + 1);
      for (const [a, b] of gaps) hatch(ctx, a, 14, b - a, h - 16);
      if (gaps.length) {
        ctx.fillStyle = 'rgba(200,210,225,0.85)'; ctx.font = '11px system-ui, sans-serif';
        const [a, b] = gaps[gaps.length - 1];
        if (b - a > 60) ctx.fillText('no signal', a + 6, h / 2);
      }
      // write cursor
      const xc = xOf(n - 1);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(xc + 1, 0, 1, h);
      return { n, gaps: gaps.length, Tw };
    }

    grid(ctx, w, h) {
      const step = 5 * PX_PER_MM; // 5 mm major grid
      ctx.strokeStyle = 'rgba(120,140,160,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
      for (let y = h * 0.55 % step; y < h; y += step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
      ctx.stroke();
    }

    /** 1 mV calibration step at the right edge. */
    calPulse(ctx, mid, pxPerMv) {
      const x = this.cv.clientWidth - 5 * PX_PER_MM - 6;
      ctx.strokeStyle = 'rgba(220,230,240,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 4, mid); ctx.lineTo(x, mid); ctx.lineTo(x, mid - pxPerMv); ctx.lineTo(x + 5 * PX_PER_MM, mid - pxPerMv);
      ctx.lineTo(x + 5 * PX_PER_MM, mid); ctx.lineTo(x + 5 * PX_PER_MM + 4, mid);
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,230,240,0.7)'; ctx.font = '10px system-ui, sans-serif';
      ctx.fillText('1 mV', x, mid - pxPerMv - 3);
    }
  }

  root.PM.waveforms = { SweepView, PX_PER_MM };
})(this);
