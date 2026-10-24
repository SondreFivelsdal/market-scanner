// Oversikt-fanen: enkel markedsoversikt, coin-liste med trend, interaktiv graf og forklaring i klartekst.
// Kursdata hentes direkte i nettleseren fra Binance (offentlig API). Markedsverdi fra CoinGecko, stemning fra alternative.me.
// Toppkurs og «realistisk spenn» kommer fra data/history.json (bygges av GitHub Actions). Mangler noe, står det at det mangler.
(() => {
  'use strict';
  const BIN = 'https://data-api.binance.vision/api/v3/';
  const MS = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
  const PER = { '1D': ['1 dag', '15m', 96], '1U': ['1 uke', '1h', 168], '1M': ['1 måned', '4h', 180], '3M': ['3 måneder', '1d', 92], '1Å': ['1 år', '1d', 366], '5Å': ['5 år', '1w', 262] };
  const POLL = { '15m': 15e3, '1h': 3e4, '4h': 6e4, '1d': 6e4, '1w': 3e5 };
  const IND = { lv: ['Gulv og tak', true], vol: ['Volum', true], e50: ['50-dagerslinja', false], e20: ['20-dagerslinja', false], vwap: ['VWAP (dagssnitt)', false], bb: ['Bollinger-bånd', false], mk: ['Regelskifter (piler)', false] };
  const T = { sym: null, per: '3M', sub: 'none', ind: Object.fromEntries(Object.entries(IND).map(([k, v]) => [k, v[1]])), kl: {}, glob: null, fng: null, built: false, chart: null, timer: null, dayAt: 0 };
  try { const s = JSON.parse(localStorage.getItem('ms-term2') || '{}'); if (s.per && PER[s.per]) T.per = s.per; if (s.sub) T.sub = s.sub; if (s.ind) Object.assign(T.ind, s.ind); } catch (e) { /* ingen lagring */ }
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

  // ---------------------------------------------------------------- trend fra 200-dagerslinja (dagslukk)
  function trend(sym) {
    const c = T.kl[key(sym, '1d')]; if (!c || !c.B || c.B.length < 220) return null;
    const B = c.B, e = closedEnd(B), cl = B.map(b => b.c), E = RG.ema(cl, 200), E50 = RG.ema(cl, 50), above = cl[e] > E[e];
    let side = 0; for (let i = e; i >= 0 && E[i] != null && (cl[i] > E[i]) === above; i--) side++;
    const L = live(sym), px = L && L.p ? L.p : B[B.length - 1].c, near = Math.abs(px / E[e] - 1) < 0.02;
    const back = n => e - n >= 0 ? px / cl[e - n] - 1 : null; // fra lukk for n dager siden
    const H = hist(), hn = H && H.coins && H.coins[sym] ? H.coins[sym].now : null;
    const ath = hn ? Math.max(hn.ath, px) : null, athT = hn ? (px > hn.ath ? Date.now() : hn.athT) : null;
    const lv = RG.levels(B.slice(0, e + 1), e, RG.atr(B.slice(0, e + 1))[e], 3, 300);
    const floor = lv.filter(l => l.p < px).sort((a, b) => b.p - a.p)[0], roof = lv.filter(l => l.p > px).sort((a, b) => a.p - b.p)[0];
    return { px, e200: E[e], e50: E50[e], above, side, near, d200: px / E[e] - 1, r7: back(7), r30: back(30), ath, athT, dd: ath ? px / ath - 1 : null, floor: floor && floor.p, roof: roof && roof.p, closeT: B[e].t };
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
    const box = document.getElementById('tm-bar'); if (!box) return; const out = [], b = live('BTC');
    out.push(b && b.p ? kpi('Bitcoin', price(b.p), '', `${pct(b.chg / 100)} siste døgn`) : kpi('Bitcoin', 'Ikke tilgjengelig', 'muted', 'Binance svarer ikke akkurat nå'));
    const g = T.glob; out.push(g && g.mcap ? kpi('Hele kryptomarkedet', big(g.mcap), '', `${pct(g.chg)} siste døgn · Bitcoin er ${nf(g.btcD, { maximumFractionDigits: 0 })} % av markedet`) : kpi('Hele kryptomarkedet', g && g.err ? 'Ikke tilgjengelig' : 'Henter …', 'muted', g && g.err ? 'CoinGecko svarer ikke akkurat nå' : ''));
    const f = T.fng; if (f && f.v != null) { const [w, c] = FNG[f.cls] || [f.cls, '']; out.push(kpi('Stemningen i markedet', `${w} (${f.v})`, c, `Skala 0–100: lavt = folk er redde, høyt = folk er grådige${f.prev != null ? ` · i går ${f.prev}` : ''}`)); }
    else out.push(kpi('Stemningen i markedet', f && f.err ? 'Ikke tilgjengelig' : 'Henter …', 'muted', f && f.err ? 'alternative.me svarer ikke' : ''));
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
      b.addEventListener('click', () => { T.sym = s; dash.setParams({ coin: s }); drawCoins(); drawDetail(true); const d = document.getElementById('tm-detail'); if (d.getBoundingClientRect().top > window.innerHeight * 0.5) d.scrollIntoView({ behavior: 'smooth' }); });
      return b; }));
  }
  function loadDays(force) { if (!force && Date.now() - T.dayAt < 5 * 6e4) return; T.dayAt = Date.now();
    let i = 0; const L = list(), run = () => i < L.length ? loadK(L[i++], '1d', true).then(() => { drawCoins(); if (L[i - 1] === T.sym) { drawExplain(); paint(); } }).then(run) : null; run(); run(); }

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
      o1: sc.addLineSeries({ color: css('--blue'), lineWidth: 1, priceLineVisible: false }), o2: sc.addLineSeries({ color: css('--purple'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false }), oh: sc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }) };
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    let lock = false; const sync = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange(r => { if (lock || !r) return; lock = true; b.timeScale().setVisibleLogicalRange(r); lock = false; }); sync(ch, sc); sync(sc, ch);
    ch.subscribeCrosshairMove(p => { const C = T.chart; if (!C || !C.B) return; const b = p && p.time != null ? C.byT.get(p.time) : null; hover(b || C.B[C.B.length - 1], !b); });
    return { ch, sc, S, lines: [], osc: [], k: null, B: null, byT: new Map() };
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
    if (!isD && tf !== '1w' && tr && T.ind.e50) pl(tr.e50, css('--blue'), '50-dagerslinja', 0, 1);
    C.S.vwap.setData(T.ind.vwap && MS[tf] < MS['1d'] ? line(B, RG.vwap(B)) : []);
    const bb = T.ind.bb ? RG.boll(cl) : null; C.S.bbU.setData(bb ? line(B, bb.up) : []); C.S.bbL.setData(bb ? line(B, bb.lo) : []);
    if (T.ind.lv && tr) { pl(tr.floor, up, 'gulv (støtte)'); pl(tr.roof, dn, 'tak (motstand)'); }
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
  function markers(B) { const s = RG.biasSeries(B, closedEnd(B)), out = []; let prev = null;
    for (const x of s) { if (x.b !== prev && prev != null && x.b !== 'neutral') out.push({ time: ts(x.t), position: x.b === 'long' ? 'belowBar' : 'aboveBar', color: x.b === 'long' ? css('--up') : css('--down'), shape: x.b === 'long' ? 'arrowUp' : 'arrowDown', text: '' }); prev = x.b; }
    return out; }
  function legend(tf) {
    const box = document.getElementById('tm-legend'), it = (color, txt, style) => { const s = el('span'); const i = el('i'); i.style.borderTopColor = color; if (style) i.style.borderTopStyle = style; s.append(i, document.createTextNode(txt)); return s; };
    const step = { '15m': '15 minutter', '1h': 'time', '4h': '4 timer', '1d': 'dag', '1w': 'uke' }[tf];
    const a = [el('span', null, `Hvert lys er én ${step}: grønt = steg, rødt = falt`), it(css('--orange'), '200-dagerslinja – over = opptrend, under = nedtrend')];
    if (T.ind.lv) a.push(it(css('--up'), 'Gulv: der kursen har snudd opp før', 'dashed'), it(css('--down'), 'Tak: der kursen har snudd ned før', 'dashed'));
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
    out.push(point('↔', '', 'Siste tiden', `Siste uke ${pct(t.r7)}, siste måned ${pct(t.r30)}.${t.floor ? ` Nærmeste gulv er ${price(t.floor)}` : ''}${t.roof ? `${t.floor ? ', nærmeste tak' : ' Nærmeste tak er'} ${price(t.roof)}` : ''}${t.floor || t.roof ? '.' : ''}`));
    const h = H && H.coins && H.coins[T.sym] && H.coins[T.sym].hz[90]; const r = h && h.range;
    if (r) { const p = document.createElement('div'); const a = el('a', null, 'Se Historiske scenarioer'); a.href = '#tab=historikk&coin=' + T.sym; a.addEventListener('click', e => { e.preventDefault(); dash.setParams({ tab: 'historikk', coin: T.sym }); window.scrollTo({ top: 0 }); });
      const pt = point('?', '', 'Hva kan skje de neste 3 månedene?', `Ut fra hvor mye ${n} svinger nå, har kursen 8 av 10 ganger havnet mellom ${price(t.px * (1 + r.lo))} og ${price(t.px * (1 + r.hi))} etter 3 måneder. Retningen kan ingen spå. `); pt.lastChild.lastChild.append(a, document.createTextNode('.')); out.push(pt); }
    else out.push(point('?', '', 'Hva kan skje videre?', 'Beregningen er ikke tilgjengelig akkurat nå.'));
    out.push(el('div', 'note', 'Dette er ikke kjøps- eller salgsråd. Å følge 200-dagerslinja har tidligere gitt mindre store fall, men ikke mer avkastning enn å bare eie coinen (testet på 2018–2026).'));
    box.replaceChildren(...out);
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
    if (reload) { status(); loadK(T.sym, tf, true).then(() => { paint(true); status(); }); if (tf !== '1d') loadK(T.sym, '1d').then(() => { paint(); drawExplain(); }); }
    else { paint(); status(); }
    drawExplain(); drawTF(); poll();
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
    drawBar(); drawCoins(); drawExplain();
    const L2 = live(T.sym), ph = document.getElementById('tm-price'); if (L2 && L2.p) ph.replaceChildren(el('b', null, price(L2.p) + ' '), el('span', cls(L2.chg), pct(L2.chg / 100) + ' siste døgn'));
  }
  window.TERM = { render, _T: T, trend };
})();
