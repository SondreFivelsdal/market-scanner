// Tegneverktøy for grafene (som i TradingView): trendlinje, horisontal linje og Fibonacci-retracement.
// Tegningene lagres i nettleseren per coin (tid + pris), så de følger med når du bytter tidsramme eller fane.
// Bruk: const D = DRAW.create({ ch, series, host, bars: () => B, step: () => ms, key: () => 'BTC', onScale }); host.before(D.toolbar());
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg', LS = 'ms-draw2';
  const FIB = [[0, '#787b86'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.702, '#00bcd4'], [0.786, '#2962ff'], [1, '#787b86'], [1.618, '#9c27b0']];
  const ICON = {
    cursor: '<path d="M5 3l12 6-5 1.6L10 16z" fill="currentColor"/>',
    trend: '<path d="M3 16L17 4" stroke="currentColor" stroke-width="1.8"/><circle cx="3.5" cy="15.5" r="2" fill="currentColor"/><circle cx="16.5" cy="4.5" r="2" fill="currentColor"/>',
    hline: '<path d="M2 10h16" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="10" r="2" fill="currentColor"/>',
    fib: '<path d="M2 4h16M2 8h16M2 12h16M2 16h16" stroke="currentColor" stroke-width="1.4"/><path d="M3 16L17 4" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>',
    magnet: '<path d="M5 3v7a5 5 0 0010 0V3h-3v7a2 2 0 01-4 0V3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 5h3M12 5h3" stroke="currentColor" stroke-width="1.6"/>',
    trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" fill="none" stroke="currentColor" stroke-width="1.6"/>'
  };
  const TOOLS = [['cursor', 'Peker – flytt og velg tegninger'], ['trend', 'Trendlinje – trykk og dra (eller trykk to ganger)'], ['hline', 'Horisontal linje – trykk én gang'], ['fib', 'Fibonacci – dra fra topp til bunn (eller bunn til topp)']];
  let store = {}; try { store = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { store = {}; }
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { /* ingen lagring */ } };
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const fmtL = v => v.toLocaleString('nb-NO', { maximumFractionDigits: 3 });

  function create(o) {
    const { ch, series, host } = o, S = { tool: 'cursor', magnet: true, sel: null, pend: null, drag: null, down: false, tb: null, sig: '' };
    const list = () => store[o.key()] || (store[o.key()] = []);
    const layer = document.createElement('div'); layer.className = 'dlayer'; host.append(layer);
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'dsvg'); layer.append(svg);
    const mk = (tag, at, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); parent.append(e); return e; };
    // ------------------------------------------------ koordinater (tid ↔ x, pris ↔ y)
    const B = () => o.bars() || [], step = () => o.step() || 864e5;
    function idxOfT(t) { const b = B(), n = b.length; if (!n) return null; if (t >= b[n - 1].t) return n - 1 + (t - b[n - 1].t) / step(); if (t <= b[0].t) return (t - b[0].t) / step();
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m].t <= t) lo = m; else hi = m; } return lo + (t - b[lo].t) / (b[hi].t - b[lo].t); }
    function xOfT(t) { const i = idxOfT(t); if (i == null) return null; const ts = ch.timeScale(), f = Math.floor(i), x0 = ts.logicalToCoordinate(f); if (x0 == null || i === f) return x0; const x1 = ts.logicalToCoordinate(f + 1); return x1 == null ? x0 : x0 + (x1 - x0) * (i - f); }
    function tOfIdx(i) { const b = B(), n = b.length; if (i >= 0 && i <= n - 1) return b[i].t; return i > n - 1 ? b[n - 1].t + (i - n + 1) * step() : b[0].t + i * step(); }
    const yOfP = p => series.priceToCoordinate(p), pOfY = y => series.coordinateToPrice(y);
    const W = () => ch.timeScale().width(), H = () => Math.max(0, host.clientHeight - (ch.timeScale().height ? ch.timeScale().height() : 28));
    // punkt fra skjermkoordinat; tiden festes til nærmeste lys, magneten fester prisen til åpning/høy/lav/lukk
    function ptAt(x, y, magnet) { const l = ch.timeScale().coordinateToLogical(x); if (l == null || !B().length) return null; const i = Math.round(l), t = tOfIdx(i); let p = pOfY(y); if (p == null) return null;
      const b = B()[i]; if (magnet && b) { let best = null, bd = 26; for (const v of [b.o, b.h, b.l, b.c]) { const yy = yOfP(v); if (yy != null && Math.abs(yy - y) < bd) { bd = Math.abs(yy - y); best = v; } } if (best != null) p = best; } return { t, p }; }
    const xy = pt => ({ x: xOfT(pt.t), y: yOfP(pt.p) });
    const fmtP = p => { try { return series.priceFormatter().format(p); } catch (e) { return String(Math.round(p)); } };
    // ------------------------------------------------ tegning
    function render() {
      const w = W(), h = H(); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.replaceChildren(); if (!B().length) return;
      const items = list().slice(); if (S.pend) items.push(S.pend);
      for (const d of items) { const g = mk('g', { class: 'dshape' + (d === S.pend ? ' pend' : '') + (S.sel === d.id ? ' sel' : '') }); g.dataset.id = d.id || '';
        const col = d.type === 'fib' ? css('--fg') : d.type === 'hline' ? css('--orange') : css('--blue');
        if (d.type === 'hline') { const y = yOfP(d.a.p); if (y == null) continue;
          mk('line', { x1: 0, x2: w, y1: y, y2: y, stroke: col, 'stroke-width': 1.5 }, g); const tx = mk('text', { x: w - 6, y: y - 5, 'text-anchor': 'end', fill: col, class: 'dlab' }, g); tx.textContent = fmtP(d.a.p);
          hit(g, d, `M0 ${y} L${w} ${y}`); if (S.sel === d.id) handle(g, d, 'a', Math.min(w - 30, Math.max(30, xOfT(d.a.t) ?? w / 2)), y); continue; }
        const A = xy(d.a), Bp = xy(d.b || d.a); if (A.x == null || A.y == null || Bp.x == null || Bp.y == null) continue;
        if (d.type === 'trend') { mk('line', { x1: A.x, y1: A.y, x2: Bp.x, y2: Bp.y, stroke: col, 'stroke-width': 2 }, g);
          if (Math.abs(Bp.x - A.x) > 2) { const [L, R] = A.x < Bp.x ? [A, Bp] : [Bp, A], s = (R.y - L.y) / (R.x - L.x); mk('line', { x1: R.x, y1: R.y, x2: w, y2: R.y + s * (w - R.x), stroke: col, 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: 0.55 }, g); }
          hit(g, d, `M${A.x} ${A.y} L${Bp.x} ${Bp.y}`); }
        if (d.type === 'fib') { const pa = d.a.p, pb = (d.b || d.a).p, x1 = Math.min(A.x, Bp.x), lv = FIB.map(([f, c]) => ({ f, c, p: pb + (pa - pb) * f })).map(l => Object.assign(l, { y: yOfP(l.p) })).filter(l => l.y != null);
          for (let i = 0; i + 1 < lv.length; i++) mk('rect', { x: x1, y: Math.min(lv[i].y, lv[i + 1].y), width: Math.max(0, w - x1), height: Math.abs(lv[i + 1].y - lv[i].y), fill: lv[i + 1].c, opacity: 0.06 }, g);
          for (const l of lv) { mk('line', { x1, x2: w, y1: l.y, y2: l.y, stroke: l.c, 'stroke-width': l.f === 0.618 || l.f === 0.5 ? 1.6 : 1 }, g);
            const tx = mk('text', { x: x1 + 4, y: l.y - 3, fill: l.c, class: 'dlab' }, g); tx.textContent = `${fmtL(l.f)} (${fmtP(l.p)})`; hit(g, d, `M${x1} ${l.y} L${w} ${l.y}`, 8); }
          mk('line', { x1: A.x, y1: A.y, x2: Bp.x, y2: Bp.y, stroke: css('--axis'), 'stroke-width': 1, 'stroke-dasharray': '3 3' }, g); hit(g, d, `M${A.x} ${A.y} L${Bp.x} ${Bp.y}`); }
        if (S.sel === d.id) { handle(g, d, 'a', A.x, A.y); handle(g, d, 'b', Bp.x, Bp.y); } }
    }
    function hit(g, d, path, wd = 14) { if (d === S.pend) return; const p = mk('path', { d: path, stroke: 'transparent', 'stroke-width': wd, fill: 'none', class: 'dhit' }, g); p.addEventListener('pointerdown', e => startDrag(e, d, 'all')); }
    function handle(g, d, part, x, y) { const c = mk('circle', { cx: x, cy: y, r: 6, class: 'dhandle' }, g); c.addEventListener('pointerdown', e => startDrag(e, d, part)); }
    // ------------------------------------------------ flytte og velge (pekeren)
    function startDrag(e, d, part) { if (S.tool !== 'cursor') return; e.preventDefault(); e.stopPropagation(); S.sel = d.id; const r = host.getBoundingClientRect();
      S.drag = { d, part, x0: e.clientX - r.left, y0: e.clientY - r.top, a: { ...d.a }, b: d.b ? { ...d.b } : null, A: xy(d.a), B: d.b ? xy(d.b) : null, moved: false }; tbar(); render();
      window.addEventListener('pointermove', onDrag); window.addEventListener('pointerup', endDrag, { once: true }); }
    function onDrag(e) { const D = S.drag; if (!D) return; const r = host.getBoundingClientRect(), dx = e.clientX - r.left - D.x0, dy = e.clientY - r.top - D.y0; if (Math.abs(dx) + Math.abs(dy) > 2) D.moved = true;
      const mv = (P, mag) => { const q = ptAt(P.x + dx, P.y + dy, mag); return q || null; };
      if (D.part === 'all') { if (D.d.type === 'hline') { const p = pOfY(D.A.y + dy); if (p != null) D.d.a = { t: D.a.t, p }; } else { const a = mv(D.A, false), b = mv(D.B, false); if (a && b) { D.d.a = a; D.d.b = b; } } }
      else { const P = D.part === 'a' ? D.A : D.B, q = mv(P, S.magnet); if (q) { if (D.d.type === 'hline') D.d.a = { t: D.a.t, p: q.p }; else D.d[D.part] = q; } }
      render(); }
    function endDrag() { window.removeEventListener('pointermove', onDrag); if (S.drag && S.drag.moved) persist(); S.drag = null; render(); }
    // ------------------------------------------------ tegne nye (verktøy valgt)
    const local = e => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    layer.addEventListener('pointerdown', e => { if (S.tool === 'cursor') return; e.preventDefault(); const { x, y } = local(e), p = ptAt(x, y, S.magnet); if (!p) return;
      if (S.tool === 'hline') { finish({ type: 'hline', a: p }); return; }
      if (!S.pend) { S.pend = { type: S.tool, a: p, b: p }; S.down = true; S.dx = x; S.dy = y; try { layer.setPointerCapture(e.pointerId); } catch (x2) { /* ok */ } }
      else { S.pend.b = p; finish(S.pend); } render(); });
    layer.addEventListener('pointermove', e => { if (!S.pend) return; const { x, y } = local(e), p = ptAt(x, y, S.magnet); if (p) { S.pend.b = p; render(); } });
    layer.addEventListener('pointerup', e => { if (!S.pend || !S.down) return; S.down = false; const { x, y } = local(e); if (Math.hypot(x - S.dx, y - S.dy) > 8) finish(S.pend); });
    function finish(d) { const nd = { id: Math.random().toString(36).slice(2, 9), type: d.type, a: d.a, b: d.b }; list().push(nd); persist(); S.pend = null; S.sel = nd.id; setTool('cursor'); render(); }
    // klikk utenfor en tegning fjerner valget; Delete sletter valgt tegning; Esc avbryter
    host.addEventListener('pointerdown', e => { if (S.tool === 'cursor' && !e.target.closest('.dshape') && S.sel) { S.sel = null; tbar(); render(); } }, true);
    const onKey = e => { if (!host.isConnected || host.offsetParent == null) return; const tg = e.target; if (tg && /INPUT|TEXTAREA|SELECT/.test(tg.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); remove(S.sel); }
      if (e.key === 'Escape') { S.pend = null; S.sel = null; setTool('cursor'); render(); } };
    document.addEventListener('keydown', onKey);
    function remove(id) { const L = list(), i = L.findIndex(d => d.id === id); if (i >= 0) L.splice(i, 1); S.sel = null; persist(); tbar(); render(); }
    function setTool(t) { S.tool = t; S.pend = null; layer.classList.toggle('on', t !== 'cursor'); tbar(); }
    // ------------------------------------------------ verktøylinje
    function toolbar() { const box = document.createElement('div'); box.className = 'tgroup'; box.setAttribute('role', 'toolbar'); box.setAttribute('aria-label', 'Tegneverktøy'); S.tb = box; tbar(); return box; }
    const ib = (name, title, on, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tb ic'; b.title = title; b.setAttribute('aria-label', title); if (on != null) b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.innerHTML = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">${ICON[name]}</svg>`; b.addEventListener('click', fn); return b; };
    function tbar() { const box = S.tb; if (!box) return; const n = list().length;
      box.replaceChildren(...TOOLS.map(([k, t]) => ib(k, t, S.tool === k, () => setTool(S.tool === k ? 'cursor' : k))),
        ib('magnet', 'Magnet: fest punktene til høy/lav/åpning/lukk', S.magnet, () => { S.magnet = !S.magnet; tbar(); }),
        ib('trash', S.sel ? 'Slett valgt tegning (Delete)' : `Slett alle tegninger for ${o.key()} (${n})`, null, () => { if (S.sel) remove(S.sel); else if (n && confirm(`Slette alle ${n} tegninger for ${o.key()}?`)) { store[o.key()] = []; persist(); tbar(); render(); } })); }
    // ------------------------------------------------ tegn på nytt når grafen flyttes, zoomes eller prisskalaen endres
    ch.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(render));
    if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(render)).observe(host);
    const loop = () => { if (host.isConnected && host.offsetParent != null && B().length) { const b = B(), y = yOfP(b[b.length - 1].c), sig = `${y}|${W()}|${H()}|${ch.timeScale().logicalToCoordinate(0)}`;
      if (sig !== S.sig) { S.sig = sig; render(); if (o.onScale) o.onScale(); } } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return { render, toolbar, setTool, refresh: () => { S.sel = null; tbar(); render(); }, get count() { return list().length; } };
  }
  window.DRAW = { create, FIB };
})();
