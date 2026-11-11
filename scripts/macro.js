// Makrobildet: «Har vi medvind eller motvind i markedet akkurat nå?»
// Henter data for hele kryptomarkedet, penger/renter, aksjer/risiko og derivater, gjør hver del om til grønt / gult / rødt
// etter faste regler satt på forhånd, og tester bakover i tid (bare data kjent på dagen) hva som skjedde etter uker med
// samme makroklima. Lager også statistikk for de viktigste trendlinjene per coin (200-dagers, 300-dagers, 50-ukers).
// Kjøres i GitHub Actions etter update.js. Skriver site/data/macro.json.
// Lokalt: HIST_DATA=mappe med {SYM}_1d.json.gz og MACRO_MOCK=mappe med {kilde}.json (for tester uten nett).
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DAY = 864e5;
const TRACK = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'POL', 'SAND'];
const REF = ['BNB', 'LINK', 'DOGE', 'LTC', 'TRX', 'AVAX', 'DOT', 'ATOM', 'BCH', 'ETC', 'XLM', 'UNI', 'FIL', 'NEAR', 'AAVE', 'VET', 'ALGO', 'MANA'];
const NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano', POL: 'Polygon', SAND: 'The Sandbox' };
const UA = { 'user-agent': 'Mozilla/5.0 (market-scanner; +https://github.com/SondreFivelsdal/market-scanner)', accept: 'application/json,text/csv,*/*' };
const MOCK = process.env.MACRO_MOCK, LOCAL = process.env.HIST_DATA;

// ------------------------------------------------------------------ henting
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, { text = false, tries = 3, ms = 25000 } = {}) {
  let e; for (let i = 0; i < tries; i++) { const c = new AbortController(), to = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { headers: UA, signal: c.signal }); if (r.ok) return text ? await r.text() : await r.json(); e = new Error('HTTP ' + r.status); if (r.status === 404 || r.status === 451) break; }
    catch (x) { e = x; } finally { clearTimeout(to); } await sleep(1200 * (i + 1)); }
  throw e;
}
const mock = name => { const f = path.join(MOCK, name + '.json'); if (!fs.existsSync(f)) throw new Error('ingen mock'); return JSON.parse(fs.readFileSync(f, 'utf8')); };
const dayOf = t => Math.floor(t / DAY) * DAY;

async function binanceDaily(sym, now) {
  if (LOCAL) { const f = path.join(LOCAL, `${sym}_1d.json.gz`); if (!fs.existsSync(f)) return null; return JSON.parse(zlib.gunzipSync(fs.readFileSync(f))).map(r => ({ t: +r[0], h: +r[2], l: +r[3], c: +r[4] })); }
  const out = []; let start = 0;
  for (;;) { const k = await get(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&startTime=${start}&limit=1000`);
    for (const x of k) if (x[6] < now) out.push({ t: x[0], h: +x[2], l: +x[3], c: +x[4] }); if (k.length < 1000) break; start = k[k.length - 1][0] + DAY; }
  return out;
}
// Serier: [{t (UTC-dag, ms), v}] stigende.
async function stables() { if (MOCK) return mock('stables');
  const a = await get('https://stablecoins.llama.fi/stablecoincharts/all');
  return a.map(x => ({ t: dayOf(+x.date * 1000), v: x.totalCirculatingUSD && (x.totalCirculatingUSD.peggedUSD || 0) })).filter(x => x.v > 0); }
async function fng() { if (MOCK) return mock('fng');
  const j = await get('https://api.alternative.me/fng/?limit=0'); return j.data.map(x => ({ t: dayOf(+x.timestamp * 1000), v: +x.value, cls: x.value_classification })).sort((a, b) => a.t - b.t); }
async function fred(id) { if (MOCK) return mock('fred_' + id);
  const s = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { text: true });
  return s.trim().split('\n').slice(1).map(l => l.split(',')).filter(r => r[1] && r[1] !== '.' && isFinite(+r[1])).map(r => ({ t: Date.parse(r[0] + 'T00:00:00Z'), v: +r[1] })); }
async function yahoo(sym) { if (MOCK) return mock('yahoo_' + sym.replace(/[^A-Za-z0-9]/g, '_'));
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=15y&interval=1d&includePrePost=false`);
  const r = j.chart.result[0], ts = r.timestamp, c = r.indicators.adjclose ? r.indicators.adjclose[0].adjclose : r.indicators.quote[0].close;
  const out = []; for (let i = 0; i < ts.length; i++) if (c[i] != null && c[i] > 0) out.push({ t: dayOf(ts[i] * 1000), v: c[i] });
  return out; }
async function coingecko() { if (MOCK) return mock('global');
  const j = await get('https://api.coingecko.com/api/v3/global'); const d = j.data; return { mcap: d.total_market_cap.usd, btcD: d.market_cap_percentage.btc, ethD: d.market_cap_percentage.eth, chg: d.market_cap_change_percentage_24h_usd, t: d.updated_at * 1000 }; }
async function okx() { if (MOCK) return mock('okx');
  const f = await get('https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=90');
  const oi = await get('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP');
  const rates = f.data.map(x => ({ t: +x.fundingTime, v: +x.realizedRate || +x.fundingRate })).sort((a, b) => a.t - b.t);
  return { rates, oiUsd: oi.data && oi.data[0] ? +oi.data[0].oiUsd : null, t: Date.now() }; }

// Hent med reserve: første kilde som virker vinner. Returnerer {data, src} eller {err}.
async function first(list) { const errs = []; for (const [src, fn] of list) { try { const d = await fn(); if (d && (!Array.isArray(d) || d.length > 30)) return { data: d, src }; errs.push(src + ': tomt'); } catch (e) { errs.push(src + ': ' + (e.message || e)); } } return { err: errs.join(' · ') }; }

// ------------------------------------------------------------------ hjelpere
function ema(a, n) { const o = new Array(a.length).fill(null), k = 2 / (n + 1); let e = null, s = 0, c = 0;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) continue; if (e == null) { s += v; c++; if (c === n) { e = s / n; o[i] = e; } } else { e = v * k + e * (1 - k); o[i] = e; } } return o; }
function sma(a, n) { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
function quant(a, q) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), x = q * (s.length - 1), lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); }
const r3 = v => v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000, r1 = v => v == null || !isFinite(v) ? null : Math.round(v * 10) / 10;
const sig = v => v == null || !isFinite(v) ? null : +Number(v).toPrecision(5);
const iso = t => new Date(t).toISOString().slice(0, 10);
// Legg en serie på en daglig kalender. lag = dager før verdien er kjent. stale = maks antall dager en verdi kan brukes videre.
function onCal(cal, ser, lag = 0, stale = 10) { const o = new Array(cal.length).fill(null); if (!ser) return o; let j = -1;
  for (let i = 0; i < cal.length; i++) { while (j + 1 < ser.length && ser[j + 1].t + lag * DAY <= cal[i]) j++; if (j >= 0 && cal[i] - (ser[j].t + lag * DAY) <= stale * DAY) o[i] = ser[j].v; } return o; }
// Glidende snitt/endring regnet på seriens egne datoer (handelsdager), så lagt på kalenderen.
function derive(ser, fn) { if (!ser) return null; const v = ser.map(x => x.v), d = fn(v); return ser.map((x, i) => ({ t: x.t, v: d[i] })).filter(x => x.v != null && isFinite(x.v)); }
const vsSma = n => v => { const m = sma(v, n); return v.map((x, i) => m[i] == null ? null : x / m[i] - 1); };
const chgBack = n => v => v.map((x, i) => i >= n ? x - v[i - n] : null);
const pctBack = n => v => v.map((x, i) => i >= n && v[i - n] > 0 ? x / v[i - n] - 1 : null);

// ------------------------------------------------------------------ komponentene (faste regler)
// state: +1 = medvind (grønt), 0 = nøytralt (gult), −1 = motvind (rødt). w = 1 betyr at den teller i makroklimaet; 0 = bare informasjon.
const GROUPS = { krypto: 'Kryptomarkedet', penger: 'Penger og renter', aksjer: 'Aksjer og risikovilje', deriv: 'Giring (derivater)' };
const COMP = [
  { k: 'btc50w', g: 'krypto', w: 1, name: 'Bitcoin mot 50-ukerslinja', unit: 'pct',
    why: 'Snittet av de siste 50 ukelukkene. Det skiller ofte bjørnemarked fra oksemarked: lange oppturer har startet når kursen lukker over den flere uker på rad, og de store fallene har startet når den brytes.',
    rule: 'Grønt: to ukelukk på rad over linja. Rødt: to ukelukk på rad under. Gult: nettopp krysset.' },
  { k: 'btc200', g: 'krypto', w: 1, name: 'Bitcoin mot 200-dagerslinja', unit: 'pct',
    why: 'Den mest brukte trendlinja i alle markeder. Over = opptrend, under = nedtrend. Bitcoin styrer resten av kryptomarkedet, så den betyr mye også for altcoins.',
    rule: 'Grønt: mer enn 2 % over. Rødt: mer enn 2 % under. Gult: innenfor ±2 % (tester linja).' },
  { k: 'breadth', g: 'krypto', w: 1, name: 'Bredde: andel store coins i opptrend', unit: 'share',
    why: 'Hvor mange av de 25 store coinene som er over sin egen 200-dagerslinje. Når nesten alle er under, er markedet utmattet; en sunn opptur trenger at mange er med, ikke bare Bitcoin.',
    rule: 'Grønt: minst 60 % over. Rødt: 30 % eller færre. Gult: midt imellom.' },
  { k: 'stables', g: 'krypto', w: 1, name: 'Stablecoins (penger klare til kjøp)', unit: 'chg',
    why: 'Stablecoins er dollar inne i kryptomarkedet. Vokser mengden, kommer det nye penger inn som kan kjøpe. Krymper den, trekkes penger ut.',
    rule: 'Grønt: vokst mer enn 3 % siste 3 måneder. Rødt: krympet. Gult: 0–3 %.' },
  { k: 'fng', g: 'krypto', w: 0, name: 'Stemningen (Fear & Greed)', unit: 'num',
    why: 'Måler om folk er redde eller grådige. Ekstrem frykt har ofte vært nær bunner og ekstrem grådighet nær topper, men stemningen kan holde seg lenge. Vises som informasjon og teller ikke i makroklimaet.',
    rule: 'Bare informasjon: under 25 = ekstrem frykt, over 75 = ekstrem grådighet.' },
  { k: 'dxy', g: 'penger', w: 1, name: 'Dollaren (DXY) mot 200-dagerslinja', unit: 'pct',
    why: 'En sterk dollar gjør det dyrere å låne og trekker penger ut av risikable eiendeler. Krypto har oftest gjort det best når dollaren svekker seg.',
    rule: 'Grønt: dollaren mer enn 1 % under sin 200-dagerslinje (svak dollar). Rødt: mer enn 1 % over. Gult: imellom.' },
  { k: 'us10y', g: 'penger', w: 1, name: 'Renta på 10-årige amerikanske statslån', unit: 'pp',
    why: 'Når renta stiger, gir trygge statslån mer, og risikable investeringer blir mindre attraktive. Fallende rente gir vanligvis medvind for aksjer og krypto.',
    rule: 'Grønt: falt mer enn 0,25 prosentpoeng siste 3 måneder. Rødt: steget mer enn 0,25. Gult: imellom.' },
  { k: 'fed', g: 'penger', w: 1, name: 'Styringsrenta i USA (Fed)', unit: 'pp',
    why: 'Sentralbanken bestemmer prisen på penger. Rentekutt gjør det billigere å låne og pleier å øke risikoviljen; rentehevinger gjør det motsatte.',
    rule: 'Grønt: kuttet minst 0,25 prosentpoeng siste 6 måneder. Rødt: hevet minst 0,25. Gult: uendret.' },
  { k: 'm2', g: 'penger', w: 1, name: 'Pengemengden i USA (M2)', unit: 'chg',
    why: 'Hvor mye penger som finnes i økonomien. Mer penger i omløp har ofte løftet prisene på knappe eiendeler som Bitcoin. Tallet kommer med ca. 1–2 måneders forsinkelse.',
    rule: 'Grønt: vokst mer enn 4 % siste år. Rødt: krympet. Gult: 0–4 %.' },
  { k: 'spx', g: 'aksjer', w: 1, name: 'S&P 500 mot 200-dagerslinja', unit: 'pct',
    why: 'De 500 største selskapene i USA. Når aksjemarkedet er i opptrend, tør investorer ta mer risiko, også i krypto. Store krakk i aksjer har nesten alltid dratt krypto ned.',
    rule: 'Grønt: mer enn 1 % over linja. Rødt: mer enn 1 % under. Gult: imellom.' },
  { k: 'rut', g: 'aksjer', w: 1, name: 'Småselskaper (Russell 2000) mot 200-dagerslinja', unit: 'pct',
    why: 'Små selskaper er avhengige av billige lån og er derfor et godt mål på risikovilje og likviditet. Utbrudd i småselskaper har flere ganger falt sammen med sterke perioder for Bitcoin.',
    rule: 'Grønt: mer enn 1 % over linja. Rødt: mer enn 1 % under. Gult: imellom.' },
  { k: 'soxx', g: 'aksjer', w: 1, name: 'Halvledere (SOXX) mot 200-dagerslinja', unit: 'pct',
    why: 'Brikkeprodusentene har ledet aksjemarkedet de siste årene. Snur de ned, er det ofte et tidlig tegn på at risikoviljen svekkes.',
    rule: 'Grønt: mer enn 1 % over linja. Rødt: mer enn 1 % under. Gult: imellom.' },
  { k: 'vix', g: 'aksjer', w: 1, name: 'Fryktindeksen i aksjer (VIX)', unit: 'num',
    why: 'Hvor store svingninger aksjemarkedet venter. Lav VIX = rolig marked der folk tar risiko. Høy VIX = uro, og da selges ofte krypto først.',
    rule: 'Grønt: under 18. Rødt: over 28. Gult: imellom.' },
  { k: 'gold', g: 'aksjer', w: 0, name: 'Gull mot 200-dagerslinja', unit: 'pct',
    why: 'Gull stiger både ved frykt og når dollaren svekkes. Det sier derfor ikke entydig noe om krypto, men en sterk gulltrend sammen med svak dollar har ofte kommet før krypto tar etter. Bare informasjon.',
    rule: 'Bare informasjon.' },
  { k: 'silver', g: 'aksjer', w: 0, name: 'Sølv mot 200-dagerslinja', unit: 'pct',
    why: 'Sølv er mer risikovillig enn gull og svinger mer. Bare informasjon.', rule: 'Bare informasjon.' },
  { k: 'funding', g: 'deriv', w: 0, name: 'Finansieringsrente (funding) på Bitcoin-futures', unit: 'funding',
    why: 'Hva de som satser på stigning med lånte penger betaler. Høy funding = mange er giret på oppgang, og da kan et fall utløse tvangssalg. Negativ funding = mange satser på fall, som ofte har vært nær bunner. Historikken er kort, så den teller ikke i makroklimaet.',
    rule: 'Bare informasjon: over 0,03 % per 8 t = mye giring, under 0 = mange satser på fall.' } ];

const stateBand = (v, hi, lo) => v == null ? null : v > hi ? 1 : v < lo ? -1 : 0;
const RULE = {
  btc200: v => stateBand(v, 0.02, -0.02), breadth: v => v == null ? null : v >= 0.6 ? 1 : v <= 0.3 ? -1 : 0, stables: v => v == null ? null : v > 0.03 ? 1 : v < 0 ? -1 : 0,
  dxy: v => v == null ? null : -stateBand(v, 0.01, -0.01) || 0, us10y: v => v == null ? null : v < -0.25 ? 1 : v > 0.25 ? -1 : 0, fed: v => v == null ? null : v <= -0.25 ? 1 : v >= 0.25 ? -1 : 0,
  m2: v => v == null ? null : v > 0.04 ? 1 : v < 0 ? -1 : 0, spx: v => stateBand(v, 0.01, -0.01), rut: v => stateBand(v, 0.01, -0.01), soxx: v => stateBand(v, 0.01, -0.01),
  vix: v => v == null ? null : v < 18 ? 1 : v > 28 ? -1 : 0, gold: v => stateBand(v, 0.01, -0.01), silver: v => stateBand(v, 0.01, -0.01),
  fng: v => v == null ? null : v < 25 ? -1 : v > 75 ? 1 : 0 };
const LABEL = s => s == null ? null : s >= 0.3 ? 'medvind' : s <= -0.3 ? 'motvind' : 'blandet';
const LABEL_TXT = { medvind: 'Medvind', blandet: 'Blandet', motvind: 'Motvind' };

// ------------------------------------------------------------------ krypto: coins, bredde og 50-ukerslinja
function prepCoin(rows) { const t = rows.map(r => dayOf(r.t)), c = rows.map(r => r.c), l = rows.map(r => r.l), N = c.length;
  const e200 = ema(c, 200), s300 = sma(c, 300); let m = 0; const ath = c.map(x => (m = Math.max(m, x)));
  // ukelukk (uke starter mandag 00:00 UTC som på Binance): verdien for en dag er siste FULLFØRTE uke
  const wkOf = x => x - ((new Date(x).getUTCDay() + 6) % 7) * DAY; const W = []; for (let i = 0; i < N; i++) { const w = wkOf(t[i]); if (!W.length || W[W.length - 1].w !== w) W.push({ w, i, c: c[i] }); else { W[W.length - 1].i = i; W[W.length - 1].c = c[i]; } }
  const wS = sma(W.map(x => x.c), 50); const w50 = new Array(N).fill(null), wAbove = new Array(N).fill(null);
  let k = -1; for (let i = 0; i < N; i++) { while (k + 1 < W.length && W[k + 1].w + 7 * DAY <= t[i] + DAY) k++; // uka er ferdig når søndagslukket er kjent
    if (k >= 1 && wS[k] != null && wS[k - 1] != null) { w50[i] = wS[k]; const a = W[k].c > wS[k], b = W[k - 1].c > wS[k - 1]; wAbove[i] = a && b ? 1 : !a && !b ? -1 : 0; } }
  return { t, c, l, N, e200, s300, ath, w50, wAbove, W, wS, idx: new Map(t.map((x, i) => [x, i])) };
}

// ------------------------------------------------------------------ hovedberegning
function compute(src, now = Date.now()) {
  const coins = {}; for (const [s, rows] of Object.entries(src.coins)) if (rows && rows.length > 260) coins[s] = prepCoin(rows);
  const B = coins.BTC; if (!B) throw new Error('mangler BTC');
  const cal = []; for (let t = B.t[0]; t <= B.t[B.N - 1]; t += DAY) cal.push(t);
  const N = cal.length, at = (P, i) => P.idx.get(cal[i]);
  const raw = {}; // verdier per kalenderdag
  raw.btc200 = cal.map((t, i) => { const j = at(B, i); return j == null || B.e200[j] == null ? null : B.c[j] / B.e200[j] - 1; });
  raw.btc50w = cal.map((t, i) => { const j = at(B, i); return j == null || B.w50[j] == null ? null : B.c[j] / B.w50[j] - 1; });
  const st50 = cal.map((t, i) => { const j = at(B, i); return j == null ? null : B.wAbove[j]; });
  const brN = new Array(N).fill(0); raw.breadth = cal.map((t, i) => { let n = 0, up = 0; for (const P of Object.values(coins)) { const j = P.idx.get(t); if (j == null || j < 365 || P.e200[j] == null) continue; n++; if (P.c[j] > P.e200[j]) up++; } brN[i] = n; return n >= 8 ? up / n : null; });
  const S = src.series;
  raw.stables = onCal(cal, derive(S.stables, pctBack(90)), 1, 5);
  raw.fng = onCal(cal, S.fng, 0, 3);
  raw.dxy = onCal(cal, derive(S.dxy && S.dxy.data, vsSma(200)), S.dxy && S.dxy.lag || 0, 10);
  raw.us10y = onCal(cal, derive(S.us10y, chgBack(63)), 1, 10);
  raw.fed = onCal(cal, derive(S.fed, chgBack(182)), 1, 10);
  raw.m2 = onCal(cal, derive(S.m2, pctBack(12)), 55, 80); // månedstall: kjent ca. 55 dager etter månedsstart
  for (const k of ['spx', 'rut', 'soxx', 'gold', 'silver']) raw[k] = onCal(cal, derive(S[k] && S[k].data, vsSma(200)), 0, 10);
  raw.vix = onCal(cal, S.vix && S.vix.data, 0, 10);
  const state = {}; for (const c of COMP) { if (c.k === 'funding') continue; state[c.k] = c.k === 'btc50w' ? st50 : raw[c.k].map(RULE[c.k]); }
  const scored = COMP.filter(c => c.w > 0);
  const score = cal.map((t, i) => { let s = 0, n = 0; for (const c of scored) { const v = state[c.k][i]; if (v == null) continue; s += v; n++; } return n >= 4 ? { s: s / n, n } : null; });
  const label = score.map(x => x && LABEL(x.s));

  // ---------------- test: hva skjedde etter uker med samme makroklima? (hver 7. dag, bare data kjent på dagen)
  const fwd = (P, t, H) => { const j = P.idx.get(t); return j == null || j + H >= P.N ? null : P.c[j + H] / P.c[j] - 1; };
  const altFwd = (t, H) => { const a = []; for (const s of TRACK) { if (s === 'BTC' || !coins[s]) continue; const P = coins[s], j = P.idx.get(t); if (j == null || j < 365) continue; const r = fwd(P, t, H); if (r != null) a.push(r); } return a.length >= 3 ? quant(a, 0.5) : null; };
  const HZ = [30, 90, 180]; const firstI = cal.findIndex((t, i) => score[i] && t >= Date.UTC(2018, 0, 1));
  const weeks = []; for (let i = firstI; i >= 0 && i < N; i += 7) if (label[i]) weeks.push(i);
  const effN = (ts, H) => { let n = 0, last = -Infinity; for (const t of [...ts].sort((a, b) => a - b)) if (t - last >= H * DAY) { n++; last = t; } return n; };
  const summ = (arr, H) => { const v = arr.map(x => x.r); if (!v.length) return { n: 0 }; return { n: v.length, nEff: effN(arr.map(x => x.t), H), up: r3(v.filter(x => x > 0).length / v.length), q25: r3(quant(v, 0.25)), q50: r3(quant(v, 0.5)), q75: r3(quant(v, 0.75)) }; };
  const mid = weeks.length ? cal[weeks[Math.floor(weeks.length / 2)]] : 0;
  const test = { from: weeks.length ? iso(cal[weeks[0]]) : null, to: weeks.length ? iso(cal[weeks[weeks.length - 1]]) : null, split: iso(mid), weeks: weeks.length, hz: {} };
  for (const H of HZ) { const out = { btc: {}, alt: {}, half: {} };
    for (const who of ['btc', 'alt']) { const rows = weeks.map(i => ({ i, t: cal[i], lab: label[i], r: who === 'btc' ? fwd(B, cal[i], H) : altFwd(cal[i], H) })).filter(x => x.r != null);
      out[who].alle = summ(rows, H); for (const L of ['medvind', 'blandet', 'motvind']) out[who][L] = summ(rows.filter(x => x.lab === L), H);
      if (who === 'btc') for (const [hn, f] of [['forste', x => x.t < mid], ['andre', x => x.t >= mid]]) { const rr = rows.filter(f); out.half[hn] = {}; for (const L of ['medvind', 'motvind']) out.half[hn][L] = summ(rr.filter(x => x.lab === L), H); out.half[hn].alle = summ(rr, H); } }
    const g = out.btc, h1 = out.half.forste, h2 = out.half.andre;
    const sep = x => x.medvind.n && x.motvind.n ? x.medvind.q50 - x.motvind.q50 : null;
    const ok = g.medvind.nEff >= 4 && g.motvind.nEff >= 4 && sep(h1) > 0 && sep(h2) > 0 && g.medvind.up - g.motvind.up >= 0.1;
    out.verdict = ok ? 'skilte' : 'uklart'; out.sep = r3(sep(g)); test.hz[H] = out; }
  // per komponent (90 dager): median BTC-avkastning når grønt mot rødt
  test.comp = {}; for (const c of COMP) { if (!state[c.k]) continue; const g = [], r = []; for (const i of weeks) { const s = state[c.k][i], x = fwd(B, cal[i], 90); if (s == null || x == null) continue; (s > 0 ? g : s < 0 ? r : []).push({ t: cal[i], r: x }); }
    test.comp[c.k] = { gronn: summ(g, 90), rod: summ(r, 90) }; }

  // ---------------- hendelser: kursen tester 200/300-dagers som støtte, eller tar tilbake 50-ukerslinja
  const events = [];
  for (const s of TRACK) { const P = coins[s]; if (!P) continue; let last = -1e9;
    for (let j = 361; j < P.N; j++) { const hi = Math.max(P.e200[j] || 0, P.s300[j] || 0), lo = Math.min(P.e200[j] || Infinity, P.s300[j] || Infinity); if (!hi || !isFinite(lo)) continue;
      let ok = true, mx = 0; for (let q = j - 60; q < j; q++) { const hq = Math.max(P.e200[q] || 0, P.s300[q] || 0); if (!(P.c[q] > hq)) { ok = false; break; } mx = Math.max(mx, P.c[q] / hq); }
      if (!ok || mx < 1.1 || P.l[j] > hi * 1.03 || j - last < 120) continue; last = j;
      let held = true; for (let q = j; q < Math.min(P.N, j + 15); q++) if (P.c[q] < lo * 0.97) { held = false; break; }
      const i = cal.indexOf(P.t[j]); events.push({ type: 'ma', sym: s, date: iso(P.t[j]), px: sig(P.c[j]), held, macro: i >= 0 ? label[i] : null, score: i >= 0 && score[i] ? r3(score[i].s) : null, r90: r3(fwd(P, P.t[j], 90)), r180: r3(fwd(P, P.t[j], 180)) }); } }
  for (const s of TRACK) { const P = coins[s]; if (!P) continue; const W = P.W, wS = P.wS;
    for (let k = 14; k < W.length - 1; k++) { if (wS[k] == null || wS[k - 1] == null || !(W[k].c > wS[k] && W[k - 1].c > wS[k - 1])) continue; let below = true; for (let q = k - 13; q < k - 1; q++) if (wS[q] == null || W[q].c >= wS[q]) { below = false; break; } if (!below) continue;
      const t = P.t[W[k].i], i = cal.indexOf(t); events.push({ type: 'w50', sym: s, date: iso(t), px: sig(W[k].c), macro: i >= 0 ? label[i] : null, score: i >= 0 && score[i] ? r3(score[i].s) : null, r90: r3(fwd(P, t, 90)), r180: r3(fwd(P, t, 180)) }); } }
  events.sort((a, b) => a.date.localeCompare(b.date));
  const evSum = {}; for (const ty of ['ma', 'w50']) { evSum[ty] = {}; for (const L of ['alle', 'medvind', 'blandet', 'motvind']) { const e = events.filter(x => x.type === ty && (L === 'alle' || x.macro === L) && x.r180 != null); evSum[ty][L] = { n: e.length, up: e.length ? r3(e.filter(x => x.r180 > 0).length / e.length) : null, q50: r3(quant(e.map(x => x.r180), 0.5)) }; } }

  // ---------------- nå
  const iN = N - 1; let iS = iN; while (iS > 0 && !score[iS]) iS--;
  const spark = (arr, step = 7, n = 160) => { const o = []; for (let i = iN; i >= 0 && o.length < n; i -= step) o.push(arr[i] == null ? null : r3(arr[i])); return o.reverse(); };
  const lastIdx = arr => { for (let i = iN; i >= Math.max(0, iN - 120); i--) if (arr[i] != null) return i; return -1; };
  const meta = src.meta || {};
  const now0 = COMP.map(c => { const o = { k: c.k, g: c.g, w: c.w, name: c.name, unit: c.unit, why: c.why, rule: c.rule, src: (meta[c.k] && meta[c.k].src) || null };
    if (c.k === 'funding') { const F = S.funding; if (!F || !F.rates || !F.rates.length) { o.err = (meta.funding && meta.funding.err) || 'ikke tilgjengelig'; return o; }
      const r = F.rates, lastR = r[r.length - 1].v, avg = r.slice(-21).reduce((a, x) => a + x.v, 0) / Math.min(21, r.length);
      Object.assign(o, { v: r3(avg * 1e4) / 1e4, last: lastR, state: avg > 0.0003 ? -1 : avg < 0 ? 1 : 0, asOf: iso(r[r.length - 1].t), oiUsd: F.oiUsd, spark: r.slice(-90).map(x => +(x.v * 100).toFixed(4)), info: true }); return o; }
    const i = lastIdx(raw[c.k]); if (i < 0) { o.err = (meta[c.k] && meta[c.k].err) || 'ikke tilgjengelig'; return o; }
    o.v = r3(raw[c.k][i]); o.state = state[c.k][i]; o.asOf = iso(cal[i]); o.stale = iN - i > 10; o.spark = spark(raw[c.k]);
    if (c.k === 'btc50w') { const j = B.N - 1; o.level = sig(B.w50[j]); o.weeksSide = (() => { const W = B.W, wS = B.wS; let k = W.length - 1; if (W[k].w + 7 * DAY > B.t[j] + DAY) k--; const ab = W[k].c > wS[k]; let n = 0; while (k >= 0 && wS[k] != null && (W[k].c > wS[k]) === ab) { n++; k--; } return { above: ab, n }; })(); }
    if (c.k === 'btc200') o.level = sig(B.e200[B.N - 1]);
    if (c.k === 'breadth') o.nCoins = brN[i];
    if (c.k === 'stables') { const s = S.stables; o.total = s && s.length ? s[s.length - 1].v : null; }
    if (c.k === 'm2') o.note = 'Siste kjente månedstall (forsinket).';
    if (['spx', 'rut', 'soxx', 'gold', 'silver', 'dxy', 'vix'].includes(c.k)) { const d = S[c.k] && (S[c.k].data || S[c.k]); if (d && d.length) o.px = sig(d[d.length - 1].v); }
    if (c.k === 'us10y' && S.us10y && S.us10y.length) o.level = S.us10y[S.us10y.length - 1].v;
    if (c.k === 'fed' && S.fed && S.fed.length) o.level = S.fed[S.fed.length - 1].v;
    if (c.k === 'fng' && S.fng && S.fng.length) o.cls = S.fng[S.fng.length - 1].cls;
    return o; });
  const sc = score[iS];
  const counts = { gronn: 0, gul: 0, rod: 0 }; now0.filter(c => c.w > 0 && c.state != null).forEach(c => counts[c.state > 0 ? 'gronn' : c.state < 0 ? 'rod' : 'gul']++);
  const scoreSpark = spark(score.map(x => x && x.s));
  // hvor lenge har vi vært i dette klimaet?
  let since = iS; while (since > 0 && label[since - 1] === label[iS]) since--;

  // ---------------- per coin: viktige trendlinjer og hvordan de har holdt før
  const lines = {};
  for (const s of TRACK) { const P = coins[s]; if (!P) continue; const j = P.N - 1;
    const tests = (lvl, name) => { const ev = []; let lastT = -1e9;
      for (let q = 230; q < P.N; q++) { const L = lvl[q]; if (L == null) continue; let ok = true, mx = 0;
        for (let z = q - 30; z < q; z++) { if (lvl[z] == null || !(P.c[z] > lvl[z])) { ok = false; break; } mx = Math.max(mx, P.c[z] / lvl[z]); }
        if (!ok || mx < 1.05 || P.l[q] > L * 1.02 || q - lastT < 60) continue; lastT = q;
        let held = true; for (let z = q; z < Math.min(P.N, q + 20) - 1; z++) if (P.c[z] < lvl[z] * 0.98 && P.c[z + 1] < lvl[z + 1] * 0.98) { held = false; break; }
        const r90 = q + 90 < P.N ? P.c[q + 90] / P.c[q] - 1 : null; const bounce = (() => { let m = 0; for (let z = q; z < Math.min(P.N, q + 60); z++) m = Math.max(m, P.c[z] / P.c[q] - 1); return m; })();
        ev.push({ date: iso(P.t[q]), held, r90: r3(r90), bounce: r3(bounce) }); }
      const done = ev.filter(e => e.r90 != null), hd = done.filter(e => e.held), fl = done.filter(e => !e.held);
      return { name, n: ev.length, held: ev.filter(e => e.held).length, med90held: r3(quant(hd.map(e => e.r90), 0.5)), med90fail: r3(quant(fl.map(e => e.r90), 0.5)), last: ev.slice(-4) }; };
    const w50d = P.w50.map((v, q) => v); // ukelinja som dagsverdi (siste fullførte uke)
    lines[s] = { name: NAMES[s], px: sig(P.c[j]), asOf: iso(P.t[j]), ath: sig(P.ath[j]),
      e200: sig(P.e200[j]), s300: sig(P.s300[j]), w50: sig(P.w50[j]),
      tests: { e200: tests(P.e200, '200-dagerslinja'), s300: tests(P.s300, '300-dagerslinja'), w50: tests(w50d, '50-ukerslinja') } }; }

  const out = { built: new Date(now).toISOString(), asOf: iso(cal[iS]), groups: GROUPS,
    now: { score: sc ? r3(sc.s) : null, n: sc ? sc.n : 0, label: label[iS], labelTxt: LABEL_TXT[label[iS]] || null, since: iso(cal[since]), counts, spark: scoreSpark, sparkStep: 7, comps: now0,
      global: S.global || null },
    test, events: events.slice(-60), evSum, lines,
    method: { scored: scored.map(c => c.k), labels: { medvind: 'snitt ≥ +0,3', blandet: 'mellom', motvind: 'snitt ≤ −0,3' } } };
  if (src.debug) out._dbg = { cal, score, label, state };
  return out;
}

// ------------------------------------------------------------------ main (GitHub Actions)
async function main() {
  const now = Date.now(), coins = {}, meta = {}, series = {};
  for (const s of [...TRACK, ...REF]) { try { coins[s] = await binanceDaily(s, now); } catch (e) { console.log(s, 'feilet', e.message); } }
  try { const m = await binanceDaily('MATIC', now); if (m && coins.POL && coins.POL.length) { const t0 = coins.POL[0].t; coins.POL = [...m.filter(r => r.t < t0), ...coins.POL]; } } catch (e) { /* uten MATIC */ }
  meta.btc50w = meta.btc200 = meta.breadth = { src: 'Binance (dagslukk)' };
  const put = (k, res, extra = {}) => { if (res.err) { meta[k] = { err: res.err }; console.log(k, 'mangler:', res.err); return null; } meta[k] = { src: res.src }; console.log(k, 'ok', res.src, Array.isArray(res.data) ? res.data.length : ''); return Object.assign({ data: res.data }, extra); };
  let r = await first([['DefiLlama', stables]]); series.stables = r.data || null; meta.stables = r.err ? { err: r.err } : { src: 'DefiLlama' };
  r = await first([['alternative.me', fng]]); series.fng = r.data || null; meta.fng = r.err ? { err: r.err } : { src: 'alternative.me' };
  const dx = await first([['Yahoo (DX-Y.NYB)', () => yahoo('DX-Y.NYB')], ['FRED (DTWEXBGS)', () => fred('DTWEXBGS')]]);
  series.dxy = put('dxy', dx, { lag: dx.src && dx.src.startsWith('FRED') ? 7 : 0 });
  r = await first([['FRED (DGS10)', () => fred('DGS10')], ['Yahoo (^TNX)', () => yahoo('^TNX').then(a => a.map(x => ({ t: x.t, v: x.v })))]]); series.us10y = r.data || null; meta.us10y = r.err ? { err: r.err } : { src: r.src };
  r = await first([['FRED (DFF)', () => fred('DFF')]]); series.fed = r.data || null; meta.fed = r.err ? { err: r.err } : { src: r.src };
  r = await first([['FRED (M2SL)', () => fred('M2SL')]]); series.m2 = r.data || null; meta.m2 = r.err ? { err: r.err } : { src: r.src };
  series.spx = put('spx', await first([['Yahoo (^GSPC)', () => yahoo('^GSPC')], ['FRED (SP500)', () => fred('SP500')]]));
  series.rut = put('rut', await first([['Yahoo (^RUT)', () => yahoo('^RUT')], ['Yahoo (IWM)', () => yahoo('IWM')]]));
  series.soxx = put('soxx', await first([['Yahoo (SOXX)', () => yahoo('SOXX')], ['Yahoo (^SOX)', () => yahoo('^SOX')]]));
  series.vix = put('vix', await first([['Yahoo (^VIX)', () => yahoo('^VIX')], ['FRED (VIXCLS)', () => fred('VIXCLS')]]));
  series.gold = put('gold', await first([['Yahoo (GC=F)', () => yahoo('GC=F')], ['Yahoo (GLD)', () => yahoo('GLD')]]));
  series.silver = put('silver', await first([['Yahoo (SI=F)', () => yahoo('SI=F')], ['Yahoo (SLV)', () => yahoo('SLV')]]));
  try { series.funding = await okx(); meta.funding = { src: 'OKX (BTC-USDT-SWAP)' }; } catch (e) { meta.funding = { err: 'OKX: ' + e.message }; console.log('funding mangler', e.message); }
  try { series.global = await coingecko(); } catch (e) { series.global = { err: 'CoinGecko: ' + e.message }; }
  const t = Date.now(), out = compute({ coins, series, meta }, now); console.log('beregnet på', Date.now() - t, 'ms');
  console.log('makroklima nå:', out.now.labelTxt, out.now.score, JSON.stringify(out.now.counts));
  for (const [H, v] of Object.entries(out.test.hz)) console.log(`test ${H} d: medvind ${JSON.stringify(v.btc.medvind)} motvind ${JSON.stringify(v.btc.motvind)} alle ${JSON.stringify(v.btc.alle)} → ${v.verdict}`);
  const file = process.env.MACRO_OUT || path.join(__dirname, '..', 'site', 'data', 'macro.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(out));
}
// Feiler beregningen, beholdes forrige makrobilde fra nettsiden, så siden aldri mister fanen.
async function keepPrevious() { const P = process.env.PAGES_URL, file = process.env.MACRO_OUT || path.join(__dirname, '..', 'site', 'data', 'macro.json');
  if (!P || fs.existsSync(file)) return; try { const r = await fetch(`${P}data/macro.json?t=${Date.now()}`); if (r.ok) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, await r.text()); console.log('beholdt forrige macro.json'); } } catch (e) { /* ingen forrige */ } }
if (require.main === module) main().catch(async e => { console.error(e); await keepPrevious(); process.exit(1); });
module.exports = { compute, prepCoin, COMP, RULE, onCal, ema, sma };
