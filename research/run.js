// Kjører alle kandidater på alle coins og deler resultatet i utvikling / validering / holdout.
// Bruk: node run.js [dev|val|hold]  – holdout vises bare når det eksplisitt bes om det.
const L = require('./lib.js'), { prep, S } = require('./strategies.js');
const COINS = (process.env.COINS || 'BTC,ETH,XRP,ADA,SOL,SAND,POL').split(',');
const COST = +(process.env.COST || 0.0007), SHOW = process.argv[2] || 'val';
const preps = COINS.map(prep).filter(Boolean);
const t0 = Math.min(...preps.map(P => P.h1.B.t[0])), t1 = Math.max(...preps.map(P => P.h1.B.t[P.h1.B.N - 1]));
const cut1 = t0 + 0.6 * (t1 - t0), cut2 = t0 + 0.8 * (t1 - t0);
const per = t => t < cut1 ? 'dev' : t < cut2 ? 'val' : 'hold';
const d = t => new Date(t).toISOString().slice(0, 10);
console.log(`Data ${d(t0)} – ${d(t1)} · utvikling til ${d(cut1)} · validering til ${d(cut2)} · holdout etter · kostnad ${COST * 100} % per side`);
const rows = [];
for (const [key, st] of Object.entries(S)) for (const p of st.grid) for (const dir of [1, -1]) {
  const all = { dev: [], val: [], hold: [] }, coinDev = {};
  for (const P of preps) { const { B, sigs } = st.run(P, p, dir); const tr = L.simulate(B, sigs, COST);
    for (const x of tr) all[per(x.t)].push({ ...x, sym: P.sym }); coinDev[P.sym] = L.stats(tr.filter(x => per(x.t) === 'dev')); }
  const sd = L.stats(all.dev), sv = L.stats(all.val), sh = L.stats(all.hold);
  const coinsPos = Object.values(coinDev).filter(s => s.n >= 5 && s.exp > 0).length, coinsN = Object.values(coinDev).filter(s => s.n >= 5).length;
  rows.push({ key, p, dir, name: `${key} ${JSON.stringify(p)} ${dir > 0 ? 'LONG' : 'SHORT'}`, sd, sv, sh, coinsPos, coinsN });
}
const f = (s, k = 'exp') => s && s.n ? `${(s[k] >= 0 ? '+' : '') + s[k].toFixed(2)}R n${s.n} t${s.t.toFixed(1)} win${Math.round(s.win * 100)}% ${(s.bars).toFixed(0)}b` : '–';
rows.sort((a, b) => (b.sd.exp || -9) - (a.sd.exp || -9));
for (const r of rows) console.log(`${r.name.padEnd(48)} | DEV ${f(r.sd).padEnd(34)} | coins+ ${r.coinsPos}/${r.coinsN} | ${SHOW !== 'dev' ? 'VAL ' + f(r.sv).padEnd(34) : ''}${SHOW === 'hold' ? ' | HOLD ' + f(r.sh) : ''}`);
require('fs').writeFileSync(__dirname + `/results_${COST}.json`, JSON.stringify(rows.map(r => ({ ...r, sh: SHOW === 'hold' ? r.sh : undefined }))));
