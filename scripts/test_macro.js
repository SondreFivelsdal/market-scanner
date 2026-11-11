// Tester for makromotoren: ingen innsyn i framtiden, regler, og at manglende kilder håndteres.
// Kjør: HIST_DATA=mappe MACRO_MOCK=mappe node scripts/test_macro.js
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const M = require('./macro.js');
const DAY = 864e5; let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FEIL:', m); } else console.log('ok  ', m); };
const D = process.env.HIST_DATA, MK = process.env.MACRO_MOCK;
const coins = {}; for (const f of fs.readdirSync(D)) { const m = f.match(/^([A-Z]+)_1d\.json\.gz$/); if (m) coins[m[1]] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(D, f)))).map(r => ({ t: +r[0], h: +r[2], l: +r[3], c: +r[4] })); }
const mk = n => JSON.parse(fs.readFileSync(path.join(MK, n + '.json'), 'utf8'));
const series = { stables: mk('stables'), fng: mk('fng'), dxy: { data: mk('yahoo_DX_Y_NYB'), lag: 0 }, us10y: mk('fred_DGS10'), fed: mk('fred_DFF'), m2: mk('fred_M2SL'),
  spx: { data: mk('yahoo__GSPC') }, rut: { data: mk('yahoo__RUT') }, soxx: { data: mk('yahoo_SOXX') }, vix: { data: mk('yahoo__VIX') }, gold: { data: mk('yahoo_GC_F') }, silver: { data: mk('yahoo_SI_F') }, funding: mk('okx'), global: mk('global') };
const full = M.compute({ coins, series, debug: true });
// 1) Kausalitet: kutt ALLE data ved en dato, regn på nytt – makroklimaet den dagen skal være likt. Endre framtidige data – ingen endring.
const cutT = (a, X) => a.filter(r => r.t <= X);
for (const X of [Date.UTC(2020, 2, 15), Date.UTC(2022, 5, 1), Date.UTC(2024, 7, 5)]) {
  const S2 = {}; for (const [k, v] of Object.entries(series)) { if (Array.isArray(v)) S2[k] = cutT(v, X); else if (v && v.data) S2[k] = { ...v, data: cutT(v.data, X) }; else S2[k] = v; }
  const C2 = {}; for (const [k, v] of Object.entries(coins)) { const c = cutT(v, X); if (c.length) C2[k] = c; }
  const part = M.compute({ coins: C2, series: S2, debug: true });
  const i1 = full._dbg.cal.indexOf(X), i2 = part._dbg.cal.indexOf(X);
  const a = full._dbg.score[i1], b = part._dbg.score[i2];
  ok(a && b && Math.abs(a.s - b.s) < 1e-12 && a.n === b.n, `kuttet ${new Date(X).toISOString().slice(0, 10)}: samme makroklima (${a && a.s.toFixed(3)} / ${b && b.s.toFixed(3)})`);
  // hver komponent
  let same = true; for (const k of Object.keys(full._dbg.state)) if (full._dbg.state[k][i1] !== part._dbg.state[k][i2]) { same = false; console.log('  avvik', k, full._dbg.state[k][i1], part._dbg.state[k][i2]); }
  ok(same, '  alle komponenter like');
}
// 2) Regler
ok(M.RULE.btc200(0.03) === 1 && M.RULE.btc200(-0.03) === -1 && M.RULE.btc200(0.01) === 0, 'regel 200-dagers');
ok(M.RULE.dxy(0.02) === -1 && M.RULE.dxy(-0.02) === 1 && M.RULE.dxy(0) === 0, 'regel dollar (omvendt)');
ok(M.RULE.vix(15) === 1 && M.RULE.vix(30) === -1 && M.RULE.vix(20) === 0, 'regel VIX');
ok(M.RULE.breadth(0.6) === 1 && M.RULE.breadth(0.3) === -1, 'regel bredde');
// 3) onCal respekterer forsinkelse
const cal = [0, 1, 2, 3, 4, 5].map(i => i * DAY), oc = M.onCal(cal, [{ t: 0, v: 1 }, { t: 2 * DAY, v: 2 }], 1, 10);
ok(JSON.stringify(oc) === JSON.stringify([null, 1, 1, 2, 2, 2]), 'onCal med 1 dags forsinkelse');
// 4) manglende kilder: bare krypto
const only = M.compute({ coins, series: {} });
ok(only.now.comps.filter(c => c.err).length >= 8, 'manglende kilder vises som feil, ikke krasj');
// 5) ingen NaN i utdata
ok(!/NaN|Infinity/.test(JSON.stringify(full)), 'ingen NaN/Infinity');
// 6) hendelser: 200/300D-testene for BTC finnes og har riktig utfall mot rådata
const B = coins.BTC, ev = full.events.filter(e => e.sym === 'BTC' && e.type === 'ma');
const chk = ev.filter(e => e.r90 != null).every(e => { const t = Date.parse(e.date + 'T00:00:00Z'), j = B.findIndex(r => Math.floor(r.t / DAY) * DAY === t); return Math.abs(B[j + 90].c / B[j].c - 1 - e.r90) < 0.002; });
ok(ev.length >= 3 && chk, `BTC 200/300D-tester (${ev.length}) med utfall som stemmer`);
console.log(fails ? `${fails} FEIL` : 'Alle tester ok'); process.exit(fails ? 1 : 0);
