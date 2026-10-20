// Backtest av daytrading-oppsettene (site/daytrade.js) på 15-min candles siste 12 måneder for alle coins.
// Regnes på nytt én gang i døgnet (eller når daytrade.js endres); ellers kopieres forrige resultat fra Pages.
// Skriver site/data/daytrade.json. Miljø: PAGES_URL, FORCE=1 (regn uansett), DT_FILE (lokale testdata, se test_daytrade.js).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DT = require('../site/daytrade.js');
const { klines } = require('./dtdata.js');
const MS_ = require('../engine.js');
const OUT = path.join(__dirname, '..', 'site', 'data');
const PAGES = process.env.PAGES_URL || '';
const DAY = 864e5, YEAR = 365 * DAY;
const VERSION = crypto.createHash('md5').update(fs.readFileSync(path.join(__dirname, '..', 'site', 'daytrade.js'), 'utf8') + fs.readFileSync(__filename, 'utf8')).digest('hex').slice(0, 12);

async function prevJSON(file) { if (!PAGES) return null;
  try { const r = await fetch(`${PAGES}data/${file}?t=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } }); return r.ok ? await r.json() : null; } catch (e) { return null; } }

// data: { SYM: { m15: [...klines], h1: [...klines] } }
function analyse(data, from) {
  const res = { coins: {}, ALL: {}, curve: {} }, pooled = {}; let to = 0;
  for (const sym of Object.keys(data)) {
    const B = DT.bars(data[sym].m15), H = DT.bars(data[sym].h1); if (B.N < DT.P.warm + 100) continue;
    const I = DT.prepare(B, H);
    let i0 = 0; while (i0 < B.N && B.t[i0] < from) i0++;
    const tr = DT.simulate(B, I, Math.max(DT.P.warm, i0)).filter(x => x.state === 'lukket');
    to = Math.max(to, B.t[B.N - 1]);
    res.coins[sym] = { trades: tr }; for (const x of tr) (pooled[x.key] = pooled[x.key] || []).push({ ...x, sym });
  }
  const cut = from + (to - from) * 2 / 3;
  const block = list => { const is = DT.stats(list.filter(x => x.t < cut)), oos = DT.stats(list.filter(x => x.t >= cut)); return { all: DT.stats(list), is, oos, verdict: DT.verdict(is, oos) }; };
  for (const sym in res.coins) { const tr = res.coins[sym].trades; const o = {}; for (const k of DT.KEYS) o[k] = block(tr.filter(x => x.key === k)); res.coins[sym] = o; }
  for (const k of DT.KEYS) { const list = (pooled[k] || []).sort((a, b) => a.t - b.t); res.ALL[k] = block(list);
    // kumulativ R per dag (alle coins samlet)
    const pts = []; let cum = 0, j = 0; for (let d = Math.floor(from / DAY) * DAY; d <= to; d += DAY) { while (j < list.length && list[j].t < d + DAY) cum += list[j++].R; pts.push(Math.round(cum * 100) / 100); } res.curve[k] = pts; }
  return { from, to, cut, ...res };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const prev = process.env.FORCE ? null : await prevJSON('daytrade.json');
  if (prev && prev.version === VERSION && Date.now() - Date.parse(prev.built) < 20 * 36e5) {
    fs.writeFileSync(path.join(OUT, 'daytrade.json'), JSON.stringify(prev)); console.log('Daytrade-backtest er fersk – gjenbruker', prev.built); return; }
  const t0 = Date.now(), from = Date.now() - YEAR; let data = {};
  if (process.env.DT_FILE) data = JSON.parse(fs.readFileSync(process.env.DT_FILE, 'utf8'));
  else for (const sym of MS_.COINS) {
    try { const [m15, h1] = await Promise.all([klines(sym, '15m', { start: from - 4 * DAY }), klines(sym, '1h', { start: from - 20 * DAY })]); data[sym] = { m15, h1 }; console.log(sym, m15.length, '× 15m,', h1.length, '× 1t'); }
    catch (e) { console.log(sym, 'feilet', e.message); } }
  const lastT = Math.max(...Object.values(data).map(d => d.m15.length ? +d.m15[d.m15.length - 1][0] : 0));
  const R = analyse(data, lastT - YEAR);
  const out = { version: VERSION, built: new Date().toISOString(), P: DT.P, ...R };
  fs.writeFileSync(path.join(OUT, 'daytrade.json'), JSON.stringify(out));
  console.log(`Daytrade-backtest ferdig (${Math.round((Date.now() - t0) / 1000)} s):`, DT.KEYS.map(k => `${k} n=${R.ALL[k].all.n} E=${R.ALL[k].all.exp} (${R.ALL[k].verdict})`).join(' | '));
}
module.exports = { analyse, VERSION };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
