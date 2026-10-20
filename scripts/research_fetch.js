// Henter historiske candles fra Binance (markedsdata-API) for forskning på daytrading-oppsett.
// Kjøres av .github/workflows/research-data.yml og legges på grenen research-data (ikke på main / Pages).
// Ut: research/<SYM>_<iv>.json.gz med [[t,o,h,l,c,v,qv,n,tbv], ...] (lukkede candles).
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const API = 'https://data-api.binance.vision/api/v3/klines';
const COINS = (process.env.COINS || 'BTC,ETH,XRP,ADA,POL,SAND,SOL').split(',');
const IVS = { '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5 };
const YEARS = +(process.env.YEARS || 4);
const OUT = path.join(process.cwd(), 'research'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) { for (let i = 0; i < 6; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status === 400) return []; } catch (e) {} await sleep(1000 * (i + 1)); } throw new Error('feilet: ' + url); }
(async () => {
  const now = Date.now(), from = now - YEARS * 365 * 864e5, summary = [];
  for (const s of COINS) for (const [iv, step] of Object.entries(IVS)) {
    if (iv === '5m' && !['BTC', 'ETH', 'SOL', 'XRP'].includes(s)) continue;
    const ivFrom = iv === '5m' ? now - 2 * 365 * 864e5 : from;
    const rows = []; let start = ivFrom;
    for (;;) { const k = await get(`${API}?symbol=${s}USDT&interval=${iv}&startTime=${start}&limit=1000`); if (!k.length) break;
      for (const x of k) if (x[6] < now) rows.push([x[0], +x[1], +x[2], +x[3], +x[4], +x[5], +x[7], x[8], +x[9]]);
      if (k.length < 1000) break; start = k[k.length - 1][0] + step; await sleep(60); }
    fs.writeFileSync(path.join(OUT, `${s}_${iv}.json.gz`), zlib.gzipSync(JSON.stringify(rows)));
    summary.push(`${s} ${iv}: ${rows.length} candles fra ${rows.length ? new Date(rows[0][0]).toISOString().slice(0, 10) : '–'}`); console.log(summary[summary.length - 1]);
  }
  fs.writeFileSync(path.join(OUT, 'README.md'), `Forskningsdata hentet ${new Date().toISOString()}\n\n` + summary.map(x => '- ' + x).join('\n') + '\n');
})().catch(e => { console.error(e); process.exit(1); });
