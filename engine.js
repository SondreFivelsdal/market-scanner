/* Market Scanner – analysemotor v2 (AI Crypto Analyst).
 * Ren JavaScript uten avhengigheter. Kjører i dashbordet (window.MS) og i Node (module.exports).
 * Input: daglige og 4-timers candles fra Binance (lukkede candles). Alle beregninger er deterministiske.
 * Ingen beregning bruker data etter tidspunktet den gjelder (se testene i test_engine.js).
 */
(function (root) {
'use strict';
const COINS = ['BTC', 'XRP', 'ADA', 'POL', 'SAND'];
const NAMES = { BTC: 'Bitcoin', XRP: 'XRP', ADA: 'Cardano', POL: 'Polygon', SAND: 'The Sandbox' };
// horisonter (dager) for historiske estimater: 1 uke, 30 dager, 3, 6 og 12 måneder
const HZ = [7, 30, 90, 180, 365];
const DAY = 864e5;

// ---------------------------------------------------------------- indikatorer (fra engine.js v1)
const ema = (a, n) => { const k = 2 / (n + 1); const o = new Array(a.length).fill(null); let p = null;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) continue; p = p == null ? v : v * k + p * (1 - k); o[i] = i >= n - 1 ? p : null; } return o; };
const emaRaw = (a, n) => { const k = 2 / (n + 1); const o = []; let p = null; for (const v of a) { if (v == null || isNaN(v)) { o.push(p); continue; } p = p == null ? v : v * k + p * (1 - k); o.push(p); } return o; };
const sma = (a, n) => { const o = new Array(a.length).fill(null); let s = 0, cnt = 0;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) { s = 0; cnt = 0; continue; } s += v; cnt++; if (cnt > n) { s -= a[i - n]; cnt = n; } if (cnt === n) o[i] = s / n; } return o; };
function rsi(c, n = 14) { const o = new Array(c.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
function atr(h, l, c, n = 14) { const tr = c.map((_, i) => i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  const o = new Array(c.length).fill(null); let p = null; for (let i = 0; i < tr.length; i++) { if (i < n - 1) continue; if (i === n - 1) { p = tr.slice(0, n).reduce((a, b) => a + b, 0) / n; } else p = (p * (n - 1) + tr[i]) / n; o[i] = p; } return o; }
function waveTrend(h, l, c, n1 = 9, n2 = 12) { const ap = c.map((v, i) => (h[i] + l[i] + v) / 3); const esa = emaRaw(ap, n1);
  const d = emaRaw(ap.map((v, i) => Math.abs(v - esa[i])), n1); const ci = ap.map((v, i) => d[i] ? (v - esa[i]) / (0.015 * d[i]) : 0);
  const wt1 = emaRaw(ci, n2); const wt2 = sma(wt1, 3); return { wt1, wt2 }; }
function moneyFlow(o, h, l, c, n = 60) { const r = c.map((v, i) => h[i] - l[i] > 0 ? ((v - o[i]) / (h[i] - l[i])) * 150 : 0); return sma(r, n).map(v => v == null ? null : v - 2.5); }
function macd(c, f = 12, s = 26, g = 9) { const a = emaRaw(c, f), b = emaRaw(c, s); const line = c.map((_, i) => i >= s - 1 ? a[i] - b[i] : null);
  const sig = ema(line, g); const hist = line.map((v, i) => v == null || sig[i] == null ? null : v - sig[i]); return { line, sig, hist }; }
function pivots(a, left = 3, right = 3, type = 'high') { const out = []; for (let i = left; i < a.length - right; i++) { let ok = true;
  for (let j = i - left; j <= i + right; j++) { if (j === i) continue; if (type === 'high' ? a[j] > a[i] : a[j] < a[i]) { ok = false; break; } } if (ok) out.push(i); } return out; }
function divergence(h, l, osc, lookback = 60, recent = 12) { const N = h.length; const res = { bear: false, bull: false };
  const ph = pivots(h, 3, 2, 'high').filter(i => i > N - lookback); if (ph.length >= 2) { const a = ph[ph.length - 2], b = ph[ph.length - 1];
    if (b >= N - recent && h[b] > h[a] && osc[b] != null && osc[a] != null && osc[b] < osc[a] - 2) res.bear = { from: a, to: b }; }
  const pl = pivots(l, 3, 2, 'low').filter(i => i > N - lookback); if (pl.length >= 2) { const a = pl[pl.length - 2], b = pl[pl.length - 1];
    if (b >= N - recent && l[b] < l[a] && osc[b] != null && osc[a] != null && osc[b] > osc[a] + 2) res.bull = { from: a, to: b }; }
  return res; }

const pct = (a, b) => (a / b - 1) * 100;
const last = a => a[a.length - 1];
const r1 = v => v == null || !isFinite(v) ? null : Math.round(v * 10) / 10;
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const r4 = v => v == null || !isFinite(v) ? null : Math.round(v * 1e4) / 1e4;
const sig = v => v == null ? null : +Number(v).toPrecision(5);
const s4 = v => v == null ? null : +Number(v).toPrecision(4);
const clip = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const fmtP = v => v == null || !isFinite(v) ? '–' : v >= 1000 ? Math.round(v).toLocaleString('nb-NO').replace(/[  ]/g, ' ') : v >= 1 ? v.toLocaleString('nb-NO', { maximumFractionDigits: 3 }) : v.toLocaleString('nb-NO', { maximumSignificantDigits: 4 });
const fmtPct = (v, d = 1) => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
const nbf = (v, d = 1) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/−/g, '−');
const dstr = t => new Date(t).toISOString().slice(0, 10);
const dnb = t => new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const quant = (arr, q) => { const a = arr.filter(v => v != null && isFinite(v)).sort((x, y) => x - y); if (!a.length) return null; const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return a[lo] + (a[hi] - a[lo]) * (p - lo); };
const mean = a => { const b = a.filter(v => v != null && isFinite(v)); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : null; };
// Wilson-intervall (90 %) for en andel k/n
function wilson(k, n, z = 1.645) { if (!n) return [null, null]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; }

// ---------------------------------------------------------------- data
// rader: {sym, t (ms, åpningstid), o, h, l, c, qv}
function prep(rows) { const by = {}; for (const r of rows || []) { const s = r.sym; if (!s) continue; (by[s] = by[s] || []).push(r); }
  const out = {}; for (const s in by) { const a = by[s].map(r => ({ t: +r.t, o: +r.o, h: +r.h, l: +r.l, c: +r.c, v: +r.qv })).filter(r => isFinite(r.t) && r.c > 0).sort((x, y) => x.t - y.t);
    const u = []; for (const r of a) { if (u.length && u[u.length - 1].t === r.t) u[u.length - 1] = r; else u.push(r); }
    out[s] = { t: u.map(r => r.t), o: u.map(r => r.o), h: u.map(r => r.h), l: u.map(r => r.l), c: u.map(r => r.c), v: u.map(r => r.v) }; }
  return out; }
const sliceD = (D, a, b) => ({ t: D.t.slice(a, b), o: D.o.slice(a, b), h: D.h.slice(a, b), l: D.l.slice(a, b), c: D.c.slice(a, b), v: D.v.slice(a, b) });
// ukecandles (mandag 00:00 UTC, som Binance 1w) bygget fra dagscandles
function toWeekly(D) { const W = { t: [], o: [], h: [], l: [], c: [], v: [] };
  for (let i = 0; i < D.t.length; i++) { const d = new Date(D.t[i]); const wk = D.t[i] - ((d.getUTCDay() + 6) % 7) * DAY;
    if (!W.t.length || last(W.t) !== wk) { W.t.push(wk); W.o.push(D.o[i]); W.h.push(D.h[i]); W.l.push(D.l[i]); W.c.push(D.c[i]); W.v.push(D.v[i]); }
    else { const k = W.t.length - 1; W.h[k] = Math.max(W.h[k], D.h[i]); W.l[k] = Math.min(W.l[k], D.l[i]); W.c[k] = D.c[i]; W.v[k] += D.v[i]; } }
  return W; }

// ---------------------------------------------------------------- eksisterende analyse (v1, beholdt)
function tfOsc(d) { const { wt1, wt2 } = waveTrend(d.h, d.l, d.c); const R = rsi(d.c); const MF = moneyFlow(d.o, d.h, d.l, d.c);
  const N = d.c.length; let cross = null;
  for (let i = N - 1; i > N - 15 && i > 0; i--) { if (wt2[i] == null || wt2[i - 1] == null) break;
    if (wt1[i - 1] <= wt2[i - 1] && wt1[i] > wt2[i]) { cross = { dir: 'opp', barsAgo: N - 1 - i, level: wt1[i] }; break; }
    if (wt1[i - 1] >= wt2[i - 1] && wt1[i] < wt2[i]) { cross = { dir: 'ned', barsAgo: N - 1 - i, level: wt1[i] }; break; } }
  return { wt1, wt2, rsi: R, mf: MF, cross, div: divergence(d.h, d.l, R) }; }

function analyseV1(sym, D, W, H4) {
  const c = D.c, N = c.length, price = last(c);
  const e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200); const A = atr(D.h, D.l, c, 14);
  const wE21 = ema(W.c, 21), wS20 = sma(W.c, 20); const wR = rsi(W.c); const wWT = waveTrend(W.h, W.l, W.c);
  const od = tfOsc(D), o4 = tfOsc(H4);
  const has200 = last(e200) != null, atrPct = last(A) / price * 100;
  let s = 0, max = 0; const why = [];
  const add = (cond, w, pos, neg) => { if (cond == null) return; max += w; if (cond) { s += w; if (pos) why.push({ t: pos, s: 1 }); } else { s -= w; if (neg) why.push({ t: neg, s: -1 }); } };
  if (has200) {
    const d200 = pct(price, last(e200));
    add(price > last(e200), 2, `Pris ${nbf(d200, 0)} % over 200-dagers snitt`, `Pris ${nbf(Math.abs(d200), 0)} % under 200-dagers snitt`);
    let cx = null; for (let i = N - 1; i > 200; i--) { if (e50[i - 1] == null || e200[i - 1] == null) break; if ((e50[i] > e200[i]) !== (e50[i - 1] > e200[i - 1])) { cx = i; break; } }
    const gc = last(e50) > last(e200);
    add(gc, 1.5, `Golden cross (50D over 200D)${cx ? ' siden ' + dstr(D.t[cx]) : ''}`, `Death cross (50D under 200D)${cx ? ' siden ' + dstr(D.t[cx]) : ''}`);
    const slope = pct(last(e200), e200[N - 21]);
    add(slope > 0, 1, `200D-snittet stiger (${nbf(slope, 1)} % siste 20 dager)`, `200D-snittet faller (${nbf(slope, 1)} % siste 20 dager)`);
  }
  const bmsb = Math.min(last(wE21) ?? Infinity, last(wS20) ?? Infinity);
  const bmsbTop = Math.max(last(wE21) ?? -Infinity, last(wS20) ?? -Infinity);
  if (isFinite(bmsb)) add(price > bmsbTop ? true : price < bmsb ? false : null, 1.5, 'Over «bull market support band» (20W SMA / 21W EMA)', 'Under «bull market support band» (20W SMA / 21W EMA)');
  if (last(wR) != null) add(last(wR) > 50, 1, `Ukentlig RSI ${nbf(last(wR), 0)} (over 50)`, `Ukentlig RSI ${nbf(last(wR), 0)} (under 50)`);
  if (last(wWT.wt2) != null) add(last(wWT.wt1) > last(wWT.wt2), 0.75, 'Ukentlig WaveTrend peker opp', 'Ukentlig WaveTrend peker ned');
  const wS50 = sma(W.c, 50); if (last(wS50) != null) add(price > last(wS50), 1.5, `Over 50-ukers snitt (${fmtP(last(wS50))}) – syklus-trend positiv`, `Under 50-ukers snitt (${fmtP(last(wS50))}) – syklus-trend fortsatt svak`);
  const hi52 = Math.max(...D.h.slice(-365)), dd = pct(price, hi52);
  add(dd > -20 ? true : dd < -40 ? false : null, 1, `Nær 52-ukers topp (${nbf(dd, 0)} %)`, `${nbf(Math.abs(dd), 0)} % under 52-ukers topp`);
  if (dd <= -20 && dd >= -40) why.push({ t: `${nbf(Math.abs(dd), 0)} % under 52-ukers topp`, s: 0 });
  const gcNow = last(e50) != null && last(e200) != null && last(e50) > last(e200), above200 = has200 && price > last(e200);
  const phase = !has200 ? 'For kort historikk' :
    above200 && gcNow && dd > -20 ? 'Etablert opptrend' :
    above200 && gcNow ? 'Bedring etter nedtur (tidlig opptrend)' :
    above200 && !gcNow ? 'Mulig trendskifte opp (venter golden cross)' :
    !above200 && gcNow ? 'Svekkelse i opptrend' :
    pct(price, last(e50)) > 0 ? 'Nedtrend – forsøker å bunne' : 'Nedtrend';
  const longScore = max ? Math.round(s / max * 100) : 0;
  let longLabel = longScore >= 55 ? 'Sterk bullish' : longScore >= 20 ? 'Bullish' : longScore > -20 ? 'Nøytral' : longScore > -55 ? 'Bearish' : 'Sterk bearish';
  if (longLabel === 'Sterk bullish' && phase.startsWith('Bedring')) longLabel = 'Bullish';
  // kortsiktig swing
  let bear = 0, bull = 0; const sw = [];
  const W1d = last(od.wt1), W4 = last(o4.wt1), R1d = last(od.rsi), MF1d = last(od.mf);
  const ext = last(e20) != null && last(A) ? (price - last(e20)) / last(A) : 0;
  const b = (w, t) => { bear += w; sw.push({ t, s: -1 }); }, u = (w, t) => { bull += w; sw.push({ t, s: 1 }); };
  if (W1d > 60) b(2, `WaveTrend døgn overkjøpt (${nbf(W1d, 0)})`); else if (W1d > 45) b(1, `WaveTrend døgn høy (${nbf(W1d, 0)})`);
  if (W1d < -60) u(2, `WaveTrend døgn oversolgt (${nbf(W1d, 0)})`); else if (W1d < -45) u(1, `WaveTrend døgn lav (${nbf(W1d, 0)})`);
  if (W4 > 53) b(1, `WaveTrend 4t overkjøpt (${nbf(W4, 0)})`); if (W4 < -53) u(1, `WaveTrend 4t oversolgt (${nbf(W4, 0)})`);
  if (od.cross && od.cross.barsAgo <= 3) { const ago = od.cross.barsAgo === 0 ? 'siste dagslukk' : od.cross.barsAgo + ' d siden';
    if (od.cross.dir === 'ned' && od.cross.level > 20) b(1.5, `WaveTrend døgn krysset ned fra høyt nivå (rød prikk, ${ago})`);
    if (od.cross.dir === 'opp' && od.cross.level < -20) u(1.5, `WaveTrend døgn krysset opp fra lavt nivå (grønn prikk, ${ago})`); }
  if (o4.cross && o4.cross.barsAgo <= 4) { if (o4.cross.dir === 'ned' && o4.cross.level > 40) b(0.75, 'WaveTrend 4t krysset ned i overkjøpt sone');
    if (o4.cross.dir === 'opp' && o4.cross.level < -40) u(0.75, 'WaveTrend 4t krysset opp i oversolgt sone'); }
  if (R1d > 72) b(1.5, `RSI døgn ${nbf(R1d, 0)} (overkjøpt)`); else if (R1d > 65) b(0.5, `RSI døgn ${nbf(R1d, 0)} (høy)`);
  if (R1d < 28) u(1.5, `RSI døgn ${nbf(R1d, 0)} (oversolgt)`); else if (R1d < 35) u(0.5, `RSI døgn ${nbf(R1d, 0)} (lav)`);
  if (od.div.bear) b(2, 'Bearish RSI-divergens på døgn (høyere topp i pris, lavere i RSI)');
  if (od.div.bull) u(2, 'Bullish RSI-divergens på døgn (lavere bunn i pris, høyere i RSI)');
  if (o4.div.bear) b(1.25, 'Bearish RSI-divergens på 4t'); if (o4.div.bull) u(1.25, 'Bullish RSI-divergens på 4t');
  if (ext > 3) b(1.5, `Pris strukket ${nbf(ext, 1)} ATR over 20D-snittet`); else if (ext > 2) b(0.75, `Pris ${nbf(ext, 1)} ATR over 20D-snittet`);
  if (ext < -3) u(1.5, `Pris strukket ${nbf(Math.abs(ext), 1)} ATR under 20D-snittet`); else if (ext < -2) u(0.75, `Pris ${nbf(Math.abs(ext), 1)} ATR under 20D-snittet`);
  if (MF1d != null) { const ch7 = pct(price, c[N - 8]);
    if (ch7 > 5 && MF1d < 0) b(1, 'Pengestrøm (money flow) negativ selv om prisen har steget');
    if (ch7 < -5 && MF1d > 0) u(1, 'Pengestrøm (money flow) positiv selv om prisen har falt'); }
  const bias = bear >= 2.5 && bear > bull + 1 ? 'Korreksjon' : bull >= 2.5 && bull > bear + 1 ? 'Rebound' : 'Nøytral';
  let context = '';
  if (bias === 'Korreksjon' && longScore >= 20) context = 'Korreksjon i en opptrend – historisk ofte et kjøpsområde ved støtte, ikke et trendskifte.';
  if (bias === 'Korreksjon' && longScore <= -20) context = 'Korreksjon i en nedtrend – trend og swing peker samme vei (svakhet).';
  if (bias === 'Rebound' && longScore <= -20) context = 'Rebound i en nedtrend – motstandsnivåer er ofte salgsområder.';
  if (bias === 'Rebound' && longScore >= 20) context = 'Rebound i en opptrend – trend og swing peker samme vei.';
  return { sym, price, atrPctNum: atrPct,
    chg: { d1: r2(pct(price, c[N - 2])), d7: r2(pct(price, c[N - 8])), d30: r2(pct(price, c[N - 31])), dd52: r2(dd) },
    long: { score: longScore, label: longLabel, phase, why },
    swing: { bias, bull: r2(bull), bear: r2(bear), context, why: sw },
    ind: { rsi1d: r2(R1d), rsi4h: r2(last(o4.rsi)), wt1d: r2(W1d), wt4h: r2(W4), mf1d: r2(MF1d), ext: r2(ext), d200: has200 ? r2(pct(price, last(e200))) : null, d50: r2(pct(price, last(e50))), wcross: od.cross, wcross4: o4.cross,
      wRsi: r1(last(wR)), div: { d: !!(od.div.bull || od.div.bear) && (od.div.bull ? 'bull' : 'bear'), h4: !!(o4.div.bull || o4.div.bear) && (o4.div.bull ? 'bull' : 'bear') } } };
}

// ---------------------------------------------------------------- nivåer (v1, med forbedret statistikk)
function levelCandidates(D, W) {
  const c = D.c, N = c.length, price = last(c);
  const out = []; const add = (p, src, w, kind, t) => { if (p > 0 && isFinite(p)) out.push({ p, src, w, kind, t }); };
  const s0 = Math.max(0, N - 365);
  const dh = D.h.slice(s0), dl = D.l.slice(s0);
  pivots(dh, 5, 5, 'high').forEach(i => add(dh[i], 'Daglig topp ' + dstr(D.t[s0 + i]), 1 + 0.5 * ((s0 + i) > N - 120), 'pivot', D.t[s0 + i]));
  pivots(dl, 5, 5, 'low').forEach(i => add(dl[i], 'Daglig bunn ' + dstr(D.t[s0 + i]), 1 + 0.5 * ((s0 + i) > N - 120), 'pivot', D.t[s0 + i]));
  const w0 = Math.max(0, W.c.length - 150), wh = W.h.slice(w0), wl = W.l.slice(w0);
  pivots(wh, 3, 2, 'high').forEach(i => add(wh[i], 'Ukentlig topp ' + dstr(W.t[w0 + i]), 2, 'pivot', W.t[w0 + i]));
  pivots(wl, 3, 2, 'low').forEach(i => add(wl[i], 'Ukentlig bunn ' + dstr(W.t[w0 + i]), 2, 'pivot', W.t[w0 + i]));
  add(last(ema(c, 20)), '20D EMA', 0.75, 'ma'); add(last(ema(c, 50)), '50D EMA', 1.5, 'ma'); add(last(ema(c, 200)), '200D EMA', 2, 'ma');
  add(last(ema(W.c, 21)), '21W EMA', 1.5, 'ma'); add(last(sma(W.c, 20)), '20W SMA', 1.25, 'ma'); add(last(sma(W.c, 50)), '50W SMA', 2, 'ma');
  const hiI = s0 + dh.indexOf(Math.max(...dh)), loI = s0 + dl.indexOf(Math.min(...dl)); const hi = D.h[hiI], lo = D.l[loI];
  const down = hiI < loI;
  [[0.382, 1], [0.5, 1.25], [0.618, 1.25], [0.786, 1]].forEach(([f, w]) => add(down ? lo + (hi - lo) * f : hi - (hi - lo) * f, `Fib ${f} (1 år)`, w, 'fib'));
  const v0 = Math.max(0, N - 180); const vlo = Math.min(...D.l.slice(v0)), vhi = Math.max(...D.h.slice(v0));
  const nb = 60, bw = (vhi - vlo) / nb, bins = new Array(nb).fill(0);
  for (let i = v0; i < N; i++) { const a = Math.max(0, Math.floor((D.l[i] - vlo) / bw)), b = Math.min(nb - 1, Math.floor((D.h[i] - vlo) / bw)); const per = D.v[i] / (b - a + 1); for (let j = a; j <= b; j++) bins[j] += per; }
  const ranked = bins.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const picked = []; for (const r of ranked) { if (picked.length >= 3) break; if (picked.every(p => Math.abs(p.i - r.i) > 4)) picked.push(r); }
  picked.forEach((r, k) => add(vlo + (r.i + 0.5) * bw, k === 0 ? 'Volum-POC (180 d)' : 'Høyvolumsone (180 d)', k === 0 ? 2 : 1.25, 'vol'));
  const step = Math.pow(10, Math.floor(Math.log10(price)) - 1) * 5;
  for (let k = -6; k <= 6; k++) { const p = (Math.round(price / step) + k) * step; if (p > 0) add(p, 'Rundt tall', 0.5, 'round'); }
  return out;
}
function clusterLevels(cands, price, atrAbs) {
  const tol = Math.max(0.35 * atrAbs, price * 0.006);
  const s = cands.filter(x => x.p > price * 0.4 && x.p < price * 1.9).sort((a, b) => a.p - b.p);
  const cl = [];
  for (const x of s) { const g = cl[cl.length - 1]; const tolHere = tol * (x.p / price);
    if (g && x.p - g.items[0].p <= 1.5 * tolHere) g.items.push(x); else cl.push({ items: [x] }); }
  return cl.map(g => { const w = g.items.reduce((a, b) => a + b.w, 0); const p = g.items.reduce((a, b) => a + b.p * b.w, 0) / w;
    const kinds = new Set(g.items.map(i => i.kind)); const piv = g.items.filter(i => i.kind === 'pivot');
    const pivW = piv.reduce((a, b) => a + b.w, 0), other = w - pivW;
    const score = Math.round((Math.min(pivW, 6) + other + (kinds.size - 1) * 0.75) * 10) / 10;
    const src = [...new Set(g.items.filter(i => i.kind !== 'pivot').map(i => i.src))];
    if (piv.length) src.unshift(piv.length + (piv.length > 1 ? ' tidligere vendepunkter' : ' tidligere vendepunkt'));
    return { p, score, piv: piv.length, src, lo: Math.min(...g.items.map(i => i.p)), hi: Math.max(...g.items.map(i => i.p)) }; });
}
// Historisk basisrate: hvor ofte prisen nådde en bevegelse på k ATR innen H dager (dager i samme regime som nå).
// v2: returnerer også antall startdager (n) og omtrentlig antall uavhengige perioder (nEff = n / H), med 90 %-intervall.
function touchStats(D, e200, A) {
  const N = D.c.length, nowAbove = last(D.c) > last(e200);
  const starts = []; for (let t = 200; t < N - 1; t++) { if (A[t] == null || e200[t] == null) continue; starts.push(t); }
  const same = starts.filter(t => (D.c[t] > e200[t]) === nowAbove);
  const pool = same.length >= 150 ? same : starts;
  const nH = H => pool.filter(t => t + H < N).length;
  const TS = { pool, regimeMatched: pool === same, nowAbove, firstDate: pool.length ? D.t[pool[0]] : null,
    prob(kAtr, dir, H) { let n = 0, hit = 0; for (const t of pool) { if (t + H >= N) continue; n++; const thr = kAtr * A[t];
        for (let j = t + 1; j <= t + H; j++) { if (dir > 0 ? D.h[j] - D.c[t] >= thr : D.c[t] - D.l[j] >= thr) { hit++; break; } } }
      return n ? hit / n : null; },
    probX(kAtr, dir, H) { const p = TS.prob(kAtr, dir, H), n = nH(H), nEff = Math.max(1, Math.floor(n / H)); const [lo, hi] = p == null ? [null, null] : wilson(Math.round(p * nEff), nEff); return { p, n, nEff, lo, hi }; },
    first(kUp, kDn, H) { let n = 0, u = 0, d = 0; for (const t of pool) { if (t + H >= N) continue; n++; const up = kUp * A[t], dn = kDn * A[t];
        for (let j = t + 1; j <= t + H; j++) { const hu = D.h[j] - D.c[t] >= up, hd = D.c[t] - D.l[j] >= dn; if (hu && hd) { (D.c[j] >= D.o[j] ? u++ : d++); break; } if (hu) { u++; break; } if (hd) { d++; break; } } }
      return n ? { up: u / n, down: d / n, none: (n - u - d) / n, n, nEff: Math.max(1, Math.floor(n / H)) } : null; } };
  return TS;
}
function breakoutStatus(D, L, tolPct) {
  const c = D.c, N = c.length, look = 30, conf = Math.max(tolPct * 0.5, 0.005);
  let ev = null;
  for (let i = Math.max(2, N - look); i < N; i++) { const crossUp = c[i - 1] < L && c[i] > L; const crossDn = c[i - 1] > L && c[i] < L; if (crossUp || crossDn) ev = { i, dir: crossUp ? 1 : -1 }; }
  if (!ev) return null;
  const after = c.slice(ev.i), now = last(c);
  const dir = ev.dir, held = after.every(x => dir > 0 ? x > L * (1 - conf) : x < L * (1 + conf));
  const closesBeyond = after.filter(x => dir > 0 ? x > L * (1 + conf) : x < L * (1 - conf)).length;
  const date = dstr(D.t[ev.i]), daysAgo = N - 1 - ev.i;
  if (dir > 0) {
    if (!(now > L)) return { type: 'avvist', dir, date, daysAgo, text: `Brøt over ${fmtP(L)} ${date}, men falt tilbake under – falskt utbrudd` };
    if (closesBeyond >= 2 && held) { const rt = Math.abs(now / L - 1) < tolPct * 1.5; return { type: rt ? 'retest' : 'bekreftet', dir, date, daysAgo,
      text: rt ? `Bekreftet utbrudd over ${fmtP(L)} (${date}) – retester nå nivået ovenfra` : `Bekreftet utbrudd over ${fmtP(L)} (${date}), ${closesBeyond} dagslukk over` }; }
    return { type: 'ubekreftet', dir, date, daysAgo, text: `Ubekreftet utbrudd over ${fmtP(L)} (${date}) – trenger 2 dagslukk over nivået` };
  } else {
    if (!(now < L)) return { type: 'avvist', dir, date, daysAgo, text: `Brøt under ${fmtP(L)} ${date}, men tok det tilbake – falskt brudd (bullish)` };
    if (closesBeyond >= 2 && held) { const rt = Math.abs(now / L - 1) < tolPct * 1.5; return { type: rt ? 'retest' : 'bekreftet', dir, date, daysAgo,
      text: rt ? `Bekreftet brudd under ${fmtP(L)} (${date}) – retester nivået nedenfra (nå motstand)` : `Bekreftet brudd under ${fmtP(L)} (${date}), ${closesBeyond} dagslukk under` }; }
    return { type: 'ubekreftet', dir, date, daysAgo, text: `Ubekreftet brudd under ${fmtP(L)} (${date}) – trenger 2 dagslukk under` };
  }
}
function structure(D) {
  const h = D.h.slice(-180), l = D.l.slice(-180), off = D.h.length - h.length;
  const ph = pivots(h, 5, 5, 'high'), pl = pivots(l, 5, 5, 'low');
  if (ph.length < 2 || pl.length < 2) return { label: 'Uklar', bias: 0, text: 'For få vendepunkter' };
  const hh = h[ph[ph.length - 1]] > h[ph[ph.length - 2]], hl = l[pl[pl.length - 1]] > l[pl[pl.length - 2]];
  const lastHL = l[pl[pl.length - 1]], lastLH = h[ph[ph.length - 1]];
  const pts = { h1: { t: D.t[off + ph[ph.length - 2]], p: h[ph[ph.length - 2]] }, h2: { t: D.t[off + ph[ph.length - 1]], p: lastLH }, l1: { t: D.t[off + pl[pl.length - 2]], p: l[pl[pl.length - 2]] }, l2: { t: D.t[off + pl[pl.length - 1]], p: lastHL } };
  if (hh && hl) return { label: 'Høyere topper og bunner', bias: 1, text: `Opptrend-struktur. Siste høyere bunn ${fmtP(lastHL)} – brudd under den svekker strukturen.`, keyLow: lastHL, keyHigh: lastLH, pts };
  if (!hh && !hl) return { label: 'Lavere topper og bunner', bias: -1, text: `Nedtrend-struktur. Siste lavere topp ${fmtP(lastLH)} – lukk over den bryter nedtrenden.`, keyLow: lastHL, keyHigh: lastLH, pts };
  return { label: 'Range / overgang', bias: 0, text: `Blandet struktur – handler mellom ${fmtP(lastHL)} og ${fmtP(lastLH)}.`, keyLow: lastHL, keyHigh: lastLH, pts };
}

function analyseLevels(base, D, W) {
  const c = D.c, price = last(c), A = atr(D.h, D.l, c, 14), e200 = ema(c, 200), atrAbs = last(A), atrPct = atrAbs / price;
  const cl = clusterLevels(levelCandidates(D, W), price, atrAbs);
  const tolPct = Math.max(0.35 * atrPct, 0.006);
  const TS = touchStats(D, e200, A);
  const pr = x => x == null ? null : Math.round(x * 100);
  const lv = cl.map(x => { const d = x.p / price - 1, k = Math.abs(d) / atrPct, dir = d >= 0 ? 1 : -1;
    const near = Math.abs(d) < tolPct;
    const q7 = near ? null : TS.probX(k, dir, 7), q30 = near ? null : TS.probX(k, dir, 30);
    return { ...x, d, k, side: near ? 'her' : dir > 0 ? 'over' : 'under',
      p7: near ? 1 : q7.p, p30: near ? 1 : q30.p, ci30: near ? null : [q30.lo, q30.hi], nEff30: near ? null : q30.nEff,
      strength: x.score >= 5 ? 'Sterk' : x.score >= 3 ? 'Middels' : 'Svak', bo: x.score >= 2.5 ? breakoutStatus(D, x.p, tolPct) : null }; });
  const above = lv.filter(x => x.side === 'over').sort((a, b) => a.p - b.p), below = lv.filter(x => x.side === 'under').sort((a, b) => b.p - a.p);
  const strongA = above.filter(x => x.score >= 4), strongB = below.filter(x => x.score >= 4);
  const nextUp = strongA[0] || above[0], nextDn = strongB[0] || below[0];
  const mustHold = strongB[0] || below[0] || null;
  const here = lv.filter(x => x.side === 'her').sort((a, b) => b.score - a.score)[0] || null;
  const trendLv = lv.filter(x => x.src.some(s => /200D EMA/.test(s)))[0] || lv.filter(x => x.src.some(s => /50W SMA/.test(s)))[0] || null;
  const st = structure(D);
  const first = (nextUp && nextDn) ? TS.first(nextUp.k, nextDn.k, 30) : null;
  const breaks = lv.filter(x => x.bo).map(x => ({ level: x.p, score: x.score, ...x.bo })).sort((a, b) => b.date.localeCompare(a.date));
  const pctS = v => (v > 0 ? '+' : '−') + nbf(Math.abs(v * 100), 1) + ' %';
  const ciS = x => x && x.ci30 && x.ci30[0] != null ? ` (90 %-intervall ${pr(x.ci30[0])}–${pr(x.ci30[1])} %, ca. ${x.nEff30} uavhengige 30-dagersperioder)` : '';
  const beyondUp = nextUp && above.find(x => x.p > nextUp.p * (1 + tolPct) && x.score >= 3);
  const mh = mustHold || nextDn; const beyondDn = mh && below.find(x => x.p < mh.p * (1 - tolPct) && x.score >= 3);
  const bull = nextUp ? `Så lenge ${mh ? fmtP(mh.p) : 'støtten'} holder, er neste mål ${fmtP(nextUp.p)} (${pctS(nextUp.d)}). Historisk basisrate: en like stor bevegelse ble nådd innen 30 dager i ${pr(nextUp.p30)} % av dagene i samme regime${ciS(nextUp)}.${beyondUp ? ` Dagslukk over ${fmtP(nextUp.p)} åpner for ${fmtP(beyondUp.p)} (${pctS(beyondUp.d)}).` : ''}` : '';
  const bear = mh ? `${fmtP(mh.p)} (${pctS(mh.d)}) ble nådd innen 30 dager i ${pr(mh.p30)} % av sammenlignbare dager${ciS(mh)}.${beyondDn ? ` Dagslukk under åpner for ${fmtP(beyondDn.p)} (${pctS(beyondDn.d)}).` : ''}` : '';
  const hereTxt = here ? `Prisen står på et ${here.strength.toLowerCase()} nivå rundt ${fmtP(here.p)} (${here.src.slice(0, 3).join(', ')}). Dagslukk over/under avgjør neste retning.` : '';
  let trendTxt = '';
  if (trendLv) { trendTxt = trendLv.side === 'under' ? `Trendnivå ${fmtP(trendLv.p)} (${trendLv.src.filter(s => /200D|50W/.test(s)).join(', ')}) ligger ${nbf(Math.abs(trendLv.d * 100), 1)} % under – så lenge prisen holder seg over, er den langsiktige trenden intakt.`
    : trendLv.side === 'over' ? `Prisen må gjenvinne ${fmtP(trendLv.p)} (${trendLv.src.filter(s => /200D|50W/.test(s)).join(', ')}), +${nbf(trendLv.d * 100, 1)} %, for å snu den langsiktige trenden opp.`
    : `Prisen står akkurat på trendnivået ${fmtP(trendLv.p)} – avgjørende sone.`; }
  const key = x => x && { p: sig(x.p), d: Math.round(x.d * 1000) / 10, score: x.score, k: r2(x.k), p7: pr(x.p7), p30: pr(x.p30), ci30: x.ci30 ? x.ci30.map(pr) : null, nEff30: x.nEff30, src: x.src.join(' · ') };
  const out = { ...base, atrAbs, atrPct: atrPct * 100, tolPct,
    lv: lv.filter(x => x.d > -0.5 && x.d < 0.8 && (x.score >= 3 || x.side === 'her' || x === mustHold || x === nextUp)).map(x => ({ p: sig(x.p), d: Math.round(x.d * 1000) / 10, k: r2(x.k), score: x.score, strength: x.strength, side: x.side,
      src: x.src.join(' · '), p7: pr(x.p7), p30: pr(x.p30), ci30: x.ci30 ? x.ci30.map(pr) : null, nEff30: x.nEff30, bo: x.bo ? x.bo.type : null,
      role: [x === here ? 'Pris står her' : '', x === mustHold ? 'Må holde' : '', x === nextUp ? 'Neste motstand' : '', x === trendLv ? 'Trendnivå' : ''].filter(Boolean).join(' · ') })),
    keys: { here: here && { ...key(here), bo: here.bo && here.bo.text, boType: here.bo && here.bo.type }, mustHold: key(mustHold), nextUp: key(nextUp), nextDn: key(nextDn),
      trend: trendLv && { p: sig(trendLv.p), d: Math.round(trendLv.d * 1000) / 10, side: trendLv.side },
      first: first && { up: pr(first.up), down: pr(first.down), none: pr(first.none), n: first.n, nEff: first.nEff },
      regime: TS.regimeMatched ? (TS.nowAbove ? 'dager over 200D EMA' : 'dager under 200D EMA') : 'alle dager', tsN: TS.pool.length, tsFrom: TS.firstDate },
    structure: st, breaks: breaks.slice(0, 6).map(b => ({ ...b, level: sig(b.level) })), scen: { bull, bear, trend: trendTxt, here: hereTxt } };
  addMajor(out, D, A, e200, TS);
  return out;
}
// Avgjørende nivåer (sterkeste nivå 1,5–5 ATR unna) + «hva nås først» mellom dem.
function addMajor(r, D, A, e200, TS) {
  const ap = r.atrPct;
  const inBand = x => Math.abs(x.d) >= 1.5 * ap && Math.abs(x.d) <= Math.max(5 * ap, 12);
  const pickMax = arr => arr.sort((a, b) => b.score - a.score || Math.abs(a.d) - Math.abs(b.d))[0] || null;
  const majDn = pickMax(r.lv.filter(x => x.side === 'under' && inBand(x)));
  const majUp = pickMax(r.lv.filter(x => x.side === 'over' && inBand(x)));
  r.lv.forEach(x => { const roles = x.role ? x.role.split(' · ') : []; if (x === majDn) roles.push('Avgjørende støtte'); if (x === majUp) roles.push('Avgjørende motstand'); x.role = roles.join(' · '); });
  const f = (majUp && majDn) ? TS.first(Math.abs(majUp.d) / ap, Math.abs(majDn.d) / ap, 30) : null;
  const pk = x => x && { p: x.p, d: x.d, k: x.k, p7: x.p7, p30: x.p30, ci30: x.ci30, nEff30: x.nEff30, src: x.src, score: x.score };
  r.keys.majUp = pk(majUp); r.keys.majDn = pk(majDn);
  r.keys.firstMajor = f && { up: Math.round(f.up * 100), down: Math.round(f.down * 100), none: Math.round(f.none * 100), n: f.n, nEff: f.nEff };
  const P = v => (v > 0 ? '+' : '−') + nbf(Math.abs(v), 1) + ' %';
  r.scen.major = (majUp && majDn) ? `Større bilde: dagslukk over ${fmtP(majUp.p)} (${P(majUp.d)}) vil være et bekreftet utbrudd; dagslukk under ${fmtP(majDn.p)} (${P(majDn.d)}) bryter støtten. Historisk (30 dager, ca. ${f ? f.nEff : '–'} uavhengige perioder) ble øvre nivå nådd først i ${f ? Math.round(f.up * 100) : '–'} % av tilfellene, nedre først i ${f ? Math.round(f.down * 100) : '–'} %, og ingen av dem i ${f ? Math.round(f.none * 100) : '–'} %.` : '';
}
// Mål/støtte, retningsscore, range og handelsplan (portert fra build_datasets.py)
function extras(r, D) {
  const p = r.price, atrF = r.atrPct / 100, c = D.c;
  const rets = []; for (let i = c.length - 90; i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const m = mean(rets), sd = Math.sqrt(rets.reduce((a, x) => a + (x - m) ** 2, 0) / (rets.length - 1));
  const lv = [...r.lv].sort((a, b) => a.p - b.p);
  const up = lv.filter(l => l.side === 'over'), dn = lv.filter(l => l.side === 'under').reverse();
  const find = (arr, pr) => arr.find(l => pr && Math.abs(l.p - pr) / pr < 1e-6) || null;
  const k = r.keys;
  const t1 = find(up, k.nextUp && k.nextUp.p) || up[0] || null;
  const t2 = find(up, k.majUp && k.majUp.p) || up[1] || t1;
  const t3 = up.find(l => t2 && l.p > t2.p * (1 + atrF * 0.5) && l.score >= 5) || null;
  const s1 = find(dn, k.mustHold && k.mustHold.p) || dn[0] || null;
  const s2 = find(dn, k.majDn && k.majDn.p) || dn[1] || s1;
  const s3 = dn.find(l => s2 && l.p < s2.p * (1 - atrF * 0.5) && l.score >= 5) || null;
  const names = { T1: 'Mål 1', T2: 'Mål 2', T3: 'Mål 3', S1: 'Støtte 1', S2: 'Støtte 2', S3: 'Støtte 3' };
  const targets = []; const seen = new Set();
  for (const [kk, l] of [['T1', t1], ['T2', t2], ['T3', t3], ['S1', s1], ['S2', s2], ['S3', s3]]) if (l && !seen.has(l)) { seen.add(l); targets.push({ target: kk, label: names[kk], price: l.p, dist: l.d, p7: l.p7, p30: l.p30, ci30: l.ci30, nEff30: l.nEff30, score: l.score, sources: l.src }); }
  const trend = r.long.score * 0.35;
  const st = r.structure.bias * 15, sw = r.swing.bias === 'Rebound' ? 15 : r.swing.bias === 'Korreksjon' ? -15 : 0;
  const fm = k.firstMajor || {}, fu = fm.up || 0, fd = fm.down || 0, fn = fm.none || 0, fi = (fu - fd) * 0.5;
  const osc = r.ind.wt1d < -53 ? 5 : r.ind.wt1d > 53 ? -5 : 0;
  const b = Math.max(-100, Math.min(100, Math.round(trend + st + sw + fi + osc)));
  const lab = b >= 30 ? 'Oppside favorisert' : b >= 12 ? 'Svak oppside' : b <= -30 ? 'Nedside favorisert' : b <= -12 ? 'Svak nedside' : 'Nøytral – avvent';
  const est = (t2 && s2) ? (fu / 100) * t2.p + (fd / 100) * s2.p + (fn / 100) * p : p;
  let entryLo = null, entryHi = null, stop = null, rr1 = null, rr2 = null;
  if (s1) { entryLo = s1.p; entryHi = s1.p * (1 + 0.5 * atrF); const entry = (entryLo + entryHi) / 2; stop = s1.p * (1 - 0.6 * atrF);
    if (s2 && stop * 0.97 < s2.p && s2.p < s1.p) stop = s2.p * (1 - 0.5 * atrF);
    const risk = entry - stop; rr1 = t1 ? (t1.p - entry) / risk : null; rr2 = t2 ? (t2.p - entry) / risk : null; }
  return { targets, bias: { score: b, label: lab, why: `trend ${r.long.label.toLowerCase()} (${trend >= 0 ? '+' : '−'}${Math.abs(Math.round(trend))}) · struktur (${st >= 0 ? '+' : '−'}${Math.abs(st)}) · swing ${r.swing.bias.toLowerCase()} (${sw >= 0 ? '+' : '−'}${Math.abs(sw)}) · historikk øvre/nedre først ${fu}/${fd} % (${fi >= 0 ? '+' : '−'}${nbf(Math.abs(fi), 0)}) · WaveTrend (${osc >= 0 ? '+' : '−'}${Math.abs(osc)})` },
    est30: sig(est), est30d: r1((est / p - 1) * 100), volDaily: r2(sd * 100),
    r7: [sig(p * Math.exp(-sd * Math.sqrt(7))), sig(p * Math.exp(sd * Math.sqrt(7)))], r30: [sig(p * Math.exp(-sd * Math.sqrt(30))), sig(p * Math.exp(sd * Math.sqrt(30)))],
    entry: entryLo ? [sig(entryLo), sig(entryHi)] : null, stop: sig(stop), stopD: stop ? r1((stop / p - 1) * 100) : null, rr1: r1(rr1), rr2: r1(rr2) };
}

// ---------------------------------------------------------------- tidsserier av indikatorer (kausale)
// Alle verdier på indeks t bruker kun candles til og med t. Pivoter regnes som kjent først 5 dager etter at de oppstod.
function series(D) {
  const N = D.c.length, c = D.c;
  const e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200), A = atr(D.h, D.l, c, 14), R = rsi(c, 14);
  const { wt1, wt2 } = waveTrend(D.h, D.l, c); const M = macd(c);
  const lr = c.map((v, i) => i ? Math.log(v / c[i - 1]) : 0);
  const sig90 = new Array(N).fill(null); { let s = 0, s2 = 0; for (let i = 1; i < N; i++) { s += lr[i]; s2 += lr[i] * lr[i]; if (i > 90) { s -= lr[i - 90]; s2 -= lr[i - 90] * lr[i - 90]; } if (i >= 90) { const m = s / 90; sig90[i] = Math.sqrt(Math.max(1e-12, (s2 - 90 * m * m) / 89)); } } }
  const atrP = A.map((a, i) => a == null ? null : a / c[i]);
  const volReg = new Array(N).fill(null);
  for (let i = 60; i < N; i++) { if (atrP[i] == null) continue; const med = quant(atrP.slice(Math.max(14, i - 364), i + 1), 0.5); if (med) volReg[i] = Math.log(atrP[i] / med); }
  const relVol = new Array(N).fill(null); { const v = D.v; for (let i = 49; i < N; i++) { let a = 0, b = 0; for (let j = i - 49; j <= i; j++) { b += v[j]; if (j >= i - 4) a += v[j]; } if (a > 0 && b > 0) relVol[i] = Math.log((a / 5) / (b / 50)); } }
  const ph = pivots(D.h, 5, 5, 'high'), pl = pivots(D.l, 5, 5, 'low');
  const sup = new Array(N).fill(null), res = new Array(N).fill(null), supP = new Array(N).fill(null), resP = new Array(N).fill(null), str = new Array(N).fill(0);
  let a0 = 0, b0 = 0;
  for (let t = 0; t < N; t++) {
    if (A[t] == null) continue;
    while (a0 < ph.length && ph[a0] < t - 365) a0++; while (b0 < pl.length && pl[b0] < t - 365) b0++;
    let rp = null, sp = null;
    for (let k = a0; k < ph.length && ph[k] <= t - 5; k++) { const v = D.h[ph[k]]; if (v > c[t] && (rp == null || v < rp)) rp = v; }
    for (let k = b0; k < pl.length && pl[k] <= t - 5; k++) { const v = D.l[pl[k]]; if (v < c[t] && (sp == null || v > sp)) sp = v; }
    supP[t] = sp; resP[t] = rp;
    sup[t] = sp == null ? 8 : Math.min(8, (c[t] - sp) / A[t]); res[t] = rp == null ? 8 : Math.min(8, (rp - c[t]) / A[t]);
    const hs = [], ls = []; for (let k = ph.length - 1; k >= 0 && hs.length < 2; k--) { if (ph[k] <= t - 5 && ph[k] >= t - 180) hs.push(D.h[ph[k]]); }
    for (let k = pl.length - 1; k >= 0 && ls.length < 2; k--) { if (pl[k] <= t - 5 && pl[k] >= t - 180) ls.push(D.l[pl[k]]); }
    if (hs.length === 2 && ls.length === 2) { const hh = hs[0] > hs[1], hl = ls[0] > ls[1]; str[t] = hh && hl ? 1 : (!hh && !hl ? -1 : 0); }
  }
  const zr = n => c.map((v, i) => i >= n && sig90[i] ? Math.log(v / c[i - n]) / (sig90[i] * Math.sqrt(n)) : null);
  const S = { N, t: D.t, c, e20, e50, e200, A, atrP, R, wt1, wt2, macd: M, sig90, volReg, relVol, sup, res, supP, resP, str, z7: zr(7), z14: zr(14), z30: zr(30) };
  S.V = new Array(N); for (let t = 0; t < N; t++) S.V[t] = vec(S, t); // kjennetegn-vektor per dag (bufret for scenario-motoren)
  return S;
}
// alle verdiene i series() er kausale, så en serie regnet på full historikk kan kuttes til de første n dagene
// (brukes av backtesten for å slippe å regne alt på nytt for hver dato; testet i test_engine.js)
function sliceS(S, n) { const o = { N: n }; for (const k in S) { const v = S[k];
    if (Array.isArray(v)) o[k] = v.slice(0, n);
    else if (k === 'macd') { o.macd = {}; for (const kk in v) o.macd[kk] = Array.isArray(v[kk]) ? v[kk].slice(0, n) : v[kk]; } }
  return o; }

// ---------------------------------------------------------------- historisk scenario-motor
// Faste skalaer valgt på forhånd (ikke tilpasset utfall), slik at likhetsmålet ikke er optimalisert mot historikken.
const FEATS = [
  { k: 'rsi', label: 'RSI (14)', w: 1, f: (S, t) => S.R[t] == null ? null : (S.R[t] - 50) / 15 },
  { k: 'macd', label: 'MACD-histogram (i ATR)', w: 1, f: (S, t) => S.macd.hist[t] == null || !S.A[t] ? null : S.macd.hist[t] / S.A[t] / 0.3 },
  { k: 'wt', label: 'WaveTrend', w: 1, f: (S, t) => S.wt1[t] == null ? null : S.wt1[t] / 40 },
  { k: 'd20', label: 'Avstand til 20D EMA (ATR)', w: 0.75, f: (S, t) => S.e20[t] == null ? null : (S.c[t] - S.e20[t]) / S.A[t] / 2.5 },
  { k: 'd50', label: 'Avstand til 50D EMA (ATR)', w: 1, f: (S, t) => S.e50[t] == null ? null : (S.c[t] - S.e50[t]) / S.A[t] / 4 },
  { k: 'd200', label: 'Avstand til 200D EMA (ATR)', w: 1, f: (S, t) => S.e200[t] == null ? null : (S.c[t] - S.e200[t]) / S.A[t] / 8 },
  { k: 'sup', label: 'Avstand til nærmeste støtte (ATR)', w: 0.75, f: (S, t) => S.sup[t] == null ? null : S.sup[t] / 3 },
  { k: 'res', label: 'Avstand til nærmeste motstand (ATR)', w: 0.75, f: (S, t) => S.res[t] == null ? null : S.res[t] / 3 },
  { k: 'str', label: 'Prisstruktur (topper/bunner)', w: 0.75, f: (S, t) => S.str[t] },
  { k: 'rv', label: 'Relativt volum (5 d mot 50 d)', w: 0.5, f: (S, t) => S.relVol[t] == null ? null : S.relVol[t] / 0.5 },
  { k: 'vr', label: 'Volatilitet mot siste år', w: 0.5, f: (S, t) => S.volReg[t] == null ? null : S.volReg[t] / 0.5 },
  { k: 'z7', label: 'Utvikling siste 7 dager', w: 0.75, f: (S, t) => S.z7[t] == null ? null : S.z7[t] / 1.5 },
  { k: 'z14', label: 'Utvikling siste 14 dager', w: 0.75, f: (S, t) => S.z14[t] == null ? null : S.z14[t] / 1.5 },
  { k: 'z30', label: 'Utvikling siste 30 dager', w: 0.75, f: (S, t) => S.z30[t] == null ? null : S.z30[t] / 1.5 } ];
const WSUM = FEATS.reduce((a, f) => a + f.w, 0);
function vec(S, t) { const v = FEATS.map(f => f.f(S, t)); return v.some(x => x == null || !isFinite(x)) ? null : v; }
function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = clip(a[i] - b[i], -3, 3); s += FEATS[i].w * d * d; } return Math.sqrt(s / WSUM); }
const simOf = d => 100 * Math.exp(-d * d); // d = vektet RMS-avstand i standardiserte enheter
// regime på dato: pris over 200D EMA
function regimeAt(S, t) { return S.e200[t] == null ? null : S.c[t] > S.e200[t]; }
function outcome(D, t, H) { const N = D.c.length; if (t + H >= N) return null; const c0 = D.c[t]; let mx = -Infinity, mn = Infinity;
  for (let j = t + 1; j <= t + H; j++) { mx = Math.max(mx, D.h[j]); mn = Math.min(mn, D.l[j]); }
  return { ret: (D.c[t + H] / c0 - 1) * 100, maxUp: (mx / c0 - 1) * 100, maxDn: (mn / c0 - 1) * 100 }; }
function analogs(sym, ctx, opt = {}) {
  const S = ctx.S[sym], D = ctx.D[sym], N = S.N, t0 = N - 1;
  const v0 = S.V ? S.V[t0] : vec(S, t0); if (!v0) return { ok: false, reason: 'For kort historikk til å beregne alle indikatorer.' };
  const btcIdx = ctx.btcIdx; const btcS = ctx.S.BTC;
  const btcReg = t => { const i = btcIdx.get(t); return i == null ? null : regimeAt(btcS, i); };
  const reg0 = regimeAt(S, t0), breg0 = sym === 'BTC' ? reg0 : btcReg(S.t[t0]);
  const pools = { strict: [], loose: [] };
  for (const s of COINS) { const Ss = ctx.S[s], Ds = ctx.D[s]; if (!Ss) continue;
    for (let t = 230; t <= Ss.N - 31; t++) {
      if (s === sym && t > t0 - 60) continue;
      const r = regimeAt(Ss, t); if (r == null || r !== reg0) continue;
      const v = Ss.V ? Ss.V[t] : vec(Ss, t); if (!v) continue;
      const br = s === 'BTC' ? r : btcReg(Ss.t[t]);
      const d = dist(v0, v); const item = { s, t, date: Ss.t[t], d, sim: simOf(d), v, brOk: br === breg0 };
      pools.loose.push(item); if (item.brOk) pools.strict.push(item); } }
  let pool = pools.strict, relaxed = false;
  const pick = (arr, minSim) => { const sorted = [...arr].sort((a, b) => a.d - b.d); const sel = [];
    for (const it of sorted) { if (it.sim < minSim || sel.length >= (opt.max || 40)) break;
      if (sel.some(x => (x.s === it.s && Math.abs(x.date - it.date) < 30 * DAY) || Math.abs(x.date - it.date) < 10 * DAY)) continue; sel.push(it); }
    return sel; };
  let sel = pick(pool, 50), weak = false;
  if (sel.length < 12) { const s2 = pick(pool, 35); if (s2.length > sel.length) { sel = s2; weak = true; } }
  if (sel.length < 8) { relaxed = true; pool = pools.loose; const s3 = pick(pool, 35); if (s3.length > sel.length) { sel = s3; weak = true; } }
  const cases = sel.map(it => { const Dd = ctx.D[it.s], Sd = ctx.S[it.s], t = it.t;
    const o1 = outcome(Dd, t, 1), o7 = outcome(Dd, t, 7), o30 = outcome(Dd, t, 30);
    let supBroke = false, resBroke = false; const sp = Sd.supP[t], rp = Sd.resP[t];
    for (let j = t + 1; j <= t + 30 && j < Dd.c.length; j++) { if (sp != null && Dd.c[j] < sp) supBroke = true; if (rp != null && Dd.c[j] > rp) resBroke = true; }
    const bi = btcIdx.get(it.date); const btc30 = bi != null && bi + 30 < ctx.D.BTC.c.length ? (ctx.D.BTC.c[bi + 30] / ctx.D.BTC.c[bi] - 1) * 100 : null;
    const pre = [], post = []; for (let j = Math.max(0, t - 60); j <= t; j++) pre.push(Dd.c[j] / Dd.c[t]); for (let j = t; j <= t + 30; j++) post.push(Dd.c[j] / Dd.c[t]);
    return { sym: it.s, date: dstr(it.date), t: it.date, sim: Math.round(it.sim), d: r2(it.d), r1: r2(o1.ret), r7: r2(o7.ret), r30: r2(o30.ret), up30: r2(o30.maxUp), dn30: r2(o30.maxDn),
      supBroke: sp == null ? null : supBroke, resBroke: rp == null ? null : resBroke, btc30: r2(btc30), pre: pre.map(x => +x.toFixed(4)), post: post.map(x => +x.toFixed(4)),
      feat: { rsi: r1(Sd.R[t]), wt: Math.round(Sd.wt1[t]), d200: r1((Sd.c[t] / Sd.e200[t] - 1) * 100), d50: r1((Sd.c[t] / Sd.e50[t] - 1) * 100), z30: r1((Dd.c[t] / Dd.c[t - 30] - 1) * 100), str: Sd.str[t], rv: r2(Sd.relVol[t]), sup: r1(Sd.sup[t]), res: r1(Sd.res[t]) },
      fwd: Object.fromEntries(HZ.map(H => { const o = outcome(Dd, t, H); return [H, o ? [r2(o.ret), r2(o.maxUp), r2(o.maxDn)] : null]; })),
      fz: it.v.map(x => r2(x)) }; });
  // uavhengighet: grupper datoer som ligger innen 30 dager av hverandre (alle coins)
  const dates = cases.map(c => c.t).sort((a, b) => a - b); let nEff = 0, startC = -Infinity; for (const d of dates) { if (d - startC >= 30 * DAY) { nEff++; startC = d; } }
  const statH = (key, bull = true) => { const v = cases.map(c => c[key]).filter(x => x != null); const k = v.filter(x => x > 0).length;
    const share = v.length ? k / v.length : null; const ci = share == null ? [null, null] : wilson(Math.round(share * nEff), Math.max(1, nEff));
    return { n: v.length, pos: share, ci, median: quant(v, 0.5), mean: mean(v), best: v.length ? Math.max(...v) : null, worst: v.length ? Math.min(...v) : null, q25: quant(v, 0.25), q75: quant(v, 0.75) }; };
  const st = { h1: statH('r1'), h7: statH('r7'), h30: statH('r30'), mae: { median: quant(cases.map(c => c.dn30), 0.5), worst: cases.length ? Math.min(...cases.map(c => c.dn30)) : null },
    mfe: { median: quant(cases.map(c => c.up30), 0.5) },
    supBroke: (() => { const v = cases.filter(c => c.supBroke != null); return v.length ? v.filter(c => c.supBroke).length / v.length : null; })(),
    resBroke: (() => { const v = cases.filter(c => c.resBroke != null); return v.length ? v.filter(c => c.resBroke).length / v.length : null; })(),
    btc30: quant(cases.map(c => c.btc30), 0.5) };
  // basisrate: alle dager i samme regime (samme filter som utvalget)
  const base = (arr) => { const r = []; for (const it of arr) { const o = outcome(ctx.D[it.s], it.t, 30); if (o) r.push(o.ret); } return { n: r.length, pos: r.length ? r.filter(x => x > 0).length / r.length : null, median: quant(r, 0.5) }; };
  const baseAll = base(relaxed ? pools.loose : pools.strict), baseOwn = base((relaxed ? pools.loose : pools.strict).filter(x => x.s === sym));
  // estimater for 1 uke – 12 måneder. Bare tilfeller der utfallet er kjent teller, så n faller for lange horisonter.
  // Uavhengighet: tilfeller som ligger nærmere hverandre enn horisonten deler mye av framtiden, så de grupperes (vindu = maks(30, H) dager).
  const poolA = relaxed ? pools.loose : pools.strict;
  const hz = ctx.lite ? null : HZ.map(H => { const cs = cases.filter(c => c.fwd[H]); const v = cs.map(c => c.fwd[H][0]), up = cs.map(c => c.fwd[H][1]), dn = cs.map(c => c.fwd[H][2]);
    const ds = cs.map(c => c.t).sort((a, b) => a - b); let ne = 0, st0 = -Infinity; for (const d of ds) { if (d - st0 >= Math.max(30, H) * DAY) { ne++; st0 = d; } }
    const k = v.filter(x => x > 0).length, pos = v.length ? k / v.length : null;
    const Q = a => ({ q10: r2(quant(a, 0.1)), q25: r2(quant(a, 0.25)), q50: r2(quant(a, 0.5)), q75: r2(quant(a, 0.75)), q90: r2(quant(a, 0.9)) });
    const br = []; for (const it of poolA) { const Dd = ctx.D[it.s]; if (it.t + H < Dd.c.length) br.push((Dd.c[it.t + H] / Dd.c[it.t] - 1) * 100); }
    return { H, n: v.length, nEff: ne, pos, ci: pos == null ? [null, null] : wilson(Math.round(pos * ne), Math.max(1, ne)),
      ret: Q(v), mean: r2(mean(v)), best: v.length ? Math.max(...v) : null, worst: v.length ? Math.min(...v) : null, up: Q(up), dn: Q(dn),
      base: { n: br.length, pos: br.length ? br.filter(x => x > 0).length / br.length : null, median: r2(quant(br, 0.5)) } }; });
  // lang kursbane (0–365 dager) med antall kjente tilfeller per dag
  const fanL = []; if (!ctx.lite) for (let j = 0; j <= 365; j++) { const v = []; for (const c of cases) { const Dd = ctx.D[c.sym], i = ctx.idx[c.sym].get(c.t); if (i + j < Dd.c.length) v.push(Dd.c[i + j] / Dd.c[i]); }
    fanL.push({ j, n: v.length, q10: r4(quant(v, 0.1)), q25: r4(quant(v, 0.25)), q50: r4(quant(v, 0.5)), q75: r4(quant(v, 0.75)), q90: r4(quant(v, 0.9)) }); }
  const todayL = []; for (let j = Math.max(0, t0 - 365); j <= t0; j++) todayL.push(+(D.c[j] / D.c[t0]).toFixed(4));
  // vifte: median og spredning for neste 30 dager
  const fan = []; for (let j = 0; j <= 30; j++) { const v = cases.map(c => c.post[j]).filter(x => x != null); fan.push({ j, q10: quant(v, 0.1), q25: quant(v, 0.25), q50: quant(v, 0.5), q75: quant(v, 0.75), q90: quant(v, 0.9) }); }
  const preFan = []; for (let j = 0; j <= 60; j++) { const v = cases.map(c => c.pre.length === 61 ? c.pre[j] : null).filter(x => x != null); preFan.push({ j: j - 60, q50: quant(v, 0.5) }); }
  const today = []; for (let j = Math.max(0, t0 - 60); j <= t0; j++) today.push(+(D.c[j] / D.c[t0]).toFixed(4));
  const todayFeat = { rsi: r1(S.R[t0]), wt: Math.round(S.wt1[t0]), d200: r1((S.c[t0] / S.e200[t0] - 1) * 100), d50: r1((S.c[t0] / S.e50[t0] - 1) * 100), z30: r1((D.c[t0] / D.c[t0 - 30] - 1) * 100), str: S.str[t0], rv: r2(S.relVol[t0]), sup: r1(S.sup[t0]), res: r1(S.res[t0]) };
  const reliability = nEff >= 20 && !weak ? 'ok' : nEff >= 10 ? 'lite' : 'for-lite';
  const top = cases.slice(0, 5);
  return { ok: true, n: cases.length, nEff, meanSim: Math.round(mean(cases.map(c => c.sim)) || 0), weak, relaxed, reliability,
    regime: reg0 ? 'over 200D EMA' : 'under 200D EMA', btcRegime: sym === 'BTC' ? null : (breg0 ? 'BTC over 200D EMA' : 'BTC under 200D EMA'),
    criteria: FEATS.map((f, i) => ({ k: f.k, label: f.label, w: f.w, now: r2(v0[i]) })),
    stats: st, base: baseAll, baseOwn, hz, fan, fanL, preFan, today, todayL, todayFeat, cases, top, poolN: (relaxed ? pools.loose : pools.strict).length };
}

// ---------------------------------------------------------------- tekniske hendelser og signalhistorikk
const EVENT_TYPES = {
  wtBuy: { label: 'WaveTrend kjøpssignal', short: '▲ WT', dir: 1, desc: 'WaveTrend krysser opp over signallinjen under −53 (oversolgt).' },
  wtSell: { label: 'WaveTrend salgssignal', short: '▼ WT', dir: -1, desc: 'WaveTrend krysser ned under signallinjen over +53 (overkjøpt).' },
  rsiOS: { label: 'RSI under 30', short: 'RSI<30', dir: 1, desc: 'RSI (14) faller under 30 – oversolgt.' },
  rsiOB: { label: 'RSI over 70', short: 'RSI>70', dir: -1, desc: 'RSI (14) stiger over 70 – overkjøpt.' },
  golden: { label: 'Golden cross', short: 'GC', dir: 1, desc: '50D EMA krysser over 200D EMA.' },
  death: { label: 'Death cross', short: 'DC', dir: -1, desc: '50D EMA krysser under 200D EMA.' },
  reclaim: { label: 'Tilbake over 200D EMA', short: '↑200', dir: 1, desc: 'Dagslukk over 200D EMA etter minst 5 dager under.' },
  lose: { label: 'Brudd under 200D EMA', short: '↓200', dir: -1, desc: 'Dagslukk under 200D EMA etter minst 5 dager over.' } };
function events(S, D) {
  const ev = [], N = S.N;
  for (let i = 210; i < N; i++) {
    const add = type => { const o7 = outcome(D, i, 7), o30 = outcome(D, i, 30);
      ev.push({ type, t: S.t[i], date: dstr(S.t[i]), i, price: sig(S.c[i]), r7: o7 ? r2(o7.ret) : null, r30: o30 ? r2(o30.ret) : null, up30: o30 ? r2(o30.maxUp) : null, dn30: o30 ? r2(o30.maxDn) : null }); };
    const w = S.wt1, w2 = S.wt2;
    if (w2[i] != null && w2[i - 1] != null) { if (w[i - 1] <= w2[i - 1] && w[i] > w2[i] && w[i] < -53) add('wtBuy'); if (w[i - 1] >= w2[i - 1] && w[i] < w2[i] && w[i] > 53) add('wtSell'); }
    if (S.R[i - 1] != null) { if (S.R[i - 1] >= 30 && S.R[i] < 30) add('rsiOS'); if (S.R[i - 1] <= 70 && S.R[i] > 70) add('rsiOB'); }
    if (S.e200[i - 1] != null) { if (S.e50[i - 1] <= S.e200[i - 1] && S.e50[i] > S.e200[i]) add('golden'); if (S.e50[i - 1] >= S.e200[i - 1] && S.e50[i] < S.e200[i]) add('death');
      let below = true, above = true; for (let j = i - 5; j < i; j++) { if (S.c[j] >= S.e200[j]) below = false; if (S.c[j] <= S.e200[j]) above = false; }
      if (below && S.c[i] > S.e200[i]) add('reclaim'); if (above && S.c[i] < S.e200[i]) add('lose'); }
  }
  return ev;
}
function eventStats(ev, D) {
  const out = {};
  // basisrate for coinen: andel 30-dagersperioder (alle dager) med positiv avkastning
  const all = []; for (let i = 210; i + 30 < D.c.length; i++) all.push((D.c[i + 30] / D.c[i] - 1) * 100);
  const basePos = all.length ? all.filter(x => x > 0).length / all.length : null;
  for (const type in EVENT_TYPES) { const T = EVENT_TYPES[type]; const a = ev.filter(e => e.type === type && e.r30 != null);
    const used = []; let lastT = -Infinity; for (const e of a) { if (e.t - lastT >= 30 * DAY) { used.push(e); lastT = e.t; } }
    const hit = used.filter(e => T.dir > 0 ? e.r30 > 0 : e.r30 < 0).length; const [lo, hi] = wilson(hit, used.length);
    const hit7 = used.filter(e => e.r7 != null && (T.dir > 0 ? e.r7 > 0 : e.r7 < 0)).length;
    out[type] = { n: a.length, nUsed: used.length, hit: used.length ? hit / used.length : null, ci: [lo, hi], hit7: used.length ? hit7 / used.length : null,
      med7: quant(used.map(e => e.r7), 0.5), med30: quant(used.map(e => e.r30), 0.5), mae: quant(used.map(e => e.dn30), 0.5), basePos: T.dir > 0 ? basePos : (basePos == null ? null : 1 - basePos) }; }
  return out;
}

// ---------------------------------------------------------------- oppsettscore, status og datakvalitet
const COMP_W = { trend: 20, mom: 20, vol: 10, str: 15, lvl: 15, reg: 10, hist: 10 };
const COMP_LABEL = { trend: 'Trend', mom: 'Momentum', vol: 'Volum', str: 'Prisstruktur', lvl: 'Støtte og motstand', reg: 'Markedsregime', hist: 'Historiske utfall' };
function momentumParts(S, v1) {
  const t = S.N - 1, R = S.R, H = S.macd.hist, w = v1.ind.wcross;
  let wtS, wtT;
  if (w && w.barsAgo <= 3 && w.dir === 'opp' && w.level < -20) { wtS = 1; wtT = `WaveTrend krysset opp fra lavt nivå (${Math.round(w.level)}) ${w.barsAgo === 0 ? 'ved siste dagslukk' : w.barsAgo + ' d siden'}`; }
  else if (w && w.barsAgo <= 3 && w.dir === 'ned' && w.level > 20) { wtS = -1; wtT = `WaveTrend krysset ned fra høyt nivå (${Math.round(w.level)}) ${w.barsAgo === 0 ? 'ved siste dagslukk' : w.barsAgo + ' d siden'}`; }
  else { const up = S.wt1[t] > S.wt2[t]; wtS = up ? 0.5 : -0.5; wtT = `WaveTrend ${up ? 'over' : 'under'} signallinjen (${Math.round(S.wt1[t])})`; }
  const dR = R[t] - R[t - 3]; const rsS = clip(dR / 8); const rsT = `RSI ${Math.round(R[t])} (${dR >= 0 ? '+' : '−'}${nbf(Math.abs(dR), 0)} siste 3 d)`;
  const mS = (H[t] > 0 ? 0.5 : -0.5) + (H[t] > H[t - 1] ? 0.5 : -0.5); const mT = `MACD-histogram ${H[t] > 0 ? 'positivt' : 'negativt'} og ${H[t] > H[t - 1] ? 'stigende' : 'fallende'}`;
  const s = (wtS + rsS + mS) / 3;
  return { s, parts: [{ s: wtS, t: wtT }, { s: rsS, t: rsT }, { s: mS, t: mT }],
    trigUp: (w && w.barsAgo <= 3 && w.dir === 'opp' && w.level < -20) || (dR >= 3 && R[t - 3] < 45) || (H[t] > H[t - 1] && H[t - 1] > H[t - 2] && H[t - 2] < H[t - 3]),
    trigDn: (w && w.barsAgo <= 3 && w.dir === 'ned' && w.level > 20) || (dR <= -3 && R[t - 3] > 55) || (H[t] < H[t - 1] && H[t - 1] < H[t - 2] && H[t - 2] > H[t - 3]),
    label: s >= 0.35 ? 'Positivt' : s >= 0.1 ? 'Svakt positivt' : s <= -0.35 ? 'Negativt' : s <= -0.1 ? 'Svakt negativt' : 'Nøytralt' };
}
function scoreAndStatus(sym, ctx, v1, L, ex, S, D, an, breadth) {
  const t = S.N - 1, price = D.c[t], atrA = L.atrAbs, k = L.keys;
  const comps = [];
  const add = (key, s, text) => comps.push({ key, label: COMP_LABEL[key], w: COMP_W[key], s: r2(clip(s)), text });
  add('trend', v1.long.score / 100, `Langsiktig trend: ${v1.long.label.toLowerCase()} (trendscore ${v1.long.score}). ${v1.long.phase}.`);
  const mom = momentumParts(S, v1);
  add('mom', mom.s, `Kortsiktig momentum ${mom.label.toLowerCase()}: ${mom.parts.map(p => p.t).join(', ')}.`);
  let up = 0, dn = 0; for (let i = t - 9; i <= t; i++) { if (D.c[i] > D.o[i]) up += D.v[i]; else if (D.c[i] < D.o[i]) dn += D.v[i]; }
  const volS = up + dn ? (up - dn) / (up + dn) : 0, rv = S.relVol[t];
  add('vol', volS, `${Math.round(up / (up + dn || 1) * 100)} % av volumet siste 10 dager kom på opp-dager. Volumet siste 5 dager er ${rv >= 0 ? Math.round((Math.exp(rv) - 1) * 100) + ' % over' : Math.round((1 - Math.exp(rv)) * 100) + ' % under'} 50-dagerssnittet.`);
  add('str', L.structure.bias, `${L.structure.label}. ${L.structure.text}`);
  const distSup = k.mustHold ? (price - k.mustHold.p) / atrA : null, distRes = k.nextUp ? (k.nextUp.p - price) / atrA : null;
  const recentUp = L.breaks.find(b => b.dir > 0 && (b.type === 'bekreftet' || b.type === 'retest') && b.daysAgo <= 7);
  const recentDn = L.breaks.find(b => b.dir < 0 && (b.type === 'bekreftet' || b.type === 'retest') && b.daysAgo <= 7);
  const nearSup = distSup != null && distSup <= 1, nearRes = distRes != null && distRes <= 1;
  let lvlS, lvlT;
  if (recentUp) { lvlS = 0.75; lvlT = `Bekreftet utbrudd over ${fmtP(recentUp.level)} (${recentUp.date}).`; }
  else if (recentDn) { lvlS = -0.75; lvlT = `Bekreftet brudd under ${fmtP(recentDn.level)} (${recentDn.date}).`; }
  else if (nearSup) { lvlS = 0.6; lvlT = `Prisen er ${nbf(distSup, 1)} ATR over må-holde-støtten ${fmtP(k.mustHold.p)} – god plassering for et kjøpsoppsett, kort vei til ugyldiggjøring.`; }
  else if (nearRes) { lvlS = -0.6; lvlT = `Prisen er bare ${nbf(distRes, 1)} ATR under motstanden ${fmtP(k.nextUp.p)} – lite rom før neste hinder.`; }
  else { const a = distSup ?? 5, b = distRes ?? 5; lvlS = 0.5 * (b - a) / (a + b); lvlT = `${nbf(a, 1)} ATR ned til støtte og ${nbf(b, 1)} ATR opp til motstand.`; }
  add('lvl', lvlS, lvlT);
  const bS = ctx.S.BTC, bi = bS ? bS.N - 1 : null;
  let regS, regT;
  if (sym === 'BTC') { regS = 0.5 * (breadth.above / breadth.n * 2 - 1) + 0.5 * v1.long.score / 100; regT = `${breadth.above} av ${breadth.n} coins over 200D EMA. Bitcoins trendscore ${v1.long.score}.`; }
  else if (bS) { const ab = bS.c[bi] > bS.e200[bi]; regS = (ab ? 0.5 : -0.5) + 0.5 * ctx.btcLong / 100; regT = `Bitcoin ${ab ? 'over' : 'under'} 200D EMA (trendscore ${ctx.btcLong}) – altcoins følger ofte BTC.`; }
  else { regS = 0; regT = 'Ingen BTC-data.'; }
  add('reg', regS, regT);
  let hS = 0, hT = 'Ingen sammenlignbare tilfeller.';
  if (an && an.ok && an.stats.h30.pos != null && an.base.pos != null) { const diff = an.stats.h30.pos - an.base.pos, shrink = an.nEff / (an.nEff + 10); hS = clip(diff / 0.2) * shrink;
    hT = `${Math.round(an.stats.h30.pos * 100)} % av ${an.n} lignende tilfeller steg på 30 dager mot ${Math.round(an.base.pos * 100)} % for alle dager i samme regime (vektet ned for lite utvalg: ca. ${an.nEff} uavhengige perioder).`; }
  add('hist', hS, hT);
  const total = Math.round(50 + 50 * comps.reduce((a, c) => a + c.w * c.s, 0) / 100);
  // status
  const stop = ex.stop, aboveInval = stop == null || price > stop;
  const zoneBuy = nearSup || !!recentUp, zoneSell = nearRes || !!recentDn;
  let code;
  if (total >= 60 && zoneBuy && mom.trigUp && aboveInval) code = 'buy';
  else if (total <= 40 && ((zoneSell && mom.trigDn) || (recentDn && total <= 35))) code = 'sell';
  else if ((total >= 55 && (zoneBuy || mom.trigUp)) || (total <= 45 && (zoneSell || mom.trigDn)) || (k.here && k.here.boType === 'ubekreftet') || (mom.trigUp && total >= 45) || (mom.trigDn && total <= 55)) code = 'wait';
  else code = 'none';
  const STATUS = { buy: 'Mulig kjøpsoppsett', wait: 'Avvent bekreftelse', sell: 'Mulig salgs-/exit-oppsett', none: 'Ingen tydelig mulighet' };
  const lean = total >= 55 ? 1 : total <= 45 ? -1 : 0;
  const buyChecks = [
    { ok: total >= 60, t: `Oppsettscore minst 60 (nå ${total})` },
    { ok: zoneBuy, t: recentUp ? `Bekreftet utbrudd over ${fmtP(recentUp.level)}` : k.mustHold ? `Pris innen 1 ATR over må-holde-støtten ${fmtP(k.mustHold.p)} (nå ${nbf(distSup, 1)} ATR over)` : 'Pris ved en sterk støtte' },
    { ok: !!mom.trigUp, t: 'Momentum snur opp (WaveTrend-kryss opp, RSI stiger fra lavt nivå eller MACD-histogram snur)' },
    { ok: aboveInval, t: stop != null ? `Pris over ugyldiggjøringsnivået ${fmtP(stop)}` : 'Pris over ugyldiggjøringsnivået' } ];
  const sellChecks = [
    { ok: total <= 40, t: `Oppsettscore 40 eller lavere (nå ${total})` },
    { ok: zoneSell, t: recentDn ? `Bekreftet brudd under ${fmtP(recentDn.level)}` : k.nextUp ? `Pris innen 1 ATR under motstanden ${fmtP(k.nextUp.p)} (nå ${nbf(distRes, 1)} ATR under)` : 'Pris ved en sterk motstand' },
    { ok: !!mom.trigDn, t: 'Momentum snur ned (WaveTrend-kryss ned, RSI faller fra høyt nivå eller MACD-histogram snur)' } ];
  return { score: total, comps, status: { code, label: STATUS[code], lean, buyChecks, sellChecks, nearSup, nearRes, distSup: r2(distSup), distRes: r2(distRes), recentUp: recentUp || null, recentDn: recentDn || null },
    mom: { label: mom.label, s: r2(mom.s), parts: mom.parts, trigUp: !!mom.trigUp, trigDn: !!mom.trigDn } };
}
function quality(D, an, sc, L) {
  let q = 100; const why = [];
  const yrs = D.c.length / 365;
  if (yrs < 3) { q -= 15; why.push(`Kort kurshistorikk på Binance (${nbf(yrs, 1)} år) – færre egne sammenligningsgrunnlag.`); } else if (yrs < 5) { q -= 5; why.push(`${nbf(yrs, 1)} år kurshistorikk.`); } else why.push(`${nbf(yrs, 1)} år kurshistorikk.`);
  if (!an || !an.ok) { q -= 30; why.push('Ingen historisk sammenligning tilgjengelig.'); }
  else { if (an.nEff < 10) { q -= 30; why.push(`Bare ca. ${an.nEff} uavhengige historiske perioder – for lite til sikre konklusjoner.`); } else if (an.nEff < 20) { q -= 15; why.push(`Ca. ${an.nEff} uavhengige historiske perioder – tolk forsiktig.`); } else why.push(`Ca. ${an.nEff} uavhengige historiske perioder.`);
    if (an.weak) { q -= 10; why.push(`Lavere likhet i de historiske tilfellene (snitt ${an.meanSim} %).`); }
    if (an.relaxed) { q -= 10; why.push('BTC-regimet måtte ignoreres for å finne nok tilfeller.'); }
    const iqr = an.stats.h30.q75 - an.stats.h30.q25; if (iqr > 25) { q -= 10; why.push(`Stor spredning i historiske utfall (midterste halvdel spenner ${Math.round(iqr)} prosentpoeng).`); } }
  const ss = sc.comps.map(c => c.s), m = mean(ss), sd = Math.sqrt(mean(ss.map(x => (x - m) ** 2)));
  if (sd > 0.6) { q -= 10; why.push('Faktorene i oppsettscoren peker i ulike retninger.'); }
  q = Math.max(0, Math.min(100, q));
  return { score: q, label: q >= 75 ? 'Høy' : q >= 50 ? 'Middels' : 'Lav', why };
}

// ---------------------------------------------------------------- forklaringer (genereres kun fra beregnede verdier)
function narrative(c) {
  const n = NAMES[c.sym], k = c.keys, st = c.status, P = fmtP, pr = c.price;
  const sup = k.mustHold, res = k.nextUp, stop = c.ex.stop;
  const trendPos = c.long.score >= 20, trendNeg = c.long.score <= -20;
  const trendTxt = trendPos ? 'Den langsiktige trenden er positiv' : trendNeg ? 'Den langsiktige trenden er negativ' : 'Den langsiktige trenden er nøytral';
  const m = c.mom.s, momTxt = m >= 0.35 ? 'kortsiktig momentum er positivt' : m >= 0.1 ? 'kortsiktig momentum er svakt positivt' : m <= -0.35 ? 'kortsiktig momentum er negativt' : m <= -0.1 ? 'kortsiktig momentum er svakt' : 'kortsiktig momentum er nøytralt';
  const conj = (trendPos && m < 0.1) || (trendNeg && m > -0.1) ? ', men ' : ', og ';
  let loc;
  if (st.recentUp) loc = `${n} har nylig brutt over ${P(st.recentUp.level)} og holder seg over nivået.`;
  else if (st.recentDn) loc = `${n} har nylig brutt under ${P(st.recentDn.level)}, som nå fungerer som motstand.`;
  else if (st.nearSup && sup) loc = `${n} tester et viktig støttenivå rundt ${P(sup.p)}.`;
  else if (st.nearRes && res) loc = `${n} handler like under motstand ved ${P(res.p)}.`;
  else if (sup && res) loc = `${n} handler mellom støtte ved ${P(sup.p)} og motstand ved ${P(res.p)}.`;
  else loc = `${n} handler uten nære nøkkelnivåer.`;
  const rv = c.ind.relVol, volUp = rv != null && rv > 0.1;
  let action;
  if (st.code === 'buy') action = `Kriteriene for et mulig kjøpsoppsett er oppfylt. Et dagslukk over ${res ? P(res.p) : 'neste motstand'} vil bekrefte oppsettet; dagslukk under ${P(stop)} gjør det ugyldig.`;
  else if (st.code === 'sell') action = `Flere signaler peker ned. Et dagslukk under ${sup ? P(sup.p) : 'nærmeste støtte'} vil bekrefte svakheten; et dagslukk over ${res ? P(res.p) : 'nærmeste motstand'} vil svekke det negative scenarioet.`;
  else if (st.lean >= 0) action = `Et bekreftet brudd over ${res ? P(res.p) : 'motstanden'}${volUp ? ' med økende volum' : ' med økende volum'} kan gi et interessant kjøpsoppsett. Hvis ${sup ? P(sup.p) : 'støtten'} brytes, svekkes oppsidescenarioet.`;
  else action = `Et dagslukk under ${sup ? P(sup.p) : 'støtten'} vil bekrefte svakheten. Først et dagslukk over ${res ? P(res.p) : 'motstanden'} bedrer bildet.`;
  const summary = `${loc} ${trendTxt}${conj}${momTxt}. ${action}`;
  // hvorfor interessant
  const sorted = [...c.comps].sort((a, b) => Math.abs(b.s * b.w) - Math.abs(a.s * a.w));
  const why = sorted.slice(0, 3).map(x => ({ s: x.s, t: x.text }));
  // historikk
  const an = c.analog; let hist;
  if (!an || !an.ok) hist = 'Det finnes for få sammenlignbare situasjoner til å si noe om historikken.';
  else { const h = an.stats.h30; const rel = an.reliability === 'for-lite' ? ' Utvalget er for lite til en pålitelig vurdering.' : an.reliability === 'lite' ? ' Utvalget er lite, så tolk dette forsiktig.' : '';
    hist = `I ${an.n} lignende situasjoner (ca. ${an.nEff} uavhengige perioder, snittlikhet ${an.meanSim} %) var prisen høyere 30 dager senere i ${Math.round(h.pos * 100)} % av tilfellene, med median ${fmtPct(h.median)}. Til sammenligning gjaldt det ${Math.round(an.base.pos * 100)} % av alle dager i samme markedsregime. Typisk største nedtur underveis var ${fmtPct(an.stats.mae.median)}.${rel}`; }
  // følg med på
  const watch = [];
  if (res) watch.push({ t: `Dagslukk over ${P(res.p)} (${fmtPct(res.d)})`, s: 1, d: 'Bekrefter styrke og åpner for neste motstand.' });
  if (sup) watch.push({ t: `Dagslukk under ${P(sup.p)} (${fmtPct(sup.d)})`, s: -1, d: 'Bryter må-holde-støtten og svekker oppsidescenarioet.' });
  if (k.majUp) watch.push({ t: `Avgjørende motstand ${P(k.majUp.p)} (${fmtPct(k.majUp.d)})`, s: 1, d: 'Dagslukk over her vil være et større utbrudd.' });
  if (c.mom.s < 0.1) watch.push({ t: 'WaveTrend-kryss opp / RSI over 50', s: 1, d: 'Tegn på at momentum snur opp.' }); else watch.push({ t: 'WaveTrend-kryss ned / RSI under 50', s: -1, d: 'Tegn på at momentum svekkes.' });
  watch.push({ t: 'Volum over 50-dagerssnittet ved brudd', s: 0, d: 'Brudd med høyt volum er mer pålitelige enn brudd med lavt volum.' });
  // hva kan gå galt
  const risks = [];
  if (stop != null) risks.push(`Dagslukk under ${P(stop)} (${fmtPct(c.ex.stopD)}) ugyldiggjør et kjøpsoppsett ved støtten.`);
  if (trendNeg && st.lean >= 0) risks.push('Oppsettet går mot den langsiktige nedtrenden – rekyler stopper ofte ved motstand.');
  if (trendPos && st.lean < 0) risks.push('Den langsiktige trenden er fortsatt positiv – svakhet kan være en korreksjon som snur ved støtte.');
  if (c.sym !== 'BTC' && c.comps.find(x => x.key === 'reg').s < 0) risks.push('Bitcoin er svak – altcoins faller ofte mer enn BTC i slike perioder.');
  if (an && an.ok && an.reliability !== 'ok') risks.push('Få sammenlignbare historiske tilfeller gir stor usikkerhet i de historiske tallene.');
  if (c.atrPct > 6) risks.push(`Høy volatilitet (snittlig dagsbevegelse ${nbf(c.atrPct, 1)} %) gir store svingninger rundt nivåene.`);
  risks.push('Tekniske nivåer og signaler kan svikte ved nyheter eller brå endringer i markedet.');
  return { summary, loc, trend: `${trendTxt}${conj}${momTxt}.`, action, why, hist, watch, risks };
}

// ---------------------------------------------------------------- hovedfunksjon
function analyseCoin(sym, ctx, H4, breadth) {
  const D = ctx.D[sym], S = ctx.S[sym], W = toWeekly(D), H = H4 && H4.c.length > 60 ? H4 : D;
  const v1 = analyseV1(sym, D, W, H);
  const L = analyseLevels(v1, D, W);
  const ex = extras(L, D);
  const an = analogs(sym, ctx);
  const ev = events(S, D), es = eventStats(ev, D);
  const sc = scoreAndStatus(sym, ctx, v1, L, ex, S, D, an, breadth);
  const q = quality(D, an, sc, L);
  const t = S.N - 1;
  const h4 = H4 && H4.c.length ? { price: last(H4.c), t: last(H4.t) + 4 * 36e5, chg24: H4.c.length > 6 ? r2(pct(last(H4.c), H4.c[H4.c.length - 7])) : null } : null;
  const n = Math.min(S.N, 420), a0 = S.N - n;
  const sl = arr => arr.slice(a0).map(v => v == null ? null : +Number(v).toPrecision(6));
  const chart = { t: D.t.slice(a0), o: sl(D.o), h: sl(D.h), l: sl(D.l), c: sl(D.c), v: sl(D.v), e20: sl(S.e20), e50: sl(S.e50), e200: sl(S.e200), rsi: sl(S.R), wt1: sl(S.wt1), wt2: sl(S.wt2), macd: sl(S.macd.line), sig: sl(S.macd.sig), hist: sl(S.macd.hist) };
  const c = { sym, name: NAMES[sym], asOf: D.t[t], asOfStr: dstr(D.t[t]), price: L.price, h4, chg: v1.chg, atrPct: r2(L.atrPct), atrAbs: L.atrAbs,
    long: v1.long, swing: v1.swing, ind: { ...v1.ind, rsi: r1(S.R[t]), macdHist: S.macd.hist[t], relVol: r2(S.relVol[t]), volReg: r2(S.volReg[t]), e20: S.e20[t], e50: S.e50[t], e200: S.e200[t] },
    structure: L.structure, lv: L.lv, keys: L.keys, breaks: L.breaks, scen: L.scen, ex,
    score: sc.score, comps: sc.comps, status: sc.status, mom: sc.mom, quality: q, analog: an, events: ev.filter(e => e.t >= D.t[a0]), eventsAll: ev.slice(-400), eventStats: es,
    histYears: r1(D.c.length / 365), firstDate: dstr(D.t[0]), chart };
  c.text = narrative(c);
  return c;
}
function run(dailyRows, h4Rows, opts = {}) {
  const Dall = Array.isArray(dailyRows) ? prep(dailyRows) : dailyRows, Hall = Array.isArray(h4Rows) ? prep(h4Rows) : (h4Rows || {});
  const ctx = { D: {}, S: {}, idx: {}, btcIdx: new Map(), btcLong: 0, lite: !!opts.lite }; // lite: hopper over ting som ikke påvirker status/score (backtest)
  for (const s of COINS) if (Dall[s] && Dall[s].c.length >= 260) { ctx.D[s] = Dall[s]; ctx.S[s] = opts.pre && opts.pre[s] ? opts.pre[s] : series(Dall[s]); ctx.idx[s] = new Map(Dall[s].t.map((t, i) => [t, i])); }
  if (ctx.D.BTC) ctx.D.BTC.t.forEach((t, i) => ctx.btcIdx.set(t, i));
  const syms = COINS.filter(s => ctx.D[s]);
  const breadth = { n: syms.length, above: syms.filter(s => { const S = ctx.S[s], t = S.N - 1; return S.c[t] > S.e200[t]; }).length };
  if (ctx.D.BTC) { const W = toWeekly(ctx.D.BTC); ctx.btcLong = analyseV1('BTC', ctx.D.BTC, W, Hall.BTC && Hall.BTC.c.length > 60 ? Hall.BTC : ctx.D.BTC).long.score; }
  const coins = syms.map(s => analyseCoin(s, ctx, Hall[s], breadth));
  const counts = { buy: 0, wait: 0, sell: 0, none: 0 }; coins.forEach(c => counts[c.status.code]++);
  const btc = coins.find(c => c.sym === 'BTC');
  const parts = [];
  if (counts.buy) parts.push(`${counts.buy} ${counts.buy === 1 ? 'coin har' : 'coins har'} et mulig kjøpsoppsett`);
  if (counts.sell) parts.push(`${counts.sell} ${counts.sell === 1 ? 'viser' : 'viser'} et mulig salgs-/exit-oppsett`);
  if (counts.wait) parts.push(`${counts.wait} avventer bekreftelse`);
  if (counts.none) parts.push(`${counts.none} uten tydelig mulighet`);
  const takeaway = (parts.length ? parts.join(', ').replace(/^./, x => x.toUpperCase()) + '. ' : '') + (btc ? `Bitcoin: ${btc.long.label.toLowerCase()} langsiktig trend, momentum ${btc.mom.label.toLowerCase()}.` : '');
  return { asOf: coins.length ? Math.max(...coins.map(c => c.asOf)) : null, coins, market: { counts, breadth, takeaway },
    method: { feats: FEATS.map(f => ({ k: f.k, label: f.label, w: f.w })), weights: COMP_W, labels: COMP_LABEL, eventTypes: EVENT_TYPES } };
}

const MS = { COINS, NAMES, HZ, run, prep, series, sliceS, analogs, events, eventStats, toWeekly, sliceD, analyseV1, analyseLevels, touchStats, wilson, quant, fmtP, fmtPct, dstr, dnb, ema, rsi, atr, waveTrend, macd, vec, FEATS, EVENT_TYPES, COMP_W, COMP_LABEL };
if (typeof module !== 'undefined' && module.exports) module.exports = MS; else root.MS = MS;
})(typeof window !== 'undefined' ? window : globalThis);
