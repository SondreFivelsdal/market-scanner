// Langsiktig kjøps-/salgsplan: fordel kjøp over tid, kjøp mer når kursen er billig mot sin egen historikk,
// og selg litt og litt når den er dyr. Ren JS (UMD) – brukes i nettleseren og i backtesten (Node).
// Kjøp: faktor på ukebeløpet etter hvor langt kursen har falt fra sin høyeste kurs hittil (fall fra toppen).
// Salg: «prisnivå» = andelen av alle tidligere dager der kurs / 200-dagers snitt (Mayer-multippel) var lavere enn i dag.
// Selges litt og litt når prisnivået er over 90 %. Bare data kjent den dagen brukes. Forskning: research/plan_bt.js.
(function (root) {
  'use strict';
  const DAY = 864e5, WEEK = 7 * DAY;
  // forhåndsbestemte regler (ikke tilpasset historikken)
  const BUY = [[-0.75, 3], [-0.60, 2], [-0.40, 1], [-0.20, 0.5]];                   // fall fra toppen under grense -> faktor på ukebeløpet (ellers 0)
  const BUYPCT = [[0.10, 3], [0.25, 2], [0.50, 1], [0.75, 0.5], [1.01, 0]];          // alternativ (testet, svakere): prisnivå
  const SELL = [[0.98, 0.20], [0.95, 0.10], [0.90, 0.05]];                          // prisnivå over grense -> andel av beholdningen som selges per uke
  const ZONES = [[0.10, 'Svært billig', 'vbuy'], [0.25, 'Billig', 'buy'], [0.50, 'Under normalt', 'mild'], [0.75, 'Over normalt', 'neutral'], [0.90, 'Dyrt', 'warm'], [1.01, 'Svært dyrt', 'sell']];
  const MINHIST = 365; // dager med M-historikk før prisnivået regnes som gyldig

  function prepare(t, c) {
    const N = c.length, sma = new Array(N).fill(null), M = new Array(N).fill(null), pct = new Array(N).fill(null);
    let s = 0; for (let i = 0; i < N; i++) { s += c[i]; if (i >= 200) s -= c[i - 200]; if (i >= 199) { sma[i] = s / 200; M[i] = c[i] / sma[i]; } }
    const sorted = []; // sorterte tidligere M-verdier (til og med i)
    const ins = v => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; } sorted.splice(lo, 0, v); return lo; };
    for (let i = 0; i < N; i++) { if (M[i] == null) continue; const r = ins(M[i]); if (sorted.length >= MINHIST) pct[i] = r / (sorted.length - 1); }
    // kvantiler av M kjent i dag -> prisnivåer for dagens 200-dagers snitt
    const q = p => { if (sorted.length < MINHIST) return null; const x = p * (sorted.length - 1), lo = Math.floor(x), hi = Math.ceil(x); return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo); };
    const last = N - 1, levels = {}; for (const p of [0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.98]) { const m = q(p); levels[p] = m != null && sma[last] ? m * sma[last] : null; }
    let ath = 0, athI = 0; const athA = new Array(N); const dd = c.map((v, i) => { if (v > ath) { ath = v; athI = i; } athA[i] = ath; return v / ath - 1; });
    return { t, c, sma, M, pct, levels, dd, ath: athA, athI, N };
  }
  const buyMult = p => { if (p == null) return 1; for (const [lim, k] of BUYPCT) if (p < lim) return k; return 0; };
  const ddMult = d => { if (d == null) return 1; for (const [lim, k] of BUY) if (d < lim) return k; return 0; };
  function factor(P, i, rule) {
    if (rule === 'mayer') { const m = P.M[i]; if (m == null) return 1; return m < 0.8 ? 3 : m < 1 ? 2 : m < 1.4 ? 1 : m < 2 ? 0.5 : 0; }
    if (rule === 'pct') return buyMult(P.pct[i]);
    return ddMult(P.dd[i]); }
  const sellShare = p => { if (p == null) return 0; for (const [lim, k] of SELL) if (p > lim) return k; return 0; };
  const zone = p => { if (p == null) return null; for (const [lim, label, cls] of ZONES) if (p < lim) return { label, cls }; return null; };

  // Simulering fra startindeks i0: ukentlig beslutning. budget fordeles over «weeks» uker.
  // mode: 'lump' (alt dag 1), 'dca' (likt hver uke), 'plan' (faktor etter prisnivå), 'plan+sell' (som plan + salg når dyrt).
  // Planen kan bruke mer enn grunnbeløpet i billige uker; ubrukt beløp ved slutten av kjøpsperioden kjøpes da (så alle bruker hele budsjettet).
  function simulate(P, i0, budget, weeks, mode, opts = {}) {
    const fee = opts.fee != null ? opts.fee : 0.001, base = budget / weeks, events = [];
    let cash = budget, coins = 0, spent = 0, bought = 0, week = 0, peak = 0, mdd = 0, sold = 0;
    const end = opts.end != null ? opts.end : P.N - 1;
    const buy = (i, amt, why) => { amt = Math.min(amt, cash); if (amt <= 0) return; const q = amt * (1 - fee) / P.c[i]; coins += q; cash -= amt; spent += amt; bought += q; events.push({ i, t: P.t[i], type: 'kjøp', amt, px: P.c[i], why }); };
    const sell = (i, share, why) => { const q = coins * share; if (q <= 0) return; const amt = q * P.c[i] * (1 - fee); coins -= q; cash += amt; sold += amt; events.push({ i, t: P.t[i], type: 'salg', amt, px: P.c[i], why, share }); };
    for (let i = i0; i <= end; i++) {
      const isWeek = (i - i0) % 7 === 0;
      if (isWeek) {
        const p = P.pct[i];
        if (mode === 'lump') { if (week === 0) buy(i, cash, 'alt på en gang'); }
        else if (week < weeks) { const k = mode === 'dca' ? 1 : factor(P, i, opts.rule); if (k > 0) buy(i, base * k, `faktor ${k}`); if (week === weeks - 1 && mode !== 'dca') buy(i, budget - spent, 'resten av budsjettet'); }
        else if (mode === 'plan+sell' && opts.rebuy) { const k = factor(P, i, opts.rule); if (k >= 2 && cash > 0) buy(i, Math.min(cash, base * k), `gjenkjøp, faktor ${k}`); }
        if (mode === 'plan+sell') { const sh = sellShare(p); if (sh > 0) sell(i, sh, `prisnivå ${Math.round(p * 100)} %`); }
        week++;
      }
      const v = cash + coins * P.c[i]; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1);
    }
    const value = cash + coins * P.c[end];
    return { mode, value, ret: value / budget - 1, avg: bought ? (spent * (1 - fee)) / bought : null, coins, cash, mdd, sold, events, start: P.t[i0], end: P.t[end] };
  }
  const PLAN = { prepare, simulate, factor, buyMult, ddMult, sellShare, zone, BUY, BUYPCT, SELL, ZONES, MINHIST, DAY, WEEK };
  if (typeof module !== 'undefined' && module.exports) module.exports = PLAN; else root.PLAN = PLAN;
})(typeof window !== 'undefined' ? window : globalThis);
