// Terminal-fanen: markedsoversikt, skanner og interaktiv candlestick-graf med flere tidsrammer.
// Data hentes direkte i nettleseren fra offentlige API-er (Binance, CoinGecko, alternative.me). Hver verdi vises med kilde og tidspunkt.
// Mangler data, står det «utilgjengelig» – ingenting fylles inn med gamle eller oppdiktede tall.
(() => {
  'use strict';
  const BIN = 'https://data-api.binance.vision/api/v3/';
  const TFS = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
  const TFL = { '1m': '1 min', '5m': '5 min', '15m': '15 min', '1h': '1 t', '4h': '4 t', '1d': '1 dag', '1w': '1 uke' };
  const POLL = { '1m': 1e4, '5m': 15e3, '15m': 3e4, '1h': 6e4, '4h': 6e4, '1d': 12e4, '1w': 3e5 };
  const SCAN_TF = ['1h', '4h', '1d'], SCAN_EVERY = 5 * 6e4;
  const IND = { ema20: ['EMA 20', true], ema50: ['EMA 50', true], ema200: ['EMA 200', false], vwap: ['VWAP', false], bb: ['Bollinger', false], vol: ['Volum', true], lv: ['Støtte/motstand', true], mk: ['Regelskifter', false], setup: ['Oppsett', true] };
  const T = { sym: null, tf: '4h', sub: 'rsi', ind: Object.fromEntries(Object.entries(IND).map(([k, v]) => [k, v[1]])), sort: { k: null, d: -1 }, filter: 'alle',
    kl: {}, glob: null, fng: null, bt: null, built: false, chart: null, timer: null, scanAt: 0, scanBusy: false };
  try { const s = JSON.parse(localStorage.getItem('ms-term') || '{}'); if (s.tf && TFS[s.tf]) T.tf = s.tf; if (s.sub) T.sub = s.sub; if (s.ind) Object.assign(T.ind, s.ind); } catch (e) { /* ingen lagring */ }
  const save = () => { try { localStorage.setItem('ms-term', JSON.stringify({ tf: T.tf, sub: T.sub, ind: T.ind })); } catch (e) { /* ignorer */ } };

  // ---------------------------------------------------------------- hjelpere
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const price = v => v == null || !isFinite(v) ? '–' : v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) : v >= 1 ? nf(v, { maximumFractionDigits: 3 }) : nf(v, { maximumSignificantDigits: 4 });
  const pct = (v, d = 1) => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  const big = v => v == null ? '–' : v >= 1e12 ? nf(v / 1e12, { maximumFractionDigits: 2 }) + ' bill. $' : v >= 1e9 ? nf(v / 1e9, { maximumFractionDigits: 1 }) + ' mrd. $' : nf(v / 1e6, { maximumFractionDigits: 0 }) + ' mill. $';
  const hms = t => t ? new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–';
  const hm = t => t ? new Date(t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
  const ago = t => { if (!t) return '–'; const s = Math.round((Date.now() - t) / 1000); return s < 90 ? `${s} s siden` : s < 5400 ? `${Math.round(s / 60)} min siden` : s < 172800 ? `${Math.round(s / 3600)} t siden` : `${Math.round(s / 86400)} d siden`; };
  const sc = v => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const sgn = v => v > 0 ? 'ai-pos' : v < 0 ? 'ai-neg' : 'ai-neu';
  const css = n => getComputedStyle(document.getElementById('app')).getPropertyValue(n).trim();
  const MS = () => window.__ms || {};
  const names = () => MS().NAMES || {};
  const list = () => (MS().state && MS().state.list && MS().state.list.length ? MS().state.list : ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'POL', 'SAND']);
  const getJSON = (url, ms = 12000) => { const c = new AbortController(), to = setTimeout(() => c.abort(), ms);
    return fetch(url, { cache: 'no-store', signal: c.signal }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(() => clearTimeout(to)); };

  // ---------------------------------------------------------------- data: candles
  const key = (s, tf) => s + '|' + tf;
  const mapK = a => a.map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], ct: x[6], qv: +x[7] }));
  function loadK(sym, tf, force) {
    const k = key(sym, tf), c = T.kl[k] || (T.kl[k] = { B: null, at: 0, err: null, errAt: 0, p: null });
    if (c.p) return c.p; if (!force && c.B && Date.now() - c.at < 2e4) return Promise.resolve(c);
    c.p = getJSON(`${BIN}klines?symbol=${sym}USDT&interval=${tf}&limit=500`).then(a => { if (!Array.isArray(a) || !a.length) throw new Error('tomt svar'); c.B = mapK(a); c.at = Date.now(); c.err = null; return c; })
      .catch(e => { c.err = String(e.message || e); c.errAt = Date.now(); return c; }).finally(() => { c.p = null; });
    return c.p;
  }
  // oppdater bare de siste candlene (billig), slå sammen med cache
  function tickK(sym, tf) {
    const c = T.kl[key(sym, tf)]; if (!c || !c.B) return loadK(sym, tf, true); if (c.p) return c.p;
    c.p = getJSON(`${BIN}klines?symbol=${sym}USDT&interval=${tf}&limit=3`).then(a => { const nb = mapK(a);
      for (const b of nb) { const L = c.B[c.B.length - 1]; if (b.t === L.t) c.B[c.B.length - 1] = b; else if (b.t > L.t) c.B.push(b); else { const i = c.B.findIndex(x => x.t === b.t); if (i >= 0) c.B[i] = b; } }
      if (c.B.length > 600) c.B = c.B.slice(-500); c.at = Date.now(); c.err = null; return c; })
      .catch(e => { c.err = String(e.message || e); c.errAt = Date.now(); return c; }).finally(() => { c.p = null; });
    return c.p;
  }
  const closedEnd = B => { let e = B.length - 1; while (e >= 0 && B[e].ct > Date.now()) e--; return e; };

  // ---------------------------------------------------------------- data: marked
  function loadGlobal() {
    getJSON('https://api.coingecko.com/api/v3/global').then(j => { const d = j && j.data; if (!d) throw new Error('tomt');
      T.glob = { mcap: d.total_market_cap && d.total_market_cap.usd, chg: d.market_cap_change_percentage_24h_usd, btcD: d.market_cap_percentage && d.market_cap_percentage.btc, ethD: d.market_cap_percentage && d.market_cap_percentage.eth, vol: d.total_volume && d.total_volume.usd, t: d.updated_at ? d.updated_at * 1000 : null, at: Date.now() }; })
      .catch(e => { T.glob = Object.assign({}, T.glob, { err: String(e.message || e), errAt: Date.now() }); }).finally(drawBar);
    getJSON('https://api.alternative.me/fng/?limit=2').then(j => { const d = j && j.data && j.data[0]; if (!d) throw new Error('tomt');
      T.fng = { v: +d.value, cls: d.value_classification, t: +d.timestamp * 1000, prev: j.data[1] ? +j.data[1].value : null, at: Date.now() }; })
      .catch(e => { T.fng = Object.assign({}, T.fng, { err: String(e.message || e), errAt: Date.now() }); }).finally(drawBar);
  }
  const FNG_NO = { 'Extreme Fear': 'Ekstrem frykt', Fear: 'Frykt', Neutral: 'Nøytral', Greed: 'Grådighet', 'Extreme Greed': 'Ekstrem grådighet' };

  // ---------------------------------------------------------------- skanner (1t/4t/1d for alle coins)
  function scan(force) {
    if (T.scanBusy || (!force && Date.now() - T.scanAt < SCAN_EVERY)) return; T.scanBusy = true;
    const jobs = []; for (const s of list()) for (const tf of SCAN_TF) jobs.push(() => loadK(s, tf, true));
    let i = 0; const run = () => i < jobs.length ? jobs[i++]().then(run) : null;
    Promise.all([run(), run(), run(), run()]).then(() => { T.scanAt = Date.now(); T.scanBusy = false; drawScan(); drawDetail(); });
  }
  function analyse(sym) {
    const tf = {}, info = {}; for (const k of SCAN_TF) { const c = T.kl[key(sym, k)]; if (!c || !c.B) { tf[k] = { ok: false }; continue; } const e = closedEnd(c.B); tf[k] = RG.assess(c.B.slice(Math.max(0, e - 499), e + 1)); info[k] = c; }
    const L = (window.__live || {})[sym], px = L && L.p ? L.p : (tf['1h'].ok ? tf['1h'].px : null);
    let lt = null; try { const c = MS().state && MS().state.coins[sym]; const g = c && MS().sgNow ? MS().sgNow(c) : null; if (g) lt = g; } catch (e) { lt = null; }
    let con = RG.conclude(tf, lt ? lt.s : null, px);
    const bad = SCAN_TF.filter(k => { const c = T.kl[key(sym, k)]; return c && !c.B && c.err; });
    if (bad.length) con = { code: 'nodata', label: 'Data utilgjengelig', why: [`Binance svarte ikke for ${bad.join(', ')} (${T.kl[key(sym, bad[0])].err}). Ingen vurdering uten ferske data.`], warn: [] };
    let vr = null; const d = info['1d']; if (d && d.B && L && L.qv) { const e = closedEnd(d.B); let s = 0, n = 0; for (let j = e - 19; j <= e; j++) if (j >= 0) { s += d.B[j].qv; n++; } vr = n && s ? L.qv / (s / n) : null; }
    return { sym, tf, px, live: L, lt, con, vr };
  }

  // ---------------------------------------------------------------- tegning: markedsbar
  function cell(label, value, cls, src) { const d = el('div', 'tm-kpi'); d.append(el('span', 'tm-k', label), el('b', cls || null, value), el('span', 'tm-src', src)); return d; }
  function drawBar() {
    const box = document.getElementById('tm-bar'); if (!box) return; const L = window.__live || {}, out = [];
    for (const s of ['BTC', 'ETH']) { const x = L[s]; out.push(x && x.p ? cell(s, `${price(x.p)} $`, null, `${pct(x.chg)} 24 t · Binance ${hms(x.t)}`) : cell(s, 'utilgjengelig', 'ai-muted', 'Binance svarte ikke')); }
    const g = T.glob;
    if (g && g.mcap) { out.push(cell('Total markedsverdi', big(g.mcap), null, `${pct(g.chg)} 24 t · CoinGecko ${hm(g.t)}${g.err ? ' · ⚠ siste oppdatering feilet' : ''}`)); out.push(cell('BTC-dominans', nf(g.btcD, { maximumFractionDigits: 1 }) + ' %', null, `ETH ${nf(g.ethD, { maximumFractionDigits: 1 })} % · CoinGecko ${hm(g.t)}`)); }
    else out.push(cell('Total markedsverdi / dominans', 'utilgjengelig', 'ai-muted', g && g.err ? `CoinGecko: ${g.err}` : 'Henter fra CoinGecko …'));
    const f = T.fng;
    if (f && f.v != null) out.push(cell('Fear & Greed', `${f.v} – ${FNG_NO[f.cls] || f.cls}`, f.v <= 25 ? 'ai-neg' : f.v >= 75 ? 'ai-pos' : null, `${f.prev != null ? 'i går ' + f.prev + ' · ' : ''}alternative.me ${hm(f.t)} (daglig)`));
    else out.push(cell('Fear & Greed', 'utilgjengelig', 'ai-muted', f && f.err ? `alternative.me: ${f.err}` : 'Henter …'));
    box.replaceChildren(...out);
  }

  // ---------------------------------------------------------------- tegning: skanner-tabell
  const BIAS = { long: ['▲ opp', 'ai-pos'], short: ['▼ ned', 'ai-neg'], neutral: ['– nøytral', 'ai-neu'] };
  const CON = { long: 'tm-c-long', short: 'tm-c-short', accum: 'tm-c-accum', hold: 'tm-c-hold', avoid: 'tm-c-avoid', nodata: 'tm-c-nodata' };
  const LT = { buy: ['KJØP', 'ai-pos'], sell: ['SELG', 'ai-neg'], hold: ['HOLD', null], weak: ['HOLD (svak)', 'ai-muted'] };
  const COLS = [['coin', 'Coin', 'l'], ['px', 'Pris', ''], ['chg', '24 t', ''], ['b1h', '1 t', ''], ['b4h', '4 t', ''], ['b1d', '1 d', ''], ['reg', 'Regime 4 t', 'l'], ['rsi', 'RSI 4 t', ''], ['vr', 'Volum vs 20 d', ''], ['lt', 'Langsiktig', 'l'], ['con', 'Vurdering', 'l'], ['rr', 'R : R', ''], ['age', 'Data', '']];
  function drawScan() {
    const box = document.getElementById('tm-scan'); if (!box || typeof RG === 'undefined') return;
    const rows = list().map(analyse);
    const fl = { alle: () => true, oppsett: r => r.con.code === 'long' || r.con.code === 'short', long: r => r.con.code === 'long' || r.con.code === 'accum', short: r => r.con.code === 'short' };
    const val = (r, k) => ({ coin: r.sym, px: r.px, chg: r.live && r.live.chg, b1h: r.tf['1h'].score, b4h: r.tf['4h'].score, b1d: r.tf['1d'].score, reg: r.tf['4h'].regime, rsi: r.tf['4h'].rsi, vr: r.vr, lt: r.lt && r.lt.s, con: r.con.label, rr: r.con.setup && r.con.setup.rr, age: r.tf['1h'].t })[k];
    let rs = rows.filter(fl[T.filter] || fl.alle);
    if (T.sort.k) rs.sort((a, b) => { const x = val(a, T.sort.k), y = val(b, T.sort.k); if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * T.sort.d; });
    const tb = el('table', 'ai-table tm-table'), th = el('tr');
    COLS.forEach(([k, l, c]) => { const h = el('th', c, l); h.tabIndex = 0; h.setAttribute('role', 'button'); h.title = 'Sorter';
      if (T.sort.k === k) h.textContent += T.sort.d > 0 ? ' ↑' : ' ↓';
      const go = () => { T.sort = { k, d: T.sort.k === k ? -T.sort.d : -1 }; drawScan(); }; h.addEventListener('click', go); h.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); th.append(h); });
    tb.append(el('thead')); tb.firstChild.append(th); const body = el('tbody');
    for (const r of rs) {
      const tr = el('tr', r.sym === T.sym ? 'hl tm-row' : 'tm-row'); tr.tabIndex = 0; tr.title = 'Vis graf og analyse';
      const td = (txt, cls) => { const d = el('td', cls, txt); tr.append(d); return d; };
      const n = td(null, 'l'); n.append(el('b', null, r.sym), el('span', 'ai-muted', ' ' + (names()[r.sym] || '')));
      td(r.px ? price(r.px) : 'utilgj.', r.px ? '' : 'ai-muted'); td(pct(r.live && r.live.chg), sgn(r.live && r.live.chg));
      for (const k of SCAN_TF) { const a = r.tf[k]; if (!a.ok) { td('–', 'ai-muted'); continue; } const b = BIAS[a.bias]; td(`${b[0]} ${sc(a.score)}`, b[1]); }
      const a4 = r.tf['4h']; td(a4.ok ? a4.regime + (a4.vol === 'Høy volatilitet' ? ' · høy vol.' : '') : '–', 'l');
      td(a4.ok ? nf(a4.rsi, { maximumFractionDigits: 0 }) : '–'); td(r.vr == null ? '–' : nf(r.vr, { maximumFractionDigits: 1 }) + '×', r.vr != null && r.vr >= 1.5 ? 'ai-pos' : '');
      const lt = r.lt ? LT[r.lt.s] : null; td(lt ? lt[0] : '–', 'l ' + (lt && lt[1] || ''));
      const cc = td(null, 'l'); cc.append(el('span', 'tm-con ' + CON[r.con.code], r.con.label));
      td(r.con.setup ? nf(r.con.setup.rr, { maximumFractionDigits: 1 }) : '–', r.con.setup && r.con.setup.rr >= 1.5 ? '' : 'ai-muted');
      const age = r.tf['1h'].ok ? r.tf['1h'].t + TFS['1h'] : null; const ad = td(age ? ago(Math.max(age, (T.kl[key(r.sym, '1h')] || {}).at || 0)) : 'mangler', age ? 'ai-muted' : 'ai-neg');
      const err = SCAN_TF.map(k => T.kl[key(r.sym, k)]).filter(c => c && c.err); if (err.length) { ad.textContent = '⚠ feil'; ad.className = 'ai-neg'; ad.title = err.map(c => c.err).join(', '); }
      const pick = () => { T.sym = r.sym; dash.setParams({ coin: r.sym }); drawScan(); drawDetail(true); const d = document.getElementById('tm-detail'); if (d && d.getBoundingClientRect().top > window.innerHeight * 0.6) d.scrollIntoView({ behavior: 'smooth' }); };
      tr.addEventListener('click', pick); tr.addEventListener('keydown', e => { if (e.key === 'Enter') pick(); }); body.append(tr);
    }
    tb.append(body);
    const wrap = el('div', 'ai-tablewrap'); wrap.append(tb);
    const filt = el('div', 'ai-seg'); filt.setAttribute('role', 'group'); filt.setAttribute('aria-label', 'Filter');
    [['alle', 'Alle'], ['oppsett', 'Mulige oppsett'], ['long', 'Long / akkumuler'], ['short', 'Short']].forEach(([k, l]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', T.filter === k ? 'true' : 'false'); b.addEventListener('click', () => { T.filter = k; drawScan(); }); filt.append(b); });
    const st = el('p', 'ai-muted', T.scanAt ? `Skannet ${hms(T.scanAt)} (hvert 5. min) · Binance-candles 1 t / 4 t / 1 d, bare lukkede candles · Pris og 24 t: Binance live` : 'Henter candles fra Binance …');
    const empty = rs.length ? null : el('p', 'ai-muted', T.filter === 'alle' ? 'Ingen coins.' : 'Ingen coins passer filteret akkurat nå. Det er et gyldig svar – ikke alle markeder har en mulighet.');
    box.replaceChildren(filt, wrap, ...(empty ? [empty] : []), st);
  }

  // ---------------------------------------------------------------- graf (TradingView Lightweight Charts)
  const tzOff = t => -new Date(t).getTimezoneOffset() * 60; // vis lokal tid
  const ts = t => Math.floor(t / 1000) + tzOff(t);
  const prec = p => p >= 1000 ? 0 : p >= 100 ? 2 : p >= 1 ? 4 : p >= 0.01 ? 5 : 7;
  function makeChart() {
    const LW = window.LightweightCharts; if (!LW) return null;
    const box = document.getElementById('tm-chart'), sub = document.getElementById('tm-sub');
    const opt = () => ({ autoSize: true, localization: { locale: 'nb-NO', dateFormat: 'dd.MM.yy' }, layout: { background: { type: 'solid', color: css('--color-panel') }, textColor: css('--color-fg-muted'), fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { color: css('--cds-chart-grid') }, horzLines: { color: css('--cds-chart-grid') } }, rightPriceScale: { borderColor: css('--color-border-line') },
      timeScale: { borderColor: css('--color-border-line'), timeVisible: true, secondsVisible: false, rightOffset: 4 }, crosshair: { mode: 0 } });
    const ch = LW.createChart(box, opt()), sc = LW.createChart(sub, Object.assign(opt(), { timeScale: { visible: false } }));
    const up = css('--color-ok'), dn = css('--color-bad');
    const S = { candle: ch.addCandlestickSeries({ upColor: up, downColor: dn, wickUpColor: up, wickDownColor: dn, borderVisible: false }),
      vol: ch.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }),
      ema20: ch.addLineSeries({ color: css('--c1'), lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
      ema50: ch.addLineSeries({ color: css('--c2'), lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
      ema200: ch.addLineSeries({ color: css('--color-warn'), lineWidth: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
      vwap: ch.addLineSeries({ color: css('--c3'), lineWidth: 1, lineStyle: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
      bbU: ch.addLineSeries({ color: css('--cds-chart-muted'), lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
      bbL: ch.addLineSeries({ color: css('--cds-chart-muted'), lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
      o1: sc.addLineSeries({ color: css('--c1'), lineWidth: 1, priceLineVisible: false }), o2: sc.addLineSeries({ color: css('--c2'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false }),
      oh: sc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false }) };
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    let lock = false; const sync = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange(r => { if (lock || !r) return; lock = true; b.timeScale().setVisibleLogicalRange(r); lock = false; });
    sync(ch, sc); sync(sc, ch);
    const legend = document.getElementById('tm-legend');
    ch.subscribeCrosshairMove(p => { const C = T.chart; if (!C || !C.B) return; let b = null;
      if (p && p.time != null) { const d = p.seriesData.get(S.candle); if (d) b = C.byT.get(p.time); } if (!b) b = C.B[C.B.length - 1]; showLegend(legend, b); });
    return { ch, sc, S, lines: [], B: null, k: null, byT: new Map(), opt };
  }
  function showLegend(box, b) { if (!box || !b) return; const ch = b.c / b.o - 1;
    box.replaceChildren(el('span', 'ai-muted', new Date(b.t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })),
      el('span', null, `Å ${price(b.o)}  H ${price(b.h)}  L ${price(b.l)}  S ${price(b.c)}`), el('span', sgn(ch), pct(ch * 100, 2)), el('span', 'ai-muted', `Vol ${nf(b.qv / 1e6, { maximumFractionDigits: 2 })} mill. $`)); }
  const line = (B, a) => B.map((b, i) => a[i] == null ? { time: ts(b.t) } : { time: ts(b.t), value: a[i] });
  function paint(full) {
    const C = T.chart; if (!C) return; const c = T.kl[key(T.sym, T.tf)]; if (!c || !c.B) return; const B = c.B, k = key(T.sym, T.tf);
    const cl = B.map(b => b.c), up = css('--color-ok'), dn = css('--color-bad');
    if (full || C.k !== k) { const p = prec(B[B.length - 1].c); C.S.candle.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: Math.pow(10, -p) } }); }
    C.byT = new Map(B.map(b => [ts(b.t), b]));
    C.S.candle.setData(B.map(b => ({ time: ts(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    C.S.vol.setData(T.ind.vol ? B.map(b => ({ time: ts(b.t), value: b.qv, color: (b.c >= b.o ? up : dn) + '55' })) : []);
    C.S.ema20.setData(T.ind.ema20 ? line(B, RG.ema(cl, 20)) : []); C.S.ema50.setData(T.ind.ema50 ? line(B, RG.ema(cl, 50)) : []); C.S.ema200.setData(T.ind.ema200 ? line(B, RG.ema(cl, 200)) : []);
    const intra = TFS[T.tf] < TFS['1d']; C.S.vwap.setData(T.ind.vwap && intra ? line(B, RG.vwap(B)) : []);
    const bb = T.ind.bb ? RG.boll(cl) : null; C.S.bbU.setData(bb ? line(B, bb.up) : []); C.S.bbL.setData(bb ? line(B, bb.lo) : []);
    // underpanel
    const sub = document.getElementById('tm-sub'); sub.hidden = T.sub === 'none'; const lab = document.getElementById('tm-sublabel'); if (lab) { lab.hidden = sub.hidden; lab.textContent = { rsi: 'RSI 14 (linjer ved 70 og 30)', macd: 'MACD 12/26/9 – linje, signal og histogram', atr: 'ATR 14 i prosent av kurs' }[T.sub] || ''; }
    if (T.sub === 'rsi') { C.S.o1.setData(line(B, RG.rsi(cl))); C.S.o2.setData([]); C.S.oh.setData(B.map(b => ({ time: ts(b.t) }))); setOscLines(C, [70, 30]); }
    else if (T.sub === 'macd') { const M = RG.macd(cl); C.S.o1.setData(line(B, M.macd)); C.S.o2.setData(line(B, M.signal)); C.S.oh.setData(B.map((b, i) => M.hist[i] == null ? { time: ts(b.t) } : { time: ts(b.t), value: M.hist[i], color: (M.hist[i] >= 0 ? up : dn) + '99' })); setOscLines(C, [0]); }
    else if (T.sub === 'atr') { const A = RG.atr(B); C.S.o1.setData(line(B, A.map((v, i) => v == null ? null : v / B[i].c * 100))); C.S.o2.setData([]); C.S.oh.setData(B.map(b => ({ time: ts(b.t) }))); setOscLines(C, []); }
    // nivåer og oppsett
    C.lines.forEach(l => C.S.candle.removePriceLine(l)); C.lines = [];
    const e = closedEnd(B), a = RG.assess(B.slice(Math.max(0, e - 499), e + 1));
    const pl = (p, color, title, style = 2, w = 1) => { if (p == null || !isFinite(p)) return; C.lines.push(C.S.candle.createPriceLine({ price: p, color, lineWidth: w, lineStyle: style, axisLabelVisible: true, title })); };
    if (T.ind.lv && a.ok) { a.support.forEach((l, i) => pl(l.p, up, i ? 'støtte 2' : 'støtte')); a.resist.forEach((l, i) => pl(l.p, dn, i ? 'motstand 2' : 'motstand')); }
    const r = T.sym && analyse(T.sym); if (T.ind.setup && r && r.con.setup && (r.con.code === 'long' || r.con.code === 'short')) { const s = r.con.setup; pl(s.stop, dn, 'invalidering', 0, 2); pl(s.t1, up, 'mål 1', 0, 2); if (s.t2) pl(s.t2, up, 'mål 2', 1); }
    C.S.candle.setMarkers(T.ind.mk ? markers(B, e) : []);
    if (C.k !== k) { C.ch.timeScale().fitContent(); const n = B.length; C.ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 160), to: n + 4 }); }
    C.k = k; C.B = B; showLegend(document.getElementById('tm-legend'), B[B.length - 1]);
  }
  function setOscLines(C, lv) { (C.osc || []).forEach(l => C.S.o1.removePriceLine(l)); C.osc = lv.map(v => C.S.o1.createPriceLine({ price: v, color: css('--cds-chart-reference'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false })); }
  function markers(B, e) { const s = RG.biasSeries(B, e), out = []; let prev = null;
    for (const x of s) { if (x.b !== prev && prev != null && x.b !== 'neutral') out.push({ time: ts(x.t), position: x.b === 'long' ? 'belowBar' : 'aboveBar', color: x.b === 'long' ? css('--color-ok') : css('--color-bad'), shape: x.b === 'long' ? 'arrowUp' : 'arrowDown', text: x.b === 'long' ? 'L' : 'S' }); prev = x.b; }
    return out; }

  // ---------------------------------------------------------------- detaljpanel
  function controls() {
    const tfb = document.getElementById('tm-tf'); tfb.replaceChildren(...Object.keys(TFS).map(k => { const b = el('button', null, k); b.type = 'button'; b.title = TFL[k]; b.setAttribute('aria-pressed', k === T.tf ? 'true' : 'false'); b.addEventListener('click', () => { T.tf = k; save(); controls(); drawDetail(true); }); return b; }));
    const ib = document.getElementById('tm-ind'); ib.replaceChildren(...Object.entries(IND).map(([k, [l]]) => { const lb = el('label', 'tm-chip'); const i = el('input'); i.type = 'checkbox'; i.checked = !!T.ind[k]; i.addEventListener('change', () => { T.ind[k] = i.checked; save(); paint(); }); lb.append(i, document.createTextNode(' ' + l)); return lb; }));
    const sb = document.getElementById('tm-subsel'); sb.replaceChildren(...[['rsi', 'RSI'], ['macd', 'MACD'], ['atr', 'ATR %'], ['none', 'Skjul']].map(([k, l]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', k === T.sub ? 'true' : 'false'); b.addEventListener('click', () => { T.sub = k; save(); controls(); paint(); }); return b; }));
  }
  function drawDetail(reload) {
    if (!T.built || !T.sym) return;
    const c = T.kl[key(T.sym, T.tf)];
    document.getElementById('tm-title').textContent = `${names()[T.sym] || T.sym} (${T.sym}/USDT) · ${TFL[T.tf]}`;
    if (reload || !c || !c.B) { status('Henter candles fra Binance …'); loadK(T.sym, T.tf, true).then(() => { paint(true); status(); drawSummary(); }); }
    else { paint(); status(); }
    drawSummary(); schedulePoll();
  }
  function status(msg) {
    const box = document.getElementById('tm-status'); if (!box) return; if (msg) { box.className = 'ai-muted'; box.textContent = msg; return; }
    const c = T.kl[key(T.sym, T.tf)]; if (!c) return;
    if (!c.B) { box.className = 'ai-neg'; box.textContent = `Kursdata utilgjengelig: Binance svarte ikke (${c.err || 'ukjent feil'}). Ingen graf vises i stedet for gamle data.`; return; }
    const B = c.B, e = closedEnd(B), last = B[B.length - 1], g = RG.gaps(B, TFS[T.tf]), late = Date.now() - (last.t + TFS[T.tf]) > 2 * TFS[T.tf] + 6e4;
    const parts = [`Kilde: Binance ${T.sym}USDT`, `${B.length} candles`, `siste lukkede ${hm(B[e] && B[e].t + TFS[T.tf])}`, `pågående candle oppdatert ${hms(c.at)}`];
    if (g.length) parts.push(`⚠ ${g.length} hull i dataene (${g.reduce((s, x) => s + x.missing, 0)} candles mangler)`);
    if (c.err) parts.push(`⚠ siste oppdatering feilet ${hms(c.errAt)} (${c.err}) – viser data hentet ${hms(c.at)}`);
    if (late) parts.push('⚠ siste candle er eldre enn forventet');
    box.className = c.err || late || g.length ? 'ai-warn' : 'ai-muted'; box.textContent = parts.join(' · ') + '. Tider i lokal tid.';
  }
  function schedulePoll() {
    clearTimeout(T.timer); T.timer = setTimeout(() => {
      if (document.hidden || !visible()) { schedulePoll(); return; }
      tickK(T.sym, T.tf).then(() => { paint(); status(); drawSummary(); schedulePoll(); });
      if (Date.now() - T.scanAt > SCAN_EVERY) scan(); }, POLL[T.tf]);
  }
  const visible = () => { const s = document.getElementById('terminal'); return s && !s.hidden; };
  const rr = v => nf(v, { maximumFractionDigits: 1 }) + ' : 1';
  function drawSummary() {
    const box = document.getElementById('tm-ai'); if (!box || !T.sym) return; const r = analyse(T.sym), con = r.con;
    const head = el('div', 'ai-row'); head.append(el('span', 'tm-con tm-big ' + CON[con.code], con.label), el('span', 'ai-muted', `Regelbasert vurdering av ${names()[T.sym] || T.sym} på 1 t, 4 t og 1 d · ${T.scanAt ? 'skannet ' + hms(T.scanAt) : 'henter …'}`));
    const why = el('ul', 'tm-list'); con.why.forEach(w => why.append(el('li', null, w))); (con.warn || []).forEach(w => why.append(el('li', 'ai-warn', '⚠ ' + w)));
    const out = [head, why];
    if (con.setup && (con.code === 'long' || con.code === 'short')) {
      const s = con.setup, t = el('table', 'ai-table'), tr = (a, b, c2) => { const x = el('tr'); x.append(el('td', 'l', a), el('td', null, b), el('td', 'l wrap', c2)); t.append(x); };
      tr('Inngang (nå)', price(s.entry), 'Siste pris. Ingen garanti for fylling.'); tr('Invalidering', price(s.stop), `${pct(-s.dir * s.riskPct * 100)} fra inngang · bak nærmeste ${s.dir > 0 ? 'støtte' : 'motstand'} (4 t), 1–4 × ATR`);
      tr('Mål 1', price(s.t1), s.t1src); if (s.t2) tr('Mål 2', price(s.t2), 'neste nivå'); tr('Risiko / gevinst', rr(s.rr), 'til mål 1');
      out.push(t);
    }
    // historisk evidens for oppsettene
    const ev = el('div', 'tm-evidence'); const bt = T.bt;
    if (bt && bt.all) { const L = bt.long, S = bt.short;
      ev.append(el('b', null, 'Historisk test av disse oppsettene: ingen påvist fordel.'),
        el('p', null, `${bt.all.n} oppsett på 7 coins (${bt.from} – ${bt.to}), etter 0,1 % gebyr per side: snitt ${nf(bt.all.expR, { maximumFractionDigits: 2 })} R per handel (long ${nf(L.expR, { maximumFractionDigits: 2 })} R, n ${L.n}; short ${nf(S.expR, { maximumFractionDigits: 2 })} R, n ${S.n}). Treffprosent ${Math.round(bt.all.win * 100)} %. Resultatene er ikke statistisk forskjellige fra null. Bruk vurderingen som en oversikt over hva tidsrammene sier – ikke som et handelssignal.`),
        el('p', 'ai-muted', 'Kilde: research/setup_bt.js · inngang ved neste 1 t-åpning, stopp før mål hvis begge treffes i samme candle, maks 30 dager.')); }
    else ev.append(el('p', 'ai-muted', 'Historisk test av oppsettene er utilgjengelig (filen kunne ikke lastes).'));
    out.push(ev);
    // tidsrammetabell
    const tt = el('table', 'ai-table'); const hr = el('tr'); ['Tidsramme', 'Retning', 'Regelscore', 'RSI', 'ADX', 'Regime', 'Volatilitet', 'Støtte', 'Motstand'].forEach((h, i) => hr.append(el('th', i === 0 || i === 5 ? 'l' : '', h))); tt.append(hr);
    for (const k of SCAN_TF) { const a = r.tf[k], x = el('tr'); x.append(el('td', 'l', TFL[k]));
      if (!a.ok) { const d = el('td', 'l ai-muted', a.why || 'utilgjengelig'); d.colSpan = 8; x.append(d); tt.append(x); continue; }
      const b = BIAS[a.bias]; x.append(el('td', b[1], b[0]), el('td', null, sc(a.score) + ' av ±5'), el('td', null, nf(a.rsi, { maximumFractionDigits: 0 })), el('td', null, nf(a.adx, { maximumFractionDigits: 0 })),
        el('td', 'l', a.regime), el('td', '', a.volPct == null ? '–' : `${Math.round(a.volPct * 100)}. pct.`), el('td', null, a.support[0] ? price(a.support[0].p) : '–'), el('td', null, a.resist[0] ? price(a.resist[0].p) : '–')); tt.append(x); }
    const tw = el('div', 'ai-tablewrap'); tw.append(tt); out.push(tw);
    const a = r.tf['4h']; if (a.ok) { const rl = el('details', 'tm-rules'); rl.append(el('summary', null, 'Reglene bak regelscoren (4 t)')); const ul = el('ul', 'tm-list');
      a.rules.forEach(x => ul.append(el('li', x.v > 0 ? 'ai-pos' : x.v < 0 ? 'ai-neg' : 'ai-neu', `${x.v > 0 ? '✔' : x.v < 0 ? '✘' : '–'} ${x.k}`)));
      rl.append(ul, el('p', 'ai-muted', 'Regelscore = antall regler som peker opp minus antall som peker ned (−5 … +5). Den er ikke en sannsynlighet. ≥ +3 regnes som opp, ≤ −3 som ned. Regime: ADX ≥ 25 = trend, < 20 = sidelengs. Volatilitet = ATR i prosent av kurs, rangert mot siste 300 candles.')); out.push(rl); }
    if (r.lt) out.push(el('p', 'ai-muted', `Langsiktig (fanen Langsiktig plan): ${LT[r.lt.s][0]} – ${Math.round(-r.lt.dd * 100)} % under toppen. Den langsiktige planen er testet separat og er ikke det samme som kortsiktige oppsett.`));
    box.replaceChildren(...out);
    const L = r.live, ph = document.getElementById('tm-price'); if (ph) ph.replaceChildren(...(L && L.p ? [el('b', null, price(L.p) + ' $ '), el('span', sgn(L.chg), pct(L.chg) + ' 24 t'), el('span', 'ai-muted', ` · Binance ${hms(L.t)}`)] : [el('span', 'ai-muted', 'Live-pris utilgjengelig')]));
  }

  // ---------------------------------------------------------------- inngang fra app.js
  function render() {
    if (typeof RG === 'undefined') return;
    const p = dash.params(); const L = list(); if (!T.sym || (p.coin && p.coin !== T.sym && L.includes(p.coin))) T.sym = p.coin && L.includes(p.coin) ? p.coin : (T.sym || L[0]);
    if (!T.built) { T.built = true; controls();
      if (!window.LightweightCharts) document.getElementById('tm-status').textContent = 'Grafbiblioteket kunne ikke lastes.';
      else T.chart = makeChart();
      getJSON('setup_bt.json').then(j => { T.bt = j; drawSummary(); }).catch(() => { T.bt = null; });
      loadGlobal(); setInterval(() => { if (!document.hidden && visible()) loadGlobal(); }, 5 * 6e4);
      scan(true); drawDetail(true); }
    drawBar(); drawScan(); if (T.chart && T.chart.k !== key(T.sym, T.tf)) drawDetail(true); else drawSummary();
    if (Date.now() - T.scanAt > SCAN_EVERY) scan();
  }
  window.TERM = { render, _T: T };
})();
