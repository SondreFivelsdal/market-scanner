// Tester for Syklus-motoren: formler, ingen innsyn i framtiden, og at manglende kilder håndteres.
// Kjør: EVENTS_MOCK=mappe node scripts/test_cycle.js
'use strict';
const fs = require('fs'), path = require('path'); const C = require('./cycle.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FEIL:', m); } else console.log('ok  ', m); };
const mk = n => JSON.parse(fs.readFileSync(path.join(process.env.EVENTS_MOCK, n + '.json'), 'utf8'));
const btc = mk('bitstamp_btc'), cm = mk('coinmetrics'), wiki = mk('wiki'), spx = mk('yahoo__GSPC'), gold = mk('yahoo_GC_F'), oil = mk('fred_DCOILWTICO');
const full = C.compute({ btc, spx, gold, oil, cm, wiki, now: Date.UTC(2026, 10, 16) });
// 1) realisert pris = markedsverdi / MVRV / antall
const o = cm[cm.length - 1]; ok(Math.abs(full.now.rp / (o.mcap / o.mvrv / o.sply) - 1) < 1e-4, 'realisert pris = markedsverdi / MVRV / antall');
// 2) prosentil bare fra fortiden
const p = C.expandingPct([5, 1, 3, 2, 4], 2); ok(p[0] === null && p[1] === null && p[2] === 0.5 && Math.abs(p[3] - 1 / 3) < 1e-9 && p[4] === 0.75, 'prosentil bruker bare tidligere verdier');
// 3) ingen innsyn i framtiden: kutt alle data ved en dato → samme risiko, MVRV-Z og 200W for uka
for (const cut of ['2021-06-01', '2023-09-01']) { const X = Math.floor(Date.parse(cut) / 864e5), c = a => a.filter(x => x.d <= X);
  const part = C.compute({ btc: c(btc), spx: c(spx), gold: c(gold), oil: c(oil), cm: c(cm), wiki: c(wiki), now: (X + 1) * 864e5 });
  const pl = part.w[part.w.length - 2], fr = full.w.find(r => r[0] === pl[0]);
  ok(fr && JSON.stringify(fr.slice(0, 7)) === JSON.stringify(pl.slice(0, 7)), `kuttet ${cut}: samme verdier for uka ${new Date(pl[0] * 864e5).toISOString().slice(0, 10)}`); }
// 4) uten on-chain og Wikipedia: ingen krasj
const bare = C.compute({ btc, now: Date.UTC(2026, 10, 16) }); ok(bare.now.rp == null && bare.flows.length === 0 && bare.wiki.length === 0 && bare.now.vs200 != null, 'fungerer uten on-chain og Wikipedia');
// 5) røde uker: teller ukelukk lavere enn uka før
const W = C.weekly(btc); let red = 0; for (let k = W.length - 1; k > 0 && W[k].v < W[k - 1].v; k--) red++; ok(full.now.red === red, `røde uker på rad = ${red}`);
ok(!/NaN|Infinity/.test(JSON.stringify(full)), 'ingen NaN/Infinity');
console.log(fails ? `${fails} FEIL` : 'Alle tester ok'); process.exit(fails ? 1 : 0);
