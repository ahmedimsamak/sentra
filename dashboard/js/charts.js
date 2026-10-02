/* ==========================================================================
   SENTRA — Lightweight Canvas Charts (no dependencies)
   Colours are read from CSS variables at draw time, so charts follow the
   active light/dark theme automatically.
   ========================================================================== */
'use strict';

const Charts = {
  registry: new Map(),

  theme() {
    return {
      grid: U.cssVar('--chart-grid'),
      axis: U.cssVar('--text-3'),
      text: U.cssVar('--text-2'),
      surface: U.cssVar('--surface'),
      warn: U.cssVar('--warn'),
      danger: U.cssVar('--danger')
    };
  },

  color(token) { return token.startsWith('--') ? U.cssVar(token) : token; },

  setup(canvas) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(200, Math.floor(rect.width));
    const height = Number(canvas.dataset.height || 220);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '11px Inter, "Segoe UI", system-ui, sans-serif';
    return { ctx, width, height };
  },

  bindHover(canvas) {
    if (canvas._hoverBound) return;
    canvas._hoverBound = true;
    canvas.addEventListener('mousemove', (e) => {
      const meta = canvas._meta;
      if (!meta) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = U.clamp(Math.round((x - meta.left) / meta.step), 0, meta.count - 1);
      if (canvas._hover !== idx) { canvas._hover = idx; Charts.redraw(canvas); }
      Charts.tooltip(canvas, idx, e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseleave', () => {
      canvas._hover = null;
      Charts.redraw(canvas);
      U.$('#chart-tip').hidden = true;
    });
  },

  tooltip(canvas, idx, cx, cy) {
    const cfg = canvas._config;
    const tip = U.$('#chart-tip');
    const rows = cfg.series.map((s) => {
      const v = s.data[idx];
      if (v === undefined) return '';
      return `<div class="tip-row"><i style="background:${Charts.color(s.color)}"></i>${U.esc(s.label)}<b>${U.num(v, cfg.decimals ?? 1)}${cfg.unit ? ' ' + cfg.unit : ''}</b></div>`;
    }).join('');
    tip.innerHTML = `<div class="tip-title">${U.esc(cfg.labels[idx] ?? '')}</div>${rows}`;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(window.innerWidth - w - 8, cx + 14)}px`;
    tip.style.top = `${cy + 14}px`;
  },

  redraw(canvas) {
    const cfg = canvas._config;
    if (!cfg) return;
    if (cfg.kind === 'bar') Charts.bar(canvas, cfg); else Charts.line(canvas, cfg);
  },

  niceRange(min, max) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
    const err = (span / 4) / step;
    const mult = err >= 5 ? 10 : err >= 2 ? 5 : err >= 1.5 ? 2 : 1;
    const nice = mult * step;
    return { min: Math.floor(min / nice) * nice, max: Math.ceil(max / nice) * nice, step: nice };
  },

  /**
   * Line chart.
   * cfg: { labels, series:[{label,data,color,fill}], unit, decimals, thresholds:[{value,label,tone}], yMin, yMax }
   */
  line(canvas, cfg) {
    if (!canvas || !canvas.isConnected || canvas.offsetParent === null) return;
    canvas._config = { ...cfg, kind: 'line' };
    Charts.bindHover(canvas);
    const { ctx, width, height } = Charts.setup(canvas);
    const t = Charts.theme();
    const pad = { left: 44, right: 12, top: 12, bottom: 24 };
    const count = cfg.labels.length;
    const all = cfg.series.flatMap((s) => s.data);
    (cfg.thresholds || []).forEach((th) => all.push(th.value));
    let lo = cfg.yMin ?? Math.min(...all);
    let hi = cfg.yMax ?? Math.max(...all);
    const r = Charts.niceRange(lo, hi + (hi - lo) * 0.08);
    lo = cfg.yMin ?? r.min; hi = r.max;
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const step = plotW / Math.max(1, count - 1);
    const y = (v) => pad.top + plotH - ((v - lo) / (hi - lo)) * plotH;
    const x = (i) => pad.left + i * step;
    canvas._meta = { left: pad.left, step, count };

    // Grid + y labels
    ctx.strokeStyle = t.grid; ctx.fillStyle = t.axis; ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = lo; v <= hi + 1e-9; v += r.step) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
      ctx.fillText(U.num(v, r.step < 1 ? (r.step < 0.1 ? 2 : 1) : 0), pad.left - 8, yy);
    }
    // X labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const every = Math.max(1, Math.ceil(count / Math.max(2, Math.floor(plotW / 70))));
    for (let i = 0; i < count; i += every) ctx.fillText(cfg.labels[i] ?? '', x(i), height - pad.bottom + 7);

    // Thresholds
    (cfg.thresholds || []).forEach((th) => {
      if (th.value < lo || th.value > hi) return;
      const col = th.tone === 'danger' ? t.danger : t.warn;
      ctx.save();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = col; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(pad.left, y(th.value)); ctx.lineTo(width - pad.right, y(th.value)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(th.label, width - pad.right - 2, y(th.value) - 2);
      ctx.restore();
    });

    // Series
    cfg.series.forEach((s) => {
      const col = Charts.color(s.color);
      if (s.data.length < 2) return;
      ctx.beginPath();
      s.data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      if (s.fill) {
        ctx.save();
        ctx.lineTo(x(s.data.length - 1), pad.top + plotH);
        ctx.lineTo(x(0), pad.top + plotH);
        ctx.closePath();
        ctx.globalAlpha = 0.1; ctx.fillStyle = col; ctx.fill();
        ctx.restore();
        ctx.beginPath();
        s.data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      }
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      const last = s.data.length - 1;
      ctx.beginPath(); ctx.arc(x(last), y(s.data[last]), 3, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    });

    // Hover crosshair
    if (canvas._hover !== null && canvas._hover !== undefined) {
      const hx = x(canvas._hover);
      ctx.strokeStyle = t.axis; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(hx, pad.top); ctx.lineTo(hx, pad.top + plotH); ctx.stroke();
      ctx.globalAlpha = 1;
      cfg.series.forEach((s) => {
        const v = s.data[canvas._hover];
        if (v === undefined) return;
        ctx.beginPath(); ctx.arc(hx, y(v), 4, 0, Math.PI * 2);
        ctx.fillStyle = t.surface; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = Charts.color(s.color); ctx.stroke();
      });
    }
  },

  /** Stacked bar chart. cfg: { labels, series:[{label,data,color}] } */
  bar(canvas, cfg) {
    if (!canvas || !canvas.isConnected || canvas.offsetParent === null) return;
    canvas._config = { ...cfg, kind: 'bar', decimals: 0 };
    Charts.bindHover(canvas);
    const { ctx, width, height } = Charts.setup(canvas);
    const t = Charts.theme();
    const pad = { left: 36, right: 12, top: 12, bottom: 24 };
    const count = cfg.labels.length;
    const totals = cfg.labels.map((_, i) => cfg.series.reduce((a, s) => a + (s.data[i] || 0), 0));
    const hi = Math.max(4, Math.ceil(Math.max(...totals) + 1));
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const slot = plotW / count;
    const bw = Math.min(38, slot * 0.56);
    const y = (v) => pad.top + plotH - (v / hi) * plotH;
    canvas._meta = { left: pad.left + slot / 2, step: slot, count };

    ctx.strokeStyle = t.grid; ctx.fillStyle = t.axis; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const gStep = hi > 8 ? 2 : 1;
    for (let v = 0; v <= hi; v += gStep) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
      ctx.fillText(String(v), pad.left - 8, yy);
    }
    cfg.labels.forEach((label, i) => {
      const cx = pad.left + slot * i + slot / 2;
      let acc = 0;
      if (canvas._hover === i) {
        ctx.fillStyle = t.grid; ctx.fillRect(pad.left + slot * i + 2, pad.top, slot - 4, plotH);
      }
      cfg.series.forEach((s) => {
        const v = s.data[i] || 0;
        if (!v) return;
        const top = y(acc + v), bottom = y(acc);
        ctx.fillStyle = Charts.color(s.color);
        ctx.fillRect(cx - bw / 2, top + 1, bw, bottom - top - 1);
        acc += v;
      });
      ctx.fillStyle = t.axis; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(label, cx, height - pad.bottom + 7);
    });
  }
};
