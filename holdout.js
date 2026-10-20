// Endelig test på holdout (siste 20 %, ikke brukt til noe valg). Kjøres én gang for de forhåndsvalgte kandidatene.
const L = require('./lib.js'), { prep, S } = require('./strategies.js');
const COINS = 'BTC,ETH,XRP,ADA,SOL,SAND,POL'.split(','), preps = COINS.map(prep);
const t0 = Math.min(...preps.map(P => P.h1.B.t[0])), t1 = Math.max(...preps.map(P => P.h1.B.t[P.h1.B.N - 1]));
const cut2 = t0 + 0.8 * (t1 - t0), COST = 0.0007;
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const d = t => new Date(t).toISOString().slice(0, 10);
console.log(`Holdout ${d(cut2)} – ${d(t1)}`);
const run = (key, p, dir, ctrl) => { const real = [], rand = [], byCoin = {};
  for (const P of preps) { const { B, sigs } = S[key].run(P, p, dir); const tr = L.simulate(B, sigs, COST).filter(x => x.t >= cut2); real.push(...tr); byCoin[P.sym] = L.stats(tr);
    if (ctrl) { const X = P[p.tf], elig = []; for (let i = 210; i < B.N - 1; i++) if (B.t[i] >= cut2 && X.A[i] && (!p.reg || X.reg50[i] === dir)) elig.push(i);
      const prob = tr.length / Math.max(1, elig.length); for (let r = 0; r < 30; r++) rand.push(...L.simulate(B, elig.filter(() => rnd() < prob).map(i => ({ i, dir, stop: B.c[i] - dir * 2 * X.A[i], trail: { k: 3, A: X.A } })), COST)); } }
  const s = L.stats(real), rs = rand.length ? L.stats(rand) : null;
  console.log(`${key} ${JSON.stringify(p)} ${dir > 0 ? 'LONG' : 'SHORT'}: ${s.n ? `${(s.exp >= 0 ? '+' : '') + s.exp.toFixed(2)}R n${s.n} t${s.t.toFixed(1)} treff ${Math.round(s.win * 100)} % snitt ${(s.bars * (p.tf === 'h4' ? 4 : 1)).toFixed(0)} t` : '–'}${rs ? ` | tilfeldig ${(rs.exp >= 0 ? '+' : '') + rs.exp.toFixed(2)}R` : ''}`);
  console.log('   per coin: ' + Object.entries(byCoin).map(([k, v]) => `${k} ${v.n ? (v.exp >= 0 ? '+' : '') + v.exp.toFixed(2) + ' (' + v.n + ')' : '–'}`).join(' · '));
};
console.log('FORHÅNDSVALGTE KANDIDATER:'); run('donch', { tf: 'h4', n: 55, reg: 0 }, 1, true); run('donch', { tf: 'h4', n: 55, reg: 50 }, 1, true);
console.log('REFERANSE (ikke valgt):'); run('donch', { tf: 'h4', n: 20, reg: 0 }, 1, true); ['pb', 'sw', 'bo'].forEach(t => [1, -1].forEach(dr => run('dt', { type: t }, dr)));
