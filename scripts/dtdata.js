// Henter 15-min og 1-times candles fra Binance sitt åpne markedsdata-API (samme som update.js bruker).
const API = 'https://data-api.binance.vision/api/v3/klines';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) { let err;
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); err = new Error(`HTTP ${r.status}`); } catch (e) { err = e; } await sleep(1000 * (i + 1)); }
  throw err; }
const MS = { '15m': 15 * 60e3, '1h': 36e5 };
// alle lukkede candles fra start (ms) til nå, eller de siste `limit` hvis start mangler
async function klines(sym, interval, { start, limit } = {}) {
  const now = Date.now(), step = MS[interval], out = [];
  if (start == null) { const k = await get(`${API}?symbol=${sym}USDT&interval=${interval}&limit=${Math.min(1000, (limit || 500) + 1)}`); return k.filter(x => x[6] < now); }
  let s = start;
  for (;;) { const k = await get(`${API}?symbol=${sym}USDT&interval=${interval}&startTime=${s}&limit=1000`);
    for (const x of k) if (x[6] < now) out.push(x);
    if (k.length < 1000) break; s = k[k.length - 1][0] + step; }
  return out;
}
module.exports = { klines, get };
