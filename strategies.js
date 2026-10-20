// Kandidat-oppsett. Hver funksjon får ctx (forberedte serier for én coin) og params, og returnerer signaler for simulate().
// Alle betingelser på bar i bruker bare data til og med i. Parametergitteret er bevisst lite og satt på forhånd.
const L = require('./lib.js');
const DT = require('../site/daytrade.js');

function prep(sym) {
  const m15 = L.load(sym, '15m'), h1 = L.load(sym, '1h'), h4 = L.load(sym, '4h'); if (!m15 || !h1 || !h4) return null;
  const d1 = L.resample(h1, 864e5);
  const P = {};
  for (const [k, B] of Object.entries({ m15, h1, h4 })) P[k] = { B, A: L.atr(B, 14), e20: L.ema(B.c, 20), e50: L.ema(B.c, 50), e200: L.ema(B.c, 200), r2: L.rsi(B.c, 2), r14: L.rsi(B.c, 14), s5: L.sma(B.c, 5) };
  const dE50 = L.ema(d1.c, 50), dE100 = L.ema(d1.c, 100);
  // daglig regime: lukk over/under EMA50/100 på dagsgrafen (kjent først etter dagslukk)
  const regime = arr => arr.map((v, j) => v == null ? 0 : d1.c[j] > v ? 1 : -1);
  for (const k of ['m15', 'h1', 'h4']) { P[k].reg50 = L.align(P[k].B, d1, regime(dE50)); P[k].reg100 = L.align(P[k].B, d1, regime(dE100)); }
  // 4t-trend for 1t-serien (som 1t-trenden i dagens motor, men en tidsramme opp)
  const h4tr = P.h4.B.c.map((c, j) => { const e50 = P.h4.e50[j], e20 = P.h4.e20[j], p = P.h4.e50[j - 3]; if (e50 == null || p == null) return 0; return c > e50 && e20 > e50 && e50 > p ? 1 : c < e50 && e20 < e50 && e50 < p ? -1 : 0; });
  P.h1.tr4 = L.align(P.h1.B, P.h4.B, h4tr);
  P.d1 = d1; P.sym = sym; return P;
}

const S = {};
// 1) Trendfølgende utbrudd (Donchian) med ATR-stopp og glidende stopp
S.donch = { label: 'Utbrudd fra N-bars kanal (trendfølging)', grid: [{ tf: 'h1', n: 20 }, { tf: 'h1', n: 55 }, { tf: 'h4', n: 20 }, { tf: 'h4', n: 55 }].flatMap(g => [{ ...g, reg: 0 }, { ...g, reg: 50 }]),
  run(P, p, dir) { const X = P[p.tf], B = X.B, D = L.donch(B, p.n), out = [];
    for (let i = 210; i < B.N - 1; i++) { const a = X.A[i]; if (!a) continue; const rg = p.reg ? X['reg' + p.reg][i] : dir;
      if (rg !== dir) continue;
      if (dir > 0 && B.c[i] > D.hi[i] && B.c[i - 1] <= D.hi[i - 1]) out.push({ i, dir, stop: B.c[i] - 2 * a, trail: { k: 3, A: X.A } });
      if (dir < 0 && B.c[i] < D.lo[i] && B.c[i - 1] >= D.lo[i - 1]) out.push({ i, dir, stop: B.c[i] + 2 * a, trail: { k: 3, A: X.A } }); }
    return { B, sigs: out }; } };
// 2) Pullback i trend på 1t med 4t-trend (dagens pb-oppsett én tidsramme opp)
S.pb1h = { label: 'Pullback i trend (1t, 4t-trend)', grid: [{ exit: '2R' }, { exit: 'trail' }].flatMap(g => [{ ...g, reg: 0 }, { ...g, reg: 50 }]),
  run(P, p, dir) { const X = P.h1, B = X.B, out = [];
    for (let i = 210; i < B.N - 1; i++) { const a = X.A[i]; if (!a || X.tr4[i] !== dir) continue; if (p.reg && X.reg50[i] !== dir) continue;
      const zone = X.e50[i]; let ext = dir > 0 ? Infinity : -Infinity, rr = dir > 0 ? Infinity : -Infinity;
      for (let j = i - 6; j < i; j++) { ext = dir > 0 ? Math.min(ext, B.l[j]) : Math.max(ext, B.h[j]); rr = dir > 0 ? Math.min(rr, X.r14[j]) : Math.max(rr, X.r14[j]); }
      const touch = dir > 0 ? ext <= zone + 0.25 * a : ext >= zone - 0.25 * a, cool = dir > 0 ? rr < 45 : rr > 55;
      const trig = dir > 0 ? B.c[i] > B.h[i - 1] && B.c[i] > X.e20[i] : B.c[i] < B.l[i - 1] && B.c[i] < X.e20[i];
      if (touch && cool && trig) { const stop = ext - dir * 0.3 * a; out.push(p.exit === '2R' ? { i, dir, stop, tgtR: 2, maxBars: 48 } : { i, dir, stop, trail: { k: 3, A: X.A }, maxBars: 240 }); } }
    return { B, sigs: out }; } };
// 3) Kort mean reversion: RSI(2) ekstrem mot dagstrenden (kjøp dipp i opptrend / selg rekyl i nedtrend)
S.rsi2 = { label: 'Kjøp dippen i opptrend (RSI 2)', grid: [{ tf: 'h1', lv: 10 }, { tf: 'h1', lv: 5 }, { tf: 'h4', lv: 10 }, { tf: 'h4', lv: 5 }],
  run(P, p, dir) { const X = P[p.tf], B = X.B, out = [];
    for (let i = 210; i < B.N - 1; i++) { const a = X.A[i]; if (!a || X.reg100[i] !== dir) continue;
      const hit = dir > 0 ? X.r2[i] < p.lv : X.r2[i] > 100 - p.lv; if (!hit) continue;
      out.push({ i, dir, stop: B.c[i] - dir * 2.5 * a, maxBars: p.tf === 'h1' ? 24 : 12, exitFn: j => dir > 0 ? B.c[j] > X.s5[j] : B.c[j] < X.s5[j] }); }
    return { B, sigs: out }; } };
// 4) Utbrudd fra Asia-økten (00–08 UTC), handles 08–16 UTC, ut senest 23:45 UTC
S.asia = { label: 'Utbrudd fra natt-rangen (Asia-økten)', grid: [{ t: 1.5 }, { t: 2 }].flatMap(g => [{ ...g, reg: 0 }, { ...g, reg: 50 }]),
  run(P, p, dir) { const X = P.m15, B = X.B, out = []; let day = null, hi = -Infinity, lo = Infinity, done = false;
    for (let i = 210; i < B.N - 1; i++) { const d = Math.floor(B.t[i] / 864e5) * 864e5, hr = (B.t[i] - d) / 36e5;
      if (d !== day) { day = d; hi = -Infinity; lo = Infinity; done = false; }
      if (hr < 8) { hi = Math.max(hi, B.h[i]); lo = Math.min(lo, B.l[i]); continue; }
      if (done || hr >= 16 || !isFinite(hi)) continue; if (p.reg && X.reg50[i] !== dir) continue;
      const w = (hi - lo) / B.c[i]; if (w < 0.004) continue;
      if (dir > 0 && B.c[i] > hi) { done = true; const endBars = Math.round((d + 864e5 - 9e5 - B.t[i]) / 9e5); out.push({ i, dir, stop: (hi + lo) / 2, tgtR: p.t, maxBars: endBars }); }
      if (dir < 0 && B.c[i] < lo) { done = true; const endBars = Math.round((d + 864e5 - 9e5 - B.t[i]) / 9e5); out.push({ i, dir, stop: (hi + lo) / 2, tgtR: p.t, maxBars: endBars }); } }
    return { B, sigs: out }; } };
// 5) Dagens oppsett i appen (15 min), som referanse
S.dt = { label: 'Dagens daytrading-oppsett (15 min)', grid: ['pb', 'sw', 'bo'].map(type => ({ type })),
  run(P, p, dir) { const B0 = P.m15.B, B = DT.bars(B0.t.map((t, i) => [t, B0.o[i], B0.h[i], B0.l[i], B0.c[i], B0.v[i]])), H0 = P.h1.B, H = DT.bars(H0.t.map((t, i) => [t, H0.o[i], H0.h[i], H0.l[i], H0.c[i], H0.v[i]]));
    const I = DT.prepare(B, H), out = [];
    for (let i = 220; i < B.N - 1; i++) for (const s of DT.triggersAt(B, I, i)) if (s.type === p.type && s.dir === dir) out.push({ i, dir, stop: s.stop, tgtR: 2, maxBars: 24 });
    return { B: B0, sigs: out }; } };
module.exports = { prep, S };
