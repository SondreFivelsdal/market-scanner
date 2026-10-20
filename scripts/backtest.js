// Backtest av statusreglene og «tydelig signal»-regelen, punkt-i-tid.
// For hver dag siden START kjøres hele analysemotoren på nytt med bare de candlene som var kjent den dagen
// (alle coins kuttet til samme dato, nivåer, score, scenario-motor og status regnes som om det var den dagen).
// Deretter måles hva kursen faktisk gjorde etterpå, og resultatet sammenlignes med en vanlig dag.
//
// Kjøres av GitHub Actions etter update.js. Resultatene per dag bufres i site/data/backtest_rows.json (hentes fra
// Pages ved neste kjøring), så normalt regnes bare nye dager. Endres engine.js, rules.js eller denne fila, regnes alt
// på nytt – fordelt over flere kjøringer hvis det tar lengre tid enn BUDGET_MS.
// Miljø: PAGES_URL, BUDGET_MS (standard 8 min), CANDLES (sti til candles_1d.json, standard site/data/candles_1d.json).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MS = require('../engine.js');
const { clearSignal } = require('./rules.js');
const DAY = 864e5;
const OUT = path.join(__dirname, '..', 'site', 'data');
const PAGES = process.env.PAGES_URL || '';
const BUDGET = +(process.env.BUDGET_MS || 8 * 60e3);
const START = Date.UTC(2019, 0, 1); // første dag som testes (BTC har da ~1,5 år historikk til scenario-motoren)
const HS = [7, 30, 90];
const VERSION = crypto.createHash('md5').update(['../engine.js', './rules.js', './backtest.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n')).digest('hex').slice(0, 12);
const CODE = { buy: 'b', wait: 'w', sell: 's', none: 'n' };

async function prevJSON(file) {
  if (!PAGES) return null;
  try { const r = await fetch(`${PAGES}data/${file}?t=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
const q = (a, p) => MS.quant(a, p);
const r1 = v => v == null || !isFinite(v) ? null : Math.round(v * 10) / 10;
const r3 = v => v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000;
const sig = v => v == null || !isFinite(v) ? null : +v.toPrecision(6);

// ---------------------------------------------------------------- 1) status per coin per dag (punkt-i-tid)
function computeRows(D, full, cache, t0) {
  const dates = D.BTC.t.filter(t => t >= START);
  const rows = cache ? cache.rows : {};
  const done = cache ? cache.last : 0;
  let last = done, n = 0;
  for (const T of dates) {
    if (T <= done) continue;
    if (Date.now() - t0 > BUDGET) { console.log('Tidsbudsjett brukt opp – fortsetter ved neste kjøring.'); return { rows, last, complete: false }; }
    const Dc = {}, pre = {};
    for (const s of MS.COINS) { const Ds = D[s]; if (!Ds) continue; let k = Ds.t.length; while (k > 0 && Ds.t[k - 1] > T) k--; if (k < 260) continue; Dc[s] = MS.sliceD(Ds, 0, k); pre[s] = MS.sliceS(full[s], k); }
    const R = MS.run(Dc, {}, { pre, lite: true });
    for (const c of R.coins) {
      if (c.asOf !== T) continue; // coinen hadde ikke candle denne dagen
      const arr = rows[c.sym] || (rows[c.sym] = []);
      const prevCode = arr.length && arr[arr.length - 1][0] === T - DAY ? { b: 'buy', w: 'wait', s: 'sell', n: 'none' }[arr[arr.length - 1][1]] : null;
      const cl = prevCode == null ? null : clearSignal(c, prevCode, true);
      const k = c.keys || {}, ex = c.ex || {};
      // [dato, status, score, tydelig signal (1/−1/0), type ('s' status / 'w' WaveTrend), stopp, neste motstand (mål ved kjøp / stopp ved salg), må-holde-støtte (mål ved salg)]
      arr.push([T, CODE[c.status.code], c.score, cl ? cl.dir : 0, cl ? (cl.kind === 'wt' ? 'w' : 's') : '', sig(ex.stop), sig(k.nextUp && k.nextUp.p), sig(k.mustHold && k.mustHold.p)]);
    }
    last = T; n++;
    if (n % 100 === 0) console.log(new Date(T).toISOString().slice(0, 10), `${n} dager, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  return { rows, last, complete: true };
}

// ---------------------------------------------------------------- 2) utfall og statistikk
function outcomes(Ds, i) {
  const c0 = Ds.c[i], N = Ds.c.length, o = {};
  for (const H of HS) o[H] = i + H < N ? (Ds.c[i + H] / c0 - 1) * 100 : null;
  if (i + 30 < N) { let mx = -Infinity, mn = Infinity; for (let j = i + 1; j <= i + 30; j++) { mx = Math.max(mx, Ds.h[j]); mn = Math.min(mn, Ds.l[j]); } o.up30 = (mx / c0 - 1) * 100; o.dn30 = (mn / c0 - 1) * 100; }
  return o;
}
// mål før stopp innen 30 dager (samme dag: stopp teller først – konservativt). dir 1: mål over, stopp under. dir −1: mål under, stopp over.
function race(Ds, i, dir, tgt, stop) {
  if (tgt == null || stop == null || i + 30 >= Ds.c.length) return null;
  if (dir > 0 && !(tgt > Ds.c[i] && stop < Ds.c[i])) return null;
  if (dir < 0 && !(tgt < Ds.c[i] && stop > Ds.c[i])) return null;
  for (let j = i + 1; j <= i + 30; j++) {
    if (dir > 0) { if (Ds.l[j] <= stop) return 'stop'; if (Ds.h[j] >= tgt) return 'tgt'; }
    else { if (Ds.h[j] >= stop) return 'stop'; if (Ds.l[j] <= tgt) return 'tgt'; } }
  return 'none';
}
function nEffOf(ts) { const d = [...ts].sort((a, b) => a - b); let n = 0, s = -Infinity; for (const t of d) if (t - s >= 30 * DAY) { n++; s = t; } return n; }

const GROUPS = [
  ['clearBuy', 'Kjøpsvarsel («tydelig signal»)', 1],
  ['buyStart', 'Status blir «Mulig kjøpsoppsett»', 1],
  ['waitStart', 'Status blir «Avvent bekreftelse»', 0],
  ['noneStart', 'Status blir «Ingen tydelig mulighet»', 0],
  ['sellStart', 'Status blir «Mulig salgs-/exit-oppsett»', -1],
  ['clearSell', 'Salgsvarsel («tydelig signal»)', -1]];

function summarise(D, rows, asOf) {
  const items = { ALL: [] }, base = { ALL: [] };
  for (const s in rows) {
    const Ds = D[s], idx = new Map(Ds.t.map((t, i) => [t, i])); items[s] = []; base[s] = [];
    let prev = null;
    for (const r of rows[s]) {
      const [t, code, score, clear, kind, stop, res, sup] = r; const i = idx.get(t); if (i == null) { prev = r; continue; }
      const o = outcomes(Ds, i);
      base[s].push(o); base.ALL.push(o);
      const start = !prev || prev[1] !== code || prev[0] !== t - DAY;
      const g = [];
      if (start) g.push({ b: 'buyStart', w: 'waitStart', s: 'sellStart', n: 'noneStart' }[code]);
      if (clear > 0) g.push('clearBuy'); if (clear < 0) g.push('clearSell');
      for (const key of g) {
        const dir = key === 'clearBuy' || key === 'buyStart' ? 1 : key === 'clearSell' || key === 'sellStart' ? -1 : 0;
        const it = { key, sym: s, t, price: Ds.c[i], score, kind, o, race: dir > 0 ? race(Ds, i, 1, res, stop) : dir < 0 ? race(Ds, i, -1, sup, res) : null };
        items[s].push(it); items.ALL.push(it);
      }
      prev = r;
    }
  }
  const out = {};
  for (const scope in items) {
    out[scope] = {};
    for (const [key, label, dir] of GROUPS) {
      const its = items[scope].filter(x => x.key === key), d = dir || 1;
      const h = {};
      for (const H of HS) {
        const v = its.map(x => x.o[H]).filter(x => x != null), bv = base[scope].map(x => x[H]).filter(x => x != null);
        const hitOf = a => a.length ? a.filter(x => d > 0 ? x > 0 : x < 0).length / a.length : null;
        const known = its.filter(x => x.o[H] != null), ne = nEffOf(known.map(x => x.t)), hit = hitOf(v);
        h[H] = { n: v.length, nEff: ne, hit: r3(hit), ci: hit == null ? [null, null] : MS.wilson(Math.round(hit * ne), Math.max(1, ne)).map(r3), med: r1(q(v, 0.5)), q25: r1(q(v, 0.25)), q75: r1(q(v, 0.75)), base: r3(hitOf(bv)), baseMed: r1(q(bv, 0.5)) };
      }
      const rc = its.map(x => x.race).filter(x => x != null);
      const z = h[30]; let verdict = 'none';
      if (dir !== 0 && z.n) verdict = z.nEff < 8 ? 'few' : z.ci[0] > z.base ? 'better' : z.ci[1] < z.base ? 'worse' : 'same';
      out[scope][key] = { label, dir, n: its.length, h,
        race: rc.length ? { n: rc.length, tgt: r3(rc.filter(x => x === 'tgt').length / rc.length), stop: r3(rc.filter(x => x === 'stop').length / rc.length), none: r3(rc.filter(x => x === 'none').length / rc.length) } : null,
        dn30: r1(q(its.map(x => x.o.dn30), 0.5)), up30: r1(q(its.map(x => x.o.up30), 0.5)), verdict };
    }
  }
  const recent = items.ALL.filter(x => x.key === 'clearBuy' || x.key === 'clearSell').sort((a, b) => b.t - a.t).slice(0, 40)
    .map(x => ({ sym: x.sym, t: x.t, dir: x.key === 'clearBuy' ? 1 : -1, kind: x.kind, price: sig(x.price), score: x.score, r7: r1(x.o[7]), r30: r1(x.o[30]), r90: r1(x.o[90]), race: x.race }));
  return { summary: out, recent };
}

async function main() {
  const t0 = Date.now();
  const file = process.env.CANDLES || path.join(OUT, 'candles_1d.json');
  const D = MS.prep(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!D.BTC) throw new Error('Mangler BTC-data');
  const full = {}; for (const s of MS.COINS) if (D[s]) full[s] = MS.series(D[s]);
  let cache = process.env.NO_CACHE ? null : process.env.CACHE_FILE ? JSON.parse(fs.readFileSync(process.env.CACHE_FILE, 'utf8')) : await prevJSON('backtest_rows.json');
  if (cache && cache.version !== VERSION) { console.log('Ny versjon av motoren/reglene – regner backtesten på nytt.'); cache = null; }
  if (cache) { // ta bare med dager som fortsatt finnes i dataene (og alle coins som er i scanneren nå)
    for (const s in cache.rows) if (!MS.COINS.includes(s)) delete cache.rows[s];
    if (MS.COINS.some(s => D[s] && D[s].t.length >= 260 && !cache.rows[s])) { console.log('Ny coin – regner backtesten på nytt.'); cache = null; } }
  const { rows, last, complete } = computeRows(D, full, cache, t0);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'backtest_rows.json'), JSON.stringify({ version: VERSION, last, rows }));
  const asOf = Math.max(...Object.values(D).map(x => x.t[x.t.length - 1]));
  const { summary, recent } = summarise(D, rows, asOf);
  const days = Object.values(rows).reduce((a, r) => a + r.length, 0);
  fs.writeFileSync(path.join(OUT, 'backtest.json'), JSON.stringify({ version: VERSION, built: new Date().toISOString(), from: START, to: last, complete, asOf, days, coins: Object.keys(rows), summary, recent }));
  const A = summary.ALL;
  console.log(`Backtest ${complete ? 'ferdig' : 'delvis'} til ${new Date(last).toISOString().slice(0, 10)} (${days} coin-dager, ${Math.round((Date.now() - t0) / 1000)} s).`,
    ['clearBuy', 'buyStart', 'sellStart', 'clearSell'].map(k => `${k}: n=${A[k].n} treff30=${A[k].h[30].hit} basis=${A[k].h[30].base} (${A[k].verdict})`).join(' | '));
}
module.exports = { computeRows, summarise, race, VERSION, START };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
