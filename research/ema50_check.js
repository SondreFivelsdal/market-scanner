const RG = require('../site/regime.js'), zlib = require('zlib'), fs = require('fs');
const ld = s => JSON.parse(zlib.gunzipSync(fs.readFileSync(`${__dirname}/data/${s}_1d.json.gz`))).map(r => ({ t: r[0], c: +r[4] }));
const COINS = 'BTC,ETH,XRP,ADA,SOL,BNB,LINK,DOGE,SAND'.split(',');
function run(B, e, a, b, fee) { let eq = 1, bh = 1, inM = false, tr = 0;
  for (let i = a; i < b; i++) { const want = B[i].c > e[i]; if (want !== inM) { eq *= 1 - fee; inM = want; tr++; } const r = B[i + 1].c / B[i].c; if (inM) eq *= r; bh *= r; }
  return { eq, bh, tr }; }
const P = [['Hele perioden', '2018-03-01', '2026-10-20'], ['2018–2021', '2018-03-01', '2021-12-31'], ['2022–2026', '2022-01-01', '2026-10-20'], ['Siste 2 år', '2024-10-20', '2026-10-20']];
for (const fee of [0.001, 0.005]) for (const [nm, f, t] of P) { let win = 0, n = 0; const rows = [];
  for (const s of COINS) { const B = ld(s), e = RG.ema(B.map(x => x.c), 50); const T0 = Date.parse(f), T1 = Date.parse(t);
    let a = B.findIndex(x => x.t >= T0); a = Math.max(a, 200); let b = B.findIndex(x => x.t > T1); if (b < 0) b = B.length - 1; b = Math.min(b, B.length - 1); if (b - a < 200) continue;
    const r = run(B, e, a, b, fee); n++; if (r.eq > r.bh) win++; rows.push(`${s} ${Math.round((r.eq - 1) * 100)}/${Math.round((r.bh - 1) * 100)}`); }
  console.log(`gebyr ${fee * 100} % · ${nm.padEnd(13)}: regelen best i ${win}/${n}  [regel%/hold%: ${rows.join(', ')}]`); }
