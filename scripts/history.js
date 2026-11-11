// Historiske scenarioer v2: «Hva skjedde før, når en coin var i en lignende situasjon som i dag?»
// - Mer data: dagscandles for ~20 store coins (hele Binance-historikken) brukes som felles erfaringsgrunnlag.
//   POL får MATIC-historikken foran seg (1:1-bytte i 2024).
// - Mer relevant: to likhetsmål. Kort sikt (1 uke, 1 mnd) ser på siste ukers bevegelse. Lang sikt (3, 6, 12 mnd) ser på
//   hvor i syklusen coinen og Bitcoin er (fall fra toppen, avstand til 200-dagerslinja, utvikling siste 3 og 12 mnd).
// - Ærlig: hvert tall sammenlignes med «en helt vanlig dag», og metoden testes bakover i tid (walk-forward) uten å se fremover.
// Kjøres i GitHub Actions etter update.js. Skriver site/data/history.json. Kan også kjøres lokalt med HIST_DATA=mappe med {SYM}_1d.json.gz.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DAY = 864e5;
const TRACK = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'POL', 'SAND'];
const NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano', POL: 'Polygon', SAND: 'The Sandbox' };
const REF = ['BNB', 'LINK', 'DOGE', 'LTC', 'TRX', 'AVAX', 'DOT', 'ATOM', 'BCH', 'ETC', 'XLM', 'UNI', 'FIL', 'NEAR', 'AAVE', 'VET', 'ALGO', 'MANA'];
const HZ = [7, 30, 90, 180, 365];
const LONG = new Set([90, 180, 365]);
const K = { 7: 60, 30: 60, 90: 40, 180: 40, 365: 40 };

// ------------------------------------------------------------------ indikatorer (bare data kjent på dagen)
function ema(a, n) { const o = new Array(a.length).fill(null), k = 2 / (n + 1); let e = null, s = 0;
  for (let i = 0; i < a.length; i++) { if (i < n - 1) { s += a[i]; continue; } if (e == null) { s += a[i]; e = s / n; } else e = a[i] * k + e * (1 - k); o[i] = e; } return o; }
function rsi(c, n = 14) { const o = new Array(c.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
function rv(c, n) { const o = new Array(c.length).fill(null); let s = 0, s2 = 0;
  for (let i = 1; i < c.length; i++) { const r = Math.log(c[i] / c[i - 1]); s += r; s2 += r * r; if (i > n) { const q = Math.log(c[i - n] / c[i - n - 1]); s -= q; s2 -= q * q; } if (i > n) { const m = s / n; o[i] = Math.sqrt(Math.max(1e-10, (s2 - n * m * m) / (n - 1)) * 365); } } return o; }
function prepCoin(sym, rows) { // rows: [{t,h,l,c}] stigende
  const t = rows.map(r => r.t), c = rows.map(r => r.c), lo = rows.map(r => r.l), N = c.length;
  const e50 = ema(c, 50), e200 = ema(c, 200), R = rsi(c), ath = new Array(N), athT = new Array(N), vol = new Array(N).fill(null);
  let m = 0, mt = 0; for (let i = 0; i < N; i++) { if (c[i] > m) { m = c[i]; mt = t[i]; } ath[i] = m; athT[i] = mt; }
  let s = 0, s2 = 0; for (let i = 1; i < N; i++) { const r = Math.log(c[i] / c[i - 1]); s += r; s2 += r * r; if (i > 90) { const q = Math.log(c[i - 90] / c[i - 91]); s -= q; s2 -= q * q; } if (i >= 91) { const mu = s / 90; vol[i] = Math.sqrt(Math.max(1e-12, (s2 - 90 * mu * mu) / 89) * 365); } }
  const idx = new Map(t.map((x, i) => [x, i])), v30 = rv(c, 30), v365 = rv(c, 365);
  // volatilitetsanslag: snitt av kort (30 d), middels (90 d) og lang (365 d) – testet bedre enn bare 90 d (research/hist_models.js)
  const vmix = c.map((_, i) => v30[i] != null && vol[i] != null && v365[i] != null ? Math.sqrt((v30[i] ** 2 + vol[i] ** 2 + v365[i] ** 2) / 3) : null);
  return { sym, t, c, lo, e50, e200, R, ath, athT, vol, vmix, idx, N };
}
const L = Math.log;
// Faste skalaer valgt på forhånd (typisk størrelse), ikke tilpasset mot utfall.
const FEAT = {
  long: [
    ['Fall fra toppen', 1.5, (P, i) => L(P.c[i] / P.ath[i]) / 0.6],
    ['Avstand til 200-dagerslinja', 1, (P, i) => P.e200[i] == null ? null : L(P.c[i] / P.e200[i]) / 0.3],
    ['Utvikling siste 3 mnd', 1, (P, i) => i < 90 ? null : L(P.c[i] / P.c[i - 90]) / 0.5],
    ['Utvikling siste 12 mnd', 0.75, (P, i) => i < 365 ? null : L(P.c[i] / P.c[i - 365]) / 1.0],
    ['Svingninger (volatilitet)', 0.5, (P, i) => P.vol[i] == null ? null : L(P.vol[i] / 0.8) / 0.5],
    ['Bitcoin: fall fra toppen', 0.75, (P, i, B, j) => j == null ? null : L(B.c[j] / B.ath[j]) / 0.6],
    ['Bitcoin: avstand til 200-dagerslinja', 0.75, (P, i, B, j) => j == null || B.e200[j] == null ? null : L(B.c[j] / B.e200[j]) / 0.3]],
  short: [
    ['Avstand til 50-dagerslinja', 1, (P, i) => P.e50[i] == null ? null : L(P.c[i] / P.e50[i]) / 0.15],
    ['Utvikling siste uke', 1, (P, i) => i < 7 ? null : L(P.c[i] / P.c[i - 7]) / 0.12],
    ['Utvikling siste måned', 1, (P, i) => i < 30 ? null : L(P.c[i] / P.c[i - 30]) / 0.25],
    ['RSI (14 dager)', 1, (P, i) => P.R[i] == null ? null : (P.R[i] - 50) / 15],
    ['Avstand til 200-dagerslinja', 1, (P, i) => P.e200[i] == null ? null : L(P.c[i] / P.e200[i]) / 0.3],
    ['Svingninger (volatilitet)', 0.5, (P, i) => P.vol[i] == null ? null : L(P.vol[i] / 0.8) / 0.5],
    ['Bitcoin siste måned', 0.75, (P, i, B, j) => j == null || j < 30 ? null : L(B.c[j] / B.c[j - 30]) / 0.25]] };
const MINAGE = 365; // dager etter notering før en dag kan brukes (unngå støyen rett etter notering)

function buildPool(coins) {
  const B = coins.BTC; const pool = { long: [], short: [] };
  for (const P of Object.values(coins)) for (let i = MINAGE; i < P.N; i++) { const j = B.idx.get(P.t[i]);
    for (const kind of ['long', 'short']) { const v = FEAT[kind].map(f => f[2](P, i, B, j)); if (v.some(x => x == null || !isFinite(x))) continue;
      pool[kind].push({ sym: P.sym, i, t: P.t[i], v }); } }
  return pool;
}
const W = kind => FEAT[kind].map(f => f[1]);
function dist(a, b, w) { let s = 0, ws = 0; for (let k = 0; k < a.length; k++) { const d = Math.max(-3, Math.min(3, a[k] - b[k])); s += w[k] * d * d; ws += w[k]; } return Math.sqrt(s / ws); }
const fwd = (P, i, H) => i + H < P.N ? P.c[i + H] / P.c[i] - 1 : null;
const dip = (P, i, H) => { if (i + H >= P.N) return null; let m = Infinity; for (let k = i + 1; k <= i + H; k++) m = Math.min(m, P.lo[k]); return m / P.c[i] - 1; };
function quant(a, q) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), x = q * (s.length - 1), lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); }
const r3 = v => v == null ? null : Math.round(v * 1000) / 1000;
const Q = a => ({ q10: r3(quant(a, 0.1)), q25: r3(quant(a, 0.25)), q50: r3(quant(a, 0.5)), q75: r3(quant(a, 0.75)), q90: r3(quant(a, 0.9)) });
function effN(ts, H) { const s = [...ts].sort((a, b) => a - b); let n = 0, st = -Infinity; for (const t of s) { if (t - st >= Math.max(30, H) * DAY) { n++; st = t; } } return n; }

// Velg de mest like tilfellene. known(c) = om utfallet er kjent. Spredning: samme coin minst 14 dager fra hverandre,
// og høyst 3 coins innenfor samme uke (coins beveger seg ofte likt på samme tid).
function select(cands, v0, kind, k, known, excl) {
  const w = W(kind), d = []; for (const c of cands) { if (!known(c) || (excl && excl(c))) continue; d.push([dist(v0, c.v, w), c]); }
  d.sort((a, b) => a[0] - b[0]); const sel = [];
  for (const [dd, c] of d) { if (sel.length >= k) break;
    if (sel.some(s => s.c.sym === c.sym && Math.abs(s.c.t - c.t) < 14 * DAY)) continue;
    if (sel.filter(s => Math.abs(s.c.t - c.t) < 7 * DAY).length >= 3) continue; sel.push({ d: dd, c }); }
  return sel;
}

function analyse(coins, pool, sym, lastT, val) {
  const P = coins[sym], B = coins.BTC, i0 = P.N - 1, j0 = B.idx.get(P.t[i0]); const out = { hz: {} };
  for (const H of HZ) {
    const kind = LONG.has(H) ? 'long' : 'short', v0 = FEAT[kind].map(f => f[2](P, i0, B, j0));
    if (v0.some(x => x == null || !isFinite(x))) { out.hz[H] = { ok: false, why: 'For kort historikk for denne coinen.' }; continue; }
    const known = c => c.t + H * DAY <= lastT, excl = c => c.sym === sym && c.t > P.t[i0] - 120 * DAY;
    const sel = select(pool[kind], v0, kind, K[H], known, excl);
    const rets = [], dips = [], ts = []; for (const s of sel) { const Q0 = coins[s.c.sym]; rets.push(fwd(Q0, s.c.i, H)); dips.push(dip(Q0, s.c.i, H)); ts.push(s.c.t); }
    const base = [], baseOwn = []; for (const c of pool[kind]) { if (!known(c)) continue; const r = fwd(coins[c.sym], c.i, H); base.push(r); if (c.sym === sym) baseOwn.push(r); }
    const up = a => a.length ? r3(a.filter(x => x > 0).length / a.length) : null;
    const m = quant(rets, 0.5), cal = val && val[H] && val[H].cal; let band = null;
    if (cal && m != null) { const f = r => r == null ? null : r3((1 + m) * Math.exp(r) - 1); band = { lo: f(cal.r10), q25: f(cal.r25), mid: f(cal.r50), q75: f(cal.r75), hi: f(cal.r90) };
      const thr = Math.log(1 / (1 + m)); band.pUp = r3(valRes(val[H]).filter(x => x > thr).length / valRes(val[H]).length); }
    let range = null; const RZ = val && val._ranges && val._ranges[H];
    if (RZ && P.vmix[i0]) { const sv = P.vmix[i0] * Math.sqrt(H / 365), f = z => r3(Math.exp(z * sv) - 1); range = { lo: f(RZ.z[0]), q25: f(RZ.z[1]), mid: f(RZ.z[2]), q75: f(RZ.z[3]), hi: f(RZ.z[4]), pUp: RZ.pUp, cover: RZ.perCoin[sym] || null }; }
    const vz = null, bmN = quant(base, 0.5);
    if (vz && P.vol[i0] && bmN != null) { const sv = P.vol[i0] * Math.sqrt(H / 365), f = z => r3((1 + bmN) * Math.exp(z * sv) - 1);
      const Z = val[H]._z, thr = -Math.log(1 + bmN) / sv; range = { lo: f(vz.z10), q25: f(vz.z25), mid: f(vz.z50), q75: f(vz.z75), hi: f(vz.z90), pUp: r3(Z.filter(z => z > thr).length / Z.length) }; }
    out.hz[H] = { ok: true, kind, range, band, n: rets.length, nEff: effN(ts, H), up: up(rets), ret: Q(rets), dip: r3(quant(dips, 0.5)), dipBad: r3(quant(dips, 0.1)), meanDist: r3(sel.reduce((s, x) => s + x.d, 0) / (sel.length || 1)),
      base: { n: base.length, up: up(base), q50: r3(quant(base, 0.5)) }, baseOwn: { n: baseOwn.length, up: up(baseOwn), q50: r3(quant(baseOwn, 0.5)) },
      cases: sel.slice(0, 8).map(s => { const Q0 = coins[s.c.sym], i = s.c.i; return { sym: s.c.sym, t: s.c.t, d: r3(s.d), r: r3(fwd(Q0, i, H)), dip: r3(dip(Q0, i, H)),
        dd: r3(Q0.c[i] / Q0.ath[i] - 1), d200: r3(Q0.c[i] / Q0.e200[i] - 1), r90: i >= 90 ? r3(Q0.c[i] / Q0.c[i - 90] - 1) : null }; }) };
    if (H === 365 || H === 30) { // kursbane: prisutvikling dag for dag etter tilfellene (i forhold til startkurs)
      const len = H, fan = []; for (let j = 0; j <= len; j += (H === 365 ? 3 : 1)) { const v = []; for (const s of sel) { const Q0 = coins[s.c.sym]; if (s.c.i + j < Q0.N) v.push(Q0.c[s.c.i + j] / Q0.c[s.c.i]); }
        fan.push({ j, n: v.length, ...Q(v) }); } out.hz[H].fan = fan; }
  }
  // dagens situasjon i klartekst
  const e200 = P.e200[i0], above = P.c[i0] > e200; let side = 0; for (let i = i0; i >= 0 && P.e200[i] != null && (P.c[i] > P.e200[i]) === above; i--) side++;
  out.now = { t: P.t[i0], c: P.c[i0], ath: P.ath[i0], athT: P.athT[i0], dd: r3(P.c[i0] / P.ath[i0] - 1), e200, e50: P.e50[i0], d200: r3(P.c[i0] / e200 - 1), above, side,
    r7: r3(P.c[i0] / P.c[i0 - 7] - 1), r30: r3(P.c[i0] / P.c[i0 - 30] - 1), r90: r3(P.c[i0] / P.c[i0 - 90] - 1), r365: i0 >= 365 ? r3(P.c[i0] / P.c[i0 - 365] - 1) : null,
    vol: r3(P.vol[i0]), btcDd: j0 != null ? r3(B.c[j0] / B.ath[j0] - 1) : null, btcD200: j0 != null ? r3(B.c[j0] / B.e200[j0] - 1) : null, rsi: P.R[i0] != null ? Math.round(P.R[i0]) : null };
  const past = []; for (let i = Math.max(0, i0 - 365); i <= i0; i++) past.push([P.t[i], +P.c[i].toPrecision(6)]); out.past = past;
  return out;
}

// Walk-forward: på hver testdato brukes bare tilfeller der utfallet var kjent den dagen. Ingen titting fremover.
function validate(coins, pool, lastT, opts = {}) {
  const step = opts.step || 14, from = Date.UTC(2019, 0, 1), res = {};
  for (const H of HZ) { const kind = LONG.has(H) ? 'long' : 'short'; const rows = [];
    const byKey = new Map(pool[kind].map(c => [c.sym + ':' + c.t, c]));
    for (const sym of TRACK) { const P = coins[sym]; if (!P) continue;
      for (let i = MINAGE; i < P.N - H; i += step) { const T = P.t[i]; if (T < from) continue; const me = byKey.get(sym + ':' + T); if (!me) continue;
        const WY = +(process.env.WY || 0) * 365 * DAY; const sel = select(pool[kind], me.v, kind, K[H], c => c.t + H * DAY <= T && (!WY || c.t >= T - WY), c => c.sym === sym && c.t > T - 120 * DAY);
        if (sel.length < 10) continue; const rets = sel.map(s => fwd(coins[s.c.sym], s.c.i, H));
        const bs = []; for (let k = 0; k < pool[kind].length; k += 7) { const c = pool[kind][k]; if (c.t + H * DAY <= T && (!WY || c.t >= T - WY)) bs.push(fwd(coins[c.sym], c.i, H)); }
        const m = quant(rets, 0.5), a = fwd(P, i, H), bm = quant(bs, 0.5), sv = P.vol[i] * Math.sqrt(H / 365); rows.push({ sym, t: T, vol: P.vol[i], z: Math.log((1 + a) / (1 + bm)) / sv, p: rets.filter(x => x > 0).length / rets.length, m, a, res: Math.log((1 + a) / (1 + m)), lo: quant(rets, 0.1), hi: quant(rets, 0.9), blo: quant(bs, 0.1), bhi: quant(bs, 0.9) }); } }
    const upAll = rows.length ? rows.filter(r => r.a > 0).length / rows.length : null;
    const grp = f => { const g = rows.filter(f); return { n: g.length, nEff: effN(g.map(r => r.t), H), up: g.length ? r3(g.filter(r => r.a > 0).length / g.length) : null, med: r3(quant(g.map(r => r.a), 0.5)) }; };
    // rangkorrelasjon mellom forventet median og faktisk utfall
    const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length); o.forEach(([, i], k) => { r[i] = k; }); return r; };
    let rho = null; if (rows.length > 20) { const x = rank(rows.map(r => r.m)), y = rank(rows.map(r => r.a)), n = rows.length, mx = (n - 1) / 2; let sxy = 0, sxx = 0, syy = 0; for (let k = 0; k < n; k++) { sxy += (x[k] - mx) * (y[k] - mx); sxx += (x[k] - mx) ** 2; syy += (y[k] - mx) ** 2; } rho = r3(sxy / Math.sqrt(sxx * syy)); }
    const cov = (lo, hi) => rows.length ? r3(rows.filter(r => r[lo] != null && r.a >= r[lo] && r.a <= r[hi]).length / rows.length) : null;
    const wid = (lo, hi) => r3(quant(rows.filter(r => r[lo] != null).map(r => r[hi] - r[lo]), 0.5));
    const below = rows.length ? r3(rows.filter(r => r.a < r.lo).length / rows.length) : null, aboveR = rows.length ? r3(rows.filter(r => r.a > r.hi).length / rows.length) : null;
    const RS = rows.map(r => r.res); const cal = { r10: r3(quant(RS, 0.1)), r25: r3(quant(RS, 0.25)), r50: r3(quant(RS, 0.5)), r75: r3(quant(RS, 0.75)), r90: r3(quant(RS, 0.9)) };
    res[H] = { cal, range: { cover: cov('lo', 'hi'), width: wid('lo', 'hi'), below, above: aboveR, baseCover: cov('blo', 'bhi'), baseWidth: wid('blo', 'bhi') }, tests: rows.length, nEff: effN(rows.map(r => r.t), H), upAll: r3(upAll), hi: grp(r => r.p >= 0.6), lo: grp(r => r.p <= 0.4), mid: grp(r => r.p > 0.4 && r.p < 0.6), rho,
      from: rows.length ? new Date(Math.min(...rows.map(r => r.t))).toISOString().slice(0, 10) : null };
    Object.defineProperty(res[H], '_res', { value: RS, enumerable: false });
    // Hovedspennet: «vanlig utvikling» (median for alle dager) ± svingninger skalert med coinens volatilitet nå.
    const ZS = rows.map(r => r.z).filter(isFinite); res[H].calZ = { z10: r3(quant(ZS, 0.1)), z25: r3(quant(ZS, 0.25)), z50: r3(quant(ZS, 0.5)), z75: r3(quant(ZS, 0.75)), z90: r3(quant(ZS, 0.9)) };
    Object.defineProperty(res[H], '_z', { value: ZS, enumerable: false });
    const vs = rows.map(r => r.vol).sort((x, y) => x - y), v1 = quant(vs, 1 / 3), v2 = quant(vs, 2 / 3), cz = res[H].calZ;
    const covZ = f => { const g = rows.filter(f); return g.length ? r3(g.filter(r => r.z >= cz.z10 && r.z <= cz.z90).length / g.length) : null; };
    res[H].coverByVol = { low: covZ(r => r.vol <= v1), mid: covZ(r => r.vol > v1 && r.vol <= v2), high: covZ(r => r.vol > v2) };
    const half = rows.length ? [...rows].sort((a, b) => a.t - b.t)[rows.length >> 1].t : 0; res[H].coverByTime = { first: covZ(r => r.t < half), second: covZ(r => r.t >= half) };
    // vurdering i klartekst: skiller metoden mellom gode og dårlige tidspunkter?
    const h = res[H].hi, l = res[H].lo, gap = h.up != null && l.up != null ? h.up - l.up : null;
    res[H].grade = gap == null || h.nEff < 8 || l.nEff < 8 ? 'ukjent' : gap >= 0.2 && rho > 0.1 ? 'middels' : gap >= 0.1 && rho > 0.05 ? 'lav' : 'ingen';
  }
  return res;
}

const valRes = v => v._res || [];
// Syklus-scenario: hva gjorde coinen i samme fase etter tidligere Bitcoin-halveringer? (Bare sykluser som finnes i Binance-dataene.)
const HALVINGS = [Date.UTC(2012, 10, 28), Date.UTC(2016, 6, 9), Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20)];
function cycles(P, lastT) {
  const last = HALVINGS.filter(h => h <= lastT).pop(), phase = lastT - last, out = [];
  for (const h of HALVINGS) { if (h >= last) continue; const T = h + phase, i0 = P.idx.get(Math.floor(T / DAY) * DAY); if (i0 == null || i0 < 30) continue;
    const path = []; for (let j = 0; j <= 365 && i0 + j < P.N; j += 3) path.push([j, r3(P.c[i0 + j] / P.c[i0])]);
    out.push({ halving: new Date(h).getUTCFullYear(), start: P.t[i0], dd: r3(P.c[i0] / P.ath[i0] - 1), path, r90: i0 + 90 < P.N ? r3(P.c[i0 + 90] / P.c[i0] - 1) : null, r365: i0 + 365 < P.N ? r3(P.c[i0 + 365] / P.c[i0] - 1) : null }); }
  return { phaseDays: Math.round(phase / DAY), lastHalving: new Date(last).toISOString().slice(0, 10), list: out };
}
// Realistisk spenn: logavkastning over H dager = z × vol × sqrt(H/365), der z-fordelingen er alle tidligere utfall for alle coins.
// Treffrekord: samme beregning gjort bakover i tid med bare data kjent den dagen (utvidende vindu), for hver 7. dag.
const QL = [0.1, 0.25, 0.5, 0.75, 0.9];
function ranges(coins, lastT) {
  const ev = []; for (const P of Object.values(coins)) for (let i = MINAGE; i < P.N; i += 3) if (P.vmix[i]) ev.push({ P, i, t: P.t[i], vf: P.vmix[i] });
  const res = {}, TR_H = new Set([30, 90, 365]), from = Date.UTC(2020, 0, 1), recent = lastT - 3 * 365 * DAY, showFrom = lastT - 2 * 365 * DAY - 400 * DAY;
  const ins = (a, v) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } a.splice(lo, 0, v); };
  const qs = a => QL.map(q => quant(a, q));
  for (const H of HZ) { const sq = Math.sqrt(H / 365);
    const known = ev.filter(e => e.i + H < e.P.N).map(e => ({ k: e.t + H * DAY, z: Math.log(e.P.c[e.i + H] / e.P.c[e.i]) / (e.vf * sq) })).sort((a, b) => a.k - b.k);
    const RW = +(process.env.RW || 0) * 365 * DAY; const all = known.filter(x => x.k <= lastT && (!RW || x.k > lastT - RW)).map(x => x.z).sort((a, b) => a - b);
    res[H] = { z: qs(all).map(r3), pUp: r3(all.filter(z => z > 0).length / all.length), n: all.length, perCoin: {}, track: {} };
    // treffrekord per fulgt coin
    let pooled = { n: 0, hit: 0, above: 0, below: 0, rn: 0, rhit: 0 };
    for (const sym of TRACK) { const P = coins[sym]; if (!P) continue; const z = []; let p = 0; const st = { n: 0, hit: 0, above: 0, below: 0, rn: 0, rhit: 0 }, tr = [];
      for (let i = MINAGE; i < P.N; i += 7) { const T = P.t[i]; if (T < from || !P.vmix[i]) continue;
        while (p < known.length && known[p].k <= T) ins(z, known[p++].z);
        if (RW) while (z.q0 == null ? (z.q0 = 0, false) : false) {} if (RW) { while (z.r0 == null) z.r0 = 0; while (z.r0 < p && known[z.r0].k <= T - RW) { const v = known[z.r0++].z; let lo = 0, hi = z.length; while (lo < hi) { const m = (lo + hi) >> 1; if (z[m] < v) lo = m + 1; else hi = m; } z.splice(lo, 1); } }
        if (z.length < 200) continue;
        const q = qs(z).map(x => P.c[i] * Math.exp(x * P.vmix[i] * sq)), act = i + H < P.N ? P.c[i + H] : null;
        if (act != null) { st.n++; const h = act >= q[0] && act <= q[4]; st.hit += h; st.above += act > q[4]; st.below += act < q[0]; if (T >= recent) { st.rn++; st.rhit += h; } }
        if (TR_H.has(H) && T >= showFrom) tr.push([T, +P.c[i].toPrecision(5), +q[0].toPrecision(5), +q[2].toPrecision(5), +q[4].toPrecision(5), act == null ? null : +act.toPrecision(5)]); }
      res[H].perCoin[sym] = { n: st.n, cover: st.n ? r3(st.hit / st.n) : null, above: st.n ? r3(st.above / st.n) : null, below: st.n ? r3(st.below / st.n) : null, recentN: st.rn, recent: st.rn ? r3(st.rhit / st.rn) : null };
      if (TR_H.has(H)) res[H].track[sym] = tr; for (const k in pooled) pooled[k] += st[k]; }
    res[H].cover = { n: pooled.n, all: r3(pooled.hit / pooled.n), above: r3(pooled.above / pooled.n), below: r3(pooled.below / pooled.n), recent: pooled.rn ? r3(pooled.rhit / pooled.rn) : null };
  }
  return res;
}
function compute(rowsBySym, opts = {}) {
  const coins = {}; for (const [s, rows] of Object.entries(rowsBySym)) if (rows && rows.length > MINAGE + 30) coins[s] = prepCoin(s, rows);
  if (!coins.BTC) throw new Error('BTC mangler');
  const pool = buildPool(coins), lastT = Math.max(...Object.values(coins).map(P => P.t[P.N - 1]));
  const out = { built: new Date().toISOString(), lastT, poolCoins: Object.keys(coins), poolDays: pool.long.length, poolFrom: new Date(Math.min(...pool.long.map(c => c.t))).toISOString().slice(0, 10),
    feats: { long: FEAT.long.map(f => f[0]), short: FEAT.short.map(f => f[0]) }, names: NAMES, coins: {} };
  if (opts.validate !== false) out.validation = validate(coins, pool, lastT, opts);
  out.ranges = ranges(coins, lastT);
  const valX = Object.assign({}, out.validation); Object.defineProperty(valX, '_ranges', { value: out.ranges, enumerable: false });
  for (const s of TRACK) if (coins[s]) { out.coins[s] = analyse(coins, pool, s, lastT, valX); out.coins[s].track = Object.fromEntries(Object.entries(out.ranges).filter(([, v]) => v.track[s]).map(([H, v]) => [H, v.track[s]])); out.coins[s].now.vmix = r3(coins[s].vmix[coins[s].N - 1]); out.coins[s].cycles = cycles(coins[s], coins[s].t[coins[s].N - 1]); }
  for (const H in out.ranges) delete out.ranges[H].track;
  return out;
}

// ------------------------------------------------------------------ henting (GitHub Actions)
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) { let e; for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); e = new Error('HTTP ' + r.status); } catch (x) { e = x; } await sleep(1500 * (i + 1)); } throw e; }
async function daily(sym, now) { const out = []; let start = 0;
  for (;;) { const k = await get(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&startTime=${start}&limit=1000`);
    for (const x of k) if (x[6] < now) out.push({ t: x[0], h: +x[2], l: +x[3], c: +x[4] }); if (k.length < 1000) break; start = k[k.length - 1][0] + DAY; }
  return out; }
function loadLocal(dir, sym) { const f = path.join(dir, `${sym}_1d.json.gz`); if (!fs.existsSync(f)) return null; return JSON.parse(zlib.gunzipSync(fs.readFileSync(f))).map(r => ({ t: r[0], h: +r[2], l: +r[3], c: +r[4] })); }
async function main() {
  const now = Date.now(), rows = {}, local = process.env.HIST_DATA;
  for (const s of [...TRACK, ...REF]) { try { rows[s] = local ? loadLocal(local, s) : await daily(s, now); console.log(s, rows[s] ? rows[s].length : 'mangler'); } catch (e) { console.log(s, 'feilet', e.message); } }
  // POL = MATIC før byttet
  try { const m = local ? loadLocal(local, 'MATIC') : await daily('MATIC', now); if (m && rows.POL && rows.POL.length) { const t0 = rows.POL[0].t; rows.POL = [...m.filter(r => r.t < t0), ...rows.POL]; console.log('POL med MATIC-historikk', rows.POL.length); } } catch (e) { console.log('MATIC feilet', e.message); }
  const t = Date.now(), out = compute(rows); console.log('beregnet på', Date.now() - t, 'ms');
  const file = process.env.HIST_OUT || path.join(__dirname, '..', 'site', 'data', 'history.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(out));
  for (const [H, v] of Object.entries(out.validation || {})) console.log(`test ${H} d: kal ${JSON.stringify(v.cal)} spenn 10–90 traff ${v.range.cover} (bredde ${v.range.width}, under ${v.range.below}, over ${v.range.above}) mot vanlig ${v.range.baseCover} (bredde ${v.range.baseWidth}) · ${v.tests} tester, alle ${v.upAll}, «oftest opp» ${v.hi.up} (n ${v.hi.n}), «oftest ned» ${v.lo.up} (n ${v.lo.n}), rho ${v.rho} → ${v.grade}`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { compute, prepCoin, FEAT, HZ, TRACK };
