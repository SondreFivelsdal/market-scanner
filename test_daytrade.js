// Tester for daytrading-motoren (site/daytrade.js): kausalitet, handelssimulering og live-status.
// Kjør: node test_daytrade.js [fil.json]  (fil med { SYM: { m15: [...klines], h1: [...klines] } }; uten fil lages tilfeldige data)
const DT = require('./site/daytrade.js'), fs = require('fs');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FEIL:', m); } };
function synth(seed = 1, n = 6000) { let x = seed; const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const m15 = [], t0 = Date.UTC(2025, 0, 1); let p = 100;
  for (let i = 0; i < n; i++) { const o = p, c = o * Math.exp(g() * 0.004), h = Math.max(o, c) * (1 + Math.abs(g()) * 0.002), l = Math.min(o, c) * (1 - Math.abs(g()) * 0.002); m15.push([t0 + i * DT.M15, o, h, l, c, 1000 * (1 + rnd())]); p = c; }
  const h1 = []; for (let i = 0; i + 3 < m15.length; i += 4) { const a = m15.slice(i, i + 4); h1.push([a[0][0], a[0][1], Math.max(...a.map(r => r[2])), Math.min(...a.map(r => r[3])), a[3][4], a.reduce((s, r) => s + r[5], 0)]); }
  return { m15, h1 }; }
const data = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : { A: synth(1), B: synth(2) };
for (const sym in data) {
  const B = DT.bars(data[sym].m15), H = DT.bars(data[sym].h1), I = DT.prepare(B, H);
  // 1) kausalitet: oppsett på candle i er de samme når alle senere candles (15m og 1t) fjernes
  let checked = 0, trig = 0;
  for (let k = 0; k < 60; k++) { const i = 400 + Math.floor((B.N - 420) * k / 60); const tEnd = B.t[i] + DT.M15;
    const m = data[sym].m15.filter(r => +r[0] <= B.t[i]), h = data[sym].h1.filter(r => +r[0] + DT.H1 <= tEnd);
    const B2 = DT.bars(m), I2 = DT.prepare(B2, DT.bars(h));
    const a = JSON.stringify(DT.triggersAt(B, I, i)), b = JSON.stringify(DT.triggersAt(B2, I2, i));
    ok(a === b, `${sym} oppsett på i=${i} avhenger av framtiden`); checked++; if (a !== '[]') trig++;
    for (const f of ['e20', 'e50', 'R', 'A', 'vwap', 'pdh', 'pdl', 'bias']) ok(I[f][i] === I2[f][i], `${sym} ${f} avviker på i=${i}`); }
  // finn også alle candles med oppsett og test noen av dem
  const all = []; for (let i = 300; i < B.N; i++) if (DT.triggersAt(B, I, i).length) all.push(i);
  for (const i of all.filter((_, j) => j % Math.max(1, Math.floor(all.length / 25)) === 0)) { const m = data[sym].m15.filter(r => +r[0] <= B.t[i]), h = data[sym].h1.filter(r => +r[0] + DT.H1 <= B.t[i] + DT.M15);
    const B2 = DT.bars(m); ok(JSON.stringify(DT.triggersAt(B, I, i)) === JSON.stringify(DT.triggersAt(B2, DT.prepare(B2, DT.bars(h)), i)), `${sym} oppsett i=${i} ikke kausalt`); trig++; }
  ok(all.length > 20, `${sym} for få oppsett (${all.length})`);
  console.log(sym, 'kausalitet OK på', checked + trig, 'kontroller,', all.length, 'oppsett totalt');
  // 2) handler: én åpen per type/retning, utfall stemmer med rådata
  const T = DT.simulate(B, I);
  for (const k of DT.KEYS) { const t = T.filter(x => x.key === k); for (let j = 1; j < t.length; j++) ok(t[j].i > t[j - 1].j, `${sym} ${k} overlappende handler`); }
  for (const x of T.filter(x => x.state === 'lukket').slice(0, 200)) {
    ok(x.entry === B.o[x.i + 1], 'inngang = neste åpning');
    const r = (x.exit - x.entry) * x.dir / x.risk; ok(Math.abs(r - x.grossR) < 1e-9 && Math.abs(x.R - (x.grossR - x.cost)) < 1e-9, 'R-regning');
    ok(x.how !== 'mål' || Math.abs(x.grossR - DT.P.rr) < 1e-9, 'mål = 2R'); ok(x.how !== 'stopp' || x.grossR <= -1 + 1e-9, 'stopp ≤ −1R');
    ok(x.bars <= DT.P.maxBars, 'tidsstopp'); }
  // 3) live uten NaN
  const L = DT.live(B, H); ok(L && !/NaN/.test(JSON.stringify({ ...L, I: null })), `${sym} live har NaN`);
  ok(L.items.every(x => x.stop != null && (x.dir > 0 ? x.stop < (x.entry || x.ref) : x.stop > (x.entry || x.ref))), `${sym} stopp på feil side`);
}
// 4) håndlaget handel: stopp og mål samme candle → stopp; gap forbi stopp → åpning
{ const mk = rows => DT.bars(rows.map((r, i) => [i * DT.M15, ...r, 1])), s = { i: 0, dir: 1, stop: 98, key: 'pbL', ref: 100 };
  ok(DT.trade(mk([[100, 100, 100, 100], [100, 105, 97, 100]]), s).how === 'stopp', 'samme candle: stopp først');
  const g = DT.trade(mk([[100, 100, 100, 100], [100, 101, 99.5, 100], [96, 96, 95, 95]]), s); ok(g.how === 'stopp' && g.exit === 96, 'gap forbi stopp fylles på åpning');
  const w = DT.trade(mk([[100, 100, 100, 100], [100, 104.1, 99, 104]]), s); ok(w.how === 'mål' && Math.abs(w.grossR - 2) < 1e-9, 'mål 2R');
  ok(DT.trade(mk([[100, 100, 100, 100], [97, 97, 97, 97]]), s).state === 'ugyldig', 'åpner under stopp = ugyldig'); }
console.log(fails ? fails + ' feil' : 'Alle daytrade-tester OK'); process.exit(fails ? 1 : 0);
