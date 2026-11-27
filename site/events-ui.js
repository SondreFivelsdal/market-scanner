// «Hva skjedde etter …?» – søk på en hendelse og se hva som skjedde med et marked etterpå.
// Leser data/events.json (bygges av scripts/events.js). Alle beregninger skjer her i nettleseren:
// for hver gang hendelsen inntraff, følges kursen dag for dag i inntil 2 år.
(() => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const NS = 'http://www.w3.org/2000/svg', sv = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a || {}) e.setAttribute(k, a[k]); return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const pct = (r, d = 0) => { if (r == null || !isFinite(r)) return '–'; const v = Math.round((r - 1) * 100 * 10 ** d) / 10 ** d; return (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %'; };
  const cls = r => r == null ? 'muted' : r > 1 ? 'up' : r < 1 ? 'down' : '';
  const price = v => v == null ? '–' : v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) : v >= 1 ? nf(v, { maximumFractionDigits: 2 }) : nf(v, { maximumSignificantDigits: 3 });
  const DAY = 864e5, dOf = s => Math.floor(Date.parse(s + 'T00:00:00Z') / DAY), isoD = d => new Date(d * DAY).toISOString().slice(0, 10);
  const dmy = d => new Date(d * DAY).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), x = q * (s.length - 1), lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); };
  const HZ = [[7, '1 uke'], [30, '1 måned'], [91, '3 måneder'], [182, '6 måneder'], [365, '1 år'], [730, '2 år']];
  const VIEW = { 30: '1 mnd', 91: '3 mnd', 182: '6 mnd', 365: '1 år', 730: '2 år' };
  const S = { ev: 'fed_first_hike', a: 'BTC', h: 365, pre: 30, q: '', hl: null, built: false, sel: new Set(), med: true, now: true, sort: 'imp', cat: '', tlc: new Set() };
  const PRE = { 0: 'Ingen', 30: '30 dager', 91: '3 mnd' };
  const PRESETS = [[7, 7], [30, 30], [90, 90], [180, 180], [30, 365], [0, 730]];
  const hLab = h => h % 365 === 0 ? `${h / 365} år` : h >= 60 && h % 30 < 3 ? `${Math.round(h / 30.4)} mnd` : `${h} d`;
  const clampN = (v, lo, hi, d) => { v = Math.round(+v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  const E = () => { const d = dash.data('events'); return d.status === 'ok' ? d.data : d.status === 'error' ? { err: true } : null; };
  const series = {}; // dekodet kursserie per marked
  function ser(m, k) { if (series[k]) return series[k]; const A = m.assets[k]; if (!A) return null; const t = new Int32Array(A.t.length); let p = 0; for (let i = 0; i < A.t.length; i++) { p += A.t[i]; t[i] = p; } return (series[k] = { t, c: A.c, name: A.name, from: A.from, to: A.to, src: A.src, last: t[t.length - 1] }); }
  // siste indeks med dag ≤ d
  const at = (T, d) => { let lo = 0, hi = T.t.length - 1; if (d < T.t[0]) return -1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T.t[m] <= d) lo = m; else hi = m - 1; } return lo; };
  function datesFor(m, ev, k) { const e = m.events.find(x => x.id === ev); if (!e) return []; return (e.dates || (e.perAsset && e.perAsset[k]) || []).map(dOf); }

  // ---------------------------------------------------------------- analyse
  function study(m, ev, k, maxH, preN = 0) {
    const T = ser(m, k); if (!T) return null; const ds = datesFor(m, ev, k); const out = [];
    for (const d of ds) { const i0 = at(T, d - 1) + 1; // første handelsdag på/etter hendelsen
      if (i0 >= T.t.length || T.t[i0] - d > 6) continue; // ingen kurs nær dagen
      const d0 = T.t[i0], base = T.c[i0], avail = T.last - d0, H = Math.min(maxH, avail);
      const path = new Float32Array(H + 1); let j = i0; for (let k2 = 0; k2 <= H; k2++) { while (j + 1 < T.t.length && T.t[j + 1] <= d0 + k2) j++; path[k2] = T.c[j] / base; }
      const hz = {}; for (const [h] of HZ) hz[h] = h > avail ? null : h <= H ? path[h] : T.c[at(T, d0 + h)] / base;
      let mn = 1, mnD = 0, mx = 1, mxD = 0; const W = Math.min(365, H); for (let q = 1; q <= W; q++) { if (path[q] < mn) { mn = path[q]; mnD = q; } if (path[q] > mx) { mx = path[q]; mxD = q; } }
      const pre = new Float32Array(preN); for (let q = 0; q < preN; q++) { const ix = at(T, d0 - preN + q); pre[q] = ix >= 0 && d0 - preN + q - T.t[ix] < 7 ? T.c[ix] / base : NaN; }
      out.push({ d, d0, base, path, pre, avail, hz, mn, mnD, mx, mxD, full: avail >= 365 }); }
    return { T, rows: out };
  }
  function summary(rows) { const st = {}; for (const [h] of HZ) { const v = rows.map(r => r.hz[h]).filter(x => x != null); st[h] = { n: v.length, med: quant(v, 0.5), q25: quant(v, 0.25), q75: quant(v, 0.75), up: v.length ? v.filter(x => x > 1).length / v.length : null, best: v.length ? Math.max(...v) : null, worst: v.length ? Math.min(...v) : null }; }
    const f = rows.filter(r => r.full); st.mn = quant(f.map(r => r.mn), 0.5); st.mnD = quant(f.map(r => r.mnD), 0.5); st.mx = quant(f.map(r => r.mx), 0.5); st.nFull = f.length; return st; }

  // ---------------------------------------------------------------- søk
  const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå&% ]/g, ' ');
  function search(m, q, max = 8) { const toks = norm(q).split(/\s+/).filter(Boolean); if (!toks.length) return [];
    return m.events.map(e => { const hay = norm([e.name, ...(e.syn || []), m.cats[e.cat] || ''].join(' ')); let sc = 0; for (const t of toks) { if (!hay.includes(t)) return null; sc += norm(e.name).includes(t) ? 2 : 1; } return { e, sc }; }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, max).map(x => x.e); }
  function pick(id) { S.ev = id; S.hl = null; S.sel.clear(); dash.setParams({ ev: id }); }

  // ---------------------------------------------------------------- klikkbar forklaring under grafene
  // Trykk på et år = vis bare det året (trykk igjen = alle). Shift/Ctrl-trykk = legg til flere. «I dag» og «Median» slås av/på.
  function legendBtns(items, onClick) { const box = el('div', 'evleg');
    for (const x of items) { const b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', x.on ? 'true' : 'false'); if (x.solo) b.classList.add('solo'); b.title = x.title || '';
      const i = el('i'); i.style.borderTopColor = x.color; if (x.dash) i.style.borderTopStyle = 'dashed'; b.append(i, document.createTextNode(x.label)); b.addEventListener('click', ev => onClick(x.key, ev)); box.append(b); }
    return box; }
  const multi = ev => ev.shiftKey || ev.ctrlKey || ev.metaKey;
  function soloSel(set, k) { set.has(k) ? set.delete(k) : set.add(k); } // tomt utvalg = alle vises; trykk legger til eller fjerner

  // ---------------------------------------------------------------- graf
  // Viser: tidligere tilfeller (alle eller valgte år), medianen og «i dag» (det pågående tilfellet).
  const PAL = () => [css('--orange'), css('--purple'), css('--up'), css('--down'), '#0f8b8d', '#a0522d', '#6b7280', '#c026d3'];
  const lbl = (r, rows) => { const y = new Date(r.d * DAY).getUTCFullYear(); return rows.filter(x => new Date(x.d * DAY).getUTCFullYear() === y).length > 1 ? dmy(r.d) : String(y); };
  const valAt = (r, k) => k >= 0 ? (k < r.path.length ? r.path[k] : undefined) : (r.pre && r.pre.length + k >= 0 && isFinite(r.pre[r.pre.length + k]) ? r.pre[r.pre.length + k] : undefined);
  function medianPath(rows, from, to) { const med = {}; for (let k = from; k <= to; k++) { const v = rows.map(r => valAt(r, k)).filter(x => x !== undefined); med[k] = v.length >= Math.max(2, Math.ceil(rows.length / 3)) ? quant(v, 0.5) : null; } return med; }
  function chart(res, cur, H, PN = 0) {
    const val = valAt;
    const box = el('div', 'evchart'), W = 760, Hh = 360, P = { l: 56, r: 64, t: 12, b: 30 }, w = W - P.l - P.r, h = Hh - P.t - P.b;
    const s = sv('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': 'Kursutvikling etter hver gang hendelsen inntraff' }); box.append(s);
    const done = res.rows.filter(r => r !== cur), selOn = S.sel.size > 0, shown = selOn ? done.filter(r => S.sel.has(r.d)) : done;
    const medRows = selOn && shown.length >= 2 ? shown : done, med = medianPath(medRows, -PN, H);
    const vis = [...shown, ...(cur && S.now ? [cur] : [])]; const all = []; for (const r of vis.length ? vis : res.rows) for (let k = -PN; k <= H; k += 3) { const v = val(r, k); if (v !== undefined) all.push(v); }
    if (S.med) for (let k = -PN; k <= H; k += 3) if (med[k] != null) all.push(med[k]);
    let lo = Math.log(Math.max(0.03, quant(all, 0.01) ?? 0.5)), hi = Math.log(Math.min(60, quant(all, 0.99) ?? 2)); lo = Math.min(lo, Math.log(0.8)); hi = Math.max(hi, Math.log(1.25));
    const X = k => P.l + (k + PN) / (H + PN) * w, Y = r => P.t + (hi - Math.log(Math.max(r, 1e-6))) / (hi - lo) * h, clampY = r => Math.max(P.t, Math.min(P.t + h, Y(r)));
    const ticks = [0.1, 0.25, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2, 3, 5, 10, 20, 50].filter(r => Math.log(r) >= lo && Math.log(r) <= hi);
    for (const r of ticks) { s.append(sv('line', { x1: P.l, x2: P.l + w, y1: Y(r), y2: Y(r), stroke: r === 1 ? css('--axis') : css('--grid'), 'stroke-width': r === 1 ? 1.2 : 1 })); const t = sv('text', { x: P.l - 8, y: Y(r) + 4, 'text-anchor': 'end', class: 'ax' }); t.textContent = pct(r); s.append(t); }
    const stp = [1, 2, 7, 14, 30, 61, 91, 182, 365].find(x => H / x <= 6) || 365, xt0 = []; for (let k = 0; k <= H; k += stp) xt0.push(k); if (H - xt0[xt0.length - 1] > stp * 0.4) xt0.push(H);
    const xt = [...(PN ? [-PN] : []), ...xt0.filter(k => !PN || k === 0 || k >= H * 0.15)]; for (const k of xt) { const t = sv('text', { x: X(k), y: Hh - 8, 'text-anchor': k === -PN ? 'start' : k === H ? 'end' : 'middle', class: 'ax' }); t.textContent = k === 0 ? 'Dag 0' : k < 0 ? `−${-k} d` : `${k} d`; s.append(t); }
    if (PN) s.append(sv('line', { x1: X(0), x2: X(0), y1: P.t, y2: P.t + h, stroke: css('--axis'), 'stroke-width': 1.2 }));
    if (cur && S.now && cur.avail <= H) s.append(sv('line', { x1: X(cur.avail), x2: X(cur.avail), y1: P.t, y2: P.t + h, stroke: css('--blue'), 'stroke-dasharray': '2 4', opacity: 0.6 }));
    const line = r => { let d = '', pen = false; for (let k = -PN; k <= H; k += (H + PN > 400 ? 2 : 1)) { const v = val(r, k); if (v === undefined) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(k).toFixed(1) + ' ' + clampY(v).toFixed(1); pen = true; } return d; };
    const endLabel = (r, txt, color) => { let k = Math.min(H, r.path.length - 1); const t = sv('text', { x: X(k) + 5, y: clampY(r.path[k]) + 4, class: 'ax lab', fill: color }); t.textContent = txt; s.append(t); };
    // tidligere tilfeller
    const pal = PAL(), paths = [];
    shown.forEach((r, i) => { const color = selOn ? pal[i % pal.length] : (r.path[Math.min(H, r.path.length - 1)] >= 1 ? css('--up') : css('--down'));
      const g = sv('path', { d: line(r), fill: 'none', stroke: color, 'stroke-width': selOn ? 2.4 : 1.3, opacity: selOn ? 0.95 : 0.35, 'stroke-linejoin': 'round' }); s.append(g); paths.push([g, r, color]);
      if (selOn) endLabel(r, lbl(r, res.rows), color); });
    if (S.med && Object.values(med).some(v => v != null)) { let d = '', lastK = null; for (let k = -PN; k <= H; k++) { const v = med[k]; if (v == null) continue; d += (d ? 'L' : 'M') + X(k).toFixed(1) + ' ' + clampY(v).toFixed(1); lastK = k; }
      s.append(sv('path', { d, fill: 'none', stroke: css('--fg'), 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-dasharray': selOn ? '7 4' : '' })); if (lastK != null) { const t = sv('text', { x: X(lastK) + 5, y: clampY(med[lastK]) + 4, class: 'ax lab', fill: css('--fg') }); t.textContent = 'Median'; s.append(t); } }
    if (cur && S.now) { s.append(sv('path', { d: line(cur), fill: 'none', stroke: css('--blue'), 'stroke-width': 3.4, 'stroke-linejoin': 'round' })); const k = Math.min(H, cur.path.length - 1); s.append(sv('circle', { cx: X(k), cy: clampY(cur.path[k]), r: 4.5, fill: css('--blue') })); endLabel(cur, 'I dag', css('--blue')); }
    const mark = d => paths.forEach(([g, r]) => { const on = d != null && r.d === d; g.setAttribute('opacity', d == null ? (selOn ? 0.95 : 0.35) : on ? 1 : 0.15); g.setAttribute('stroke-width', on ? 3.2 : selOn ? 2.4 : 1.3); });
    const vl = sv('line', { y1: P.t, y2: P.t + h, stroke: css('--axis'), 'stroke-dasharray': '3 3', visibility: 'hidden' }); s.append(vl);
    const tip = el('div', 'tip'); tip.style.display = 'none'; box.append(tip);
    const ov = sv('rect', { x: P.l, y: P.t, width: w, height: h, fill: 'transparent' }); s.append(ov);
    const move = ev => { const r = s.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, k = Math.round(Math.max(-PN, Math.min(H, (px - P.l) / w * (H + PN) - PN)));
      vl.setAttribute('x1', X(k)); vl.setAttribute('x2', X(k)); vl.setAttribute('visibility', 'visible');
      const py = (ev.clientY - r.top) / r.height * Hh; let best = null, bd = 1e9; for (const [, rr] of paths) { const vv = val(rr, k); if (vv === undefined) continue; const dy = Math.abs(clampY(vv) - py); if (dy < bd) { bd = dy; best = rr; } }
      mark(bd < 14 && best ? best.d : null);
      const lines = [k < 0 ? `${-k} dager før` : `Dag ${k}`];
      if (cur && S.now && val(cur, k) !== undefined) lines.push(`I dag-kurven (${dmy(cur.d)}): ${pct(val(cur, k))}`);
      if (S.med && med[k] != null) lines.push(`Median: ${pct(med[k])}`);
      if (selOn) for (const [, rr] of paths) { const vv = val(rr, k); if (vv !== undefined) lines.push(`${lbl(rr, res.rows)}: ${pct(vv)}`); } else if (bd < 14 && best) lines.push(`${dmy(best.d)}: ${pct(val(best, k))}`);
      tip.replaceChildren(...lines.map((t, i) => el(i ? 'div' : 'b', null, t))); tip.style.display = 'grid';
      const bx = box.getBoundingClientRect(); let lx = ev.clientX - bx.left + 14; if (lx > bx.width - 200) lx = ev.clientX - bx.left - 210; tip.style.left = lx + 'px'; tip.style.top = Math.max(0, ev.clientY - bx.top - 30) + 'px'; };
    ov.addEventListener('pointermove', move); ov.addEventListener('pointerleave', () => { vl.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; mark(null); });
    ov.addEventListener('click', ev => { const r = s.getBoundingClientRect(), k = Math.round(Math.max(-PN, Math.min(H, ((ev.clientX - r.left) / r.width * W - P.l) / w * (H + PN) - PN))), py = (ev.clientY - r.top) / r.height * Hh;
      let best = null, bd = 16; for (const [, rr] of paths) { const vv = val(rr, k); if (vv === undefined) continue; const dy = Math.abs(clampY(vv) - py); if (dy < bd) { bd = dy; best = rr; } } if (best) { soloSel(S.sel, best.d, ev); box.dispatchEvent(new CustomEvent('redraw', { bubbles: true })); } });
    const colOf = new Map(paths.map(([, r, c]) => [r.d, c])), items = [];
    if (cur) items.push({ key: 'now', label: `I dag (dag ${cur.avail})`, color: css('--blue'), on: S.now });
    items.push({ key: 'med', label: `Median (${medRows.length})`, color: css('--fg'), dash: true, on: S.med });
    for (const r of [...done].reverse()) items.push({ key: r.d, label: lbl(r, res.rows), color: colOf.get(r.d) || (r.path[Math.min(H, r.path.length - 1)] >= 1 ? css('--up') : css('--down')), on: !selOn || S.sel.has(r.d), solo: S.sel.size === 1 && S.sel.has(r.d), title: 'Trykk for å vise bare dette året. Shift-trykk for å velge flere.' });
    const lg = legendBtns(items, (k, ev) => { if (k === 'now') S.now = !S.now; else if (k === 'med') S.med = !S.med; else soloSel(S.sel, k, ev); box.dispatchEvent(new CustomEvent('redraw', { bubbles: true })); });
    box.append(lg, el('p', 'muted small', selOn ? `${S.sel.size} valgt – trykk flere år for å sammenligne, eller trykk et valgt år for å fjerne det.` : 'Trykk på år (eller linjer) for å velge dem – velg flere for å sammenligne.')); return box;
  }
  // over grafen: «Vis alle» når et utvalg er aktivt, og forslag: hvilke tidligere år har kurven mest lik i dag?
  function simCases(cur, done) { const k = cur ? cur.avail : 0; if (!cur || k < 14) return [];
    return done.filter(r => r.path.length > k).map(r => { let s2 = 0, n = 0; for (let q = 1; q <= k; q++) { s2 += Math.abs(Math.log(r.path[q] / cur.path[q])); n++; } return { r, dev: Math.exp(s2 / n) - 1 }; }).sort((a, b) => a.dev - b.dev); }
  function filters(res, cur, redraw) {
    const done = res.rows.filter(r => r !== cur), wrap = el('div', 'stack'), sim = simCases(cur, done).slice(0, 3); wrap.style.gap = '8px';
    const tg = (txt, on, fn, title) => { const b = el('button', 'chip', txt); b.type = 'button'; if (on != null) b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (title) b.title = title; b.addEventListener('click', fn); return b; };
    if (sim.length) { const r = el('div', 'chips'); r.append(el('span', 'muted small', 'Mest lik i dag:'));
      sim.forEach(x => r.append(tg(`${lbl(x.r, res.rows)} · ${nf(x.dev * 100, { maximumFractionDigits: 0 })} % avvik`, S.sel.size === 1 && S.sel.has(x.r.d), () => { S.sel.clear(); S.sel.add(x.r.d); redraw(); }, 'Snittavstand mellom kurvene fra dag 0 til i dag')));
      if (sim.length > 1) r.append(tg(`Vis de ${sim.length}`, sim.every(x => S.sel.has(x.r.d)) && S.sel.size === sim.length, () => { S.sel.clear(); sim.forEach(x => S.sel.add(x.r.d)); redraw(); }));
      wrap.append(r); }
    if (S.sel.size) { const r = el('div', 'chips'); r.append(tg('Vis alle', null, () => { S.sel.clear(); redraw(); })); wrap.append(r); }
    return wrap;
  }
  // «Hvis det går som da»: hva skjedde videre fra samme dag som i dag, brukt på dagens kurs
  function compare(res, cur, A, T) {
    const k = cur.avail, today = T.c[T.c.length - 1], done = res.rows.filter(r => r !== cur), selOn = S.sel.size > 0, base = (selOn ? done.filter(r => S.sel.has(r.d)) : done).filter(r => r.path.length > k);
    if (!base.length) return null;
    const HZ2 = [[30, '30 dager til'], [91, '3 mnd til'], [182, '6 mnd til']], card = el('div', 'card');
    card.append(el('h3', null, `Sammenlignet med i dag (dag ${k})`), el('p', 'muted small', `«På dag ${k}» = hvor kursen lå samme antall dager etter hendelsen. Kolonnene til høyre viser hva som skjedde videre fra den dagen, og hvilken kurs det ville gitt for ${A.name} i dag (${price(today)}).`));
    const t = el('table', 't compact'), hr = el('tr'); ['', `På dag ${k}`, ...HZ2.map(x => x[1]), 'Laveste videre (til dag 365)'].forEach((x, i) => hr.append(el('th', i ? '' : 'l', x))); t.append(hr);
    const now = el('tr', 'evrow cur'); now.append(el('td', 'l', 'I dag'), el('td', cls(cur.path[k]), pct(cur.path[k]))); for (let i = 0; i < HZ2.length + 1; i++) now.append(el('td', 'muted', '?')); t.append(now);
    const row = (name, r0, f) => { const tr = el('tr'); tr.append(el('td', 'l', name), el('td', cls(r0), pct(r0)));
      for (const [h] of HZ2) { const v = f(k + h); const c = el('td', cls(v == null ? null : v / r0)); if (v == null) c.textContent = '…'; else { c.append(el('b', null, pct(v / r0)), el('span', 'muted small sub2', price(today * v / r0))); } tr.append(c); }
      let mn = Infinity; for (let q = k; q <= 365; q++) { const v = f(q); if (v != null) mn = Math.min(mn, v); } const c = el('td', isFinite(mn) ? 'down' : 'muted'); if (isFinite(mn)) c.append(el('b', null, pct(mn / r0)), el('span', 'muted small sub2', price(today * mn / r0))); else c.textContent = '…'; tr.append(c); return tr; };
    const med = medianPath(base.length >= 2 ? base : done, 0, 365); if (base.length >= 2 && med[k] != null) t.append(row(`Median (${base.length})`, med[k], q => med[q] ?? null));
    for (const r of [...base].reverse()) t.append(row(lbl(r, res.rows), r.path[k], q => q < r.path.length ? r.path[q] : null));
    const tw = el('div', 'tw'); tw.append(t); card.append(tw, el('p', 'muted small', 'Dette er regneeksempler: «hvis kursen beveger seg som den gjorde da». Det er ikke en prognose.')); return card;
  }

  // ---------------------------------------------------------------- halveringsvindu ±540 dager
  // Bare for «Bitcoin-halvering»: hvor er vi nå i forhold til 540 dager før og 540 dager etter halveringen?
  // Hver syklus måles fra kursen 540 dager før halveringen (= 0 %). Da kan også syklusen fram mot den kommende halveringen vises.
  const HW = 540, HNEXT = '2028-04-15', HS = { off: new Set(), med: true };
  const hYear = r => new Date(r.h * DAY).getUTCFullYear() + (r.est ? ' (anslag)' : '');
  const fin = v => v != null && isFinite(v);
  function halvCycles(m, k) {
    const T = ser(m, k); if (!T) return null; const past = datesFor(m, 'halving', k), nx = dOf(HNEXT);
    const hs = past.map(d => ({ h: d, est: false })); if (!past.some(d => Math.abs(d - nx) < 90)) hs.push({ h: nx, est: true });
    const rows = [];
    for (const c of hs) { const b = c.h - HW, i0 = at(T, b - 1) + 1; c.ok = false; rows.push(c);
      if (b > T.last || i0 >= T.t.length || T.t[i0] - b > 6) continue;
      const base = T.c[i0], path = new Float32Array(2 * HW + 1).fill(NaN); let lastQ = null, mn = Infinity, mnQ = null;
      for (let q = -HW; q <= HW; q++) { const d = c.h + q; if (d > T.last) break; const ix = at(T, d); if (ix < 0 || d - T.t[ix] > 6) continue; const v = T.c[ix] / base; path[q + HW] = v; lastQ = q; if (v < mn) { mn = v; mnQ = q; } }
      // bunnen før og toppen etter halveringen (innen 800 dager)
      let lo = -1, hi = -1; for (let ix = Math.max(0, at(T, c.h - 801) + 1); ix < T.t.length && T.t[ix] <= c.h; ix++) if (lo < 0 || T.c[ix] < T.c[lo]) lo = ix;
      for (let ix = Math.max(0, at(T, c.h - 1) + 1); ix < T.t.length && T.t[ix] <= c.h + 800; ix++) if (hi < 0 || T.c[ix] > T.c[hi]) hi = ix;
      const loFull = T.t[0] <= c.h - 800 + 6;
      Object.assign(c, { ok: true, d0: T.t[i0], base, path, lastQ, mn, mnQ, end: fin(path[2 * HW]) ? path[2 * HW] : null,
        lo: lo >= 0 && loFull && T.last >= c.h ? { q: T.t[lo] - c.h, v: T.c[lo] } : null, hi: hi >= 0 ? { q: T.t[hi] - c.h, v: T.c[hi], done: T.last >= c.h + 800 } : null }); }
    return { T, rows };
  }
  function halvCard(m, k, A) {
    const R = halvCycles(m, k); if (!R) return null; const { T, rows } = R, today = Math.floor(Date.now() / DAY);
    const cur = rows.find(r => today >= r.h - HW && today <= r.h + HW) || null, next = rows.find(r => r.h - HW > today) || null;
    const past = rows.filter(r => r !== cur && r.ok && r.h + HW <= T.last), q = cur ? today - cur.h : null;
    const card = el('div', 'card');
    card.append(el('h3', null, `Hvor er vi i forhold til halveringen? (±${HW} dager)`),
      el('p', 'muted small', `Vinduet går fra ${HW} dager før til ${HW} dager etter hver Bitcoin-halvering. Hver syklus er målt fra kursen ${HW} dager før halveringen (= 0 %), slik at du kan se hvor i vinduet vi er nå og sammenligne med de tidligere syklusene.`));
    // nå-boks
    const nb = el('div', 'evnow'), t = [];
    if (cur) { nb.append(el('b', null, q < 0 ? `Nå: dag −${-q} – ${HW + q} dager inn i vinduet` : `Nå: dag +${q} – ${q} dager etter halveringen`));
      t.push(q < 0 ? `Halveringen kommer ${cur.est ? 'etter anslag ' : ''}${dmy(cur.h)}, om ca. ${-q} dager. Vinduet startet ${dmy(cur.h - HW)} og slutter ${dmy(cur.h + HW)}.` : `Halveringen var ${dmy(cur.h)}. Det er ${HW - q} dager igjen til +${HW} (${dmy(cur.h + HW)}).`);
      if (cur.ok && cur.lastQ != null) { const v = cur.path[cur.lastQ + HW]; t.push(`${A.name} er ${pct(v)} siden starten av vinduet (fra ${price(cur.base)} den ${dmy(cur.d0)}).`);
        const same = past.map(r => [r, r.path[cur.lastQ + HW]]).filter(x => fin(x[1]));
        if (same.length) t.push(`På samme dag i tidligere sykluser: ${same.map(([r, x]) => `${hYear(r)} ${pct(x)}`).join(', ')}${same.length >= 2 ? ` (median ${pct(quant(same.map(x => x[1]), 0.5))})` : ''}.`); }
      else t.push(`Kursdata for ${A.name} fra starten av vinduet mangler.`);
      // de tre siste syklusene (den første, 2012, fulgte ikke mønsteret: bunn og topp kom ca. 370 dager fra halveringen)
      const last3 = past.slice(-3), bq = last3.filter(r => r.lo).map(r => r.lo.q), tq = last3.filter(r => r.hi && r.hi.done).map(r => r.hi.q), nm = n => n === 3 ? 'de tre siste syklusene' : `de ${n} siste syklusene`;
      if (bq.length >= 2) { const a = Math.min(...bq), b = Math.max(...bq); t.push(`I ${nm(bq.length)} kom bunnen ${-b}–${-a} dager før halveringen. Med samme avstand denne gangen tilsvarer det ${dmy(cur.h + a)} – ${dmy(cur.h + b)}${today > cur.h + b ? ' – det spennet er nå passert' : today >= cur.h + a ? ' – vi er inne i det spennet nå' : ''}.`); }
      if (tq.length >= 2) { const a = Math.min(...tq), b = Math.max(...tq); t.push(`Toppen kom ${a}–${b} dager etter halveringen, som tilsvarer ${dmy(cur.h + a)} – ${dmy(cur.h + b)}.`); } }
    else if (next) { nb.append(el('b', null, 'Nå: mellom to vinduer')); t.push(`Neste vindu starter ${dmy(next.h - HW)}, om ${next.h - HW - today} dager (${HW} dager før halveringen ${next.est ? 'som er anslått til ' : ''}${dmy(next.h)}).`); }
    nb.append(el('p', null, t.join(' '))); card.append(nb);
    if (cur) card.append(halvBar(cur, past, today));
    // graf
    const gslot = el('div', 'stack'); gslot.style.gap = '12px'; card.append(gslot);
    const redraw = () => gslot.replaceChildren(halvChart(past, cur, redraw));
    redraw();
    // tabell syklus for syklus
    const tb = el('table', 't compact'), hr = el('tr'); ['Halvering', `Kjøp ${HW} d før`, `Salg ${HW} d etter`, 'Gevinst', 'Laveste underveis', 'Bunn', 'Topp'].forEach((x, i) => hr.append(el('th', i ? '' : 'l', x))); tb.append(hr);
    for (const r of [...rows].reverse()) { if (!r.ok && r !== cur) continue; const tr = el('tr', 'evrow' + (r === cur ? ' cur' : '')); tr.style.cursor = 'default';
      const c0 = el('td', 'l'); c0.append(el('b', null, dmy(r.h))); if (r.est) c0.append(el('span', 'muted small sub2', 'anslag')); if (r === cur) c0.append(el('span', 'small sub2', 'pågår')); tr.append(c0);
      if (!r.ok) { tr.append(el('td', 'muted', '–'), el('td', 'muted', '…'), el('td', 'muted', '…'), el('td', 'muted', '…'), el('td', 'muted', '…'), el('td', 'muted', '…')); tb.append(tr); continue; }
      const cb = el('td'); cb.append(el('b', null, price(r.base)), el('span', 'muted small sub2', dmy(r.d0))); tr.append(cb);
      const done = r.end != null, vNow = r.lastQ != null ? r.path[r.lastQ + HW] : null;
      const cs = el('td'); if (done) cs.append(el('b', null, price(r.base * r.end)), el('span', 'muted small sub2', dmy(r.h + HW))); else cs.append(el('span', 'muted', `ca. ${dmy(r.h + HW)}`)); tr.append(cs);
      const cg = el('td', cls(done ? r.end : vNow)); cg.append(el('b', null, pct(done ? r.end : vNow))); if (!done) cg.append(el('span', 'muted small sub2', 'hittil')); tr.append(cg);
      const cm = el('td', r.mn < 1 ? 'down' : 'muted'); cm.append(el('b', null, r.mn < 1 ? pct(r.mn) : 'aldri under'), el('span', 'muted small sub2', r.mnQ == null || r.mn >= 1 ? '' : `dag ${r.mnQ > 0 ? '+' : r.mnQ < 0 ? '−' : ''}${Math.abs(r.mnQ)}`)); tr.append(cm);
      tr.append(el('td', null, r.lo ? `${-r.lo.q} d før` : '…'), el('td', null, r.hi && r.hi.done ? `${r.hi.q} d etter` : '…')); tb.append(tr); }
    const tw = el('div', 'tw'); tw.append(tb); card.append(el('h3', null, 'Syklus for syklus'), tw,
      el('p', 'muted small', `«Bunn» = laveste dagslukk de siste 800 dagene før halveringen. «Topp» = høyeste dagslukk de første 800 dagene etter. «Laveste underveis» = laveste kurs i vinduet målt fra kjøpskursen. Neste halvering er et anslag: den skjer ved blokk 1 050 000, og datoen avhenger av hvor raskt blokkene kommer.`),
      el('div', 'note', 'Bare 3–4 sykluser finnes, og gevinsten har blitt mindre for hver gang. Mønsteret er historikk, ikke en prognose.'));
    return card;
  }
  // tidslinje: −540 … halvering … +540, med i dag og tidligere bunner/topper
  function halvBar(cur, past, today) {
    const box = el('div', 'evchart'), W = 760, Hh = 74, L = 18, w = W - 2 * L, X = q => L + (q + HW) / (2 * HW) * w, s = sv('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': 'Hvor i halveringsvinduet vi er i dag' }); box.append(s);
    s.append(sv('rect', { x: X(-HW), y: 24, width: X(0) - X(-HW), height: 14, fill: css('--axis'), opacity: 0.25, rx: 3 }), sv('rect', { x: X(0), y: 24, width: X(HW) - X(0), height: 14, fill: '#eab308', opacity: 0.35, rx: 3 }));
    for (const r of past) { if (r.lo && r.lo.q >= -HW) { const c = sv('path', { d: `M${X(r.lo.q) - 4} 46 L${X(r.lo.q) + 4} 46 L${X(r.lo.q)} 40 Z`, fill: css('--down') }); const ti = sv('title'); ti.textContent = `Bunn ${hYear(r)}: ${-r.lo.q} dager før`; c.append(ti); s.append(c); }
      if (r.hi && r.hi.done && r.hi.q <= HW) { const c = sv('path', { d: `M${X(r.hi.q) - 4} 18 L${X(r.hi.q) + 4} 18 L${X(r.hi.q)} 23 Z`, fill: css('--up') }); const ti = sv('title'); ti.textContent = `Topp ${hYear(r)}: ${r.hi.q} dager etter`; c.append(ti); s.append(c); } }
    [[-HW, `−${HW} d`, 'start'], [0, 'Halvering', 'middle'], [HW, `+${HW} d`, 'end']].forEach(([q, l, a]) => { const t = sv('text', { x: X(q), y: Hh - 6, 'text-anchor': a, class: 'ax' }); t.textContent = l; s.append(t); });
    s.append(sv('line', { x1: X(0), x2: X(0), y1: 20, y2: 42, stroke: '#a16207', 'stroke-width': 2, 'stroke-dasharray': '3 2' }));
    const q = Math.max(-HW, Math.min(HW, today - cur.h)); s.append(sv('line', { x1: X(q), x2: X(q), y1: 14, y2: 48, stroke: css('--blue'), 'stroke-width': 3 }));
    const t = sv('text', { x: X(q), y: 11, 'text-anchor': q < -HW * 0.8 ? 'start' : q > HW * 0.8 ? 'end' : 'middle', class: 'ax lab', fill: css('--blue') }); t.textContent = `I dag (dag ${q < 0 ? '−' : '+'}${Math.abs(q)})`; s.append(t);
    const lg = el('div', 'legend'); const it = (c, txt) => { const sp = el('span'); const b = el('b'); b.textContent = '▲'; b.style.color = c; b.style.marginRight = '6px'; sp.append(b, document.createTextNode(txt)); return sp; };
    lg.append(it(css('--down'), 'Bunn i tidligere sykluser'), it(css('--up'), 'Topp i tidligere sykluser')); box.append(lg); return box;
  }
  function halvChart(past, cur, redraw) {
    const box = el('div', 'evchart'), W = 760, Hh = 360, P = { l: 60, r: 92, t: 12, b: 30 }, w = W - P.l - P.r, h = Hh - P.t - P.b;
    const s = sv('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': `Kursen fra ${HW} dager før til ${HW} dager etter hver halvering` }); box.append(s);
    const shown = past.filter(r => !HS.off.has(r.h)), now = cur && cur.ok && !HS.off.has('cur') ? cur : null, pal = PAL();
    const colOf = r => pal[past.indexOf(r) % pal.length], v = (r, q) => { const x = r.path[q + HW]; return fin(x) ? x : undefined; };
    const medRows = shown.length >= 2 ? shown : past, med = {}; for (let q = -HW; q <= HW; q++) { const a = medRows.map(r => v(r, q)).filter(x => x !== undefined); med[q] = a.length >= 2 ? quant(a, 0.5) : null; }
    const all = []; for (const r of [...shown, ...(now ? [now] : [])]) for (let q = -HW; q <= HW; q += 3) { const x = v(r, q); if (x !== undefined) all.push(x); }
    if (HS.med) for (let q = -HW; q <= HW; q += 3) if (med[q] != null) all.push(med[q]);
    let lo = Math.log(Math.max(0.03, all.length ? Math.min(...all) : 0.5)), hi = Math.log(Math.min(200, all.length ? Math.max(...all) : 2)); lo = Math.min(lo, Math.log(0.8)); hi = Math.max(hi, Math.log(1.25));
    const X = q => P.l + (q + HW) / (2 * HW) * w, Y = x => P.t + (hi - Math.log(Math.max(x, 1e-6))) / (hi - lo) * h;
    s.append(sv('rect', { x: X(0), y: P.t, width: X(HW) - X(0), height: h, fill: '#eab308', opacity: 0.07 }));
    for (const x of [0.1, 0.25, 0.5, 0.67, 1, 1.5, 2, 3, 5, 10, 20, 50, 100].filter(x => Math.log(x) >= lo && Math.log(x) <= hi)) { s.append(sv('line', { x1: P.l, x2: P.l + w, y1: Y(x), y2: Y(x), stroke: x === 1 ? css('--axis') : css('--grid'), 'stroke-width': x === 1 ? 1.2 : 1 })); const t = sv('text', { x: P.l - 8, y: Y(x) + 4, 'text-anchor': 'end', class: 'ax' }); t.textContent = pct(x); s.append(t); }
    for (const q of [-540, -360, -180, 0, 180, 360, 540]) { const t = sv('text', { x: X(q), y: Hh - 8, 'text-anchor': q === -HW ? 'start' : q === HW ? 'end' : 'middle', class: 'ax' }); t.textContent = q === 0 ? 'Halvering' : `${q > 0 ? '+' : '−'}${Math.abs(q)} d`; s.append(t); }
    s.append(sv('line', { x1: X(0), x2: X(0), y1: P.t, y2: P.t + h, stroke: '#a16207', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
    const line = r => { let d = '', pen = false; for (let q = -HW; q <= HW; q += 2) { const x = v(r, q); if (x === undefined) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(q).toFixed(1) + ' ' + Y(x).toFixed(1); pen = true; } return d; };
    const end = (r, txt, color) => { const q = r.lastQ; if (q == null) return; const t = sv('text', { x: X(q) + 5, y: Y(r.path[q + HW]) + 4, class: 'ax lab', fill: color }); t.textContent = txt; s.append(t); };
    for (const r of shown) { s.append(sv('path', { d: line(r), fill: 'none', stroke: colOf(r), 'stroke-width': 2, opacity: 0.85, 'stroke-linejoin': 'round' })); end(r, hYear(r), colOf(r)); }
    if (HS.med && Object.values(med).some(x => x != null)) { let d = ''; for (let q = -HW; q <= HW; q++) if (med[q] != null) d += (d ? 'L' : 'M') + X(q).toFixed(1) + ' ' + Y(med[q]).toFixed(1); s.append(sv('path', { d, fill: 'none', stroke: css('--fg'), 'stroke-width': 3, 'stroke-dasharray': '7 4', 'stroke-linejoin': 'round' })); }
    if (now) { s.append(sv('path', { d: line(now), fill: 'none', stroke: css('--blue'), 'stroke-width': 3.4, 'stroke-linejoin': 'round' })); const q = now.lastQ; s.append(sv('circle', { cx: X(q), cy: Y(now.path[q + HW]), r: 4.5, fill: css('--blue') })); end(now, 'Nå', css('--blue')); }
    const vl = sv('line', { y1: P.t, y2: P.t + h, stroke: css('--axis'), 'stroke-dasharray': '3 3', visibility: 'hidden' }); s.append(vl);
    const tip = el('div', 'tip'); tip.style.display = 'none'; box.append(tip); const ov = sv('rect', { x: P.l, y: P.t, width: w, height: h, fill: 'transparent' }); s.append(ov);
    ov.addEventListener('pointermove', ev => { const b = s.getBoundingClientRect(), q = Math.round(Math.max(-HW, Math.min(HW, ((ev.clientX - b.left) / b.width * W - P.l) / w * 2 * HW - HW)));
      vl.setAttribute('x1', X(q)); vl.setAttribute('x2', X(q)); vl.setAttribute('visibility', 'visible');
      const ls = [q === 0 ? 'Halveringsdagen' : q < 0 ? `${-q} dager før halveringen` : `${q} dager etter halveringen`];
      if (now && v(now, q) !== undefined) ls.push(`Nå (${hYear(now)}): ${pct(v(now, q))}`); if (HS.med && med[q] != null) ls.push(`Median: ${pct(med[q])}`);
      for (const r of [...shown].reverse()) if (v(r, q) !== undefined) ls.push(`${hYear(r)}: ${pct(v(r, q))}`);
      tip.replaceChildren(...ls.map((x, i) => el(i ? 'div' : 'b', null, x))); tip.style.display = 'grid';
      const bx = box.getBoundingClientRect(); let lx = ev.clientX - bx.left + 14; if (lx > bx.width - 200) lx = ev.clientX - bx.left - 210; tip.style.left = lx + 'px'; tip.style.top = Math.max(0, ev.clientY - bx.top - 30) + 'px'; });
    ov.addEventListener('pointerleave', () => { vl.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; });
    // forklaringen under grafen: trykk på et år = vis bare det (trykk igjen = alle), Shift-trykk = slå av/på ett og ett
    const solo = past.filter(r => !HS.off.has(r.h)).length === 1, items = [];
    if (cur && cur.ok) items.push({ key: 'cur', label: `Nå (${hYear(cur)})`, color: css('--blue'), on: !HS.off.has('cur') });
    items.push({ key: 'med', label: `Median (${medRows.length})`, color: css('--fg'), dash: true, on: HS.med });
    for (const r of [...past].reverse()) items.push({ key: r.h, label: hYear(r), color: colOf(r), on: !HS.off.has(r.h), solo: solo && !HS.off.has(r.h), title: 'Trykk for å vise bare denne syklusen. Shift-trykk for å slå av/på.' });
    const lg = legendBtns(items, (k, ev) => { if (k === 'cur' || multi(ev)) { HS.off.has(k) ? HS.off.delete(k) : HS.off.add(k); } else if (k === 'med') HS.med = !HS.med;
      else { const none = !past.some(r => HS.off.has(r.h)); if (none) past.forEach(r => { if (r.h !== k) HS.off.add(r.h); }); else { HS.off.has(k) ? HS.off.delete(k) : HS.off.add(k); if (past.every(r => HS.off.has(r.h))) past.forEach(r => HS.off.delete(r.h)); } } redraw(); });
    const wrap = el('div', 'stack'); wrap.style.gap = '6px'; wrap.append(el('p', 'muted small', 'Loggskala, 0 % = kursen 540 dager før halveringen. Trykk år under grafen for å velge – velg flere for å sammenligne.'), box, lg); return wrap;
  }

  // ---------------------------------------------------------------- «Grafer som ligner på i dag»: søker gjennom hele kurshistorikken
  // De siste N dagene sammenlignes med alle tidligere perioder på N dager (begge målt fra sluttdagen, loggskala).
  // Avvik = snittavstanden mellom kurvene. De beste treffene må ligge minst N/2 dager fra hverandre og ikke overlappe i dag.
  const LK = { n: 182, sel: new Set(), cache: {} }, LKN = { 91: '3 mnd', 182: '6 mnd', 365: '1 år' };
  function analogs(T, N) {
    const key = `${T.name}|${N}|${T.c.length}`; if (LK.cache[key]) return LK.cache[key];
    const n = T.c.length, end = n - 1; if (n < 3 * N) return (LK.cache[key] = []);
    const lc = Array.from(T.c, v => Math.log(v)), step = Math.max(1, Math.round(N / 90)), cur = []; for (let q = 0; q <= N; q += step) cur.push(lc[end - N + q] - lc[end]);
    const cand = [];
    for (let j = N; j <= end - N; j++) { let s2 = 0, k = 0; for (let q = 0; q <= N; q += step) { s2 += Math.abs(lc[j - N + q] - lc[j] - cur[k]); k++; } cand.push({ j, dev: Math.exp(s2 / k) - 1 }); }
    cand.sort((a, b) => a.dev - b.dev); const out = [];
    for (const c of cand) { if (out.every(o => Math.abs(o.j - c.j) >= N / 2)) out.push(c); if (out.length >= 5) break; }
    for (const o of out) { o.d = T.t[o.j]; o.f = {}; for (const h of [30, 91, 182, 365]) { const ix = at(T, o.d + h); o.f[h] = ix > o.j && T.t[ix] >= o.d + h - 6 ? T.c[ix] / T.c[o.j] : null; } }
    return (LK.cache[key] = out);
  }
  function like(m) {
    const box = document.getElementById('ev-like'); if (!box) return; const T = ser(m, S.a), A = m.assets[S.a]; if (!T) { box.replaceChildren(); return; }
    const N = LK.n, F = N, M = analogs(T, N), card = el('div', 'card'), end = T.t.length - 1;
    const hd = el('div', 'row'); hd.append(el('h2', null, `Grafer som ligner på i dag – ${A.name}`));
    const seg = el('div', 'seg sm'); Object.entries(LKN).forEach(([k, l]) => { const b = el('button', null, `Siste ${l}`); b.type = 'button'; b.setAttribute('aria-pressed', +k === N ? 'true' : 'false'); b.addEventListener('click', () => { LK.n = +k; LK.sel.clear(); like(m); }); seg.append(b); }); hd.append(seg); card.append(hd);
    if (!M.length) { card.append(el('p', 'muted', 'For lite historikk for dette markedet.')); box.replaceChildren(card); return; }
    const selOn = LK.sel.size > 0, pal = PAL(), col = i => pal[i % pal.length];
    // graf: −N … 0 (i dag) … +F, alle målt mot dag 0
    const g = el('div', 'evchart'), W = 760, Hh = 300, P = { l: 56, r: 70, t: 12, b: 28 }, w = W - P.l - P.r, h = Hh - P.t - P.b, sv2 = sv('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': 'Dagens kurve og de mest like periodene før' }); g.append(sv2);
    const pathOf = j => { const o = []; for (let q = -N; q <= F; q++) { const ix = j + q; o.push(ix >= 0 && ix <= end ? T.c[ix] / T.c[j] : undefined); } return o; };
    const cur = pathOf(end), shown = M.map((x, i) => ({ x, i, p: pathOf(x.j) })).filter(o => !selOn || LK.sel.has(o.x.j));
    const all = []; for (const o of [{ p: cur }, ...shown]) for (const v of o.p) if (v !== undefined) all.push(v);
    let lo = Math.log(Math.max(0.05, quant(all, 0.01))), hi = Math.log(Math.min(40, quant(all, 0.99))); lo = Math.min(lo, Math.log(0.8)); hi = Math.max(hi, Math.log(1.25));
    const X = q => P.l + (q + N) / (N + F) * w, Y = r => Math.max(P.t, Math.min(P.t + h, P.t + (hi - Math.log(r)) / (hi - lo) * h));
    for (const r of [0.25, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 5, 10].filter(r => Math.log(r) >= lo && Math.log(r) <= hi)) { sv2.append(sv('line', { x1: P.l, x2: P.l + w, y1: Y(r), y2: Y(r), stroke: r === 1 ? css('--axis') : css('--grid') })); const t = sv('text', { x: P.l - 8, y: Y(r) + 4, 'text-anchor': 'end', class: 'ax' }); t.textContent = pct(r); sv2.append(t); }
    sv2.append(sv('rect', { x: X(0), y: P.t, width: X(F) - X(0), height: h, fill: css('--soft'), opacity: 0.6 }), sv('line', { x1: X(0), x2: X(0), y1: P.t, y2: P.t + h, stroke: css('--blue'), 'stroke-dasharray': '3 3' }));
    for (const [q, l] of [[-N, `−${LKN[N]}`], [0, 'I dag'], [F, `+${LKN[F]}`]]) { const t = sv('text', { x: X(q), y: Hh - 8, 'text-anchor': q === -N ? 'start' : q === F ? 'end' : 'middle', class: 'ax' }); t.textContent = l; sv2.append(t); }
    const d = p => { let s2 = '', pen = false; for (let q = -N; q <= F; q += 2) { const v = p[q + N]; if (v === undefined) { pen = false; continue; } s2 += (pen ? 'L' : 'M') + X(q).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; } return s2; };
    const fut = []; for (let q = 0; q <= F; q++) { const v = shown.map(o => o.p[q + N]).filter(x => x !== undefined); fut.push(v.length >= 2 ? quant(v, 0.5) : null); }
    for (const o of shown) sv2.append(sv('path', { d: d(o.p), fill: 'none', stroke: col(o.i), 'stroke-width': selOn ? 2.4 : 1.6, opacity: selOn ? 0.95 : 0.7 }));
    if (shown.length >= 2) { let s2 = ''; fut.forEach((v, q) => { if (v != null) s2 += (s2 ? 'L' : 'M') + X(q).toFixed(1) + ' ' + Y(v).toFixed(1); }); sv2.append(sv('path', { d: s2, fill: 'none', stroke: css('--fg'), 'stroke-width': 3, 'stroke-dasharray': '7 4' })); }
    sv2.append(sv('path', { d: d(cur), fill: 'none', stroke: css('--blue'), 'stroke-width': 3.4 }));
    card.append(g);
    // liste: trykk for å vise bare den perioden
    const lst = el('div', 'like'); M.forEach((x, i) => { const b = el('button', 'likerow'); b.type = 'button'; b.setAttribute('aria-pressed', LK.sel.has(x.j) ? 'true' : 'false');
      const nm = el('span'); const dot = el('i'); dot.style.cssText = `display:inline-block;width:16px;border-top:3px solid ${col(i)};vertical-align:middle;margin-right:8px`; nm.append(dot, el('b', null, `${dmy(T.t[x.j - N])} – ${dmy(x.d)}`), el('span', 'muted small', ` · ${nf(x.dev * 100, { maximumFractionDigits: 0 })} % avvik`));
      const f = h => { const s2 = el('span', 'small ' + cls(x.f[h])); s2.textContent = `${{ 30: '1 mnd', 91: '3 mnd', 182: '6 mnd', 365: '1 år' }[h]} etter ${x.f[h] == null ? '…' : pct(x.f[h])}`; return s2; };
      b.append(nm, f(30), f(91), f(N === 365 ? 365 : 182)); b.addEventListener('click', ev => { soloSel(LK.sel, x.j, ev); like(m); }); lst.append(b); });
    const v91 = M.map(x => x.f[91]).filter(v => v != null);
    card.append(lst, el('p', 'muted small', `${v91.length ? `De ${v91.length} mest like: median ${pct(quant(v91, 0.5))} 3 måneder etter, ${v91.filter(v => v > 1).length} av ${v91.length} opp. ` : ''}Lik graf har ikke spådd retningen i våre tester – bruk det som inspirasjon, ikke prognose.`));
    if (selOn) { const r = el('button', 'chip', 'Vis alle'); r.type = 'button'; r.addEventListener('click', () => { LK.sel.clear(); like(m); }); card.append(r); }
    box.replaceChildren(card);
  }

  // ---------------------------------------------------------------- tegning
  function render() {
    const root = document.getElementById('hendelser-in'); if (!root) return; const m = E();
    if (!m) { root.replaceChildren(el('p', 'muted', 'Henter historikk …')); return; }
    if (m.err || !m.events) { root.replaceChildren(el('div', 'card', 'Hendelsesdataene er ikke tilgjengelige akkurat nå. De bygges automatisk ved neste oppdatering.')); return; }
    const p = dash.params(); if (p.ev && m.events.some(e => e.id === p.ev)) S.ev = p.ev; if (p.a && m.assets[p.a]) S.a = p.a; if (p.h != null) S.h = clampN(p.h, 7, 1460, 365); if (p.pre != null) S.pre = clampN(p.pre, 0, 730, 30);
    if (!S.built) { S.built = true; const side = el('aside', 'evside'); side.id = 'ev-side'; const main = el('div', 'evmain'); const c = el('div', 'evctl2'); c.id = 'ev-ctl'; const r = el('div', 'stack'); r.id = 'ev-res'; r.style.gap = '12px'; const lk = el('div'); lk.id = 'ev-like';
      main.append(c, r, lk); const lay = el('div', 'evlayout'); lay.append(side, main); root.replaceChildren(lay); }
    sidebar(m); controls(m); const sig = `${S.a}|${m.built}`; if (S.likeSig !== sig || !document.getElementById('ev-like').childElementCount) { S.likeSig = sig; LK.sel.clear(); like(m); } result(m);
  }
  // ---------------------------------------------------------------- sidepanelet: søk, kategori, sortering og liste
  const QS = { key: null, v: {} };
  function quick(m, id) { // median endring etter S.h dager og antall tilfeller, for valgt marked
    const k = `${S.a}|${S.h}|${m.built}`; if (QS.key !== k) { QS.key = k; QS.v = {}; } if (QS.v[id]) return QS.v[id];
    const T = ser(m, S.a), ds = T ? datesFor(m, id, S.a) : [], v = [];
    for (const d of ds) { const i0 = at(T, d - 1) + 1; if (i0 >= T.t.length || T.t[i0] - d > 6 || T.last - T.t[i0] < S.h) continue; const j = at(T, T.t[i0] + S.h); v.push(T.c[j] / T.c[i0]); }
    return (QS.v[id] = { n: v.length, med: quant(v, 0.5), all: ds.length, last: ds.length ? ds[ds.length - 1] : null });
  }
  function sidebar(m) {
    const side = document.getElementById('ev-side'); if (!side) return;
    if (!side.dataset.b) { side.dataset.b = 1;
      const inp = el('input', 'evsearch'); inp.type = 'search'; inp.placeholder = 'Søk: thanksgiving, halvering, FTX …'; inp.setAttribute('aria-label', 'Søk etter hendelse'); inp.value = S.q;
      inp.addEventListener('input', () => { S.q = inp.value; list(m); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = side.querySelector('.evi'); if (f) f.click(); } });
      const cs = el('select', 'evsel'); cs.setAttribute('aria-label', 'Kategori'); cs.append(new Option('Alle kategorier', '')); for (const [c, n] of Object.entries(m.cats)) cs.append(new Option(n, c)); cs.value = S.cat; cs.addEventListener('change', () => { S.cat = cs.value; list(m); });
      const so = el('select', 'evsel'); so.setAttribute('aria-label', 'Sorter'); [['imp', 'Viktigst'], ['new', 'Nyeste'], ['best', 'Best etter'], ['worst', 'Svakest etter'], ['n', 'Flest tilfeller'], ['az', 'A–Å']].forEach(([v, l]) => so.append(new Option(l, v))); so.value = S.sort; so.addEventListener('change', () => { S.sort = so.value; list(m); });
      const f = el('div', 'evfil'); f.append(cs, so); const ls = el('div', 'evlist'); ls.id = 'ev-list'; ls.setAttribute('role', 'listbox');
      side.append(inp, f, ls); }
    list(m);
  }
  function list(m) {
    const box = document.getElementById('ev-list'); if (!box) return; const q = S.q.trim();
    let es = q ? search(m, q, 999) : m.events.slice(); if (S.cat) es = es.filter(e => e.cat === S.cat);
    const st = e => quick(m, e.id), nn = x => x == null ? -Infinity : x;
    const cmp = { imp: (a, b) => (b.imp || 2) - (a.imp || 2) || nn(st(b).last) - nn(st(a).last), new: (a, b) => nn(st(b).last) - nn(st(a).last), best: (a, b) => nn(st(b).med) - nn(st(a).med), worst: (a, b) => nn(-st(b).med) - nn(-st(a).med) || 0, n: (a, b) => st(b).all - st(a).all, az: (a, b) => a.name.localeCompare(b.name, 'nb') }[S.sort];
    if (!q || S.sort !== 'imp') es.sort(cmp);
    const head = el('div', 'evlh'); head.append(el('span', null, `${es.length} hendelser`), el('span', null, `${m.assets[S.a] ? m.assets[S.a].name : ''} · ${hLab(S.h)} etter`));
    const items = es.map(e => { const x = st(e), b = el('button', 'evi' + (e.id === S.ev ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', e.id === S.ev ? 'true' : 'false');
      const imp = el('span', 'imp'); imp.append(...[1, 2, 3].map(k => el('i', k <= (e.imp || 2) ? 'on' : ''))); imp.title = ['', 'Lav', 'Middels', 'Høy'][e.imp || 2] + ' viktighet';
      const nm = el('span', 'nm'); nm.append(el('span', null, e.name), el('small', null, `${m.cats[e.cat]}${x.last != null ? ' · sist ' + new Date(x.last * DAY).getUTCFullYear() : ''}`));
      const r = el('span', 'rt'); r.append(el('b', cls(x.med), x.n ? pct(x.med) : '–'), el('small', null, x.n ? `n=${x.n}` : 'ingen'));
      b.append(imp, nm, r); b.addEventListener('click', () => pick(e.id)); return b; });
    box.replaceChildren(head, ...items, ...(items.length ? [] : [el('p', 'muted small', 'Ingen treff.')]));
    const on = box.querySelector('.evi.on'); if (on && !box.dataset.sc) { box.dataset.sc = 1; on.scrollIntoView({ block: 'nearest' }); }
  }
  // ---------------------------------------------------------------- verktøylinje: marked og vindu (dager før/etter)
  function controls(m) {
    const box = document.getElementById('ev-ctl'); if (!box) return;
    const sel = el('select', 'evsel'); sel.setAttribute('aria-label', 'Marked'); const KN = { krypto: 'Krypto', aksjer: 'Aksjer og indekser', 'råvarer': 'Edelmetaller og råvarer' };
    for (const [kd, kn] of Object.entries(KN)) { const g = document.createElement('optgroup'); g.label = kn; m.order.filter(k => m.assets[k].kind === kd).forEach(k => g.append(new Option(m.assets[k].name, k))); if (g.children.length) sel.append(g); }
    sel.value = S.a; sel.addEventListener('change', () => { S.a = sel.value; S.hl = null; S.sel.clear(); dash.setParams({ a: S.a }); });
    const num = (lab, v, lo, hi, f) => { const l = el('label', 'evnum'); const i = el('input'); i.type = 'number'; i.min = lo; i.max = hi; i.value = v; i.inputMode = 'numeric'; i.setAttribute('aria-label', lab + ' (dager)');
      i.addEventListener('change', () => f(clampN(i.value, lo, hi, v))); l.append(el('span', null, lab), i, el('span', 'muted', 'd')); return l; };
    const before = num('Før', S.pre, 0, 730, v => { S.pre = v; dash.setParams({ pre: v }); }), after = num('Etter', S.h, 7, 1460, v => { S.h = v; dash.setParams({ h: v }); });
    const pr = el('div', 'tgroup'); PRESETS.forEach(([b, a]) => { const x = el('button', 'tb', a === b ? `±${a}d` : `${b}/${a}d`); x.type = 'button'; x.title = `${b} dager før, ${a} dager etter`; x.setAttribute('aria-pressed', S.pre === b && S.h === a ? 'true' : 'false'); x.addEventListener('click', () => { S.pre = b; S.h = a; dash.setParams({ pre: b, h: a }); }); pr.append(x); });
    const jl = el('a', 'small', 'Lignende kurver ↓'); jl.href = '#'; jl.addEventListener('click', e => { e.preventDefault(); const t = document.getElementById('ev-like'); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
    box.replaceChildren(sel, el('span', 'tsep'), before, after, pr, el('span', 'grow'), jl);
  }
  // ---------------------------------------------------------------- tidslinje: hele kurshistorikken med markører for hver gang hendelsen skjedde
  function timeline(m, e, res, A) {
    const LW = window.LightweightCharts, card = el('div', 'card tight'); if (!LW || !res) return card;
    const hd = el('div', 'row'); hd.append(el('h3', null, `${A.name} – ${e.name}`)); const tg = el('div', 'tgroup'); hd.append(tg); card.append(hd);
    const host = el('div', 'evtl'); const tip = el('div', 'evtip'); tip.hidden = true; host.append(tip); card.append(host);
    const T = res.T, CC = { fed: '#5b8def', syklus: '#a16207', kalender: '#8a8780', maned: '#8a8780', onchain: '#d6336c', krypto: '#9c27b0', teknisk: '#2aa198', makro: '#c2362c' };
    const OTH = [['makro', 'Kriser'], ['fed', 'Fed'], ['krypto', 'Krypto'], ['onchain', 'On-chain']];
    OTH.forEach(([c, l]) => { const b = el('button', 'tb', l); b.type = 'button'; b.title = `Vis også viktige ${l.toLowerCase()}-hendelser`; b.setAttribute('aria-pressed', S.tlc.has(c) ? 'true' : 'false'); b.addEventListener('click', () => { S.tlc.has(c) ? S.tlc.delete(c) : S.tlc.add(c); b.setAttribute('aria-pressed', S.tlc.has(c) ? 'true' : 'false'); marks(); }); tg.append(b); });
    requestAnimationFrame(() => {
      const ch = LW.createChart(host, { autoSize: true, localization: { locale: 'nb-NO', dateFormat: 'dd.MM.yy' }, layout: { background: { type: 'solid', color: css('--panel') }, textColor: css('--muted'), fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 },
        grid: { vertLines: { visible: false }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line'), mode: 1 }, timeScale: { borderColor: css('--line') }, crosshair: { mode: 0 } });
      const ln = ch.addAreaSeries({ lineColor: css('--fg'), topColor: 'rgba(127,127,127,.16)', bottomColor: 'rgba(127,127,127,0)', lineWidth: 1.5, priceLineVisible: false, priceFormat: { type: 'price', precision: T.c[T.c.length - 1] < 10 ? 3 : 0, minMove: T.c[T.c.length - 1] < 10 ? 0.001 : 1 } });
      ln.setData(Array.from(T.t, (d, i) => ({ time: d * 86400, value: T.c[i] })));
      const info = new Map();
      window.__evMarks = marks;
      function marks() { info.clear(); const mk = [];
        for (const r of res.rows) { const iso = isoD(r.d), lab = e.labels && e.labels[iso]; info.set(r.d0 * 86400, { n: e.name, d: r.d, c: m.cats[e.cat], t: lab || e.desc, me: true });
          mk.push({ time: r.d0 * 86400, position: 'aboveBar', shape: 'arrowDown', color: S.sel.size && !S.sel.has(r.d) ? css('--axis') : css('--blue'), text: String(new Date(r.d * DAY).getUTCFullYear()) }); }
        for (const o of m.events) { if (o.id === e.id || !S.tlc.has(o.cat) || (o.imp || 2) < 3 || !o.dates) continue;
          for (const ds of o.dates) { const d = dOf(ds), i = at(T, d - 1) + 1; if (i >= T.t.length || T.t[i] - d > 6) continue; const tm = T.t[i] * 86400; if (info.has(tm)) continue;
            info.set(tm, { n: o.name, d, c: m.cats[o.cat], t: (o.labels && o.labels[ds]) || o.desc }); mk.push({ time: tm, position: 'belowBar', shape: 'circle', color: CC[o.cat] || css('--axis'), size: 0.6 }); } }
        mk.sort((a, b) => a.time - b.time); ln.setMarkers(mk); }
      marks();
      ch.subscribeCrosshairMove(p => { if (!p || p.time == null || !p.point) { tip.hidden = true; return; } let best = null, bd = 1e9; for (const [tm, x] of info) { const xx = ch.timeScale().timeToCoordinate(tm); if (xx == null) continue; const dd = Math.abs(xx - p.point.x); if (dd < bd) { bd = dd; best = x; } }
        if (!best || bd > 8) { tip.hidden = true; return; } tip.hidden = false; tip.replaceChildren(el('b', null, best.n), el('span', 'muted', `${dmy(best.d)} · ${best.c}`), el('span', null, best.t)); tip.style.left = Math.min(host.clientWidth - 260, Math.max(0, p.point.x + 12)) + 'px'; });
      ch.subscribeClick(p => { if (!p || p.time == null) return; let best = null, bd = 1e9; for (const r of res.rows) { const dd = Math.abs(r.d0 * 86400 - p.time); if (dd < bd) { bd = dd; best = r; } } if (best && bd < 86400 * 20 && best.avail >= 730) { soloSel(S.sel, best.d); host.dispatchEvent(new CustomEvent('redraw', { bubbles: true })); marks(); } });
      const last = T.t[T.t.length - 1]; ch.timeScale().setVisibleRange({ from: Math.max(T.t[0], (res.rows.length ? res.rows[0].d0 : last) - 120) * 86400, to: last * 86400 });
      card._focus = d => ch.timeScale().setVisibleRange({ from: (d - S.pre - 30) * 86400, to: Math.min(last, d + S.h + 30) * 86400 });
      card._marks = marks;
    });
    return card;
  }
  function result(m) {
    const box = document.getElementById('ev-res'); if (!box) return; const e = m.events.find(x => x.id === S.ev); if (!e) return;
    const res = study(m, S.ev, S.a, Math.max(730, S.h), S.pre), T = res && res.T, A = m.assets[S.a];
    const head = el('div', 'card tight'); const hr = el('div', 'stack'); hr.style.gap = '2px';
    const ttl = el('div', 'row'); ttl.append(el('h2', null, e.name), el('span', 'muted small', `${m.cats[e.cat]} · ${A.name}`)); const ds = el('details', 'evdesc'); ds.append(el('summary', null, e.desc.length > 110 ? e.desc.slice(0, 108).replace(/\s+\S*$/, '') + ' …' : e.desc)); if (e.desc.length > 110) ds.append(el('p', 'small', e.desc));
    hr.append(ttl, ds);
    if (e.hindsight) hr.append(el('span', 'pill warn', 'Kjent først i etterkant'));
    head.append(hr);
    if (!res || !res.rows.length) { const all = datesFor(m, S.ev, S.a); head.append(el('p', 'muted', all.length ? `Hendelsen har skjedd ${all.length} ganger, men ingen av gangene er innenfor kursdataene for ${A.name} (data fra ${dmy(dOf(A.from))}).` : `Ingen tilfeller funnet for ${A.name}.`)); box.replaceChildren(head); return; }
    const rows = res.rows, lastRow = rows[rows.length - 1], cur = lastRow && lastRow.avail < 730 ? lastRow : null; // pågående: siste gang er under 2 år siden
    const done = rows.filter(r => r !== cur), st = summary(rows.filter(r => r !== cur || r.avail >= 365));
    head.append(el('p', 'muted small', `${done.length} tidligere ${done.length === 1 ? 'tilfelle' : 'tilfeller'} fra ${dmy(done.length ? done[0].d : rows[0].d)} · kurser fra ${T.src || 'ukjent kilde'} (${T.from} – ${T.to})${done.length < 5 ? ' · få tilfeller, tolk med stor forsiktighet' : ''}`));
    // nå-boks
    if (cur) { const k = cur.avail, nowR = cur.path[cur.path.length - 1], same = done.filter(r => r.path.length > k).map(r => r.path[k]);
      const nb = el('div', 'evnow'); nb.append(el('b', null, `Nå: dag ${k} siden ${dmy(cur.d)}`));
      const t = [`${A.name} er ${pct(nowR)} siden den dagen.`];
      if (same.length >= 2) t.push(`Tidligere var kursen typisk ${pct(quant(same, 0.5))} på samme dag (halvparten mellom ${pct(quant(same, 0.25))} og ${pct(quant(same, 0.75))}).`);
      if (st.mnD != null && st.nFull >= 2) { const left = Math.round(st.mnD - k); t.push(left > 0 ? `Laveste punkt det første året kom typisk på dag ${Math.round(st.mnD)} – det vil si om ca. ${left} dager (${dmy(cur.d + Math.round(st.mnD))}).` : `Laveste punkt det første året kom typisk på dag ${Math.round(st.mnD)}, altså før der vi er nå.`); }
      nb.append(el('p', null, t.join(' '))); head.append(nb); }
    // tabell: utfall per horisont
    const tb = el('table', 't compact'), trh = el('tr'); ['Etter', 'Median', 'Opp', 'Halvparten mellom', 'Beste', 'Verste', 'Antall'].forEach((x, i) => trh.append(el('th', i ? '' : 'l', x))); tb.append(trh);
    for (const [h, l] of HZ) { const x = st[h]; if (!x.n) continue; const tr = el('tr'); tr.append(el('td', 'l', l), el('td', cls(x.med), pct(x.med)), el('td', null, nf(x.up * 100, { maximumFractionDigits: 0 }) + ' %'), el('td', null, x.n >= 4 ? `${pct(x.q25)} til ${pct(x.q75)}` : '–'), el('td', cls(x.best), pct(x.best)), el('td', cls(x.worst), pct(x.worst)), el('td', null, x.n)); tb.append(tr); }
    const tw = el('div', 'tw'); tw.append(tb);
    const kp = el('div', 'kpis'); const kpi = (k, v, c, s2) => { const d = el('div', 'kpi'); d.append(el('span', 'k', k), el('span', 'v ' + (c || ''), v), el('span', 's', s2)); return d; };
    if (st.nFull) kp.append(kpi('Typisk verste fall underveis', pct(st.mn), 'down', 'Laveste kurs det første året (median)'), kpi('Typisk dag for laveste punkt', `Dag ${Math.round(st.mnD)}`, '', `ca. ${Math.round(st.mnD / 30.4)} mnd etter hendelsen`), kpi('Typisk høyeste underveis', pct(st.mx), 'up', 'Høyeste kurs det første året (median)'));
    const stc = el('div', 'card'); stc.append(el('h3', null, 'Hvordan gikk det etterpå?'), tw); if (st.nFull) stc.append(kp);
    // graf
    const gc = el('div', 'card'); gc.append(el('h3', null, `Sammenligning: dag 0 = hendelsen (${S.pre ? S.pre + ' d før, ' : ''}${hLab(S.h)} etter)`), el('p', 'muted small', 'Alle tilfeller satt til 0 % på dag 0 · loggskala · pek for tall.'));
    const gslot = el('div', 'stack'); gslot.style.gap = '12px'; gc.append(gslot); let ch = null; const cslot = el('div');
    gslot.addEventListener('redraw', e => { e.stopPropagation(); redraw(); });
    const redraw = () => { ch = chart(res, cur, S.h, S.pre); gslot.replaceChildren(filters(res, cur, redraw), ch); if (cur && cur.avail > S.h) gslot.append(el('p', 'muted small', `I dag er dag ${cur.avail} – velg et lengre tidsrom for å se i dag-kurven helt fram.`)); const cc = cur ? compare(res, cur, A, T) : null; cslot.replaceChildren(...(cc ? [cc] : []));
      lt && lt.querySelectorAll('tr.evrow').forEach(tr => tr.classList.toggle('on', S.sel.has(+tr.dataset.d))); };
    // liste over tilfellene
    const lc = el('div', 'card'); lc.append(el('h3', null, 'Alle gangene'));
    var lt;
    lt = el('table', 't compact'); const lh = el('tr'); ['Dato', 'Kurs', '1 mnd', '3 mnd', '6 mnd', '1 år', 'Verste (1 år)', 'Bunn dag'].forEach((x, i) => lh.append(el('th', i ? '' : 'l', x))); lt.append(lh);
    for (const r of [...rows].reverse()) { const tr = el('tr', 'evrow' + (r === cur ? ' cur' : '') + (S.sel.has(r.d) ? ' on' : '')); tr.dataset.d = r.d; const lab = e.labels && e.labels[isoD(r.d)];
      const c0 = el('td', 'l'); c0.append(el('b', null, dmy(r.d))); if (lab) c0.append(el('span', 'muted small sub2', lab)); if (r === cur) c0.append(el('span', 'small sub2', 'pågår'));
      tr.append(c0, el('td', null, price(r.base))); for (const h of [30, 91, 182, 365]) tr.append(el('td', cls(r.hz[h]), r.hz[h] == null ? '…' : pct(r.hz[h])));
      tr.append(el('td', 'down', r.full ? pct(r.mn) : '…'), el('td', null, r.full ? r.mnD : '…'));
      if (r !== cur) { tr.tabIndex = 0; const tg = () => { S.sel.has(r.d) ? S.sel.delete(r.d) : S.sel.add(r.d); redraw(); if (tl._focus) tl._focus(r.d0); if (tl._marks) tl._marks(); }; tr.addEventListener('click', tg); tr.addEventListener('keydown', ev => { if (ev.key === 'Enter') tg(); }); }
      lt.append(tr); }
    const lw = el('div', 'tw'); lw.append(lt); lc.append(lw, el('p', 'muted small', 'Trykk på en rad for å velge den i grafen (eller bruk år-knappene over grafen). «…» = ikke gått lang nok tid ennå. Tilfeller tett i tid påvirkes av de samme markedsforholdene og er ikke helt uavhengige.'));
    const tl = timeline(m, e, res, A); gslot.addEventListener('redraw', () => { if (tl._marks) tl._marks(); });
    redraw();
    const hc = S.ev === 'halving' ? halvCard(m, S.a, A) : null;
    if (!box._l) { box._l = 1; box.addEventListener('redraw', ev2 => { ev2.stopPropagation(); if (box._rd) box._rd(); }); } box._rd = redraw;
    box.replaceChildren(head, tl, gc, stc, cslot, ...(hc ? [hc] : []), lc, el('div', 'note', 'Historikk viser hva som skjedde – ikke hva som vil skje. Ikke kjøps- eller salgsråd.'));
  }
  window.EVENTS = { render, _S: S, _study: study, _search: search, _halv: halvCycles };
})();
