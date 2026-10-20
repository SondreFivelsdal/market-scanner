// Daytrading-motor: korte long/short-oppsett på 15-minutters candles med 1-times trend som filter.
// Samme kode brukes i nettleseren (live, data hentes direkte fra Binance) og i GitHub Actions (backtest og varsler),
// slik at det som vises live er nøyaktig det som er backtestet.
// Alle beregninger på candle i bruker bare candles til og med i (lukkede candles). Inngang i backtesten skjer på
// åpningskursen til neste candle. Parametrene er satt på forhånd og ikke tilpasset historikken.
(function (root) {
  'use strict';
  const M15 = 15 * 60e3, H1 = 36e5, DAY = 864e5;
  const VERSION = 'dt1';
  // gebyr: Binance futures taker 0,05 % per side + 0,02 % glidning per side
  const P = { fee: 0.0005, slip: 0.0002, rr: 2, maxBars: 24, minStopPct: 0.25, maxStopAtr: 2.5, warm: 220 };
  const TYPES = {
    pb: { label: 'Pullback i trend', short: 'Pullback',
      long: '1-timestrenden peker opp. Kursen har trukket seg tilbake mot 50-snittet/VWAP på 15 min, RSI har kjølt seg ned, og en 15-min candle lukker over forrige candles topp og over 20-snittet og VWAP.',
      shortTxt: '1-timestrenden peker ned. Kursen har rekylert opp mot 50-snittet/VWAP på 15 min, RSI har vært høy, og en 15-min candle lukker under forrige candles bunn og under 20-snittet og VWAP.' },
    sw: { label: 'Falskt brudd ved gårsdagens nivå', short: 'Falskt brudd',
      long: 'Kursen stakk under gårsdagens bunn (PDL) men lukket tilbake over den samme candle, med oversolgt RSI. Ofte et tegn på at selgerne ble fanget.',
      shortTxt: 'Kursen stakk over gårsdagens topp (PDH) men lukket tilbake under den samme candle, med overkjøpt RSI. Ofte et tegn på at kjøperne ble fanget.' },
    bo: { label: 'Utbrudd med volum', short: 'Utbrudd',
      long: 'Første 15-min lukk over gårsdagens topp (PDH) i dag, med minst 1,8 × vanlig volum og lukk i øvre del av candlen. 1-timestrenden er ikke negativ.',
      shortTxt: 'Første 15-min lukk under gårsdagens bunn (PDL) i dag, med minst 1,8 × vanlig volum og lukk i nedre del av candlen. 1-timestrenden er ikke positiv.' } };
  const KEYS = []; for (const t of ['pb', 'sw', 'bo']) for (const d of [1, -1]) KEYS.push(t + (d > 0 ? 'L' : 'S'));

  // ---------------------------------------------------------------- hjelpere
  function bars(rows) { // Binance-klines ([t,o,h,l,c,v,…]) eller objekter {t,o,h,l,c,v}
    const B = { t: [], o: [], h: [], l: [], c: [], v: [] };
    for (const r of rows || []) { const a = Array.isArray(r); B.t.push(+(a ? r[0] : r.t)); B.o.push(+(a ? r[1] : r.o)); B.h.push(+(a ? r[2] : r.h)); B.l.push(+(a ? r[3] : r.l)); B.c.push(+(a ? r[4] : r.c)); B.v.push(+(a ? r[5] : r.v)); }
    B.N = B.t.length; return B; }
  const ema = (a, n) => { const k = 2 / (n + 1), o = new Array(a.length); let p = null; for (let i = 0; i < a.length; i++) { p = p == null ? a[i] : a[i] * k + p * (1 - k); o[i] = i >= n - 1 ? p : null; } return o; };
  const sma = (a, n) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  function rsi(c, n = 14) { const o = new Array(c.length).fill(null); let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
      else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
  function atr(B, n = 14) { const o = new Array(B.N).fill(null); let a = null;
    for (let i = 1; i < B.N; i++) { const tr = Math.max(B.h[i] - B.l[i], Math.abs(B.h[i] - B.c[i - 1]), Math.abs(B.l[i] - B.c[i - 1]));
      if (i <= n) { a = (a || 0) + tr; if (i === n) { a /= n; o[i] = a; } } else { a = (a * (n - 1) + tr) / n; o[i] = a; } } return o; }
  const dayOf = t => Math.floor(t / DAY) * DAY;

  // ---------------------------------------------------------------- indikatorer (kausale)
  function prepare(B, H) {
    const N = B.N, e20 = ema(B.c, 20), e50 = ema(B.c, 50), R = rsi(B.c, 14), A = atr(B, 14), vs = sma(B.v, 20);
    const vwap = new Array(N).fill(null), pdh = new Array(N).fill(null), pdl = new Array(N).fill(null), day0 = new Array(N).fill(null);
    const dHi = new Array(N).fill(null), dLo = new Array(N).fill(null), aboveB = new Array(N).fill(false), belowB = new Array(N).fill(false);
    let d = null, pv = 0, vv = 0, hi = -Infinity, lo = Infinity, pH = null, pL = null, ab = false, be = false, full = false, firstDay = true;
    for (let i = 0; i < N; i++) {
      const di = dayOf(B.t[i]);
      if (di !== d) { if (d != null) { if (full) { pH = hi; pL = lo; } else { pH = null; pL = null; } firstDay = false; }
        // gårsdagen teller bare hvis den var komplett (startet 00:00 UTC)
        full = B.t[i] === di; d = di; pv = 0; vv = 0; hi = -Infinity; lo = Infinity; ab = false; be = false; }
      const tp = (B.h[i] + B.l[i] + B.c[i]) / 3; pv += tp * B.v[i]; vv += B.v[i]; vwap[i] = vv > 0 ? pv / vv : B.c[i];
      pdh[i] = firstDay ? null : pH; pdl[i] = firstDay ? null : pL; day0[i] = di;
      aboveB[i] = ab; belowB[i] = be; // lukk over/under gårsdagens nivå tidligere i dag (før denne candlen)
      hi = Math.max(hi, B.h[i]); lo = Math.min(lo, B.l[i]); dHi[i] = hi; dLo[i] = lo;
      if (pH != null && !firstDay && B.c[i] > pH) ab = true; if (pL != null && !firstDay && B.c[i] < pL) be = true;
    }
    // 1-timestrend: siste 1t-candle som var lukket da 15-min candlen lukket
    const bias = new Array(N).fill(0), hE20 = H ? ema(H.c, 20) : [], hE50 = H ? ema(H.c, 50) : [], hIdx = new Array(N).fill(-1);
    if (H && H.N) { let j = -1; for (let i = 0; i < N; i++) { const close15 = B.t[i] + M15; while (j + 1 < H.N && H.t[j + 1] + H1 <= close15) j++; hIdx[i] = j;
        if (j >= 53 && hE50[j] != null && hE50[j - 3] != null) { const up = H.c[j] > hE50[j] && hE20[j] > hE50[j] && hE50[j] > hE50[j - 3], dn = H.c[j] < hE50[j] && hE20[j] < hE50[j] && hE50[j] < hE50[j - 3]; bias[i] = up ? 1 : dn ? -1 : 0; } } }
    return { e20, e50, R, A, vs, vwap, pdh, pdl, day0, dHi, dLo, aboveB, belowB, bias, hIdx, hE20, hE50 };
  }

  // ---------------------------------------------------------------- oppsett som utløses på lukket candle i
  function triggersAt(B, I, i) {
    const out = [], a = I.A[i], c = B.c[i]; if (!a || i < 8 || I.e50[i] == null || I.R[i] == null) return out;
    const h = B.h, l = B.l, R = I.R;
    const minL = k => { let m = Infinity; for (let j = i - k; j <= i; j++) m = Math.min(m, l[j]); return m; };
    const maxH = k => { let m = -Infinity; for (let j = i - k; j <= i; j++) m = Math.max(m, h[j]); return m; };
    const minR = k => { let m = Infinity; for (let j = i - k; j <= i; j++) if (R[j] != null) m = Math.min(m, R[j]); return m; };
    const maxR = k => { let m = -Infinity; for (let j = i - k; j <= i; j++) if (R[j] != null) m = Math.max(m, R[j]); return m; };
    const add = (type, dir, stop, why) => { const risk = (c - stop) * dir; if (risk <= 0) return; const rp = risk / c * 100;
      if (rp < P.minStopPct || risk > P.maxStopAtr * a) return; out.push({ i, t: B.t[i], type, dir, key: type + (dir > 0 ? 'L' : 'S'), ref: c, stop, riskPct: rp, why }); };
    // 1) pullback i trend
    if (I.bias[i] === 1) { let mn = Infinity; for (let j = i - 6; j < i; j++) mn = Math.min(mn, l[j]); const zone = Math.max(I.e50[i], I.vwap[i]);
      if (mn <= zone + 0.25 * a && minR(6) < 45 && c > h[i - 1] && c > I.e20[i] && c > I.vwap[i]) add('pb', 1, minL(6) - 0.2 * a, ['1t-trend opp', 'tilbaketrekk til 50-snitt/VWAP', 'RSI var under 45', 'lukk over forrige topp']); }
    if (I.bias[i] === -1) { let mx = -Infinity; for (let j = i - 6; j < i; j++) mx = Math.max(mx, h[j]); const zone = Math.min(I.e50[i], I.vwap[i]);
      if (mx >= zone - 0.25 * a && maxR(6) > 55 && c < l[i - 1] && c < I.e20[i] && c < I.vwap[i]) add('pb', -1, maxH(6) + 0.2 * a, ['1t-trend ned', 'rekyl til 50-snitt/VWAP', 'RSI var over 55', 'lukk under forrige bunn']); }
    // 2) falskt brudd ved gårsdagens nivå
    const pdl = I.pdl[i], pdh = I.pdh[i];
    if (pdl != null && l[i] < pdl && c > pdl && minR(2) < 35) add('sw', 1, l[i] - 0.2 * a, ['stakk under gårsdagens bunn', 'lukket tilbake over', 'RSI under 35']);
    if (pdh != null && h[i] > pdh && c < pdh && maxR(2) > 65) add('sw', -1, h[i] + 0.2 * a, ['stakk over gårsdagens topp', 'lukket tilbake under', 'RSI over 65']);
    // 3) utbrudd med volum
    const vOk = I.vs[i - 1] != null && B.v[i] > 1.8 * I.vs[i - 1], rng = h[i] - l[i];
    if (pdh != null && I.bias[i] >= 0 && !I.aboveB[i] && c > pdh && vOk && rng > 0 && (c - l[i]) / rng >= 0.7) add('bo', 1, l[i] - 0.1 * a, ['første lukk over gårsdagens topp', 'volum ≥ 1,8 × snitt', 'sterk lukk']);
    if (pdl != null && I.bias[i] <= 0 && !I.belowB[i] && c < pdl && vOk && rng > 0 && (h[i] - c) / rng >= 0.7) add('bo', -1, h[i] + 0.1 * a, ['første lukk under gårsdagens bunn', 'volum ≥ 1,8 × snitt', 'svak lukk']);
    return out;
  }

  // ---------------------------------------------------------------- handel fra et oppsett: inngang neste åpning, stopp/mål/tidsstopp
  function trade(B, s) {
    const i = s.i; if (i + 1 >= B.N) return { ...s, state: 'venter' }; // ingen neste candle ennå
    const entry = B.o[i + 1], dir = s.dir, risk = (entry - s.stop) * dir;
    if (!(risk > 0)) return { ...s, entry, state: 'ugyldig' }; // åpnet forbi stoppen
    const tgt = entry + dir * P.rr * risk, cost = (P.fee + P.slip) * 2 * entry / risk;
    const last = Math.min(B.N - 1, i + P.maxBars);
    for (let j = i + 1; j <= last; j++) {
      const sHit = dir > 0 ? B.l[j] <= s.stop : B.h[j] >= s.stop, tHit = dir > 0 ? B.h[j] >= tgt : B.l[j] <= tgt;
      if (sHit) { const px = j > i + 1 ? (dir > 0 ? Math.min(s.stop, B.o[j]) : Math.max(s.stop, B.o[j])) : s.stop; return fin(s, entry, tgt, risk, cost, px, j, 'stopp'); }
      if (tHit) return fin(s, entry, tgt, risk, cost, tgt, j, 'mål'); }
    if (i + P.maxBars <= B.N - 1) return fin(s, entry, tgt, risk, cost, B.c[i + P.maxBars], i + P.maxBars, 'tid');
    const cur = B.c[B.N - 1]; return { ...s, entry, tgt, risk, cost, state: 'åpen', curR: (cur - entry) * dir / risk, j: B.N - 1, bars: B.N - 1 - i };
  }
  function fin(s, entry, tgt, risk, cost, px, j, how) { const g = (px - entry) * s.dir / risk; return { ...s, entry, tgt, risk, cost, exit: px, j, tExit: null, how, state: 'lukket', grossR: g, R: g - cost, bars: j - s.i }; }

  // alle handler i en serie (én åpen handel per oppsettstype og retning om gangen)
  function simulate(B, I, from = P.warm) {
    const busy = {}, trades = [];
    for (let i = Math.max(from, 8); i < B.N; i++) {
      for (const s of triggersAt(B, I, i)) { if (busy[s.key] != null && i <= busy[s.key]) continue;
        const tr = trade(B, s); trades.push(tr); busy[s.key] = tr.state === 'lukket' ? tr.j : B.N; } }
    return trades;
  }
  function stats(trades) {
    const T = trades.filter(x => x.state === 'lukket'); const n = T.length; if (!n) return { n: 0 };
    const R = T.map(x => x.R), wins = R.filter(x => x > 0), pos = wins.reduce((a, b) => a + b, 0), neg = -R.filter(x => x <= 0).reduce((a, b) => a + b, 0);
    let cum = 0, peak = 0, dd = 0; for (const r of R) { cum += r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
    const mean = R.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(R.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
    const r2 = v => Math.round(v * 100) / 100;
    return { n, win: r2(wins.length / n), exp: r2(mean), se: r2(sd / Math.sqrt(n)), sum: r2(cum), pf: neg > 0 ? r2(pos / neg) : null, dd: r2(dd),
      cost: r2(T.reduce((a, x) => a + x.cost, 0) / n), bars: Math.round(T.reduce((a, x) => a + x.bars, 0) / n),
      tgt: r2(T.filter(x => x.how === 'mål').length / n), stop: r2(T.filter(x => x.how === 'stopp').length / n), time: r2(T.filter(x => x.how === 'tid').length / n) };
  }
  // vurdering: lønnsom bare hvis forventningen er positiv både i første 2/3 og siste 1/3 av perioden, med nok handler
  function verdict(is, oos) {
    if (!is || !oos || is.n < 20 || oos.n < 10) return 'few';
    if (is.exp > 0 && oos.exp > 0 && is.exp - 1.645 * is.se > -0.05) return 'good';
    if (is.exp < 0 && oos.exp < 0) return 'bad';
    return 'mixed';
  }

  // ---------------------------------------------------------------- live: hva gjelder nå?
  function session(t) { const d = new Date(t), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    const s = []; if (m < 8 * 60) s.push('Asia'); if (m >= 7 * 60 && m < 16 * 60) s.push('Europa'); if (m >= 13 * 60 + 30 && m < 21 * 60) s.push('USA'); return s.length ? s.join(' + ') : 'Rolig (etter USA-stengning)'; }
  function live(B, H) {
    const I = prepare(B, H), n = B.N - 1; if (n < 60) return null;
    const a = I.A[n], c = B.c[n];
    // siste 48 timer med oppsett og hvordan de gikk/går
    const recent = simulate(B, I, Math.max(P.warm, n - 191)).map(x => ({ ...x }));
    const items = [];
    // åpne og nettopp utløste
    for (const x of recent) {
      if (x.state === 'åpen') items.push({ ...x, status: 'åpen', riskPct: x.risk / x.entry * 100 });
      if (x.state === 'venter') { const risk = (x.ref - x.stop) * x.dir; items.push({ ...x, status: 'utløst', entry: x.ref, risk, tgt: x.ref + x.dir * P.rr * risk, cost: (P.fee + P.slip) * 2 * x.ref / risk }); } }
    // følg med: nær et oppsett, men ikke utløst
    const has = k => items.some(x => x.key === k);
    const watch = (type, dir, entry, stop, why) => { const key = type + (dir > 0 ? 'L' : 'S'); if (has(key)) return; const risk = (entry - stop) * dir; if (!(risk > 0)) return;
      items.push({ type, dir, key, status: 'følg', entry, stop, tgt: entry + dir * P.rr * risk, risk, riskPct: risk / entry * 100, cost: (P.fee + P.slip) * 2 * entry / risk, why }); };
    if (a) {
      let mn = Infinity, mx = -Infinity; for (let j = n - 5; j <= n; j++) { mn = Math.min(mn, B.l[j]); mx = Math.max(mx, B.h[j]); }
      if (I.bias[n] === 1) { const zone = Math.max(I.e50[n], I.vwap[n]); if (c - zone <= 0.6 * a && c - zone > -1.5 * a) watch('pb', 1, Math.max(B.h[n], I.e20[n], I.vwap[n]), mn - 0.2 * a, [`Utløses ved 15-min lukk over ${fmt(Math.max(B.h[n], I.e20[n], I.vwap[n]))}`, 'RSI bør ha vært under 45']); }
      if (I.bias[n] === -1) { const zone = Math.min(I.e50[n], I.vwap[n]); if (zone - c <= 0.6 * a && zone - c > -1.5 * a) watch('pb', -1, Math.min(B.l[n], I.e20[n], I.vwap[n]), mx + 0.2 * a, [`Utløses ved 15-min lukk under ${fmt(Math.min(B.l[n], I.e20[n], I.vwap[n]))}`, 'RSI bør ha vært over 55']); }
      const pdl = I.pdl[n], pdh = I.pdh[n];
      if (pdl != null && c - pdl >= 0 && c - pdl <= 0.5 * a) watch('sw', 1, pdl, pdl - 0.7 * a, [`Kursen er nær gårsdagens bunn ${fmt(pdl)}`, 'Utløses hvis den stikker under og en 15-min candle lukker tilbake over', 'Stoppen settes under den nye bunnen']);
      if (pdh != null && pdh - c >= 0 && pdh - c <= 0.5 * a) watch('sw', -1, pdh, pdh + 0.7 * a, [`Kursen er nær gårsdagens topp ${fmt(pdh)}`, 'Utløses hvis den stikker over og en 15-min candle lukker tilbake under', 'Stoppen settes over den nye toppen']);
      if (pdh != null && I.bias[n] >= 0 && !I.aboveB[n + 0] && B.c[n] <= pdh && pdh - c <= 0.5 * a) watch('bo', 1, pdh, pdh - 0.8 * a, [`Utløses ved 15-min lukk over ${fmt(pdh)} med volum over ${fmt(1.8 * (I.vs[n] || 0), 0)}`, 'Lukk i øvre del av candlen']);
      if (pdl != null && I.bias[n] <= 0 && !I.belowB[n] && B.c[n] >= pdl && c - pdl <= 0.5 * a) watch('bo', -1, pdl, pdl + 0.8 * a, [`Utløses ved 15-min lukk under ${fmt(pdl)} med volum over ${fmt(1.8 * (I.vs[n] || 0), 0)}`, 'Lukk i nedre del av candlen']);
    }
    // dagsrange mot snittet siste 7 dager
    const ranges = []; { let d = null, hi = 0, lo = 0; for (let i = 0; i <= n; i++) { const di = I.day0[i]; if (di !== d) { if (d != null && di !== I.day0[n]) ranges.push((hi - lo) / lo * 100); d = di; hi = B.h[i]; lo = B.l[i]; } else { hi = Math.max(hi, B.h[i]); lo = Math.min(lo, B.l[i]); } } }
    const adr = ranges.length ? ranges.slice(-7).reduce((x, y) => x + y, 0) / Math.min(7, ranges.length) : null;
    const today = (I.dHi[n] - I.dLo[n]) / I.dLo[n] * 100;
    return { I, n, t: B.t[n], price: c, atr: a, atrPct: a / c * 100, bias: I.bias[n], vwap: I.vwap[n], e20: I.e20[n], e50: I.e50[n], rsi: I.R[n], pdh: I.pdh[n], pdl: I.pdl[n],
      dayHi: I.dHi[n], dayLo: I.dLo[n], adr, today, session: session(B.t[n] + M15), items, recent };
  }
  function fmt(v, d) { if (v == null || !isFinite(v)) return '–'; const o = d != null ? { maximumFractionDigits: d } : v >= 1000 ? { maximumFractionDigits: 0 } : v >= 1 ? { maximumFractionDigits: 3 } : { maximumSignificantDigits: 4 }; return Number(v).toLocaleString('nb-NO', o); }

  const DT = { VERSION, P, TYPES, KEYS, M15, H1, bars, prepare, triggersAt, trade, simulate, stats, verdict, live, session, ema, rsi, atr };
  if (typeof module !== 'undefined' && module.exports) module.exports = DT; else root.DT = DT;
})(typeof window !== 'undefined' ? window : globalThis);
