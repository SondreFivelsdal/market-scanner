// Historisk test av Terminal-fanens «Mulig long / Mulig short» (site/regime.js). Reglene er forhåndsbestemt, ikke tilpasset.
// Signal sjekkes ved hver lukket 4t-candle med bare data kjent da. Inngang: åpningen av neste 1t-candle. Utgang: stopp eller mål 1
// (stopp regnes først hvis begge treffes i samme 1t-candle), ellers lukkes etter 30 dager. Én handel om gangen per coin.
// Bruk: node research/setup_bt.js   (COST=0.001 per side, COINS=BTC,ETH,…, OUT=fil.json)
const RG = require('../site/regime.js'), zlib = require('zlib'), fs = require('fs');
const DIR = __dirname + '/data/', COST = +(process.env.COST || 0.001);
const COINS = (process.env.COINS || 'BTC,ETH,XRP,ADA,SOL,POL,SAND').split(',');
const ld = (s, tf) => JSON.parse(zlib.gunzipSync(fs.readFileSync(`${DIR}${s}_${tf}.json.gz`))).map(r => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
const H = 36e5, all = [];
for (const s of COINS) {
  let B1, B4, D; try { B1 = ld(s, '1h'); B4 = ld(s, '4h'); D = ld(s, '1d'); } catch (e) { console.log('mangler', s); continue; }
  let busyTo = 0, j1 = 0, jd = 0;
  for (let k = 200; k < B4.length - 1; k++) {
    const t = B4[k].t + 4 * H; if (t <= busyTo) continue;
    while (j1 + 1 < B1.length && B1[j1 + 1].t + H <= t) j1++;
    while (jd + 1 < D.length && D[jd + 1].t + 864e5 <= t) jd++;
    if (j1 < 200 || jd < 60 || B1[j1].t + H > t || D[jd].t + 864e5 > t) continue;
    // samme vinduer som nettsiden henter (500 candles per tidsramme)
    const tf = { '1h': RG.assess(B1.slice(Math.max(0, j1 - 499), j1 + 1)), '4h': RG.assess(B4.slice(Math.max(0, k - 499), k + 1)), '1d': RG.assess(D.slice(Math.max(0, jd - 499), jd + 1)) };
    const c = RG.conclude(tf, null, B1[j1].c); if (c.code !== 'long' && c.code !== 'short') continue;
    const st = c.setup, dir = st.dir, e = j1 + 1; if (e >= B1.length) break;
    const entry = B1[e].o, risk = Math.abs(entry - st.stop);
    if (dir * (entry - st.stop) <= 0 || dir * (st.t1 - entry) <= 0) continue;
    let out = null, i = e;
    for (; i < B1.length && B1[i].t < B1[e].t + 30 * 864e5; i++) { const b = B1[i];
      if (dir > 0 ? b.l <= st.stop : b.h >= st.stop) { out = st.stop; break; }
      if (dir > 0 ? b.h >= st.t1 : b.l <= st.t1) { out = st.t1; break; } }
    if (out == null) { i = Math.min(i, B1.length - 1); out = B1[i].c; }
    const R = (dir * (out - entry) - COST * (entry + out)) / risk;
    all.push({ s, t: B1[e].t, dir, R, rr: st.rr, bars: i - e }); busyTo = B1[i].t;
  }
}
const st = a => { const n = a.length, m = n ? a.reduce((x, y) => x + y.R, 0) / n : 0, sd = n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y.R - m) ** 2, 0) / (n - 1)) : 0;
  return { n, expR: +m.toFixed(3), t: n > 1 && sd ? +(m / (sd / Math.sqrt(n))).toFixed(2) : null, win: n ? +(a.filter(x => x.R > 0).length / n).toFixed(2) : null }; };
const ts = all.map(x => x.t), t0 = Math.min(...ts), t1 = Math.max(...ts), cut = t0 + 0.6 * (t1 - t0), cut2 = t0 + 0.8 * (t1 - t0);
const res = { cost: COST, from: new Date(t0).toISOString().slice(0, 10), to: new Date(t1).toISOString().slice(0, 10), built: new Date().toISOString(),
  all: st(all), long: st(all.filter(x => x.dir > 0)), short: st(all.filter(x => x.dir < 0)),
  byPeriod: { first60: st(all.filter(x => x.t < cut)), next20: st(all.filter(x => x.t >= cut && x.t < cut2)), last20: st(all.filter(x => x.t >= cut2)) },
  byCoin: Object.fromEntries(COINS.map(s => [s, st(all.filter(x => x.s === s))])) };
console.log(JSON.stringify(res, null, 1));
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(res));
