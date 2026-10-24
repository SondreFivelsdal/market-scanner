// Indikatorer, markedsregime og regelbasert vurdering per tidsramme. Ren JS (UMD) – brukes i nettleseren og i tester (Node).
// Alt regnes bare på LUKKEDE candles (den siste, pågående candlen tas ikke med i signaler).
// «Regelscore» er en telling av enkle regler (−5 … +5), IKKE en sannsynlighet. Oppsettene er ikke historisk validert
// (se research/README.md: korte oppsett tapte etter gebyr i våre tester).
(function (root) {
  'use strict';
  const ema = (a, n) => { const o = new Array(a.length).fill(null), k = 2 / (n + 1); let e = null, s = 0;
    for (let i = 0; i < a.length; i++) { if (i < n - 1) { s += a[i]; continue; } if (e == null) { s += a[i]; e = s / n; } else e = a[i] * k + e * (1 - k); o[i] = e; } return o; };
  const sma = (a, n) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  function rma(a, n) { const o = new Array(a.length).fill(null); let r = null, s = 0, c = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) continue;
    if (r == null) { s += v; c++; if (c === n) { r = s / n; o[i] = r; } } else { r = (r * (n - 1) + v) / n; o[i] = r; } } return o; }
  function rsi(c, n = 14) { const up = [null], dn = [null]; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; up.push(Math.max(d, 0)); dn.push(Math.max(-d, 0)); }
    const au = rma(up, n), ad = rma(dn, n); return c.map((_, i) => au[i] == null ? null : ad[i] === 0 ? (au[i] === 0 ? 50 : 100) : 100 - 100 / (1 + au[i] / ad[i])); }
  function macd(c, f = 12, s = 26, g = 9) { const a = ema(c, f), b = ema(c, s), m = c.map((_, i) => a[i] != null && b[i] != null ? a[i] - b[i] : null);
    const st = m.findIndex(v => v != null), sig = new Array(c.length).fill(null); if (st >= 0) { const e = ema(m.slice(st), g); e.forEach((v, j) => { sig[st + j] = v; }); }
    return { macd: m, signal: sig, hist: m.map((v, i) => v != null && sig[i] != null ? v - sig[i] : null) }; }
  const trs = B => B.map((b, i) => i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - B[i - 1].c), Math.abs(b.l - B[i - 1].c)));
  const atr = (B, n = 14) => rma(trs(B), n);
  function adx(B, n = 14) { const pd = [null], md = [null]; for (let i = 1; i < B.length; i++) { const u = B[i].h - B[i - 1].h, d = B[i - 1].l - B[i].l; pd.push(u > d && u > 0 ? u : 0); md.push(d > u && d > 0 ? d : 0); }
    const tr = rma(trs(B).map((v, i) => i === 0 ? null : v), n), p = rma(pd, n), m = rma(md, n);
    const dx = B.map((_, i) => { if (tr[i] == null || !tr[i]) return null; const P = 100 * p[i] / tr[i], M = 100 * m[i] / tr[i]; return P + M ? 100 * Math.abs(P - M) / (P + M) : 0; });
    const a = rma(dx, n); return { adx: a, pdi: B.map((_, i) => tr[i] ? 100 * p[i] / tr[i] : null), mdi: B.map((_, i) => tr[i] ? 100 * m[i] / tr[i] : null) }; }
  function boll(c, n = 20, k = 2) { const m = sma(c, n), up = [], lo = [], w = []; for (let i = 0; i < c.length; i++) { if (m[i] == null) { up.push(null); lo.push(null); w.push(null); continue; }
    let s = 0; for (let j = i - n + 1; j <= i; j++) s += (c[j] - m[i]) ** 2; const sd = Math.sqrt(s / n); up.push(m[i] + k * sd); lo.push(m[i] - k * sd); w.push(2 * k * sd / m[i]); } return { mid: m, up, lo, width: w }; }
  // VWAP som nullstilles ved hver UTC-dag (for intradag-tidsrammer)
  function vwap(B) { let pv = 0, vv = 0, day = null; return B.map(b => { const d = Math.floor(b.t / 864e5); if (d !== day) { day = d; pv = 0; vv = 0; } const tp = (b.h + b.l + b.c) / 3; pv += tp * b.v; vv += b.v; return vv ? pv / vv : null; }); }
  // andel av de siste «look» verdiene som er lavere enn den siste (0–1)
  function pctRank(a, i, look) { const v = a[i]; if (v == null) return null; let n = 0, lo = 0; for (let j = Math.max(0, i - look); j < i; j++) { if (a[j] == null) continue; n++; if (a[j] < v) lo++; } return n >= 30 ? lo / n : null; }
  // støtte/motstand: svingpunkter (k candles på hver side), samlet innenfor 0,5 ATR, vektet etter antall berøringer
  function levels(B, end, A, k = 3, look = 300) {
    const piv = []; for (let i = Math.max(k, end - look); i <= end - k; i++) { let hi = true, lo = true;
      for (let j = i - k; j <= i + k; j++) { if (j === i) continue; if (B[j].h >= B[i].h) hi = false; if (B[j].l <= B[i].l) lo = false; }
      if (hi) piv.push({ p: B[i].h, t: B[i].t }); if (lo) piv.push({ p: B[i].l, t: B[i].t }); }
    const tol = (A || B[end].c * 0.01) * 0.5; piv.sort((a, b) => a.p - b.p); const cl = [];
    for (const x of piv) { const l = cl[cl.length - 1]; if (l && Math.abs(x.p - l.sum / l.n) <= tol) { l.sum += x.p; l.n++; l.last = Math.max(l.last, x.t); } else cl.push({ sum: x.p, n: 1, last: x.t }); }
    return cl.map(l => ({ p: l.sum / l.n, n: l.n, last: l.last })); }

  // Vurdering av én tidsramme. B: candles stigende i tid; closedEnd: indeks til siste LUKKEDE candle.
  function assess(B, closedEnd) {
    const end = closedEnd == null ? B.length - 1 : closedEnd;
    if (end < 60) return { ok: false, why: `For lite data (${end + 1} lukkede candles, trenger minst 60).` };
    const S = B.slice(0, end + 1), c = S.map(b => b.c), e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200), R = rsi(c), M = macd(c), A = atr(S), D = adx(S), BB = boll(c);
    const i = end, px = c[i], slope = e50[i - 10] ? e50[i] / e50[i - 10] - 1 : 0;
    const rules = [
      { k: 'Kurs over EMA 50', v: Math.sign(px - e50[i]) },
      { k: 'EMA 20 over EMA 50', v: Math.sign(e20[i] - e50[i]) },
      { k: 'EMA 50 stiger (10 candles)', v: Math.sign(slope) },
      { k: 'MACD-histogram over 0', v: Math.sign(M.hist[i]) },
      { k: 'RSI over 50', v: Math.sign(R[i] - 50) }];
    const score = rules.reduce((s, r) => s + r.v, 0), bias = score >= 3 ? 'long' : score <= -3 ? 'short' : 'neutral';
    const atrP = A.map((v, j) => v != null ? v / c[j] : null), volPct = pctRank(atrP, i, 300), adxV = D.adx[i];
    let regime, rcls; if (adxV != null && adxV >= 25 && bias !== 'neutral') { regime = bias === 'long' ? 'Trend opp' : 'Trend ned'; rcls = bias === 'long' ? 'pos' : 'neg'; }
    else if (adxV != null && adxV < 20) { regime = 'Sidelengs (range)'; rcls = 'neu'; } else { regime = 'Svak/uklar trend'; rcls = 'neu'; }
    const vol = volPct == null ? null : volPct >= 0.9 ? 'Høy volatilitet' : volPct <= 0.1 ? 'Svært lav volatilitet (kompresjon)' : null;
    const L = levels(S, i, A[i]); const below = L.filter(l => l.p < px).sort((a, b) => b.p - a.p), above = L.filter(l => l.p > px).sort((a, b) => a.p - b.p);
    let vr = null; { let s = 0, n = 0; for (let j = i - 20; j < i; j++) if (j >= 0) { s += S[j].v; n++; } vr = n && s ? S[i].v / (s / n) : null; }
    return { ok: true, t: S[i].t, px, score, bias, rules, rsi: R[i], macdHist: M.hist[i], adx: adxV, atr: A[i], atrPct: atrP[i], volPct, vol, regime, rcls,
      ema20: e20[i], ema50: e50[i], ema200: e200[i], bbWidth: BB.width[i], volRatio: vr, support: below.slice(0, 2), resist: above.slice(0, 2), n: end + 1 };
  }
  // Markører der regelscoren skifter til long eller short (samme regel som over, regnet bakover uten å se fremover)
  function biasSeries(B, closedEnd) {
    const end = closedEnd == null ? B.length - 1 : closedEnd, S = B.slice(0, end + 1), c = S.map(b => b.c), e20 = ema(c, 20), e50 = ema(c, 50), R = rsi(c), M = macd(c), out = [];
    for (let i = 60; i <= end; i++) { const sl = e50[i - 10] ? e50[i] / e50[i - 10] - 1 : 0;
      const s = Math.sign(c[i] - e50[i]) + Math.sign(e20[i] - e50[i]) + Math.sign(sl) + Math.sign(M.hist[i]) + Math.sign(R[i] - 50);
      out.push({ t: S[i].t, b: s >= 3 ? 'long' : s <= -3 ? 'short' : 'neutral' }); }
    return out; }
  // Hull i dataene: avstand mellom candles større enn intervallet
  function gaps(B, ms) { const g = []; for (let i = 1; i < B.length; i++) if (B[i].t - B[i - 1].t > ms * 1.5) g.push({ from: B[i - 1].t, to: B[i].t, missing: Math.round((B[i].t - B[i - 1].t) / ms) - 1 }); return g; }

  // Samlet konklusjon fra flere tidsrammer. tf: { '1h': assess, '4h': assess, '1d': assess }, lt: langsiktig signal ('buy'|'hold'|'sell'|'weak'|null)
  // Returnerer en av: Mulig long, Mulig short, Akkumuler gradvis, Hold / følg med, Unngå, For lite data – med begrunnelse og nivåer.
  function conclude(tf, lt, px) {
    const h1 = tf['1h'], h4 = tf['4h'], d1 = tf['1d'], ok = [h1, h4, d1].filter(x => x && x.ok);
    if (ok.length < 3) return { code: 'nodata', label: 'For lite data', why: ['Mangler data for én eller flere tidsrammer (1t, 4t, 1d). Ingen vurdering.'] };
    const why = [], warn = [], biasTxt = { long: 'opp', short: 'ned', neutral: 'nøytral' };
    why.push(`Retning: 1d ${biasTxt[d1.bias]} (${fmtS(d1.score)}), 4t ${biasTxt[h4.bias]} (${fmtS(h4.score)}), 1t ${biasTxt[h1.bias]} (${fmtS(h1.score)}).`);
    why.push(`Regime 4t: ${h4.regime}${h4.adx != null ? ` (ADX ${Math.round(h4.adx)})` : ''}${h4.vol ? ' · ' + h4.vol : ''}.`);
    if (h4.vol === 'Høy volatilitet' || d1.vol === 'Høy volatilitet') warn.push('Volatiliteten er blant de 10 % høyeste – større sving og større risiko for at stopp treffes.');
    const aligned = d1.bias === h4.bias && h4.bias === h1.bias && d1.bias !== 'neutral';
    const conflict = (d1.bias === 'long' && h4.bias === 'short') || (d1.bias === 'short' && h4.bias === 'long');
    const setup = aligned ? plan(h4, d1.bias === 'long' ? 1 : -1, px) : null;
    if (aligned && setup && setup.rr >= 1.5) {
      const L = d1.bias === 'long';
      if (!L) warn.push('Short krever en plattform med short/derivater (ikke mulig på vanlig spot-kjøp, f.eks. Firi).');
      if (L ? h4.rsi > 75 : h4.rsi < 25) warn.push(`RSI 4t er ${Math.round(h4.rsi)} – bevegelsen er allerede strukket; vent gjerne på tilbaketrekk.`);
      return { code: L ? 'long' : 'short', label: L ? 'Mulig long' : 'Mulig short', why, warn, setup }; }
    if (aligned && setup) { why.push(`Alle tidsrammer peker ${biasTxt[d1.bias]}, men risiko/gevinst til nærmeste ${d1.bias === 'long' ? 'motstand' : 'støtte'} er bare ${setup.rr.toFixed(1).replace('.', ',')} : 1 (krever minst 1,5).`); }
    if (lt === 'buy' && d1.bias !== 'short') { why.push('Langsiktig: kursen er langt under toppen (kjøpssone i langsiktig plan). Dagstrenden er ikke negativ.'); return { code: 'accum', label: 'Akkumuler gradvis', why, warn, setup }; }
    if (conflict && (h4.vol === 'Høy volatilitet')) { why.push('Dags- og 4t-trend peker motsatt vei samtidig som volatiliteten er høy.'); return { code: 'avoid', label: 'Unngå', why, warn, setup }; }
    if (!aligned) why.push('Tidsrammene er ikke enige – ingen tydelig mulighet akkurat nå.');
    return { code: 'hold', label: 'Hold / følg med', why, warn, setup };
  }
  const fmtS = s => (s > 0 ? '+' : s < 0 ? '−' : '') + Math.abs(s);
  // Inngang, invalidering og mål fra 4t-nivåer. dir 1 = long, −1 = short.
  function plan(a, dir, px) {
    const A = a.atr; if (!A || !px) return null;
    const near = dir > 0 ? a.support[0] : a.resist[0];
    let stop = near ? near.p - dir * 0.25 * A : px - dir * 2 * A;
    const dist = Math.abs(px - stop); if (dist < A) stop = px - dir * A; if (dist > 4 * A) stop = px - dir * 4 * A;
    const tg = (dir > 0 ? a.resist : a.support).map(l => l.p); const t1 = tg[0] != null ? tg[0] : px + dir * 2 * Math.abs(px - stop), t2 = tg[1] != null ? tg[1] : null;
    const risk = Math.abs(px - stop), rr = risk ? (dir * (t1 - px)) / risk : 0;
    return { dir, entry: px, stop, t1, t2, rr, t1src: tg[0] != null ? 'nærmeste ' + (dir > 0 ? 'motstand' : 'støtte') + ' (4t)' : '2 × risiko (ingen nivå funnet)', riskPct: risk / px };
  }
  const RG = { ema, sma, rsi, macd, atr, adx, boll, vwap, levels, assess, biasSeries, gaps, conclude, plan, pctRank };
  if (typeof module !== 'undefined' && module.exports) module.exports = RG; else root.RG = RG;
})(typeof window !== 'undefined' ? window : globalThis);
