// Backtest av planen mot «alt på en gang» og fast ukentlig kjøp, for mange startdatoer.
const fs = require('fs'), zlib = require('zlib'), PLAN = require('../site/plan.js');
const DIR = __dirname + '/data/';
const COINS = (process.env.COINS || 'BTC,ETH,XRP,ADA,SOL,BNB,LINK,DOGE,SAND,POL').split(',');
const WEEKS = +(process.env.WEEKS || 104), HOLD = +(process.env.HOLD || 0); // HOLD: dager etter start å måle (0 = til slutten av data)
const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const pc = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(0) + ' %';
const all = [];
for (const s of COINS) {
  const f = DIR + `${s}_1d.json.gz`; if (!fs.existsSync(f)) { console.log('mangler', s); continue; }
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(f))); const P = PLAN.prepare(rows.map(r => r[0]), rows.map(r => r[4]));
  const first = P.pct.findIndex(v => v != null), out = [];
  for (let i0 = first; i0 + WEEKS * 7 <= P.N - 1 - 30; i0 += 30) {
    const end = HOLD ? Math.min(P.N - 1, i0 + HOLD) : P.N - 1; if (HOLD && i0 + HOLD > P.N - 1) break;
    const r = {}; for (const m of ['lump', 'dca', 'plan', 'plan+sell']) r[m] = PLAN.simulate(P, i0, 10000, WEEKS, m, { end, rebuy: true, rule: process.env.RULE || 'pct' });
    out.push({ s, start: P.t[i0], r });
  }
  all.push(...out);
  const k = m => out.map(o => o.r[m].value / o.r.dca.value - 1);
  const avgR = out.map(o => o.r.plan.avg / o.r.dca.avg - 1);
  const mdd = m => med(out.map(o => o.r[m].mdd));
  if (process.env.QUIET) continue; console.log(`${s.padEnd(5)} starter ${String(out.length).padStart(3)} fra ${new Date(P.t[first]).toISOString().slice(0, 10)} | snittpris plan vs DCA: median ${pc(med(avgR))}, bedre i ${Math.round(avgR.filter(x => x < 0).length / out.length * 100)} % | sluttverdi vs DCA – plan: median ${pc(med(k('plan')))} (bedre ${Math.round(k('plan').filter(x => x > 0).length / out.length * 100)} %), plan+salg: median ${pc(med(k('plan+sell')))} (bedre ${Math.round(k('plan+sell').filter(x => x > 0).length / out.length * 100)} %), engang: median ${pc(med(k('lump')))} | maks fall median: DCA ${pc(mdd('dca'))} plan ${pc(mdd('plan'))} plan+salg ${pc(mdd('plan+sell'))}`);
}
const kk = m => all.map(o => o.r[m].value / o.r.dca.value - 1), av = all.map(o => o.r.plan.avg / o.r.dca.avg - 1);
console.log(`ALLE  ${all.length} starter | snittpris plan vs DCA median ${pc(med(av))} (bedre i ${Math.round(av.filter(x => x < 0).length / all.length * 100)} %) | sluttverdi plan ${pc(med(kk('plan')))} (bedre ${Math.round(kk('plan').filter(x => x > 0).length / all.length * 100)} %) | plan+salg ${pc(med(kk('plan+sell')))} (bedre ${Math.round(kk('plan+sell').filter(x => x > 0).length / all.length * 100)} %) | engang ${pc(med(kk('lump')))}`);
fs.writeFileSync(__dirname + `/bt_${WEEKS}_${HOLD}.json`, JSON.stringify(all.map(o => ({ s: o.s, start: o.start, ...Object.fromEntries(Object.entries(o.r).map(([m, x]) => [m, { value: x.value, avg: x.avg, mdd: x.mdd }])) }))));
