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
  const S = { ev: 'fed_first_hike', a: 'BTC', h: 365, pre: 0, q: '', hl: null, built: false };
  const PRE = { 0: 'Ingen', 30: '30 dager', 91: '3 mnd' };
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
  function search(m, q) { const toks = norm(q).split(/\s+/).filter(Boolean); if (!toks.length) return [];
    return m.events.map(e => { const hay = norm([e.name, ...(e.syn || []), m.cats[e.cat] || ''].join(' ')); let sc = 0; for (const t of toks) { if (!hay.includes(t)) return null; sc += norm(e.name).includes(t) ? 2 : 1; } return { e, sc }; }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 8).map(x => x.e); }
  function pick(id) { S.ev = id; S.q = ''; S.hl = null; dash.setParams({ ev: id }); }

  // ---------------------------------------------------------------- graf
  function chart(res, st, cur, H, PN = 0) {
    const val = (r, k) => k >= 0 ? (k < r.path.length ? r.path[k] : undefined) : (r.pre && r.pre.length + k >= 0 && isFinite(r.pre[r.pre.length + k]) ? r.pre[r.pre.length + k] : undefined);
    const box = el('div', 'evchart'), W = 760, Hh = 340, P = { l: 56, r: 14, t: 12, b: 30 }, w = W - P.l - P.r, h = Hh - P.t - P.b;
    const s = sv('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': 'Kursutvikling etter hver gang hendelsen inntraff' }); box.append(s);
    const done = res.rows.filter(r => r !== cur);
    const med = {}; for (let k = -PN; k <= H; k++) { const v = done.map(r => val(r, k)).filter(x => x !== undefined); med[k] = v.length >= Math.max(2, Math.ceil(done.length / 3)) ? quant(v, 0.5) : null; }
    const all = []; for (const r of res.rows) for (let k = -PN; k <= H; k += 3) { const v = val(r, k); if (v !== undefined) all.push(v); }
    let lo = Math.log(Math.max(0.05, quant(all, 0.02) ?? 0.5)), hi = Math.log(Math.min(40, quant(all, 0.98) ?? 2)); lo = Math.min(lo, Math.log(0.8)); hi = Math.max(hi, Math.log(1.25));
    const X = k => P.l + (k + PN) / (H + PN) * w, Y = r => P.t + (hi - Math.log(Math.max(r, 1e-6))) / (hi - lo) * h, clampY = r => Math.max(P.t, Math.min(P.t + h, Y(r)));
    // akser
    const ticks = [0.25, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2, 3, 5, 10, 20].filter(r => Math.log(r) >= lo && Math.log(r) <= hi);
    for (const r of ticks) { s.append(sv('line', { x1: P.l, x2: P.l + w, y1: Y(r), y2: Y(r), stroke: r === 1 ? css('--axis') : css('--grid'), 'stroke-width': r === 1 ? 1.2 : 1 })); const t = sv('text', { x: P.l - 8, y: Y(r) + 4, 'text-anchor': 'end', class: 'ax' }); t.textContent = pct(r); s.append(t); }
    const xt0 = H <= 31 ? [0, 7, 14, 21, 30] : H <= 91 ? [0, 30, 60, 91] : H <= 182 ? [0, 30, 91, 182] : H <= 365 ? [0, 30, 91, 182, 273, 365] : [0, 91, 182, 365, 547, 730];
    const xt = [...(PN ? [-PN] : []), ...xt0.filter(k => !PN || k === 0 || k >= H * 0.15)]; for (const k of xt) { const t = sv('text', { x: X(k), y: Hh - 8, 'text-anchor': k === -PN ? 'start' : k === H ? 'end' : 'middle', class: 'ax' }); t.textContent = k === 0 ? 'Dag 0' : `${k} d`; s.append(t); }
    if (PN) s.append(sv('line', { x1: X(0), x2: X(0), y1: P.t, y2: P.t + h, stroke: css('--axis'), 'stroke-width': 1.2 }));
    const line = r => { let d = '', pen = false; for (let k = -PN; k <= H; k += (H + PN > 400 ? 2 : 1)) { const v = val(r, k); if (v === undefined) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(k).toFixed(1) + ' ' + clampY(v).toFixed(1); pen = true; } return d; };
    // tidligere tilfeller
    const paths = []; for (const r of done) { const g = sv('path', { d: line(r), fill: 'none', stroke: r.path[Math.min(H, r.path.length - 1)] >= 1 ? css('--up') : css('--down'), 'stroke-width': 1.3, opacity: 0.35, class: 'evp' }); g.dataset.d = r.d; s.append(g); paths.push([g, r]); }
    if (Object.values(med).some(v => v != null)) { let d = ''; for (let k = -PN; k <= H; k++) { const v = med[k]; if (v == null) continue; d += (d ? 'L' : 'M') + X(k).toFixed(1) + ' ' + clampY(v).toFixed(1); } s.append(sv('path', { d, fill: 'none', stroke: css('--fg'), 'stroke-width': 3, 'stroke-linejoin': 'round' })); }
    if (cur) { s.append(sv('path', { d: line(cur), fill: 'none', stroke: css('--blue'), 'stroke-width': 3.2, 'stroke-linejoin': 'round' })); const k = Math.min(H, cur.path.length - 1); s.append(sv('circle', { cx: X(k), cy: clampY(cur.path[k]), r: 4.5, fill: css('--blue') })); }
    // markering ved klikk i tabellen
    const mark = d => paths.forEach(([g, r]) => { const on = d != null && r.d === d; g.setAttribute('opacity', d == null ? 0.35 : on ? 1 : 0.12); g.setAttribute('stroke-width', on ? 3 : 1.3); });
    // hover: loddrett strek og verdier
    const vl = sv('line', { y1: P.t, y2: P.t + h, stroke: css('--axis'), 'stroke-dasharray': '3 3', visibility: 'hidden' }); s.append(vl);
    const tip = el('div', 'tip'); tip.style.display = 'none'; box.append(tip);
    const ov = sv('rect', { x: P.l, y: P.t, width: w, height: h, fill: 'transparent' }); s.append(ov);
    const move = ev => { const r = s.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, k = Math.round(Math.max(-PN, Math.min(H, (px - P.l) / w * (H + PN) - PN)));
      vl.setAttribute('x1', X(k)); vl.setAttribute('x2', X(k)); vl.setAttribute('visibility', 'visible');
      // nærmeste tidligere tilfelle til musepekeren
      const py = (ev.clientY - r.top) / r.height * Hh; let best = null, bd = 1e9; for (const [, rr] of paths) { const vv = val(rr, k); if (vv === undefined) continue; const dy = Math.abs(clampY(vv) - py); if (dy < bd) { bd = dy; best = rr; } }
      mark(bd < 14 && best ? best.d : S.hl);
      const lines = [k < 0 ? `${-k} dager før` : `Dag ${k}`]; if (med[k] != null) lines.push(`Median: ${pct(med[k])}`); if (cur && val(cur, k) !== undefined) lines.push(`Nå (${dmy(cur.d)}): ${pct(val(cur, k))}`); if (bd < 14 && best) lines.push(`${dmy(best.d)}: ${pct(val(best, k))}`);
      tip.replaceChildren(...lines.map((t, i) => el(i ? 'div' : 'b', null, t))); tip.style.display = 'block';
      const bx = box.getBoundingClientRect(); let lx = ev.clientX - bx.left + 14; if (lx > bx.width - 180) lx = ev.clientX - bx.left - 190; tip.style.left = lx + 'px'; tip.style.top = Math.max(0, ev.clientY - bx.top - 30) + 'px'; };
    ov.addEventListener('pointermove', move); ov.addEventListener('pointerleave', () => { vl.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; mark(S.hl); });
    mark(S.hl); box._mark = mark;
    const lg = el('div', 'legend'); const it = (c, t, wd = 3) => { const sp = el('span'); const i = el('i'); i.style.borderTopColor = c; i.style.borderTopWidth = wd + 'px'; sp.append(i, document.createTextNode(t)); return sp; };
    lg.append(it(css('--fg'), 'Median av tidligere tilfeller'), it(css('--up'), 'Tidligere tilfelle som endte opp', 2), it(css('--down'), 'Tidligere tilfelle som endte ned', 2)); if (cur) lg.append(it(css('--blue'), `Nå (fra ${dmy(cur.d)})`));
    box.append(lg); return box;
  }

  // ---------------------------------------------------------------- tegning
  function render() {
    const root = document.getElementById('hendelser-in'); if (!root) return; const m = E();
    if (!m) { root.replaceChildren(el('p', 'muted', 'Henter historikk …')); return; }
    if (m.err || !m.events) { root.replaceChildren(el('div', 'card', 'Hendelsesdataene er ikke tilgjengelige akkurat nå. De bygges automatisk ved neste oppdatering.')); return; }
    const p = dash.params(); if (p.ev && m.events.some(e => e.id === p.ev)) S.ev = p.ev; if (p.a && m.assets[p.a]) S.a = p.a; if (p.h && VIEW[p.h]) S.h = +p.h; if (p.pre != null && PRE[p.pre] != null) S.pre = +p.pre;
    if (!S.built) { S.built = true; root.replaceChildren(searchBox(m), el('div', 'stack', null), el('div', 'stack', null)); root.children[1].id = 'ev-ctl'; root.children[2].id = 'ev-res'; root.children[2].style.gap = '20px'; }
    controls(m); result(m);
  }
  function searchBox(m) {
    const card = el('div', 'card'); const lab = el('label', 'stack'); lab.style.gap = '6px'; lab.append(el('b', null, 'Søk etter en hendelse'));
    const inp = el('input', 'evsearch'); inp.type = 'search'; inp.placeholder = 'F.eks. renteheving, midtvalg, 200-ukers, krig, VIX, halvering …'; inp.autocomplete = 'off'; inp.setAttribute('aria-controls', 'ev-sugg'); lab.append(inp);
    const sug = el('div', 'evsugg'); sug.id = 'ev-sugg'; sug.setAttribute('role', 'listbox');
    const show = () => { const r = search(m, inp.value); sug.replaceChildren(...r.map(e => { const b = el('button', 'evopt'); b.type = 'button'; b.setAttribute('role', 'option'); b.append(el('b', null, e.name), el('span', 'muted small', ' · ' + m.cats[e.cat])); b.addEventListener('click', () => { inp.value = ''; sug.replaceChildren(); pick(e.id); }); return b; }));
      if (inp.value.trim() && !r.length) sug.append(el('p', 'muted small', 'Ingen treff. Prøv et annet ord, eller bla i listen under.')); };
    inp.addEventListener('input', show); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = search(m, inp.value); if (r[0]) { inp.value = ''; sug.replaceChildren(); pick(r[0].id); } } if (e.key === 'Escape') { inp.value = ''; sug.replaceChildren(); } });
    const all = el('details', 'more'); all.append(el('summary', null, `Alle hendelser (${m.events.length})`)); const inn = el('div', 'in');
    for (const [c, cn] of Object.entries(m.cats)) { const es = m.events.filter(e => e.cat === c); if (!es.length) continue; const g = el('div', 'stack'); g.style.gap = '6px'; g.append(el('b', null, cn)); const ch = el('div', 'chips');
      es.forEach(e => { const b = el('button', 'chip', e.name); b.type = 'button'; b.dataset.ev = e.id; b.addEventListener('click', () => { all.open = false; pick(e.id); window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' }); }); ch.append(b); }); g.append(ch); inn.append(g); }
    all.append(inn); card.append(lab, sug, all); return card;
  }
  function controls(m) {
    const box = document.getElementById('ev-ctl'); if (!box) return;
    const segA = el('div', 'seg'); segA.setAttribute('role', 'group'); segA.setAttribute('aria-label', 'Velg marked');
    m.order.forEach(k => { const b = el('button', null, m.assets[k].name); b.type = 'button'; b.setAttribute('aria-pressed', k === S.a ? 'true' : 'false'); b.addEventListener('click', () => { S.a = k; S.hl = null; dash.setParams({ a: k }); }); segA.append(b); });
    const segH = el('div', 'seg'); segH.setAttribute('role', 'group'); segH.setAttribute('aria-label', 'Tidsrom i grafen');
    Object.entries(VIEW).forEach(([h, l]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', +h === S.h ? 'true' : 'false'); b.addEventListener('click', () => { S.h = +h; dash.setParams({ h }); }); segH.append(b); });
    const segP = el('div', 'seg'); segP.setAttribute('role', 'group'); segP.setAttribute('aria-label', 'Vis også før hendelsen');
    Object.entries(PRE).forEach(([n, l]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', +n === S.pre ? 'true' : 'false'); b.addEventListener('click', () => { S.pre = +n; dash.setParams({ pre: n }); }); segP.append(b); });
    const r3 = el('div', 'stack'); r3.style.gap = '6px'; r3.append(el('span', 'muted small', 'Vis også før hendelsen'), segP);
    const r1 = el('div', 'stack'); r1.style.gap = '6px'; r1.append(el('span', 'muted small', 'Marked'), segA); const r2 = el('div', 'stack'); r2.style.gap = '6px'; r2.append(el('span', 'muted small', 'Vis i grafen'), segH);
    const row = el('div', 'evctl'); row.append(r2, r3); box.replaceChildren(r1, row);
    document.querySelectorAll('#hendelser-in .chip[data-ev]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ev === S.ev ? 'true' : 'false'));
  }
  function result(m) {
    const box = document.getElementById('ev-res'); if (!box) return; const e = m.events.find(x => x.id === S.ev); if (!e) return;
    const res = study(m, S.ev, S.a, Math.max(S.h, 365), S.pre), T = res && res.T, A = m.assets[S.a];
    const head = el('div', 'card'); const hr = el('div', 'stack'); hr.style.gap = '4px';
    hr.append(el('span', 'muted', `${m.cats[e.cat]} · ${A.name}`), el('h2', null, `Hva skjedde med ${A.name} etter «${e.name.toLowerCase()}»?`), el('p', null, e.desc));
    if (e.hindsight) hr.append(el('div', 'note', 'Denne hendelsen vet man først i etterkant. Den er nyttig for å forstå historien, men du kunne ikke handlet på den i sanntid.'));
    head.append(hr);
    if (!res || !res.rows.length) { const all = datesFor(m, S.ev, S.a); head.append(el('p', 'muted', all.length ? `Hendelsen har skjedd ${all.length} ganger, men ingen av gangene er innenfor kursdataene for ${A.name} (data fra ${dmy(dOf(A.from))}).` : `Ingen tilfeller funnet for ${A.name}.`)); box.replaceChildren(head); return; }
    const rows = res.rows, lastRow = rows[rows.length - 1], cur = lastRow && lastRow.avail < Math.max(S.h, 365) ? lastRow : null;
    const done = rows.filter(r => r !== cur), st = summary(done);
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
    const gc = el('div', 'card'); gc.append(el('h3', null, `Kursen dag for dag etter hendelsen (${VIEW[S.h]})`), el('p', 'muted small', 'Hver tynne linje er én tidligere gang. Loggskala: like store prosentbevegelser er like høye. Pek på en linje for å se datoen.'));
    const ch = chart(res, st, cur, S.h, S.pre); gc.append(ch);
    // liste over tilfellene
    const lc = el('div', 'card'); lc.append(el('h3', null, 'Alle gangene'));
    const lt = el('table', 't compact'), lh = el('tr'); ['Dato', 'Kurs', '1 mnd', '3 mnd', '6 mnd', '1 år', 'Verste (1 år)', 'Bunn dag'].forEach((x, i) => lh.append(el('th', i ? '' : 'l', x))); lt.append(lh);
    for (const r of [...rows].reverse()) { const tr = el('tr', 'evrow' + (r === cur ? ' cur' : '') + (S.hl === r.d ? ' on' : '')); const lab = e.labels && e.labels[isoD(r.d)];
      const c0 = el('td', 'l'); c0.append(el('b', null, dmy(r.d))); if (lab) c0.append(el('span', 'muted small sub2', lab)); if (r === cur) c0.append(el('span', 'small sub2', 'pågår'));
      tr.append(c0, el('td', null, price(r.base))); for (const h of [30, 91, 182, 365]) tr.append(el('td', cls(r.hz[h]), r.hz[h] == null ? '…' : pct(r.hz[h])));
      tr.append(el('td', 'down', r.full ? pct(r.mn) : '…'), el('td', null, r.full ? r.mnD : '…'));
      if (r !== cur) { tr.tabIndex = 0; const tg = () => { S.hl = S.hl === r.d ? null : r.d; lt.querySelectorAll('tr.on').forEach(x => x.classList.remove('on')); if (S.hl === r.d) tr.classList.add('on'); ch._mark(S.hl); }; tr.addEventListener('click', tg); tr.addEventListener('keydown', ev => { if (ev.key === 'Enter') tg(); }); }
      lt.append(tr); }
    const lw = el('div', 'tw'); lw.append(lt); lc.append(lw, el('p', 'muted small', 'Trykk på en rad for å markere den i grafen. «…» = ikke gått lang nok tid ennå. Tilfeller tett i tid påvirkes av de samme markedsforholdene og er ikke helt uavhengige.'));
    box.replaceChildren(head, stc, gc, lc, el('div', 'note', 'Historikk viser hva som skjedde – ikke hva som vil skje. Ikke kjøps- eller salgsråd.'));
  }
  window.EVENTS = { render, _S: S, _study: study, _search: search };
})();
