// Oversikt-fanen: enkel markedsoversikt, coin-liste med trend, interaktiv graf og forklaring i klartekst.
// Kursdata hentes direkte i nettleseren fra Binance (offentlig API). Markedsverdi fra CoinGecko, stemning fra alternative.me.
// Toppkurs og «realistisk spenn» kommer fra data/history.json (bygges av GitHub Actions). Mangler noe, står det at det mangler.
(() => {
  'use strict';
  const BIN = 'https://data-api.binance.vision/api/v3/';
  const MS = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
  const PER = { '1D': ['1 dag', '15m', 96], '1U': ['1 uke', '1h', 168], '1M': ['1 måned', '4h', 180], '3M': ['3 måneder', '1d', 92], '1Å': ['1 år', '1d', 366], '5Å': ['5 år', '1w', 262] };
  const POLL = { '15m': 15e3, '1h': 3e4, '4h': 6e4, '1d': 6e4, '1w': 3e5 };
  const IND = { lv: ['Støtte og motstand', true], tl: ['Trendlinjer', true], vol: ['Volum', true], w50: ['50-ukerslinja', true], s300: ['300-dagerslinja', false], e50: ['50-dagerslinja', false], e20: ['20-dagerslinja', false], vwap: ['VWAP (dagssnitt)', false], bb: ['Bollinger-bånd', false], mk: ['Regelskifter (piler)', false] };
  const T = { sym: null, per: '3M', sub: 'none', ind: Object.fromEntries(Object.entries(IND).map(([k, v]) => [k, v[1]])), kl: {}, glob: null, fng: null, built: false, chart: null, timer: null, dayAt: 0 };
  try { const s = JSON.parse(localStorage.getItem('ms-term2') || '{}'); if (s.ind && s.ind.tl == null) s.ind.tl = true; if (s.per && PER[s.per]) T.per = s.per; if (s.sub) T.sub = s.sub; if (s.ind) Object.assign(T.ind, s.ind); } catch (e) { /* ingen lagring */ }
  const save = () => { try { localStorage.setItem('ms-term2', JSON.stringify({ per: T.per, sub: T.sub, ind: T.ind })); } catch (e) { /* ignorer */ } };

  // ---------------------------------------------------------------- hjelpere
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const price = v => v == null || !isFinite(v) ? '–' : (v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) : v >= 1 ? nf(v, { maximumFractionDigits: 2 }) : nf(v, { maximumSignificantDigits: 3 })) + ' $';
  const pct = (v, d = 1) => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v * 100), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  const pct0 = v => pct(v, 0);
  const pa = v => v == null || !isFinite(v) ? '–' : nf(Math.abs(v * 100), { maximumFractionDigits: 0 }) + ' %';
  const big = v => v == null ? '–' : v >= 1e12 ? nf(v / 1e12, { maximumFractionDigits: 2 }) + ' billioner $' : nf(v / 1e9, { maximumFractionDigits: 0 }) + ' milliarder $';
  const hm = t => t ? new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }) : '–';
  const dmy = t => new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const my = t => new Date(t).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const names = () => window.NAMES || {}, list = () => window.COINS || ['BTC'];
  const getJSON = (url, ms = 12000) => { const c = new AbortController(), to = setTimeout(() => c.abort(), ms);
    return fetch(url, { cache: 'no-store', signal: c.signal }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(() => clearTimeout(to)); };
  const hist = () => { const H = dash.data('history'); return H.status === 'ok' ? H.data : null; };
  const live = s => (window.__live || {})[s];

  // ---------------------------------------------------------------- candles
  const key = (s, tf) => s + '|' + tf;
  const mapK = a => a.map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], ct: x[6], qv: +x[7] }));
  function loadK(sym, tf, force) {
    const k = key(sym, tf), c = T.kl[k] || (T.kl[k] = { B: null, at: 0, err: null, errAt: 0, p: null });
    if (c.p) return c.p; if (!force && c.B && Date.now() - c.at < 2e4) return Promise.resolve(c);
    c.p = getJSON(`${BIN}klines?symbol=${sym}USDT&interval=${tf}&limit=${tf === '1d' ? 1000 : 500}`).then(a => { if (!Array.isArray(a) || !a.length) throw new Error('tomt svar'); c.B = mapK(a); c.at = Date.now(); c.err = null; return c; })
      .catch(e => { c.err = String(e.message || e); c.errAt = Date.now(); return c; }).finally(() => { c.p = null; });
    return c.p;
  }
  function tickK(sym, tf) {
    const c = T.kl[key(sym, tf)]; if (!c || !c.B) return loadK(sym, tf, true); if (c.p) return c.p;
    c.p = getJSON(`${BIN}klines?symbol=${sym}USDT&interval=${tf}&limit=3`).then(a => { for (const b of mapK(a)) { const L = c.B[c.B.length - 1]; if (b.t === L.t) c.B[c.B.length - 1] = b; else if (b.t > L.t) c.B.push(b); } c.at = Date.now(); c.err = null; return c; })
      .catch(e => { c.err = String(e.message || e); c.errAt = Date.now(); return c; }).finally(() => { c.p = null; });
    return c.p;
  }
  const closedEnd = B => { let e = B.length - 1; while (e >= 0 && B[e].ct > Date.now()) e--; return e; };
  // 50-ukerslinja regnet fra dagslukk: snittet av de siste 50 fullførte ukelukkene (uke = mandag–søndag UTC). Verdien for en dag
  // er linja fra siste uke som var ferdig da dagen startet – samme som en ukegraf viser.
  function w50daily(B) { const wk = t => t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5, W = [];
    B.forEach((b, i) => { const w = wk(b.t); if (!W.length || W[W.length - 1].w !== w) W.push({ w, c: b.c }); else W[W.length - 1].c = b.c; });
    const S = RG.sma(W.map(x => x.c), 50), byW = new Map(W.map((x, k) => [x.w, k]));
    return B.map(b => { const k = byW.get(wk(b.t)); return k > 0 ? S[k - 1] : null; }); }

  // ---------------------------------------------------------------- støtte og motstand: opptil 3 nivåer hver vei, med avstand mellom
  // Nivåene er svingpunkter (der kursen har snudd før), samlet til soner. Neste nivå må ligge et stykke unna det forrige,
  // og innenfor hvert steg velges nivået med flest berøringer. Nivå 2 og 3 er «neste mål» hvis kursen bryter gjennom nivå 1.
  function srLevels(B, e, px, tf) {
    if (e < 30) return { sup: [], res: [] }; const S = B.slice(0, e + 1), A = RG.atr(S)[e] || px * 0.02;
    const lv = RG.levels(S, e, A, tf === '1w' ? 2 : 3, tf === '1d' ? 900 : tf === '1w' ? 480 : 480);
    const gap = Math.max(1.2 * A, px * ({ '15m': 0.006, '1h': 0.012, '4h': 0.02, '1d': 0.03, '1w': 0.06 }[tf] || 0.03));
    const pick = (arr, dir) => { const out = []; let ref = px, first = true;
      while (out.length < 3) { const c = arr.filter(l => dir * (l.p - ref) >= (first ? 0 : gap)); if (!c.length) break; first = false;
        const w = c.filter(l => Math.abs(l.p - c[0].p) <= gap); const best = w.reduce((a, b) => b.n > a.n ? b : a, w[0]); out.push(best); ref = best.p; }
      return out; };
    return { sup: pick(lv.filter(l => l.p < px).sort((a, b) => b.p - a.p), -1), res: pick(lv.filter(l => l.p > px).sort((a, b) => a.p - b.p), 1), A };
  }

  // ---------------------------------------------------------------- trend fra 200-dagerslinja (dagslukk)
  function trend(sym) {
    const c = T.kl[key(sym, '1d')]; if (!c || !c.B || c.B.length < 220) return null;
    const B = c.B, e = closedEnd(B), cl = B.map(b => b.c), E = RG.ema(cl, 200), E50 = RG.ema(cl, 50), above = cl[e] > E[e], S300 = RG.sma(cl, 300), W50 = w50daily(B);
    let side = 0; for (let i = e; i >= 0 && E[i] != null && (cl[i] > E[i]) === above; i--) side++;
    const L = live(sym), px = L && L.p ? L.p : B[B.length - 1].c, near = Math.abs(px / E[e] - 1) < 0.02;
    const back = n => e - n >= 0 ? px / cl[e - n] - 1 : null; // fra lukk for n dager siden
    const H = hist(), hn = H && H.coins && H.coins[sym] ? H.coins[sym].now : null;
    const ath = hn ? Math.max(hn.ath, px) : null, athT = hn ? (px > hn.ath ? Date.now() : hn.athT) : null;
    const SR = srLevels(B, e, px, '1d'), floor = SR.sup[0], roof = SR.res[0];
    const TL = RG.trendlines(B, e, { look: 180 });
    return { sr: SR, tl: TL, px, e200: E[e], e50: E50[e], above, side, near, d200: px / E[e] - 1, r7: back(7), r30: back(30), ath, athT, dd: ath ? px / ath - 1 : null, floor: floor && floor.p, roof: roof && roof.p, closeT: B[e].t, s300: S300[e], w50: W50[B.length - 1] };
  }
  const TR = (t, err) => !t ? (err ? ['Data mangler', 'muted'] : ['Henter …', '']) : t.near ? ['Ved trendlinja', 'warn'] : t.above ? ['▲ Opptrend', 'up'] : ['▼ Nedtrend', 'down'];

  // ---------------------------------------------------------------- markedsdata
  function loadGlobal() {
    getJSON('https://api.coingecko.com/api/v3/global').then(j => { const d = j && j.data; if (!d) throw new Error('tomt');
      T.glob = { mcap: d.total_market_cap && d.total_market_cap.usd, chg: d.market_cap_change_percentage_24h_usd / 100, btcD: d.market_cap_percentage && d.market_cap_percentage.btc, t: d.updated_at ? d.updated_at * 1000 : Date.now() }; })
      .catch(e => { T.glob = Object.assign({}, T.glob, { err: String(e.message || e) }); }).finally(drawBar);
    getJSON('https://api.alternative.me/fng/?limit=2').then(j => { const d = j && j.data && j.data[0]; if (!d) throw new Error('tomt');
      T.fng = { v: +d.value, cls: d.value_classification, t: +d.timestamp * 1000, prev: j.data[1] ? +j.data[1].value : null }; })
      .catch(e => { T.fng = Object.assign({}, T.fng, { err: String(e.message || e) }); }).finally(drawBar);
  }
  const FNG = { 'Extreme Fear': ['Ekstrem frykt', 'down'], Fear: ['Frykt', 'down'], Neutral: ['Nøytral', ''], Greed: ['Grådighet', 'up'], 'Extreme Greed': ['Ekstrem grådighet', 'up'] };
  function kpi(k, v, vc, s) { const d = el('div', 'kpi'); d.append(el('span', 'k', k), el('span', 'v ' + (vc || ''), v), el('span', 's', s)); return d; }
  function drawBar() {
    const box = document.getElementById('tm-bar'); if (!box) return; const out = [], sym = T.sym || 'BTC', b = live(sym), nm = names()[sym] || sym, btc = live('BTC');
    // første kort følger coinen som er valgt i lista; Bitcoin vises da i markedskortet
    const t = trend(sym), [lab] = TR(t), sub2 = [`${b && b.chg != null ? pct(b.chg / 100) : '–'} siste døgn`]; if (t) sub2.push(lab.replace(/^[▲▼] /, '').toLowerCase()); if (t && t.dd != null && t.dd < -0.005) sub2.push(`${pct0(t.dd)} fra toppen`);
    out.push(b && b.p ? kpi(`${nm} (valgt)`, price(b.p), '', sub2.join(' · ')) : kpi(nm, 'Ikke tilgjengelig', 'muted', 'Binance svarer ikke akkurat nå'));
    const btcTxt = sym !== 'BTC' && btc && btc.p ? `Bitcoin ${price(btc.p)} (${pct(btc.chg / 100)}) · ` : '';
    const g = T.glob; out.push(g && g.mcap ? kpi('Hele kryptomarkedet', big(g.mcap), '', `${pct(g.chg)} siste døgn · ${btcTxt}Bitcoin er ${nf(g.btcD, { maximumFractionDigits: 0 })} % av markedet`) : kpi('Hele kryptomarkedet', g && g.err ? 'Ikke tilgjengelig' : 'Henter …', 'muted', g && g.err ? 'CoinGecko svarer ikke akkurat nå' : ''));
    const f = T.fng; if (f && f.v != null) { const [w, c] = FNG[f.cls] || [f.cls, '']; out.push(kpi('Stemningen i markedet', `${w} (${f.v})`, c, `Skala 0–100: lavt = folk er redde, høyt = folk er grådige${f.prev != null ? ` · i går ${f.prev}` : ''}`)); }
    else out.push(kpi('Stemningen i markedet', f && f.err ? 'Ikke tilgjengelig' : 'Henter …', 'muted', f && f.err ? 'alternative.me svarer ikke' : ''));
    const mc = window.MACRO && MACRO.summary(); { const k = mc ? kpi('Makrobildet', mc.label, mc.cls, `${mc.counts.gronn} av ${mc.counts.gronn + mc.counts.gul + mc.counts.rod} drivere grønne · trykk for detaljer`) : kpi('Makrobildet', 'Henter …', 'muted', '');
      k.classList.add('mk'); k.setAttribute('role', 'link'); k.tabIndex = 0; const go = () => { dash.setParams({ tab: 'makro' }); window.scrollTo({ top: 0 }); };
      k.addEventListener('click', go); k.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); out.push(k); }
    box.replaceChildren(...out);
  }

  // ---------------------------------------------------------------- coin-liste
  function drawCoins() {
    const box = document.getElementById('tm-coins'); if (!box) return;
    box.replaceChildren(...list().map(s => { const L = live(s), t = trend(s), dk = T.kl[key(s, '1d')], [lab, c] = TR(t, dk && !dk.B && dk.err);
      const b = el('button', 'coin' + (s === T.sym ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-pressed', s === T.sym ? 'true' : 'false');
      const nm = el('span', 'nm'); nm.append(el('b', null, names()[s] || s), el('span', 'muted', ' ' + s));
      const px = el('span', 'px'); px.append(document.createTextNode(L && L.p ? price(L.p) + ' ' : 'Ikke tilgjengelig '), el('span', cls(L && L.chg) + ' small', L && L.chg != null ? pct(L.chg / 100) : ''));
      const ath = el('span', 'ath', t && t.dd != null ? (t.dd > -0.005 ? 'På rekordnivå' : `${pct0(t.dd)} fra toppen`) : '');
      b.append(nm, px, el('span', 'pill ' + c, lab), ath);
      b.addEventListener('click', () => { T.sym = s; dash.setParams({ coin: s }); drawCoins(); drawBar(); drawDetail(true); const d = document.getElementById('tm-detail'); if (d.getBoundingClientRect().top > window.innerHeight * 0.5) d.scrollIntoView({ behavior: 'smooth' }); });
      return b; }));
  }
  function loadDays(force) { if (!force && Date.now() - T.dayAt < 5 * 6e4) return; T.dayAt = Date.now();
    let i = 0; const L = list(), run = () => { if (i >= L.length) return null; const s = L[i++]; return loadK(s, '1d', true).then(() => { drawCoins(); if (s === T.sym) { drawExplain(); drawLevels(); paint(); } }).then(run); }; run(); run(); }

  // ---------------------------------------------------------------- graf
  const tz = t => -new Date(t).getTimezoneOffset() * 60, ts = t => Math.floor(t / 1000) + tz(t);
  const prec = p => p >= 1000 ? 0 : p >= 100 ? 1 : p >= 1 ? 3 : p >= 0.01 ? 5 : 7;
  function makeChart() {
    const LW = window.LightweightCharts; if (!LW) return null;
    const opt = () => ({ autoSize: true, localization: { locale: 'nb-NO', dateFormat: 'dd.MM.yy' }, layout: { background: { type: 'solid', color: css('--panel') }, textColor: css('--muted'), fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 13 },
      grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line') },
      timeScale: { borderColor: css('--line'), timeVisible: true, secondsVisible: false, rightOffset: 3 }, crosshair: { mode: 0 }, handleScale: { axisPressedMouseMove: true } });
    const ch = LW.createChart(document.getElementById('tm-chart'), opt()), sc = LW.createChart(document.getElementById('tm-sub'), Object.assign(opt(), { timeScale: { visible: false } }));
    const up = css('--up'), dn = css('--down'), ln = (color, w = 2, style = 0) => ch.addLineSeries({ color, lineWidth: w, lineStyle: style, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const S = { candle: ch.addCandlestickSeries({ upColor: up, downColor: dn, wickUpColor: up, wickDownColor: dn, borderVisible: false }),
      vol: ch.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }),
      e200: ln(css('--orange'), 3), e50: ln(css('--blue'), 2), e20: ln(css('--purple'), 1), vwap: ln(css('--axis'), 1, 2), bbU: ln(css('--axis'), 1), bbL: ln(css('--axis'), 1),
      tlUp: ln(up, 2), tlDn: ln(dn, 2), w50: ch.addLineSeries({ color: css('--fg'), lineWidth: 2, lineStyle: 2, lineType: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }), s300: ln(css('--orange'), 2, 1),
      o1: sc.addLineSeries({ color: css('--blue'), lineWidth: 1, priceLineVisible: false }), o2: sc.addLineSeries({ color: css('--purple'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false }), oh: sc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }) };
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    let lock = false; const sync = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange(r => { if (lock || !r) return; lock = true; b.timeScale().setVisibleLogicalRange(r); lock = false; }); sync(ch, sc); sync(sc, ch);
    ch.subscribeCrosshairMove(p => { const C = T.chart; if (!C || !C.B) return; const b = p && p.time != null ? C.byT.get(p.time) : null; hover(b || C.B[C.B.length - 1], !b); });
    const host = document.getElementById('tm-chart'); host.style.position = 'relative'; const layer = el('div', 'zlayer'); host.append(layer);
    ch.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(placeZones)); if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(placeZones)).observe(host);
    return { ch, sc, S, lines: [], osc: [], k: null, B: null, byT: new Map(), layer, zones: [] };
  }
  function hover(b, last) { const box = document.getElementById('tm-hover'); if (!box || !b) return; const tf = PER[T.per][1];
    const when = tf === '1d' ? dmy(b.t) : tf === '1w' ? 'Uke fra ' + dmy(b.t) : new Date(b.t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    box.replaceChildren(document.createTextNode(`${last ? 'Siste: ' : ''}${when} · åpnet ${price(b.o)} · høyest ${price(b.h)} · lavest ${price(b.l)} · ${last ? 'nå' : 'sluttet'} ${price(b.c)} `), el('span', cls(b.c - b.o), pct(b.c / b.o - 1))); }
  const line = (B, a) => B.map((b, i) => a[i] == null ? { time: ts(b.t) } : { time: ts(b.t), value: a[i] });
  function paint(full) {
    const C = T.chart; if (!C || !T.sym) return; const [, tf, show] = PER[T.per], c = T.kl[key(T.sym, tf)]; if (!c || !c.B) return;
    const B = c.B, k = key(T.sym, T.per), cl = B.map(b => b.c), up = css('--up'), dn = css('--down');
    if (full || C.k !== k) { const p = prec(B[B.length - 1].c); C.S.candle.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: Math.pow(10, -p) } }); }
    C.byT = new Map(B.map(b => [ts(b.t), b]));
    C.S.candle.setData(B.map(b => ({ time: ts(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    C.S.vol.setData(T.ind.vol ? B.map(b => ({ time: ts(b.t), value: b.qv, color: (b.c >= b.o ? up : dn) + '40' })) : []);
    // 200-dagerslinja: regnes alltid på dagslukk. På dagsgraf som linje, på ukegraf der dagsdata finnes, ellers som vannrett strek.
    const D = T.kl[key(T.sym, '1d')], tr = trend(T.sym); C.lines.forEach(l => C.S.candle.removePriceLine(l)); C.lines = [];
    const pl = (p, color, title, style = 2, w = 2) => { if (p == null || !isFinite(p)) return; C.lines.push(C.S.candle.createPriceLine({ price: p, color, lineWidth: w, lineStyle: style, axisLabelVisible: true, title })); };
    if (tf === '1d') C.S.e200.setData(line(B, RG.ema(cl, 200)));
    else if (tf === '1w' && D && D.B) { const E = RG.ema(D.B.map(b => b.c), 200), m = new Map(D.B.map((b, i) => [b.t, E[i]])); C.S.e200.setData(B.map(b => { let v = null; for (let d = 6; d >= 0 && v == null; d--) v = m.get(b.t + d * 864e5); return v == null ? { time: ts(b.t) } : { time: ts(b.t), value: v }; })); }
    else { C.S.e200.setData([]); if (tr) pl(tr.e200, css('--orange'), '200-dagerslinja', 0, 2); }
    const isD = tf === '1d'; C.S.e50.setData(T.ind.e50 && isD ? line(B, RG.ema(cl, 50)) : []); C.S.e20.setData(T.ind.e20 && isD ? line(B, RG.ema(cl, 20)) : []);
    // 50-ukers og 300-dagers: linjer på dags- og ukegraf, vannrette streker ellers
    if (T.ind.w50 && isD) C.S.w50.setData(line(B, w50daily(B))); else if (T.ind.w50 && tf === '1w') C.S.w50.setData(line(B, RG.sma(cl, 50))); else { C.S.w50.setData([]); if (T.ind.w50 && tr && tr.w50) pl(tr.w50, css('--fg'), '50-ukerslinja', 2, 1); }
    if (T.ind.s300 && isD) C.S.s300.setData(line(B, RG.sma(cl, 300)));
    else if (T.ind.s300 && tf === '1w' && D && D.B) { const S3 = RG.sma(D.B.map(b => b.c), 300), m3 = new Map(D.B.map((b, i) => [b.t, S3[i]])); C.S.s300.setData(B.map(b => { let v = null; for (let d = 6; d >= 0 && v == null; d--) v = m3.get(b.t + d * 864e5); return v == null ? { time: ts(b.t) } : { time: ts(b.t), value: v }; })); }
    else { C.S.s300.setData([]); if (T.ind.s300 && tr && tr.s300) pl(tr.s300, css('--orange'), '300-dagerslinja', 1, 1); }
    if (!isD && tf !== '1w' && tr && T.ind.e50) pl(tr.e50, css('--blue'), '50-dagerslinja', 0, 1);
    C.S.vwap.setData(T.ind.vwap && MS[tf] < MS['1d'] ? line(B, RG.vwap(B)) : []);
    const bb = T.ind.bb ? RG.boll(cl) : null; C.S.bbU.setData(bb ? line(B, bb.up) : []); C.S.bbL.setData(bb ? line(B, bb.lo) : []);
    // støtte/motstand som soner, regnet på tidsrammen som vises (bare lukkede candles)
    const e = closedEnd(B), A = RG.atr(B.slice(0, e + 1))[e] || B[e].c * 0.02, pxNow = B[B.length - 1].c; C.zones = [];
    if (T.ind.lv && e > 30) { const SR = srLevels(B, e, pxNow, tf), half = Math.max(0.25 * A, pxNow * 0.003), below = SR.sup, above = SR.res;
      const strength = n => n >= 3 ? `sterk (${n} berøringer)` : n === 2 ? '2 berøringer' : '1 berøring';
      below.forEach((l, i) => { C.zones.push({ lo: l.p - half, hi: l.p + half, p: l.p, kind: 'up', short: `Støtte ${i + 1}`, label: `Støtte ${i + 1}${i ? ' – neste mål ned' : ''} · ${strength(l.n)}` }); C.lines.push(C.S.candle.createPriceLine({ price: l.p, color: up, lineWidth: 1, lineVisible: false, axisLabelVisible: true, title: '' })); });
      above.forEach((l, i) => { C.zones.push({ lo: l.p - half, hi: l.p + half, p: l.p, kind: 'down', short: `Motstand ${i + 1}`, label: `Motstand ${i + 1}${i ? ' – neste mål opp' : ''} · ${strength(l.n)}` }); C.lines.push(C.S.candle.createPriceLine({ price: l.p, color: dn, lineWidth: 1, lineVisible: false, axisLabelVisible: true, title: '' })); }); }
    // trendlinjer
    const TLv = T.ind.tl && e > 40 ? RG.trendlines(B, e, { look: Math.min(250, Math.max(show, 120)), k: tf === '1w' ? 3 : 4 }) : { up: null, down: null }; C.tl = TLv;
    const tlData = x => x ? x.pts.map(p => ({ time: ts(p.t), value: p.v })) : [];
    C.S.tlUp.setData(tlData(TLv.up)); C.S.tlDn.setData(tlData(TLv.down));
    const inc = [...C.zones.filter(z => z.kind === 'up').slice(0, 2), ...C.zones.filter(z => z.kind === 'down').slice(0, 2)];
    C.S.candle.applyOptions({ autoscaleInfoProvider: orig => { const r = orig(); if (!r || !r.priceRange || !inc.length) return r;
      return { priceRange: { minValue: Math.min(r.priceRange.minValue, ...inc.map(z => z.lo)), maxValue: Math.max(r.priceRange.maxValue, ...inc.map(z => z.hi)) }, margins: r.margins }; } });
    requestAnimationFrame(placeZones);
    // ekstra panel
    const sub = document.getElementById('tm-sub'); sub.hidden = T.sub === 'none'; (C.osc || []).forEach(l => C.S.o1.removePriceLine(l)); C.osc = [];
    const oscL = lv => { C.osc = lv.map(v => C.S.o1.createPriceLine({ price: v, color: css('--axis'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false })); };
    if (T.sub === 'rsi') { C.S.o1.setData(line(B, RG.rsi(cl))); C.S.o2.setData([]); C.S.oh.setData(B.map(b => ({ time: ts(b.t) }))); oscL([70, 30]); }
    else if (T.sub === 'macd') { const M = RG.macd(cl); C.S.o1.setData(line(B, M.macd)); C.S.o2.setData(line(B, M.signal)); C.S.oh.setData(B.map((b, i) => M.hist[i] == null ? { time: ts(b.t) } : { time: ts(b.t), value: M.hist[i], color: (M.hist[i] >= 0 ? up : dn) + '99' })); oscL([0]); }
    else if (T.sub === 'atr') { const A = RG.atr(B); C.S.o1.setData(line(B, A.map((v, i) => v == null ? null : v / B[i].c * 100))); C.S.o2.setData([]); C.S.oh.setData(B.map(b => ({ time: ts(b.t) }))); }
    else { C.S.o1.setData([]); C.S.o2.setData([]); C.S.oh.setData([]); }
    C.S.candle.setMarkers(T.ind.mk ? markers(B) : []);
    if (C.k !== k) { const n = B.length; C.ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - show), to: n + 2 }); }
    C.k = k; C.B = B; hover(B[B.length - 1], true); legend(tf);
  }
  function placeZones() { const C = T.chart; if (!C || !C.layer) return; const w = C.ch.timeScale().width();
    C.layer.replaceChildren(...C.zones.map(z => { const y1 = C.S.candle.priceToCoordinate(z.hi), y2 = C.S.candle.priceToCoordinate(z.lo); if (y1 == null || y2 == null) return null;
      const d = el('div', 'zone ' + z.kind); d.style.top = Math.min(y1, y2) + 'px'; d.style.height = Math.max(3, Math.abs(y2 - y1)) + 'px'; d.style.width = w + 'px'; d.append(el('span', null, w < 520 ? z.short : z.label)); return d; }).filter(Boolean)); }
  function markers(B) { const s = RG.biasSeries(B, closedEnd(B)), out = []; let prev = null;
    for (const x of s) { if (x.b !== prev && prev != null && x.b !== 'neutral') out.push({ time: ts(x.t), position: x.b === 'long' ? 'belowBar' : 'aboveBar', color: x.b === 'long' ? css('--up') : css('--down'), shape: x.b === 'long' ? 'arrowUp' : 'arrowDown', text: '' }); prev = x.b; }
    return out; }
  function legend(tf) {
    const box = document.getElementById('tm-legend'), it = (color, txt, style) => { const s = el('span'); const i = el('i'); i.style.borderTopColor = color; if (style) i.style.borderTopStyle = style; s.append(i, document.createTextNode(txt)); return s; };
    const step = { '15m': '15 minutter', '1h': 'time', '4h': '4 timer', '1d': 'dag', '1w': 'uke' }[tf];
    const a = [el('span', null, `Hvert lys er én ${step}: grønt = steg, rødt = falt`), it(css('--orange'), '200-dagerslinja – over = opptrend, under = nedtrend')];
    const sw = (c2, txt) => { const s2 = el('span'); const b2 = el('b', 'zsw ' + c2); s2.append(b2, document.createTextNode(txt)); return s2; };
    if (T.ind.lv) a.push(sw('up', 'Støtte: område der kursen har snudd opp før'), sw('down', 'Motstand: område der kursen har snudd ned før'));
    if (T.ind.tl) a.push(it(css('--up'), 'Stigende trendlinje (gjennom bunner)'), it(css('--down'), 'Fallende trendlinje (gjennom topper)'));
    if (T.ind.w50) a.push(it(css('--fg'), '50-ukerslinja – skillet mellom bjørne- og oksemarked', 'dashed')); if (T.ind.s300) a.push(it(css('--orange'), '300-dagerslinja', 'dotted'));
    if (T.ind.e50) a.push(it(css('--blue'), '50-dagerslinja')); if (T.ind.e20) a.push(it(css('--purple'), '20-dagerslinja'));
    box.replaceChildren(...a);
  }
  function status() {
    const box = document.getElementById('tm-status'); const [, tf] = PER[T.per], c = T.kl[key(T.sym, tf)]; if (!box || !c) return;
    if (!c.B) { box.className = 'down small'; box.textContent = c.err ? `Kursdata er ikke tilgjengelig akkurat nå (Binance svarte ikke). Prøver igjen automatisk.` : 'Henter kurser …'; return; }
    const late = Date.now() - c.at > 5 * 6e4, gaps = RG.gaps(c.B, MS[tf]);
    let t = `Kilde: Binance · oppdatert kl. ${hm(c.at)} · tider i norsk tid`;
    if (c.err) t += ` · ⚠ siste oppdatering feilet, viser kurser fra kl. ${hm(c.at)}`; else if (late) t += ' · ⚠ kursene kan være forsinket';
    if (gaps.length) t += ` · ⚠ ${gaps.length} hull i dataene`;
    box.className = (c.err || late || gaps.length ? 'warn' : 'muted') + ' small'; box.textContent = t;
  }

  // ---------------------------------------------------------------- forklaring i klartekst
  function point(icon, iconCls, title, text) { const d = el('div', 'pt'), i = el('span', 'ic ' + (iconCls || ''), icon), s = el('div', 'stack'); s.style.gap = '2px'; s.append(el('b', null, title), el('span', null, text)); d.append(i, s); return d; }
  function drawExplain() {
    const box = document.getElementById('tm-explain'); if (!box || !T.sym) return; const n = names()[T.sym] || T.sym, t = trend(T.sym), H = hist();
    document.getElementById('tm-ex-title').textContent = `Hva betyr dette for ${n}?`;
    if (!t) { box.replaceChildren(el('p', 'muted', T.kl[key(T.sym, '1d')] && T.kl[key(T.sym, '1d')].err ? 'Kursdata er ikke tilgjengelig akkurat nå.' : 'Henter …')); return; }
    const out = [];
    const days = t.side === 1 ? '1 dag' : `${t.side} dager`;
    if (t.above) out.push(point('▲', 'up', t.near ? 'Opptrend – men helt nær trendlinja' : 'Opptrend', `Kursen er ${pa(t.d200)} over 200-dagerslinja (${price(t.e200)}) og har vært over i ${days}. Lukker en dag under ${price(t.e200)}, regnes trenden som snudd ned.`));
    else out.push(point('▼', 'down', t.near ? 'Nedtrend – men helt nær trendlinja' : 'Nedtrend', `Kursen er ${pa(t.d200)} under 200-dagerslinja (${price(t.e200)}) og har vært under i ${days}. Lukker en dag over ${price(t.e200)}, regnes trenden som snudd opp.`));
    if (t.ath) out.push(point('↧', '', t.dd > -0.005 ? 'På rekordnivå' : `${pa(t.dd)} under rekorden`, t.dd > -0.005 ? `Kursen er på sitt høyeste noen gang.` : `Høyeste kurs noen gang var ${price(t.ath)} i ${my(t.athT)}. Kursen må stige ${pa(t.ath / t.px - 1)} for å nå den igjen.`));
    out.push(point('↔', '', 'Siste tiden', `Siste uke ${pct(t.r7)}, siste måned ${pct(t.r30)}.`));
    { const mc = window.MACRO && MACRO.summary();
      if (mc) { const b = mc.btc90, a = mc.alle90, tot = mc.counts.gronn + mc.counts.gul + mc.counts.rod;
        const txt = `${mc.counts.gronn} av ${tot} store drivere for hele markedet er grønne (trend, bredde, stablecoins, renter, dollar og aksjer). ${b && b.n ? `I uker med samme makroklima tidligere var Bitcoin ${pct0(b.q50)} (median) 3 måneder senere, og høyere i ${pa(b.up)} av ukene – mot ${pct0(a.q50)} og ${pa(a.up)} for alle uker. ` : ''}${mc.verdict === 'skilte' ? '' : 'Skillet har ikke vært sikkert nok til å brukes som signal. '}`;
        const pt = point('M', mc.cls, `Makrobildet: ${mc.label.toLowerCase()}`, txt); const lk = el('a', null, 'Se hele makrobildet'); lk.href = '#tab=makro'; lk.addEventListener('click', e => { e.preventDefault(); dash.setParams({ tab: 'makro' }); window.scrollTo({ top: 0 }); });
        pt.lastChild.lastChild.append(lk, document.createTextNode('.')); out.push(pt); } }
    out.push(point('⇅', '', 'Støtte, motstand og trendlinjer', 'Se listen «Viktige nivåer» under – der står hvert nivå, hvor langt unna det er, og hvorfor det er viktig.'));
    const h = H && H.coins && H.coins[T.sym] && H.coins[T.sym].hz[90]; const r = h && h.range;
    if (r) { const p = document.createElement('div'); const a = el('a', null, 'Se Historiske scenarioer'); a.href = '#tab=historikk&coin=' + T.sym; a.addEventListener('click', e => { e.preventDefault(); dash.setParams({ tab: 'historikk', coin: T.sym }); window.scrollTo({ top: 0 }); });
      const pt = point('?', '', 'Hva kan skje de neste 3 månedene?', `Trolig mellom ${price(t.px * (1 + r.lo))} og ${price(t.px * (1 + r.hi))}${r.cover && r.cover.n ? ` – et slikt spenn har stemt ${nf(r.cover.cover * 10, { maximumFractionDigits: 0 })} av 10 ganger før for ${n}` : ''}. Om det går opp eller ned, kan ingen spå. `); pt.lastChild.lastChild.append(a, document.createTextNode('.')); out.push(pt); }
    else out.push(point('?', '', 'Hva kan skje videre?', 'Beregningen er ikke tilgjengelig akkurat nå.'));
    out.push(el('div', 'note', 'Dette er ikke kjøps- eller salgsråd. Å følge 200-dagerslinja har tidligere gitt mindre store fall, men ikke mer avkastning enn å bare eie coinen (testet på 2018–2026).'));
    box.replaceChildren(...out);
  }


  // ---------------------------------------------------------------- viktige nivåer, med begrunnelse
  // Henter historikk for de store trendlinjene fra data/macro.json (hvor ofte de har holdt før, og hva som skjedde etterpå).
  function drawLevels() {
    const box = document.getElementById('tm-levels'); if (!box || !T.sym) return; const n = names()[T.sym] || T.sym, t = trend(T.sym);
    document.getElementById('tm-lv-title').textContent = `Viktige nivåer for ${n} – og hvorfor de betyr noe`;
    if (!t) { box.replaceChildren(el('p', 'muted', 'Henter …')); return; }
    const md = window.MACRO && MACRO.data(), ML = md && md.lines && md.lines[T.sym], px = t.px, items = [];
    const near = (a, b) => a && b && Math.abs(a / b - 1) < 0.015, fmtD = p => `${Math.abs(p / px - 1) < 0.1 ? nf(Math.abs(p / px - 1) * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' : pa(p / px - 1)} ${p > px ? 'over' : 'under'}`;
    const lines = [['e200', t.e200, '200-dagerslinja', 'Snittet av de siste 200 dagslukkene. Den mest brukte trendlinja i alle markeder: over = opptrend, under = nedtrend. Fordi så mange følger den, reagerer kursen ofte når den kommer hit.'],
      ['s300', t.s300, '300-dagerslinja', 'Snittet av de siste 300 dagslukkene. Ligger tregere enn 200-dagerslinja og har flere ganger vært «siste skanse» i korreksjoner i et oksemarked.'],
      ['w50', t.w50, '50-ukerslinja', 'Snittet av de siste 50 ukelukkene. Mange makroanalytikere bruker den som skillet mellom bjørne- og oksemarked: flere ukelukk over har startet store oppturer, og brudd under har startet store fall. Det er ukelukket (søndag kl. 01/02 norsk tid) som teller.']];
    const histTxt = k => { const x = ML && ML.tests && ML.tests[k]; if (!x || !x.n) return '';
      const ex = (x.last || []).filter(e => e.r90 != null).slice(-3).map(e => `${my(Date.parse(e.date))}: ${e.held ? 'holdt' : 'brøt'}, ${pct0(e.r90)} etter 3 mnd`).join('; ');
      return ` Før: ${n} har kommet ned til linja ovenfra ${x.n} ganger, og den holdt ${x.held} av dem.${x.med90held != null ? ` Når den holdt, var kursen ${pct0(x.med90held)} (median) 3 måneder senere` : ''}${x.med90fail != null ? `; når den brøt, ${pct0(x.med90fail)}` : ''}.${ex ? ` Siste ganger – ${ex}.` : ''}`; };
    for (const [k, p, nm, why] of lines) if (p) items.push({ p, kind: nm, cls: '', text: `${why}${p < px ? ` Kursen er ${pa(px / p - 1)} over – linja fungerer som støtte under.` : ` Kursen er ${pa(p / px - 1)} under – linja fungerer som tak til kursen lukker over den igjen.`}${histTxt(k)}` });
    const strength = l => l.n >= 3 ? 'Sterkt nivå' : l.n === 2 ? 'Middels sterkt nivå' : 'Svakt nivå (bare én tidligere reaksjon)';
    const conf = p => { const c = lines.filter(([, q]) => near(p, q)).map(([, , nm]) => nm); return c.length ? ` Ligger i samme område som ${c.join(' og ')} – når to grunner peker på samme sted, følger enda flere med, og nivået blir viktigere.` : ''; };
    const lastTxt = l => l.last ? `, sist i ${my(l.last)}` : '';
    t.sr.res.forEach((l, i) => { const nx = t.sr.res[i + 1]; items.push({ p: l.p, kind: `Motstand ${i + 1}`, cls: 'down', text: `${strength(l)}: kursen har snudd ned herfra ${l.n === 1 ? 'én gang' : l.n + ' ganger'}${lastTxt(l)}.${i === 0 ? ' Selgere har tatt over her før, og mange som kjøpte på dette nivået, selger gjerne når de kommer «tilbake i null».' : ''}${conf(l.p)} ${nx ? `Lukker kursen en dag over, er neste mål ${price(nx.p)} (${fmtD(nx.p)}).` : 'Lukker kursen over, er det få kjente tak rett over.'}` }); });
    t.sr.sup.forEach((l, i) => { const nx = t.sr.sup[i + 1]; items.push({ p: l.p, kind: `Støtte ${i + 1}`, cls: 'up', text: `${strength(l)}: kursen har snudd opp herfra ${l.n === 1 ? 'én gang' : l.n + ' ganger'}${lastTxt(l)}.${i === 0 ? ' Kjøpere har slått til her før, og mange venter med kjøpsordre på samme sted igjen.' : ''}${conf(l.p)} ${nx ? `Lukker kursen en dag under, er neste støtte ${price(nx.p)} (${fmtD(nx.p)}).` : 'Lukker kursen under, er det få kjente gulv rett under.'}` }); });
    const tl = t.tl || {};
    if (tl.up && tl.up.now) items.push({ p: tl.up.now, kind: 'Stigende trendlinje', cls: 'up', text: 'Linja gjennom de siste stigende bunnene. Så lenge kursen holder seg over, er oppgangen intakt; et dagslukk under er et tidlig faresignal.' });
    if (tl.down && tl.down.now) items.push({ p: tl.down.now, kind: 'Fallende trendlinje', cls: 'down', text: 'Linja gjennom de siste fallende toppene. Et dagslukk over den kan bety at nedgangen er brutt.' });
    if (t.ath && t.ath / px < 1.8 && t.dd < -0.005) items.push({ p: t.ath, kind: 'Rekorden', cls: '', text: `Høyeste dagslukk noen gang (${my(t.athT)}). Over rekorden finnes ingen tidligere selgere – derfor går kursen ofte raskt når en rekord brytes.` });
    const below = items.filter(x => x.p < px).sort((a, b) => b.p - a.p), above = items.filter(x => x.p >= px).sort((a, b) => b.p - a.p);
    const s1 = below[0], r1 = above[above.length - 1];
    const nowRow = { p: px, kind: 'Kursen nå', now: true, text: `${r1 ? `Nærmeste nivå over: ${r1.kind.toLowerCase()} ${price(r1.p)} (${fmtD(r1.p)}). ` : ''}${s1 ? `Nærmeste nivå under: ${s1.kind.toLowerCase()} ${price(s1.p)} (${fmtD(s1.p)}).` : ''}` };
    const row = x => { const d = el('div', 'lvl' + (x.now ? ' now' : '')); const p = el('div', 'p', price(x.p)); if (!x.now) p.append(el('small', null, fmtD(x.p)));
      const s2 = el('div', 'stack'); s2.style.gap = '2px'; s2.append(el('span', 'kind ' + (x.cls || ''), x.kind), el('span', null, x.text)); d.append(p, s2); return d; };
    box.replaceChildren(...above.map(row), row(nowRow), ...below.map(row),
      el('p', 'muted small', `Nivåene er regnet på dagsgrafen (lukkede dager). ${ML ? `Historikken for trendlinjene: Binance-data fra ${n} ble notert, oppdatert ${ML.asOf}.` : 'Historikk for trendlinjene er ikke tilgjengelig akkurat nå.'} Et «brudd» regnes først når kursen lukker over/under – ikke bare stikker gjennom i løpet av dagen. Ingen nivåer er garantier.`));
  }

  // ---------------------------------------------------------------- avansert
  function controls() {
    const pb = document.getElementById('tm-period'); pb.replaceChildren(...Object.entries(PER).map(([k, [l]]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', k === T.per ? 'true' : 'false'); b.addEventListener('click', () => { T.per = k; save(); controls(); drawDetail(true); }); return b; }));
    const ib = document.getElementById('tm-ind'); ib.replaceChildren(...Object.entries(IND).map(([k, [l]]) => { const lb = el('label', 'chip'); const i = el('input'); i.type = 'checkbox'; i.checked = !!T.ind[k]; i.addEventListener('change', () => { T.ind[k] = i.checked; save(); paint(); }); lb.append(i, document.createTextNode(l)); return lb; }));
    const sb = document.getElementById('tm-subsel'); sb.replaceChildren(...[['none', 'Ingen'], ['rsi', 'RSI'], ['macd', 'MACD'], ['atr', 'Svingninger (ATR %)']].map(([k, l]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', k === T.sub ? 'true' : 'false'); b.addEventListener('click', () => { T.sub = k; save(); controls(); paint(); }); return b; }));
  }
  function drawTF() {
    const box = document.getElementById('tm-tf'), adv = document.getElementById('tm-adv'); if (!box || !adv.open || !T.sym) return; const sym = T.sym;
    Promise.all(['1h', '4h'].map(tf => loadK(sym, tf))).then(() => { if (sym !== T.sym) return;
      const t = el('table', 't'), hr = el('tr'); ['Tidsramme', 'Retning', 'Regelscore', 'RSI', 'ADX', 'Regime'].forEach((h, i) => hr.append(el('th', i === 0 || i === 5 ? 'l' : '', h))); t.append(hr);
      for (const [tf, nm] of [['1h', '1 time'], ['4h', '4 timer'], ['1d', '1 dag']]) { const c = T.kl[key(sym, tf)], x = el('tr'); x.append(el('td', 'l', nm));
        if (!c || !c.B) { const d = el('td', 'l muted', 'ikke tilgjengelig'); d.colSpan = 5; x.append(d); t.append(x); continue; }
        const e = closedEnd(c.B), a = RG.assess(c.B.slice(Math.max(0, e - 499), e + 1)); if (!a.ok) { const d = el('td', 'l muted', a.why); d.colSpan = 5; x.append(d); t.append(x); continue; }
        const b = { long: ['▲ opp', 'up'], short: ['▼ ned', 'down'], neutral: ['– nøytral', ''] }[a.bias];
        x.append(el('td', b[1], b[0]), el('td', null, (a.score > 0 ? '+' : a.score < 0 ? '−' : '') + Math.abs(a.score) + ' av ±5'), el('td', null, nf(a.rsi, { maximumFractionDigits: 0 })), el('td', null, nf(a.adx, { maximumFractionDigits: 0 })), el('td', 'l', a.regime)); t.append(x); }
      box.replaceChildren(el('p', 'muted small', 'Regelscore teller fem enkle regler (kurs over 50-linja, 20-linja over 50-linja, 50-linja stiger, MACD over 0, RSI over 50). Det er ikke en sannsynlighet, og slike kortsiktige signaler har ikke gitt fortjeneste i våre tester.'), t); });
  }

  // ---------------------------------------------------------------- inngang
  function drawDetail(reload) {
    if (!T.built || !T.sym) return; const [, tf] = PER[T.per], n = names()[T.sym] || T.sym;
    document.getElementById('tm-title').textContent = `${n} – siste ${PER[T.per][0]}`;
    const L = live(T.sym), ph = document.getElementById('tm-price');
    ph.replaceChildren(...(L && L.p ? [el('b', null, price(L.p) + ' '), el('span', cls(L.chg), pct(L.chg / 100) + ' siste døgn')] : [el('span', 'muted', 'Pris ikke tilgjengelig')]));
    if (reload) { status(); loadK(T.sym, tf, true).then(() => { paint(true); status(); }); if (tf !== '1d') loadK(T.sym, '1d').then(() => { paint(); drawExplain(); drawLevels(); }); }
    else { paint(); status(); }
    drawExplain(); drawLevels(); drawTF(); poll();
  }
  function poll() { clearTimeout(T.timer); const tf = PER[T.per][1]; T.timer = setTimeout(() => {
    const vis = !document.getElementById('terminal').hidden; if (document.hidden || !vis) { poll(); return; }
    tickK(T.sym, tf).then(() => { paint(); status(); poll(); }); loadDays(); }, POLL[tf]); }
  function render() {
    if (typeof RG === 'undefined') return; const p = dash.params(), L = list();
    if (p.coin && L.includes(p.coin) && p.coin !== T.sym) { T.sym = p.coin; if (T.built) drawDetail(true); }
    if (!T.sym) T.sym = L[0];
    if (!T.built) { T.built = true; controls(); T.chart = makeChart(); if (!T.chart) document.getElementById('tm-status').textContent = 'Grafbiblioteket kunne ikke lastes.';
      document.getElementById('tm-adv').addEventListener('toggle', drawTF);
      loadGlobal(); setInterval(() => { if (!document.hidden) loadGlobal(); }, 5 * 6e4); loadDays(true); drawDetail(true); }
    drawBar(); drawCoins(); drawExplain(); drawLevels();
    const L2 = live(T.sym), ph = document.getElementById('tm-price'); if (L2 && L2.p) ph.replaceChildren(el('b', null, price(L2.p) + ' '), el('span', cls(L2.chg), pct(L2.chg / 100) + ' siste døgn'));
  }
  window.TERM = { render, _T: T, trend };
})();
