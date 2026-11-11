// Støtte blir motstand? Første dagslukk under en sterk støtte (≥3 berøringer), så retest nedenfra (high innen 1 % av nivået) innen 10 dager.
// Utfall fra retesten: «flip holdt» = kursen faller 8 % under nivået før den lukker 3 % over nivået. Samme mål for tilfeldige dager som sammenligning.
const RG = require('../site/regime.js'), zlib = require('zlib'), fs = require('fs');
const COINS = 'BTC,ETH,BNB,XRP,SOL,ADA,LINK,DOGE,POL,SAND'.split(',');
let n = 0, held = 0, fail = 0, bn = 0, bheld = 0;
const outcome = (B, k, dn, up) => { for (let j = k + 1; j < Math.min(B.length, k + 90); j++) { if (B[j].l <= dn) return 1; if (B[j].c >= up) return 0; } return null; };
for (const s of COINS) { const B = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${__dirname}/data/${s}_1d.json.gz`))).map(r => ({ t: r[0], h: +r[2], l: +r[3], c: +r[4] }));
  let last = -999;
  for (let i = 400; i < B.length - 30; i++) { if (i - last < 20) continue; const A = RG.atr(B.slice(i - 100, i + 1)).pop();
    const lv = RG.levels(B.slice(0, i), i - 1, A, 3, 300).filter(l => l.n >= 3 && B[i - 1].c > l.p && B[i].c < l.p * 0.99);
    if (!lv.length) continue; const L = lv.sort((a, b) => b.p - a.p)[0].p; last = i;
    let k = -1; for (let j = i + 1; j <= i + 10 && j < B.length; j++) { if (B[j].c > L * 1.03) break; if (B[j].h >= L * 0.99) { k = j; break; } }
    if (k < 0) continue; const rd = L * 0.92 / B[k].c, ru = L * 1.03 / B[k].c; const o = outcome(B, k, B[k].c * rd, B[k].c * ru); if (o == null) continue; n++; held += o; fail += 1 - o;
    // sammenligning: samme mål fra en tilfeldig dag i samme coin (samme avstander fra dagens kurs)
    for (let r = 0; r < 5; r++) { const q = 400 + Math.floor(Math.random() * (B.length - 500)); const o2 = outcome(B, q, B[q].c * rd, B[q].c * ru); if (o2 != null) { bn++; bheld += o2; } } } }
console.log(`Retest av brutt støtte: ${n} tilfeller. Falt 8 % før den lukket 3 % over: ${held} (${Math.round(held / n * 100)} %). Vanlig dag (samme mål): ${Math.round(bheld / bn * 100)} % av ${bn}.`);
