// Test av «kjøp over EMA-linja, selg under» på krypto, aksjer og fond. Kjøres i GitHub Actions (workflow ema-test.yml),
// fordi kursdataene (Binance og Yahoo Finance) ikke kan hentes fra sandkassen.
// Regel: ved hver dagslukk (eller ukelukk) sjekkes om kursen er over EMA-en. Handelen skjer på NESTE lukk (ingen titting fremover,
// og ingen antakelse om å handle akkurat på den kursen som ga signalet). Utenfor markedet: kontanter som gir rente (3-mnd US-statspapir, ^IRX)
// for aksjer/fond, 0 % for krypto. Aksjer/fond bruker utbytte-justert kurs (utbytte reinvestert) i både regel og kjøp-og-hold.
const fs = require('fs');
const OUT = process.env.OUT || __dirname + '/ema_results';
const CRYPTO = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];
const STOCKS = {
  'Indekser og fond': { '^GSPC': 'S&P 500-indeksen (fra 1928, uten utbytte)', SPY: 'S&P 500-fond', QQQ: 'Nasdaq 100-fond', VT: 'Hele verden-fond', EEM: 'Fremvoksende markeder-fond', IWM: 'Små amerikanske selskaper', GLD: 'Gull', TLT: 'Lange amerikanske statsobligasjoner' },
  'Store amerikanske aksjer': { AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'Nvidia', AMZN: 'Amazon', GOOGL: 'Alphabet', META: 'Meta', TSLA: 'Tesla', AMD: 'AMD', JPM: 'JPMorgan', KO: 'Coca-Cola', XOM: 'ExxonMobil', INTC: 'Intel' },
  'Norske aksjer': { 'EQNR.OL': 'Equinor', 'DNB.OL': 'DNB', 'NHY.OL': 'Norsk Hydro', 'MOWI.OL': 'Mowi', 'TEL.OL': 'Telenor', 'ORK.OL': 'Orkla', 'YAR.OL': 'Yara', 'KOG.OL': 'Kongsberg Gruppen' } };
const RULES = [['EMA 50 dager', 50, 'd'], ['EMA 200 dager', 200, 'd'], ['EMA 21 uker', 21, 'w']];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = +(process.env.TRIES || 4)) { let e; for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (research script)' } }); if (r.ok) return await r.json(); e = new Error('HTTP ' + r.status); } catch (x) { e = x; } await sleep(1500 * (i + 1)); } throw e; }
async function binance(sym) { const out = []; let start = 0;
  for (;;) { const k = await get(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&startTime=${start}&limit=1000`);
    for (const x of k) if (x[6] < Date.now()) out.push({ t: x[0], c: +x[4] }); if (k.length < 1000) break; start = k[k.length - 1][0] + 864e5; }
  return out; }
async function yahoo(sym) { const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d&events=div%7Csplit`);
  const r = j.chart.result[0], ts = r.timestamp, adj = r.indicators.adjclose && r.indicators.adjclose[0].adjclose, cl = r.indicators.quote[0].close, a = adj || cl, out = [];
  for (let i = 0; i < ts.length; i++) if (a[i] != null && a[i] > 0) out.push({ t: ts[i] * 1000, c: a[i] }); return { B: out, adjusted: !!adj }; }
const ema = (a, n) => { const o = new Array(a.length).fill(null), k = 2 / (n + 1); let e = null, s = 0; for (let i = 0; i < a.length; i++) { if (i < n - 1) { s += a[i]; continue; } if (e == null) { s += a[i]; e = s / n; } else e = a[i] * k + e * (1 - k); o[i] = e; } return o; };
function weekly(B) { const W = []; for (const d of B) { const w = Math.floor((d.t / 864e5 + 3) / 7); if (!W.length || W[W.length - 1].w !== w) W.push({ w, t: d.t, c: d.c, i: 0 }); else { W[W.length - 1].c = d.c; W[W.length - 1].t = d.t; } } return W; }
// signal per dag (true = i markedet), beregnet på dag- eller uke-lukk
function signal(B, len, tf) {
  if (tf === 'd') { const e = ema(B.map(b => b.c), len); return B.map((b, i) => e[i] == null ? null : b.c > e[i]); }
  const W = weekly(B), e = ema(W.map(w => w.c), len), byT = new Map(W.map((w, i) => [w.t, e[i] == null ? null : w.c > e[i]])); let cur = null;
  return B.map(b => { if (byT.has(b.t)) cur = byT.get(b.t); return cur; }); // ukesignal kjent først ved ukelukk
}
function sim(B, sig, from, to, fee, rate) {
  let eq = 1, bh = 1, inM = false, pk = 1, mdd = 0, bpk = 1, bmdd = 0, tr = 0, inD = 0, n = 0;
  for (let i = from; i < to; i++) {
    const want = sig[i - 1]; // signal fra gårsdagens lukk -> handel på dagens lukk
    if (want != null && want !== inM) { eq *= 1 - fee; inM = want; tr++; }
    const r = B[i + 1].c / B[i].c, days = (B[i + 1].t - B[i].t) / 864e5;
    eq *= inM ? r : (1 + (rate ? rate(B[i].t) : 0)) ** (days / 365); if (inM) inD++; bh *= r; n++;
    pk = Math.max(pk, eq); mdd = Math.min(mdd, eq / pk - 1); bpk = Math.max(bpk, bh); bmdd = Math.min(bmdd, bh / bpk - 1);
  }
  const yrs = (B[to].t - B[from].t) / 864e5 / 365.25;
  return { ret: eq - 1, bh: bh - 1, cagr: eq ** (1 / yrs) - 1, bhCagr: bh ** (1 / yrs) - 1, mdd, bmdd, trades: tr, perYear: tr / yrs, inPct: inD / n, years: yrs };
}
function test(B, fee, rate) {
  const res = {}; const start = 260; if (B.length < start + 500) return null; const end = B.length - 2, mid = Math.floor((start + end) / 2);
  for (const [name, len, tf] of RULES) { const s = signal(B, len, tf);
    res[name] = { all: sim(B, s, start, end, fee, rate), first: sim(B, s, start, mid, fee, rate), second: sim(B, s, mid, end, fee, rate) }; }
  return { from: new Date(B[start].t).toISOString().slice(0, 10), to: new Date(B[end].t).toISOString().slice(0, 10), mid: new Date(B[mid].t).toISOString().slice(0, 10), res };
}
(async () => {
  const out = { built: new Date().toISOString(), method: 'Signal på lukk, handel på neste lukk. Kontantrente fra ^IRX for aksjer/fond. Utbyttejustert der tilgjengelig.', groups: {} };
  // kontantrente
  let irx = null; try { const y = await yahoo('^IRX'); irx = y.B.map(b => ({ t: b.t, r: b.c / 100 })); } catch (e) { console.log('^IRX feilet', e.message); }
  const rate = irx ? (t => { let lo = 0, hi = irx.length - 1; if (t < irx[0].t) return irx[0].r; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (irx[m].t <= t) lo = m; else hi = m - 1; } return irx[lo].r; }) : null;
  out.cashRate = irx ? '^IRX (3-mnd US-statspapir)' : 'ikke tilgjengelig – 0 %';
  out.groups['Krypto (topp 5)'] = {};
  for (const s of CRYPTO) { try { const B = await binance(s); out.groups['Krypto (topp 5)'][s] = { name: s, src: 'Binance ' + s + 'USDT', fees: { '0.1 %': test(B, 0.001, null), '0.5 %': test(B, 0.005, null) } }; console.log(s, B.length); } catch (e) { out.groups['Krypto (topp 5)'][s] = { name: s, error: e.message }; } }
  for (const [g, list] of Object.entries(STOCKS)) { out.groups[g] = {};
    for (const [s, nm] of Object.entries(list)) { try { const { B, adjusted } = await yahoo(s); out.groups[g][s] = { name: nm, src: 'Yahoo Finance ' + s + (adjusted ? ' (utbyttejustert)' : ''), fees: { '0.1 %': test(B, 0.001, rate) } }; console.log(s, B.length); }
      catch (e) { out.groups[g][s] = { name: nm, error: e.message }; console.log(s, 'feilet', e.message); } await sleep(400); } }
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(OUT + '/results.json', JSON.stringify(out, null, 1));
  // tabell til jobbsammendraget
  const p = v => v == null ? '–' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' %';
  let md = `# EMA-linje: kjøp over, selg under\n\n${out.method}\n\n`;
  for (const [g, L] of Object.entries(out.groups)) { md += `## ${g}\n\n| Ticker | Periode | Regel | Årlig avk. regel | Årlig avk. hold | Maks fall regel | Maks fall hold | Handler/år | 1. halvdel best? | 2. halvdel best? |\n|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const [s, x] of Object.entries(L)) { if (x.error) { md += `| ${s} | feilet: ${x.error} |||||||||\n`; continue; } const T = x.fees['0.1 %']; if (!T) { md += `| ${s} | for lite data |||||||||\n`; continue; }
      for (const [rn, r] of Object.entries(T.res)) md += `| ${s} | ${T.from.slice(0, 4)}–${T.to.slice(0, 4)} | ${rn} | ${p(r.all.cagr)} | ${p(r.all.bhCagr)} | ${p(r.all.mdd)} | ${p(r.all.bmdd)} | ${r.all.perYear.toFixed(1)} | ${r.first.cagr > r.first.bhCagr ? 'ja' : 'nei'} | ${r.second.cagr > r.second.bhCagr ? 'ja' : 'nei'} |\n`; }
    md += '\n'; }
  fs.writeFileSync(OUT + '/results.md', md); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log('ferdig');
})();
