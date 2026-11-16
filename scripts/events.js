// «Hva skjedde etter …?» – hendelsesmotor.
// Henter lange kursserier (Bitcoin fra 2011, S&P 500 fra 1950 osv.) og makroserier (renter, VIX, olje, kredittspread,
// rentekurve, dollar), finner datoene for hver hendelse etter faste regler, og skriver site/data/events.json.
// Selve analysen (hva skjedde etterpå) regnes i nettleseren, slik at alle hendelser kan kombineres med alle markeder.
// Kjøres i GitHub Actions. Lokalt: EVENTS_MOCK=mappe med {kilde}.json for tester uten nett.
'use strict';
const fs = require('fs'), path = require('path');
const DAY = 864e5;
const MOCK = process.env.EVENTS_MOCK;
const UA = { 'user-agent': 'Mozilla/5.0 (market-scanner; +https://github.com/SondreFivelsdal/market-scanner)', accept: 'application/json,text/csv,*/*' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, { text = false, tries = 3, ms = 30000 } = {}) {
  let e; for (let i = 0; i < tries; i++) { const c = new AbortController(), to = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { headers: UA, signal: c.signal }); if (r.ok) return text ? await r.text() : await r.json(); e = new Error('HTTP ' + r.status); if (r.status === 404 || r.status === 451) break; }
    catch (x) { e = x; } finally { clearTimeout(to); } await sleep(1500 * (i + 1)); }
  throw e;
}
const mock = n => { const f = path.join(MOCK, n + '.json'); if (!fs.existsSync(f)) throw new Error('ingen mock ' + n); return JSON.parse(fs.readFileSync(f, 'utf8')); };
const dayOf = t => Math.floor(t / DAY);           // dager siden 1970 (UTC)
const iso = d => new Date(d * DAY).toISOString().slice(0, 10);
const D = s => dayOf(Date.parse(s + 'T00:00:00Z'));

// ------------------------------------------------------------------ kilder. Serier: [{d (dag), v}] stigende, én verdi per dag.
const clean = a => { const m = new Map(); for (const x of a) if (x.v != null && isFinite(x.v) && x.v > 0) m.set(x.d, x.v); return [...m].sort((a, b) => a[0] - b[0]).map(([d, v]) => ({ d, v })); };
async function fred(id, allowNeg = false) { if (MOCK) return mock('fred_' + id);
  const s = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { text: true });
  const out = s.trim().split('\n').slice(1).map(l => l.split(',')).filter(r => r[1] && r[1] !== '.' && isFinite(+r[1])).map(r => ({ d: D(r[0]), v: +r[1] }));
  return allowNeg ? out : clean(out); }
async function yahoo(sym) { if (MOCK) return mock('yahoo_' + sym.replace(/[^A-Za-z0-9]/g, '_'));
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=-1325635200&period2=${Math.floor(Date.now() / 1000)}&interval=1d`);
  const r = j.chart.result[0], ts = r.timestamp, c = r.indicators.quote[0].close;
  return clean(ts.map((t, i) => ({ d: dayOf(t * 1000), v: c[i] }))); }
async function bitstamp() { if (MOCK) return mock('bitstamp_btc');
  let start = 1314835200; const out = []; const now = Date.now();
  for (let k = 0; k < 12; k++) { const j = await get(`https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000&start=${start}`); const d = j.data.ohlc; if (!d.length) break;
    for (const x of d) if (+x.timestamp * 1000 + DAY <= now) out.push({ d: dayOf(+x.timestamp * 1000), v: +x.close }); start = +d[d.length - 1].timestamp + 86400; if (d.length < 1000) break; }
  return clean(out); }
async function binance(sym) { if (MOCK) return mock('binance_' + sym);
  const out = []; let start = 0; const now = Date.now();
  for (;;) { const k = await get(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&startTime=${start}&limit=1000`);
    for (const x of k) if (x[6] < now) out.push({ d: dayOf(x[0]), v: +x[4] }); if (k.length < 1000) break; start = k[k.length - 1][0] + DAY; }
  return clean(out); }
async function first(list) { const errs = []; for (const [src, fn] of list) { try { const d = await fn(); if (d && d.length > 100) return { data: d, src }; errs.push(src + ': tomt'); } catch (e) { errs.push(src + ': ' + (e.message || e)); } } return { err: errs.join(' · ') }; }

// ------------------------------------------------------------------ hjelpere for serier
const sma = (v, n) => { const o = new Array(v.length).fill(null); let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
function rsi(v, n = 14) { const o = new Array(v.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1], u = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += u; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    else { g = (g * (n - 1) + u) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
// ukelukk (uke = mandag–søndag; for aksjer siste handelsdag i uka). Dato = siste dag i uka med data.
function weekly(S) { const W = []; for (const x of S) { const wd = (new Date(x.d * DAY).getUTCDay() + 6) % 7, w = x.d - wd; const L = W[W.length - 1]; if (!L || L.w !== w) W.push({ w, d: x.d, v: x.v }); else { L.d = x.d; L.v = x.v; } } return W; }
// første dag med data på/etter dag d
const idxAt = (S, d) => { let lo = 0, hi = S.length; while (lo < hi) { const m = (lo + hi) >> 1; if (S[m].d < d) lo = m + 1; else hi = m; } return lo; };
// siste kjente verdi på dag d (med forsinkelse lag)
const valAt = (S, d, lag = 0) => { const i = idxAt(S, d - lag + 1) - 1; return i >= 0 ? S[i].v : null; };
// Hold avstand: behold bare hendelser minst gap dager etter forrige beholdte
const spaced = (ds, gap) => { const o = []; for (const d of [...ds].sort((a, b) => a - b)) if (!o.length || d - o[o.length - 1] >= gap) o.push(d); return o; };

// ------------------------------------------------------------------ tekniske hendelser (regnes per marked)
// Alle regler bruker bare data fram til og med hendelsesdagen.
const TECH = [
  { id: 'w200_under', name: 'Faller under 200-ukerslinja', syn: ['200 week', '200w', '200-ukers', 'under 200 uker'], desc: 'To ukelukk på rad under snittet av de siste 200 ukelukkene, etter minst 26 uker over.', f: S => crossW(S, 200, -1, 26, 2) },
  { id: 'w200_over', name: 'Tilbake over 200-ukerslinja', syn: ['200 week', '200w', '200-ukers'], desc: 'To ukelukk på rad over 200-ukerslinja, etter minst 8 uker under.', f: S => crossW(S, 200, 1, 8, 2) },
  { id: 'w200_m30', name: '30 % under 200-ukerslinja', syn: ['200 week', '30 % under', 'capitulation', 'kapitulasjon'], desc: 'Ukelukk minst 30 % under 200-ukerslinja (første gang på et halvt år).', f: S => belowW(S, 200, 0.7) },
  { id: 'w50_over', name: 'Tilbake over 50-ukerslinja', syn: ['50 week', '50w', '50-ukers', 'bull market'], desc: 'To ukelukk på rad over 50-ukerslinja, etter minst 12 uker under.', f: S => crossW(S, 50, 1, 12, 2) },
  { id: 'w50_under', name: 'Faller under 50-ukerslinja', syn: ['50 week', '50w', '50-ukers', 'bear market'], desc: 'To ukelukk på rad under 50-ukerslinja, etter minst 12 uker over.', f: S => crossW(S, 50, -1, 12, 2) },
  { id: 'd200_over', name: 'Tilbake over 200-dagerslinja', syn: ['200 day', '200d', '200-dagers'], desc: 'Dagslukk over snittet av de siste 200 dagslukkene etter minst 30 dager under (minst 60 dager mellom hendelser).', f: S => crossD(S, 200, 1, 30) },
  { id: 'd200_under', name: 'Faller under 200-dagerslinja', syn: ['200 day', '200d', '200-dagers'], desc: 'Dagslukk under 200-dagerslinja etter minst 30 dager over.', f: S => crossD(S, 200, -1, 30) },
  { id: 'golden', name: 'Golden cross', syn: ['golden cross', '50 over 200'], desc: '50-dagerslinja krysser over 200-dagerslinja (glidende snitt av dagslukk).', f: S => maCross(S, 1) },
  { id: 'death', name: 'Death cross', syn: ['death cross', '50 under 200'], desc: '50-dagerslinja krysser under 200-dagerslinja.', f: S => maCross(S, -1) },
  { id: 'wrsi_buy', name: 'Uke-RSI krysser opp over 30', syn: ['rsi', 'oversold', 'oversolgt', 'rsi 30'], desc: 'Ukentlig RSI (14) har vært under 30 og krysser opp igjen – kjøpssignalet i TradingView sin RSI Strategy.', f: S => wRsi(S, 1) },
  { id: 'wrsi_sell', name: 'Uke-RSI krysser ned under 70', syn: ['rsi', 'overbought', 'overkjøpt', 'rsi 70'], desc: 'Ukentlig RSI (14) har vært over 70 og krysser ned igjen.', f: S => wRsi(S, -1) },
  { id: 'fakeout', name: 'Fakeout over toppen av en range', syn: ['fakeout', 'fake out', 'falskt utbrudd', 'range'], desc: 'Ukelukk over høyeste kurs de forrige 26 ukene, og tilbake under (−3 %) innen 4 uker. Datoen er uka kursen falt tilbake.', f: S => fakeout(S) },
  { id: 'ath', name: 'Ny rekord etter lang tid', syn: ['all time high', 'ath', 'rekord'], desc: 'Første dagslukk over tidligere rekord etter minst ett år uten ny rekord.', f: S => newAth(S) },
  { id: 'red5', name: '5 røde uker på rad', syn: ['red weeks', 'røde ukelys', 'down only', 'kapitulasjon', 'capitulation spiral', 'kapitulasjonsspiral'], desc: 'Ukelukket har vært lavere enn uka før fem uker på rad («ned hver eneste uke»). Datoen er den femte uka.', f: S => redWeeks(S, 5) },
  { id: 'dd20', name: 'Fall på 20 % fra toppen', syn: ['bear market', 'bjørnemarked', 'drawdown', 'krakk'], desc: 'Første dagslukk 20 % under høyeste kurs hittil (ny syklus starter ved ny rekord).', f: S => drawdown(S, 0.2) },
  { id: 'dd50', name: 'Fall på 50 % fra toppen', syn: ['drawdown', 'halvert', 'krakk'], desc: 'Første dagslukk 50 % under høyeste kurs hittil.', f: S => drawdown(S, 0.5) },
  { id: 'dd75', name: 'Fall på 75 % fra toppen', syn: ['drawdown', 'kapitulasjon', 'capitulation'], desc: 'Første dagslukk 75 % under høyeste kurs hittil.', f: S => drawdown(S, 0.75) } ];
function crossW(S, n, dir, minSide, conf) { const W = weekly(S), v = W.map(x => x.v), m = sma(v, n), out = [];
  for (let k = minSide + conf; k < W.length; k++) { let ok = true; for (let j = k - conf + 1; j <= k; j++) if (m[j] == null || !(dir > 0 ? v[j] > m[j] : v[j] < m[j])) ok = false;
    if (!ok) continue; for (let j = k - conf - minSide + 1; j <= k - conf; j++) if (m[j] == null || (dir > 0 ? v[j] > m[j] : v[j] < m[j])) { ok = false; break; } if (ok) out.push(W[k].d); }
  return spaced(out, 120); }
function belowW(S, n, f) { const W = weekly(S), v = W.map(x => x.v), m = sma(v, n), out = []; for (let k = 1; k < W.length; k++) if (m[k] != null && v[k] < m[k] * f) out.push(W[k].d); return spaced(out, 182); }
function crossD(S, n, dir, minSide) { const v = S.map(x => x.v), m = sma(v, n), out = [];
  for (let i = minSide + 1; i < S.length; i++) { if (m[i] == null || !(dir > 0 ? v[i] > m[i] : v[i] < m[i])) continue; let ok = true;
    for (let j = i - minSide; j < i; j++) if (m[j] == null || (dir > 0 ? v[j] > m[j] : v[j] < m[j])) { ok = false; break; } if (ok) out.push(S[i].d); }
  return spaced(out, 60); }
function maCross(S, dir) { const v = S.map(x => x.v), a = sma(v, 50), b = sma(v, 200), out = [];
  for (let i = 1; i < S.length; i++) { if (b[i - 1] == null) continue; if (dir > 0 ? a[i - 1] <= b[i - 1] && a[i] > b[i] : a[i - 1] >= b[i - 1] && a[i] < b[i]) out.push(S[i].d); }
  return spaced(out, 90); }
function wRsi(S, dir) { const W = weekly(S), R = rsi(W.map(x => x.v)), out = [];
  for (let k = 15; k < W.length; k++) { if (R[k - 1] == null) continue; if (dir > 0 ? R[k - 1] < 30 && R[k] >= 30 : R[k - 1] > 70 && R[k] <= 70) out.push(W[k].d); } return spaced(out, 90); }
function fakeout(S) { const W = weekly(S), out = []; let last = -1e9;
  for (let i = 27; i < W.length; i++) { let hi = 0, lo = Infinity; for (let j = i - 26; j < i; j++) { hi = Math.max(hi, W[j].v); lo = Math.min(lo, W[j].v); }
    if (hi / lo > 2.2 || !(W[i].v > hi)) continue;
    for (let j = i + 1; j <= i + 4 && j < W.length; j++) if (W[j].v < hi * 0.97) { if (W[j].d - last >= 182) { out.push(W[j].d); last = W[j].d; } break; } }
  return out; }
function redWeeks(S, n) { const W = weekly(S), out = []; let run = 0; for (let k = 1; k < W.length; k++) { run = W[k].v < W[k - 1].v ? run + 1 : 0; if (run === n) out.push(W[k].d); } return spaced(out, 90); }
function newAth(S) { const out = []; let ath = 0, athD = null; for (const x of S) { if (x.v > ath) { if (athD != null && x.d - athD >= 365) out.push(x.d); ath = x.v; athD = x.d; } } return out; }
function drawdown(S, f) { const out = []; let ath = 0, armed = true; for (const x of S) { if (x.v > ath) { ath = x.v; armed = true; } else if (armed && x.v <= ath * (1 - f)) { out.push(x.d); armed = false; } } return out; }

// ------------------------------------------------------------------ globale hendelser
// Valgdager i USA: første tirsdag etter første mandag i november.
const electionDay = y => { for (let d = 2; d <= 8; d++) { const t = Date.UTC(y, 10, d); if (new Date(t).getUTCDay() === 2) return dayOf(t); } };
const HALVINGS = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'];
// Kjente kriser og konflikter (dato = første handelsdag påvirket eller selve hendelsen). Kilde: allment kjente datoer.
const CRISES = [
  ['1987-10-19', 'Black Monday (børskrakk)', 'finans'], ['1990-08-02', 'Irak invaderer Kuwait', 'krig'], ['1997-10-27', 'Asiakrisen: minikrakk i New York', 'finans'],
  ['1998-08-17', 'Russland misligholder (LTCM-krisen)', 'finans'], ['2000-03-10', 'Toppen av IT-boblen (Nasdaq)', 'finans'], ['2001-09-11', '11. september-angrepene', 'krig'],
  ['2003-03-20', 'Irak-krigen starter', 'krig'], ['2008-09-15', 'Lehman Brothers går konkurs', 'finans'], ['2010-05-06', 'Flash crash', 'finans'],
  ['2011-08-05', 'USAs kredittvurdering nedgraderes (eurokrisen)', 'finans'], ['2014-02-24', 'Mt. Gox stanser (kryptobørs)', 'krypto'], ['2016-06-23', 'Brexit-avstemningen', 'politikk'],
  ['2017-09-04', 'Kina forbyr ICO-er', 'krypto'], ['2020-03-12', 'Covid-krakket', 'finans'], ['2021-05-19', 'Kryptokrakk (Kina strammer inn)', 'krypto'],
  ['2022-02-24', 'Russland invaderer Ukraina', 'krig'], ['2022-05-09', 'Terra/Luna kollapser', 'krypto'], ['2022-11-08', 'FTX kollapser', 'krypto'],
  ['2023-03-10', 'Silicon Valley Bank kollapser', 'finans'], ['2023-10-07', 'Hamas angriper Israel', 'krig'], ['2025-04-02', '«Liberation Day»-tollene', 'politikk'], ['2025-06-13', 'Israel angriper Iran', 'krig'] ];

// Store børsnoteringer (første handelsdag)
const IPOS = [['2004-08-19', 'Google'], ['2012-05-18', 'Facebook'], ['2014-09-19', 'Alibaba'], ['2019-05-10', 'Uber'], ['2020-12-09', 'Airbnb'], ['2021-04-14', 'Coinbase'], ['2023-09-14', 'Arm'], ['2026-06-12', 'SpaceX']];
// Fed: styringsrente (målrente til 2008, øvre grense etter). Én verdi per beslutning.
function fedChanges(tar, taru) { const s = [...(tar || []).filter(x => !taru || !taru.length || x.d < taru[0].d), ...(taru || [])]; const ch = [];
  for (let i = 1; i < s.length; i++) { const dv = Math.round((s[i].v - s[i - 1].v) * 100) / 100; if (Math.abs(dv) >= 0.05) ch.push({ d: s[i].d, dv, v: s[i].v }); } return ch; }
function fedEvents(ch, today) { const firstHike = [], firstCut = [], lastHike = [], bigHike = [], bigCut = [];
  for (let i = 0; i < ch.length; i++) { const c = ch[i], prev = ch.slice(0, i), prevHike = prev.filter(x => x.dv > 0).pop(), prevCut = prev.filter(x => x.dv < 0).pop(), last = prev[prev.length - 1];
    if (c.dv > 0 && (!prevHike || c.d - prevHike.d > 365) && (!last || last.dv < 0 || c.d - last.d > 365)) firstHike.push(c.d);
    if (c.dv < 0 && (!prevCut || c.d - prevCut.d > 365) && (!last || last.dv > 0 || c.d - last.d > 365)) firstCut.push(c.d);
    if (c.dv > 0) { const nx = ch.slice(i + 1).find(x => x.dv > 0); if ((nx ? nx.d : today) - c.d > 270) lastHike.push(c.d); } // uten ny heving på 9 mnd (eller ennå ikke kjent)
    if (c.dv >= 0.5) bigHike.push(c.d); if (c.dv <= -0.5) bigCut.push(c.d); }
  return { firstHike: spaced(firstHike, 300), firstCut: spaced(firstCut, 300), lastHike, bigHike: spaced(bigHike, 60), bigCut: spaced(bigCut, 60) }; }
// Første gang en serie går over/under en grense etter minst «quiet» dager på andre siden
function threshold(S, lvl, dir, quiet, gap) { const out = []; let lastHit = null;
  for (const x of S) { const hit = dir > 0 ? x.v > lvl : x.v < lvl; if (!hit) continue; if (lastHit == null || x.d - lastHit >= quiet) out.push(x.d); lastHit = x.d; }
  return spaced(out, gap); }
function changeOver(S, days, minChg, rel, gap) { const out = []; for (let i = 0; i < S.length; i++) { const p = valAt(S, S[i].d - days); if (p == null) continue; const ch = rel ? S[i].v / p - 1 : S[i].v - p; if (ch >= minChg) out.push(S[i].d); } return spaced(out, gap); }
function crossZero(S, dir, minSide) { const out = []; for (let i = 1; i < S.length; i++) { const a = S[i - 1].v, b = S[i].v; if (!(dir > 0 ? a <= 0 && b > 0 : a >= 0 && b < 0)) continue;
    let k = i - 1, n = 0; while (k >= 0 && (dir > 0 ? S[k].v <= 0 : S[k].v >= 0)) { n = S[i].d - S[k].d; k--; } if (n >= minSide) out.push(S[i].d); } return spaced(out, 180); }

// ------------------------------------------------------------------ hovedberegning
const ASSETS = [
  { k: 'BTC', name: 'Bitcoin', kind: 'krypto' }, { k: 'ETH', name: 'Ethereum', kind: 'krypto' }, { k: 'XRP', name: 'XRP', kind: 'krypto' }, { k: 'SOL', name: 'Solana', kind: 'krypto' }, { k: 'ADA', name: 'Cardano', kind: 'krypto' },
  { k: 'SPX', name: 'S&P 500', kind: 'aksjer' }, { k: 'NDX', name: 'Nasdaq', kind: 'aksjer' }, { k: 'GOLD', name: 'Gull', kind: 'råvarer' }, { k: 'OIL', name: 'Olje (WTI)', kind: 'råvarer' } ];
const CATS = { fed: 'Renter og Fed', syklus: 'Syklus og kalender', teknisk: 'Tekniske brudd', makro: 'Makro og kriser' };

function compute({ assets, macro, now = Date.now() }) {
  const today = dayOf(now), cat = [];
  const add = (o) => { if (o.dates) o.dates = o.dates.filter(d => d <= today).map(iso); cat.push(o); };
  // Fed
  const ch = fedChanges(macro.fedTar, macro.fedTarU);
  if (ch.length) { const F = fedEvents(ch, today), L = ch[ch.length - 1];
    add({ id: 'fed_first_hike', cat: 'fed', name: 'Første renteheving i en syklus', syn: ['rate hike', 'renteheving', 'fed hike', 'renteøkning', 'første heving'], desc: 'Fed hever styringsrenta etter minst ett år uten hevinger (eller rett etter kutt). Fra FREDs målrente (DFEDTAR/DFEDTARU), fra 1982.', dates: F.firstHike });
    add({ id: 'fed_first_cut', cat: 'fed', name: 'Første rentekutt i en syklus', syn: ['rate cut', 'rentekutt', 'pivot', 'fed cut', 'første kutt'], desc: 'Fed kutter styringsrenta etter minst ett år uten kutt (eller rett etter hevinger).', dates: F.firstCut });
    add({ id: 'fed_last_hike', cat: 'fed', name: 'Siste renteheving (pause)', syn: ['pause', 'peak rates', 'siste heving', 'topp i renta'], desc: 'Den siste hevingen før minst 9 måneder uten nye hevinger (pause eller kutt). NB: dette vet man først i etterkant.', hindsight: true, dates: F.lastHike });
    add({ id: 'fed_sep_midterm', cat: 'fed', name: 'Renteheving i september i midtvalgsår', syn: ['september hike', 'midterm', 'midtvalg', 'renteheving september'], desc: 'Fed hever renta i september i et midtvalgsår (2018, 2022, 2026 …). Historisk har kryptomarkedet holdt seg en stund og så falt inn mot syklusbunnen.', dates: ch.filter(c => c.dv > 0 && new Date(c.d * DAY).getUTCMonth() === 8 && new Date(c.d * DAY).getUTCFullYear() % 4 === 2).map(c => c.d) });
    add({ id: 'fed_big_hike', cat: 'fed', name: 'Stor renteheving (0,5 pp eller mer)', syn: ['50 bp', '75 bp', 'jumbo', 'stor heving'], desc: 'Fed hever med minst et halvt prosentpoeng på én gang.', dates: F.bigHike });
    add({ id: 'fed_big_cut', cat: 'fed', name: 'Stort rentekutt (0,5 pp eller mer)', syn: ['emergency cut', 'krisekutt', '50 bp'], desc: 'Fed kutter med minst et halvt prosentpoeng på én gang – ofte i kriser.', dates: F.bigCut });
    var fedNow = { level: L.v, last: iso(L.d), lastDv: L.dv }; }
  // syklus og kalender
  const yNow = new Date(now).getUTCFullYear(), years = n => { const o = []; for (let y = 1950; y <= yNow; y++) if (n(y)) o.push(y); return o; };
  add({ id: 'midterm_day', cat: 'syklus', name: 'Midtvalg i USA (valgdagen)', syn: ['midterm', 'midtvalg', 'mellomvalg', 'election'], desc: 'Valgdagen i midtvalgsår (2 år etter presidentvalget). Historisk har bunnen i aksjer og Bitcoin ofte kommet rundt denne tiden.', dates: years(y => y % 4 === 2).map(electionDay) });
  add({ id: 'midterm_year', cat: 'syklus', name: 'Midtvalgsår starter (1. januar)', syn: ['midterm year', 'midtvalgsår', 'presidential cycle', 'presidentsyklus'], desc: '1. januar i midtvalgsår – det svakeste året i presidentsyklusen for aksjer.', dates: years(y => y % 4 === 2).map(y => D(y + '-01-01')) });
  add({ id: 'preelection_year', cat: 'syklus', name: 'Året før presidentvalg starter', syn: ['pre-election year', 'før valgår', 'presidential cycle'], desc: '1. januar i året før presidentvalget – det sterkeste året i presidentsyklusen for aksjer.', dates: years(y => y % 4 === 3).map(y => D(y + '-01-01')) });
  add({ id: 'election_day', cat: 'syklus', name: 'Presidentvalg i USA', syn: ['election', 'presidentvalg', 'valg'], desc: 'Valgdagen ved presidentvalg.', dates: years(y => y % 4 === 0).map(electionDay) });
  add({ id: 'q4', cat: 'syklus', name: '4. kvartal starter (1. oktober)', syn: ['q4', 'fjerde kvartal', 'oktober', 'uptober'], desc: '1. oktober hvert år.', dates: years(() => true).map(y => D(y + '-10-01')) });
  add({ id: 'q4_midterm', cat: 'syklus', name: '4. kvartal i midtvalgsår', syn: ['q4 midterm', 'midtvalg q4'], desc: '1. oktober i midtvalgsår.', dates: years(y => y % 4 === 2).map(y => D(y + '-10-01')) });
  add({ id: 'halving', cat: 'syklus', name: 'Bitcoin-halvering', syn: ['halving', 'halvering', 'halvening'], desc: 'Belønningen for å utvinne nye bitcoins halveres (ca. hvert 4. år).', dates: HALVINGS.map(D) });
  // BTC-syklustopper og -bunner (etterpåklokskap): topp = rekord før et fall på minst 50 %; bunn = laveste før ny rekord
  const B = assets.BTC && assets.BTC.data;
  if (B) { const tops = [], bots = []; let ath = 0, athI = 0, i = 0;
    while (i < B.length) { if (B[i].v > ath) { ath = B[i].v; athI = i; } else if (B[i].v < ath * 0.5 && B[athI].d - B[0].d > 180) { tops.push(B[athI].d); let mn = i; let j = i; while (j < B.length && B[j].v < ath) { if (B[j].v < B[mn].v) mn = j; j++; } if (j < B.length) bots.push(B[mn].d); i = j; ath = 0; continue; } i++; }
    add({ id: 'btc_top', cat: 'syklus', name: 'Bitcoin-topp før fall på over 50 %', syn: ['cycle top', 'syklustopp', 'all time high', 'topp'], desc: 'Rekordtoppen før et fall på minst 50 %. NB: vet man først i etterkant (toppen i okt. 2025 er med fordi fallet har passert 50 %).', hindsight: true, dates: tops });
    add({ id: 'btc_bottom', cat: 'syklus', name: 'Bitcoin-bunn etter fall på over 50 %', syn: ['cycle bottom', 'syklusbunn', 'bunn', 'bear market bottom'], desc: 'Laveste dagslukk etter en slik topp, før ny rekord. NB: vet man først i etterkant.', hindsight: true, dates: bots }); }
  // makro og kriser
  if (macro.vix) { add({ id: 'vix30', cat: 'makro', name: 'Fryktindeksen VIX over 30', syn: ['vix', 'frykt', 'fear', 'volatility'], desc: 'VIX lukker over 30 for første gang etter minst 90 dager under.', dates: threshold(macro.vix, 30, 1, 90, 90) });
    add({ id: 'vix40', cat: 'makro', name: 'VIX over 40 (panikk)', syn: ['vix', 'panikk', 'panic'], desc: 'VIX lukker over 40 for første gang etter minst 180 dager under.', dates: threshold(macro.vix, 40, 1, 180, 180) }); }
  if (assets.OIL && assets.OIL.data) add({ id: 'oil50', cat: 'makro', name: 'Oljeprisen +50 % på 3 måneder', syn: ['oil', 'olje', 'energi', 'energy shock', 'energisjokk'], desc: 'WTI-oljen har steget minst 50 % siste 91 dager (første gang på et halvt år).', dates: changeOver(assets.OIL.data, 91, 0.5, true, 182) });
  if (macro.hy) { add({ id: 'hy_jump', cat: 'makro', name: 'Kredittspreaden hopper (+1,5 pp på 3 mnd)', syn: ['credit spread', 'kredittspread', 'high yield', 'kredittkrise'], desc: 'Renteforskjellen mellom høyrenteobligasjoner og statslån (FRED BAMLH0A0HYM2) har økt minst 1,5 prosentpoeng siste 91 dager. Fra 1997.', dates: changeOver(macro.hy, 91, 1.5, false, 182) }); }
  if (macro.curve) { add({ id: 'curve_inv', cat: 'makro', name: 'Rentekurven inverteres', syn: ['yield curve', 'rentekurve', 'inversion', '2s10s'], desc: '10-årsrenta går under 2-årsrenta (FRED T10Y2Y under 0) etter minst ett halvt år over.', dates: crossZero(macro.curve, -1, 180) });
    add({ id: 'curve_uninv', cat: 'makro', name: 'Rentekurven blir normal igjen', syn: ['yield curve', 'rentekurve', 'un-inversion', 'resesjon'], desc: '10-årsrenta går over 2-årsrenta igjen etter minst 90 dager invertert – har ofte kommet like før resesjoner.', dates: crossZero(macro.curve, 1, 90) }); }
  if (macro.dxy) { add({ id: 'dxy_under', cat: 'makro', name: 'Dollaren faller under 200-dagerslinja', syn: ['dxy', 'dollar', 'dollaren', 'weak dollar'], desc: 'Dollarindeksen lukker under sin 200-dagerslinje etter minst 90 dager over.', dates: crossD(macro.dxy, 200, -1, 90) });
    add({ id: 'dxy_over', cat: 'makro', name: 'Dollaren går over 200-dagerslinja', syn: ['dxy', 'dollar', 'strong dollar'], desc: 'Dollarindeksen lukker over sin 200-dagerslinje etter minst 90 dager under.', dates: crossD(macro.dxy, 200, 1, 90) }); }
  if (assets.SPX && assets.SPX.data) { add({ id: 'spx_bear', cat: 'makro', name: 'Bjørnemarked i aksjer (S&P 500 −20 %)', syn: ['bear market', 'bjørnemarked', 'krakk', 'crash', 's&p'], desc: 'S&P 500 lukker 20 % under sin rekord.', dates: drawdown(assets.SPX.data, 0.2) });
    add({ id: 'spx_corr', cat: 'makro', name: 'Korreksjon i aksjer (S&P 500 −10 %)', syn: ['correction', 'korreksjon', 's&p'], desc: 'S&P 500 lukker 10 % under sin rekord.', dates: drawdown(assets.SPX.data, 0.1) }); }
  const cr = g => CRISES.filter(c => g.includes(c[2]));
  add({ id: 'crisis_fin', cat: 'makro', name: 'Finanskriser og krakk', syn: ['finanskrise', 'financial crisis', 'krakk', 'crash', 'lehman', 'svb', 'covid'], desc: 'Kjente finanskriser og krakk (liste i koden).', dates: cr(['finans']).map(c => D(c[0])), labels: Object.fromEntries(cr(['finans']).map(c => [c[0], c[1]])) });
  add({ id: 'crisis_war', cat: 'makro', name: 'Krig og geopolitiske sjokk', syn: ['krig', 'war', 'geopolitikk', 'invasjon', 'angrep', 'iran', 'ukraina'], desc: 'Starten på kriger og store angrep (liste i koden).', dates: cr(['krig']).map(c => D(c[0])), labels: Object.fromEntries(cr(['krig']).map(c => [c[0], c[1]])) });
  add({ id: 'crisis_crypto', cat: 'makro', name: 'Kryptokriser', syn: ['ftx', 'luna', 'mt gox', 'kryptokrise', 'collapse'], desc: 'Store kollapser og forbud i krypto (liste i koden).', dates: cr(['krypto']).map(c => D(c[0])), labels: Object.fromEntries(cr(['krypto']).map(c => [c[0], c[1]])) });
  add({ id: 'crisis_pol', cat: 'makro', name: 'Politiske sjokk', syn: ['brexit', 'toll', 'tariffs', 'politikk'], desc: 'Store politiske sjokk (liste i koden).', dates: cr(['politikk']).map(c => D(c[0])), labels: Object.fromEntries(cr(['politikk']).map(c => [c[0], c[1]])) });
  add({ id: 'ipo', cat: 'makro', name: 'Store børsnoteringer (IPO)', syn: ['ipo', 'børsnotering', 'spacex', 'coinbase', 'listing', 'anthropic'], desc: 'De største og mest omtalte børsnoteringene. Bruk «Før hendelsen» for å se hvordan markedet beveget seg inn mot noteringen.', dates: IPOS.map(c => D(c[0])), labels: Object.fromEntries(IPOS.map(c => [c[0], c[1]])) });
  // tekniske: per marked
  for (const T of TECH) { const per = {}; for (const A of ASSETS) { const S = assets[A.k] && assets[A.k].data; if (!S || S.length < 300) continue; per[A.k] = T.f(S).filter(d => d <= today).map(iso); }
    cat.push({ id: T.id, cat: 'teknisk', name: T.name, syn: T.syn, desc: T.desc, perAsset: per }); }
  // kursserier som sendes til nettleseren: t = dag (deltakodet), c = kurs (5 gjeldende siffer)
  const outA = {}; for (const A of ASSETS) { const S = assets[A.k] && assets[A.k].data; if (!S) continue;
    const t = [], c = []; let p = 0; for (const x of S) { t.push(x.d - p); p = x.d; c.push(+x.v.toPrecision(5)); }
    outA[A.k] = { name: A.name, kind: A.kind, src: assets[A.k].src, from: iso(S[0].d), to: iso(S[S.length - 1].d), t, c }; }
  return { built: new Date(now).toISOString(), cats: CATS, assets: outA, order: ASSETS.map(a => a.k).filter(k => outA[k]), events: cat, fed: typeof fedNow !== 'undefined' ? fedNow : null, errors: macro.errors || {} };
}

// ------------------------------------------------------------------ main (GitHub Actions)
async function main() {
  const assets = {}, macro = { errors: {} };
  const put = (k, r) => { if (r.err) { console.log(k, 'mangler:', r.err); macro.errors[k] = r.err; return; } assets[k] = r; console.log(k, r.src, r.data.length, iso(r.data[0].d), '→', iso(r.data[r.data.length - 1].d)); };
  put('BTC', await first([['Bitstamp', bitstamp], ['Binance', () => binance('BTC')]]));
  for (const s of ['ETH', 'XRP', 'SOL', 'ADA']) put(s, await first([['Binance', () => binance(s)]]));
  put('SPX', await first([['Yahoo (^GSPC)', () => yahoo('^GSPC')], ['FRED (SP500)', () => fred('SP500')]]));
  put('NDX', await first([['Yahoo (^IXIC)', () => yahoo('^IXIC')], ['FRED (NASDAQCOM)', () => fred('NASDAQCOM')]]));
  put('GOLD', await first([['Yahoo (GC=F)', () => yahoo('GC=F')]]));
  put('OIL', await first([['FRED (DCOILWTICO)', () => fred('DCOILWTICO')], ['Yahoo (CL=F)', () => yahoo('CL=F')]]));
  const m = async (k, list) => { const r = await first(list); if (r.err) { macro.errors[k] = r.err; console.log(k, 'mangler', r.err); } else { macro[k] = r.data; console.log(k, r.src, r.data.length); } };
  await m('fedTar', [['FRED (DFEDTAR)', () => fred('DFEDTAR')]]); await m('fedTarU', [['FRED (DFEDTARU)', () => fred('DFEDTARU')]]);
  await m('vix', [['FRED (VIXCLS)', () => fred('VIXCLS')], ['Yahoo (^VIX)', () => yahoo('^VIX')]]);
  await m('hy', [['FRED (BAMLH0A0HYM2)', () => fred('BAMLH0A0HYM2')]]);
  await m('curve', [['FRED (T10Y2Y)', () => fred('T10Y2Y', true)]]);
  await m('dxy', [['Yahoo (DX-Y.NYB)', () => yahoo('DX-Y.NYB')], ['FRED (DTWEXBGS)', () => fred('DTWEXBGS')]]);
  const out = compute({ assets, macro });
  // Syklus-fanen (on-chain og sosial interesse hentes her, kursene gjenbrukes)
  try { const CY = require('./cycle.js'); let cm = null, wiki = null;
    try { cm = MOCK ? mock('coinmetrics') : await CY.fetchCM(get); console.log('Coin Metrics', cm.length); } catch (e) { console.log('Coin Metrics mangler', e.message); }
    try { wiki = MOCK ? mock('wiki') : await CY.fetchWiki(get); console.log('Wikipedia', wiki.length); } catch (e) { console.log('Wikipedia mangler', e.message); }
    const d = k => assets[k] && assets[k].data;
    const cy = CY.compute({ btc: d('BTC'), spx: d('SPX'), gold: d('GOLD'), oil: d('OIL'), cm, wiki });
    const cf = process.env.CYCLE_OUT || path.join(__dirname, '..', 'site', 'data', 'cycle.json'); fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, JSON.stringify(cy));
    console.log('skrev', cf, Math.round(fs.statSync(cf).size / 1024), 'kB · nå:', JSON.stringify(cy.now)); }
  catch (e) { console.log('Syklus feilet', e.message); }
  for (const e of out.events) console.log(e.id, e.dates ? e.dates.length + ' datoer, siste ' + e.dates[e.dates.length - 1] : Object.entries(e.perAsset).map(([k, v]) => k + ':' + v.length).join(' '));
  const file = process.env.EVENTS_OUT || path.join(__dirname, '..', 'site', 'data', 'events.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(out)); console.log('skrev', file, Math.round(fs.statSync(file).size / 1024), 'kB');
}
async function keepPrevious() { const P = process.env.PAGES_URL; if (!P) return;
  for (const [n, env] of [['events', 'EVENTS_OUT'], ['cycle', 'CYCLE_OUT']]) { const file = process.env[env] || path.join(__dirname, '..', 'site', 'data', n + '.json'); if (fs.existsSync(file)) continue;
    try { const r = await fetch(`${P}data/${n}.json?t=${Date.now()}`); if (r.ok) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, await r.text()); console.log('beholdt forrige', n + '.json'); } } catch (e) { /* ingen */ } } }
if (require.main === module) main().catch(async e => { console.error(e); await keepPrevious(); process.exit(1); });
module.exports = { compute, fedChanges, fedEvents, TECH, electionDay, weekly, sma, rsi, drawdown, crossW, crossD, fakeout, iso, D };
