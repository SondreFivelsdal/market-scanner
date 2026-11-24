// Oversikt-fanen: enkel markedsoversikt, coin-liste med trend, interaktiv graf og forklaring i klartekst.
// Kursdata hentes direkte i nettleseren fra Binance (offentlig API). Markedsverdi fra CoinGecko, stemning fra alternative.me.
// Toppkurs og «realistisk spenn» kommer fra data/history.json (bygges av GitHub Actions). Mangler noe, står det at det mangler.
(() => {
  'use strict';
  const BIN = 'https://data-api.binance.vision/api/v3/';
  const MS = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5, '1M': 2592e6 };
  // tidsramme (hvert lys) og periode (hvor mye som vises) velges hver for seg, som i TradingView
  const TFL = { '15m': ['15m', '15 minutter'], '1h': ['1t', '1 time'], '4h': ['4t', '4 timer'], '1d': ['1D', '1 dag'], '1w': ['1U', '1 uke'], '1M': ['1M', '1 måned'] };
  const RNG = { '1D': [864e5, '15m'], '5D': [5 * 864e5, '1h'], '1M': [30 * 864e5, '4h'], '3M': [91 * 864e5, '1d'], '1Å': [365 * 864e5, '1d'], '5Å': [1826 * 864e5, '1w'], Alt: [Infinity, '1w'] };
  const OLDPER = { '1D': '1D', '1U': '5D', '1M': '1M', '3M': '3M', '1Å': '1Å', '5Å': '5Å' };
  const POLL = { '15m': 15e3, '1h': 3e4, '4h': 6e4, '1d': 6e4, '1w': 3e5, '1M': 3e5 };
  const IND = { lv: ['Støtte og motstand', true], tl: ['Trendlinjer', true], vol: ['Volum', true], w200: ['200-ukerslinja', true], w200z: ['200W-soner (Fire sale → Very expensive)', true], halv: ['Bitcoin-halvering ±540 d', true], w50: ['50-ukerslinja', true], s300: ['300-dagerslinja', false], e50: ['50-dagerslinja', false], e20: ['20-dagerslinja', false], vwap: ['VWAP (dagssnitt)', false], bb: ['Bollinger-bånd', false], mk: ['Regelskifter (piler)', false] };
  const T = { sym: null, tf: '1d', rng: '3M', log: false, view: { from: Date.now() - RNG['3M'][0] }, sub: 'none', ind: Object.fromEntries(Object.entries(IND).map(([k, v]) => [k, v[1]])), kl: {}, glob: null, fng: null, built: false, chart: null, timer: null, dayAt: 0 };
  try { const s = JSON.parse(localStorage.getItem('ms-term2') || '{}'); if (s.ind && s.ind.tl == null) s.ind.tl = true; if (s.per && OLDPER[s.per] && !s.rng) { T.rng = OLDPER[s.per]; T.tf = RNG[T.rng][1]; }
    if (s.tf && MS[s.tf]) T.tf = s.tf; if (s.rng === null || RNG[s.rng]) T.rng = s.rng; if (s.log != null) T.log = !!s.log; if (s.sub) T.sub = s.sub; if (s.ind) Object.assign(T.ind, s.ind);
    T.view = T.rng ? { from: T.rng === 'Alt' ? 0 : Date.now() - RNG[T.rng][0] } : { bars: 150 }; } catch (e) { /* ingen lagring */ }
  const save = () => { try { localStorage.setItem('ms-term2', JSON.stringify({ tf: T.tf, rng: T.rng, log: T.log, sub: T.sub, ind: T.ind })); } catch (e) { /* ignorer */ } };

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
    c.p = getJSON(`${BIN}klines?symbol=${sym}USDT&interval=${tf}&limit=1000`).then(a => { if (!Array.isArray(a) || !a.length) throw new Error('tomt svar'); const NB = mapK(a);
      c.B = c.B && c.B.length && c.B[0].t < NB[0].t ? c.B.filter(b => b.t < NB[0].t).concat(NB) : NB; if (a.length < 1000) c.done = true; c.at = Date.now(); c.err = null; return c; })
      .catch(e => { c.err = String(e.message || e); c.errAt = Date.now(); return c; }).finally(() => { c.p = null; });
    return c.p;
  }
  function tickK(sym, tf) {
    const c = T.kl[key(sym, tf)]; if (!c || !c.B) return loadK(sym, tf, true); if (c.p) return c.p;
    c.p = getJSON(`${BIN}klines?symbol=${sym}USDT&interval=${tf}&limit=3`).then(a => { for (const b of mapK(a)) { const L = c.B[c.B.length - 1]; if (b.t === L.t) c.B[c.B.length - 1] = b; else if (b.t > L.t) c.B.push(b); } c.at = Date.now(); c.err = null; return c; })
      .catch(e => { c.err = String(e.message || e); c.errAt = Date.now(); return c; }).finally(() => { c.p = null; });
    return c.p;
  }
  // eldre lys: én side à 1000 før det første vi har. Returnerer antall nye lys (0 = ingen flere).
  function loadOlder(sym, tf) {
    const c = T.kl[key(sym, tf)]; if (!c || !c.B || !c.B.length || c.done) return Promise.resolve(0); if (c.op) return c.op;
    c.op = getJSON(`${BIN}klines?symbol=${sym}USDT&interval=${tf}&limit=1000&endTime=${c.B[0].t - 1}`).then(a => { const NB = Array.isArray(a) ? mapK(a).filter(b => b.t < c.B[0].t) : [];
      if (!NB.length || a.length < 1000) c.done = true; if (NB.length) c.B = NB.concat(c.B); return NB.length; }).catch(() => 0).finally(() => { c.op = null; });
    return c.op;
  }
  const closedEnd = B => { let e = B.length - 1; while (e >= 0 && B[e].ct > Date.now()) e--; return e; };
  // 50-ukerslinja regnet fra dagslukk: snittet av de siste 50 fullførte ukelukkene (uke = mandag–søndag UTC). Verdien for en dag
  // er linja fra siste uke som var ferdig da dagen startet – samme som en ukegraf viser.
  // 200-ukerslinja: snittet av de siste 200 fullførte ukelukkene (ukegraf fra Binance). Verdien for en dag er linja fra siste ferdige uke.
  function w200of(sym) { const c = T.kl[key(sym, '1w')]; if (!c || !c.B) return null; const B = c.B, e = closedEnd(B); if (e < 199) return null;
    const S = RG.sma(B.slice(0, e + 1).map(b => b.c), 200), byW = new Map(B.slice(0, e + 1).map((b, k) => [b.t, S[k]])), wk = t => t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5;
    return { now: S[e], at: t => { const v = byW.get(wk(t) - 7 * 864e5); return v == null ? null : v; } }; }
  function w50daily(B) { const wk = t => t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5, W = [];
    B.forEach((b, i) => { const w = wk(b.t); if (!W.length || W[W.length - 1].w !== w) W.push({ w, c: b.c }); else W[W.length - 1].c = b.c; });
    const S = RG.sma(W.map(x => x.c), 50), byW = new Map(W.map((x, k) => [x.w, k]));
    return B.map(b => { const k = byW.get(wk(b.t)); return k > 0 ? S[k - 1] : null; }); }

  // ---------------------------------------------------------------- støtte og motstand: opptil 3 nivåer hver vei, med avstand mellom
  // Nivåene er svingpunkter (der kursen har snudd før), samlet til soner. Neste nivå må ligge et stykke unna det forrige,
  // og innenfor hvert steg velges nivået med flest berøringer. Nivå 2 og 3 er «neste mål» hvis kursen bryter gjennom nivå 1.
  function srLevels(B, e, px, tf) {
    if (e < 30) return { sup: [], res: [] }; const S = B.slice(0, e + 1), A = RG.atr(S)[e] || px * 0.02;
    const lv = RG.levels(S, e, A, tf === '1w' || tf === '1M' ? 2 : 3, tf === '1d' ? 900 : 480);
    const gap = Math.max(1.2 * A, px * ({ '15m': 0.006, '1h': 0.012, '4h': 0.02, '1d': 0.03, '1w': 0.06, '1M': 0.1 }[tf] || 0.03));
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
    return { sr: SR, tl: TL, px, e200: E[e], e50: E50[e], above, side, near, d200: px / E[e] - 1, r7: back(7), r30: back(30), ath, athT, dd: ath ? px / ath - 1 : null, floor: floor && floor.p, roof: roof && roof.p, closeT: B[e].t, s300: S300[e], w50: W50[B.length - 1], w200: (w200of(sym) || {}).now };
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
      timeScale: { borderColor: css('--line'), timeVisible: true, secondsVisible: false, rightOffset: 6 }, crosshair: { mode: 0 }, handleScale: { axisPressedMouseMove: true } });
    const ch = LW.createChart(document.getElementById('tm-chart'), opt()), sc = LW.createChart(document.getElementById('tm-sub'), Object.assign(opt(), { timeScale: { visible: false } }));
    const up = css('--up'), dn = css('--down'), ln = (color, w = 2, style = 0) => ch.addLineSeries({ color, lineWidth: w, lineStyle: style, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const S = { candle: ch.addCandlestickSeries({ upColor: up, downColor: dn, wickUpColor: up, wickDownColor: dn, borderVisible: false }),
      vol: ch.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }),
      e200: ln(css('--orange'), 3), e50: ln(css('--blue'), 2), e20: ln(css('--purple'), 1), vwap: ln(css('--axis'), 1, 2), bbU: ln(css('--axis'), 1), bbL: ln(css('--axis'), 1),
      tlUp: ln(up, 2), tlDn: ln(dn, 2), w200: ch.addLineSeries({ color: '#d6336c', lineWidth: 3, lineType: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }), w50: ch.addLineSeries({ color: css('--fg'), lineWidth: 2, lineStyle: 2, lineType: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }), s300: ln(css('--orange'), 2, 1),
      o1: sc.addLineSeries({ color: css('--blue'), lineWidth: 1, priceLineVisible: false }), o2: sc.addLineSeries({ color: css('--purple'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false }), oh: sc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }) };
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    let lock = false; const sync = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange(r => { if (lock || !r) return; lock = true; b.timeScale().setVisibleLogicalRange(r); lock = false; }); sync(ch, sc); sync(sc, ch);
    ch.subscribeCrosshairMove(p => { const C = T.chart; if (!C || !C.B) return; const b = p && p.time != null ? C.byT.get(p.time) : null; hover(b || C.B[C.B.length - 1], !b); });
    const host = document.getElementById('tm-chart'); host.style.position = 'relative'; const layer = el('div', 'zlayer'); host.append(layer);
    ch.timeScale().subscribeVisibleLogicalRangeChange(r => { requestAnimationFrame(placeZones); if (r && r.from < 15) older(); }); if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(placeZones)).observe(host);
    ch.priceScale('right').applyOptions({ mode: T.log ? 1 : 0 });
    const C = { ch, sc, S, lines: [], osc: [], k: null, B: null, byT: new Map(), layer, zones: [] };
    C.D = window.DRAW ? DRAW.create({ ch, series: S.candle, host, bars: () => C.B, step: () => MS[T.tf], key: () => T.sym, onScale: () => placeZones() }) : null;
    return C;
  }
  // blar man helt til venstre, hentes eldre lys (som i TradingView), og utsnittet beholdes
  function older() { const C = T.chart; if (!C || !C.B || C.older) return; const sym = T.sym, tf = T.tf; C.older = true;
    loadOlder(sym, tf).then(n => { C.older = false; if (!n || sym !== T.sym || tf !== T.tf) return; const ts2 = C.ch.timeScale(), r = ts2.getVisibleLogicalRange(); paint(); if (r) ts2.setVisibleLogicalRange({ from: r.from + n, to: r.to + n }); }); }
  // sett utsnittet: fra et tidspunkt (periodeknappene) eller et antall lys. Mangler eldre lys, hentes de først.
  function applyView() { const C = T.chart, c = T.kl[key(T.sym, T.tf)]; if (!C || !c || !c.B) return; const B = c.B, n = B.length, v = T.view || { bars: 150 };
    if (v.from != null && B[0].t > v.from && !c.done && (v.tries = (v.tries || 0) + 1) <= 6) { loadOlder(T.sym, T.tf).then(k => { if (k) paint(); applyView(); }); return; }
    let from = v.from != null ? B.findIndex(b => b.t >= v.from) : n - v.bars; if (from < 0) from = n - 30; C.ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, from) - 0.5, to: n + 3 }); }
  function hover(b, last) { const box = document.getElementById('tm-hover'); if (!box || !b) return; const tf = T.tf;
    const when = tf === '1d' ? dmy(b.t) : tf === '1w' ? 'Uke fra ' + dmy(b.t) : tf === '1M' ? my(b.t) : new Date(b.t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    box.replaceChildren(document.createTextNode(`${when}  Å ${price(b.o)}  H ${price(b.h)}  L ${price(b.l)}  ${last ? 'Nå' : 'S'} ${price(b.c)} `), el('span', cls(b.c - b.o), pct(b.c / b.o - 1))); }
  const line = (B, a) => B.map((b, i) => a[i] == null ? { time: ts(b.t) } : { time: ts(b.t), value: a[i] });
  function paint(full) {
    const C = T.chart; if (!C || !T.sym) return; const tf = T.tf, c = T.kl[key(T.sym, tf)]; if (!c || !c.B) return;
    const B = c.B, k = key(T.sym, tf), cl = B.map(b => b.c), up = css('--up'), dn = css('--down'), show = C.visN || 150;
    // dagsverdier (f.eks. 200-dagerslinja) på uke- og månedsgraf: verdien fra siste dag i hvert lys
    const fromDaily = (DB, arr) => { const out = new Array(B.length).fill(null); let j = 0; for (let i = 0; i < B.length; i++) { const end = i + 1 < B.length ? B[i + 1].t : Infinity; while (j + 1 < DB.length && DB[j + 1].t < end) j++; if (DB[j] && DB[j].t < end && DB[j].t >= B[i].t) out[i] = arr[j]; } return out; };
    const big = tf === '1w' || tf === '1M';
    if (full || C.k !== k) { const p = prec(B[B.length - 1].c); C.S.candle.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: Math.pow(10, -p) } }); }
    C.byT = new Map(B.map(b => [ts(b.t), b]));
    C.S.candle.setData(B.map(b => ({ time: ts(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    C.S.vol.setData(T.ind.vol ? B.map(b => ({ time: ts(b.t), value: b.qv, color: (b.c >= b.o ? up : dn) + '40' })) : []);
    // 200-dagerslinja: regnes alltid på dagslukk. På dagsgraf som linje, på ukegraf der dagsdata finnes, ellers som vannrett strek.
    const D = T.kl[key(T.sym, '1d')], tr = trend(T.sym); C.lines.forEach(l => C.S.candle.removePriceLine(l)); C.lines = [];
    const pl = (p, color, title, style = 2, w = 2) => { if (p == null || !isFinite(p)) return; C.lines.push(C.S.candle.createPriceLine({ price: p, color, lineWidth: w, lineStyle: style, axisLabelVisible: true, title })); };
    if (tf === '1d') C.S.e200.setData(line(B, RG.ema(cl, 200)));
    else if (big && D && D.B) C.S.e200.setData(line(B, fromDaily(D.B, RG.ema(D.B.map(b => b.c), 200))));
    else { C.S.e200.setData([]); if (tr) pl(tr.e200, css('--orange'), '200-dagerslinja', 0, 2); }
    const isD = tf === '1d'; C.S.e50.setData(T.ind.e50 && isD ? line(B, RG.ema(cl, 50)) : []); C.S.e20.setData(T.ind.e20 && isD ? line(B, RG.ema(cl, 20)) : []);
    // 50-ukers og 300-dagers: linjer på dags- og ukegraf, vannrette streker ellers
    { const W2 = w200of(T.sym); if (T.ind.w200 && isD && W2) C.S.w200.setData(B.map(b => { const v = W2.at(b.t); return v == null ? { time: ts(b.t) } : { time: ts(b.t), value: v }; }));
      else if (T.ind.w200 && tf === '1w') C.S.w200.setData(line(B, RG.sma(cl, 200)));
      else { C.S.w200.setData([]); if (T.ind.w200 && W2 && W2.now) pl(W2.now, '#d6336c', '200-ukerslinja', 0, 2); }
      // grunnlag for 200W-sonene (tegnes i placeZones): én verdi per lys der 200W er kjent
      const WS = tf === '1w' ? RG.sma(cl, 200) : W2 ? B.map(b => W2.at(b.t)) : null; C.w2 = WS ? B.map((b, i) => WS[i] == null ? null : { t: b.t, w: WS[i] }).filter(Boolean) : []; C.w2now = W2 && W2.now; C.tfMs = MS[tf]; }
    if (T.ind.w50 && isD) C.S.w50.setData(line(B, w50daily(B))); else if (T.ind.w50 && tf === '1w') C.S.w50.setData(line(B, RG.sma(cl, 50))); else { C.S.w50.setData([]); if (T.ind.w50 && tr && tr.w50) pl(tr.w50, css('--fg'), '50-ukerslinja', 2, 1); }
    if (T.ind.s300 && isD) C.S.s300.setData(line(B, RG.sma(cl, 300)));
    else if (T.ind.s300 && big && D && D.B) C.S.s300.setData(line(B, fromDaily(D.B, RG.sma(D.B.map(b => b.c), 300))));
    else { C.S.s300.setData([]); if (T.ind.s300 && tr && tr.s300) pl(tr.s300, css('--orange'), '300-dagerslinja', 1, 1); }
    if (!isD && !big && tr && T.ind.e50) pl(tr.e50, css('--blue'), '50-dagerslinja', 0, 1);
    C.S.vwap.setData(T.ind.vwap && MS[tf] < MS['1d'] ? line(B, RG.vwap(B)) : []);
    const bb = T.ind.bb ? RG.boll(cl) : null; C.S.bbU.setData(bb ? line(B, bb.up) : []); C.S.bbL.setData(bb ? line(B, bb.lo) : []);
    // støtte/motstand som soner, regnet på tidsrammen som vises (bare lukkede candles)
    const e = closedEnd(B), A = RG.atr(B.slice(0, e + 1))[e] || B[e].c * 0.02, pxNow = B[B.length - 1].c; C.zones = [];
    if (T.ind.lv && e > 30) { const SR = srLevels(B, e, pxNow, tf), half = Math.max(0.25 * A, pxNow * 0.003), below = SR.sup, above = SR.res;
      below.forEach((l, i) => { C.zones.push({ lo: l.p - half, hi: l.p + half, p: l.p, kind: 'up', short: `Støtte ${i + 1}`, label: `Støtte ${i + 1}` }); C.lines.push(C.S.candle.createPriceLine({ price: l.p, color: up, lineWidth: 1, lineVisible: false, axisLabelVisible: true, title: '' })); });
      above.forEach((l, i) => { C.zones.push({ lo: l.p - half, hi: l.p + half, p: l.p, kind: 'down', short: `Motstand ${i + 1}`, label: `Motstand ${i + 1}` }); C.lines.push(C.S.candle.createPriceLine({ price: l.p, color: dn, lineWidth: 1, lineVisible: false, axisLabelVisible: true, title: '' })); }); }
    // trendlinjer
    const TLv = T.ind.tl && e > 40 ? RG.trendlines(B, e, { look: Math.min(250, Math.max(show, 120)), k: big ? 3 : 4 }) : { up: null, down: null }; C.tl = TLv;
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
    const first = C.k !== k; C.k = k; C.B = B; if (first) applyView(); hover(B[B.length - 1], true); legend(tf); if (C.D) C.D.render();
  }
  function placeZones() { const C = T.chart; if (!C || !C.layer) return; const w = C.ch.timeScale().width();
    C.layer.replaceChildren(...overlays(C, w), ...C.zones.map(z => { const y1 = C.S.candle.priceToCoordinate(z.hi), y2 = C.S.candle.priceToCoordinate(z.lo); if (y1 == null || y2 == null) return null;
      const d = el('div', 'zone ' + z.kind); d.style.top = Math.min(y1, y2) + 'px'; d.style.height = Math.max(3, Math.abs(y2 - y1)) + 'px'; d.style.width = w + 'px'; d.append(el('span', null, w < 520 ? z.short : z.label)); return d; }).filter(Boolean)); }
  // 200W-soner (som Bullmania «200W MA Valuation Zones»: 0,75 / 1 / 1,25 / 1,5 / 1,75 × 200-ukers snitt) og Bitcoin-halveringer ±540 dager.
  // Tegnes som SVG i samme lag som støtte/motstand, med koordinater fra grafen, og tegnes på nytt ved zoom/scroll.
  const W2Z = [[0, 0.75, '#a855f7', 'Fire sale'], [0.75, 1, '#3b82f6', 'Very cheap'], [1, 1.25, '#22c55e', 'Cheap'], [1.25, 1.5, '#eab308', 'Fair value'], [1.5, 1.75, '#f97316', 'Expensive'], [1.75, 1e3, '#ef4444', 'Very expensive']];
  const HALV = [['2012-11-28', false], ['2016-07-09', false], ['2020-05-11', false], ['2024-04-20', false], ['2028-04-15', true]];
  function overlays(C, w) {
    const B = C.B; if (!B || !B.length || (!T.ind.w200z && !T.ind.halv)) return [];
    const NS = 'http://www.w3.org/2000/svg', H = C.ch.timeScale().height ? C.layer.clientHeight - C.ch.timeScale().height() : C.layer.clientHeight - 28;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', w); svg.setAttribute('height', Math.max(0, H)); svg.style.position = 'absolute'; svg.style.left = '0'; svg.style.top = '0';
    const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); svg.append(e); return e; };
    const yOf = p => { const y = C.S.candle.priceToCoordinate(p); return y == null ? null : Math.max(-5, Math.min(H + 5, y)); };
    const step = C.tfMs || 864e5, n = B.length, idxOf = new Map(B.map((b, i) => [b.t, i]));
    const xOf = t => { let i = idxOf.get(t); if (i == null) { if (t > B[n - 1].t) i = n - 1 + (t - B[n - 1].t) / step; else if (t < B[0].t) i = (t - B[0].t) / step; else { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (B[m].t <= t) lo = m; else hi = m; } i = lo + (t - B[lo].t) / (B[hi].t - B[lo].t); } }
      const ts2 = C.ch.timeScale(), f = Math.floor(i), x0 = ts2.logicalToCoordinate(f); if (i === f || x0 == null) return x0; const x1 = ts2.logicalToCoordinate(f + 1); return x1 == null ? x0 : x0 + (x1 - x0) * (i - f); };
    if (T.ind.w200z && C.w2 && C.w2.length > 1) {
      const pts = C.w2.map(d => ({ x: xOf(d.t), w: d.w })).filter(d => d.x != null && d.x > -50 && d.x < w + 50);
      if (pts.length > 1) {
        W2Z.forEach(([a, b, col]) => { const top = pts.map(d => `${d.x.toFixed(1)},${yOf(d.w * b).toFixed(1)}`), bot = pts.slice().reverse().map(d => `${d.x.toFixed(1)},${yOf(d.w * a).toFixed(1)}`);
          if (top.some(v => v.includes('null')) || bot.some(v => v.includes('null'))) return; mk('polygon', { points: top.concat(bot).join(' '), fill: col, 'fill-opacity': 0.12 }); });
        [0.75, 1.25, 1.5, 1.75].forEach(f => mk('polyline', { points: pts.map(d => `${d.x.toFixed(1)},${yOf(d.w * f).toFixed(1)}`).join(' '), fill: 'none', stroke: css('--axis'), 'stroke-opacity': 0.45, 'stroke-width': 1 }));
        const lw = pts[pts.length - 1].w;
        W2Z.forEach(([a, b, col, lab]) => { const y0 = yOf(lw * a), y1 = yOf(lw * b); if (y0 == null || y1 == null || y0 - y1 < 14) return; const t = mk('text', { x: w - 8, y: (y0 + y1) / 2, dy: '0.35em', 'text-anchor': 'end', fill: col, 'font-size': 11, 'font-weight': 600 }); t.textContent = lab; });
      } }
    if (T.ind.halv) {
      const D = T.kl[key('BTC', '1d')], DB = D && D.B, dIx = DB ? new Map(DB.map((b, i) => [b.t, i])) : null, lastT = B[n - 1].t, gold = '#a16207';
      HALV.forEach(([ds, est]) => { const th = Date.parse(ds + 'T00:00:00Z'), a = th - 540 * 864e5, b2 = th + 540 * 864e5;
        const xa = xOf(a), xh = xOf(th), xb = xOf(b2); if (xa == null || xh == null || xb == null || xb < 0 || xa > w) return;
        const cl = x => Math.max(0, Math.min(w, x));
        if (cl(xh) > cl(xa)) mk('rect', { x: cl(xa), y: 0, width: cl(xh) - cl(xa), height: H, fill: css('--axis'), 'fill-opacity': 0.08 });
        if (cl(xb) > cl(xh)) mk('rect', { x: cl(xh), y: 0, width: cl(xb) - cl(xh), height: H, fill: '#eab308', 'fill-opacity': 0.09 });
        [[xa, '−540 d'], [xb, '+540 d']].forEach(([x, lab]) => { if (x < 0 || x > w) return; mk('line', { x1: x, x2: x, y1: 0, y2: H, stroke: gold, 'stroke-opacity': 0.4, 'stroke-width': 1 }); const t = mk('text', { x: x + 3, y: H - 6, fill: gold, 'font-size': 10 }); t.textContent = lab; });
        if (xh >= 0 && xh <= w) { mk('line', { x1: xh, x2: xh, y1: 0, y2: H, stroke: gold, 'stroke-width': 1.5, 'stroke-dasharray': '6 4' });
          let txt = `Halvering ${ds.split('-').reverse().join('.')}${est ? ' (anslag)' : ''}`;
          if (!est && DB) { const ih = dIx.get(th); if (ih != null) { const j = Math.min(DB.length - 1, ih + 540), r = (DB[j].c / DB[ih].c - 1) * 100; txt += ` · BTC ${j - ih < 540 ? 'hittil' : '+540 d'}: ${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(0)} %`; } }
          if (est && th > lastT) txt += ` – ${Math.round((th - Date.now()) / 864e5)} d igjen`;
          const t = mk('text', { x: xh + 4, y: 14, fill: gold, 'font-size': 11, 'font-weight': 600 }); t.textContent = txt; }
        else if (est && th > lastT && xa <= w) { const t = mk('text', { x: w - 8, y: 30, 'text-anchor': 'end', fill: gold, 'font-size': 11, 'font-weight': 600 }); t.textContent = `Neste halvering ca. april 2028 – ${Math.round((th - Date.now()) / 864e5)} d igjen`; }
      }); }
    return [svg];
  }
  function markers(B) { const s = RG.biasSeries(B, closedEnd(B)), out = []; let prev = null;
    for (const x of s) { if (x.b !== prev && prev != null && x.b !== 'neutral') out.push({ time: ts(x.t), position: x.b === 'long' ? 'belowBar' : 'aboveBar', color: x.b === 'long' ? css('--up') : css('--down'), shape: x.b === 'long' ? 'arrowUp' : 'arrowDown', text: '' }); prev = x.b; }
    return out; }
  function legend(tf) {
    const box = document.getElementById('tm-legend'), it = (color, txt, style) => { const s = el('span'); const i = el('i'); i.style.borderTopColor = color; if (style) i.style.borderTopStyle = style; s.append(i, document.createTextNode(txt)); return s; };
    const sw = (c2, txt) => { const s2 = el('span'); const b2 = el('b', 'zsw ' + c2); s2.append(b2, document.createTextNode(txt)); return s2; };
    const a = [it(css('--orange'), '200-dagerslinja')];
    if (T.ind.lv) a.push(sw('up', 'Støtte'), sw('down', 'Motstand'));
    if (T.ind.tl) a.push(it(css('--up'), 'Trendlinjer'));
    if (T.ind.w200) a.push(it('#d6336c', '200-ukerslinja'));
    if (T.ind.w200z) a.push(sw('w2z', '200W-soner'));
    if (T.ind.halv) a.push(it('#a16207', 'Halvering ±540 d', 'dashed'));
    if (T.ind.w50) a.push(it(css('--fg'), '50-ukerslinja', 'dashed')); if (T.ind.s300) a.push(it(css('--orange'), '300-dagerslinja', 'dotted'));
    if (T.ind.e50) a.push(it(css('--blue'), '50-dagerslinja')); if (T.ind.e20) a.push(it(css('--purple'), '20-dagerslinja'));
    box.replaceChildren(...a);
  }
  function status() {
    const box = document.getElementById('tm-status'); const tf = T.tf, c = T.kl[key(T.sym, tf)]; if (!box || !c) return;
    if (!c.B) { box.className = 'down small'; box.textContent = c.err ? 'Kursdata er ikke tilgjengelig akkurat nå (Binance svarte ikke). Prøver igjen automatisk.' : 'Henter kurser …'; return; }
    const late = Date.now() - c.at > 5 * 6e4, gaps = RG.gaps(c.B, MS[tf] * (tf === '1M' ? 1.1 : 1));
    let t = `Binance · kl. ${hm(c.at)} · norsk tid`;
    if (c.err) t += ` · ⚠ siste oppdatering feilet`; else if (late) t += ' · ⚠ kan være forsinket';
    if (gaps.length) t += ` · ⚠ ${gaps.length} hull i dataene`;
    box.className = (c.err || late || gaps.length ? 'warn' : 'muted') + ' small'; box.textContent = t;
  }

  // ---------------------------------------------------------------- forklaring i klartekst (kort)
  function point(icon, iconCls, title, text) { const d = el('div', 'pt'), i = el('span', 'ic ' + (iconCls || ''), icon), s = el('div', 'stack'); s.style.gap = '2px'; s.append(el('b', null, title), el('span', null, text)); d.append(i, s); return d; }
  const goTab = (a, tab, extra) => { a.href = '#tab=' + tab; a.addEventListener('click', e => { e.preventDefault(); dash.setParams(Object.assign({ tab }, extra || {})); window.scrollTo({ top: 0 }); }); return a; };
  function drawExplain() {
    const box = document.getElementById('tm-explain'); if (!box || !T.sym) return; const n = names()[T.sym] || T.sym, t = trend(T.sym), H = hist();
    document.getElementById('tm-ex-title').textContent = `Hva betyr dette for ${n}?`;
    if (!t) { box.replaceChildren(el('p', 'muted', T.kl[key(T.sym, '1d')] && T.kl[key(T.sym, '1d')].err ? 'Kursdata er ikke tilgjengelig akkurat nå.' : 'Henter …')); return; }
    const out = [], days = t.side === 1 ? '1 dag' : `${t.side} dager`;
    out.push(point(t.above ? '▲' : '▼', t.above ? 'up' : 'down', (t.above ? 'Opptrend' : 'Nedtrend') + (t.near ? ' – helt nær trendlinja' : ''),
      `${pa(t.d200)} ${t.above ? 'over' : 'under'} 200-dagerslinja (${price(t.e200)}) i ${days}. Et dagslukk på den andre siden snur trenden.`));
    if (t.ath) out.push(point('↧', '', t.dd > -0.005 ? 'På rekordnivå' : `${pa(t.dd)} under rekorden`, t.dd > -0.005 ? 'Høyeste kurs noen gang.' : `Rekord ${price(t.ath)} (${my(t.athT)}). Siste uke ${pct(t.r7)}, siste måned ${pct(t.r30)}.`));
    const mc = window.MACRO && MACRO.summary();
    if (mc) { const b = mc.btc90, tot = mc.counts.gronn + mc.counts.gul + mc.counts.rod, pt = point('M', mc.cls, `Makro: ${mc.label.toLowerCase()}`, `${mc.counts.gronn} av ${tot} drivere grønne.${b && b.n ? ` Lignende uker før: ${pct0(b.q50)} etter 3 mnd (median). ` : ' '}`);
      pt.lastChild.lastChild.append(goTab(el('a', null, 'Makrobildet'), 'makro')); out.push(pt); }
    const h = H && H.coins && H.coins[T.sym] && H.coins[T.sym].hz[90], r = h && h.range;
    if (r) { const pt = point('?', '', 'Neste 3 måneder', `Trolig ${price(t.px * (1 + r.lo))} – ${price(t.px * (1 + r.hi))}${r.cover && r.cover.n ? ` (stemt ${nf(r.cover.cover * 10, { maximumFractionDigits: 0 })} av 10 ganger før)` : ''}. Retningen kan ingen spå. `);
      pt.lastChild.lastChild.append(goTab(el('a', null, 'Scenarioer'), 'historikk', { coin: T.sym })); out.push(pt); }
    out.push(el('p', 'muted small', 'Ikke kjøps- eller salgsråd.'));
    box.replaceChildren(...out);
  }

  // ---------------------------------------------------------------- viktige nivåer: kompakt liste under grafen, kort forklaring når man trykker
  function drawLevels() {
    const box = document.getElementById('tm-levels'); if (!box || !T.sym) return; const n = names()[T.sym] || T.sym, t = trend(T.sym);
    document.getElementById('tm-lv-title').textContent = `Viktige nivåer for ${n}`;
    if (!t) { box.replaceChildren(el('p', 'muted', 'Henter …')); return; }
    const md = window.MACRO && MACRO.data(), ML = md && md.lines && md.lines[T.sym], px = t.px, items = [];
    const near = (a, b) => a && b && Math.abs(a / b - 1) < 0.015, dist = p => (p > px ? '+' : '−') + nf(Math.abs(p / px - 1) * 100, { maximumFractionDigits: Math.abs(p / px - 1) < 0.1 ? 1 : 0 }) + ' %';
    const lines = [['e200', t.e200, '200-dagerslinja', 'Hovedtrenden: over = opptrend, under = nedtrend.'], ['s300', t.s300, '300-dagerslinja', 'Tregere trendlinje – ofte siste støtte i et oksemarked.'],
      ['w200', t.w200, '200-ukerslinja', 'Historisk gulv i bjørnemarkeder (bunner fra rett under til ca. 35 % under).'], ['w50', t.w50, '50-ukerslinja', 'Skillet mellom bjørne- og oksemarked. Ukelukket teller.']];
    const histTxt = k => { const x = ML && ML.tests && ML.tests[k]; if (!x || !x.n) return ''; return ` Holdt ${x.held} av ${x.n} tester ovenfra${x.med90held != null ? `; ${pct0(x.med90held)} etter 3 mnd når den holdt` : ''}${x.med90fail != null ? `, ${pct0(x.med90fail)} når den brøt` : ''}.`; };
    for (const [k, p, nm, why] of lines) if (p) items.push({ p, kind: nm, cls: 'ma', n: null, text: why + histTxt(k) });
    const conf = p => { const c = lines.filter(([, q]) => near(p, q)).map(([, , nm]) => nm); return c.length ? ` Sammenfaller med ${c.join(' og ')}.` : ''; };
    t.sr.res.forEach((l, i) => { const nx = t.sr.res[i + 1]; items.push({ p: l.p, kind: `Motstand ${i + 1}`, cls: 'down', n: l.n, text: `Snudd ned her ${l.n === 1 ? 'én gang' : l.n + ' ganger'}${l.last ? `, sist ${my(l.last)}` : ''}.${conf(l.p)}${nx ? ` Neste ved brudd: ${price(nx.p)}.` : ''}` }); });
    t.sr.sup.forEach((l, i) => { const nx = t.sr.sup[i + 1]; items.push({ p: l.p, kind: `Støtte ${i + 1}`, cls: 'up', n: l.n, text: `Snudd opp her ${l.n === 1 ? 'én gang' : l.n + ' ganger'}${l.last ? `, sist ${my(l.last)}` : ''}.${conf(l.p)}${nx ? ` Neste ved brudd: ${price(nx.p)}.` : ''}` }); });
    const tl = t.tl || {};
    if (tl.up && tl.up.now) items.push({ p: tl.up.now, kind: 'Stigende trendlinje', cls: 'up', n: tl.up.touches, text: 'Gjennom stigende bunner. Dagslukk under = faresignal.' });
    if (tl.down && tl.down.now) items.push({ p: tl.down.now, kind: 'Fallende trendlinje', cls: 'down', n: tl.down.touches, text: 'Gjennom fallende topper. Dagslukk over kan bety at nedgangen er brutt.' });
    if (t.ath && t.ath / px < 1.8 && t.dd < -0.005) items.push({ p: t.ath, kind: 'Rekorden', cls: 'ma', n: null, text: `Høyeste dagslukk (${my(t.athT)}). Over den finnes ingen tidligere selgere.` });
    const above = items.filter(x => x.p >= px).sort((a, b) => b.p - a.p), below = items.filter(x => x.p < px).sort((a, b) => b.p - a.p);
    const C = T.chart; let tmp = null; const showLine = (p, col) => { if (!C) return; if (tmp) { C.S.candle.removePriceLine(tmp); tmp = null; } if (p != null) tmp = C.S.candle.createPriceLine({ price: p, color: col, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: '' }); };
    const row = x => { const d = el('details', 'lv'), s2 = el('summary'), dot = el('span', 'dot ' + (x.cls === 'ma' ? '' : x.cls)), str = el('span', 'str');
      if (x.n != null) str.append(...[1, 2, 3].map(k => el('i', k <= Math.min(3, x.n) ? 'on' : ''))); else str.append(el('span', 'tag', x.kind === 'Rekorden' ? 'topp' : 'snitt'));
      s2.append(dot, el('span', 'nm', x.kind), el('span', 'p', price(x.p)), el('span', 'ds ' + (x.p > px ? 'down' : 'up'), dist(x.p)), str); d.append(s2, el('p', 'small', x.text));
      s2.addEventListener('mouseenter', () => showLine(x.p, x.cls === 'up' ? css('--up') : x.cls === 'down' ? css('--down') : css('--blue'))); s2.addEventListener('mouseleave', () => showLine(null)); return d; };
    const now = el('div', 'lv now'); now.append(el('span', 'dot'), el('span', 'nm', 'Kursen nå'), el('span', 'p', price(px)), el('span', 'ds'), el('span', 'str'));
    box.replaceChildren(...above.map(row), now, ...below.map(row));
  }

  // ---------------------------------------------------------------- verktøylinje over grafen og periodelinje under (som i TradingView)
  const btn = (txt, on, fn, title, c2) => { const b = el('button', 'tb' + (c2 ? ' ' + c2 : ''), txt); b.type = 'button'; if (on != null) b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (title) b.title = title; b.addEventListener('click', fn); return b; };
  function setTf(tf) { if (tf === T.tf) return; const C = T.chart; let from = null;
    if (C && C.B) { const r = C.ch.timeScale().getVisibleLogicalRange(); if (r) { const i = Math.max(0, Math.min(C.B.length - 1, Math.round(r.from))); from = C.B[i].t; } }
    const bars = from != null ? (Date.now() - from) / MS[tf] : 0; T.tf = tf; T.rng = null; T.view = bars >= 20 && bars <= 1500 ? { from } : { bars: 150 }; save(); controls(); drawDetail(true); }
  function setRng(r) { T.rng = r; const [ms, def] = RNG[r], need = ms / MS[T.tf]; if (r === 'Alt' ? MS[T.tf] < MS['1d'] : need > 1500 || need < 20) T.tf = def;
    T.view = { from: r === 'Alt' ? 0 : Date.now() - ms }; save(); controls(); if (T.chart && T.kl[key(T.sym, T.tf)] && T.chart.k === key(T.sym, T.tf)) applyView(); else drawDetail(true); }
  function indMenu() {
    const dd = el('div', 'dd'), b = btn('Indikatorer ▾', null, () => { p.hidden = !p.hidden; if (!p.hidden) { const r = b.getBoundingClientRect(); p.style.left = r.left + 330 > window.innerWidth ? 'auto' : '0'; p.style.right = r.left + 330 > window.innerWidth ? '0' : 'auto'; } }, 'Linjer og indikatorer i grafen');
    const p = el('div', 'ddp'); p.hidden = true; b.setAttribute('aria-haspopup', 'true');
    const ch = el('div', 'ddl'); Object.entries(IND).forEach(([k, [l]]) => { const lb = el('label'), i = el('input'); i.type = 'checkbox'; i.checked = !!T.ind[k]; i.addEventListener('change', () => { T.ind[k] = i.checked; save(); paint(); }); lb.append(i, document.createTextNode(' ' + l)); ch.append(lb); });
    const sb = el('div', 'seg sm'); [['none', 'Ingen'], ['rsi', 'RSI'], ['macd', 'MACD'], ['atr', 'ATR %']].forEach(([k, l]) => { const x = el('button', null, l); x.type = 'button'; x.setAttribute('aria-pressed', k === T.sub ? 'true' : 'false'); x.addEventListener('click', () => { T.sub = k; save(); sb.querySelectorAll('button').forEach(y => y.setAttribute('aria-pressed', y === x ? 'true' : 'false')); paint(); }); sb.append(x); });
    p.append(el('b', 'small', 'Vis i grafen'), ch, el('b', 'small', 'Panel under grafen'), sb);
    document.addEventListener('pointerdown', e => { if (!p.hidden && !dd.contains(e.target)) p.hidden = true; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') p.hidden = true; });
    dd.append(b, p); return dd;
  }
  function controls() {
    const bar = document.getElementById('tm-tools'); if (!bar) return;
    const g1 = el('div', 'tgroup'); g1.setAttribute('role', 'group'); g1.setAttribute('aria-label', 'Tidsramme for hvert lys');
    Object.entries(TFL).forEach(([k, [s2, l]]) => g1.append(btn(s2, k === T.tf, () => setTf(k), `Hvert lys = ${l}`)));
    if (!T.menu) T.menu = indMenu();
    bar.replaceChildren(g1, ...(T.chart && T.chart.D ? [T.chart.D.toolbar()] : []), T.menu);
    const rb = document.getElementById('tm-range'); if (!rb) return; const g2 = el('div', 'tgroup'); g2.setAttribute('role', 'group'); g2.setAttribute('aria-label', 'Periode');
    Object.keys(RNG).forEach(r => g2.append(btn(r, r === T.rng, () => setRng(r), r === 'Alt' ? 'Hele historikken' : `Vis siste ${r}`)));
    const g3 = el('div', 'tgroup'); g3.append(btn('log', T.log, () => { T.log = !T.log; save(); if (T.chart) T.chart.ch.priceScale('right').applyOptions({ mode: T.log ? 1 : 0 }); controls(); }, 'Loggskala: like store prosentbevegelser er like høye'),
      btn('⤢', null, () => { if (T.chart) { T.chart.ch.priceScale('right').applyOptions({ autoScale: true }); T.view = T.rng ? { from: T.rng === 'Alt' ? 0 : Date.now() - RNG[T.rng][0] } : { bars: 150 }; applyView(); } }, 'Tilbakestill utsnittet'));
    rb.replaceChildren(g2, g3);
  }

  // ---------------------------------------------------------------- inngang
  function drawDetail(reload) {
    if (!T.built || !T.sym) return; const tf = T.tf, n = names()[T.sym] || T.sym;
    document.getElementById('tm-title').textContent = `${n} · ${TFL[tf][0]}`;
    const L = live(T.sym), ph = document.getElementById('tm-price');
    ph.replaceChildren(...(L && L.p ? [el('b', null, price(L.p) + ' '), el('span', cls(L.chg), pct(L.chg / 100) + ' siste døgn')] : [el('span', 'muted', 'Pris ikke tilgjengelig')]));
    if (reload) { if (T.chart) T.chart.k = null; status(); loadK(T.sym, tf, true).then(() => { if (tf === T.tf) { paint(true); status(); } }); if (tf !== '1d') loadK(T.sym, '1d').then(() => { paint(); drawExplain(); drawLevels(); }); if (tf !== '1w') loadK(T.sym, '1w').then(() => { paint(); drawLevels(); });
      if (T.chart && T.chart.D) T.chart.D.refresh(); }
    else { paint(); status(); }
    drawExplain(); drawLevels(); poll();
  }
  function poll() { clearTimeout(T.timer); const tf = T.tf; T.timer = setTimeout(() => {
    const vis = !document.getElementById('terminal').hidden; if (document.hidden || !vis) { poll(); return; }
    tickK(T.sym, tf).then(() => { if (tf === T.tf) { paint(); status(); } poll(); }); loadDays(); }, POLL[tf]); }
  function render() {
    if (typeof RG === 'undefined') return; const p = dash.params(), L = list();
    if (p.coin && L.includes(p.coin) && p.coin !== T.sym) { T.sym = p.coin; if (T.built) drawDetail(true); }
    if (!T.sym) T.sym = L[0];
    if (!T.built) { T.built = true; T.chart = makeChart(); if (!T.chart) document.getElementById('tm-status').textContent = 'Grafbiblioteket kunne ikke lastes.'; controls();
      loadGlobal(); setInterval(() => { if (!document.hidden) loadGlobal(); }, 5 * 6e4); loadDays(true); drawDetail(true); }
    drawBar(); drawCoins(); drawExplain(); drawLevels();
    const L2 = live(T.sym), ph = document.getElementById('tm-price'); if (L2 && L2.p) ph.replaceChildren(el('b', null, price(L2.p) + ' '), el('span', cls(L2.chg), pct(L2.chg / 100) + ' siste døgn'));
  }
  window.TERM = { render, _T: T, trend };
})();
