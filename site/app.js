(() => {
  // ------------------------------------------------------------------ felles
  const NAMES = { BTC: 'Bitcoin', XRP: 'XRP', ADA: 'Cardano', POL: 'Polygon', SAND: 'The Sandbox' };
  const ORDER = ['BTC', 'XRP', 'ADA', 'POL', 'SAND'];
  // horisonter i Historie-fanen
  const HZ = [7, 30, 90, 180, 365];
  const HZL = { 7: '1 uke', 30: '30 dager', 90: '3 måneder', 180: '6 måneder', 365: '12 måneder' };
  const HZS = { 7: '1 u', 30: '30 d', 90: '3 mnd', 180: '6 mnd', 365: '12 mnd' };
  const symList = () => { const a = ORDER.filter(s => state.coins[s]); return a.length > 1 ? a.slice(0, -1).join(', ') + ' og ' + a[a.length - 1] : a.join(''); };
  const TABS = ['oversikt', 'assistent', 'plan', 'daytrading', 'teknisk', 'historikk', 'signaler', 'avansert'];
  const STATUS_CLS = { buy: 'st-buy', wait: 'st-wait', sell: 'st-sell', none: 'st-none' };
  const DAY = 864e5;
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const price = v => v == null || !isFinite(v) ? '–' : v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) : v >= 1 ? nf(v, { maximumFractionDigits: 3 }) : nf(v, { maximumSignificantDigits: 4 });
  const pct = (v, d = 1) => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  const share = p => p == null || !isFinite(p) ? '–' : Math.round(p * 100) + ' %';
  const shareCi = (p, ci) => p == null ? '–' : `${Math.round(p * 100)} %` + (ci && ci[0] != null ? ` (${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)})` : '');
  const sgnCls = v => v > 0 ? 'ai-pos' : v < 0 ? 'ai-neg' : 'ai-neu';
  const dfmt = t => new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dshort = t => new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dateOf = s => new Date(s + 'T00:00:00Z').getTime();
  const pill = (st) => el('span', 'ai-pill ' + STATUS_CLS[st.code], st.label);
  const tokenVar = n => getComputedStyle(document.getElementById('app')).getPropertyValue(n).trim();
  const fail = box => { if (box) box.replaceChildren(el('div', 'ai-fail', 'Kunne ikke laste')); };
  const whyBtn = (key, sym, label = 'Hvorfor?') => { const b = el('button', 'ai-why', label); b.type = 'button'; b.addEventListener('click', e => { e.stopPropagation(); openWhy(key, sym); }); return b; };
  const tipOf = box => { let t = box.querySelector('.ai-tip'); if (!t) { t = el('div', 'ai-tip'); t.hidden = true; box.append(t); } return t; };
  const place = (box, t, x, y) => { t.hidden = false; const bw = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight; let L = x + 14; if (L + tw > bw) L = x - tw - 14; t.style.left = Math.max(0, Math.min(bw - tw, L)) + 'px'; t.style.top = Math.max(0, Math.min(box.clientHeight - th, y - th / 2)) + 'px'; };
  const axisStyle = (g) => { g.attr('font-size', null).attr('font-family', null); g.selectAll('text').attr('fill', 'var(--color-fg-muted)').attr('font-size', 'var(--cds-font-size-caption)'); };
  const measure = (svg, texts) => { const g = svg.append('g').attr('font-size', 'var(--cds-font-size-caption)'); let w = 0; for (const t of texts) { const n = g.append('text').text(t).node(); w = Math.max(w, n.getComputedTextLength()); } g.remove(); return w; };

  // ------------------------------------------------------------------ data
  const NUMERIC = ['price', 'score', 'asOf', 'atrPct', 'atrAbs', 'histYears'];
  function parseRow(r) { const o = {}; for (const k in r) { let v = r[k]; if (typeof v === 'string') { const s = v.trim(); if ((s[0] === '{' || s[0] === '[') && s.length > 1) { try { v = JSON.parse(s); } catch (e) { /* tekst */ } } } o[k] = v; }
    NUMERIC.forEach(k => { if (o[k] != null) o[k] = Number(o[k]); }); return o; }
  const state = { coins: {}, list: [], src: null, chart: { range: (typeof window !== 'undefined' && window.innerWidth < 600) ? '3M' : '6M', ema20: false, ema50: false, ema200: true, levels: true, zone: true, signals: true, events: false, volume: false, osc: 'wt' }, caseIdx: null, caseSym: null, full: {}, fullSrc: null, h4: {}, h4Src: null, why: null };
  function load() {
    const A = dash.data('analysis');
    if (A.status !== 'ok') return A.status;
    if (state.src !== A.data) { state.src = A.data; const rows = (A.data || []).map(parseRow).filter(r => r.sym && NAMES[r.sym]);
      state.coins = {}; rows.forEach(r => { state.coins[r.sym] = r; }); state.list = ORDER.filter(s => state.coins[s]); }
    const H = dash.data('candles_4h');
    if (H.status === 'ok' && state.h4Src !== H.data) { state.h4Src = H.data; const by = {}; for (const r of H.data || []) { const t = +r.t; if (!by[r.sym] || t > by[r.sym].t) by[r.sym] = { t, c: +r.c, h: [] }; }
      for (const r of H.data || []) { const b = by[r.sym]; if (b && b.t - +r.t === 6 * 4 * 36e5) b.prev = +r.c; } state.h4 = by; }
    return 'ok';
  }
  function fullHistory(sym) {
    const F = dash.data('candles_1d'); if (F.status !== 'ok') return null;
    if (state.fullSrc !== F.data) { state.fullSrc = F.data; state.full = {}; }
    if (!state.full[sym]) { const a = (F.data || []).filter(r => r.sym === sym).map(r => ({ t: +r.t, o: +r.o, h: +r.h, l: +r.l, c: +r.c, v: +r.qv })).sort((x, y) => x.t - y.t); state.full[sym] = a; }
    return state.full[sym];
  }
  const cur = () => { const p = dash.params(); const s = p.coin && state.coins[p.coin] ? p.coin : state.list[0]; return state.coins[s]; };
  const tabNow = () => { const p = dash.params().tab; return TABS.includes(p) ? p : 'oversikt'; };
  // live-pris (hentes direkte fra Binance i nettleseren av dash-shim.js); faller tilbake til siste 4t-candle
  const livePrice = c => { const L = window.__live && window.__live[c.sym]; if (L && L.p) return { p: L.p, chg: L.chg, t: L.t };
    const h = state.h4[c.sym]; if (h && h.c) return { p: h.c, chg: h.prev ? (h.c / h.prev - 1) * 100 : (c.h4 && c.h4.chg24), t: h.t + 4 * 36e5 }; return c.h4 ? { p: c.h4.price, chg: c.h4.chg24, t: c.h4.t } : { p: c.price, chg: c.chg && c.chg.d1, t: c.asOf + DAY }; };

  // ------------------------------------------------------------------ navigasjon
  const go = (tab, coin) => { const p = { tab }; if (coin) p.coin = coin; dash.setParams(p); dash.setLink(tab); const top = document.getElementById('faner'); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView(); };
  document.querySelectorAll('#faner [data-tab]').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
  { const h = location.hash.slice(1); if (TABS.includes(h)) dash.setParams({ tab: h }); }
  function drawNav() {
    const tab = tabNow();
    document.querySelectorAll('#faner [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
    TABS.forEach(t => { document.getElementById(t).hidden = t !== tab; });
    const bar = document.getElementById('coinvelger'); bar.hidden = tab === 'oversikt';
    const c = cur(); const seg = document.getElementById('coin-seg');
    seg.replaceChildren(...state.list.map(s => { const b = el('button', null, s); b.type = 'button'; b.setAttribute('aria-pressed', c && c.sym === s ? 'true' : 'false'); b.title = NAMES[s]; b.addEventListener('click', () => { state.caseIdx = null; dash.setParams({ coin: s }); }); return b; }));
    if (c) { const lp = livePrice(c); const sub = document.getElementById('coin-sub'); sub.replaceChildren(el('b', null, NAMES[c.sym] + ' ' + price(lp.p) + ' '), el('span', sgnCls(lp.chg), pct(lp.chg) + ' 24 t'), el('span', null, ' · '), pill(c.status)); }
  }

  // ------------------------------------------------------------------ oversikt
  function sparkline(box, c) {
    box.replaceChildren(); const ch = c.chart; if (!ch || !ch.c) return;
    const n = Math.min(90, ch.c.length), cs = ch.c.slice(-n), W = Math.max(160, box.clientWidth), H = 56;
    const k = c.keys || {}; const lv = [k.mustHold && k.mustHold.p, k.nextUp && k.nextUp.p].filter(v => v != null);
    const lo = Math.min(...cs, ...lv.filter(v => v > Math.min(...cs) * 0.85)), hi = Math.max(...cs, ...lv.filter(v => v < Math.max(...cs) * 1.15));
    const x = d3.scaleLinear([0, n - 1], [2, W - 2]), y = d3.scaleLinear([lo, hi], [H - 3, 3]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `${NAMES[c.sym]} siste 90 dager`);
    if (k.mustHold && k.mustHold.p >= lo && k.mustHold.p <= hi) svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(k.mustHold.p)).attr('y2', y(k.mustHold.p)).attr('stroke', 'var(--color-ok)').attr('stroke-dasharray', '4 3').attr('stroke-width', 1);
    if (k.nextUp && k.nextUp.p >= lo && k.nextUp.p <= hi) svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(k.nextUp.p)).attr('y2', y(k.nextUp.p)).attr('stroke', 'var(--color-bad)').attr('stroke-dasharray', '4 3').attr('stroke-width', 1);
    svg.append('path').datum(cs).attr('d', d3.line().x((d, i) => x(i)).y(d => y(d))).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    svg.append('circle').attr('cx', x(n - 1)).attr('cy', y(cs[n - 1])).attr('r', 3).attr('fill', dash.colors[0]);
  }

  // ------------------------------------------------------------------ signalguide (øverst i oversikten)
  function renderGuide() {
    const c = cur(); if (!c) return;
    document.getElementById('g-name').textContent = NAMES[c.sym];
    document.getElementById('g-coins').replaceChildren(...state.list.map(s => { const b = el('button', null, s); b.type = 'button'; b.title = NAMES[s]; b.setAttribute('aria-pressed', s === c.sym ? 'true' : 'false'); b.addEventListener('click', () => dash.setParams({ coin: s })); return b; }));
    const box = document.getElementById('g-chart'); box.querySelector('svg')?.remove();
    const lastP = document.getElementById('g-last'), ch = c.chart;
    if (!ch || !ch.c || !ch.c.length) { lastP.textContent = ''; return; }
    const n = Math.min(180, ch.c.length), a0 = ch.c.length - n;
    const pts = ch.c.slice(a0).map((v, i) => ({ t: ch.t[a0 + i], c: v, wt: ch.wt1 ? ch.wt1[a0 + i] : null }));
    const t0 = pts[0].t, iOf = new Map(pts.map((d, i) => [d.t, i]));
    const sig = (c.events || []).filter(e => (e.type === 'wtBuy' || e.type === 'wtSell') && dateOf(e.date) >= t0)
      .map(e => ({ e, i: iOf.get(dateOf(e.date)), buy: e.type === 'wtBuy' })).filter(s => s.i != null);
    const k = c.keys || {}, ex = c.ex || {}, must = k.mustHold && k.mustHold.p, res = k.nextUp && k.nextUp.p, stop = ex.stop, zone = ex.entry;
    const W = Math.max(300, box.clientWidth), H = W < 600 ? 260 : 300;
    const cs = pts.map(d => d.c), pmin = Math.min(...cs), pmax = Math.max(...cs);
    const near = v => v != null && v > pmin * 0.8 && v < pmax * 1.2;
    const lo = Math.min(pmin, ...[stop, must, zone && zone[0]].filter(near)) * 0.98;
    const hi = Math.max(pmax, ...[res].filter(near)) * 1.02;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `Pris for ${NAMES[c.sym]} med kjøps- og salgssignaler siste ${n} dager`);
    const m = { l: measure(svg, [price(hi), price(lo)]) + 12, r: 10, t: 14, b: 24 };
    const x = d3.scaleUtc([t0, pts[n - 1].t], [m.l, W - m.r]), y = d3.scaleLinear([lo, hi], [H - m.b, m.t]);
    svg.append('g').selectAll('line').data(y.ticks(5)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    const ya = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(price).tickSize(0)); axisStyle(ya); ya.select('.domain').remove();
    const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((W - m.l - m.r) / 90))).tickFormat(dshort).tickSizeOuter(0)); axisStyle(xa);
    xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); xa.selectAll('line').attr('stroke', 'var(--cds-chart-axis)');
    if (zone && zone[0] >= lo && zone[1] <= hi) svg.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y(zone[1])).attr('height', Math.max(1, y(zone[0]) - y(zone[1]))).attr('fill', 'var(--color-ok)').attr('fill-opacity', 0.12);
    const labels = [];
    const hl = (v, col, da, label) => { if (v == null || v < lo || v > hi) return;
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', col).attr('stroke-width', 1.5).attr('stroke-dasharray', da);
      labels.push({ y: y(v), col, text: `${label} ${price(v)}` }); };
    hl(res, 'var(--color-bad)', '6 4', 'Neste motstand');
    hl(must, 'var(--color-ok)', '6 4', 'Må holde');
    hl(stop, 'var(--color-bad)', '1 3', 'Stopp');
    svg.append('path').datum(pts).attr('d', d3.line().x(d => x(d.t)).y(d => y(d.c))).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    labels.sort((a, b) => a.y - b.y); let prev = -1e9; labels.forEach(L => { const yy = Math.max(L.y - 4, prev + 14); prev = yy;
      svg.append('text').attr('x', m.l + 4).attr('y', yy).attr('font-size', 'var(--cds-font-size-caption)').attr('fill', L.col).attr('paint-order', 'stroke').attr('stroke', 'var(--color-panel)').attr('stroke-width', 3).text(L.text); });
    const tri = d3.symbol().type(d3.symbolTriangle).size(W < 600 ? 70 : 90);
    svg.append('g').selectAll('path').data(sig).join('path').attr('d', tri)
      .attr('transform', s => `translate(${x(pts[s.i].t)},${y(pts[s.i].c) + (s.buy ? 12 : -12)}) rotate(${s.buy ? 0 : 180})`)
      .attr('fill', s => s.buy ? 'var(--color-ok)' : 'var(--color-bad)').attr('stroke', 'var(--color-panel)');
    const lp = pts[n - 1];
    svg.append('circle').attr('cx', x(lp.t)).attr('cy', y(lp.c)).attr('r', 4).attr('fill', dash.colors[0]);
    const t = tipOf(box), dot = svg.append('circle').attr('r', 4).attr('fill', dash.colors[0]).attr('display', 'none'), bis = d3.bisector(d => d.t).center;
    const after = (i, h) => i + h < n ? pct((pts[i + h].c / pts[i].c - 1) * 100) : 'ikke kjent ennå';
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', ev => { const [px] = d3.pointer(ev); const i = bis(pts, x.invert(px)); const d = pts[i]; if (!d) return;
        const s = sig.find(q => Math.abs(q.i - i) <= 1);
        dot.attr('display', null).attr('cx', x(d.t)).attr('cy', y(d.c));
        const lines = [el('div', 'd', dfmt(d.t)), el('div', null, 'Pris ' + price(d.c))];
        if (d.wt != null) lines.push(el('div', null, 'WaveTrend ' + nf(d.wt, { maximumFractionDigits: 0 })));
        if (s) lines.push(el('div', s.buy ? 'ai-pos' : 'ai-neg', `${s.buy ? '▲ Kjøpssignal' : '▼ Salgssignal'} ${dshort(pts[s.i].t)}`), el('div', null, `Pris etter 7 d: ${after(s.i, 7)} · 30 d: ${after(s.i, 30)}`));
        t.replaceChildren(...lines); const kk = box.clientWidth / W; place(box, t, x(d.t) * kk, y(d.c) * kk); })
      .on('pointerleave', () => { t.hidden = true; dot.attr('display', 'none'); });
    const ls = sig[sig.length - 1], nb = sig.filter(q => q.buy).length, ns = sig.length - nb;
    lastP.textContent = ls ? `Siste signal for ${NAMES[c.sym]}: ${ls.buy ? 'kjøp' : 'salg'} ${dfmt(pts[ls.i].t)} ved ${price(pts[ls.i].c)} (pris siden: ${pct((lp.c / pts[ls.i].c - 1) * 100)}). ${nb} kjøps- og ${ns} salgssignaler siste ${n} dager. Hold fingeren eller musen over grafen for å se hva som skjedde etter hvert signal.`
      : `Ingen sterke WaveTrend-signaler for ${NAMES[c.sym]} siste ${n} dager.`;
    const es = c.eventStats || {}, b = es.wtBuy, sl = es.wtSell;
    const ln = (st, word, up) => st && st.hit != null ? `${word}: prisen var ${up ? 'høyere' : 'lavere'} 30 dager senere i ${share(st.hit)} av ${st.nUsed} uavhengige tilfeller (vanlige dager: ${share(st.basePos)}).` : '';
    document.getElementById('g-edge').textContent = `Historikk for ${NAMES[c.sym]}: ` + [ln(b, 'Kjøpssignal', true), ln(sl, 'Salgssignal', false)].filter(Boolean).join(' ') + ' Små forskjeller fra vanlige dager betyr at signalet alene ikke gir noen tydelig fordel.';
  }
  function renderOverview() {
    renderGuide();
    const box = document.getElementById('ov-cards');
    box.replaceChildren(...state.list.map(s => {
      const c = state.coins[s], lp = livePrice(c), k = c.keys || {};
      const card = el('div', 'ai-card ai-coincard'); card.setAttribute('role', 'button'); card.tabIndex = 0; card.setAttribute('aria-label', `Åpne teknisk analyse for ${NAMES[s]}`); card.id = 'kort-' + s.toLowerCase();
      card.addEventListener('click', () => go('teknisk', s)); card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('teknisk', s); } });
      const head = el('div', 'ai-row'); const nm = el('div', 'ai-stack'); nm.style.gap = '2px';
      nm.append(el('h2', null, NAMES[s]), el('span', 'ai-muted', s + '/USDT'));
      head.append(nm, pill(c.status));
      const pr = el('div', 'ai-row'); pr.style.alignItems = 'baseline'; pr.append(el('span', 'ai-big', price(lp.p)), el('span', 'ai-num ' + sgnCls(lp.chg), pct(lp.chg) + ' siste 24 t'));
      const sp = el('div', 'ai-spark');
      const kv = el('dl', 'ai-kv');
      const row = (a, b, cls) => { kv.append(el('dt', null, a)); const d = el('dd', cls, b); kv.append(d); return d; };
      row('Langsiktig trend', c.long.label, /bullish/i.test(c.long.label) ? 'ai-pos' : /bearish/i.test(c.long.label) ? 'ai-neg' : 'ai-neu');
      row('Kortsiktig momentum', c.mom.label, c.mom.s > 0.1 ? 'ai-pos' : c.mom.s < -0.1 ? 'ai-neg' : 'ai-neu');
      row('Nærmeste støtte', k.mustHold ? `${price(k.mustHold.p)} (${pct(k.mustHold.d)})` : '–');
      row('Nærmeste motstand', k.nextUp ? `${price(k.nextUp.p)} (${pct(k.nextUp.d)})` : '–');
      const sc = el('div', 'ai-stack'); sc.style.gap = '4px';
      const scl = el('div', 'ai-row'); scl.append(el('span', 'ai-muted', 'Teknisk oppsettscore'), el('b', 'ai-num', c.score + ' / 100'));
      const bar = el('div', 'ai-scorebar'); const mk = el('i'); mk.style.left = c.score + '%'; bar.append(mk); sc.append(scl, bar);
      const why = el('p', 'ai-cap', c.text.loc + ' ' + (c.status.code === 'buy' ? 'Kriteriene for et kjøpsoppsett er oppfylt.' : c.status.code === 'sell' ? 'Flere signaler peker ned.' : c.status.code === 'wait' ? 'Noen, men ikke alle kriterier er oppfylt – vent på bekreftelse.' : 'Signalene er blandet – ingen tydelig mulighet nå.'));
      const watch = el('p', 'ai-muted', `Følg med: ${k.nextUp ? 'dagslukk over ' + price(k.nextUp.p) : ''}${k.nextUp && k.mustHold ? ' eller ' : ''}${k.mustHold ? 'under ' + price(k.mustHold.p) : ''}.`);
      card.append(head, pr, sp, kv, sc, why, watch, el('span', 'ai-muted', 'Se full analyse →'));
      requestAnimationFrame(() => sparkline(sp, c));
      return card; }));
    const lg = document.getElementById('ov-legend-body');
    const item = (code, label, txt) => { const d = el('div', 'ai-stack'); d.style.gap = '4px'; d.append(el('span', 'ai-pill ' + STATUS_CLS[code], label), el('p', 'ai-cap', txt)); return d; };
    lg.replaceChildren(
      item('buy', 'Mulig kjøpsoppsett', 'Oppsettscore minst 60, pris ved sterk støtte (innen 1 ATR) eller etter bekreftet utbrudd, momentum som snur opp, og pris over ugyldiggjøringsnivået.'),
      item('wait', 'Avvent bekreftelse', 'Noen kriterier er oppfylt, men ikke alle – for eksempel riktig sone uten momentum, eller et ubekreftet brudd som trenger to dagslukk.'),
      item('sell', 'Mulig salgs-/exit-oppsett', 'Oppsettscore 40 eller lavere, pris ved motstand eller etter bekreftet brudd, og momentum som snur ned.'),
      item('none', 'Ingen tydelig mulighet', 'Signalene er blandet eller prisen er midt mellom nivåene. Da er det ofte best å vente.'));
  }

  // ------------------------------------------------------------------ teknisk analyse
  const RANGES = [['3M', 90], ['6M', 180], ['1Å', 365], ['Alt', Infinity]];
  const TOGGLES = [['ema20', 'EMA 20', () => dash.colors[1]], ['ema50', 'EMA 50', () => dash.colors[2]], ['ema200', 'EMA 200 (trend)', () => 'var(--color-warn)'], ['levels', 'Støtte og motstand', () => 'var(--color-fg-muted)'], ['zone', 'Inngangssone og stopp', () => 'var(--color-ok)'], ['signals', 'Kjøps-/salgssignaler', () => 'var(--color-fg-muted)'], ['events', 'Tekniske hendelser', () => 'var(--color-fg-muted)'], ['volume', 'Volum', () => 'var(--color-fg-muted)']];
  function renderNow(c) {
    const box = document.getElementById('ta-now'); const lp = livePrice(c);
    const head = el('div', 'ai-row');
    const left = el('div', 'ai-stack'); left.style.gap = '2px';
    const t = el('div', 'ai-row'); t.style.justifyContent = 'flex-start'; t.append(el('h2', null, `${NAMES[c.sym]} – hva sier analysen akkurat nå?`));
    left.append(t, el('span', 'ai-muted', `Basert på dagslukk ${dfmt(c.asOf)} · pris ${price(lp.p)} (${pct(lp.chg)} 24 t)`));
    const right = el('div', 'ai-chips'); const sp = pill(c.status); right.append(sp, whyBtn('status', c.sym, 'Hvorfor denne statusen?'));
    head.append(left, right);
    const sum = el('p', 'ai-summary', c.text.summary);
    const chips = el('div', 'ai-chips');
    const chip = (lab, val, cls) => { const s = el('span', 'ai-chip'); s.append(el('span', 'ai-muted', lab), el('b', cls, val)); return s; };
    chips.append(chip('Oppsettscore', c.score + '/100', c.score >= 60 ? 'ai-pos' : c.score <= 40 ? 'ai-neg' : null), chip('Langsiktig trend', c.long.label, /bullish/i.test(c.long.label) ? 'ai-pos' : /bearish/i.test(c.long.label) ? 'ai-neg' : null), chip('Momentum', c.mom.label, c.mom.s > 0.1 ? 'ai-pos' : c.mom.s < -0.1 ? 'ai-neg' : null), chip('Datakvalitet', c.quality.label, c.quality.label === 'Lav' ? 'ai-neg' : null));
    if (c.analog && c.analog.ok) chips.append(chip('Lignende tilfeller opp etter 30 d', share(c.analog.stats.h30.pos) + ` (n≈${c.analog.nEff})`));
    box.replaceChildren(head, sum, chips);
  }
  function chartRows(c, range) {
    const ch = c.chart; const n = ch.t.length;
    if (range === Infinity) { const f = fullHistory(c.sym); if (f && f.length) { const ix = new Map(ch.t.map((t, i) => [t, i]));
        return { full: true, rows: f.map(r => { const i = ix.get(r.t); return { ...r, e20: i != null ? ch.e20[i] : null, e50: i != null ? ch.e50[i] : null, e200: i != null ? ch.e200[i] : null, i }; }) }; } range = n; }
    const a = Math.max(0, n - range);
    const rows = []; for (let i = a; i < n; i++) rows.push({ t: ch.t[i], o: ch.o[i], h: ch.h[i], l: ch.l[i], c: ch.c[i], v: ch.v[i], e20: ch.e20[i], e50: ch.e50[i], e200: ch.e200[i], i });
    return { full: false, rows };
  }
  function drawPriceChart(c) {
    const box = document.getElementById('ta-chart'); box.querySelector('svg')?.remove();
    const S = state.chart, rg = RANGES.find(r => r[0] === S.range)[1];
    const { rows, full } = chartRows(c, rg); if (!rows.length) return;
    const W = Math.max(300, box.clientWidth), H = W < 600 ? 360 : 440; box.style.minHeight = H + 'px';
    const k = c.keys || {}, ex = c.ex || {};
    const lo0 = d3.min(rows, d => d.l), hi0 = d3.max(rows, d => d.h);
    const extra = [];
    if (S.levels) [k.mustHold, k.nextUp, k.majUp, k.majDn].forEach(x => x && extra.push(x.p));
    if (S.zone && ex.entry) extra.push(ex.entry[0], ex.entry[1], ex.stop);
    const span = hi0 - lo0; const ys = extra.filter(v => v != null && v > lo0 - span * 0.35 && v < hi0 + span * 0.35);
    let lo = Math.min(lo0, ...ys), hi = Math.max(hi0, ...ys); const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `Candlestick-graf for ${NAMES[c.sym]} med nivåer og signaler`);
    const ticksY = d3.scaleLinear([lo, hi], [0, 1]).ticks(6);
    const m = { l: measure(svg, ticksY.map(price)) + 12, r: 8, t: 10, b: 24 };
    const x = d3.scaleUtc([rows[0].t - DAY / 2, rows[rows.length - 1].t + DAY * 3], [m.l, W - m.r]);
    const volH = S.volume ? (H - m.t - m.b) * 0.18 : 0;
    const y = d3.scaleLinear([lo, hi], [H - m.b - volH, m.t]);
    svg.append('g').selectAll('line').data(ticksY).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    const ya = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(ticksY).tickFormat(price).tickSize(0)); ya.select('.domain').remove(); axisStyle(ya);
    const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((W - m.l - m.r) / 90))).tickFormat(t => full && rows.length > 500 ? new Date(t).getUTCFullYear() : dshort(t)).tickSizeOuter(0));
    xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); xa.selectAll('line').attr('stroke', 'var(--cds-chart-axis)'); axisStyle(xa);
    // inngangssone og stopp
    if (S.zone && ex.entry && ex.stop) {
      svg.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y(ex.entry[1])).attr('height', Math.max(1, y(ex.entry[0]) - y(ex.entry[1]))).attr('fill', 'var(--color-ok)').attr('fill-opacity', 0.1);
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(ex.stop)).attr('y2', y(ex.stop)).attr('stroke', 'var(--color-bad)').attr('stroke-dasharray', '1 3').attr('stroke-width', 1.5);
    }
    // volum
    if (S.volume) { const yv = d3.scaleLinear([0, d3.max(rows, d => d.v) || 1], [H - m.b, H - m.b - volH + 4]); const bw = Math.max(1, (W - m.l - m.r) / rows.length * 0.7);
      svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', d => x(d.t) - bw / 2).attr('width', bw).attr('y', d => yv(d.v)).attr('height', d => H - m.b - yv(d.v)).attr('fill', d => d.c >= d.o ? 'var(--color-ok)' : 'var(--color-bad)').attr('fill-opacity', 0.35); }
    // nivåer
    const labels = [];
    if (S.levels) {
      (c.lv || []).filter(l => !l.role && l.score >= 5 && l.p > lo && l.p < hi).forEach(l => svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(l.p)).attr('y2', y(l.p)).attr('stroke', 'var(--cds-chart-muted)').attr('stroke-opacity', 0.6).attr('stroke-dasharray', '2 4'));
      const key = [[k.majUp, 'Avgjørende motstand', 'var(--color-bad)', 2], [k.nextUp, 'Neste motstand', 'var(--color-bad)', 1.5], [k.mustHold, 'Må holde', 'var(--color-ok)', 1.5], [k.majDn, 'Avgjørende støtte', 'var(--color-ok)', 2], [k.trend && { p: k.trend.p }, 'Trendnivå (200D EMA)', 'var(--color-warn)', 1.5]];
      const seen = new Set();
      key.forEach(([lv, lab, col, sw]) => { if (!lv || lv.p == null || lv.p < lo || lv.p > hi) return; const kk = Math.round(lv.p * 1e6);
        if (seen.has(kk)) { const L = labels.find(z => z.kk === kk); if (L) { L.names.push(lab.toLowerCase()); L.text = `${L.names.join(' / ')} ${price(lv.p)}`; } return; } seen.add(kk);
        svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(lv.p)).attr('y2', y(lv.p)).attr('stroke', col).attr('stroke-width', sw).attr('stroke-dasharray', '6 4');
        labels.push({ kk, y: y(lv.p), names: [lab], text: `${lab} ${price(lv.p)}`, col }); });
    }
    if (S.zone && ex.stop && ex.stop > lo) labels.push({ y: y(ex.stop), text: `Ugyldig under ${price(ex.stop)}`, col: 'var(--color-bad)' });
    // EMA
    const line = key => d3.line().defined(d => d[key] != null).x(d => x(d.t)).y(d => y(d[key]));
    if (S.ema20) svg.append('path').datum(rows).attr('d', line('e20')).attr('fill', 'none').attr('stroke', dash.colors[1]).attr('stroke-width', 1.5);
    if (S.ema50) svg.append('path').datum(rows).attr('d', line('e50')).attr('fill', 'none').attr('stroke', dash.colors[2]).attr('stroke-width', 1.5);
    if (S.ema200) svg.append('path').datum(rows).attr('d', line('e200')).attr('fill', 'none').attr('stroke', 'var(--color-warn)').attr('stroke-width', 2);
    // candles (eller linje for lange perioder)
    const per = (W - m.l - m.r) / rows.length;
    if (per < 1.2) {
      svg.append('path').datum(rows).attr('d', d3.line().x(d => x(d.t)).y(d => y(d.c))).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 1.5).attr('stroke-linejoin', 'round');
    } else {
      const bw = Math.max(1, Math.min(11, per * 0.68));
      const g = svg.append('g');
      g.selectAll('line').data(rows).join('line').attr('x1', d => x(d.t)).attr('x2', d => x(d.t)).attr('y1', d => y(d.h)).attr('y2', d => y(d.l)).attr('stroke', d => d.c >= d.o ? 'var(--color-ok)' : 'var(--color-bad)').attr('stroke-width', 1);
      g.selectAll('rect').data(rows).join('rect').attr('x', d => x(d.t) - bw / 2).attr('width', bw).attr('y', d => y(Math.max(d.o, d.c))).attr('height', d => Math.max(1, Math.abs(y(d.o) - y(d.c)))).attr('fill', d => d.c >= d.o ? 'var(--color-ok)' : 'var(--color-bad)').attr('rx', bw > 4 ? 1 : 0);
    }
    // signaler og hendelser
    const t0 = rows[0].t, tEnd = rows[rows.length - 1].t, byT = new Map(rows.map(r => [r.t, r]));
    const evs = (full ? (c.eventsAll || []) : (c.events || [])).filter(e => dateOf(e.date) >= t0 && dateOf(e.date) <= tEnd);
    if (S.signals) { const tri = d3.symbol().type(d3.symbolTriangle).size(Math.min(90, Math.max(30, per * 14)));
      svg.append('g').selectAll('path').data(evs.filter(e => e.type === 'wtBuy' || e.type === 'wtSell')).join('path').attr('d', tri)
        .attr('transform', e => { const r = byT.get(dateOf(e.date)); const buy = e.type === 'wtBuy'; return `translate(${x(dateOf(e.date))},${buy ? y(r ? r.l : e.price) + 10 : y(r ? r.h : e.price) - 10}) rotate(${buy ? 0 : 180})`; })
        .attr('fill', e => e.type === 'wtBuy' ? 'var(--color-ok)' : 'var(--color-bad)').attr('stroke', 'var(--color-panel)'); }
    if (S.events) { const ET = { golden: 'Golden cross', death: 'Death cross', reclaim: 'Over 200D', lose: 'Under 200D', rsiOS: 'RSI<30', rsiOB: 'RSI>70' };
      evs.filter(e => ET[e.type]).forEach(e => { const r = byT.get(dateOf(e.date)); const up = ['golden', 'reclaim', 'rsiOS'].includes(e.type); const yy = up ? y(r ? r.l : e.price) + 26 : y(r ? r.h : e.price) - 26;
        svg.append('circle').attr('cx', x(dateOf(e.date))).attr('cy', y(r ? r.c : e.price)).attr('r', 3.5).attr('fill', 'var(--color-panel)').attr('stroke', up ? 'var(--color-ok)' : 'var(--color-bad)').attr('stroke-width', 1.5);
        svg.append('text').attr('x', x(dateOf(e.date))).attr('y', Math.max(m.t + 10, Math.min(H - m.b - 4, yy))).attr('text-anchor', 'middle').attr('font-size', 'var(--cds-font-size-caption)').attr('fill', up ? 'var(--color-ok)' : 'var(--color-bad)').attr('paint-order', 'stroke').attr('stroke', 'var(--color-panel)').attr('stroke-width', 3).text(ET[e.type]); }); }
    // etiketter på nivåene (inne i grafen, flyttet fra hverandre)
    labels.sort((a, b) => a.y - b.y); for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
    labels.forEach(L => svg.append('text').attr('x', W - m.r - 4).attr('y', L.y - 4).attr('text-anchor', 'end').attr('font-size', 'var(--cds-font-size-caption)').attr('fill', L.col).attr('paint-order', 'stroke').attr('stroke', 'var(--color-panel)').attr('stroke-width', 4).attr('stroke-linejoin', 'round').text(L.text));
    // siste pris
    const lr = rows[rows.length - 1]; svg.append('circle').attr('cx', x(lr.t)).attr('cy', y(lr.c)).attr('r', 3.5).attr('fill', dash.colors[0]);
    // tooltip
    const tip = tipOf(box); const bis = d3.bisector(d => d.t).center; const vline = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-axis)').attr('display', 'none');
    const evBy = new Map(); evs.forEach(e => { const a = evBy.get(e.date) || []; a.push(e); evBy.set(e.date, a); });
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', ev => { const [px] = d3.pointer(ev); const i = bis(rows, x.invert(px)); const d = rows[i]; if (!d) return; const prev = rows[i - 1];
        vline.attr('display', null).attr('x1', x(d.t)).attr('x2', x(d.t));
        const lines = [el('div', 'd', dfmt(d.t)), el('div', null, `Å ${price(d.o)}  H ${price(d.h)}  L ${price(d.l)}  S ${price(d.c)}`)];
        if (prev) lines.push(el('div', sgnCls(d.c - prev.c), `Endring ${pct((d.c / prev.c - 1) * 100)}`));
        if (S.ema200 && d.e200) lines.push(el('div', null, `EMA 200 ${price(d.e200)}`));
        (evBy.get(new Date(d.t).toISOString().slice(0, 10)) || []).forEach(e => lines.push(el('div', ['wtBuy', 'rsiOS', 'golden', 'reclaim'].includes(e.type) ? 'ai-pos' : 'ai-neg', `${EVL[e.type]}${e.r30 != null ? ` · 30 d etter: ${pct(e.r30)}` : ''}`)));
        tip.replaceChildren(...lines); const kx = box.clientWidth / W; place(box, tip, x(d.t) * kx, y(d.c) * kx); })
      .on('pointerleave', () => { tip.hidden = true; vline.attr('display', 'none'); });
    box.dataset.ml = m.l; box.dataset.mr = m.r; box.dataset.x0 = x.domain()[0].getTime(); box.dataset.x1 = x.domain()[1].getTime();
    document.getElementById('ta-osc-note').textContent = full ? 'Indikatorer vises for de siste 14 månedene.' : '';
  }
  const EVL = { wtBuy: '▲ WaveTrend kjøpssignal', wtSell: '▼ WaveTrend salgssignal', rsiOS: 'RSI under 30', rsiOB: 'RSI over 70', golden: 'Golden cross', death: 'Death cross', reclaim: 'Tilbake over 200D EMA', lose: 'Brudd under 200D EMA' };
  function drawOsc(c) {
    const box = document.getElementById('ta-osc'); box.querySelector('svg')?.remove(); box.querySelector('.ai-tip')?.remove();
    const S = state.chart; if (S.osc === 'off') { box.style.minHeight = '0'; return; } box.style.minHeight = '130px';
    const pbox = document.getElementById('ta-chart'); const ch = c.chart;
    const x0 = +pbox.dataset.x0, x1 = +pbox.dataset.x1; const rows = [];
    for (let i = 0; i < ch.t.length; i++) if (ch.t[i] >= x0) rows.push({ t: ch.t[i], wt1: ch.wt1[i], wt2: ch.wt2[i], rsi: ch.rsi[i], macd: ch.macd[i], sig: ch.sig[i], hist: ch.hist[i] });
    if (!rows.length) return;
    const W = Math.max(300, box.clientWidth), H = 130, m = { l: +pbox.dataset.ml || 40, r: +pbox.dataset.mr || 8, t: 6, b: 6 };
    const x = d3.scaleUtc([new Date(x0), new Date(x1)], [m.l, W - m.r]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img');
    let y, refs = [];
    if (S.osc === 'wt') { const ext = Math.max(80, d3.max(rows, d => Math.abs(d.wt1 || 0)) + 5); y = d3.scaleLinear([-ext, ext], [H - m.b, m.t]); refs = [-53, 0, 53];
      svg.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y(ext)).attr('height', y(53) - y(ext)).attr('fill', 'var(--color-bad)').attr('fill-opacity', 0.07);
      svg.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y(-53)).attr('height', y(-ext) - y(-53)).attr('fill', 'var(--color-ok)').attr('fill-opacity', 0.07);
      svg.attr('aria-label', 'WaveTrend døgn');
    } else if (S.osc === 'rsi') { y = d3.scaleLinear([0, 100], [H - m.b, m.t]); refs = [30, 50, 70];
      svg.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y(100)).attr('height', y(70) - y(100)).attr('fill', 'var(--color-bad)').attr('fill-opacity', 0.07);
      svg.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y(30)).attr('height', y(0) - y(30)).attr('fill', 'var(--color-ok)').attr('fill-opacity', 0.07); svg.attr('aria-label', 'RSI 14');
    } else { const ext = d3.max(rows, d => Math.max(Math.abs(d.macd || 0), Math.abs(d.sig || 0), Math.abs(d.hist || 0))) * 1.1 || 1; y = d3.scaleLinear([-ext, ext], [H - m.b, m.t]); refs = [0]; svg.attr('aria-label', 'MACD 12/26/9'); }
    refs.forEach(v => { svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', v === 0 || v === 50 ? 'var(--cds-chart-axis)' : 'var(--cds-chart-reference)').attr('stroke-dasharray', v === 0 || v === 50 ? null : '3 3');
      svg.append('text').attr('x', m.l - 6).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 'var(--cds-font-size-caption)').attr('fill', 'var(--color-fg-muted)').text(S.osc === 'macd' ? '0' : (v < 0 ? '−' + Math.abs(v) : v)); });
    const ln = k => d3.line().defined(d => d[k] != null).x(d => x(d.t)).y(d => y(d[k]));
    if (S.osc === 'wt') {
      svg.append('path').datum(rows).attr('d', d3.area().defined(d => d.wt1 != null).x(d => x(d.t)).y0(y(0)).y1(d => y(d.wt1))).attr('fill', dash.colors[0]).attr('fill-opacity', 0.12);
      svg.append('path').datum(rows).attr('d', ln('wt1')).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 2);
      svg.append('path').datum(rows).attr('d', ln('wt2')).attr('fill', 'none').attr('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 1.5).attr('stroke-dasharray', '2 2');
      const cr = []; for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; if (a.wt2 == null || b.wt2 == null) continue; if (a.wt1 <= a.wt2 && b.wt1 > b.wt2) cr.push({ d: b, up: 1 }); if (a.wt1 >= a.wt2 && b.wt1 < b.wt2) cr.push({ d: b, up: 0 }); }
      svg.append('g').selectAll('circle').data(cr).join('circle').attr('cx', q => x(q.d.t)).attr('cy', q => y(q.d.wt1)).attr('r', q => (q.up && q.d.wt1 < -53) || (!q.up && q.d.wt1 > 53) ? 5 : 2.5).attr('fill', q => q.up ? 'var(--color-ok)' : 'var(--color-bad)').attr('stroke', 'var(--color-panel)');
    } else if (S.osc === 'rsi') { svg.append('path').datum(rows).attr('d', ln('rsi')).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 2); }
    else { const bw = Math.max(1, (W - m.l - m.r) / rows.length * 0.7);
      svg.append('g').selectAll('rect').data(rows.filter(d => d.hist != null)).join('rect').attr('x', d => x(d.t) - bw / 2).attr('width', bw).attr('y', d => Math.min(y(0), y(d.hist))).attr('height', d => Math.abs(y(d.hist) - y(0))).attr('fill', d => d.hist >= 0 ? 'var(--color-ok)' : 'var(--color-bad)').attr('fill-opacity', 0.5);
      svg.append('path').datum(rows).attr('d', ln('macd')).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 1.5);
      svg.append('path').datum(rows).attr('d', ln('sig')).attr('fill', 'none').attr('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 1.5).attr('stroke-dasharray', '2 2'); }
    const tip = tipOf(box); const bis = d3.bisector(d => d.t).center;
    svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', H).attr('fill', 'transparent')
      .on('pointermove', ev => { const [px] = d3.pointer(ev); const d = rows[bis(rows, x.invert(px))]; if (!d) return;
        const v = S.osc === 'wt' ? `WaveTrend ${nf(d.wt1, { maximumFractionDigits: 0 })} · signal ${nf(d.wt2, { maximumFractionDigits: 0 })}` : S.osc === 'rsi' ? `RSI ${nf(d.rsi, { maximumFractionDigits: 1 })}` : `MACD ${nf(d.macd, { maximumSignificantDigits: 3 })} · signal ${nf(d.sig, { maximumSignificantDigits: 3 })}`;
        tip.replaceChildren(el('div', 'd', dfmt(d.t)), el('div', null, v)); const kx = box.clientWidth / W; place(box, tip, x(d.t) * kx, 40); })
      .on('pointerleave', () => { tip.hidden = true; });
  }
  function drawChartControls(c) {
    const rg = document.getElementById('ta-range');
    rg.replaceChildren(...RANGES.map(([lab]) => { const b = el('button', null, lab); b.type = 'button'; b.setAttribute('aria-pressed', state.chart.range === lab ? 'true' : 'false'); b.addEventListener('click', () => { state.chart.range = lab; renderTech(); }); return b; }));
    const tg = document.getElementById('ta-toggles');
    tg.replaceChildren(...TOGGLES.map(([k, lab, col]) => { const b = el('button', 'ai-toggle'); b.type = 'button'; b.setAttribute('aria-pressed', state.chart[k] ? 'true' : 'false'); const i = el('i'); i.style.color = col(); b.append(i, document.createTextNode(lab)); b.addEventListener('click', () => { state.chart[k] = !state.chart[k]; renderTech(); }); return b; }));
    const os = document.getElementById('ta-osc-seg');
    os.replaceChildren(...[['wt', 'WaveTrend'], ['rsi', 'RSI'], ['macd', 'MACD'], ['off', 'Skjul']].map(([k, lab]) => { const b = el('button', null, lab); b.type = 'button'; b.setAttribute('aria-pressed', state.chart.osc === k ? 'true' : 'false'); b.addEventListener('click', () => { state.chart.osc = k; renderTech(); }); return b; }));
    document.getElementById('ta-charttitle').textContent = `${NAMES[c.sym]} – dagscandles`;
    const lg = document.getElementById('ta-legend'); const it = (html, txt) => { const s = el('span'); s.append(html, document.createTextNode(txt)); return s; };
    const ln = col => { const i = el('i'); i.style.color = col; i.style.borderTopStyle = 'dashed'; return i; }; const sw = col => { const i = el('i', 'sw'); i.style.background = col; i.style.opacity = '.35'; return i; };
    const tri = (up) => { const s = el('b', up ? 'ai-pos' : 'ai-neg', up ? '▲' : '▼'); return s; };
    lg.replaceChildren(it(ln('var(--color-ok)'), 'Støtte (må holde / avgjørende)'), it(ln('var(--color-bad)'), 'Motstand (neste / avgjørende)'), it(ln('var(--color-warn)'), 'Trendnivå'), it(sw('var(--color-ok)'), 'Mulig inngangssone'), it(ln('var(--color-bad)'), 'Ugyldiggjøring (stopp)'), it(tri(1), 'WaveTrend kjøpssignal'), it(tri(0), 'WaveTrend salgssignal'));
  }
  function renderScenarios(c) {
    const box = document.getElementById('ta-scen'); const st = c.status, k = c.keys || {}, ex = c.ex || {};
    const checks = arr => { const ul = el('ul', 'ai-checks'); arr.forEach(x => { const li = el('li'); li.append(el('span', x.ok ? 'y' : 'n', x.ok ? '✓' : '○'), el('span', null, x.t)); ul.append(li); }); return ul; };
    const list = arr => { const ul = el('ul', 'ai-list'); arr.forEach(t => ul.append(el('li', null, t))); return ul; };
    const pos = c.comps.filter(x => x.s >= 0.15).map(x => x.text), neg = c.comps.filter(x => x.s <= -0.15).map(x => x.text);
    const card = (code, title, parts) => { const d = el('div', 'ai-scen' + (st.code === code || (code === 'wait' && st.code === 'none') ? ' on' : '')); const h = el('div', 'ai-row'); h.append(el('h3', null, title)); if (st.code === code || (code === 'wait' && st.code === 'none')) h.append(el('span', 'ai-pill ' + STATUS_CLS[st.code], 'Nå')); d.append(h); parts.forEach(([lab, node]) => { d.append(el('h4', null, lab), node); }); return d; };
    const buy = card('buy', 'Mulig kjøpsoppsett', [
      ['Hva må skje før et kjøp kan vurderes?', checks(st.buyChecks)],
      ['Indikatorer som støtter', pos.length ? list(pos) : el('p', 'ai-muted', 'Ingen av faktorene peker tydelig opp nå.')],
      ['Bekreftende nivå', el('p', 'ai-cap', st.recentUp ? `Pris holder over ${price(st.recentUp.level)} (utbruddsnivået) de neste dagslukkene.` : k.nextUp ? `Dagslukk over ${price(k.nextUp.p)} (${pct(k.nextUp.d)}), helst med volum over snittet.` : 'Dagslukk over nærmeste motstand.')],
      ['Gjør oppsettet ugyldig', el('p', 'ai-cap', ex.stop ? `Dagslukk under ${price(ex.stop)} (${pct(ex.stopD)}) – under må-holde-støtten${k.mustHold ? ' ' + price(k.mustHold.p) : ''}.` : 'Dagslukk under nærmeste støtte.')]]);
    const sell = card('sell', 'Mulig salgs-/exit-oppsett', [
      ['Tegn til svekkelse', checks(st.sellChecks)],
      ['Viktige nivåer', list([k.mustHold && `Må holde: ${price(k.mustHold.p)} (${pct(k.mustHold.d)})`, k.majDn && `Avgjørende støtte: ${price(k.majDn.p)} (${pct(k.majDn.d)})`, k.nextUp && `Motstand / salgssone: ${price(k.nextUp.p)} (${pct(k.nextUp.d)})`].filter(Boolean))],
      ['Indikatorer som støtter et negativt scenario', neg.length ? list(neg) : el('p', 'ai-muted', 'Ingen av faktorene peker tydelig ned nå.')]]);
    const unclear = [];
    if (pos.length && neg.length) unclear.push(`Faktorene spriker: ${c.comps.filter(x => x.s >= 0.15).map(x => x.label.toLowerCase()).join(', ')} peker opp, mens ${c.comps.filter(x => x.s <= -0.15).map(x => x.label.toLowerCase()).join(', ')} peker ned.`);
    if (c.score > 40 && c.score < 60) unclear.push(`Oppsettscoren (${c.score}) er i den nøytrale sonen mellom 40 og 60.`);
    if (!c.mom.trigUp && !c.mom.trigDn) unclear.push('Ingen tydelig vending i momentum (WaveTrend, RSI eller MACD).');
    if (k.here && k.here.boType === 'ubekreftet') unclear.push(`Ubekreftet brudd ved ${price(k.here.p)} – trenger to dagslukk på samme side.`);
    if (!st.nearSup && !st.nearRes && !st.recentUp && !st.recentDn) unclear.push('Prisen er midt mellom støtte og motstand, med dårlig forhold mellom risiko og mulig gevinst.');
    if (!unclear.length) unclear.push('Signalene peker samme vei, men ikke alle kriterier er oppfylt ennå.');
    const wait = card('wait', 'Avvent', [
      ['Hvorfor er signalene uklare?', list(unclear)],
      ['Hva må skje før bildet blir tydeligere?', list([k.nextUp && `Opp: dagslukk over ${price(k.nextUp.p)} og momentum som snur opp.`, k.mustHold && `Ned: dagslukk under ${price(k.mustHold.p)} bekrefter svakhet.`, 'Et WaveTrend-kryss fra ekstremsone (under −53 eller over +53) gir et tydeligere signal.'].filter(Boolean))]]);
    box.replaceChildren(buy, wait, sell);
  }
  function renderExplain(c) {
    const box = document.getElementById('ta-explain'); const T = c.text;
    const sec = (title, node) => { const s = el('section'); s.append(el('h3', null, title), node); return s; };
    const ul = (arr, f) => { const u = el('ul', 'ai-list'); arr.forEach(x => u.append(f(x))); return u; };
    const why = ul(T.why, x => { const li = el('li'); li.append(el('span', x.s > 0 ? 'ai-pos' : x.s < 0 ? 'ai-neg' : 'ai-neu', x.s > 0 ? '▲ ' : x.s < 0 ? '▼ ' : '• '), document.createTextNode(x.t)); return li; });
    const watch = ul(T.watch, x => { const li = el('li'); li.append(el('b', null, x.t), document.createTextNode(' – ' + x.d)); return li; });
    const risks = ul(T.risks, x => el('li', null, x));
    const wrap = el('div', 'ai-explain');
    wrap.append(sec('Hva skjer?', el('p', 'ai-cap', `${T.loc} ${T.trend}`)), sec('Hvorfor er dette interessant?', why), sec('Hva skjedde historisk?', el('p', 'ai-cap', T.hist)), sec('Hva bør jeg følge med på?', watch), sec('Hva kan gå galt?', risks));
    const more = el('details', 'ai-more'); more.append(el('summary', null, 'Forklar mer – indikatorer og begreper'));
    const tw = el('div', 'ai-tablewrap'); const tb = el('table', 'ai-table'); const th = el('tr'); ['Indikator', 'Verdi nå', 'Hva det betyr', ''].forEach((h, i) => th.append(el('th', i === 1 ? null : 'l', h))); const thead = el('thead'); thead.append(th); tb.append(thead);
    const body = el('tbody'); INDROWS(c).forEach(r => { const tr = el('tr'); tr.append(el('td', 'l', r[0]), el('td', null, r[1]), el('td', 'wrap', r[2])); const td = el('td', 'l'); td.append(whyBtn(r[3], c.sym)); tr.append(td); body.append(tr); }); tb.append(body); tw.append(tb);
    more.append(tw);
    box.replaceChildren(el('h2', null, 'Forklaring'), wrap, more);
  }
  const INDROWS = c => { const i = c.ind, k = c.keys || {};
    return [
      ['WaveTrend (døgn / 4t)', `${nf(i.wt1d, { maximumFractionDigits: 0 })} / ${nf(i.wt4h, { maximumFractionDigits: 0 })}`, i.wt1d < -53 ? 'Oversolgt sone – salgspresset kan være i ferd med å avta.' : i.wt1d > 53 ? 'Overkjøpt sone – kjøpspresset kan avta.' : 'Normal sone, ingen ekstrem.', 'wt'],
      ['RSI (14, døgn)', nf(i.rsi, { maximumFractionDigits: 1 }), i.rsi < 30 ? 'Under 30: oversolgt.' : i.rsi > 70 ? 'Over 70: overkjøpt.' : i.rsi >= 50 ? 'Over 50: kjøperne har overtaket kortsiktig.' : 'Under 50: selgerne har overtaket kortsiktig.', 'rsi'],
      ['MACD-histogram', c.mom.parts[2].t.replace('MACD-histogram ', ''), 'Viser om kortsiktig trend akselererer eller bremser.', 'macd'],
      ['Avstand til 200D EMA', pct(i.d200), i.d200 > 0 ? 'Over trendnivået – langsiktig positiv.' : 'Under trendnivået – langsiktig svak.', 'ema'],
      ['Avstand til 50D EMA', pct(i.d50), i.d50 > 0 ? 'Over mellomlang trend.' : 'Under mellomlang trend.', 'ema'],
      ['Nærmeste støtte / motstand', `${k.mustHold ? price(k.mustHold.p) : '–'} / ${k.nextUp ? price(k.nextUp.p) : '–'}`, `${c.status.distSup != null ? nf(c.status.distSup, { maximumFractionDigits: 1 }) + ' ATR ned' : ''}${c.status.distRes != null ? ', ' + nf(c.status.distRes, { maximumFractionDigits: 1 }) + ' ATR opp' : ''}.`, 'levels'],
      ['Relativt volum (5 d / 50 d)', i.relVol != null ? pct((Math.exp(i.relVol) - 1) * 100, 0) : '–', i.relVol > 0.1 ? 'Høyere aktivitet enn normalt.' : i.relVol < -0.1 ? 'Lavere aktivitet enn normalt.' : 'Normal aktivitet.', 'volume'],
      ['Prisstruktur', c.structure.label, c.structure.text, 'structure'],
      ['Volatilitet (ATR 14)', `${nf(c.atrPct, { maximumFractionDigits: 1 })} % per dag`, i.volReg > 0.2 ? 'Høyere enn vanlig siste år.' : i.volReg < -0.2 ? 'Lavere enn vanlig siste år.' : 'Omtrent som vanlig siste år.', 'volatility'],
      ['Markedsregime', c.comps.find(x => x.key === 'reg').text, 'Bitcoin og bredden i markedet påvirker altcoins sterkt.', 'regime']]; };
  function renderScore(c) {
    const box = document.getElementById('ta-score');
    const head = el('div', 'ai-row'); head.append(el('h2', null, 'Teknisk oppsettscore'), whyBtn('score', c.sym));
    const big = el('div', 'ai-row'); big.style.alignItems = 'baseline'; big.append(el('span', 'ai-big', c.score + ' / 100'), el('span', 'ai-muted', c.score >= 60 ? 'Mange faktorer peker opp' : c.score <= 40 ? 'Mange faktorer peker ned' : 'Blandet – nøytral sone'));
    const bar = el('div', 'ai-scorebar'); const mk = el('i'); mk.style.left = c.score + '%'; bar.append(mk);
    const note = el('p', 'ai-muted', 'Scoren beskriver hvor godt de tekniske faktorene stemmer overens – ikke sannsynligheten for gevinst. 50 er nøytralt.');
    const comps = el('div', 'ai-stack');
    c.comps.forEach(x => { const r = el('div', 'ai-comp'); const lab = el('span'); lab.append(document.createTextNode(`${x.label} `), el('span', 'ai-muted', `(${x.w})`));
      const b = el('div', 'bar'); const i = el('i'); const w = Math.abs(x.s) * 50; i.style.left = x.s >= 0 ? '50%' : (50 - w) + '%'; i.style.width = w + '%'; i.style.background = x.s >= 0 ? 'var(--color-ok)' : 'var(--color-bad)'; b.append(i);
      const v = el('span', 'ai-num ' + sgnCls(x.s), (x.s > 0 ? '+' : x.s < 0 ? '−' : '') + Math.round(Math.abs(x.s * x.w) / 2));
      r.append(lab, b, v); const t = el('div', 'ai-comptext ai-cap', x.text + ' '); t.append(whyBtn({ trend: 'trend', mom: 'momentum', vol: 'volume', str: 'structure', lvl: 'levels', reg: 'regime', hist: 'history' }[x.key], c.sym)); r.append(t); comps.append(r); });
    // historikk og datakvalitet holdes separat
    const hist = el('div', 'ai-scen'); const an = c.analog;
    hist.append(el('h4', null, 'Historisk utfall (separat fra scoren)'));
    if (an && an.ok) { hist.append(el('p', 'ai-cap', `${share(an.stats.h30.pos)} av ${an.n} lignende tilfeller var høyere etter 30 dager (median ${pct(an.stats.h30.median)}), mot ${share(an.base.pos)} for alle dager i samme regime.`));
      const l = el('button', 'ai-link', 'Se historiske scenarioer →'); l.type = 'button'; l.addEventListener('click', () => go('historikk')); hist.append(l); }
    else hist.append(el('p', 'ai-muted', 'Ingen sammenlignbare tilfeller.'));
    const q = el('div', 'ai-scen'); q.append(el('h4', null, 'Datakvalitet og usikkerhet'));
    const ql = el('div', 'ai-row'); ql.style.justifyContent = 'flex-start'; ql.append(el('b', c.quality.label === 'Lav' ? 'ai-neg' : c.quality.label === 'Høy' ? 'ai-pos' : 'ai-warn', c.quality.label), el('span', 'ai-muted', `(${c.quality.score}/100)`)); q.append(ql);
    const ul = el('ul', 'ai-list'); c.quality.why.forEach(w => ul.append(el('li', null, w))); const age = (Date.now() - (c.asOf + DAY)) / 36e5; if (age > 48) ul.append(el('li', 'ai-neg', `Dataene er ${Math.round(age / 24)} dager gamle.`)); q.append(ul);
    box.replaceChildren(head, big, bar, note, comps, el('div', 'ai-grid2'));
    box.lastChild.append(hist, q);
  }
  function renderTech() {
    const c = cur(); if (!c) return;
    renderNow(c); drawChartControls(c); drawPriceChart(c); drawOsc(c); renderScenarios(c); renderExplain(c); renderScore(c);
  }

  // ------------------------------------------------------------------ historiske scenarioer
  const REL = { ok: ['Tilstrekkelig utvalg', 'ai-pos'], lite: ['Lite utvalg – tolk forsiktig', 'ai-warn'], 'for-lite': ['For lite utvalg til en pålitelig vurdering', 'ai-neg'] };
  const strTxt = v => v > 0 ? 'høyere topper og bunner' : v < 0 ? 'lavere topper og bunner' : 'blandet struktur';
  const caseSituation = f => `RSI ${nf(f.rsi, { maximumFractionDigits: 0 })} · WaveTrend ${f.wt} · ${f.d200 >= 0 ? nf(f.d200, { maximumFractionDigits: 0 }) + ' % over' : nf(Math.abs(f.d200), { maximumFractionDigits: 0 }) + ' % under'} 200D EMA · ${pct(f.z30, 0)} siste 30 d · ${strTxt(f.str)}`;
  function renderHistSummary(c) {
    const box = document.getElementById('hs-summary'); const an = c.analog;
    const head = el('div', 'ai-row'); head.append(el('h2', null, `Lignende situasjoner for ${NAMES[c.sym]}`), whyBtn('analog', c.sym, 'Hvordan fungerer dette?'));
    if (!an || !an.ok) { box.replaceChildren(head, el('p', 'ai-muted', an && an.reason ? an.reason : 'Ingen sammenlignbare tilfeller.')); return; }
    const r = REL[an.reliability];
    const lead = el('p', 'ai-summary', `I ${an.n} historiske situasjoner som lignet dagens (ca. ${an.nEff} uavhengige perioder, snittlikhet ${an.meanSim} %) var prisen høyere 30 dager senere i ${share(an.stats.h30.pos)} av tilfellene, med median ${pct(an.stats.h30.median)}. Til sammenligning: ${share(an.base.pos)} av alle dager i samme markedsregime.`);
    const chips = el('div', 'ai-chips'); const ch = (a, b, cls) => { const s = el('span', 'ai-chip'); s.append(el('span', 'ai-muted', a), el('b', cls, b)); return s; };
    chips.append(ch('Tilfeller', String(an.n)), ch('Uavhengige perioder', String(an.nEff)), ch('Snittlikhet', an.meanSim + ' %'), ch('Vurdering', r[0], r[1]));
    const filt = el('ul', 'ai-list');
    [`Samme markedsregime: pris ${an.regime}${an.btcRegime ? ' og ' + an.btcRegime : ''}${an.relaxed ? ' (BTC-regimet ble ignorert for å få nok tilfeller)' : ''}.`,
     `Sammenligner med alle coins i scanneren (${symList()}) – oppgitt coin og dato for hvert tilfelle.`,
     'Kun data som var kjent på hver dato brukes (indikatorer beregnes bare bakover; vendepunkter regnes som kjent først 5 dager etter).',
     'Ikke-overlappende: maks ett tilfelle per coin per 30 dager og minst 10 dager mellom alle tilfeller. Usikkerheten beregnes ut fra antall uavhengige 30-dagersperioder.',
     `Utelatt: ${NAMES[c.sym]} sine siste 60 dager, og tilfeller der 30-dagersutfallet ikke er kjent ennå.`].forEach(t => filt.append(el('li', null, t)));
    const crit = el('details', 'ai-more'); crit.append(el('summary', null, 'Kriterier og vekting'));
    const tw = el('div', 'ai-tablewrap'); const tb = el('table', 'ai-table'); const tr0 = el('tr'); ['Kriterium', 'Vekt', 'I dag (standardisert)'].forEach((h, i) => tr0.append(el('th', i ? null : 'l', h))); const th = el('thead'); th.append(tr0); tb.append(th);
    const bd = el('tbody'); an.criteria.forEach(k => { const tr = el('tr'); tr.append(el('td', 'l', k.label), el('td', null, nf(k.w, { maximumFractionDigits: 2 })), el('td', null, nf(k.now, { maximumFractionDigits: 2 }))); bd.append(tr); }); tb.append(bd); tw.append(tb);
    crit.append(el('p', 'ai-muted', 'Hvert kriterium er standardisert med en fast skala bestemt på forhånd (for eksempel RSI: (RSI − 50) / 15), slik at metoden ikke er tilpasset historiske utfall. Likhet = 100 · e^(−d²), der d er vektet gjennomsnittlig avstand.'), tw);
    const warn = an.reliability !== 'ok' ? el('div', 'ai-warnbox', an.reliability === 'for-lite' ? 'Utvalget er for lite til å gi en pålitelig vurdering. Bruk tallene bare som en pekepinn.' : 'Utvalget er lite. Intervallene under viser hvor usikre tallene er.') : null;
    box.replaceChildren(...[head, lead, chips, warn, el('h3', null, 'Slik er tilfellene valgt'), filt, crit].filter(Boolean));
  }
  function renderHistStats(c) {
    const box = document.getElementById('hs-stats'); const an = c.analog; if (!an || !an.ok) { box.replaceChildren(); return; }
    const s = an.stats;
    const tw = el('div', 'ai-tablewrap'); const tb = el('table', 'ai-table');
    const h = el('tr'); ['Etter', 'Andel positive (90 %-intervall)', 'Median', 'Snitt', 'Beste', 'Dårligste'].forEach((x, i) => h.append(el('th', i ? null : 'l', x))); const th = el('thead'); th.append(h); tb.append(th);
    const longRows = (an.hz || []).filter(z => z.H > 30 && z.n).map(z => [`${HZL[z.H]} (n=${z.n})`, { pos: z.pos, ci: z.ci, median: z.ret.q50, mean: z.mean, best: z.best, worst: z.worst }]);
    const bd = el('tbody'); [['1 dag', s.h1], ['7 dager', s.h7], ['30 dager', s.h30], ...longRows].forEach(([lab, v]) => { const tr = el('tr'); tr.append(el('td', 'l', lab), el('td', null, shareCi(v.pos, v.ci)), el('td', sgnCls(v.median), pct(v.median)), el('td', sgnCls(v.mean), pct(v.mean)), el('td', 'ai-pos', pct(v.best)), el('td', 'ai-neg', pct(v.worst))); bd.append(tr); }); tb.append(bd); tw.append(tb);
    const kv = el('dl', 'ai-kv'); const row = (a, b, cls) => { kv.append(el('dt', null, a), el('dd', cls, b)); };
    row('Største nedtur underveis (median / verste)', `${pct(s.mae.median)} / ${pct(s.mae.worst)}`, 'ai-neg');
    row('Største oppgang underveis (median)', pct(s.mfe.median), 'ai-pos');
    row('Nærmeste støtte brutt (dagslukk under) innen 30 d', share(s.supBroke));
    row('Nærmeste motstand brutt (dagslukk over) innen 30 d', share(s.resBroke));
    row(`Alle dager i samme regime: andel positive etter 30 d (n=${an.base.n})`, `${share(an.base.pos)} · median ${pct(an.base.median)}`);
    (an.hz || []).filter(z => z.H > 30 && z.base.n).forEach(z => row(`Alle dager i samme regime: andel positive etter ${HZL[z.H]} (n=${z.base.n})`, `${share(z.base.pos)} · median ${pct(z.base.median)}`));
    row(`${NAMES[c.sym]} alene i samme regime (n=${an.baseOwn.n})`, `${share(an.baseOwn.pos)} · median ${pct(an.baseOwn.median)}`);
    row('Bitcoin i de samme periodene (median 30 d)', pct(s.btc30));
    box.replaceChildren(el('h2', null, 'Historiske resultater'), el('p', 'ai-muted', 'Avkastning fra dagslukk på signaldagen. «Andel positive» er andelen tilfeller med høyere pris; intervallet tar hensyn til at tilfellene ikke er helt uavhengige. For 3–12 måneder teller bare tilfeller der utfallet er kjent (n), og tilfeller som ligger nærmere hverandre enn horisonten regnes som én periode – derfor er intervallene der mye bredere.'), tw, kv);
  }
  const qnt = (arr, q) => { const a = arr.filter(v => v != null && isFinite(v)).sort((x, y) => x - y); if (!a.length) return null; const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return a[lo] + (a[hi] - a[lo]) * (p - lo); };
  const FAN_TITLE = { 7: 'Mulig kursbane neste uke', 30: 'Mulig kursbane de neste 30 dagene', 90: 'Mulig kursbane de neste 3 månedene', 180: 'Mulig kursbane de neste 6 månedene', 365: 'Mulig kursbane de neste 12 månedene' };
  const FAN_PAST = { 7: 60, 30: 60, 90: 90, 180: 180, 365: 365 };
  const FAN_TICKS = { 7: [-60, -30, 0, 7], 30: [-60, -30, 0, 10, 20, 30], 90: [-90, -45, 0, 30, 60, 90], 180: [-180, -90, 0, 60, 120, 180], 365: [-365, -180, 0, 90, 180, 270, 365] };
  const dayLab = v => v === 0 ? 'I dag' : (v > 0 ? '+' : '−') + (Math.abs(v) >= 85 ? Math.round(Math.abs(v) / 30.4) + ' mnd' : Math.abs(v) + ' d');
  const inDays = j => j === 0 ? 'I dag' : j > 0 ? (j >= 85 ? `Om ${j} dager (ca. ${nf(j / 30.4, { maximumFractionDigits: 1 })} mnd)` : `Om ${j} dager`) : `${-j} dager siden`;
  const hzNow = () => HZ.includes(state.hz) ? state.hz : 30;
  const MIN_FAN_N = 5;
  function drawHz(c) {
    const seg = document.getElementById('hs-fan-hz'); if (!seg) return; const H = hzNow();
    seg.replaceChildren(...HZ.map(h => { const b = el('button', null, HZS[h]); b.type = 'button'; b.title = HZL[h]; b.setAttribute('aria-pressed', H === h ? 'true' : 'false'); b.addEventListener('click', () => { state.hz = h; drawHz(c); drawFan(c); renderProjection(c); }); return b; }));
    const t = document.getElementById('hs-fan-title'); if (t) t.textContent = FAN_TITLE[H];
  }
  function drawFan(c) {
    const box = document.getElementById('hs-fan'); box.querySelector('svg')?.remove(); box.querySelector('.ai-tip')?.remove(); box.querySelector('.ai-fan-note')?.remove(); const an = c.analog; if (!an || !an.ok) return;
    drawHz(c);
    const H = hzNow(), mode = state.fanMode || 'kurs', P0 = c.price, toP = v => P0 * (1 + v / 100), k = c.keys || {};
    const ms = document.getElementById('hs-fan-mode');
    ms.replaceChildren(...[['kurs', 'Kurs'], ['pct', 'Prosent']].map(([m, lab]) => { const b = el('button', null, lab); b.type = 'button'; b.setAttribute('aria-pressed', mode === m ? 'true' : 'false'); b.addEventListener('click', () => { state.fanMode = m; drawFan(c); }); return b; }));
    const W = Math.max(300, box.clientWidth), Hh = W < 600 ? 280 : 340; box.style.minHeight = Hh + 'px';
    // lang bane (0–365 d) hvis motoren har levert den, ellers 30-dagersbanen
    const src = an.fanL || an.fan.map(f => ({ ...f, n: an.n }));
    const fanAll = src.filter(f => f.j <= H && (f.n == null || f.n >= MIN_FAN_N) && f.q50 != null);
    const Hend = fanAll.length ? fanAll[fanAll.length - 1].j : 0;
    const past = FAN_PAST[H];
    const todaySrc = an.todayL || an.today;
    const today = todaySrc.slice(-(past + 1)).map((v, i, a) => ({ j: i - (a.length - 1), v: (v - 1) * 100 }));
    const fan = fanAll.map(f => ({ j: f.j, n: f.n, q10: (f.q10 - 1) * 100, q25: (f.q25 - 1) * 100, q50: (f.q50 - 1) * 100, q75: (f.q75 - 1) * 100, q90: (f.q90 - 1) * 100 }));
    const pre = H <= 30 ? an.preFan.map(f => ({ j: f.j, v: f.q50 == null ? null : (f.q50 - 1) * 100 })) : [];
    const all = [...today.map(d => d.v), ...fan.flatMap(f => [f.q10, f.q90]), ...pre.map(d => d.v)].filter(v => v != null && isFinite(v));
    let lo = Math.min(...all), hi = Math.max(...all);
    const lvls = [[k.nextUp, 'Neste motstand', 'var(--color-bad)'], [k.majUp, 'Avgjørende motstand', 'var(--color-bad)'], [k.mustHold, 'Må holde', 'var(--color-ok)'], [k.majDn, 'Avgjørende støtte', 'var(--color-ok)']]
      .filter(([l]) => l && l.d != null && l.d > lo - (hi - lo) * 0.25 && l.d < hi + (hi - lo) * 0.25);
    const seenL = new Set(); const lv = lvls.filter(([l]) => { const key = Math.round(l.d * 10); if (seenL.has(key)) return false; seenL.add(key); return true; });
    lv.forEach(([l]) => { lo = Math.min(lo, l.d); hi = Math.max(hi, l.d); });
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${Hh}`).attr('role', 'img').attr('aria-label', `Dagens kurs og mulig kursbane ${HZL[H]} fram, basert på lignende historiske forløp`);
    // fra 3 måneder: logaritmisk skala, ellers blir nedsiden klemt flat av de største oppturene
    const logY = H >= 90; let y, ty, fmt;
    // pene tick-verdier på loggskala (1–2–5-mønster), maks 7
    const logTicks = (a, b) => { const sets = [[1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9], [1, 1.5, 2, 3, 5, 7], [1, 2, 5], [1, 3], [1]]; let best = [a, b];
      for (const st of sets) { const out = []; for (let k = Math.floor(Math.log10(a)) - 1; k <= Math.ceil(Math.log10(b)); k++) for (const m of st) { const v = m * Math.pow(10, k); if (v >= a && v <= b) out.push(+v.toPrecision(6)); }
        if (out.length <= 7 && out.length >= 3) return out; if (out.length >= 2) best = out; } return best; };
    if (logY) { const L0 = Math.log(1 + lo / 100), L1 = Math.log(1 + hi / 100), lp = (L1 - L0) * 0.06; const ys = d3.scaleLog([Math.exp(L0 - lp), Math.exp(L1 + lp)], [Hh - 26, 10]);
      y = v => ys(1 + v / 100);
      if (mode === 'kurs') { ty = logTicks(P0 * Math.exp(L0 - lp), P0 * Math.exp(L1 + lp)).map(p => (p / P0 - 1) * 100); fmt = v => price(toP(v)); }
      else { ty = logTicks(Math.exp(L0 - lp), Math.exp(L1 + lp)).map(r => (r - 1) * 100); fmt = v => pct(v, 0); } }
    else { const pad = (hi - lo) * 0.06; const yl = d3.scaleLinear([lo - pad, hi + pad], [Hh - 26, 10]); y = yl;
      if (mode === 'kurs') { const yp = d3.scaleLinear([toP(lo - pad), toP(hi + pad)], [0, 1]); ty = yp.ticks(6).map(p => (p / P0 - 1) * 100); fmt = v => price(toP(v)); }
      else { yl.nice(); ty = yl.ticks(6); fmt = v => pct(v, 0); } }
    const m = { l: measure(svg, ty.map(fmt)) + 12, r: 24 };
    const xEnd = Math.max(Hend, 1);
    const x = d3.scaleLinear([-past, xEnd], [m.l, W - m.r]);
    let xt = FAN_TICKS[H].filter(v => v <= xEnd); if (W < 600) xt = xt.filter((v, i, a) => v === 0 || i === 1 || i === a.length - 1);
    svg.append('g').selectAll('line').data(ty).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    const ya = svg.append('g'); ty.forEach(v => ya.append('text').attr('x', m.l - 8).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt(v))); axisStyle(ya);
    const xa = svg.append('g').attr('transform', `translate(0,${Hh - 26})`).call(d3.axisBottom(x).tickValues(xt).tickFormat(dayLab).tickSizeOuter(0)); xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); axisStyle(xa);
    svg.append('rect').attr('x', x(0)).attr('width', x(xEnd) - x(0)).attr('y', 10).attr('height', Hh - 36).attr('fill', 'var(--color-bg)');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    const lvLab = [];
    lv.forEach(([l, lab, col]) => { svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(l.d)).attr('y2', y(l.d)).attr('stroke', col).attr('stroke-width', 1.2).attr('stroke-dasharray', '6 4').attr('opacity', 0.8); lvLab.push({ y: y(l.d) - 4, col, t: `${lab} ${price(l.p)}` }); });
    lvLab.sort((a, b) => a.y - b.y); for (let i = 1; i < lvLab.length; i++) if (lvLab[i].y - lvLab[i - 1].y < 15) lvLab[i].y = lvLab[i - 1].y + 15;
    svg.append('path').datum(fan).attr('d', d3.area().x(d => x(d.j)).y0(d => y(d.q10)).y1(d => y(d.q90))).attr('fill', dash.colors[0]).attr('fill-opacity', 0.12);
    svg.append('path').datum(fan).attr('d', d3.area().x(d => x(d.j)).y0(d => y(d.q25)).y1(d => y(d.q75))).attr('fill', dash.colors[0]).attr('fill-opacity', 0.22);
    svg.append('path').datum(fan).attr('d', d3.line().x(d => x(d.j)).y(d => y(d.q50))).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 2).attr('stroke-dasharray', '5 3');
    if (pre.length) svg.append('path').datum(pre.filter(d => d.v != null)).attr('d', d3.line().x(d => x(d.j)).y(d => y(d.v))).attr('fill', 'none').attr('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 1.5).attr('stroke-dasharray', '5 3');
    svg.append('path').datum(today).attr('d', d3.line().x(d => x(d.j)).y(d => y(d.v))).attr('fill', 'none').attr('stroke', 'var(--color-fg)').attr('stroke-width', H > 90 ? 1.6 : 2.2).attr('stroke-linejoin', 'round');
    svg.append('circle').attr('cx', x(0)).attr('cy', y(0)).attr('r', 4).attr('fill', 'var(--color-fg)');
    lvLab.forEach(L => svg.append('text').attr('x', m.l + 4).attr('y', L.y).attr('font-size', 'var(--cds-font-size-caption)').attr('fill', L.col).attr('paint-order', 'stroke').attr('stroke', 'var(--color-panel)').attr('stroke-width', 4).attr('stroke-linejoin', 'round').text(L.t));
    const lf = fan[fan.length - 1];
    if (lf) { const ends = [['q90', 'Høy'], ['q50', 'Median'], ['q10', 'Lav']].map(([kk, lab]) => ({ y: y(lf[kk]) - 5, t: mode === 'kurs' ? `${lab} ${price(toP(lf[kk]))}` : `${lab} ${pct(lf[kk], 0)}` }));
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
      ends.forEach(e => svg.append('text').attr('x', x(xEnd) - 4).attr('y', e.y).attr('text-anchor', 'end').attr('font-size', 'var(--cds-font-size-caption)').attr('fill', 'var(--color-fg-muted)').attr('paint-order', 'stroke').attr('stroke', 'var(--color-panel)').attr('stroke-width', 3).text(e.t)); }
    const tip = tipOf(box); const both = v => `${price(toP(v))} (${pct(v)})`;
    svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', Hh).attr('fill', 'transparent')
      .on('pointermove', ev => { const [px] = d3.pointer(ev); const j = Math.round(x.invert(px)); const lines = [el('div', 'd', inDays(j))];
        if (j <= 0) { const t = today.find(d => d.j === j); const p = pre.find(d => d.j === j); if (t) lines.push(el('div', null, `Kurs: ${both(t.v)}`)); if (p && p.v != null) lines.push(el('div', 'ai-muted', `Median i lignende tilfeller: ${pct(p.v)}`)); }
        else { const f = fan.find(d => d.j === j); if (f) { lines.push(el('div', null, `Median ${both(f.q50)}`), el('div', 'ai-muted', `Halvparten mellom ${price(toP(f.q25))} og ${price(toP(f.q75))}`), el('div', 'ai-muted', `8 av 10 mellom ${price(toP(f.q10))} og ${price(toP(f.q90))}`)); if (f.n != null) lines.push(el('div', 'ai-muted', `${f.n} av ${an.n} tilfeller har kjent utfall her`)); } }
        tip.replaceChildren(...lines); const kx = box.clientWidth / W; place(box, tip, x(j) * kx, 60); })
      .on('pointerleave', () => { tip.hidden = true; });
    if (logY) box.append(el('p', 'ai-muted ai-fan-note', 'Loggskala: like store prosentvise endringer opp og ned tar like mye plass.'));
    if (lf && (Hend < H || (lf.n != null && lf.n < an.n))) {
      const msg = Hend < H ? `Banen stopper etter ${Hend} dager fordi for få av de lignende tilfellene er gamle nok til at utfallet ${HZL[H]} fram er kjent.` : `Ved slutten av perioden bygger banen på ${lf.n} av ${an.n} tilfeller – de nyeste er for ferske til at utfallet ${HZL[H]} fram er kjent ennå.`;
      box.append(el('p', 'ai-muted ai-fan-note', msg)); }
    const lg = document.getElementById('hs-fan-legend'); const it = (sty, txt) => { const s = el('span'); const i = el('i'); Object.assign(i.style, sty); s.append(i, document.createTextNode(txt)); return s; };
    lg.replaceChildren(...[it({ color: 'var(--color-fg)' }, `${NAMES[c.sym]} siste ${today.length - 1} dager`), pre.length ? it({ color: 'var(--cds-chart-muted)', borderTopStyle: 'dashed' }, 'Median før, lignende tilfeller') : null, it({ color: dash.colors[0], borderTopStyle: 'dashed' }, 'Median videre'), it({ background: dash.colors[0], opacity: '.3', height: '10px', border: '0' }, 'Halvparten / 8 av 10 tilfeller')].filter(Boolean));
  }
  function renderProjection(c) {
    const box = document.getElementById('hs-proj'); const an = c.analog; if (!an || !an.ok || !an.cases.length || !an.hz) { box.replaceChildren(); return; }
    const P0 = c.price, cs = an.cases, k = c.keys || {}, H = hzNow();
    const Z = an.hz.find(z => z.H === H) || an.hz.find(z => z.H === 30);
    const cp = v => price(P0 * (1 + v / 100));
    const lead = Z.n ? el('p', 'ai-summary', `Hvis ${NAMES[c.sym]} utvikler seg som de ${Z.n} lignende tilfellene der utfallet er kjent, ender kursen om ${HZL[H]} typisk mellom ${cp(Z.ret.q25)} og ${cp(Z.ret.q75)} (median ${cp(Z.ret.q50)}, ${pct(Z.ret.q50)}). Underveis var den høyeste kursen typisk ${cp(Z.up.q50)} (${pct(Z.up.q50)}) og den laveste ${cp(Z.dn.q50)} (${pct(Z.dn.q50)}). Prisen var høyere i ${share(Z.pos)} av tilfellene, mot ${share(Z.base.pos)} for alle dager i samme markedsregime.`)
      : el('p', 'ai-summary', `Ingen av de lignende tilfellene er gamle nok til at utfallet om ${HZL[H]} er kjent.`);
    const tw = el('div', 'ai-tablewrap'); const tb = el('table', 'ai-table'); const hr = el('tr');
    tb.classList.add('ai-proj');
    ['Om', 'Median', 'Halvparten mellom', '8 av 10 mellom', 'Tilfeller'].forEach((h, i) => hr.append(el('th', i ? null : 'l', h))); const th = el('thead'); th.append(hr); tb.append(th);
    const bd = el('tbody');
    an.hz.forEach(z => { const tr = el('tr'); if (z.H === H) tr.style.fontWeight = '600';
      if (!z.n) { tr.append(el('td', 'l', HZL[z.H]), el('td', 'ai-muted', '–'), el('td', null, '–'), el('td', null, '–'), el('td', null, '0')); bd.append(tr); return; }
      tr.append(el('td', 'l', HZL[z.H]), el('td', sgnCls(z.ret.q50), `${cp(z.ret.q50)} (${pct(z.ret.q50)})`), el('td', null, `${cp(z.ret.q25)}–${cp(z.ret.q75)}`), el('td', null, `${cp(z.ret.q10)}–${cp(z.ret.q90)}`), el('td', null, `${z.n} (≈${z.nEff} per.)`)); bd.append(tr); });
    if (Z.n) [[`Høyeste underveis (${HZS[H]})`, Z.up, 'ai-pos'], [`Laveste underveis (${HZS[H]})`, Z.dn, 'ai-neg']].forEach(([lab, q, cls]) => { const tr = el('tr'); tr.append(el('td', 'l', lab), el('td', cls, `${cp(q.q50)} (${pct(q.q50)})`), el('td', null, `${cp(q.q25)}–${cp(q.q75)}`), el('td', null, `${cp(q.q10)}–${cp(q.q90)}`), el('td', null, String(Z.n))); bd.append(tr); });
    tb.append(bd); tw.append(tb);
    // hvor ofte ble nøkkelnivåene nådd innen valgt horisont
    const known = cs.filter(x => x.fwd && x.fwd[H]); const n = known.length;
    const up = known.map(x => x.fwd[H][1]), dn = known.map(x => x.fwd[H][2]);
    const reach = [[k.nextUp, 'Neste motstand', 1], [k.majUp, 'Avgjørende motstand', 1], [k.mustHold, 'Må holde (støtte)', -1], [k.majDn, 'Avgjørende støtte', -1]]
      .filter(([l]) => l && l.d != null).filter(([l], i, a) => a.findIndex(([m]) => m.p === l.p) === i)
      .map(([l, lab, dir]) => ({ lab, l, dir, share: n ? (dir > 0 ? up.filter(v => v >= l.d) : dn.filter(v => v <= l.d)).length / n : null }));
    const ul = el('ul', 'ai-list'); reach.forEach(r => { const li = el('li'); li.append(el('b', r.dir > 0 ? 'ai-pos' : 'ai-neg', `${r.lab} ${price(r.l.p)} (${pct(r.l.d)})`), document.createTextNode(n ? `: nådd innen ${HZL[H]} i ${Math.round(r.share * 100)} % av de lignende tilfellene (${Math.round(r.share * n)} av ${n}).` : ': ingen tilfeller med kjent utfall.')); ul.append(li); });
    let warn = null;
    if (Z.nEff < 10) warn = el('div', 'ai-warnbox', `Estimatet for ${HZL[H]} bygger bare på ca. ${Z.nEff} uavhengige perioder (${Z.n} tilfeller). Det er svært usikkert – se på det som et grovt bilde av spredningen.`);
    else if (an.reliability !== 'ok') warn = el('div', 'ai-warnbox', `Utvalget er ${an.reliability === 'for-lite' ? 'for lite' : 'lite'} (ca. ${an.nEff} uavhengige perioder), så tallene er usikre.`);
    const longNote = H > 30 ? el('p', 'ai-muted', 'Tilfellene er valgt ut fra tekniske kjennetegn på dagsgrafen. Jo lengre fram du ser, jo mer avhenger utfallet av markedssyklus, nyheter og makro som ikke er med i sammenligningen – 6–12-månederstallene sier mest om hvor stor spredningen har vært.') : null;
    box.replaceChildren(...[el('h3', null, 'Hvor høyt eller lavt kan det gå?'), lead, warn, tw, el('h3', null, `Ble nivåene nådd innen ${HZL[H]}?`), ul, longNote, el('p', 'ai-muted', `Basert på hva som faktisk skjedde etter de mest like situasjonene i historikken (${symList()}), regnet fra dagens kurs ${price(P0)}. «8 av 10 mellom» er 10.–90. persentil. «Tilfeller» viser hvor mange som har kjent utfall for horisonten, og omtrent hvor mange uavhengige perioder de utgjør. Historien gjentar seg ikke nøyaktig – bruk dette som et bilde av spredningen, ikke som en prognose.`)].filter(Boolean));
  }
  function miniPath(box, cs, today, opt = {}) {
    box.replaceChildren(); const W = Math.max(200, box.clientWidth || 240), H = opt.h || 110; box.style.height = H + 'px';
    const pre = cs.pre.map((v, i, a) => ({ j: i - (a.length - 1), v: (v - 1) * 100 })), post = cs.post.map((v, j) => ({ j, v: (v - 1) * 100 }));
    const tdy = today ? today.map((v, i, a) => ({ j: i - (a.length - 1), v: (v - 1) * 100 })) : [];
    const all = [...pre, ...post, ...tdy].map(d => d.v); const lo = Math.min(...all), hi = Math.max(...all);
    const m = { l: opt.axis ? 44 : 4, r: 4, t: 6, b: opt.axis ? 22 : 6 };
    const x = d3.scaleLinear([-60, 30], [m.l, W - m.r]), y = d3.scaleLinear([lo, hi], [H - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `Pris før og etter ${cs.date} for ${cs.sym}`);
    if (opt.axis) { const ya = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(v => pct(v, 0)).tickSize(0)); ya.select('.domain').remove(); axisStyle(ya);
      const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues([-60, -30, 0, 30]).tickFormat(v => v === 0 ? 'Signal' : (v > 0 ? '+' : '−') + Math.abs(v) + ' d').tickSizeOuter(0)); xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); axisStyle(xa); }
    svg.append('rect').attr('x', x(0)).attr('width', x(30) - x(0)).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'var(--color-panel)');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-axis)');
    if (tdy.length) svg.append('path').datum(tdy).attr('d', d3.line().x(d => x(d.j)).y(d => y(d.v))).attr('fill', 'none').attr('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
    svg.append('path').datum(pre).attr('d', d3.line().x(d => x(d.j)).y(d => y(d.v))).attr('fill', 'none').attr('stroke', 'var(--color-fg)').attr('stroke-width', 1.8);
    const end = post[post.length - 1].v; svg.append('path').datum(post).attr('d', d3.line().x(d => x(d.j)).y(d => y(d.v))).attr('fill', 'none').attr('stroke', end >= 0 ? 'var(--color-ok)' : 'var(--color-bad)').attr('stroke-width', 2.2);
  }
  function caseText(cs) {
    const parts = [`Etter 30 dager var prisen ${nf(Math.abs(cs.r30), { maximumFractionDigits: 1 })} % ${cs.r30 >= 0 ? 'høyere' : 'lavere'}.`];
    parts.push(`Underveis falt den maks ${pct(cs.dn30)} og steg maks ${pct(cs.up30)}.`);
    if (cs.supBroke != null) parts.push(cs.supBroke ? 'Nærmeste støtte ble brutt.' : 'Nærmeste støtte holdt.');
    if (cs.sym !== 'BTC' && cs.btc30 != null) parts.push(`Bitcoin: ${pct(cs.btc30)} i samme periode.`);
    return parts.join(' ');
  }
  function renderCases(c) {
    const box = document.getElementById('hs-cases'); const an = c.analog; if (!an || !an.ok) { box.replaceChildren(); return; }
    if (state.caseSym !== c.sym) { state.caseIdx = null; state.caseSym = c.sym; }
    box.replaceChildren(...an.top.map((cs, i) => {
      const b = el('div', 'ai-case'); b.setAttribute('role', 'button'); b.tabIndex = 0; b.setAttribute('aria-pressed', state.caseIdx === i ? 'true' : 'false');
      const pick = () => { state.caseIdx = state.caseIdx === i ? null : i; renderCases(c); renderCompare(c); if (state.caseIdx != null) document.getElementById('hs-compare').scrollIntoView({ block: 'nearest' }); };
      b.addEventListener('click', pick); b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      const h = el('div', 'ai-row'); const nm = el('div', 'ai-stack'); nm.style.gap = '2px'; nm.append(el('b', null, `${NAMES[cs.sym]} · ${dfmt(dateOf(cs.date))}`), el('span', 'ai-muted', `Likhet ${cs.sim} %`)); h.append(nm, el('span', 'ai-chip', `#${i + 1}`));
      const sit = el('p', 'ai-muted', caseSituation(cs.feat));
      const mini = el('div', 'ai-mini');
      const kv = el('dl', 'ai-kv'); kv.append(el('dt', null, 'Etter 7 / 30 dager'), el('dd', null, `${pct(cs.r7)} / ${pct(cs.r30)}`), el('dt', null, 'Maks opp / ned (30 d)'), el('dd', null, `${pct(cs.up30)} / ${pct(cs.dn30)}`));
      kv.children[1].className = sgnCls(cs.r30);
      b.append(h, sit, mini, kv, el('p', 'ai-cap', caseText(cs)));
      requestAnimationFrame(() => miniPath(mini, cs, an.today)); return b; }));
  }
  function renderCompare(c) {
    const box = document.getElementById('hs-compare'); const an = c.analog;
    if (state.caseIdx == null || !an || !an.top[state.caseIdx]) { box.hidden = true; box.replaceChildren(); return; }
    const cs = an.top[state.caseIdx]; box.hidden = false;
    const h = el('div', 'ai-row'); h.append(el('h3', null, `I dag mot ${NAMES[cs.sym]} ${dfmt(dateOf(cs.date))}`)); const x = el('button', 'ai-btn', 'Lukk'); x.type = 'button'; x.addEventListener('click', () => { state.caseIdx = null; renderCases(c); renderCompare(c); }); h.append(x);
    const ch = el('div', 'ai-mini');
    const lg = el('div', 'ai-legend'); const it = (sty, txt) => { const s = el('span'); const i = el('i'); Object.assign(i.style, sty); s.append(i, document.createTextNode(txt)); return s; };
    lg.append(it({ color: 'var(--color-fg)' }, `${cs.sym} før signaldagen`), it({ color: cs.r30 >= 0 ? 'var(--color-ok)' : 'var(--color-bad)' }, `${cs.sym} de 30 dagene etter`), it({ color: 'var(--cds-chart-muted)', borderTopStyle: 'dashed' }, `${c.sym} i dag (siste 60 dager)`));
    const f = cs.feat, t = an.todayFeat || {};
    const tw = el('div', 'ai-tablewrap'); const tb = el('table', 'ai-table'); const hr = el('tr'); ['Kjennetegn', `${c.sym} i dag`, `${cs.sym} ${cs.date}`].forEach((q, i) => hr.append(el('th', i ? null : 'l', q))); const th = el('thead'); th.append(hr); tb.append(th);
    const bd = el('tbody'); [['RSI (14)', t.rsi, f.rsi, v => nf(v, { maximumFractionDigits: 0 })], ['WaveTrend', t.wt, f.wt, v => nf(v, { maximumFractionDigits: 0 })], ['Avstand til 200D EMA', t.d200, f.d200, v => pct(v)], ['Avstand til 50D EMA', t.d50, f.d50, v => pct(v)], ['Utvikling siste 30 d', t.z30, f.z30, v => pct(v)], ['Prisstruktur', t.str, f.str, strTxt], ['Relativt volum (5 d / 50 d)', t.rv, f.rv, v => v == null ? '–' : pct((Math.exp(v) - 1) * 100, 0)], ['Avstand til støtte (ATR)', t.sup, f.sup, v => nf(v, { maximumFractionDigits: 1 })], ['Avstand til motstand (ATR)', t.res, f.res, v => nf(v, { maximumFractionDigits: 1 })]]
      .forEach(([lab, a, b2, fm]) => { const tr = el('tr'); tr.append(el('td', 'l', lab), el('td', null, fm(a)), el('td', null, fm(b2))); bd.append(tr); }); tb.append(bd); tw.append(tb);
    box.replaceChildren(h, ch, lg, el('p', 'ai-cap', caseText(cs)), tw);
    requestAnimationFrame(() => miniPath(ch, cs, an.today, { h: 240, axis: true }));
  }
  function renderHist() { const c = cur(); if (!c) return; renderHistSummary(c); drawFan(c); renderProjection(c); renderHistStats(c); renderCases(c); renderCompare(c); }

  // ------------------------------------------------------------------ signalhistorikk
  const ETYPES = [['wtBuy', 'WaveTrend kjøpssignal (▲)', 1, 'wt'], ['wtSell', 'WaveTrend salgssignal (▼)', -1, 'wt'], ['rsiOS', 'RSI under 30', 1, 'rsi'], ['rsiOB', 'RSI over 70', -1, 'rsi'], ['golden', 'Golden cross (50D over 200D)', 1, 'ema'], ['death', 'Death cross (50D under 200D)', -1, 'ema'], ['reclaim', 'Tilbake over 200D EMA', 1, 'ema'], ['lose', 'Brudd under 200D EMA', -1, 'ema']];
  function verdict(s) { if (!s || s.nUsed < 8) return ['For få signaler', 'ai-neu']; if (s.ci[0] > s.basePos) return ['Bedre enn basisraten', 'ai-pos']; if (s.ci[1] < s.basePos) return ['Svakere enn basisraten', 'ai-neg']; return ['Ingen tydelig fordel', 'ai-neu']; }
  function renderSignals() {
    const c = cur(); if (!c) return; const es = c.eventStats || {};
    const box = document.getElementById('sg-stats');
    const tw = el('div', 'ai-tablewrap'); const tb = el('table', 'ai-table');
    const hr = el('tr'); ['Signal', 'Antall', 'Treffrate 30 d (90 %-int.)', 'Basisrate', 'Treffrate 7 d', 'Median 7 d', 'Median 30 d', 'Typisk nedtur', 'Vurdering'].forEach((h, i) => hr.append(el('th', i === 0 || i === 8 ? 'l' : (i === 4 || i === 5 ? 'ai-hide-sm' : null), h))); const th = el('thead'); th.append(hr); tb.append(th);
    const bd = el('tbody');
    ETYPES.forEach(([k, lab, dir, wk]) => { const s = es[k]; if (!s) return; const tr = el('tr'); const td0 = el('td', 'l'); td0.append(document.createTextNode(lab + ' '), whyBtn(wk, c.sym)); const [vt, vc] = verdict(s);
      tr.append(td0, el('td', null, `${s.nUsed}${s.n !== s.nUsed ? ' / ' + s.n : ''}`), el('td', null, shareCi(s.hit, s.ci)), el('td', null, share(s.basePos)), el('td', 'ai-hide-sm', share(s.hit7)), el('td', 'ai-hide-sm ' + sgnCls(s.med7), pct(s.med7)), el('td', sgnCls(s.med30), pct(s.med30)), el('td', 'ai-neg', pct(s.mae)), el('td', 'l ' + vc, vt)); bd.append(tr); });
    tb.append(bd); tw.append(tb);
    const intro = el('p', 'ai-muted', `Alle signaler i ${NAMES[c.sym]}s historikk på Binance (fra ${c.firstDate}). Treffrate = andelen signaler der prisen gikk i signalets retning etter 30 dager. Basisrate = samme andel for alle dager, uansett signal. Signaler innen 30 dager etter et tidligere signal av samme type telles ikke på nytt (antall brukt / totalt).`);
    const takeaway = (() => { const wb = es.wtBuy, ws = es.wtSell; if (!wb) return ''; const vb = verdict(wb)[0], vs = ws ? verdict(ws)[0] : '';
      return `WaveTrend-kjøpssignaler i ${NAMES[c.sym]}: ${share(wb.hit)} traff etter 30 dager mot en basisrate på ${share(wb.basePos)} – ${vb.toLowerCase()}.${ws ? ` Salgssignalene: ${share(ws.hit)} mot ${share(ws.basePos)} – ${vs.toLowerCase()}.` : ''} Signalene bør derfor brukes sammen med nivåer og trend, ikke alene.`; })();
    box.replaceChildren(el('h2', null, 'Hvor godt har signalene truffet?'), el('p', 'ai-summary', takeaway), intro, tw);
    const rb = document.getElementById('sg-recent'); const ev = (c.eventsAll || []).filter(e => dateOf(e.date) >= c.asOf - 365 * DAY).slice().reverse();
    const tw2 = el('div', 'ai-tablewrap'); const t2 = el('table', 'ai-table'); const h2 = el('tr'); ['Dato', 'Signal', 'Pris', '7 d etter', '30 d etter', 'Maks opp / ned'].forEach((h, i) => h2.append(el('th', i < 2 ? 'l' : (i === 5 ? 'ai-hide-sm' : null), h))); const th2 = el('thead'); th2.append(h2); t2.append(th2);
    const b2 = el('tbody'); ev.forEach(e => { const tr = el('tr'); const up = ETYPES.find(x => x[0] === e.type)[2] > 0; tr.append(el('td', 'l', dfmt(dateOf(e.date))), el('td', 'l ' + (up ? 'ai-pos' : 'ai-neg'), EVL[e.type]), el('td', null, price(e.price)), el('td', sgnCls(e.r7), e.r7 == null ? 'pågår' : pct(e.r7)), el('td', sgnCls(e.r30), e.r30 == null ? 'pågår' : pct(e.r30)), el('td', 'ai-hide-sm', e.up30 == null ? '–' : `${pct(e.up30)} / ${pct(e.dn30)}`)); b2.append(tr); });
    t2.append(b2); tw2.append(t2);
    renderBacktest(c);
    rb.replaceChildren(el('h2', null, 'Signaler siste 12 måneder'), el('p', 'ai-muted', 'Tekniske hendelser i dagsgrafen. Resultatene måles fra dagslukk samme dag. Se dem i grafen under Teknisk analyse ved å slå på «Kjøps-/salgssignaler» og «Tekniske hendelser».'), ev.length ? tw2 : el('p', 'ai-muted', 'Ingen hendelser siste 12 måneder.'));
  }

  // ------------------------------------------------------------------ daytrading (live 15-min data direkte fra Binance i nettleseren)
  const DTS = { live: {}, raw: {}, t: null, err: null, busy: false, timer: null, sel: null, calc: null };
  const KL = 'https://data-api.binance.vision/api/v3/klines';
  const hm = t => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  const hms = t => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fR = (v, d = 2) => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' R';
  const DT_VERD = { good: ['Lønnsom i backtest', 'ai-pos'], bad: ['Tapte i backtest', 'ai-neg'], mixed: ['Blandet i backtest', 'ai-warn'], few: ['For få handler', 'ai-neu'] };
  const DT_ST = { 'utløst': ['Utløst nå – inngang mulig', 'ai-pos'], 'åpen': ['Åpen handel', 'ai-warn'], 'følg': ['Følg med – ikke utløst', 'ai-neu'] };
  async function dtFetch() {
    if (DTS.busy || typeof DT === 'undefined') return; DTS.busy = true;
    try { const now = Date.now();
      await Promise.all(state.list.map(async s => {
        const [a, b] = await Promise.all([fetch(`${KL}?symbol=${s}USDT&interval=15m&limit=500`, { cache: 'no-store' }).then(r => r.json()), fetch(`${KL}?symbol=${s}USDT&interval=1h&limit=300`, { cache: 'no-store' }).then(r => r.json())]);
        if (!Array.isArray(a) || !Array.isArray(b)) throw new Error('Uventet svar fra Binance');
        const forming = a.filter(x => x[6] >= now).pop(); const B = DT.bars(a.filter(x => x[6] < now)), H = DT.bars(b.filter(x => x[6] < now));
        DTS.raw[s] = { B, forming: forming ? +forming[4] : null }; DTS.live[s] = DT.live(B, H); }));
      DTS.t = Date.now(); DTS.err = null;
    } catch (e) { console.error(e); DTS.err = 'Fikk ikke hentet 15-min data fra Binance. Prøver igjen om ett minutt.'; }
    DTS.busy = false; if (tabNow() === 'daytrading') renderDay(); else if (tabNow() === 'assistent') renderAssist();
  }
  const dtTab = () => ['daytrading', 'assistent'].includes(tabNow());
  function dtTimer() { if (dtTab() && !document.hidden) { if (!DTS.timer) { DTS.timer = setInterval(() => { if (dtTab() && !document.hidden) dtFetch(); else { clearInterval(DTS.timer); DTS.timer = null; } }, 60e3); } } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && dtTab()) { dtFetch(); dtTimer(); } });
  const dtBT = (sym, key) => { const D = dash.data('daytrade'); if (D.status !== 'ok' || !D.data) return null; const bt = D.data;
    const c = bt.coins && bt.coins[sym] && bt.coins[sym][key]; if (c && c.verdict !== 'few') return { ...c, scope: NAMES[sym] }; const a = bt.ALL && bt.ALL[key]; return a ? { ...a, scope: 'alle coins' } : null; };
  const curPrice = s => { const L = window.__live && window.__live[s]; if (L && L.p) return L.p; const r = DTS.raw[s]; return r && r.forming != null ? r.forming : DTS.live[s] && DTS.live[s].price; };
  function renderDay() {
    const c = cur(); if (!c) return; const s = c.sym;
    if (!DTS.t && !DTS.busy) dtFetch(); dtTimer();
    const L = DTS.live[s], head = document.getElementById('dt-head');
    if (!L) { head.replaceChildren(el('h2', null, `Daytrading – ${NAMES[s]}`), el('p', 'ai-muted', DTS.err || 'Henter 15-minutters candles fra Binance …')); ['dt-setups', 'dt-chart', 'dt-calc', 'dt-watch', 'dt-recent', 'dt-bt'].forEach(id => document.getElementById(id).replaceChildren()); return; }
    const P = curPrice(s);
    // ---- topp: situasjonen nå
    const ch = el('div', 'ai-chips'); const chip = (a, b, cls) => { const x = el('span', 'ai-chip'); x.append(el('span', 'ai-muted', a), el('b', cls, b)); ch.append(x); };
    chip('Kurs', price(P)); chip('1t-trend', L.bias > 0 ? 'Opp' : L.bias < 0 ? 'Ned' : 'Sidelengs', L.bias > 0 ? 'ai-pos' : L.bias < 0 ? 'ai-neg' : 'ai-neu');
    chip('VWAP i dag', `${price(L.vwap)} (${P >= L.vwap ? 'over' : 'under'})`, P >= L.vwap ? 'ai-pos' : 'ai-neg'); chip('RSI 15 min', nf(L.rsi, { maximumFractionDigits: 0 }));
    chip('Bevegelse per 15 min (ATR)', nf(L.atrPct, { maximumFractionDigits: 2 }) + ' %'); chip('Dagens range', `${nf(L.today, { maximumFractionDigits: 1 })} % av snitt ${nf(L.adr, { maximumFractionDigits: 1 })} %`, L.adr && L.today > L.adr ? 'ai-warn' : null); chip('Økt', L.session);
    const nxt = L.t + 2 * DT.M15;
    head.replaceChildren(el('h2', null, `Daytrading – ${NAMES[s]}`), el('p', 'ai-muted', `15-minutters candles med 1-timestrenden som filter. Oppdatert ${DTS.t ? hms(DTS.t) : '–'} · siste lukkede candle ${hm(L.t + DT.M15)} · neste lukker ${hm(nxt)}. Data hentes direkte fra Binance hvert minutt mens fanen er åpen.`), ch,
      el('p', 'ai-muted', `Gårsdagens topp ${price(L.pdh)} · bunn ${price(L.pdl)} · dagens topp ${price(L.dayHi)} · bunn ${price(L.dayLo)}`), ...(DTS.err ? [el('div', 'ai-warnbox', DTS.err)] : []),
      el('div', 'ai-warnbox', 'Daytrading er høy risiko, og de fleste som driver med det taper penger over tid – særlig med giring. Bruk dette som et hjelpemiddel, test det med papirhandel først, og risiker aldri mer enn du har råd til å tape. Ikke finansiell rådgivning.'));
    // ---- muligheter nå
    const box = document.getElementById('dt-setups'); const order = { 'utløst': 0, 'åpen': 1, 'følg': 2 };
    const items = L.items.slice().sort((a, b) => order[a.status] - order[b.status]);
    if (!DTS.sel || DTS.sel.sym !== s || !items.some(x => x.key === DTS.sel.key && x.status === DTS.sel.status)) DTS.sel = items.length ? { sym: s, key: items[0].key, status: items[0].status } : null;
    const grid = el('div', 'ai-cases');
    items.forEach(x => { const T = DT.TYPES[x.type], b = dtBT(s, x.key), [stT, stC] = DT_ST[x.status]; const isSel = DTS.sel && DTS.sel.key === x.key && DTS.sel.status === x.status;
      const card = el('div', 'ai-case'); if (isSel) card.style.borderColor = 'var(--cds-chart-axis)';
      const top = el('div', 'ai-row'); top.append(el('span', 'ai-pill ' + (x.dir > 0 ? 'st-buy' : 'st-sell'), x.dir > 0 ? 'LONG' : 'SHORT'), el('b', 'ai-cap ' + stC, stT)); card.append(top, el('h3', null, T.label));
      const e = x.entry != null ? x.entry : x.ref, r = x.risk, kv = el('dl', 'ai-kv'); const row = (a, v, cls) => kv.append(el('dt', null, a), el('dd', cls, v));
      row(x.status === 'følg' ? 'Planlagt inngang' : x.status === 'åpen' ? 'Inngang' : 'Inngang (ca. nå)', price(e));
      row('Stopp', `${price(x.stop)} (${pct(-x.dir * r / e * 100, 2)})`, 'ai-neg'); row('Mål 1R', `${price(e + x.dir * r)} (${pct(x.dir * r / e * 100, 2)})`, 'ai-pos'); row('Mål 2R (backtestens mål)', `${price(e + x.dir * 2 * r)} (${pct(x.dir * 2 * r / e * 100, 2)})`, 'ai-pos');
      row('Gebyr + glidning', `ca. ${fR(-x.cost)} per handel`);
      if (x.status === 'åpen') { const cr = (P - e) * x.dir / r; row('Nå', fR(cr), sgnCls(cr)); row('Tidsstopp', `om ${Math.max(0, DT.P.maxBars - (L.n - x.i))} × 15 min`); }
      card.append(kv);
      if (b && b.all && b.all.n) { const [vt, vc] = DT_VERD[b.verdict]; const p = el('p', 'ai-cap'); p.append(el('b', vc, vt + ': '), document.createTextNode(`${b.all.n} handler siste 12 mnd (${b.scope}), ${share(b.all.win)} treff, ${fR(b.all.exp)} per handel etter gebyr. Siste 4 mnd: ${b.oos.n ? fR(b.oos.exp) : '–'}.`)); card.append(p);
        if (b.verdict === 'bad') card.append(el('p', 'ai-cap ai-neg', 'Dette oppsettet har tapt penger i backtesten – vær ekstra forsiktig.')); }
      const ul = el('ul', 'ai-list ai-cap'); (x.why || []).forEach(w => ul.append(el('li', null, w))); card.append(ul);
      const btns = el('div', 'ai-row'); const b1 = el('button', 'ai-btn', 'Vis i grafen'); b1.type = 'button'; b1.addEventListener('click', () => { DTS.sel = { sym: s, key: x.key, status: x.status }; renderDay(); document.getElementById('dt-chart').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      const b2 = el('button', 'ai-btn', 'Bruk i kalkulatoren'); b2.type = 'button'; b2.addEventListener('click', () => { DTS.calc = { entry: e, stop: x.stop, dir: x.dir }; DTS.sel = { sym: s, key: x.key, status: x.status }; renderDay(); document.getElementById('dt-calc').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      btns.append(b1, b2); card.append(btns); grid.append(card); });
    box.replaceChildren(el('h2', null, 'Muligheter nå'), el('p', 'ai-muted', 'Utløst = alle kriteriene ble oppfylt på siste lukkede 15-min candle. Følg med = kursen er nær et oppsett, men det er ikke utløst. Stopp og mål er de samme som i backtesten: mål 2R, ellers ut etter 6 timer.'),
      items.length ? grid : el('p', 'ai-summary', `Ingen oppsett nær akkurat nå. 1-timestrenden er ${L.bias > 0 ? 'opp' : L.bias < 0 ? 'ned' : 'sidelengs'}; neste nivåer er gårsdagens topp ${price(L.pdh)} og bunn ${price(L.pdl)}.`));
    const sel = DTS.sel && items.find(x => x.key === DTS.sel.key && x.status === DTS.sel.status);
    drawDayChart(s, L, sel); renderCalc(s, P, sel); renderDayWatch(s); renderDayRecent(s, L); renderDayBT(s);
  }
  function drawDayChart(s, L, sel) {
    const box = document.getElementById('dt-chart'), B = DTS.raw[s].B, I = L.I;
    const W = Math.max(300, box.clientWidth || 600), H = W < 600 ? 300 : 380, n = W < 600 ? 96 : 192, a0 = Math.max(0, B.N - n);
    const idx = d3.range(a0, B.N);
    const lv = [];
    if (sel) { const e = sel.entry != null ? sel.entry : sel.ref, r = sel.risk; lv.push([e, 'Inngang', 'var(--color-fg)'], [sel.stop, 'Stopp', 'var(--color-bad)'], [e + sel.dir * r, '1R', 'var(--color-ok)'], [e + sel.dir * 2 * r, '2R', 'var(--color-ok)']); }
    let lo = d3.min(idx, i => B.l[i]), hi = d3.max(idx, i => B.h[i]); const span = hi - lo;
    idx.forEach(i => { for (const v of [I.pdh[i], I.pdl[i]]) if (v != null && v > lo - span * 0.3 && v < hi + span * 0.3) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    const lvv = lv.filter(([v]) => v != null && v > lo - span * 0.6 && v < hi + span * 0.6); lvv.forEach(([v]) => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    box.replaceChildren(el('div', 'ai-row', null)); box.firstChild.append(el('h2', null, `15-min graf siste ${n / 4} timer`), el('span', 'ai-muted', sel ? `Viser ${sel.dir > 0 ? 'long' : 'short'}: ${DT.TYPES[sel.type].label}` : ''));
    const wrap = el('div'); wrap.style.position = 'relative'; box.append(wrap);
    const svg = d3.select(wrap).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `15-minutters kursgraf for ${NAMES[s]}`);
    const y = d3.scaleLinear([lo - (hi - lo) * 0.04, hi + (hi - lo) * 0.04], [H - 24, 8]); const ty = y.ticks(6);
    const m = { l: measure(svg, ty.map(price)) + 12, r: 8 };
    const x = d3.scaleBand(idx, [m.l, W - m.r]).padding(0.25);
    svg.append('g').selectAll('line').data(ty).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    const ya = svg.append('g'); ty.forEach(v => ya.append('text').attr('x', m.l - 6).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text(price(v))); axisStyle(ya);
    const xt = idx.filter(i => (B.t[i] / DT.M15) % (n > 100 ? 24 : 16) === 0);
    const xa = svg.append('g'); xt.forEach(i => xa.append('text').attr('x', x(i) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text(hm(B.t[i]))); axisStyle(xa);
    // dagsskiller
    idx.filter(i => i > a0 && I.day0[i] !== I.day0[i - 1]).forEach(i => svg.append('line').attr('x1', x(i)).attr('x2', x(i)).attr('y1', 8).attr('y2', H - 24).attr('stroke', 'var(--cds-chart-axis)').attr('stroke-dasharray', '2 3'));
    const line = (arr, col, dashA, w = 1.4) => svg.append('path').datum(idx.filter(i => arr[i] != null)).attr('d', d3.line().x(i => x(i) + x.bandwidth() / 2).y(i => y(arr[i]))).attr('fill', 'none').attr('stroke', col).attr('stroke-width', w).attr('stroke-dasharray', dashA || null);
    line(I.e20, dash.colors[0]); line(I.e50, dash.colors[1]);
    // gårsdagens topp/bunn som trapp per døgn
    const inR = v => v != null && v >= y.domain()[0] && v <= y.domain()[1];
    for (const [arr, lab] of [[I.pdh, 'Gårsdagens topp'], [I.pdl, 'Gårsdagens bunn']]) {
      svg.append('path').datum(idx).attr('d', d3.line().defined(i => inR(arr[i]) && (i === a0 || I.day0[i] === I.day0[i - 1])).x(i => x(i) + x.bandwidth() / 2).y(i => y(arr[i]))).attr('fill', 'none').attr('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 1.2).attr('stroke-dasharray', '6 4');
      const iL = B.N - 1; if (inR(arr[iL])) svg.append('text').attr('x', W - m.r - 4).attr('y', y(arr[iL]) - 4).attr('text-anchor', 'end').attr('font-size', 'var(--cds-font-size-caption)').attr('fill', 'var(--color-fg-muted)').attr('paint-order', 'stroke').attr('stroke', 'var(--color-panel)').attr('stroke-width', 4).text(`${lab} ${price(arr[iL])}`); }
    svg.append('path').datum(idx).attr('d', d3.line().defined(i => i === a0 || I.day0[i] === I.day0[i - 1]).x(i => x(i) + x.bandwidth() / 2).y(i => y(I.vwap[i]))).attr('fill', 'none').attr('stroke', dash.colors[2]).attr('stroke-width', 1.4).attr('stroke-dasharray', '4 3');
    const g = svg.append('g'); idx.forEach(i => { const up = B.c[i] >= B.o[i], col = up ? 'var(--color-ok)' : 'var(--color-bad)', cx = x(i) + x.bandwidth() / 2;
      g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(B.h[i])).attr('y2', y(B.l[i])).attr('stroke', col);
      g.append('rect').attr('x', x(i)).attr('width', x.bandwidth()).attr('y', y(Math.max(B.o[i], B.c[i]))).attr('height', Math.max(1, Math.abs(y(B.o[i]) - y(B.c[i])))).attr('fill', col); });
    const labs = []; lvv.forEach(([v, lab, col]) => { svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', col).attr('stroke-dasharray', '6 4').attr('stroke-width', 1.2); labs.push({ y: y(v) - 4, t: `${lab} ${price(v)}`, col }); });
    labs.sort((p, q) => p.y - q.y); for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 14) labs[i].y = labs[i - 1].y + 14;
    labs.forEach(lb => svg.append('text').attr('x', m.l + 4).attr('y', lb.y).attr('font-size', 'var(--cds-font-size-caption)').attr('fill', lb.col).attr('paint-order', 'stroke').attr('stroke', 'var(--color-panel)').attr('stroke-width', 4).text(lb.t));
    // oppsett som er utløst i perioden
    L.recent.filter(t => t.i >= a0).forEach(t => { const cx = x(t.i) + x.bandwidth() / 2, yy = t.dir > 0 ? y(B.l[t.i]) + 12 : y(B.h[t.i]) - 4;
      svg.append('text').attr('x', cx).attr('y', yy).attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', t.dir > 0 ? 'var(--color-ok)' : 'var(--color-bad)').text(t.dir > 0 ? '▲' : '▼'); });
    const tip = tipOf(wrap);
    svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', H).attr('fill', 'transparent').on('pointermove', ev => { const [px] = d3.pointer(ev); const k = Math.max(0, Math.min(idx.length - 1, Math.floor((px - m.l) / x.step()))), i = idx[k];
      const tr = L.recent.filter(t => t.i === i); tip.replaceChildren(el('div', 'd', `${dfmt(B.t[i])} ${hm(B.t[i])}–${hm(B.t[i] + DT.M15)}`), el('div', null, `Å ${price(B.o[i])} · H ${price(B.h[i])} · L ${price(B.l[i])} · S ${price(B.c[i])}`), el('div', 'ai-muted', `VWAP ${price(I.vwap[i])} · RSI ${nf(I.R[i], { maximumFractionDigits: 0 })}`),
        ...tr.map(t => el('div', t.dir > 0 ? 'ai-pos' : 'ai-neg', `${t.dir > 0 ? 'Long' : 'Short'}: ${DT.TYPES[t.type].label}${t.state === 'lukket' ? ` → ${t.how} (${fR(t.R)})` : ''}`)));
      const kx = wrap.clientWidth / W; place(wrap, tip, (x(i) + x.bandwidth() / 2) * kx, 60); }).on('pointerleave', () => { tip.hidden = true; });
    const lg = el('div', 'ai-legend'); const it = (sty, txt) => { const sp = el('span'); const i = el('i'); Object.assign(i.style, sty); sp.append(i, document.createTextNode(txt)); return sp; };
    lg.append(it({ color: dash.colors[0] }, '20-snitt'), it({ color: dash.colors[1] }, '50-snitt'), it({ color: dash.colors[2], borderTopStyle: 'dashed' }, 'VWAP (fra 00:00 UTC)'), it({ color: 'var(--cds-chart-muted)', borderTopStyle: 'dashed' }, 'Gårsdagens topp/bunn'));
    const mk = el('span'); mk.append(el('b', 'ai-pos', '▲'), el('b', 'ai-neg', '▼'), document.createTextNode(' Utløste oppsett')); lg.append(mk);
    box.append(lg, el('p', 'ai-muted', 'Tider i norsk tid. Stiplede vertikale linjer markerer ny døgn (00:00 UTC), da gårsdagens topp/bunn og VWAP nullstilles.'));
  }
  function renderCalc(s, P, sel) {
    const box = document.getElementById('dt-calc');
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('dt-calc') || '{}'); } catch (e) { /* ingen lagring */ }
    const src = DTS.calc || (sel ? { entry: sel.entry != null ? sel.entry : sel.ref, stop: sel.stop, dir: sel.dir } : { entry: P, stop: null, dir: 1 });
    const v = { acct: saved.acct || 1000, risk: saved.risk || 1, entry: src.entry, stop: src.stop };
    const inp = (lab, key, step, help) => { const w = el('label', 'dt-in'); w.append(el('span', 'ai-muted', lab)); const i = el('input'); i.type = 'number'; i.step = step; i.inputMode = 'decimal'; i.value = v[key] != null && isFinite(v[key]) ? +(+v[key]).toPrecision(['entry', 'stop'].includes(key) ? 6 : 8) : ''; i.dataset.k = key; w.append(i); if (help) w.append(el('span', 'ai-cap ai-muted', help)); return w; };
    const form = el('div', 'dt-form'); form.append(inp('Kontostørrelse (USDT)', 'acct', 'any'), inp('Risiko per handel (%)', 'risk', '0.1', '1 % er vanlig maks'), inp('Inngang', 'entry', 'any'), inp('Stopp', 'stop', 'any'));
    const out = el('dl', 'ai-kv');
    const calc = () => { const g = k => parseFloat((form.querySelector(`[data-k="${k}"]`).value || '').replace(',', '.'));
      const acct = g('acct'), rk = g('risk'), e = g('entry'), st = g('stop'); try { localStorage.setItem('dt-calc', JSON.stringify({ acct, risk: rk })); } catch (er) { /* ingen lagring */ }
      out.replaceChildren(); const row = (a, b, cls) => out.append(el('dt', null, a), el('dd', cls, b));
      if (!(acct > 0 && rk > 0 && e > 0 && st > 0) || e === st) { row('Fyll inn alle feltene', '–'); return; }
      const dir = e > st ? 1 : -1, per = Math.abs(e - st), riskAmt = acct * rk / 100, qty = riskAmt / per, notional = qty * e, fee = notional * (DT.P.fee + DT.P.slip) * 2;
      row('Retning', dir > 0 ? 'Long (stopp under inngang)' : 'Short (stopp over inngang)', dir > 0 ? 'ai-pos' : 'ai-neg');
      row('Du risikerer', `${nf(riskAmt, { maximumFractionDigits: 2 })} USDT (${nf(per / e * 100, { maximumFractionDigits: 2 })} % kursbevegelse)`);
      row('Posisjonsstørrelse', `${nf(qty, { maximumSignificantDigits: 5 })} ${s}`); row('Posisjonsverdi', `${nf(notional, { maximumFractionDigits: 2 })} USDT`);
      const lev = notional / acct; row('Giring som trengs', lev <= 1 ? 'Ingen (under kontostørrelsen)' : `${nf(lev, { maximumFractionDigits: 1 })}×`, lev > 5 ? 'ai-neg' : lev > 1 ? 'ai-warn' : null);
      row('Gebyr + glidning (inn og ut)', `ca. ${nf(fee, { maximumFractionDigits: 2 })} USDT (${nf(fee / riskAmt, { maximumFractionDigits: 2 })} R)`);
      row(`Gevinst ved 1R (${price(e + dir * per)})`, `+${nf(riskAmt - fee, { maximumFractionDigits: 2 })} USDT etter gebyr`, 'ai-pos');
      row(`Gevinst ved 2R (${price(e + dir * 2 * per)})`, `+${nf(2 * riskAmt - fee, { maximumFractionDigits: 2 })} USDT etter gebyr`, 'ai-pos');
      row(`Tap ved stopp (${price(st)})`, `−${nf(riskAmt + fee, { maximumFractionDigits: 2 })} USDT inkl. gebyr`, 'ai-neg');
      if (per / e * 100 < 0.4) row('Merk', 'Kort stopp: gebyrene spiser en stor del av gevinsten.', 'ai-warn'); };
    form.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { if (['entry', 'stop'].includes(i.dataset.k)) DTS.calc = { entry: parseFloat(form.querySelector('[data-k="entry"]').value), stop: parseFloat(form.querySelector('[data-k="stop"]').value) }; calc(); }));
    const reset = el('button', 'ai-btn', 'Hent fra valgt oppsett'); reset.type = 'button'; reset.addEventListener('click', () => { DTS.calc = null; renderDay(); });
    box.replaceChildren(el('h2', null, 'Posisjonskalkulator'), el('p', 'ai-muted', 'Regner ut hvor stor posisjonen kan være for at et tap ved stopp skal bli det beløpet du har bestemt deg for å risikere. Gebyr: Binance futures taker 0,05 % + 0,02 % glidning per side. Kontostørrelse og risiko huskes i denne nettleseren.'), form, reset, out);
    calc();
  }
  function renderDayWatch(s) {
    const box = document.getElementById('dt-watch'); const tw = el('div', 'ai-tablewrap'), tb = el('table', 'ai-table'), hr = el('tr');
    ['Coin', 'Kurs', '1t-trend', 'Status', 'Oppsett'].forEach((h, i) => hr.append(el('th', i === 0 || i >= 3 ? 'l' : null, h))); const th = el('thead'); th.append(hr); tb.append(th); const bd = el('tbody');
    state.list.forEach(sym => { const L = DTS.live[sym]; if (!L) return; const tr = el('tr'); tr.style.cursor = 'pointer'; if (sym === s) tr.className = 'hl'; tr.addEventListener('click', () => dash.setParams({ coin: sym }));
      const best = L.items.slice().sort((a, b) => ({ 'utløst': 0, 'åpen': 1, 'følg': 2 }[a.status] - { 'utløst': 0, 'åpen': 1, 'følg': 2 }[b.status]))[0];
      tr.append(el('td', 'l', `${NAMES[sym]} (${sym})`), el('td', null, price(curPrice(sym))), el('td', L.bias > 0 ? 'ai-pos' : L.bias < 0 ? 'ai-neg' : 'ai-neu', L.bias > 0 ? 'Opp' : L.bias < 0 ? 'Ned' : 'Sidelengs'),
        el('td', 'l ' + (best ? DT_ST[best.status][1] : 'ai-muted'), best ? DT_ST[best.status][0] : 'Ingenting nær'), el('td', 'l', best ? `${best.dir > 0 ? 'Long' : 'Short'} – ${DT.TYPES[best.type].short}${L.items.length > 1 ? ` (+${L.items.length - 1})` : ''}` : '–')); bd.append(tr); });
    tb.append(bd); tw.append(tb); box.replaceChildren(el('h2', null, 'Alle coins nå'), el('p', 'ai-muted', 'Trykk på en rad for å bytte coin.'), tw);
  }
  function renderDayRecent(s, L) {
    const box = document.getElementById('dt-recent'); const rec = L.recent.slice().reverse();
    const tw = el('div', 'ai-tablewrap'), tb = el('table', 'ai-table'), hr = el('tr'); ['Tid', 'Oppsett', 'Inngang', 'Stopp', 'Utfall'].forEach((h, i) => hr.append(el('th', i < 2 ? 'l' : null, h))); const th = el('thead'); th.append(hr); tb.append(th); const bd = el('tbody');
    const HOW = { 'mål': 'Mål 2R nådd', stopp: 'Stoppet ut', tid: 'Tidsstopp' };
    rec.forEach(t => { const tr = el('tr'); const res = t.state === 'lukket' ? `${HOW[t.how]} (${fR(t.R)})` : t.state === 'åpen' ? `Åpen (${fR(t.curR)})` : t.state === 'venter' ? 'Utløst nå' : 'Ugyldig (åpnet forbi stopp)';
      tr.append(el('td', 'l', `${dshort(t.t)} ${hm(t.t + DT.M15)}`), el('td', 'l ' + (t.dir > 0 ? 'ai-pos' : 'ai-neg'), `${t.dir > 0 ? 'Long' : 'Short'} – ${DT.TYPES[t.type].short}`), el('td', null, price(t.entry != null ? t.entry : t.ref)), el('td', null, price(t.stop)), el('td', t.state === 'lukket' ? sgnCls(t.R) : 'ai-neu', res)); bd.append(tr); });
    tb.append(bd); tw.append(tb);
    const closed = rec.filter(t => t.state === 'lukket'), sum = closed.reduce((a, t) => a + t.R, 0);
    box.replaceChildren(el('h2', null, 'Oppsett siste 48 timer'), el('p', 'ai-muted', closed.length ? `${closed.length} avsluttede handler, sum ${fR(sum)} etter gebyr. Tidspunkt = når 15-min candlen lukket.` : 'Tidspunkt = når 15-min candlen lukket.'), rec.length ? tw : el('p', 'ai-muted', 'Ingen oppsett siste 48 timer.'));
  }
  function renderDayBT(s) {
    const box = document.getElementById('dt-bt'); const D = dash.data('daytrade');
    if (D.status !== 'ok' || !D.data || !D.data.ALL) { box.replaceChildren(el('h2', null, 'Har oppsettene tjent penger?'), el('p', 'ai-muted', D.status === 'loading' ? 'Laster backtest …' : 'Backtesten er ikke regnet ennå. Den lages automatisk ved neste oppdatering.')); return; }
    const bt = D.data, scope = state.dtScope === 'ALL' || !bt.coins[s] ? 'ALL' : s, S = scope === 'ALL' ? bt.ALL : bt.coins[s];
    const head = el('div', 'ai-row'); head.append(el('h2', null, 'Har oppsettene tjent penger?'));
    const seg = el('div', 'ai-seg'); [[s, NAMES[s]], ['ALL', 'Alle coins']].forEach(([k, lab]) => { const b = el('button', null, lab); b.type = 'button'; b.setAttribute('aria-pressed', k === scope ? 'true' : 'false'); b.addEventListener('click', () => { state.dtScope = k; renderDayBT(s); }); seg.append(b); }); head.append(seg);
    const tw = el('div', 'ai-tablewrap'), tb = el('table', 'ai-table'), hr = el('tr');
    ['Oppsett', 'Handler', 'Treff', 'Snitt per handel', 'Første 8 mnd', 'Siste 4 mnd', 'Sum', 'Verste nedtur', 'Vurdering'].forEach((h, i) => hr.append(el('th', i === 0 || i === 8 ? 'l' : (i === 6 || i === 7 ? 'ai-hide-sm' : null), h))); const th = el('thead'); th.append(hr); tb.append(th); const bd = el('tbody');
    DT.KEYS.forEach(k => { const z = S[k]; if (!z) return; const a = z.all, [vt, vc] = DT_VERD[z.verdict]; const tr = el('tr');
      tr.append(el('td', 'l ' + (k.endsWith('L') ? 'ai-pos' : 'ai-neg'), `${k.endsWith('L') ? 'Long' : 'Short'} – ${DT.TYPES[k.slice(0, 2)].short}`), el('td', null, String(a.n || 0)), el('td', null, a.n ? share(a.win) : '–'),
        el('td', sgnCls(a.exp), a.n ? fR(a.exp) : '–'), el('td', sgnCls(z.is.exp), z.is.n ? fR(z.is.exp) : '–'), el('td', sgnCls(z.oos.exp), z.oos.n ? fR(z.oos.exp) : '–'), el('td', 'ai-hide-sm ' + sgnCls(a.sum), a.n ? fR(a.sum, 1) : '–'), el('td', 'ai-hide-sm ai-neg', a.n ? fR(-a.dd, 1) : '–'), el('td', 'l ' + vc, vt)); bd.append(tr); });
    tb.append(bd); tw.append(tb);
    const good = DT.KEYS.filter(k => S[k] && S[k].verdict === 'good').map(k => `${k.endsWith('L') ? 'long' : 'short'} ${DT.TYPES[k.slice(0, 2)].short.toLowerCase()}`);
    const lead = el('p', 'ai-summary', good.length ? `Lønnsomme i backtesten for ${scope === 'ALL' ? 'alle coins samlet' : NAMES[s]}: ${good.join(', ')}. Bare disse sender push-varsel.` : `Ingen av oppsettene har vært tydelig lønnsomme etter gebyr for ${scope === 'ALL' ? 'alle coins samlet' : NAMES[s]} siste 12 måneder. Da sendes ingen daytrade-varsler.`);
    const how = el('details', 'ai-more'); how.append(el('summary', null, 'Slik er backtesten laget'));
    const ul = el('ul', 'ai-list');
    [`Periode: ${dfmt(bt.from)}–${dfmt(bt.to)}, 15-min candles fra Binance. Regnet ${new Date(bt.built).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`,
     'Nøyaktig samme kode som live-visningen. Oppsettet avgjøres på lukket 15-min candle; inngang på åpningen av neste candle.',
     'Stopp som vist i oppsettet, mål 2R, ellers ut etter 6 timer (24 candles). Treffer stopp og mål samme candle, teller stopp. Åpner kursen forbi stoppen, fylles den på åpningen.',
     `Gebyr: ${nf((DT.P.fee) * 100, { maximumFractionDigits: 2 })} % + ${nf(DT.P.slip * 100, { maximumFractionDigits: 2 })} % glidning per side (Binance futures taker). Oppsett med stopp under ${nf(DT.P.minStopPct, { maximumFractionDigits: 2 })} % tas ikke, fordi gebyrene da spiser for mye.`,
     'R = risikoen i handelen. +0,10 R per handel betyr at du i snitt tjente 10 % av det du risikerte, etter gebyr.',
     'Én handel av hver type og retning om gangen per coin. Parametrene er bestemt på forhånd og ikke justert etter resultatene.',
     '«Lønnsom» krever positivt resultat både de første 8 og de siste 4 månedene, minst 20 + 10 handler, og at gevinsten ikke er forklart av tilfeldigheter alene. Ingen garanti for at det fortsetter.',
     'Ikke med: finansieringsrente på futures, og at markedet kan bevege seg mens du legger inn ordren.'].forEach(t => ul.append(el('li', null, t)));
    how.append(ul);
    box.replaceChildren(head, lead, tw, how);
    // kumulativt resultat (alle coins samlet)
    if (bt.curve) { const cw = el('div'); cw.style.position = 'relative'; box.append(el('h3', null, 'Samlet resultat over tid (alle coins, i R)'), cw);
      const W = Math.max(300, box.clientWidth || 600), H = 220; const keys = DT.KEYS.filter(k => bt.curve[k] && bt.curve[k].length); const len = d3.max(keys, k => bt.curve[k].length);
      const all = keys.flatMap(k => bt.curve[k]); const y = d3.scaleLinear([Math.min(0, d3.min(all)), Math.max(0, d3.max(all))], [H - 22, 8]).nice();
      const svg = d3.select(cw).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Kumulativt resultat i R per oppsett');
      const m = { l: 44, r: 8 }; const x = d3.scaleLinear([0, len - 1], [m.l, W - m.r]);
      y.ticks(5).forEach(v => { svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', v === 0 ? 'var(--cds-chart-axis)' : 'var(--cds-chart-grid)'); svg.append('text').attr('x', m.l - 6).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 'var(--cds-font-size-caption)').attr('fill', 'var(--color-fg-muted)').text((v < 0 ? '−' : '') + nf(Math.abs(v), { maximumFractionDigits: 0 }) + ' R'); });
      [0, Math.floor(len / 2), len - 1].forEach(i => svg.append('text').attr('x', x(i)).attr('y', H - 4).attr('text-anchor', i === 0 ? 'start' : i === len - 1 ? 'end' : 'middle').attr('font-size', 'var(--cds-font-size-caption)').attr('fill', 'var(--color-fg-muted)').text(dshort(bt.from + i * DAY)));
      const cols = { pbL: dash.colors[0], pbS: dash.colors[0], swL: dash.colors[1], swS: dash.colors[1], boL: dash.colors[2], boS: dash.colors[2] };
      keys.forEach(k => svg.append('path').datum(bt.curve[k]).attr('d', d3.line().x((v, i) => x(i)).y(v => y(v))).attr('fill', 'none').attr('stroke', cols[k]).attr('stroke-width', 1.6).attr('stroke-dasharray', k.endsWith('S') ? '5 3' : null));
      const lg = el('div', 'ai-legend'); keys.forEach(k => { const sp = el('span'); const i = el('i'); i.style.color = cols[k]; if (k.endsWith('S')) i.style.borderTopStyle = 'dashed'; sp.append(i, document.createTextNode(`${k.endsWith('L') ? 'Long' : 'Short'} ${DT.TYPES[k.slice(0, 2)].short.toLowerCase()}`)); lg.append(sp); }); box.append(lg); }
  }

  // ------------------------------------------------------------------ backtest av status og varsler
  const BT_ROWS = ['clearBuy', 'buyStart', 'waitStart', 'noneStart', 'sellStart', 'clearSell'];
  const BT_SHORT = { clearBuy: 'Kjøpsvarsel', buyStart: 'Blir «Mulig kjøpsoppsett»', waitStart: 'Blir «Avvent bekreftelse»', noneStart: 'Blir «Ingen tydelig mulighet»', sellStart: 'Blir «Mulig salgs-/exit-oppsett»', clearSell: 'Salgsvarsel' };
  const BT_VERDICT = { better: ['Bedre enn en vanlig dag', 'ai-pos'], worse: ['Dårligere enn en vanlig dag', 'ai-neg'], same: ['Ingen tydelig fordel', 'ai-neu'], few: ['For få til å si noe', 'ai-neu'], none: ['–', 'ai-muted'] };
  function renderBacktest(c) {
    const box = document.getElementById('sg-backtest'); if (!box) return;
    const B = dash.data('backtest');
    if (B.status === 'loading') { box.replaceChildren(el('h2', null, 'Har statusene og varslene fungert?'), el('p', 'ai-muted', 'Laster backtest …')); return; }
    if (B.status !== 'ok' || !B.data || !B.data.summary) { box.replaceChildren(el('h2', null, 'Har statusene og varslene fungert?'), el('p', 'ai-muted', 'Backtesten er ikke regnet ennå. Den lages automatisk ved neste oppdatering.')); return; }
    const bt = B.data, scope = state.btScope === 'coin' && bt.summary[c.sym] ? c.sym : 'ALL', S = bt.summary[scope];
    const head = el('div', 'ai-row'); head.append(el('h2', null, 'Har statusene og varslene fungert?'));
    const seg = el('div', 'ai-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Utvalg');
    [['ALL', 'Alle coins'], ['coin', NAMES[c.sym]]].forEach(([k, lab]) => { const b = el('button', null, lab); b.type = 'button'; b.setAttribute('aria-pressed', (k === 'ALL') === (scope === 'ALL') ? 'true' : 'false'); b.addEventListener('click', () => { state.btScope = k; renderBacktest(c); }); seg.append(b); });
    head.append(seg);
    const who = scope === 'ALL' ? `alle coins (${ORDER.filter(s => bt.coins.includes(s)).join(', ')})` : NAMES[c.sym];
    const vb = S.clearBuy, vs = S.clearSell;
    const sent = (g, word) => g && g.h[30].n ? `${word} gikk riktig vei etter 30 dager i ${share(g.h[30].hit)} av ${g.h[30].n} tilfeller, mot ${share(g.h[30].base)} for en vanlig dag – ${BT_VERDICT[g.verdict][0].toLowerCase()}.` : `Ingen ${word.toLowerCase()} med kjent 30-dagersutfall.`;
    const lead = el('p', 'ai-summary', `Backtest for ${who}, ${dfmt(bt.from)}–${dfmt(bt.to)}. ${sent(vb, 'Kjøpsvarslene')} ${sent(vs, 'Salgsvarslene')}`);
    const warn = !bt.complete ? el('div', 'ai-warnbox', `Backtesten er ikke ferdig regnet (kommet til ${dfmt(bt.to)}). Resten regnes ved de neste oppdateringene.`) : null;
    const tw = el('div', 'ai-tablewrap'); const tb = el('table', 'ai-table'); const hr = el('tr');
    ['Når', 'Antall (uavh.)', 'Riktig retning 30 d (90 %-int.)', 'Vanlig dag', 'Median 7 d', 'Median 30 d', 'Median 90 d', 'Mål før stopp', 'Vurdering'].forEach((h, i) => hr.append(el('th', i === 0 || i === 8 ? 'l' : (i === 4 || i === 6 ? 'ai-hide-sm' : null), h)));
    const th = el('thead'); th.append(hr); tb.append(th); const bd = el('tbody');
    BT_ROWS.forEach(k => { const g = S[k]; if (!g) return; const z = g.h[30], tr = el('tr'); if (k.startsWith('clear')) tr.style.fontWeight = '600';
      const dirTxt = g.dir > 0 ? 'høyere' : g.dir < 0 ? 'lavere' : 'høyere';
      const rc = g.race ? `${share(g.race.tgt)} / ${share(g.race.stop)}` : '–'; const [vt, vc] = BT_VERDICT[g.verdict];
      tr.append(el('td', 'l ' + (g.dir > 0 ? 'ai-pos' : g.dir < 0 ? 'ai-neg' : ''), BT_SHORT[k]), el('td', null, z.n ? `${z.n} (≈${z.nEff})` : '0'),
        el('td', null, z.n ? `${shareCi(z.hit, z.ci)} ${dirTxt}` : '–'), el('td', null, share(z.base)),
        el('td', 'ai-hide-sm ' + sgnCls(g.h[7].med * (g.dir || 1)), pct(g.h[7].med)), el('td', sgnCls(z.med * (g.dir || 1)), pct(z.med)), el('td', 'ai-hide-sm ' + sgnCls(g.h[90].med * (g.dir || 1)), pct(g.h[90].med)),
        el('td', null, g.dir ? rc : '–'), el('td', 'l ' + vc, vt)); bd.append(tr); });
    tb.append(bd); tw.append(tb);
    const how = el('details', 'ai-more'); how.append(el('summary', null, 'Slik er backtesten laget'));
    const ul = el('ul', 'ai-list');
    ['For hver dag siden 1. januar 2019 er hele analysen kjørt på nytt med bare kursene som var kjent den dagen – nivåer, oppsettscore, scenario-motor og status regnes som om det var den dagen. Ingen framtidige data brukes (testet automatisk).',
     '«Kjøpsvarsel» og «Salgsvarsel» er nøyaktig samme regel som sender de tydelige push-varslene: status blir kjøp/salg, eller WaveTrend-signal mens kursen står ved støtte/motstand.',
     'Statusradene måler fra første dag en status dukker opp (ikke hver dag den varer). Utfall regnes fra dagslukk den dagen.',
     '«Riktig retning» betyr høyere kurs for kjøp og lavere for salg. For «Avvent» og «Ingen» vises andelen høyere. «Vanlig dag» er samme andel for alle dager i perioden.',
     '«Mål før stopp»: innen 30 dager, ble første mål (neste motstand) nådd før stoppnivået? Ved salg: nådde kursen må-holde-støtten før neste motstand? Skjer begge samme dag, teller stopp.',
     'Signaler som kommer tett etter hverandre er ikke uavhengige. «Uavh.» er antall 30-dagersperioder med minst ett tilfelle, og intervallet er regnet ut fra dette.',
     'Samme regler er brukt for hele perioden, men reglene er laget i 2026 med kjennskap til markedet – resultatene kan derfor være litt bedre enn de ville vært i sanntid.'].forEach(t => ul.append(el('li', null, t)));
    how.append(ul);
    // siste varsler
    const rec = (bt.recent || []).filter(r => scope === 'ALL' || r.sym === c.sym).slice(0, 15);
    const tw2 = el('div', 'ai-tablewrap'); const t2 = el('table', 'ai-table'); const h2 = el('tr');
    ['Dato', 'Coin', 'Varsel', 'Kurs', '7 d', '30 d', '90 d', 'Mål / stopp'].forEach((h, i) => h2.append(el('th', i < 3 ? 'l' : (i === 6 ? 'ai-hide-sm' : null), h))); const th2 = el('thead'); th2.append(h2); t2.append(th2);
    const b2 = el('tbody'); const RACE = { tgt: 'Mål nådd', stop: 'Stopp', none: 'Ingen av delene' };
    rec.forEach(r => { const tr = el('tr'); const pend = v => v == null ? 'pågår' : pct(v);
      tr.append(el('td', 'l', dfmt(r.t)), el('td', 'l', r.sym), el('td', 'l ' + (r.dir > 0 ? 'ai-pos' : 'ai-neg'), `${r.dir > 0 ? 'Kjøp' : 'Salg'}${r.kind === 'w' ? ' (WaveTrend)' : ''}`), el('td', null, price(r.price)),
        el('td', sgnCls(r.r7 * r.dir), pend(r.r7)), el('td', sgnCls(r.r30 * r.dir), pend(r.r30)), el('td', 'ai-hide-sm ' + sgnCls(r.r90 * r.dir), pend(r.r90)), el('td', null, r.race ? RACE[r.race] : 'pågår')); b2.append(tr); });
    t2.append(b2); tw2.append(t2);
    box.replaceChildren(...[head, lead, warn, tw, el('p', 'ai-muted', 'Grønt = kursen gikk i signalets retning (opp for kjøp, ned for salg), rødt = motsatt. Historiske resultater er ingen garanti for framtiden. Ikke finansiell rådgivning.'), how,
      el('h3', null, scope === 'ALL' ? 'Siste varsler i backtesten' : `Siste varsler for ${NAMES[c.sym]}`), rec.length ? tw2 : el('p', 'ai-muted', 'Ingen varsler i perioden.')].filter(Boolean));
  }

  // ------------------------------------------------------------------ avanserte data
  function renderAdvanced() {
    const c = cur(); if (!c) return; const box = document.getElementById('av-body'); const k = c.keys || {}, ex = c.ex || {};
    const card = (title, sub, ...nodes) => { const d = el('div', 'ai-card'); const h = el('div'); h.append(el('h2', null, title)); if (sub) h.append(el('p', 'ai-muted', sub)); d.append(h, ...nodes); return d; };
    const table = (heads, rows, leftCols = [0]) => { const tw = el('div', 'ai-tablewrap'); const tb = el('table', 'ai-table'); const hr = el('tr'); heads.forEach((h, i) => hr.append(el('th', leftCols.includes(i) ? 'l' : null, h))); const th = el('thead'); th.append(hr); tb.append(th); const bd = el('tbody');
      rows.forEach(r => { const tr = el('tr'); if (r.hl) tr.className = 'hl'; r.cells.forEach((v, i) => { const td = el('td', (leftCols.includes(i) ? 'l ' : '') + (r.cls && r.cls[i] || ''), v); tr.append(td); }); bd.append(tr); }); tb.append(bd); tw.append(tb); return tw; };
    const ci = l => l.ci30 ? `${l.p30} % (${l.ci30[0]}–${l.ci30[1]})` : l.p30 != null ? l.p30 + ' %' : '–';
    const levels = card('Alle støtte- og motstandsnivåer', `Nivåer gruppert fra vendepunkter, glidende snitt, Fibonacci, volumsoner og runde tall. «Nådd innen 30 d» er en historisk basisrate for en like stor bevegelse (målt i ATR) i ${k.regime || 'samme regime'} – ikke en prognose. Intervallet bygger på ca. ${(c.lv.find(l => l.nEff30) || {}).nEff30 || '–'} uavhengige 30-dagersperioder.`,
      table(['Nivå', 'Avstand', 'Styrke', 'Rolle', 'Nådd innen 7 d', 'Nådd innen 30 d (90 %-int.)', 'Status', 'Hva nivået består av'], [...c.lv].sort((a, b) => b.p - a.p).map(l => ({ hl: !!l.role, cells: [price(l.p), pct(l.d), `${l.strength} (${l.score})`, l.role || '', l.p7 != null ? l.p7 + ' %' : '–', ci(l), l.bo || '', l.src], cls: [null, sgnCls(l.d), null, null, null, null, null, 'wrap'] })), [0, 3, 6, 7]));
    const brk = card('Utbrudd og brudd siste 30 dager', 'Bekreftet betyr minst to dagslukk på riktig side av nivået uten å falle tilbake.', c.breaks.length ? (() => { const ul = el('ul', 'ai-list'); c.breaks.forEach(b => ul.append(el('li', null, b.text))); return ul; })() : el('p', 'ai-muted', 'Ingen.'));
    const why = (arr) => { const ul = el('ul', 'ai-list'); arr.forEach(w => { const li = el('li'); li.append(el('span', w.s > 0 ? 'ai-pos' : w.s < 0 ? 'ai-neg' : 'ai-neu', w.s > 0 ? '+ ' : w.s < 0 ? '− ' : '~ '), document.createTextNode(w.t)); ul.append(li); }); return ul; };
    const trend = card('Langsiktig trend og kortsiktig swing (v1-modellen)', null,
      el('p', 'ai-cap', `Trendscore ${c.long.score} (${c.long.label}) – ${c.long.phase}.`), why(c.long.why),
      el('p', 'ai-cap', `Swing: ${c.swing.bias} (bull ${c.swing.bull} / bear ${c.swing.bear}). ${c.swing.context || ''}`), c.swing.why.length ? why(c.swing.why) : el('p', 'ai-muted', 'Ingen swing-signaler.'),
      el('p', 'ai-cap', `Struktur: ${c.structure.label}. ${c.structure.text}`));
    const scen = card('Scenarioer (tekst)', null, (() => { const ul = el('ul', 'ai-list'); [c.scen.here, c.scen.bull, c.scen.bear, c.scen.trend, c.scen.major].filter(Boolean).forEach(t => ul.append(el('li', null, t))); return ul; })(),
      k.firstMajor ? el('p', 'ai-muted', `Hva nås først innen 30 dager (avgjørende motstand / støtte / ingen): ${k.firstMajor.up} / ${k.firstMajor.down} / ${k.firstMajor.none} %, ca. ${k.firstMajor.nEff} uavhengige perioder.`) : el('span'));
    const tg = card('Estimerte mål, retningsscore og handelsplan', 'Mål 1–3 er de nærmeste sterke motstandsnivåene over prisen, støtte 1–3 tilsvarende under. Handelsplanen er et regneeksempel, ikke en anbefaling.',
      table(['Nivå', 'Pris', 'Avstand', 'Nådd innen 7 d', 'Nådd innen 30 d', 'Styrke'], (ex.targets || []).map(t => ({ cells: [t.label, price(t.price), pct(t.dist), t.p7 != null ? t.p7 + ' %' : '–', ci(t), String(t.score)], cls: [null, null, sgnCls(t.dist)] }))),
      (() => { const kv = el('dl', 'ai-kv'); const r = (a, b) => kv.append(el('dt', null, a), el('dd', null, b));
        r('Retningsscore (v1)', `${ex.bias.score} – ${ex.bias.label}`); r('Begrunnelse', ex.bias.why); r('Kjøpssone (må-holde til +0,5 ATR)', ex.entry ? `${price(ex.entry[0])}–${price(ex.entry[1])}` : '–'); r('Stopp / ugyldiggjøring', ex.stop ? `${price(ex.stop)} (${pct(ex.stopD)})` : '–');
        r('Risiko/gevinst til mål 1 / mål 2', `${nf(ex.rr1, { maximumFractionDigits: 1 })} / ${nf(ex.rr2, { maximumFractionDigits: 1 })}`); r('Forventet range 7 d (±1σ)', `${price(ex.r7[0])}–${price(ex.r7[1])}`); r('Forventet range 30 d (±1σ)', `${price(ex.r30[0])}–${price(ex.r30[1])}`); r('Vektet 30 d-estimat', `${price(ex.est30)} (${pct(ex.est30d)})`); r('Daglig volatilitet (90 d)', `${nf(ex.volDaily, { maximumFractionDigits: 2 })} %`); return kv; })());
    const ind = card('Indikatorverdier', `Dagslukk ${c.asOfStr}.`, table(['Indikator', 'Verdi'], [['Pris (dagslukk)', price(c.price)], ['Endring 1 / 7 / 30 d', `${pct(c.chg.d1)} / ${pct(c.chg.d7)} / ${pct(c.chg.d30)}`], ['Fra 52-ukers topp', pct(c.chg.dd52)], ['RSI 14 (døgn / 4t / uke)', `${nf(c.ind.rsi, { maximumFractionDigits: 1 })} / ${nf(c.ind.rsi4h, { maximumFractionDigits: 1 })} / ${nf(c.ind.wRsi, { maximumFractionDigits: 0 })}`], ['WaveTrend (døgn / 4t)', `${nf(c.ind.wt1d, { maximumFractionDigits: 0 })} / ${nf(c.ind.wt4h, { maximumFractionDigits: 0 })}`], ['EMA 20 / 50 / 200', `${price(c.ind.e20)} / ${price(c.ind.e50)} / ${price(c.ind.e200)}`], ['Avstand til 20D EMA', `${nf(c.ind.ext, { maximumFractionDigits: 1 })} ATR`], ['Money flow (døgn)', nf(c.ind.mf1d, { maximumFractionDigits: 1 })], ['ATR 14', `${price(c.atrAbs)} (${nf(c.atrPct, { maximumFractionDigits: 1 })} %)`], ['Relativt volum 5 d / 50 d', c.ind.relVol != null ? pct((Math.exp(c.ind.relVol) - 1) * 100, 0) : '–'], ['Volatilitet mot siste år', c.ind.volReg != null ? pct((Math.exp(c.ind.volReg) - 1) * 100, 0) : '–'], ['Kurshistorikk', `${c.histYears} år (fra ${c.firstDate})`]].map(r => ({ cells: r }))));
    const W = { trend: 'Langsiktig trendscore / 100 (pris mot 200D EMA, golden/death cross, helning, bull market support band, ukentlig RSI og WaveTrend, 50-ukers snitt, avstand fra 52-ukers topp).', mom: 'Snitt av WaveTrend (kryss fra ekstremsone ±1, ellers over/under signallinjen ±0,5), RSI-endring siste 3 dager / 8, og MACD-histogram (fortegn og retning).', vol: '(Volum på opp-dager − volum på ned-dager) / totalvolum, siste 10 dager.', str: 'Høyere topper og bunner +1, lavere −1, blandet 0.', lvl: 'Bekreftet utbrudd siste 7 d +0,75 / brudd −0,75; innen 1 ATR over må-holde-støtte +0,6; innen 1 ATR under motstand −0,6; ellers forholdet mellom avstand opp og ned.', reg: 'Altcoins: BTC over/under 200D EMA (±0,5) + 0,5 · BTC-trendscore. BTC: bredde (andel coins over 200D) og egen trendscore.', hist: '(Andel positive lignende tilfeller − basisrate) / 0,2, vektet ned med n/(n+10) når utvalget er lite.' };
    const method = card('Metode: oppsettscore og statuser', 'Score = 50 + 50 · Σ(vekt · faktor) / 100, der hver faktor er mellom −1 og +1. Vektene er satt på forhånd og ikke tilpasset historiske utfall.',
      table(['Faktor', 'Vekt', 'Verdi nå', 'Beregning'], c.comps.map(x => ({ cells: [x.label, String(x.w), nf(x.s, { maximumFractionDigits: 2 }), W[x.key]], cls: [null, null, sgnCls(x.s), 'wrap'] })), [0, 3]),
      (() => { const ul = el('ul', 'ai-list'); ['Mulig kjøpsoppsett: score ≥ 60 og (pris innen 1 ATR over må-holde-støtten eller bekreftet utbrudd siste 7 d) og momentum-trigger opp og pris over stopp.', 'Mulig salgs-/exit-oppsett: score ≤ 40 og (pris innen 1 ATR under motstand eller bekreftet brudd) og momentum-trigger ned – eller bekreftet brudd og score ≤ 35.', 'Avvent bekreftelse: noen av vilkårene oppfylt (score ≥ 55 med sone eller trigger, score ≤ 45 med sone eller trigger, ubekreftet brudd ved prisen, eller trigger i nøytral score).', 'Ingen tydelig mulighet: resten.', 'Momentum-trigger opp: WaveTrend krysser opp under −20 siste 3 d, RSI +3 siste 3 d fra under 45, eller MACD-histogram stiger to dager etter fall. Ned tilsvarende.'].forEach(t => ul.append(el('li', null, t))); return ul; })());
    const audit = card('Kvalitetskontroll av sannsynlighetene', 'Gjennomgang av de historiske treffratene i v1 og hva som er endret.',
      (() => { const ul = el('ul', 'ai-list'); [
        'Utvalg: v1 brukte de siste 1000 dagene. Nå brukes hele historikken på Binance i samme regime (over/under 200D EMA). Antall startdager og uavhengige perioder vises for hvert tall.',
        `Overlapp: hver dag ble talt som et eget tilfelle, selv om 30-dagersvinduene overlapper nesten helt. Det ga falsk presisjon. Nå oppgis et 90 %-intervall basert på antall uavhengige 30-dagersperioder (n/30; for ${c.sym} ca. ${(c.lv.find(l => l.nEff30) || {}).nEff30 || '–'}), og prosentene er avrundet.`,
        'Look-ahead: beregningene bruker bare pris og indikatorer kjent på hver startdag; utfallet måles framover. Ingen look-ahead funnet. Den historiske scenario-motoren er testet ved å beregne indikatorene på nytt med alle senere data fjernet.',
        'Regime: treffraten sammenligner bare dager med samme plassering mot 200D EMA. Den tar ikke hensyn til om nivået faktisk er støtte/motstand – det er en ren volatilitetsbasert basisrate for en like stor bevegelse.',
        'Forveksling med prognose: teksten «nådd i 60 % av lignende tilfeller» er endret til «historisk basisrate» med intervall og antall perioder.',
        'Datagrunnlag: tallene stemmer med kursdataene (kontrollert mot Binance-candles). For POL finnes bare ca. to års historikk, så usikkerheten er større.'].forEach(t => ul.append(el('li', null, t))); return ul; })());
    const feats = card('Metode: historisk scenario-motor', 'Kriterier, skala og vekt for likhetssøket.', table(['Kriterium', 'Vekt'], (c.analog && c.analog.criteria || []).map(f => ({ cells: [f.label, nf(f.w, { maximumFractionDigits: 2 })] }))),
      el('p', 'ai-muted', 'Hard filter: samme regime (pris over/under 200D EMA) og for altcoins samme BTC-regime. Maks 40 tilfeller med likhet ≥ 50 % (senkes til 35 % hvis færre enn 12). Utfall: avkastning etter 1, 7 og 30 dager fra dagslukk, største opp- og nedgang innen 30 dager, og om nærmeste kjente støtte/motstand ble brutt.'));
    box.replaceChildren(levels, el('div', 'ai-grid2'), tg, ind, method, el('div', 'ai-grid2'));
    box.children[1].append(trend, el('div', 'ai-stack')); box.children[1].lastChild.append(brk, scen);
    box.lastChild.append(feats, audit);
  }

  // ------------------------------------------------------------------ læring: «Hvorfor?»
  const LEARN = {
    wt: { t: 'WaveTrend', what: 'En oscillator som måler hvor langt prisen er fra sitt eget glidende snitt, justert for normal svingning. Den blå linjen (WT1) og en treg signallinje (WT2) krysser hverandre når momentum snur.', why: 'Kryss fra ekstremsonene (under −53 eller over +53) viser at et kraftig salgs- eller kjøpspress begynner å avta – ofte nær lokale bunner eller topper.', fake: 'I sterke trender kan WaveTrend bli liggende i ekstremsonen lenge, og kryss mot trenden gir ofte bare korte rekyler. Små kryss nær null er for det meste støy.', spot: 'Se etter et kryss opp under −53 som skjer samtidig som prisen er ved en støtte. Vent gjerne på at prisen lukker over gårsdagens topp før du stoler på signalet.', ev: ['wtBuy', 'wtSell'], now: c => `WaveTrend døgn er ${nf(c.ind.wt1d, { maximumFractionDigits: 0 })} (4t: ${nf(c.ind.wt4h, { maximumFractionDigits: 0 })}). ${c.ind.wt1d < -53 ? 'Det er oversolgt sone.' : c.ind.wt1d > 53 ? 'Det er overkjøpt sone.' : 'Det er innenfor normalsonen.'} ${c.mom.parts[0].t}.` },
    rsi: { t: 'RSI (Relative Strength Index)', what: 'Forholdet mellom gjennomsnittlige oppganger og nedganger siste 14 dager, på en skala fra 0 til 100.', why: 'Over 50 betyr at kjøperne har hatt overtaket; under 30 er oversolgt og over 70 overkjøpt. Divergens (ny bunn i pris, men ikke i RSI) kan varsle at en trend svekkes.', fake: 'Oversolgt kan bli mer oversolgt i en nedtrend. RSI under 30 alene har historisk ikke vært et pålitelig kjøpssignal.', spot: 'Kombiner med nivåer: RSI som snur opp fra under 35 mens prisen holder en støtte er sterkere enn RSI-nivået alene.', ev: ['rsiOS', 'rsiOB'], now: c => `RSI er ${nf(c.ind.rsi, { maximumFractionDigits: 1 })}. ${c.mom.parts[1].t}.` },
    macd: { t: 'MACD', what: 'Forskjellen mellom et raskt (12 d) og et tregt (26 d) glidende snitt, med en signallinje (9 d). Histogrammet er avstanden mellom MACD og signallinjen.', why: 'Når histogrammet krymper og snur, bremser bevegelsen opp – ofte før prisen snur.', fake: 'MACD er treg og gir sene signaler i sidelengs marked, der den kan krysse fram og tilbake.', spot: 'Se etter histogram som har stoppet å falle og stiger to dager på rad, helst samtidig med at prisen holder en støtte.', ev: [], now: c => c.mom.parts[2].t + '.' },
    ema: { t: 'Glidende snitt (EMA 20, 50 og 200)', what: 'Eksponentielle glidende snitt av sluttkursen. 200-dagers snittet regnes som skillet mellom langsiktig opp- og nedtrend.', why: 'Pris over 200D EMA og 50D over 200D (golden cross) kjennetegner opptrender. Snittene fungerer ofte som støtte eller motstand.', fake: 'Kryss mellom snittene kommer sent og kan snu raskt i sidelengs marked.', spot: 'I opptrend: kjøp når prisen faller tilbake til 50D eller 200D EMA og holder. I nedtrend: rekyler mot 200D EMA blir ofte solgt.', ev: ['golden', 'death', 'reclaim', 'lose'], now: c => `Prisen er ${pct(c.ind.d200)} fra 200D EMA og ${pct(c.ind.d50)} fra 50D EMA.` },
    trend: { t: 'Langsiktig trend', what: 'En samlet score (−100 til +100) av åtte kjennetegn: pris mot 200D EMA, golden/death cross, helningen på 200D, «bull market support band», ukentlig RSI og WaveTrend, 50-ukers snitt og avstand fra 52-ukers topp.', why: 'Kjøpsoppsett i retning av hovedtrenden har historisk fungert bedre enn oppsett mot trenden.', fake: 'Trenden snur sent – etter store fall kan scoren fortsatt være positiv en stund.', spot: 'Les fasen (for eksempel «Bedring etter nedtur») sammen med scoren.', ev: ['golden', 'death'], now: c => `Trendscore ${c.long.score} – ${c.long.label.toLowerCase()}. Fase: ${c.long.phase}.` },
    momentum: { t: 'Kortsiktig momentum', what: 'Et snitt av tre ting: WaveTrend, endring i RSI siste tre dager og retningen på MACD-histogrammet.', why: 'Momentum som snur er ofte det som utløser en bevegelse fra et nivå.', fake: 'Momentum kan snu mange ganger i et sidelengs marked.', spot: 'Momentum-trigger: WaveTrend krysser opp under −20, RSI stiger minst 3 poeng fra under 45, eller MACD-histogrammet stiger to dager etter fall.', ev: ['wtBuy', 'wtSell'], now: c => `${c.mom.label}: ${c.mom.parts.map(p => p.t).join(', ')}.` },
    levels: { t: 'Støtte og motstand', what: 'Prisområder der kjøpere (støtte) eller selgere (motstand) tidligere har tatt over. Nivåene lages fra vendepunkter, glidende snitt, Fibonacci, volumsoner og runde tall – jo flere som møtes, jo sterkere nivå.', why: 'Nivåene gir konkrete steder å vurdere kjøp (ved støtte), ta gevinst (ved motstand) og sette stopp (under støtte).', fake: 'Nivåer brytes ofte kort intradag. Et brudd regnes først som bekreftet etter to dagslukk på den andre siden.', spot: 'Et brutt motstandsnivå blir ofte ny støtte – og omvendt. Se etter retest av nivået etter et utbrudd.', ev: [], now: c => { const k = c.keys || {}; return `Må-holde-støtte ${k.mustHold ? price(k.mustHold.p) + ' (' + pct(k.mustHold.d) + ')' : '–'}, neste motstand ${k.nextUp ? price(k.nextUp.p) + ' (' + pct(k.nextUp.d) + ')' : '–'}.`; } },
    volume: { t: 'Volum', what: 'Hvor mye som handles (i USDT). Relativt volum sammenligner de siste 5 dagene med snittet for 50 dager.', why: 'Brudd med høyt volum har større sjanse til å holde. Mer volum på opp-dager enn ned-dager tyder på akkumulering.', fake: 'Volum på én børs (Binance) viser ikke hele markedet, og store enkelthandler kan forstyrre.', spot: 'Se etter et dagslukk over motstand med volum klart over snittet.', ev: [], now: c => c.comps.find(x => x.key === 'vol').text },
    structure: { t: 'Prisstruktur', what: 'Om de siste vendepunktene danner høyere topper og bunner (opptrend), lavere (nedtrend) eller blandet.', why: 'Struktur viser trenden uten forsinkelsen i glidende snitt. Et brudd under siste høyere bunn svekker en opptrend.', fake: 'Vendepunkter kjennes først i ettertid (her: 5 dager), så strukturen kan endre seg brått.', spot: 'Se etter en høyere bunn over forrige bunn etter et fall – et tidlig tegn på at nedtrenden er over.', ev: [], now: c => `${c.structure.label}. ${c.structure.text}` },
    regime: { t: 'Markedsregime', what: 'Den overordnede tilstanden i kryptomarkedet: om Bitcoin er over 200D EMA og hvor mange coins som er i opptrend.', why: 'Altcoins følger Bitcoin i stor grad og faller ofte mer når Bitcoin er svak.', fake: 'Enkelte coins kan bevege seg uavhengig ved egne nyheter.', spot: 'Vær mer forsiktig med kjøpsoppsett i altcoins når Bitcoin er under 200D EMA.', ev: [], now: c => c.comps.find(x => x.key === 'reg').text },
    volatility: { t: 'Volatilitet (ATR)', what: 'Average True Range: gjennomsnittlig dagsbevegelse siste 14 dager. Brukes til å måle avstander til nivåer.', why: 'Avstand målt i ATR gjør at rolige og urolige perioder kan sammenlignes. Stopp bør ligge minst ca. 0,5 ATR fra nivået.', fake: 'Volatiliteten kan endre seg raskt ved nyheter.', spot: 'Høy volatilitet betyr større posisjonsrisiko – mange reduserer størrelsen.', ev: [], now: c => `ATR er ${nf(c.atrPct, { maximumFractionDigits: 1 })} % av prisen per dag.` },
    history: { t: 'Historiske utfall', what: 'Hvordan prisen utviklet seg etter tidligere situasjoner med lignende tekniske kjennetegn (se Historiske scenarioer).', why: 'Gir en pekepinn på spredningen i mulige utfall – ikke en prognose.', fake: 'Få uavhengige tilfeller gir stor usikkerhet, og markedet endrer seg over tid.', spot: 'Se på spredningen (beste/dårligste og største nedtur), ikke bare medianen.', ev: [], now: c => c.comps.find(x => x.key === 'hist').text },
    score: { t: 'Teknisk oppsettscore', what: 'En sammenvekting (0–100) av sju faktorer: trend, momentum, volum, prisstruktur, støtte/motstand, markedsregime og historiske utfall.', why: 'Gir et raskt bilde av om faktorene peker samme vei. Over 60 peker mange faktorer opp, under 40 peker mange ned.', fake: 'Scoren er ikke en sannsynlighet for gevinst, og vektene er skjønnsmessige.', spot: 'Les hvilke faktorer som trekker opp og ned – det er der forklaringen ligger.', ev: [], now: c => `Scoren er ${c.score}. ${c.comps.map(x => `${x.label}: ${(x.s > 0 ? '+' : x.s < 0 ? '−' : '') + Math.round(Math.abs(x.s * x.w) / 2)}`).join(', ')}.` },
    analog: { t: 'Historisk scenario-motor', what: 'Finner dagene i historikken til alle coins i scanneren der 14 tekniske kjennetegn lignet mest på i dag, og ser hva som skjedde etterpå.', why: 'Gir et ærlig bilde av hvor ulikt lignende situasjoner har endt – og om de skilte seg fra en vanlig dag.', fake: 'Likhet i indikatorer betyr ikke samme årsaker. Tilfeller som ligger nær hverandre i tid er ikke uavhengige, derfor vises antall uavhengige perioder og intervaller.', spot: 'Når andelen positive i lignende tilfeller ikke skiller seg fra basisraten, har situasjonen ingen historisk fordel.', ev: [], now: c => c.analog && c.analog.ok ? `${c.analog.n} tilfeller, ca. ${c.analog.nEff} uavhengige perioder, snittlikhet ${c.analog.meanSim} %.` : 'Ingen tilfeller.' },
    status: { t: 'Status', what: 'En regelbasert vurdering med fire utfall: Mulig kjøpsoppsett, Avvent bekreftelse, Mulig salgs-/exit-oppsett og Ingen tydelig mulighet.', why: 'Samler score, plassering mot nivåer og momentum i én tydelig konklusjon.', fake: 'Statusen er ikke en ordre eller garanti. Den sier bare om kriteriene er oppfylt.', spot: 'Sjekk lista under for hvilke vilkår som er oppfylt og hvilke som mangler.', ev: [], now: c => `Status: ${c.status.label}. Oppsettscore ${c.score}.`, extra: c => { const ul = el('ul', 'ai-checks'); [...c.status.buyChecks.map(x => ({ ...x, t: 'Kjøp: ' + x.t })), ...c.status.sellChecks.map(x => ({ ...x, t: 'Salg/exit: ' + x.t }))].forEach(x => { const li = el('li'); li.append(el('span', x.ok ? 'y' : 'n', x.ok ? '✓' : '○'), el('span', null, x.t)); ul.append(li); }); return ul; } } };
  function openWhy(key, sym) {
    const c = state.coins[sym] || cur(); const L = LEARN[key]; if (!L || !c) return;
    const box = document.getElementById('why-body'); const sec = (h, node) => { const s = el('section'); s.append(el('h4', null, h), typeof node === 'string' ? el('p', 'ai-cap', node) : node); return s; };
    const head = el('div', 'ai-row'); head.append(el('h2', null, `${L.t} – ${NAMES[c.sym]}`)); head.firstChild.id = 'why-title'; const x = el('button', 'ai-btn', 'Lukk'); x.type = 'button'; x.addEventListener('click', closeWhy); head.append(x);
    const parts = [head, sec('Hva måler den?', L.what), sec('Hva betyr verdien nå?', L.now(c))];
    if (L.extra) parts.push(sec('Vilkår', L.extra(c)));
    parts.push(sec('Hvorfor er den relevant?', L.why), sec('Hva kan gi falske signaler?', L.fake));
    // konkret historisk eksempel fra coinens egen historikk
    let exTxt = null;
    if (L.ev.length) { const e = (c.eventsAll || []).filter(z => L.ev.includes(z.type) && z.r30 != null).slice(-1)[0];
      if (e) { const s = c.eventStats[e.type]; exTxt = `${EVL[e.type]} ${dfmt(dateOf(e.date))} ved ${price(e.price)}: prisen var ${pct(e.r7)} etter 7 dager og ${pct(e.r30)} etter 30 dager (største nedtur underveis ${pct(e.dn30)}).` + (s && s.nUsed ? ` Over hele historikken traff denne signaltypen i ${share(s.hit)} av ${s.nUsed} tilfeller mot en basisrate på ${share(s.basePos)}.` : ''); } }
    if (!exTxt && key === 'levels' && c.breaks.length) exTxt = c.breaks[0].text + '.';
    if (!exTxt && (key === 'history' || key === 'analog') && c.analog && c.analog.ok) { const cs = c.analog.top[0]; exTxt = `Mest lik situasjon: ${NAMES[cs.sym]} ${dfmt(dateOf(cs.date))} (likhet ${cs.sim} %). ${caseText(cs)}`; }
    if (!exTxt && key === 'structure' && c.structure.pts) { const p = c.structure.pts; exTxt = `Siste to topper: ${price(p.h1.p)} (${dfmt(p.h1.t)}) og ${price(p.h2.p)} (${dfmt(p.h2.t)}). Siste to bunner: ${price(p.l1.p)} (${dfmt(p.l1.t)}) og ${price(p.l2.p)} (${dfmt(p.l2.t)}).`; }
    if (exTxt) parts.push(sec('Konkret historisk eksempel', exTxt));
    parts.push(sec('Slik kjenner du igjen lignende situasjoner', L.spot), el('p', 'ai-muted', 'Læringsinnhold – ikke finansiell rådgivning.'));
    box.replaceChildren(...parts); const m = document.getElementById('hvorfor'); m.hidden = false; state.why = { key, sym }; x.focus();
  }
  function closeWhy() { document.getElementById('hvorfor').hidden = true; state.why = null; }
  document.getElementById('hvorfor').addEventListener('click', e => { if (e.target.id === 'hvorfor') closeWhy(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.why) closeWhy(); });

  // ------------------------------------------------------------------ trade-assistent (enkel forklaring for nybegynnere, bygger på daytrading-motoren)
  const VRANK = { good: 0, mixed: 1, few: 2, bad: 3 }, SRANK = { 'utløst': 0, 'åpen': 1, 'følg': 2 };
  const AS_WHY = {
    pbL: ['Kursen har vært på vei opp de siste timene.', 'Nå tok den en liten pause og falt litt tilbake – som et pusterom i en oppoverbakke.', 'Siste 15 minutter begynte den å stige igjen. Å hoppe på etter en slik pause er en vanlig måte å følge en oppgang på.'],
    pbS: ['Kursen har vært på vei ned de siste timene.', 'Nå steg den litt tilbake – som et pusterom i en nedoverbakke.', 'Siste 15 minutter begynte den å falle igjen. Å gå short etter en slik rekyl er en vanlig måte å følge et fall på.'],
    swL: ['Kursen falt så vidt under gårsdagens laveste pris …', '… men ble kjøpt opp igjen nesten med en gang.', 'Det tyder ofte på at selgerne gikk tom, og at kursen kan sprette opp.'],
    swS: ['Kursen steg så vidt over gårsdagens høyeste pris …', '… men ble solgt ned igjen nesten med en gang.', 'Det tyder ofte på at kjøperne gikk tom, og at kursen kan falle tilbake.'],
    boL: ['Kursen brøt over gårsdagens høyeste pris.', 'Det skjedde med mye mer handel enn vanlig – mange kjøpte samtidig.', 'Når mange kjøper på en gang, fortsetter oppgangen ofte en stund.'],
    boS: ['Kursen brøt under gårsdagens laveste pris.', 'Det skjedde med mye mer handel enn vanlig – mange solgte samtidig.', 'Når mange selger på en gang, fortsetter fallet ofte en stund.'] };
  function asPick(L, s) {
    const items = (L.items || []).map(x => ({ ...x, b: dtBT(s, x.key) })).map(x => ({ ...x, v: x.b ? x.b.verdict : 'few' }));
    items.sort((a, b) => SRANK[a.status] - SRANK[b.status] || VRANK[a.v] - VRANK[b.v]);
    const x = items[0] || null; let mode = 'none';
    if (x) { if (x.status === 'utløst') mode = x.v === 'good' ? 'go' : x.v === 'bad' ? 'skip' : 'maybe'; else if (x.status === 'åpen') mode = 'open'; else mode = 'wait'; }
    return { x, mode, items };
  }
  const AS_MODE = {
    go: (d) => [d > 0 ? 'LONG nå' : 'SHORT nå', d > 0 ? 'ok' : 'bad', d > 0 ? 'Assistenten ser et kjøpssignal som har fungert historisk.' : 'Assistenten ser et salgssignal som har fungert historisk.'],
    maybe: (d) => [`Mulig ${d > 0 ? 'LONG' : 'SHORT'} – usikkert`, 'warn', 'Signalet er utløst, men historikken er blandet. Prøv det helst som papirhandel (uten ekte penger) først.'],
    skip: (d) => ['Stå over', 'muted', `Det kom et ${d > 0 ? 'kjøpssignal' : 'salgssignal'}, men akkurat denne typen har tapt penger etter gebyr de siste 12 månedene.`],
    open: (d) => ['Handel pågår', 'warn', `Et ${d > 0 ? 'kjøpssignal (long)' : 'salgssignal (short)'} ble utløst for litt siden og er fortsatt «i spill». Det er for sent å gå inn nå – vent på neste.`],
    wait: (d) => [`Vent – mulig ${d > 0 ? 'LONG' : 'SHORT'} snart`, 'warn', 'Kursen nærmer seg et oppsett, men det er ikke utløst ennå. Ikke gå inn før signalet kommer.'],
    none: () => ['Ingen handel nå', 'muted', 'Assistenten ser ingen gode muligheter akkurat nå. Å vente er også en beslutning – og ofte den beste.'] };
  function renderAssist() {
    const c = cur(); if (!c) return; const s = c.sym;
    if (!DTS.t && !DTS.busy) dtFetch(); dtTimer();
    const L = DTS.live[s], head = document.getElementById('as-main');
    const ids = ['as-why', 'as-outcome', 'as-how', 'as-coins'];
    if (!L) { head.replaceChildren(el('h2', null, `Trade-assistent – ${NAMES[s]}`), el('p', 'ai-muted', DTS.err || 'Henter ferske 15-minutters kurser fra Binance …')); ids.forEach(id => document.getElementById(id).replaceChildren()); return; }
    const P = curPrice(s), { x, mode } = asPick(L, s), d = x ? x.dir : 0, [title, tone, sub] = AS_MODE[mode](d);
    const e = x ? (x.entry != null ? x.entry : x.ref) : null, r = x ? x.risk : null, tgt = x ? e + x.dir * 2 * r : null;
    // ---- hovedkort: trafikklys + plan
    const light = el('div', 'as-light as-' + tone); light.append(el('span', 'as-dot'), el('div', 'as-ltxt'));
    light.lastChild.append(el('div', 'as-title', title), el('p', null, sub));
    const meta = el('p', 'ai-muted', `${NAMES[s]} ${price(P)} · sjekket ${DTS.t ? hm(DTS.t) : '–'} · ser på nytt hvert minutt, og et nytt signal kan komme hvert kvarter (neste ${hm(L.t + 2 * DT.M15)}).`);
    const parts = [el('div', 'ai-row', null), meta, light];
    parts[0].append(el('h2', null, `Trade-assistent – ${NAMES[s]}`), el('span', 'ai-pill ' + (L.bias > 0 ? 'st-buy' : L.bias < 0 ? 'st-sell' : 'st-none'), L.bias > 0 ? 'Siste timer: opp' : L.bias < 0 ? 'Siste timer: ned' : 'Siste timer: sidelengs'));
    if (x && mode !== 'none') {
      const plan = el('div', 'as-plan');
      const box = (lab, val, sub2, cls) => { const b = el('div', 'as-box ' + cls); b.append(el('span', 'as-lab', lab), el('b', 'as-val', val), el('span', 'ai-muted ai-cap', sub2)); return b; };
      const pc = v => pct((v / e - 1) * 100, 2);
      plan.append(
        box(mode === 'open' ? 'Gikk inn ved' : mode === 'wait' ? 'Mulig inngang ved' : mode === 'skip' ? 'Signalets inngang' : 'Gå inn ved', price(e), mode === 'skip' ? 'Vist for læring – assistenten anbefaler å stå over' : x.dir > 0 ? (mode === 'wait' ? 'Kjøp hvis signalet kommer' : 'Kjøp (long) til omtrent denne prisen') : (mode === 'wait' ? 'Selg short hvis signalet kommer' : 'Selg short til omtrent denne prisen'), 'as-entry'),
        box('Ta gevinst ved', price(tgt), `${pc(tgt)} · målet er dobbelt så langt unna som stoppen`, 'as-tgt'),
        box('Ta tapet ved', price(x.stop), `${pc(x.stop)} · her var signalet feil – kom deg ut`, 'as-stop'));
      parts.push(plan);
      if (mode === 'open') { const cr = (P - e) * x.dir / r; parts.push(el('p', 'ai-cap', `Status nå: ${cr >= 0 ? 'i pluss' : 'i minus'} (${fR(cr)}). Handelen avsluttes uansett etter 6 timer (om ca. ${Math.max(0, DT.P.maxBars - (L.n - x.i)) * 15} minutter).`)); }
      const sv = el('div', 'as-chart'); parts.push(sv); requestAnimationFrame(() => asChart(sv, s, L, x, e, tgt));
    } else { const sv = el('div', 'as-chart'); parts.push(sv); requestAnimationFrame(() => asChart(sv, s, L, null)); }
    head.replaceChildren(...parts);
    // ---- hvorfor
    const why = document.getElementById('as-why'), ul = el('ul', 'as-list');
    const li = (txt, cls) => ul.append(el('li', cls || null, txt));
    if (x && AS_WHY[x.key] && mode !== 'wait') AS_WHY[x.key].forEach(t => li(t));
    if (x && mode === 'wait') { const E = price(e), W = {
        pbL: [`Kursen er i en oppgang og har tatt en liten pause.`, `Signalet kommer hvis en 15-minutters periode avsluttes over ${E} – da ser det ut som oppgangen fortsetter.`],
        pbS: [`Kursen er i en nedgang og har steget litt tilbake.`, `Signalet kommer hvis en 15-minutters periode avsluttes under ${E} – da ser det ut som fallet fortsetter.`],
        swL: [`Kursen er nær gårsdagens laveste pris (${E}).`, 'Signalet kommer hvis den faller kort under og raskt kommer tilbake over – da har selgerne ofte gått tom.'],
        swS: [`Kursen er nær gårsdagens høyeste pris (${E}).`, 'Signalet kommer hvis den stiger kort over og raskt faller tilbake under – da har kjøperne ofte gått tom.'],
        boL: [`Kursen er like under gårsdagens høyeste pris (${E}).`, 'Signalet kommer hvis en 15-minutters periode avsluttes over den, med mye mer handel enn vanlig.'],
        boS: [`Kursen er like over gårsdagens laveste pris (${E}).`, 'Signalet kommer hvis en 15-minutters periode avsluttes under den, med mye mer handel enn vanlig.'] }[x.key] || [];
      W.forEach(t => li(t)); }
    const ctx = el('ul', 'as-list as-ctx');
    const cli = (t, cls) => ctx.append(el('li', cls || null, t));
    cli(L.bias > 0 ? 'De siste timene har kursen gått oppover.' : L.bias < 0 ? 'De siste timene har kursen gått nedover.' : 'De siste timene har kursen gått sidelengs, uten tydelig retning.');
    cli(P >= L.vwap ? `Kursen er over dagens gjennomsnittspris (${price(L.vwap)}) – kjøperne har hatt litt overtaket i dag.` : `Kursen er under dagens gjennomsnittspris (${price(L.vwap)}) – selgerne har hatt litt overtaket i dag.`);
    cli(L.rsi > 70 ? `Kursen har steget mye på kort tid (RSI ${nf(L.rsi, { maximumFractionDigits: 0 })}) – den kan trenge en pause.` : L.rsi < 30 ? `Kursen har falt mye på kort tid (RSI ${nf(L.rsi, { maximumFractionDigits: 0 })}) – den kan trenge en pause.` : `Kursen er verken «overopphetet» eller «utsolgt» (RSI ${nf(L.rsi, { maximumFractionDigits: 0 })}).`);
    if (L.adr && L.today > L.adr) cli(`Kursen har allerede beveget seg mer enn vanlig i dag (${nf(L.today, { maximumFractionDigits: 1 })} % mot normalt ${nf(L.adr, { maximumFractionDigits: 1 })} %). Det kan være mindre rom igjen.`, 'ai-warn');
    const day = c.long && c.long.label;
    if (day) { const up = /bullish/i.test(day), dn = /bearish/i.test(day); cli(`Det store bildet (dagsgrafen) er ${day.toLowerCase()}.${x && ((x.dir > 0 && dn) || (x.dir < 0 && up)) ? ' Signalet går mot det store bildet, så vær ekstra forsiktig.' : ''}`, x && ((x.dir > 0 && dn) || (x.dir < 0 && up)) ? 'ai-warn' : null); }
    why.replaceChildren(el('h2', null, x && mode !== 'none' ? 'Hvorfor?' : 'Hva skjer i markedet nå?'), ...(x && mode !== 'none' && ul.children.length ? [ul, el('h3', null, 'Situasjonen rundt')] : []), ctx,
      el('p', 'ai-muted', `Økt: ${L.session}. Gårsdagens høyeste pris ${price(L.pdh)} og laveste ${price(L.pdl)} er viktige nivåer i dag.`));
    // ---- forventet utfall
    const out = document.getElementById('as-outcome'); const b = x && x.b;
    if (!x || mode === 'none' || !b || !b.all || !b.all.n) {
      out.replaceChildren(el('h2', null, 'Hva kan du forvente?'), el('p', 'ai-cap', 'Når et signal dukker opp, ser du her hvordan akkurat den typen signal har gått de siste 12 månedene: hvor ofte det traff, hvor ofte det bommet, og hva det ga i snitt.'));
    } else {
      const a = b.all, n10 = v => Math.round((v || 0) * 10), g = n10(a.tgt), st = n10(a.stop), tm = Math.max(0, 10 - g - st);
      const dots = el('div', 'as-dots'); for (let i = 0; i < 10; i++) dots.append(el('span', i < g ? 'g' : i < g + st ? 'r' : 'n'));
      const risk = 100, win = 2 * risk - a.cost * risk, loss = risk + a.cost * risk, avg = a.exp * risk;
      const kr = v => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), { maximumFractionDigits: 0 }) + ' kr';
      const verdTxt = { good: ['Har tjent penger historisk', 'ai-pos'], mixed: ['Blandet historikk', 'ai-warn'], few: ['For få tilfeller til å vite', 'ai-neu'], bad: ['Har tapt penger historisk', 'ai-neg'] }[b.verdict];
      const leg = el('p', 'ai-cap'); leg.append(el('b', 'ai-pos', `${g} nådde målet`), document.createTextNode(' · '), el('b', 'ai-neg', `${st} gikk til stopp`), document.createTextNode(` · ${tm} ble avsluttet etter 6 timer uten å nå noen av dem`));
      const kv = el('dl', 'ai-kv'); const row = (k, v, cls) => kv.append(el('dt', null, k), el('dd', cls, v));
      row('Når målet nås', kr(win), 'ai-pos'); row('Når stoppen tas', kr(-loss), 'ai-neg'); row('I snitt per handel', kr(avg), sgnCls(avg)); row('Typisk varighet', `ca. ${nf(a.bars * 15 / 60, { maximumFractionDigits: 1 })} timer`);
      out.replaceChildren(el('div', 'ai-row'), el('p', 'ai-cap', `Av 10 slike signaler de siste 12 månedene (${a.n} totalt, ${b.scope}):`), dots, leg,
        el('p', 'ai-cap', 'Hvis du hver gang risikerer 100 kr (altså taper 100 kr hvis stoppen tas):'), kv,
        el('p', 'ai-summary', avg > 0 ? `Over mange handler har denne typen gitt ca. ${kr(avg)} per 100 kr risikert etter gebyr. Det betyr ikke at neste handel vinner – mer enn halvparten kan gå til stopp og det likevel lønne seg, fordi gevinstene er større enn tapene.` : `Over mange handler har denne typen gitt ca. ${kr(avg)} per 100 kr risikert etter gebyr – altså tap over tid. Gevinstene er dobbelt så store som tapene, men det skjer for sjelden til å veie opp. Derfor anbefaler assistenten å stå over eller bare papirhandle.`));
      out.firstChild.append(el('h2', null, 'Hva kan du forvente?'), el('span', 'ai-pill ' + (b.verdict === 'good' ? 'st-buy' : b.verdict === 'bad' ? 'st-sell' : 'st-wait'), verdTxt[0]));
    }
    // ---- slik gjør du det + ordliste
    const how = document.getElementById('as-how'); const ol = el('ol', 'as-steps');
    const step = t => ol.append(el('li', null, t));
    if (x && x.dir < 0) step('Short betyr at du tjener når kursen faller. Det krever en konto som tillater det (for eksempel futures). Er du ny: hopp over short-signaler eller papirhandle dem.');
    step(`Bestem hvor mye du tåler å tape på én handel – vanlig er maks 1 % av kontoen. Kalkulatoren i Daytrading-fanen regner ut hvor stor handelen da kan være.`);
    step(x && mode !== 'none' ? `Gå inn rundt ${price(e)} – men bare når assistenten sier ${x.dir > 0 ? 'LONG' : 'SHORT'} nå (grønt/rødt lys), ikke når den sier vent.` : 'Vent til assistenten viser LONG nå eller SHORT nå.');
    step(x && mode !== 'none' ? `Legg inn en stop-loss på ${price(x.stop)} med en gang. Den selger automatisk hvis du tar feil, så tapet blir lite.` : 'Legg alltid inn en stop-loss med en gang du går inn. Den begrenser tapet automatisk.');
    step(x && mode !== 'none' ? `Legg inn en take-profit på ${price(tgt)}. Den tar gevinsten automatisk.` : 'Legg inn en take-profit (gevinstmål) samtidig.');
    step('Har ingen av dem slått inn etter 6 timer, avslutt handelen. Ikke flytt stoppen lenger unna fordi du håper.');
    step('Start med papirhandel: skriv ned signalene og se hvordan de går, uten ekte penger, i noen uker.');
    const calcBtn = el('button', 'ai-btn', 'Regn ut handelsstørrelse →'); calcBtn.type = 'button';
    calcBtn.addEventListener('click', () => { if (x && mode !== 'none') DTS.calc = { entry: e, stop: x.stop, dir: x.dir }; go('daytrading'); setTimeout(() => document.getElementById('dt-calc')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); });
    const gl = el('dl', 'as-gloss'); [['Long', 'Du kjøper og tjener hvis kursen stiger.'], ['Short', 'Du «selger først» og tjener hvis kursen faller.'], ['Stop-loss', 'Automatisk salg som stopper tapet hvis kursen går feil vei.'], ['Take-profit', 'Automatisk salg som tar gevinsten når målet nås.'], ['Papirhandel', 'Øve på handler uten ekte penger.'], ['R', 'Beløpet du risikerer. +2 R = du vant dobbelt så mye som du risikerte.']].forEach(([k, v]) => gl.append(el('dt', null, k), el('dd', null, v)));
    const cbw = el('div'); cbw.append(calcBtn);
    how.replaceChildren(el('h2', null, 'Slik gjør du det'), ol, cbw, el('h3', null, 'Ord du bør kjenne'), gl,
      el('div', 'ai-warnbox', 'De fleste som daytrader taper penger over tid. Assistenten er et læringsverktøy, ikke en garanti. Ikke bruk penger du ikke har råd til å tape, og vær forsiktig med giring (lån). Ikke finansiell rådgivning.'));
    // ---- alle coins
    const cb = document.getElementById('as-coins'), grid = el('div', 'as-coins');
    state.list.forEach(sym => { const LL = DTS.live[sym]; const k = el('button', 'as-coin' + (sym === s ? ' on' : '')); k.type = 'button';
      if (!LL) { k.append(el('b', null, sym), el('span', 'ai-muted ai-cap', '…')); }
      else { const pk = asPick(LL, sym), [t, tn] = AS_MODE[pk.mode](pk.x ? pk.x.dir : 0); k.append(el('b', null, NAMES[sym]), el('span', 'as-ctag as-' + tn, t)); }
      k.addEventListener('click', () => dash.setParams({ coin: sym })); grid.append(k); });
    cb.replaceChildren(el('h2', null, 'Alle coins akkurat nå'), grid);
  }
  function asChart(box, s, L, x, e, tgt) {
    const raw = DTS.raw[s]; if (!raw) return; const B = raw.B, n = 32, a0 = Math.max(0, B.N - n), idx = d3.range(a0, B.N);
    const W = Math.max(280, box.clientWidth || 600), H = W < 600 ? 220 : 260;
    const lv = x ? [[tgt, 'Ta gevinst', 'var(--color-ok)'], [e, x.status === 'følg' ? 'Mulig inngang' : 'Inngang', 'var(--color-fg)'], [x.stop, 'Ta tapet', 'var(--color-bad)']] : [[L.pdh, 'Høyest i går', 'var(--color-fg-muted)'], [L.pdl, 'Lavest i går', 'var(--color-fg-muted)']];
    let lo = d3.min(idx, i => B.l[i]), hi = d3.max(idx, i => B.h[i]); const span = hi - lo;
    const use = lv.filter(([v]) => v != null && (x || (v > lo - span && v < hi + span))); use.forEach(([v]) => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `Kursen siste 8 timer${x ? ' med inngang, mål og stopp' : ''}`);
    const lab = use.map(([v, t]) => `${t} ${price(v)}`), mR = Math.min(200, measure(svg, lab) + 14);
    const m = { l: 8, r: mR, t: 10, b: 22 }, xs = d3.scaleLinear([a0, B.N - 1 + 2], [m.l, W - m.r]), y = d3.scaleLinear([lo, hi], [H - m.b, m.t]);
    if (x) { const z = (v1, v2, col) => svg.append('rect').attr('x', xs(B.N - 1)).attr('width', W - m.r - xs(B.N - 1)).attr('y', y(Math.max(v1, v2))).attr('height', Math.abs(y(v1) - y(v2))).attr('fill', col).attr('fill-opacity', 0.13);
      if (x) { z(e, tgt, 'var(--color-ok)'); z(e, x.stop, 'var(--color-bad)'); } }
    const ls = []; use.forEach(([v, t, col]) => { svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', col).attr('stroke-width', 1.5).attr('stroke-dasharray', t.startsWith('Inngang') || t.startsWith('Mulig') ? null : '6 4'); ls.push({ y: y(v) + 4, t: `${t} ${price(v)}`, col }); });
    ls.sort((a, b) => a.y - b.y); for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 15) ls[i].y = ls[i - 1].y + 15;
    ls.forEach(L2 => svg.append('text').attr('x', W - m.r + 6).attr('y', L2.y).attr('font-size', 'var(--cds-font-size-caption)').attr('fill', L2.col).text(L2.t));
    const bw = Math.max(2, (W - m.l - m.r) / (n + 2) * 0.6), g = svg.append('g');
    g.selectAll('line').data(idx).join('line').attr('x1', i => xs(i)).attr('x2', i => xs(i)).attr('y1', i => y(B.h[i])).attr('y2', i => y(B.l[i])).attr('stroke', i => B.c[i] >= B.o[i] ? 'var(--color-ok)' : 'var(--color-bad)');
    g.selectAll('rect').data(idx).join('rect').attr('x', i => xs(i) - bw / 2).attr('width', bw).attr('y', i => y(Math.max(B.o[i], B.c[i]))).attr('height', i => Math.max(1, Math.abs(y(B.o[i]) - y(B.c[i])))).attr('fill', i => B.c[i] >= B.o[i] ? 'var(--color-ok)' : 'var(--color-bad)');
    const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(xs).tickValues(idx.filter(i => (B.t[i] / DT.M15) % 8 === 0)).tickFormat(i => hm(B.t[i])).tickSizeOuter(0)); axisStyle(xa); xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)');
    box.append(el('p', 'ai-muted ai-cap', 'Kursen siste 8 timer. Hver strek er 15 minutter (grønn = steg, rød = falt).'));
  }
  // ------------------------------------------------------------------ langsiktig kjøps- og salgsplan (site/plan.js)
  const PL = { cache: {}, startY: 2, bt: {} };
  const kr = (v, d = 0) => v == null || !isFinite(v) ? '–' : nf(v, { maximumFractionDigits: d }) + ' kr';
  function plPrep(sym) { const f = fullHistory(sym); if (!f || !f.length) return null; const key = f.length + ':' + f[f.length - 1].t;
    if (!PL.cache[sym] || PL.cache[sym].key !== key) PL.cache[sym] = { key, P: PLAN.prepare(f.map(r => r.t), f.map(r => r.c)) }; return PL.cache[sym].P; }
  function plSettings() { let s = {}; try { s = JSON.parse(localStorage.getItem('plan') || '{}'); } catch (e) { /* ingen lagring */ } return { budget: s.budget > 0 ? s.budget : 10000, months: s.months > 0 ? s.months : 24, hold: s.hold >= 0 ? s.hold : 0 }; }
  function plSave(v) { try { localStorage.setItem('plan', JSON.stringify(v)); } catch (e) { /* ingen lagring */ } }
  function renderPlan() {
    const c = cur(); if (!c) return; const s = c.sym, main = document.getElementById('pl-main');
    const ids = ['pl-ladder', 'pl-calc', 'pl-chart', 'pl-bt', 'pl-how'];
    if (typeof PLAN === 'undefined') { main.replaceChildren(el('p', 'ai-muted', 'Planmotoren lastet ikke.')); return; }
    const P = plPrep(s);
    if (!P) { main.replaceChildren(el('h2', null, `Langsiktig plan – ${NAMES[s]}`), el('p', 'ai-muted', 'Henter hele kurshistorikken …')); ids.forEach(id => document.getElementById(id).replaceChildren()); return; }
    const S = plSettings(), weeks = Math.max(1, Math.round(S.months * 52 / 12)), base = S.budget / weeks;
    const n = P.N - 1, lp = livePrice(c), px = lp && lp.p ? lp.p : P.c[n], ath = Math.max(P.ath[n], px), dd = px / ath - 1;
    const pct = P.pct[n], k = PLAN.ddMult(dd), sh = PLAN.sellShare(pct), z = PLAN.zone(pct), athT = P.t[P.athI];
    // ---- hovedkort
    const ch = el('div', 'ai-chips'); const chip = (a, b, cls) => { const x = el('span', 'ai-chip'); x.append(el('span', 'ai-muted', a), el('b', cls, b)); ch.append(x); };
    chip('Kurs nå', price(px)); chip('Høyeste hittil', `${price(ath)} (${dfmt(athT)})`); chip('Fall fra toppen', pct2(dd * 100), dd < -0.9 ? 'ai-warn' : dd < -0.4 ? 'ai-pos' : dd > -0.2 ? 'ai-neg' : null);
    if (z) chip('Prisnivå mot egen historikk', `${z.label} (${Math.round(pct * 100)} %)`, z.cls === 'sell' || z.cls === 'warm' ? 'ai-neg' : z.cls === 'vbuy' || z.cls === 'buy' ? 'ai-pos' : null);
    const light = (tone, title, txt) => { const d = el('div', 'as-light as-' + tone); d.append(el('span', 'as-dot'), el('div')); d.lastChild.append(el('div', 'as-title', title), el('p', null, txt)); return d; };
    const lights = [];
    if (dd < -0.9) lights.push(el('div', 'ai-warnbox', `${NAMES[s]} er over 90 % under toppen fra ${dfmt(athT)}. Så store fall skjer ofte med coins som aldri kommer tilbake, og planen har ikke fungert i slike tilfeller (se testen under). Vurder å stå over eller bruke et mye mindre beløp.`));
    if (k > 0) lights.push(light('ok', `Kjøp denne uken: ${kr(base * k)}`, `Kursen er ${nf(-dd * 100, { maximumFractionDigits: 0 })} % under toppen, så planen kjøper ${nf(k, { maximumFractionDigits: 1 })} × grunnbeløpet (${kr(base)} per uke).`));
    else lights.push(light('muted', 'Ikke kjøp nå – vent', `Kursen er bare ${nf(-dd * 100, { maximumFractionDigits: 0 })} % under toppen. Planen sparer pengene til kursen har falt minst 20 % fra toppen (under ${price(ath * 0.8)}).`));
    if (sh > 0) lights.push(light('bad', `Selg ${nf(sh * 100, { maximumFractionDigits: 0 })} % av beholdningen denne uken`, `Kursen er dyr mot sin egen historikk (prisnivå ${Math.round(pct * 100)} %). Planen tar ut litt gevinst hver uke så lenge det varer.`));
    else if (pct != null) lights.push(el('p', 'ai-cap', `Salg: ingenting nå. Planen begynner å selge litt og litt over ${price(P.levels[0.9])}.`));
    main.replaceChildren(el('div', 'ai-row'), el('p', 'ai-muted', 'Fordel kjøpene over lang tid, kjøp mer jo lenger kursen har falt fra toppen, og selg litt og litt når den er dyr. Du treffer aldri bunnen eller toppen, men snittprisen blir ofte lavere enn ved å kjøpe likt hver gang.'), ch, ...lights);
    main.firstChild.append(el('h2', null, `Langsiktig plan – ${NAMES[s]}`), el('span', 'ai-muted ai-cap', `Grunnbeløp ${kr(base)} per uke (${kr(S.budget)} over ${S.months} mnd)`));
    // ---- kjøps- og salgstrapp
    const lad = document.getElementById('pl-ladder');
    const tb = (heads, rows) => { const tw = el('div', 'ai-tablewrap'), t = el('table', 'ai-table ai-proj'), hr = el('tr'); heads.forEach((h, i) => hr.append(el('th', i ? null : 'l', h))); const th = el('thead'); th.append(hr); t.append(th); const b = el('tbody');
      rows.forEach(r => { const tr = el('tr'); if (r.on) tr.className = 'hl'; r.cells.forEach((v, i) => tr.append(el('td', (i ? '' : 'l ') + (r.cls && r.cls[i] || ''), v))); b.append(tr); }); t.append(b); tw.append(t); return tw; };
    const bl = [[0, -0.2, 0], [-0.2, -0.4, 0.5], [-0.4, -0.6, 1], [-0.6, -0.75, 2], [-0.75, -1, 3]];
    const buyRows = bl.map(([a, b2, f]) => ({ on: dd <= a && dd > b2, cells: [a === 0 ? 'Mindre enn 20 % under toppen' : b2 === -1 ? `Mer enn ${-a * 100} % under` : `${-a * 100}–${-b2 * 100} % under toppen`, a === 0 ? `over ${price(ath * 0.8)}` : b2 === -1 ? `under ${price(ath * (1 + a))}` : `${price(ath * (1 + b2))}–${price(ath * (1 + a))}`, f ? `${nf(f, { maximumFractionDigits: 1 })} ×` : 'Ingen kjøp', f ? kr(base * f) : '–'], cls: [null, null, f ? 'ai-pos' : 'ai-muted', null] }));
    const L = P.levels, sl = L[0.9] ? [[null, L[0.9], 0, 'Under ' + price(L[0.9])], [L[0.9], L[0.95], 0.05], [L[0.95], L[0.98], 0.1], [L[0.98], null, 0.2]] : null;
    const sellRows = sl ? sl.map(([a, b2, f, txt]) => ({ on: (a == null || px >= a) && (b2 == null || px < b2), cells: [txt || (b2 ? `${price(a)}–${price(b2)}` : `Over ${price(a)}`), f ? `${nf(f * 100, { maximumFractionDigits: 0 })} % av beholdningen per uke` : 'Ingen salg'], cls: [null, f ? 'ai-neg' : 'ai-muted'] })) : null;
    const bc = el('div', 'ai-card'), sc = el('div', 'ai-card');
    bc.append(el('h2', null, 'Kjøpstrapp'), el('p', 'ai-muted', `Basert på høyeste kurs hittil, ${price(ath)}. Jo lenger ned, jo mer kjøper du hver uke. Raden for i dag er markert.`), tb(['Fall fra toppen', 'Kurs', 'Faktor', 'Kjøp per uke'], buyRows),
      el('p', 'ai-cap', 'Kommer kursen over toppen igjen, flytter trappen seg opp med den.'));
    sc.append(el('h2', null, 'Salgstrapp'), sellRows ? el('p', 'ai-muted', `Når ${NAMES[s]} er dyr mot sin egen historikk (kurs delt på 200-dagers snittet), selger planen litt og litt. Nivåene følger 200-dagers snittet (nå ${price(P.sma[n])}) og flytter seg litt hver dag.`) : el('p', 'ai-muted', 'For kort historikk til å beregne salgsnivåer (trenger over 1,5 år).'), ...(sellRows ? [tb(['Kurs', 'Selg'], sellRows)] : []),
      el('p', 'ai-cap', 'Salgene skjer i små biter over mange uker, fordi toppen ofte varer lenger enn man tror.'));
    lad.replaceChildren(bc, sc);
    // ---- kalkulator
    const calc = document.getElementById('pl-calc'), form = el('div', 'dt-form');
    const inp = (lab, key, step, help) => { const w = el('label', 'dt-in'); w.append(el('span', 'ai-muted', lab)); const i = el('input'); i.type = 'number'; i.step = step; i.min = 0; i.inputMode = 'decimal'; i.value = S[key]; i.dataset.k = key; w.append(i); if (help) w.append(el('span', 'ai-cap ai-muted', help)); return w; };
    form.append(inp('Totalt beløp å investere (kr)', 'budget', 'any'), inp('Over hvor mange måneder', 'months', '1', '12–48 er vanlig'), inp(`Antall ${s} du eier nå`, 'hold', 'any', 'For å regne ut salg'));
    const out = el('dl', 'ai-kv');
    const upd = () => { const g = kk => parseFloat((form.querySelector(`[data-k="${kk}"]`).value || '0').replace(',', '.')) || 0; const v = { budget: g('budget'), months: g('months'), hold: g('hold') }; plSave(v);
      const w = Math.max(1, Math.round(v.months * 52 / 12)), b = v.budget / w; out.replaceChildren(); const row = (a, x, cls) => out.append(el('dt', null, a), el('dd', cls, x));
      row('Grunnbeløp per uke', kr(b)); row('Kjøp denne uken', k > 0 ? `${kr(b * k)} (${nf(k, { maximumFractionDigits: 1 })} ×)` : '0 kr – vent', k > 0 ? 'ai-pos' : 'ai-muted');
      row('Det gir', k > 0 ? `ca. ${nf(b * k / px, { maximumSignificantDigits: 4 })} ${s}` : '–');
      if (v.hold > 0) row('Selg denne uken', sh > 0 ? `${nf(v.hold * sh, { maximumSignificantDigits: 4 })} ${s} (ca. ${kr(v.hold * sh * px)})` : 'Ingenting', sh > 0 ? 'ai-neg' : 'ai-muted');
      row('Merk', 'I billige perioder kjøper planen mer enn grunnbeløpet, så pengene kan ta slutt før perioden er over. Er det penger igjen på slutten, kjøpes resten da.'); };
    form.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { upd(); clearTimeout(PL.tm); PL.tm = setTimeout(() => renderPlan(), 600); }));
    calc.replaceChildren(el('h2', null, 'Din plan'), el('p', 'ai-muted', 'Tallene huskes i denne nettleseren. Sjekk planen én gang i uken, for eksempel hver mandag.'), form, out); upd();
    // ---- graf og eksempel
    plChart(c, P, S, weeks);
    // ---- historisk test
    plBT(s, P);
    // ---- slik fungerer det
    const how = document.getElementById('pl-how'), ol = el('ol', 'as-steps');
    ['Bestem et totalbeløp og en periode (for eksempel 2 år). Det gir et grunnbeløp per uke.', 'Én gang i uken: se hvilken rad i kjøpstrappen kursen er i, og kjøp grunnbeløpet ganget med faktoren. Nær toppen kjøper du ingenting og sparer pengene.', 'Når kursen er dyr (salgstrappen), selger du den andelen som står der, hver uke så lenge det varer.', 'Ikke prøv å treffe bunnen eller toppen. Poenget er å kjøpe mest når det er billig og selge litt når det er dyrt.', 'Bruk planen på store, etablerte coins. På små coins kan et stort fall bety at coinen er på vei mot null – da blir «kjøp mer» feil.']
      .forEach(t => ol.append(el('li', null, t)));
    how.replaceChildren(el('h2', null, 'Slik fungerer planen'), ol, el('div', 'ai-warnbox', 'Planen bygger på hvordan kursene har oppført seg siden 2017–2020. Historien gjentar seg ikke nøyaktig, og en coin kan falle mer enn noen gang før. Ikke invester penger du kan trenge, og spre risikoen. Ikke finansiell rådgivning.'));
  }
  const pct2 = v => pct(v, 0);
  function plChart(c, P, S, weeks) {
    const box = document.getElementById('pl-chart'), s = c.sym, n = P.N - 1;
    const yrs = [1, 2, 3, 4].filter(y => P.N - y * 365 > Math.max(0, P.pct.findIndex(v => v != null)) || y === 1);
    if (!yrs.includes(PL.startY)) PL.startY = yrs[yrs.length - 1];
    const i0 = Math.max(0, n - PL.startY * 365), w = Math.min(weeks, Math.floor((n - i0) / 7) || 1);
    const R = { plan: PLAN.simulate(P, i0, S.budget, w, 'plan+sell', { rebuy: true }), buy: PLAN.simulate(P, i0, S.budget, w, 'plan'), dca: PLAN.simulate(P, i0, S.budget, w, 'dca'), lump: PLAN.simulate(P, i0, S.budget, w, 'lump') };
    const seg = el('div', 'ai-seg'); yrs.forEach(y => { const b = el('button', null, `${y} år siden`); b.type = 'button'; b.setAttribute('aria-pressed', y === PL.startY ? 'true' : 'false'); b.addEventListener('click', () => { PL.startY = y; plChart(c, P, S, weeks); }); seg.append(b); });
    const svgBox = el('div', 'ai-chart'); const head = el('div', 'ai-row'); head.append(el('h2', null, 'Hvordan planen ville gått'), seg);
    const lg = el('div', 'ai-legend'); const it = (sty, txt) => { const sp = el('span'); const i = el('i'); Object.assign(i.style, sty); sp.append(i, document.createTextNode(txt)); return sp; };
    lg.append(it({ background: 'var(--color-ok)', height: '10px', width: '10px', border: '0', borderRadius: '50%' }, 'Kjøp (større = mer)'), it({ background: 'var(--color-bad)', height: '10px', width: '10px', border: '0', borderRadius: '50%' }, 'Salg'), it({ color: 'var(--color-fg-muted)', borderTopStyle: 'dashed' }, 'Høyeste hittil'), it({ background: 'var(--color-ok)', opacity: '.25', height: '10px', border: '0' }, 'Kjøpssoner (20/40/60/75 % under toppen)'));
    const tw = el('div', 'ai-tablewrap'), t = el('table', 'ai-table ai-proj'), hr = el('tr'); ['Metode', 'Snittpris', 'Verdi nå', 'Endring', 'Største fall underveis'].forEach((h, i) => hr.append(el('th', i ? null : 'l', h))); const th = el('thead'); th.append(hr); t.append(th);
    const bd = el('tbody'); [['Planen (kjøp + salg)', R.plan], ['Planen (bare kjøp)', R.buy], ['Fast beløp hver uke', R.dca], ['Alt på en gang', R.lump]].forEach(([lab, r], j) => { const tr = el('tr'); if (j === 0) tr.className = 'hl';
      tr.append(el('td', 'l', lab), el('td', null, price(r.avg)), el('td', null, kr(r.value)), el('td', sgnCls(r.ret), pct(r.ret * 100, 0)), el('td', 'ai-neg', pct(r.mdd * 100, 0))); bd.append(tr); }); t.append(bd); tw.append(t);
    const nb = R.plan.events.filter(e => e.type === 'kjøp').length, ns = R.plan.events.filter(e => e.type === 'salg').length;
    box.replaceChildren(head, el('p', 'ai-muted', `Eksempel: start ${dfmt(P.t[i0])} med ${kr(S.budget)} fordelt over ${w} uker. ${nb} kjøp og ${ns} salg. Pengene fra salg brukes til å kjøpe igjen når kursen er langt under toppen.`), svgBox, lg, tw);
    requestAnimationFrame(() => {
      const W = Math.max(300, svgBox.clientWidth || 600), H = W < 600 ? 300 : 380, a0 = Math.max(0, i0 - 120), idx = d3.range(a0, n + 1);
      const lo = d3.min(idx, i => P.c[i]) * 0.9, hi = d3.max(idx, i => P.ath[i]) * 1.05;
      const svg = d3.select(svgBox).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `Kurs for ${NAMES[s]} med planens kjøp og salg`);
      const y = d3.scaleLog([lo, hi], [H - 24, 10]), ty = y.ticks(5).filter((v, i, a) => a.length < 8 || i % 2 === 0), m = { l: measure(svg, ty.map(price)) + 10, r: 8 };
      const x = d3.scaleUtc([P.t[a0], P.t[n]], [m.l, W - m.r]);
      svg.append('g').selectAll('line').data(ty).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
      const ya = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(ty).tickFormat(price).tickSize(0)); ya.select('.domain').remove(); axisStyle(ya);
      const xa = svg.append('g').attr('transform', `translate(0,${H - 24})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(W / 110))).tickSizeOuter(0)); xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); axisStyle(xa);
      [[0.8, 0.6, 0.1], [0.6, 0.4, 0.16], [0.4, 0.25, 0.22], [0.25, 0.01, 0.28]].forEach(([u, d2, op]) => svg.append('path').datum(idx).attr('fill', 'var(--color-ok)').attr('fill-opacity', op)
        .attr('d', d3.area().x(i => x(P.t[i])).y0(i => y(Math.max(lo, P.ath[i] * d2))).y1(i => y(Math.max(lo, P.ath[i] * u)))));
      svg.append('path').datum(idx).attr('fill', 'none').attr('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '4 3').attr('d', d3.line().x(i => x(P.t[i])).y(i => y(P.ath[i])));
      svg.append('line').attr('x1', x(P.t[i0])).attr('x2', x(P.t[i0])).attr('y1', 10).attr('y2', H - 24).attr('stroke', 'var(--cds-chart-axis)').attr('stroke-dasharray', '2 3');
      svg.append('path').datum(idx).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 1.8).attr('d', d3.line().x(i => x(P.t[i])).y(i => y(P.c[i])));
      const mx = d3.max(R.plan.events, e => e.amt) || 1;
      svg.append('g').selectAll('circle').data(R.plan.events).join('circle').attr('cx', e => x(e.t)).attr('cy', e => y(e.px)).attr('r', e => 2 + 6 * Math.sqrt(e.amt / mx))
        .attr('fill', e => e.type === 'kjøp' ? 'var(--color-ok)' : 'var(--color-bad)').attr('fill-opacity', 0.75).attr('stroke', 'var(--color-panel)').attr('stroke-width', 0.8);
      const tip = tipOf(svgBox), bis = d3.bisector(i => P.t[i]).center;
      svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', H - 24).attr('fill', 'transparent')
        .on('pointermove', ev => { const [px2] = d3.pointer(ev); const i = idx[bis(idx, x.invert(px2))]; if (i == null) return; const evs = R.plan.events.filter(e => Math.abs(e.i - i) <= 3);
          tip.replaceChildren(el('div', 'd', dfmt(P.t[i])), el('div', null, `Kurs ${price(P.c[i])} · ${pct(P.dd[i] * 100, 0)} fra toppen`), ...evs.map(e => el('div', e.type === 'kjøp' ? 'ai-pos' : 'ai-neg', `${e.type === 'kjøp' ? 'Kjøpte' : 'Solgte'} for ${kr(e.amt)}`))); const kx = svgBox.clientWidth / W; place(svgBox, tip, x(P.t[i]) * kx, y(P.c[i]) * kx); })
        .on('pointerleave', () => { tip.hidden = true; });
    });
  }
  function plBT(s, P) {
    const box = document.getElementById('pl-bt');
    if (!PL.bt[s] || PL.bt[s].N !== P.N) { const first = P.pct.findIndex(v => v != null), rows = [];
      for (let i0 = Math.max(first, 0); i0 + 104 * 7 + 30 <= P.N - 1; i0 += 30) { const end = Math.min(P.N - 1, i0 + 1460), r = {};
        for (const m of ['dca', 'plan', 'plan+sell', 'lump']) r[m] = PLAN.simulate(P, i0, 10000, 104, m, { end, rebuy: true }); rows.push(r); }
      PL.bt[s] = { N: P.N, rows }; }
    const rows = PL.bt[s].rows, med = a => { const b = a.filter(v => v != null && isFinite(v)).sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : null; };
    if (rows.length < 5) { box.replaceChildren(el('h2', null, 'Har planen fungert før?'), el('p', 'ai-muted', `For kort historikk for ${NAMES[s]} til å teste planen (trenger minst 3–4 år).`)); return; }
    const av = rows.map(r => r.plan.avg / r.dca.avg - 1), vp = rows.map(r => r['plan+sell'].value / r.dca.value - 1), vb = rows.map(r => r.plan.value / r.dca.value - 1);
    const kv = el('dl', 'ai-kv'); const row = (a, b, cls) => kv.append(el('dt', null, a), el('dd', cls, b));
    row('Testet', `${rows.length} startdatoer (hver måned), 2 års kjøpsperiode, målt etter opptil 4 år`);
    row('Snittpris mot fast ukentlig kjøp', `${pct(med(av) * 100, 0)} i median – lavere i ${Math.round(av.filter(v => v < 0).length / rows.length * 100)} % av startene`, med(av) < 0 ? 'ai-pos' : 'ai-neg');
    row('Sluttverdi, bare kjøp', `${pct(med(vb) * 100, 0)} mot fast kjøp (bedre i ${Math.round(vb.filter(v => v > 0).length / rows.length * 100)} %)`, sgnCls(med(vb)));
    row('Sluttverdi, kjøp + salg', `${pct(med(vp) * 100, 0)} mot fast kjøp (bedre i ${Math.round(vp.filter(v => v > 0).length / rows.length * 100)} %)`, sgnCls(med(vp)));
    row('Største fall underveis (median)', `fast kjøp ${pct(med(rows.map(r => r.dca.mdd)) * 100, 0)} · planen med salg ${pct(med(rows.map(r => r['plan+sell'].mdd)) * 100, 0)}`);
    const tw = el('div', 'ai-tablewrap'), t = el('table', 'ai-table ai-proj'), hr = el('tr'); ['Coin', 'Snittpris mot fast kjøp', 'Lavere i', 'Sluttverdi med salg'].forEach((h, i) => hr.append(el('th', i ? null : 'l', h))); const th = el('thead'); th.append(hr); t.append(th);
    const bd = el('tbody'); [['Bitcoin', '−19 %', '98 %', '+33 %'], ['Ethereum', '−23 %', '100 %', '+32 %'], ['XRP', '−12 %', '100 %', '+81 %'], ['BNB', '−7 %', '74 %', '+5 %'], ['Solana', '−16 %', '75 %', '+28 %'], ['Cardano', '−1 %', '57 %', '+14 %'], ['Chainlink', '+1 %', '50 %', '+6 %'], ['Dogecoin', '+34 %', '32 %', '−5 %'], ['The Sandbox', '+46 %', '0 %', '−30 %']]
      .forEach(r => { const tr = el('tr'); const cl = [ 'l', r[1].startsWith('−') ? 'ai-pos' : 'ai-neg', null, r[3].startsWith('+') ? 'ai-pos' : 'ai-neg' ]; r.forEach((v, i) => tr.append(el('td', cl[i], v))); bd.append(tr); }); t.append(bd); tw.append(t);
    box.replaceChildren(el('h2', null, `Har planen fungert før for ${NAMES[s]}?`), kv, el('h3', null, 'Samme test på 9 coins (2019–2026)'), tw,
      el('p', 'ai-cap', 'Planen fungerte godt på store coins som hentet seg inn til nye topper. På Dogecoin og The Sandbox ble den dårligere enn fast kjøp: når en coin aldri kommer tilbake, betyr «kjøp mer når den faller» at du kjøper mer av noe som taper seg. Bruk den derfor på coins du har tro på over mange år.'),
      el('p', 'ai-muted', 'Kjøpsreglene ble valgt blant tre testede varianter (fall fra toppen, prisnivå mot egen historikk og faste Mayer-grenser); fall fra toppen var klart best og stabil over ulike perioder. Startdatoene overlapper og dekker bare 1–2 markedssykluser, så tallene er usikre. Gebyr 0,1 % per kjøp og salg er tatt med.'));
  }
  // ------------------------------------------------------------------ tegning
  const RENDER = { oversikt: renderOverview, assistent: renderAssist, plan: renderPlan, daytrading: renderDay, teknisk: renderTech, historikk: renderHist, signaler: renderSignals, avansert: renderAdvanced };
  const MAIN = ['ov-cards', 'ta-now', 'ta-chart', 'hs-summary', 'sg-stats', 'av-body'];
  MAIN.forEach(id => document.getElementById(id).classList.add('dash-skeleton'));
  dash.onData(() => {
    const st = load();
    if (st !== 'ok') { if (st === 'error' || st === 'missing') { MAIN.forEach(id => { const b = document.getElementById(id); b.classList.remove('dash-skeleton'); fail(b); }); } return; }
    MAIN.forEach(id => document.getElementById(id).classList.remove('dash-skeleton'));
    const tk = document.getElementById('ai-takeaway'); tk.classList.remove('dash-skeleton');
    const counts = { buy: 0, wait: 0, sell: 0, none: 0 }; state.list.forEach(s => counts[state.coins[s].status.code]++);
    const parts = []; const names = code => state.list.filter(s => state.coins[s].status.code === code).map(s => NAMES[s]).join(', ');
    if (counts.buy) parts.push(`Mulig kjøpsoppsett: ${names('buy')}.`); if (counts.sell) parts.push(`Mulig salgs-/exit-oppsett: ${names('sell')}.`);
    if (counts.wait) parts.push(`Avventer bekreftelse: ${names('wait')}.`); if (counts.none) parts.push(`Ingen tydelig mulighet: ${names('none')}.`);
    if (!counts.buy && !counts.sell) parts.unshift('Ingen av coinene har et tydelig kjøps- eller salgsoppsett akkurat nå.');
    tk.textContent = parts.join(' ');
    const asOf = Math.max(...state.list.map(s => state.coins[s].asOf));
    document.getElementById('ai-asof').textContent = `Analysert ${dfmt(asOf)} (siste dagslukk)`;
    drawNav();
    try { RENDER[tabNow()](); } catch (e) { console.error(e); throw e; }
    if (state.why) openWhy(state.why.key, state.why.sym);
  });
})();
