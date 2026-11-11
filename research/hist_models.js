// Kan «realistisk spenn» bli bedre? Sammenligner flere forhåndsdefinerte modeller walk-forward (bare fortid brukes ved hver test).
// Hver modell gir kvantiler (10/25/50/75/90 %) for logavkastning over H dager:  q = z_q(bøtte) × vol_f × sqrt(H/365),
// der z_q er empiriske kvantiler av tidligere utfall (i samme bøtte) delt på deres volatilitet. Bøttene er valgt på forhånd.
// Mål: pinball-tap (lavere = bedre), dekning av 10–90 %, Brier-score for «høyere kurs» (lavere = bedre).
const zlib = require('zlib'), fs = require('fs');
const COINS = (process.env.COINS || 'BTC,ETH,BNB,XRP,SOL,ADA,LINK,DOGE,POL,SAND').split(','), DAY = 864e5, HZ = [7, 30, 90, 180, 365];
const QS = [0.1, 0.25, 0.5, 0.75, 0.9];
const ema = (a, n) => { const o = new Array(a.length).fill(null), k = 2 / (n + 1); let e = null, s = 0; for (let i = 0; i < a.length; i++) { if (i < n - 1) { s += a[i]; continue; } if (e == null) { s += a[i]; e = s / n; } else e = a[i] * k + e * (1 - k); o[i] = e; } return o; };
function rv(c, n) { const o = new Array(c.length).fill(null); let s = 0, s2 = 0; for (let i = 1; i < c.length; i++) { const r = Math.log(c[i] / c[i - 1]); s += r; s2 += r * r; if (i > n) { const q = Math.log(c[i - n] / c[i - n - 1]); s -= q; s2 -= q * q; } if (i > n) { const m = s / n; o[i] = Math.sqrt(Math.max(1e-10, (s2 - n * m * m) / (n - 1)) * 365); } } return o; }
const data = {};
for (const s of COINS) { const f = `${__dirname}/data/${s}_1d.json.gz`; if (!fs.existsSync(f)) continue;
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(f))); const t = rows.map(r => r[0]), c = rows.map(r => +r[4]);
  const e200 = ema(c, 200), v30 = rv(c, 30), v90 = rv(c, 90), v365 = rv(c, 365); let m = 0; const dd = c.map(x => { m = Math.max(m, x); return x / m - 1; });
  data[s] = { t, c, e200, v30, v90, v365, dd, idx: new Map(t.map((x, i) => [x, i])) }; }
const B = data.BTC;
// hendelser: hver 7. dag per coin, minst 365 dager etter notering
const ev = [];
for (const [s, D] of Object.entries(data)) for (let i = 365; i < D.c.length; i += 7) { if (D.v365[i] == null || D.e200[i] == null) continue;
  const j = B.idx.get(D.t[i]); const r = {}; for (const H of HZ) r[H] = i + H < D.c.length ? Math.log(D.c[i + H] / D.c[i]) : null;
  ev.push({ s, t: D.t[i], r, v90: D.v90[i], v30: D.v30[i], v365: D.v365[i], up: D.c[i] > D.e200[i], dd: D.dd[i], m12: Math.log(D.c[i] / D.c[i - 365]),
    btcUp: j != null && B.e200[j] != null ? B.c[j] > B.e200[j] : null, btcDd: j != null ? B.dd[j] : null }); }
ev.sort((a, b) => a.t - b.t);
const HALV = [Date.UTC(2016, 6, 9), Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20), Date.UTC(2028, 3, 15)];
const cyc = t => { let h = HALV[0]; for (const x of HALV) if (x <= t) h = x; return Math.min(3, Math.floor((t - h) / (365.25 * DAY))); }; // år siden siste halvering: 0,1,2,3
const ddB = d => d > -0.3 ? 0 : d > -0.6 ? 1 : d > -0.85 ? 2 : 3;
const MODELS = {
  'M0 nå (vol 90 d, én bøtte)': { vol: e => e.v90, key: () => 0 },
  'M1 blandet volatilitet (30/90/365 d)': { vol: e => Math.sqrt((e.v30 ** 2 + e.v90 ** 2 + e.v365 ** 2) / 3), key: () => 0 },
  'M2 M1 + trend (over/under 200 d)': { vol: e => Math.sqrt((e.v30 ** 2 + e.v90 ** 2 + e.v365 ** 2) / 3), key: e => +e.up },
  'M3 M1 + fall fra toppen (4 bøtter)': { vol: e => Math.sqrt((e.v30 ** 2 + e.v90 ** 2 + e.v365 ** 2) / 3), key: e => ddB(e.dd) },
  'M4 M1 + 12 mnd utvikling (opp/ned)': { vol: e => Math.sqrt((e.v30 ** 2 + e.v90 ** 2 + e.v365 ** 2) / 3), key: e => +(e.m12 > 0) },
  'M5 M1 + Bitcoin-trend': { vol: e => Math.sqrt((e.v30 ** 2 + e.v90 ** 2 + e.v365 ** 2) / 3), key: e => +e.btcUp },
  'M7 M1 + halveringssyklus (år 1–4)': { vol: e => Math.sqrt((e.v30 ** 2 + e.v90 ** 2 + e.v365 ** 2) / 3), key: e => cyc(e.t) },
  'M8 M1 + Bitcoin fall fra toppen': { vol: e => Math.sqrt((e.v30 ** 2 + e.v90 ** 2 + e.v365 ** 2) / 3), key: e => e.btcDd == null ? 9 : e.btcDd > -0.2 ? 0 : e.btcDd > -0.5 ? 1 : 2 },
  'M6 M1 + trend + fall fra toppen': { vol: e => Math.sqrt((e.v30 ** 2 + e.v90 ** 2 + e.v365 ** 2) / 3), key: e => (+e.up) * 4 + ddB(e.dd) } };
function quant(s, q) { const x = q * (s.length - 1), lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); }
const START = Date.UTC(2020, 0, 1), MID = Date.UTC(2023, 3, 1);
const out = {};
for (const H of HZ) { out[H] = {};
  for (const [name, M] of Object.entries(MODELS)) {
    const past = new Map(); let p = 0; const known = ev.filter(e => e.r[H] != null).sort((a, b) => a.t - b.t); // sortert etter t; utfall kjent ved t+H
    const stat = { all: { pin: 0, n: 0, cov: 0, brier: 0 }, h1: { pin: 0, n: 0, cov: 0, brier: 0 }, h2: { pin: 0, n: 0, cov: 0, brier: 0 } };
    for (const e of ev) { if (e.r[H] == null || e.t < START) continue;
      while (p < known.length && known[p].t + H * DAY <= e.t) { const k = known[p], vf = M.vol(k); if (vf) { const key = M.key(k); if (!past.has(key)) past.set(key, []); past.get(key).push(k.r[H] / (vf * Math.sqrt(H / 365))); } p++; }
      const arr = past.get(M.key(e)); if (!arr || arr.length < 60) continue; const s = [...arr].sort((a, b) => a - b), sc = M.vol(e) * Math.sqrt(H / 365);
      const q = QS.map(x => quant(s, x) * sc), y = e.r[H];
      let pin = 0; QS.forEach((x, i) => { const d = y - q[i]; pin += Math.max(x * d, (x - 1) * d); }); pin /= QS.length;
      const pUp = s.filter(z => z > 0).length / s.length, br = (pUp - (y > 0 ? 1 : 0)) ** 2, cov = y >= q[0] && y <= q[4] ? 1 : 0;
      (M.rec = M.rec || {})[H] = (M.rec[H] || new Map()).set(e.s + e.t, { pin, cov, br, t: e.t }); for (const g of ['all', e.t < MID ? 'h1' : 'h2']) { stat[g].pin += pin; stat[g].n++; stat[g].cov += cov; stat[g].brier += br; } }
    for (const g in stat) { const x = stat[g]; out[H][name] = out[H][name] || {}; out[H][name][g] = { n: x.n, pin: +(x.pin / x.n).toFixed(4), cov: +(x.cov / x.n).toFixed(3), brier: +(x.brier / x.n).toFixed(4) }; } } }
for (const H of HZ) { console.log(`\n== ${H} dager (pinball: lavere er bedre; dekning bør være ~0,80; Brier 0,25 = som å gjette 50/50)`);
  const base = out[H]['M0 nå (vol 90 d, én bøtte)'];
  for (const [name, r] of Object.entries(out[H])) { const d = g => ((r[g].pin / base[g].pin - 1) * 100).toFixed(1);
    console.log(`${name.padEnd(40)} pinball ${r.all.pin} (${d('all')} % · 1. halvdel ${d('h1')} % · 2. halvdel ${d('h2')} %) | dekning ${r.h1.cov}/${r.h2.cov} | Brier ${r.h1.brier}/${r.h2.brier} | n ${r.all.n}`); } }
fs.writeFileSync(__dirname + '/hist_models.json', JSON.stringify(out));

console.log('\n### Rettferdig sammenligning: bare tidspunkter der syklusmodellen (M7) har nok data');
for (const H of HZ) { const ref = MODELS['M7 M1 + halveringssyklus (år 1–4)'].rec[H]; const keys = [...ref.keys()];
  for (const nm of ['M1 blandet volatilitet (30/90/365 d)', 'M7 M1 + halveringssyklus (år 1–4)']) { const R = MODELS[nm].rec[H]; const g = { a: [], h1: [], h2: [] };
    for (const k of keys) { const r = R.get(k); if (!r) continue; g.a.push(r); (r.t < MID ? g.h1 : g.h2).push(r); }
    const f = a => a.length ? `pin ${(a.reduce((s, r) => s + r.pin, 0) / a.length).toFixed(4)} dekn ${(a.reduce((s, r) => s + r.cov, 0) / a.length).toFixed(2)} Brier ${(a.reduce((s, r) => s + r.br, 0) / a.length).toFixed(3)} n ${a.length}` : '–';
    console.log(`${H} d ${nm.slice(0, 2)}: alle ${f(g.a)} | 1. halvdel ${f(g.h1)} | 2. halvdel ${f(g.h2)}`); } }
