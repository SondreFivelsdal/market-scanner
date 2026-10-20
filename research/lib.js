// Forskningsbibliotek: data, indikatorer (kausale), handelssimulering og statistikk.
// Signal på lukket bar i -> inngang på åpning i+1. Stopp før mål i samme bar. Gap forbi stopp fylles på åpning.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const DIR = path.join(__dirname, 'data');
const IVMS = { '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 };

function load(sym, iv) {
  const f = path.join(DIR, `${sym}_${iv}.json.gz`); if (!fs.existsSync(f)) return null;
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)));
  const B = { sym, iv, t: [], o: [], h: [], l: [], c: [], v: [], qv: [] };
  for (const r of rows) { B.t.push(r[0]); B.o.push(r[1]); B.h.push(r[2]); B.l.push(r[3]); B.c.push(r[4]); B.v.push(r[5]); B.qv.push(r[6]); }
  B.N = B.t.length; return B;
}
// dagscandles bygget fra 1h (UTC)
function resample(B, ms) {
  const R = { sym: B.sym, t: [], o: [], h: [], l: [], c: [], v: [] };
  for (let i = 0; i < B.N; i++) { const k = Math.floor(B.t[i] / ms) * ms;
    if (!R.t.length || R.t[R.t.length - 1] !== k) { R.t.push(k); R.o.push(B.o[i]); R.h.push(B.h[i]); R.l.push(B.l[i]); R.c.push(B.c[i]); R.v.push(B.v[i]); }
    else { const j = R.t.length - 1; R.h[j] = Math.max(R.h[j], B.h[i]); R.l[j] = Math.min(R.l[j], B.l[i]); R.c[j] = B.c[i]; R.v[j] += B.v[i]; } }
  R.N = R.t.length; R.ms = ms; R.iv = ms === 864e5 ? "1d" : null; return R;
}
// ---------------- indikatorer
const ema = (a, n) => { const k = 2 / (n + 1), o = new Array(a.length).fill(null); let p = null; for (let i = 0; i < a.length; i++) { p = p == null ? a[i] : a[i] * k + p * (1 - k); if (i >= n - 1) o[i] = p; } return o; };
const sma = (a, n) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
function rsi(c, n = 14) { const o = new Array(c.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
function atr(B, n = 14) { const o = new Array(B.N).fill(null); let a = null;
  for (let i = 1; i < B.N; i++) { const tr = Math.max(B.h[i] - B.l[i], Math.abs(B.h[i] - B.c[i - 1]), Math.abs(B.l[i] - B.c[i - 1]));
    if (i <= n) { a = (a || 0) + tr; if (i === n) { a /= n; o[i] = a; } } else { a = (a * (n - 1) + tr) / n; o[i] = a; } } return o; }
// høyeste/laveste av de n foregående barene (ekskl. i)
function donch(B, n) { const hi = new Array(B.N).fill(null), lo = new Array(B.N).fill(null);
  for (let i = n; i < B.N; i++) { let h = -Infinity, l = Infinity; for (let j = i - n; j < i; j++) { if (B.h[j] > h) h = B.h[j]; if (B.l[j] < l) l = B.l[j]; } hi[i] = h; lo[i] = l; } return { hi, lo }; }
// verdi fra høyere tidsramme som var KJENT ved lukk av bar i (siste HTF-bar med lukketid <= lukketid i)
function align(B, H, arr) { const ms = IVMS[B.iv], hms = H.ms || IVMS[H.iv]; const o = new Array(B.N).fill(null); let j = -1;
  for (let i = 0; i < B.N; i++) { const close = B.t[i] + ms; while (j + 1 < H.N && H.t[j + 1] + hms <= close) j++; o[i] = j >= 0 ? arr[j] : null; } return o; }

// ---------------- simulering
// sig: {i, dir, stop, tgtR?, maxBars?, trail?: {atrMult, A}, exitFn?(j, entry) -> bool (exit på lukk)}
function simulate(B, sigs, cost) {
  const trades = []; let busyUntil = -1;
  for (const s of sigs) {
    if (s.i <= busyUntil || s.i + 1 >= B.N) continue;
    const i = s.i, dir = s.dir, entry = B.o[i + 1]; let stop = s.stop; const risk = (entry - stop) * dir; if (!(risk > 0)) continue;
    if (risk / entry < 0.001) continue; // for kort stopp (< 0,1 %)
    const tgt = s.tgtR ? entry + dir * s.tgtR * risk : null, last = s.maxBars ? Math.min(B.N - 1, i + s.maxBars) : B.N - 1;
    let exit = null, j = i + 1, how = null;
    for (; j <= last; j++) {
      const sHit = dir > 0 ? B.l[j] <= stop : B.h[j] >= stop;
      if (sHit) { exit = j > i + 1 ? (dir > 0 ? Math.min(stop, B.o[j]) : Math.max(stop, B.o[j])) : stop; how = 'stopp'; break; }
      if (tgt != null && (dir > 0 ? B.h[j] >= tgt : B.l[j] <= tgt)) { exit = tgt; how = 'mål'; break; }
      if (s.exitFn && s.exitFn(j, entry)) { exit = B.c[j]; how = 'exit'; break; }
      if (s.trail) { const a = s.trail.A[j]; if (a) { const ns = dir > 0 ? B.h[j] - s.trail.k * a : B.l[j] + s.trail.k * a; if (dir > 0 ? ns > stop : ns < stop) stop = ns; } }
    }
    if (exit == null) { if (j > B.N - 1) break; exit = B.c[last]; how = 'tid'; j = last; }
    const g = (exit - entry) * dir / risk, c = cost * 2 * entry / risk;
    trades.push({ t: B.t[i], i, dir, R: g - c, gross: g, how, bars: j - i, ret: (exit - entry) * dir / entry - cost * 2 });
    busyUntil = j;
  }
  return trades;
}
function stats(tr) { const n = tr.length; if (!n) return { n: 0 };
  const R = tr.map(x => x.R), m = R.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(R.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
  let cum = 0, pk = 0, dd = 0; for (const r of R) { cum += r; pk = Math.max(pk, cum); dd = Math.max(dd, pk - cum); }
  const pos = R.filter(x => x > 0).reduce((a, b) => a + b, 0), neg = -R.filter(x => x <= 0).reduce((a, b) => a + b, 0);
  return { n, exp: m, se: sd / Math.sqrt(n), t: m / (sd / Math.sqrt(n) || 1), win: R.filter(x => x > 0).length / n, sum: cum, dd, pf: neg ? pos / neg : null,
    bars: tr.reduce((a, x) => a + x.bars, 0) / n, ret: tr.reduce((a, x) => a + x.ret, 0) / n }; }
module.exports = { load, resample, ema, sma, rsi, atr, donch, align, simulate, stats, IVMS };
