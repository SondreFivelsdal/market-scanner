// Syklus-fanen: hvor i syklusen er Bitcoin? Leser data/cycle.json (bygges av scripts/events.js + scripts/cycle.js).
(() => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const NS = 'http://www.w3.org/2000/svg', sv = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a || {}) e.setAttribute(k, a[k]); return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const pc = (v, d = 0) => { if (v == null || !isFinite(v)) return '–'; const r = Math.round(v * 100 * 10 ** d) / 10 ** d; return (r > 0 ? '+' : r < 0 ? '−' : '') + nf(Math.abs(r), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %'; };
  const usd = v => v == null ? '–' : (v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) : nf(v, { maximumSignificantDigits: 3 })) + ' $';
  const DAY = 864e5, dOf = s => Math.floor(Date.parse(s + 'T00:00:00Z') / DAY);
  const my = d => new Date(d * DAY).toLocaleDateString('nb-NO', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dmy = d => new Date(d * DAY).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const RANGE = { all: ['Alt', 1e9], 8: ['8 år', 8 * 365], 4: ['4 år', 4 * 365], 1: ['1 år', 365] };
  const S = { r: 'all' };
  const D = () => { const d = dash.data('cycle'); return d.status === 'ok' ? d.data : d.status === 'error' ? { err: true } : null; };
  const go = (ev, extra = {}) => { dash.setParams({ tab: 'hendelser', ev, a: 'BTC', ...extra }); window.scrollTo({ top: 0 }); };

  // ---------------------------------------------------------------- gjenbrukbar linjegraf (SVG). series: [{name, color, w, dash, data: [[dag, verdi]], bars}]
  function lineChart({ series, log = false, zones = [], marks = [], fmt = v => nf(v), h: Hh = 300, from = -Infinity, zero = false, min = null, max = null }) {
    const box = el('div', 'evchart'), W = 760, P = { l: 78, r: 12, t: 10, b: 26 }, w = W - P.l - P.r, h = Hh - P.t - P.b;
    const s = sv('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img' }); box.append(s);
    const ss = series.map(x => ({ ...x, data: x.data.filter(p => p[0] >= from && p[1] != null && isFinite(p[1]) && (!log || p[1] > 0)) })).filter(x => x.data.length);
    if (!ss.length) { box.append(el('p', 'muted small', 'Ingen data i denne perioden.')); return box; }
    const xs = ss.flatMap(x => x.data.map(p => p[0])), x0 = Math.min(...xs), x1 = Math.max(...xs);
    let ys = ss.flatMap(x => x.data.map(p => p[1])); if (zero) ys.push(0); if (min != null) ys.push(min); if (max != null) ys.push(max);
    let lo = Math.min(...ys), hi = Math.max(...ys); if (log) { lo = Math.log(lo); hi = Math.log(hi); } const pad = (hi - lo) * 0.04 || 1; if (min == null) lo -= pad; if (max == null) hi += pad;
    const X = d => P.l + (d - x0) / Math.max(1, x1 - x0) * w, Y = v => P.t + (hi - (log ? Math.log(Math.max(v, 1e-12)) : v)) / (hi - lo) * h;
    for (const z of zones) { const a = Y(Math.min(Math.max(z.hi, log ? Math.exp(lo) : lo), log ? Math.exp(hi) : hi)), b = Y(Math.max(Math.min(z.lo, log ? Math.exp(hi) : hi), log ? Math.exp(lo) : lo)); s.append(sv('rect', { x: P.l, y: Math.min(a, b), width: w, height: Math.abs(b - a), fill: z.color, opacity: 0.13 })); }
    // y-akse: 5 ruter
    const ticks = []; if (log) { const e0 = Math.floor(lo / Math.LN10), e1 = Math.ceil(hi / Math.LN10); for (let e = e0; e <= e1; e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (Math.log(v) >= lo && Math.log(v) <= hi) ticks.push(v); } }
    else { const st = niceStep((hi - lo) / 5); for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) ticks.push(+v.toPrecision(10)); }
    const tk = ticks.length > 8 ? ticks.filter((_, i) => i % Math.ceil(ticks.length / 7) === 0) : ticks;
    for (const v of tk) { s.append(sv('line', { x1: P.l, x2: P.l + w, y1: Y(v), y2: Y(v), stroke: v === 0 ? css('--axis') : css('--grid') })); const t = sv('text', { x: P.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'ax' }); t.textContent = fmt(v); s.append(t); }
    const yrs = []; for (let y = new Date(x0 * DAY).getUTCFullYear() + 1; y <= new Date(x1 * DAY).getUTCFullYear(); y++) yrs.push(y); const every = Math.ceil(yrs.length / 8);
    yrs.forEach((y, i) => { if (i % every) return; const d = dOf(y + '-01-01'), t = sv('text', { x: X(d), y: Hh - 6, 'text-anchor': 'middle', class: 'ax' }); t.textContent = y; s.append(t); s.append(sv('line', { x1: X(d), x2: X(d), y1: P.t, y2: P.t + h, stroke: css('--grid') })); });
    if (!yrs.length) { for (const d of [x0, x1]) { const t = sv('text', { x: X(d), y: Hh - 6, 'text-anchor': d === x0 ? 'start' : 'end', class: 'ax' }); t.textContent = my(d); s.append(t); } }
    for (const m of marks) { if (m.d < x0 || m.d > x1) continue; s.append(sv('line', { x1: X(m.d), x2: X(m.d), y1: P.t, y2: P.t + h, stroke: m.color, 'stroke-dasharray': '2 4', opacity: 0.7 })); }
    for (const x of ss) { if (x.bars) { const bw = Math.max(1, w / x.data.length * 0.8), y0 = Y(0); for (const [d, v] of x.data) s.append(sv('rect', { x: X(d) - bw / 2, y: Math.min(Y(v), y0), width: bw, height: Math.max(0.5, Math.abs(Y(v) - y0)), fill: v >= 0 ? (x.pos || x.color) : (x.neg || x.color), opacity: 0.8 })); continue; }
      let d = ''; x.data.forEach((p, i) => { d += (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }); s.append(sv('path', { d, fill: 'none', stroke: x.color, 'stroke-width': x.w || 2, 'stroke-dasharray': x.dash || '', 'stroke-linejoin': 'round' })); }
    // hover
    const vl = sv('line', { y1: P.t, y2: P.t + h, stroke: css('--axis'), 'stroke-dasharray': '3 3', visibility: 'hidden' }); s.append(vl);
    const tip = el('div', 'tip'); tip.style.display = 'none'; box.append(tip); const ov = sv('rect', { x: P.l, y: P.t, width: w, height: h, fill: 'transparent' }); s.append(ov);
    const near = (arr, d) => { let lo2 = 0, hi2 = arr.length - 1; while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; if (arr[m][0] < d) lo2 = m + 1; else hi2 = m; } const a = arr[Math.max(0, lo2 - 1)], b = arr[lo2]; return Math.abs(a[0] - d) < Math.abs(b[0] - d) ? a : b; };
    ov.addEventListener('pointermove', ev => { const r = s.getBoundingClientRect(), d = x0 + ((ev.clientX - r.left) / r.width * W - P.l) / w * (x1 - x0); vl.setAttribute('x1', X(d)); vl.setAttribute('x2', X(d)); vl.setAttribute('visibility', 'visible');
      const lines = ss.map(x => { const p = near(x.data, d); return Math.abs(p[0] - d) < 20 ? `${x.name}: ${fmt(p[1])}` : null; }).filter(Boolean);
      tip.replaceChildren(el('b', null, dmy(Math.round(d))), ...lines.map(t => el('div', null, t))); tip.style.display = 'grid'; const bx = box.getBoundingClientRect(); let lx = ev.clientX - bx.left + 14; if (lx > bx.width - 200) lx -= 220; tip.style.left = lx + 'px'; tip.style.top = Math.max(0, ev.clientY - bx.top - 30) + 'px'; });
    ov.addEventListener('pointerleave', () => { vl.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; });
    const lg = el('div', 'legend'); for (const x of ss) { const sp = el('span'), i = el('i'); i.style.borderTopColor = x.pos || x.color; if (x.dash) i.style.borderTopStyle = 'dashed'; sp.append(i, document.createTextNode(x.name)); lg.append(sp); }
    for (const z of zones.filter(z => z.name)) { const sp = el('span'), b = el('b', 'zsw'); b.style.background = z.color; b.style.opacity = 0.35; sp.append(b, document.createTextNode(z.name)); lg.append(sp); }
    box.append(lg); return box;
  }
  const niceStep = r => { const e = 10 ** Math.floor(Math.log10(r)), f = r / e; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e; };

  // ---------------------------------------------------------------- deler av siden
  const kpi = (k, v, c, s2) => { const d = el('div', 'kpi'); d.append(el('span', 'k', k), el('span', 'v ' + (c || ''), v), el('span', 's', s2)); return d; };
  const card = (title, lead) => { const c = el('div', 'card'); const h = el('div', 'stack'); h.style.gap = '4px'; h.append(el('h2', null, title)); if (lead) h.append(el('p', 'muted', lead)); c.append(h); return c; };
  const range = () => { const sg = el('div', 'seg'); sg.setAttribute('role', 'group'); sg.setAttribute('aria-label', 'Periode i grafene'); Object.entries(RANGE).forEach(([k, [l]]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', k === S.r ? 'true' : 'false'); b.addEventListener('click', () => { S.r = k; render(); }); sg.append(b); }); return sg; };
  const shortcut = (txt, ev, extra) => { const b = el('button', 'chip', txt); b.type = 'button'; b.addEventListener('click', () => go(ev, extra)); return b; };
  function render() {
    const root = document.getElementById('syklus-in'); if (!root) return; const m = D();
    if (!m) { root.replaceChildren(el('p', 'muted', 'Henter syklusdata …')); return; }
    if (m.err || !m.now) { root.replaceChildren(el('div', 'card', 'Syklusdataene er ikke tilgjengelige akkurat nå. De bygges automatisk ved neste oppdatering.')); return; }
    const n = m.now, from = m.w[m.w.length - 1][0] - RANGE[S.r][1], up = css('--up'), dn = css('--down');
    const bots = m.atBot || [], rng = (k, f = pc) => { const v = bots.map(b => b[k]).filter(x => x != null); if (!v.length) return '–'; const a = Math.min(...v), b = Math.max(...v); return a === b ? f(a) : `${f(a)} til ${f(b)}`; };
    const marks = [...(m.cycles || []).map(c => ({ d: dOf(c.top), color: dn })), ...(m.cycles || []).filter(c => c.done).map(c => ({ d: dOf(c.bot), color: up }))];
    // 1) nøkkeltall
    const k1 = el('div', 'kpis');
    k1.append(kpi('Mot 200-ukerslinja', pc(n.vs200), n.vs200 < 0 ? 'down' : 'up', `Linja: ${usd(n.w200)} · 30 % under: ${usd(n.under30)} · tidligere bunner: ${rng('vs200')}`),
      kpi('Mot realisert pris', n.vsRp == null ? '–' : pc(n.vsRp), n.vsRp < 0 ? 'down' : 'up', n.rp ? `Realisert pris: ${usd(n.rp)} (snittprisen alle bitcoins sist ble flyttet til) · tidligere bunner: ${rng('vsRp')}` : 'Ikke tilgjengelig'),
      kpi('MVRV-Z', n.z == null ? '–' : nf(n.z, { maximumFractionDigits: 2 }), n.z < 0 ? 'up' : n.z > 5 ? 'down' : '', `Hvor høyt markedsverdien ligger over «kostprisen». Bunner: ${rng('z', v => nf(v, { maximumFractionDigits: 1 }))} · topper: ${(m.atTop || []).map(t => nf(t.z, { maximumFractionDigits: 1 })).join(', ')}`),
      kpi('Risiko (vårt mål, 0–1)', n.risk == null ? '–' : nf(n.risk, { maximumFractionDigits: 2 }), n.risk < 0.25 ? 'up' : n.risk > 0.75 ? 'down' : '', `0 = billigst i historien, 1 = dyrest. Bunner: ${rng('risk', v => nf(v, { maximumFractionDigits: 2 }))}`),
      kpi('Uker siden toppen', `${n.weeksSinceAth} uker`, '', `Toppen: ${usd(n.ath)} (${dmy(dOf(n.athD))}). Tidligere bunner kom ${(m.cycles || []).filter(c => c.done).map(c => c.weeks).join(', ')} uker etter toppen`),
      kpi('Røde uker på rad', String(n.red), n.red >= 5 ? 'down' : '', `Ukelukk lavere enn uka før. ${n.red >= 5 ? 'Typisk for en kapitulasjonsspiral.' : 'Fem eller flere på rad kalles ofte «ned hver uke».'}`));
    const top = card('Hvor i syklusen er Bitcoin?', `Siste kurs ${usd(n.p)} (${dmy(dOf(n.d))}). Tallene sammenlignes med hvor de lå ved tidligere syklusbunner.`); top.append(k1);
    const sc = el('div', 'stack'); sc.style.gap = '6px'; sc.append(el('span', 'muted small', 'Se hva som skjedde etter …'));
    const ch = el('div', 'chips'); ch.append(shortcut('Første renteheving', 'fed_first_hike'), shortcut('Renteheving i september i midtvalgsår', 'fed_sep_midterm'), shortcut('Midtvalgsår (hittil i år)', 'midterm_year'), shortcut('Midtvalg (valgdagen)', 'midterm_day'),
      shortcut('Fakeout over range', 'fakeout'), shortcut('Under 200-ukerslinja', 'w200_under'), shortcut('30 % under 200-ukerslinja', 'w200_m30'), shortcut('5 røde uker på rad', 'red5'), shortcut('Store børsnoteringer (90 d før)', 'ipo', { pre: 91 }));
    sc.append(ch); top.append(sc);
    // 2) kurs med linjer
    const c2 = card('Kursen og de store linjene', 'Loggskala. Bitcoin har historisk bunnet rundt eller under 200-ukerslinja og realisert pris. Røde streker = syklustopper, grønne = bunner.');
    const wk = m.w; c2.append(range(), lineChart({ log: true, from, marks, fmt: usd, h: 360, series: [
      { name: 'Bitcoin (ukelukk)', color: css('--fg'), w: 2, data: wk.map(r => [r[0], r[1]]) },
      { name: '200-ukerslinja', color: css('--orange'), w: 2.2, data: wk.map(r => [r[0], r[2]]) },
      { name: '30 % under 200-ukerslinja', color: css('--orange'), w: 1.2, dash: '4 4', data: wk.map(r => [r[0], r[2] && r[2] * 0.7]) },
      { name: '50-ukerslinja', color: css('--blue'), w: 1.6, data: wk.map(r => [r[0], r[3]]) },
      { name: 'Realisert pris', color: css('--purple'), w: 2, data: wk.map(r => [r[0], r[4]]) } ] }));
    // 3) risiko og MVRV-Z
    const c3 = card('Risiko (0–1) og MVRV-Z', 'Risikomålet er vårt eget: snittet av hvor høyt avstanden til 200-ukerslinja, MVRV-Z og kurs mot 200-dagerslinja ligger mot all tidligere historikk (bare data kjent hver uke). Under 0,2 har vært nær bunner, over 0,8 nær topper.');
    c3.append(lineChart({ from, marks, fmt: v => nf(v, { maximumFractionDigits: 2 }), h: 220, min: 0, max: 1, zones: [{ lo: 0, hi: 0.2, color: up, name: 'Lav risiko (0–0,2)' }, { lo: 0.8, hi: 1, color: dn, name: 'Høy risiko (0,8–1)' }], series: [{ name: 'Risiko', color: css('--fg'), data: wk.map(r => [r[0], r[6]]) }] }));
    c3.append(lineChart({ from, marks, fmt: v => nf(v, { maximumFractionDigits: 1 }), h: 220, zero: true, zones: [{ lo: -3, hi: 0, color: up, name: 'Under kostpris (MVRV-Z < 0)' }, { lo: 6, hi: 20, color: dn, name: 'Overopphetet (MVRV-Z > 6)' }], series: [{ name: 'MVRV-Z', color: css('--purple'), data: wk.map(r => [r[0], r[5]]) }] }));
    // 4) børsstrømmer
    const c4 = card('Penger inn og ut av børser', 'Strømmer av bitcoin til og fra børser (Coin Metrics). Store innstrømmer betyr ofte at noen vil selge – ved tidligere bunner kom det typisk et kraftig salgsras med rekordstore innstrømmer. Synkende børsbeholdning betyr at flere tar bitcoin ut for å eie dem selv.');
    const fl = m.flows || []; if (fl.length) { const L = fl[fl.length - 1];
      c4.append(el('div', 'kpis')); c4.lastChild.append(kpi('Netto til børser siste 4 uker', n.net4w == null ? '–' : (n.net4w >= 0 ? '+' : '−') + nf(Math.abs(n.net4w) / 1e9, { maximumFractionDigits: 1 }) + ' mrd. $', n.net4w > 0 ? 'down' : 'up', 'Positivt = mer inn enn ut (salgspress)'),
        kpi('Innstrøm siste uke mot historikken', n.inPct == null ? '–' : nf(n.inPct * 100, { maximumFractionDigits: 0 }) + ' %', n.inPct > 0.9 ? 'down' : '', 'Prosentil: 100 % = største uke noensinne'),
        kpi('Bitcoin på børser', L[2] ? nf(L[2] / 1e6, { maximumFractionDigits: 2 }) + ' mill. BTC' : '–', '', n.ex1y != null ? `${pc(n.ex1y)} siste år` : ''));
      c4.append(lineChart({ from, marks, fmt: v => nf(v, { maximumFractionDigits: 0 }) + ' mill. $', h: 220, zero: true, series: [{ name: 'Netto til børser per uke (mill. $)', bars: true, pos: dn, neg: up, color: dn, data: fl.map(f => [f[0], f[1]]) }] }));
      c4.append(lineChart({ from, marks, fmt: v => nf(v / 1e6, { maximumFractionDigits: 2 }) + ' mill.', h: 180, series: [{ name: 'Bitcoin på børser (BTC)', color: css('--blue'), data: fl.map(f => [f[0], f[2]]) }] })); }
    else c4.append(el('p', 'muted', 'Børsdata er ikke tilgjengelig akkurat nå.'));
    // 5) sosial interesse
    const c5 = card('Sosial interesse', 'Hvor mange som leser om Bitcoin på Wikipedia per uke – et enkelt mål på hvor mye folk bryr seg. Toppene i interesse har falt sammen med kurstoppene; ved bunnene har interessen vært lav og «ingen bryr seg».');
    if ((m.wiki || []).length) { c5.append(el('div', 'kpis')); c5.lastChild.append(kpi('Visninger per uke nå (snitt 4 uker)', nf(n.wiki4w), '', `${nf(n.wiki4w / n.wikiMax * 100, { maximumFractionDigits: 0 })} % av toppen (${nf(n.wikiMax)} i én uke)`));
      c5.append(lineChart({ log: true, from, marks, fmt: v => nf(v), h: 220, series: [{ name: 'Visninger av «Bitcoin» per uke', color: css('--fg'), data: m.wiki }] })); }
    else c5.append(el('p', 'muted', 'Ikke tilgjengelig akkurat nå.'));
    // 6) relativ styrke
    const c6 = card('Bitcoin målt mot aksjer, gull og olje', 'Hvor mange «aksjer», unser gull eller fat olje én bitcoin kan kjøpe. Stiger linja, gjør Bitcoin det bedre enn det den måles mot.');
    const R = m.rel || {}; const k6 = el('div', 'kpis'); for (const k of ['spx', 'gold', 'oil']) if (R[k]) k6.append(kpi(`Mot ${R[k].name}`, pc(R[k].ytd), R[k].ytd < 0 ? 'down' : 'up', `Hittil i år · siste 12 mnd ${pc(R[k].y1)}`)); c6.append(k6);
    const norm = arr => { const a = arr.filter(p => p[0] >= from && p[1]); if (!a.length) return []; const b = a[0][1]; return a.map(p => [p[0], p[1] / b]); };
    c6.append(lineChart({ log: true, fmt: v => nf(v, { maximumFractionDigits: v < 10 ? 2 : 0 }) + '×', h: 240, series: [['spx', css('--blue')], ['gold', css('--orange')], ['oil', css('--fg')]].filter(([k]) => R[k]).map(([k, c]) => ({ name: `Bitcoin målt i ${R[k].name}`, color: c, data: norm(R[k].s) })) }));
    c6.append(el('p', 'muted small', 'Grafen starter på 1× ved begynnelsen av valgt periode.'));
    // 7) syklustabell, 50-ukers forlengelse og røde uker
    const c7 = card('Syklusene', 'Topp = rekord før et fall på over 50 %. Bunn = laveste ukelukk før neste rekord.');
    const t = el('table', 't compact'), hr = el('tr'); ['Topp', 'Kurs', 'Bunn', 'Kurs', 'Fall', 'Uker'].forEach((x, i) => hr.append(el('th', i === 0 || i === 2 ? 'l' : '', x))); t.append(hr);
    for (const c of m.cycles || []) { const r = el('tr'); r.append(el('td', 'l', dmy(dOf(c.top))), el('td', null, usd(c.topP)), el('td', 'l', c.done ? dmy(dOf(c.bot)) : `${dmy(dOf(c.bot))} så langt`), el('td', null, usd(c.botP)), el('td', 'down', pc(c.fall)), el('td', null, c.weeks)); t.append(r); }
    const tw = el('div', 'tw'); tw.append(t); c7.append(tw);
    if ((m.ext || []).length) { c7.append(el('h3', null, 'Tilbake over 50-ukerslinja – holdt det?'), el('p', 'muted small', 'Etter at kursen tok tilbake 50-ukerslinja: hvor langt over kom den det neste halvåret, og falt den tilbake under? Uten en tydelig forlengelse (20–40 %) har bruddene ofte feilet.'));
      const t2 = el('table', 't compact'), h2 = el('tr'); ['Dato', 'Lengst over', 'Tilbake under', '1 år etter'].forEach((x, i) => h2.append(el('th', i ? '' : 'l', x))); t2.append(h2);
      for (const e of [...m.ext].reverse()) { const r = el('tr'); r.append(el('td', 'l', dmy(dOf(e.d))), el('td', null, pc(e.maxExt)), el('td', e.backWeeks != null ? 'down' : 'up', e.backWeeks != null ? `etter ${e.backWeeks} uker` : e.open ? 'ikke ennå' : 'nei'), el('td', e.r52 == null ? 'muted' : e.r52 > 0 ? 'up' : 'down', e.r52 == null ? '…' : pc(e.r52))); t2.append(r); }
      const tw2 = el('div', 'tw'); tw2.append(t2); c7.append(tw2); }
    if ((m.streaks || []).length) { c7.append(el('h3', null, 'Lange rekker med røde uker')); const ul = el('ul', 'plain'); [...m.streaks].reverse().slice(0, 8).forEach(s2 => ul.append(el('li', null, `${s2.n} uker på rad fram til ${dmy(dOf(s2.end))} (${pc(s2.fall)})`))); c7.append(ul); }
    const meth = el('details', 'more'); meth.append(el('summary', null, 'Kilder og metode')); const mi = el('div', 'in');
    mi.append(el('p', null, `Kurs: ${m.src.price}. On-chain: ${m.src.onchain || 'ikke tilgjengelig'}. Sosial interesse: ${m.src.wiki || 'ikke tilgjengelig'}.`),
      el('p', null, 'Realisert pris = markedsverdi delt på MVRV, delt på antall bitcoins. MVRV-Z = (markedsverdi − realisert verdi) / standardavviket til markedsverdien fram til den dagen. Risikomålet er vårt eget og ikke det samme som andre analytikeres; det bruker bare tall som var kjent hver uke.'),
      el('p', 'muted small', `Bygget ${new Date(m.built).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Historikk viser hva som skjedde – ikke hva som vil skje. Ikke kjøps- eller salgsråd.`));
    meth.append(mi);
    root.replaceChildren(top, c2, c3, c4, c5, c6, c7, meth);
  }
  window.CYCLE = { render, _lineChart: lineChart };
})();
