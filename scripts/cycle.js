// Syklus-fanen: Bitcoins plass i syklusen, med de samme typene data som makroanalytikere bruker:
// 200- og 50-ukerslinja, realisert pris og MVRV (Coin Metrics, gratisversjonen), vårt eget risikomål (0–1),
// strømmer inn og ut av børser, sosial interesse (sidevisninger av «Bitcoin» på Wikipedia),
// Bitcoin målt mot aksjer, gull og olje, syklusklokke og røde uker på rad.
// Kalles fra scripts/events.js (som allerede har hentet kursene). Skriver site/data/cycle.json.
'use strict';
const DAY = 864e5;
const iso = d => new Date(d * DAY).toISOString().slice(0, 10);
const r3 = v => v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000;
const sig = v => v == null || !isFinite(v) ? null : +Number(v).toPrecision(5);
const sma = (v, n) => { const o = new Array(v.length).fill(null); let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), x = q * (s.length - 1), lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); };
// ukelukk: mandag–søndag (UTC). d = siste dag med data i uka.
function weekly(S) { const W = []; for (const x of S) { const wd = (new Date(x.d * DAY).getUTCDay() + 6) % 7, w = x.d - wd; const L = W[W.length - 1]; if (!L || L.w !== w) W.push({ w, d: x.d, v: x.v }); else { L.d = x.d; L.v = x.v; } } return W; }
const valAt = (S, d) => { let lo = 0, hi = S.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (S[m].d <= d) { r = m; lo = m + 1; } else hi = m - 1; } return r >= 0 && d - S[r].d <= 10 ? S[r].v : null; };
// Prosentil av verdien blant alle tidligere verdier (kun fortiden – ingen innsyn i framtiden)
function expandingPct(v, minN) { const o = new Array(v.length).fill(null), seen = [];
  for (let i = 0; i < v.length; i++) { if (v[i] == null) continue; if (seen.length >= minN) { let lo = 0, hi = seen.length; while (lo < hi) { const m = (lo + hi) >> 1; if (seen[m] < v[i]) lo = m + 1; else hi = m; } o[i] = lo / seen.length; }
    let lo = 0, hi = seen.length; while (lo < hi) { const m = (lo + hi) >> 1; if (seen[m] < v[i]) lo = m + 1; else hi = m; } seen.splice(lo, 0, v[i]); }
  return o; }

function compute({ btc, spx, gold, oil, cm, wiki, now = Date.now() }) {
  const today = Math.floor(now / DAY);
  const W = weekly(btc), wv = W.map(x => x.v), w200 = sma(wv, 200), w50 = sma(wv, 50), N = W.length;
  // daglige mål: Mayer (kurs / 200-dagers snitt)
  const dv = btc.map(x => x.v), d200 = sma(dv, 200), dIdx = new Map(btc.map((x, i) => [x.d, i]));
  // on-chain fra Coin Metrics: realisert pris = markedsverdi / MVRV / antall bitcoins. MVRV-Z = (markedsverdi − realisert verdi) / standardavvik av markedsverdi (bare fortiden).
  const oc = (cm || []).filter(x => x.mvrv > 0 && x.mcap > 0 && x.sply > 0).map(x => ({ d: x.d, rp: x.mcap / x.mvrv / x.sply, mvrv: x.mvrv, mcap: x.mcap, rcap: x.mcap / x.mvrv, inEx: x.inEx, outEx: x.outEx, exSply: x.exSply }));
  { let n = 0, s = 0, s2 = 0; for (const x of oc) { n++; s += x.mcap; s2 += x.mcap * x.mcap; const sd = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)); x.z = n >= 365 && sd > 0 ? (x.mcap - x.rcap) / sd : null; } }
  const ocBy = d => { let lo = 0, hi = oc.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (oc[m].d <= d) { r = m; lo = m + 1; } else hi = m - 1; } return r >= 0 && d - oc[r].d <= 7 ? oc[r] : null; };
  // per uke
  const rows = W.map((x, k) => { const i = dIdx.get(x.d), o = ocBy(x.d);
    return { d: x.d, p: x.v, w200: w200[k], w50: w50[k], mayer: i != null && d200[i] ? x.v / d200[i] : null, rp: o ? o.rp : null, mvrv: o ? o.mvrv : null, z: o ? o.z : null }; });
  // vårt risikomål: snitt av prosentilene (kun fortiden) for avstand til 200-ukerslinja, MVRV-Z og Mayer
  const pW = expandingPct(rows.map(r => r.w200 ? Math.log(r.p / r.w200) : null), 104), pZ = expandingPct(rows.map(r => r.z), 104), pM = expandingPct(rows.map(r => r.mayer ? Math.log(r.mayer) : null), 104);
  rows.forEach((r, k) => { const a = [pW[k], pZ[k], pM[k]].filter(v => v != null); r.risk = a.length >= 2 ? a.reduce((s, v) => s + v, 0) / a.length : null; });
  // syklusene (topp = rekord før fall på over 50 %, bunn = laveste før ny rekord)
  const cyc = []; { let ath = 0, athK = 0, k = 0; while (k < N) { if (wv[k] > ath) { ath = wv[k]; athK = k; } else if (wv[k] < ath * 0.5 && W[athK].d - W[0].d > 180) { let mn = k, j = k; while (j < N && wv[j] < ath) { if (wv[j] < wv[mn]) mn = j; j++; }
        cyc.push({ top: iso(W[athK].d), topP: sig(ath), bot: iso(W[mn].d), botP: sig(wv[mn]), fall: r3(wv[mn] / ath - 1), weeks: mn - athK, done: j < N, botK: mn, topK: athK }); k = j; ath = j < N ? wv[j] : ath; athK = j < N ? j : athK; continue; } k++; } }
  const athK = wv.indexOf(Math.max(...wv)), cur = { weeksSinceAth: N - 1 - athK, ath: sig(wv[athK]), athD: iso(W[athK].d) };
  // verdiene ved tidligere bunner (for sammenligning i nøkkeltallene)
  const atBot = cyc.filter(c => c.done).map(c => { const r = rows[c.botK]; return { d: c.bot, p: c.botP, vs200: r.w200 ? r3(r.p / r.w200 - 1) : null, vsRp: r.rp ? r3(r.p / r.rp - 1) : null, z: r3(r.z), risk: r3(r.risk), mvrv: r3(r.mvrv) }; });
  const atTop = cyc.map(c => { const r = rows[c.topK]; return { d: c.top, p: c.topP, z: r3(r.z), risk: r3(r.risk), mvrv: r3(r.mvrv) }; });
  // røde uker på rad (ukelukk lavere enn uka før) – nå, og lengste rekker før tidligere bunner
  let red = 0; for (let k = N - 1; k > 0 && wv[k] < wv[k - 1]; k--) red++;
  const streaks = []; { let run = 0; for (let k = 1; k < N; k++) { run = wv[k] < wv[k - 1] ? run + 1 : 0; if (run >= 5 && (k === N - 1 || !(wv[k + 1] < wv[k]))) streaks.push({ end: iso(W[k].d), n: run, fall: r3(wv[k] / wv[k - run] - 1) }); } }
  // 50-ukerslinja: etter hver gjenvinning (2 ukelukk over etter 12+ under) – hvor langt over kom kursen, og falt den tilbake?
  const ext = []; for (let k = 14; k < N; k++) { if (!w50[k] || !w50[k - 1] || !(wv[k] > w50[k] && wv[k - 1] > w50[k - 1])) continue; let below = true; for (let q = k - 13; q < k - 1; q++) if (!w50[q] || wv[q] >= w50[q]) { below = false; break; } if (!below) continue;
    let mx = 0, back = null; for (let q = k; q < Math.min(N, k + 26); q++) { mx = Math.max(mx, wv[q] / w50[q] - 1); if (back == null && wv[q] < w50[q] && wv[q - 1] < w50[q - 1]) back = q - k; }
    ext.push({ d: iso(W[k].d), maxExt: r3(mx), backWeeks: back, open: k + 26 > N, r52: k + 52 < N ? r3(wv[k + 52] / wv[k] - 1) : null }); }
  // børsstrømmer per uke (USD inn − ut) og børsbeholdning (BTC)
  const flows = []; { let cw = null; for (const x of oc) { if (x.inEx == null || x.outEx == null) continue; const wd = (new Date(x.d * DAY).getUTCDay() + 6) % 7, w = x.d - wd; if (!cw || cw.w !== w) { cw = { w, d: x.d, net: 0, inE: 0, ex: null }; flows.push(cw); } cw.d = x.d; cw.net += x.inEx - x.outEx; cw.inE += x.inEx; if (x.exSply != null) cw.ex = x.exSply; } }
  if (flows.length && flows[flows.length - 1].d - flows[flows.length - 1].w < 6) flows.pop(); // inneværende uke er ikke ferdig
  const inPct = expandingPct(flows.map(f => f.inE), 104);
  // sosial interesse: Wikipedia-visninger per uke
  const wk = []; { let cw = null; for (const x of (wiki || [])) { const wd = (new Date(x.d * DAY).getUTCDay() + 6) % 7, w = x.d - wd; if (!cw || cw.w !== w) { cw = { w, d: x.d, v: 0, n: 0 }; wk.push(cw); } cw.d = x.d; cw.v += x.v; cw.n++; } }
  const wkFull = wk.filter(x => x.n === 7 || x === wk[wk.length - 1]).map(x => ({ d: x.d, v: Math.round(x.v * 7 / x.n) }));
  // relativ styrke: BTC målt i S&P 500, gull og olje
  const rel = {}; for (const [k, S, nm] of [['spx', spx, 'S&P 500'], ['gold', gold, 'gull'], ['oil', oil, 'olje']]) { if (!S || !S.length) continue;
    const pts = W.map(x => { const v = valAt(S, x.d); return v ? { d: x.d, v: x.v / v } : null; }).filter(Boolean); if (pts.length < 60) continue; const L = pts[pts.length - 1];
    const ytd0 = pts.filter(x => new Date(x.d * DAY).getUTCFullYear() < new Date(L.d * DAY).getUTCFullYear()).pop(), y1 = pts.filter(x => x.d <= L.d - 365).pop();
    rel[k] = { name: nm, ytd: ytd0 ? r3(L.v / ytd0.v - 1) : null, y1: y1 ? r3(L.v / y1.v - 1) : null, from: iso(pts[0].d), s: pts.map(x => [x.d, sig(x.v)]) }; }
  // nå
  const L = rows[N - 1], lastD = btc[btc.length - 1], o = oc[oc.length - 1];
  const nowRisk = rows.slice().reverse().find(r => r.risk != null);
  const fl4 = flows.slice(-4), inNow = inPct[inPct.length - 1];
  const now0 = { d: iso(lastD.d), p: sig(lastD.v), weekD: iso(L.d), weekP: sig(L.p), w200: sig(L.w200), vs200: L.w200 ? r3(lastD.v / L.w200 - 1) : null, under30: L.w200 ? sig(L.w200 * 0.7) : null,
    w50: sig(L.w50), vs50: L.w50 ? r3(lastD.v / L.w50 - 1) : null, rp: o ? sig(o.rp) : null, rpD: o ? iso(o.d) : null, vsRp: o ? r3(lastD.v / o.rp - 1) : null, mvrv: o ? r3(o.mvrv) : null, z: o ? r3(o.z) : null,
    risk: nowRisk ? r3(nowRisk.risk) : null, red, ...cur, net4w: fl4.length ? Math.round(fl4.reduce((s, f) => s + f.net, 0)) : null, inPct: r3(inNow), ex: flows.length ? flows[flows.length - 1].ex : null,
    ex1y: (() => { const f = flows.filter(x => x.ex != null); if (f.length < 53) return null; return r3(f[f.length - 1].ex / f[f.length - 53].ex - 1); })(),
    wiki4w: wkFull.length ? Math.round(wkFull.slice(-4).reduce((s, x) => s + x.v, 0) / Math.min(4, wkFull.length)) : null, wikiMax: wkFull.length ? Math.max(...wkFull.map(x => x.v)) : null };
  return { built: new Date(now).toISOString(), now: now0, cycles: cyc.map(({ botK, topK, ...c }) => c), atBot, atTop, streaks: streaks.slice(-12), ext,
    w: rows.map(r => [r.d, sig(r.p), sig(r.w200), sig(r.w50), sig(r.rp), r3(r.z), r3(r.risk), r3(r.mvrv)]),
    flows: flows.map((f, k) => [f.d, Math.round(f.net / 1e6), f.ex != null ? Math.round(f.ex) : null, r3(inPct[k])]),
    wiki: wkFull.map(x => [x.d, x.v]), rel, src: { price: 'Bitstamp (dagslukk)', onchain: oc.length ? 'Coin Metrics Community (CapMVRVCur, CapMrktCurUSD, SplyCur, FlowInExUSD, FlowOutExUSD, SplyExNtv)' : null, wiki: wk.length ? 'Wikimedia: sidevisninger av «Bitcoin» på engelsk Wikipedia' : null } };
}

// ------------------------------------------------------------------ henting (brukes av events.js)
async function fetchCM(get) { const out = new Map(); let next = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,CapMrktCurUSD,SplyCur,FlowInExUSD,FlowOutExUSD,SplyExNtv&frequency=1d&page_size=10000&start_time=2010-07-18';
  for (let k = 0; k < 10 && next; k++) { const j = await get(next); for (const x of j.data) { const d = Math.floor(Date.parse(x.time) / DAY); out.set(d, { d, mvrv: +x.CapMVRVCur || null, mcap: +x.CapMrktCurUSD || null, sply: +x.SplyCur || null, inEx: x.FlowInExUSD != null ? +x.FlowInExUSD : null, outEx: x.FlowOutExUSD != null ? +x.FlowOutExUSD : null, exSply: x.SplyExNtv != null ? +x.SplyExNtv : null }); } next = j.next_page_url || null; }
  return [...out.values()].sort((a, b) => a.d - b.d); }
async function fetchWiki(get) { const end = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const j = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Bitcoin/daily/20150701/${end}`);
  return j.items.map(x => ({ d: Math.floor(Date.UTC(+x.timestamp.slice(0, 4), +x.timestamp.slice(4, 6) - 1, +x.timestamp.slice(6, 8)) / DAY), v: x.views })); }
module.exports = { compute, fetchCM, fetchWiki, expandingPct, weekly };
