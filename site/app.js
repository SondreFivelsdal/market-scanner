(() => {
  // ------------------------------------------------------------------ felles
  const NAMES = { BTC: 'Bitcoin', XRP: 'XRP', POL: 'Polygon', SAND: 'The Sandbox' };
  const ORDER = ['BTC', 'XRP', 'POL', 'SAND'];
  const TABS = ['oversikt', 'teknisk', 'historikk', 'signaler', 'avansert'];
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
     'Sammenligner med alle fire coins (BTC, XRP, POL, SAND) – oppgitt coin og dato for hvert tilfelle.',
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
    const bd = el('tbody'); [['1 dag', s.h1], ['7 dager', s.h7], ['30 dager', s.h30]].forEach(([lab, v]) => { const tr = el('tr'); tr.append(el('td', 'l', lab), el('td', null, shareCi(v.pos, v.ci)), el('td', sgnCls(v.median), pct(v.median)), el('td', sgnCls(v.mean), pct(v.mean)), el('td', 'ai-pos', pct(v.best)), el('td', 'ai-neg', pct(v.worst))); bd.append(tr); }); tb.append(bd); tw.append(tb);
    const kv = el('dl', 'ai-kv'); const row = (a, b, cls) => { kv.append(el('dt', null, a), el('dd', cls, b)); };
    row('Største nedtur underveis (median / verste)', `${pct(s.mae.median)} / ${pct(s.mae.worst)}`, 'ai-neg');
    row('Største oppgang underveis (median)', pct(s.mfe.median), 'ai-pos');
    row('Nærmeste støtte brutt (dagslukk under) innen 30 d', share(s.supBroke));
    row('Nærmeste motstand brutt (dagslukk over) innen 30 d', share(s.resBroke));
    row(`Alle dager i samme regime: andel positive etter 30 d (n=${an.base.n})`, `${share(an.base.pos)} · median ${pct(an.base.median)}`);
    row(`${NAMES[c.sym]} alene i samme regime (n=${an.baseOwn.n})`, `${share(an.baseOwn.pos)} · median ${pct(an.baseOwn.median)}`);
    row('Bitcoin i de samme periodene (median 30 d)', pct(s.btc30));
    box.replaceChildren(el('h2', null, 'Historiske resultater'), el('p', 'ai-muted', 'Avkastning fra dagslukk på signaldagen. «Andel positive» er andelen tilfeller med høyere pris; intervallet tar hensyn til at tilfellene ikke er helt uavhengige.'), tw, kv);
  }
  function drawFan(c) {
    const box = document.getElementById('hs-fan'); box.querySelector('svg')?.remove(); box.querySelector('.ai-tip')?.remove(); const an = c.analog; if (!an || !an.ok) return;
    const W = Math.max(300, box.clientWidth), H = W < 600 ? 260 : 320; box.style.minHeight = H + 'px';
    const today = an.today.map((v, i, a) => ({ j: i - (a.length - 1), v: (v - 1) * 100 }));
    const fan = an.fan.map(f => ({ j: f.j, q10: (f.q10 - 1) * 100, q25: (f.q25 - 1) * 100, q50: (f.q50 - 1) * 100, q75: (f.q75 - 1) * 100, q90: (f.q90 - 1) * 100 }));
    const pre = an.preFan.map(f => ({ j: f.j, v: f.q50 == null ? null : (f.q50 - 1) * 100 }));
    const all = [...today.map(d => d.v), ...fan.flatMap(f => [f.q10, f.q90]), ...pre.map(d => d.v)].filter(v => v != null && isFinite(v));
    const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.06;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Dagens prisutvikling og spredningen i lignende historiske forløp');
    const y = d3.scaleLinear([lo - pad, hi + pad], [H - 26, 10]).nice(); const ty = y.ticks(6);
    const m = { l: measure(svg, ty.map(v => pct(v, 0))) + 12, r: 24 };
    const x = d3.scaleLinear([-60, 30], [m.l, W - m.r]);
    svg.append('g').selectAll('line').data(ty).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    const ya = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(ty).tickFormat(v => pct(v, 0)).tickSize(0)); ya.select('.domain').remove(); axisStyle(ya);
    const xa = svg.append('g').attr('transform', `translate(0,${H - 26})`).call(d3.axisBottom(x).tickValues(W < 600 ? [-60, -30, 0, 30] : [-60, -30, 0, 10, 20, 30]).tickFormat(v => v === 0 ? 'I dag' : (v > 0 ? '+' : '−') + Math.abs(v) + ' d').tickSizeOuter(0)); xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); axisStyle(xa);
    svg.append('rect').attr('x', x(0)).attr('width', x(30) - x(0)).attr('y', 10).attr('height', H - 36).attr('fill', 'var(--color-bg)');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    svg.append('path').datum(fan).attr('d', d3.area().x(d => x(d.j)).y0(d => y(d.q10)).y1(d => y(d.q90))).attr('fill', dash.colors[0]).attr('fill-opacity', 0.12);
    svg.append('path').datum(fan).attr('d', d3.area().x(d => x(d.j)).y0(d => y(d.q25)).y1(d => y(d.q75))).attr('fill', dash.colors[0]).attr('fill-opacity', 0.22);
    svg.append('path').datum(fan).attr('d', d3.line().x(d => x(d.j)).y(d => y(d.q50))).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 2).attr('stroke-dasharray', '5 3');
    svg.append('path').datum(pre.filter(d => d.v != null)).attr('d', d3.line().x(d => x(d.j)).y(d => y(d.v))).attr('fill', 'none').attr('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 1.5).attr('stroke-dasharray', '5 3');
    svg.append('path').datum(today).attr('d', d3.line().x(d => x(d.j)).y(d => y(d.v))).attr('fill', 'none').attr('stroke', 'var(--color-fg)').attr('stroke-width', 2.2).attr('stroke-linejoin', 'round');
    svg.append('circle').attr('cx', x(0)).attr('cy', y(0)).attr('r', 4).attr('fill', 'var(--color-fg)');
    const lf = fan[fan.length - 1]; [['q50', 'Median'], ['q90', '90. pers.'], ['q10', '10. pers.']].forEach(([k, lab]) => svg.append('text').attr('x', x(30) - 4).attr('y', y(lf[k]) - 5).attr('text-anchor', 'end').attr('font-size', 'var(--cds-font-size-caption)').attr('fill', 'var(--color-fg-muted)').attr('paint-order', 'stroke').attr('stroke', 'var(--color-panel)').attr('stroke-width', 3).text(`${lab} ${pct(lf[k], 0)}`));
    const tip = tipOf(box);
    svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', H).attr('fill', 'transparent')
      .on('pointermove', ev => { const [px] = d3.pointer(ev); const j = Math.round(x.invert(px)); const lines = [el('div', 'd', j === 0 ? 'I dag' : (j > 0 ? `+${j} dager` : `${j} dager`))];
        if (j <= 0) { const t = today.find(d => d.j === j); const p = pre.find(d => d.j === j); if (t) lines.push(el('div', null, `I dag-forløpet: ${pct(t.v)}`)); if (p && p.v != null) lines.push(el('div', 'ai-muted', `Median lignende tilfeller: ${pct(p.v)}`)); }
        else { const f = fan.find(d => d.j === j); if (f) lines.push(el('div', null, `Median ${pct(f.q50)}`), el('div', 'ai-muted', `Midterste halvdel ${pct(f.q25)} til ${pct(f.q75)}`), el('div', 'ai-muted', `80 % av tilfellene ${pct(f.q10)} til ${pct(f.q90)}`)); }
        tip.replaceChildren(...lines); const kx = box.clientWidth / W; place(box, tip, x(j) * kx, 60); })
      .on('pointerleave', () => { tip.hidden = true; });
    const lg = document.getElementById('hs-fan-legend'); const it = (sty, txt) => { const s = el('span'); const i = el('i'); Object.assign(i.style, sty); s.append(i, document.createTextNode(txt)); return s; };
    lg.replaceChildren(it({ color: 'var(--color-fg)' }, `${NAMES[c.sym]} siste 60 dager`), it({ color: 'var(--cds-chart-muted)', borderTopStyle: 'dashed' }, 'Median før signal i lignende tilfeller'), it({ color: dash.colors[0], borderTopStyle: 'dashed' }, 'Median etter'), it({ background: dash.colors[0], opacity: '.3', height: '10px', border: '0' }, 'Spredning (25–75 % og 10–90 %)'));
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
  function renderHist() { const c = cur(); if (!c) return; renderHistSummary(c); drawFan(c); renderHistStats(c); renderCases(c); renderCompare(c); }

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
    rb.replaceChildren(el('h2', null, 'Signaler siste 12 måneder'), el('p', 'ai-muted', 'Tekniske hendelser i dagsgrafen. Resultatene måles fra dagslukk samme dag. Se dem i grafen under Teknisk analyse ved å slå på «Kjøps-/salgssignaler» og «Tekniske hendelser».'), ev.length ? tw2 : el('p', 'ai-muted', 'Ingen hendelser siste 12 måneder.'));
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
    analog: { t: 'Historisk scenario-motor', what: 'Finner dagene i historikken til BTC, XRP, POL og SAND der 14 tekniske kjennetegn lignet mest på i dag, og ser hva som skjedde etterpå.', why: 'Gir et ærlig bilde av hvor ulikt lignende situasjoner har endt – og om de skilte seg fra en vanlig dag.', fake: 'Likhet i indikatorer betyr ikke samme årsaker. Tilfeller som ligger nær hverandre i tid er ikke uavhengige, derfor vises antall uavhengige perioder og intervaller.', spot: 'Når andelen positive i lignende tilfeller ikke skiller seg fra basisraten, har situasjonen ingen historisk fordel.', ev: [], now: c => c.analog && c.analog.ok ? `${c.analog.n} tilfeller, ca. ${c.analog.nEff} uavhengige perioder, snittlikhet ${c.analog.meanSim} %.` : 'Ingen tilfeller.' },
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

  // ------------------------------------------------------------------ tegning
  const RENDER = { oversikt: renderOverview, teknisk: renderTech, historikk: renderHist, signaler: renderSignals, avansert: renderAdvanced };
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
    if (!counts.buy && !counts.sell) parts.unshift('Ingen av de fire har et tydelig kjøps- eller salgsoppsett akkurat nå.');
    tk.textContent = parts.join(' ');
    const asOf = Math.max(...state.list.map(s => state.coins[s].asOf));
    document.getElementById('ai-asof').textContent = `Analysert ${dfmt(asOf)} (siste dagslukk)`;
    drawNav();
    try { RENDER[tabNow()](); } catch (e) { console.error(e); throw e; }
    if (state.why) openWhy(state.why.key, state.why.sym);
  });
})();
