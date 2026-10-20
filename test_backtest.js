// Tester for backtesten: punkt-i-tid (ingen look-ahead), lik regel som live, bufring og utfall.
// Kjør: node test_backtest.js (trenger candles_1d.json i samme mappe, som test_engine.js)
const MS = require('./engine.js'), BT = require('./scripts/backtest.js'), { clearSignal } = require('./scripts/rules.js'), fs = require('fs');
const DAY = 864e5; let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FEIL:', m); } };
const D = MS.prep(JSON.parse(fs.readFileSync('candles_1d.json')));
const full = {}; for (const s of MS.COINS) if (D[s]) full[s] = MS.series(D[s]);
// 1) kuttet serie = serie regnet på nytt på kuttede data (alle felt)
for (const s of MS.COINS) { const N = D[s].t.length; for (const n of [300, Math.floor(N / 2), N - 40]) { if (n < 260) continue;
  const a = MS.sliceS(full[s], n), b = MS.series(MS.sliceD(D[s], 0, n));
  ok(JSON.stringify(a) === JSON.stringify(b), `${s} sliceS avviker fra series ved n=${n}`); } }
// 2) bygg rader for et kort vindu og sammenlign med en helt uavhengig kjøring på kuttede data
const T1 = D.BTC.t[D.BTC.t.length - 400];
const Dcut = {}; for (const s in D) { const k = D[s].t.filter(t => t <= T1 + 20 * DAY).length; if (k) Dcut[s] = MS.sliceD(D[s], 0, k); }
const fullCut = {}; for (const s in Dcut) fullCut[s] = MS.sliceS(full[s], Dcut[s].t.length);
const res = BT.computeRows(Dcut, fullCut, { rows: {}, last: T1 - DAY }, Date.now());
ok(res.complete, 'ikke ferdig');
for (const T of [T1, T1 + 7 * DAY, T1 + 20 * DAY]) {
  const Dc = {}; for (const s in D) { const k = D[s].t.filter(t => t <= T).length; if (k >= 260) Dc[s] = MS.sliceD(D[s], 0, k); }
  const R = MS.run(Dc, {}); // ingen bufring, ingen lite-modus, bare data kjent på dag T
  for (const c of R.coins) { const row = (res.rows[c.sym] || []).find(r => r[0] === T);
    ok(row, `${c.sym} mangler rad for ${MS.dstr(T)}`); if (!row) continue;
    ok(row[1] === { buy: 'b', wait: 'w', sell: 's', none: 'n' }[c.status.code] && row[2] === c.score, `${c.sym} ${MS.dstr(T)}: backtest ${row[1]}/${row[2]} mot ${c.status.code}/${c.score}`);
    // varsel-regelen: samme som live gitt gårsdagens status
    const prev = res.rows[c.sym].find(r => r[0] === T - DAY);
    if (prev) { const cl = clearSignal(c, { b: 'buy', w: 'wait', s: 'sell', n: 'none' }[prev[1]], true); ok((cl ? cl.dir : 0) === row[3], `${c.sym} ${MS.dstr(T)} tydelig signal avviker`); } } }
// 3) look-ahead: endring av fremtidige candles skal ikke endre radene
const Dfut = {}; for (const s in Dcut) { const x = MS.sliceD(Dcut[s], 0, Dcut[s].t.length); const k = x.t.findIndex(t => t > T1 + 10 * DAY); if (k > 0) for (let i = k; i < x.c.length; i++) { x.c[i] *= 3; x.h[i] *= 3; x.l[i] *= 3; x.o[i] *= 3; } Dfut[s] = x; }
const fullFut = {}; for (const s in Dfut) fullFut[s] = MS.series(Dfut[s]);
const res2 = BT.computeRows(Dfut, fullFut, { rows: {}, last: T1 - DAY }, Date.now());
for (const s in res.rows) { const a = res.rows[s].filter(r => r[0] <= T1 + 10 * DAY), b = res2.rows[s].filter(r => r[0] <= T1 + 10 * DAY); ok(JSON.stringify(a) === JSON.stringify(b), `${s} look-ahead: rader før kuttet endret seg`); }
// 4) mål/stopp-løpet
const Dt = { c: [100, 100, 100], h: [100, 111, 100], l: [100, 89, 100] }; Dt.c.length = 40; Dt.h.length = 40; Dt.l.length = 40; for (let i = 3; i < 40; i++) { Dt.c[i] = 100; Dt.h[i] = 100; Dt.l[i] = 100; }
ok(BT.race(Dt, 0, 1, 110, 90) === 'stop', 'samme dag: stopp skal telle først');
Dt.l[1] = 95; ok(BT.race(Dt, 0, 1, 110, 90) === 'tgt', 'mål nådd');
Dt.h[1] = 100; ok(BT.race(Dt, 0, 1, 110, 90) === 'none', 'ingen');
// 5) oppsummering uten NaN
const S = BT.summarise(Dcut, res.rows); ok(!/NaN|Infinity/.test(JSON.stringify(S)), 'NaN i oppsummering');
console.log(fails ? fails + ' feil' : 'Alle backtest-tester OK'); process.exit(fails ? 1 : 0);
