// Kontroll: tilfeldige inngangspunkter med samme stopp- og exit-regler og samme antall handler.
const L = require('./lib.js'), { prep, S } = require('./strategies.js');
const COINS = 'BTC,ETH,XRP,ADA,SOL,SAND,POL'.split(','), preps = COINS.map(prep);
const t0 = Math.min(...preps.map(P => P.h1.B.t[0])), t1 = Math.max(...preps.map(P => P.h1.B.t[P.h1.B.N - 1]));
const cut1 = t0 + 0.6 * (t1 - t0), cut2 = t0 + 0.8 * (t1 - t0), per = t => t < cut1 ? 'dev' : t < cut2 ? 'val' : 'hold';
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (const COST of [0.0004, 0.0007, 0.001]) for (const p of [{ tf: 'h4', n: 20, reg: 0 }, { tf: 'h4', n: 55, reg: 0 }, { tf: 'h4', n: 20, reg: 50 }, { tf: 'h4', n: 55, reg: 50 }]) {
  const real = { dev: [], val: [] }, rand = { dev: [], val: [] };
  for (const P of preps) { const { B, sigs } = S.donch.run(P, p, 1); const X = P[p.tf];
    L.simulate(B, sigs, COST).forEach(x => { const k = per(x.t); if (real[k]) real[k].push(x); });
    // tilfeldige: samme regime-krav (hvis reg), samme sannsynlighet per bar, 20 gjentak
    const elig = []; for (let i = 210; i < B.N - 1; i++) if (X.A[i] && (!p.reg || X.reg50[i] === 1)) elig.push(i);
    const prob = sigs.length / Math.max(1, elig.length);
    for (let r = 0; r < 20; r++) { const rs = elig.filter(() => rnd() < prob).map(i => ({ i, dir: 1, stop: B.c[i] - 2 * X.A[i], trail: { k: 3, A: X.A } }));
      L.simulate(B, rs, COST).forEach(x => { const k = per(x.t); if (rand[k]) rand[k].push(x); }); } }
  const f = s => `${(s.exp >= 0 ? '+' : '') + s.exp.toFixed(2)}R (n${s.n})`;
  console.log(`kost ${(COST * 100).toFixed(2)} % ${JSON.stringify(p).padEnd(30)} DEV ekte ${f(L.stats(real.dev))} tilfeldig ${f(L.stats(rand.dev))} | VAL ekte ${f(L.stats(real.val))} tilfeldig ${f(L.stats(rand.val))}`);
}
