// «Hvis trenden fortsetter»: regresjon av log-kurs siste L dager, forlenget H dager frem. Treffer den bedre enn «uendret kurs»?
const zlib = require('zlib'), fs = require('fs');
const COINS = 'BTC,ETH,BNB,XRP,SOL,ADA,LINK,DOGE,POL,SAND'.split(',');
for (const H of [30, 90, 180, 365]) { const L = Math.max(30, H); let n = 0, dirHit = 0, errT = 0, err0 = 0, inside = 0;
  for (const s of COINS) { const c = JSON.parse(zlib.gunzipSync(fs.readFileSync(`research/data/${s}_1d.json.gz`))).map(r => +r[4]);
    for (let i = 365 + L; i + H < c.length; i += 7) { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let k = 0; k < L; k++) { const x = k, y = Math.log(c[i - L + 1 + k]); sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const b = (L * sxy - sx * sy) / (L * sxx - sx * sx), pred = b * H, act = Math.log(c[i + H] / c[i]);
      n++; if (Math.sign(pred) === Math.sign(act)) dirHit++; errT += Math.abs(act - pred); err0 += Math.abs(act); } }
  console.log(`H ${H}: retning riktig ${(dirHit / n * 100).toFixed(0)} % (n ${n}) · snittfeil trend ${(errT / n).toFixed(3)} mot «uendret» ${(err0 / n).toFixed(3)} (${((errT / err0 - 1) * 100).toFixed(0)} %)`); }
