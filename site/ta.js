// Teknisk analyse: finner strukturer i grafen med faste regler. Ren JS (UMD) – brukes i nettleseren og i tester (Node).
// Alt regnes på lukkede lys til og med indeks e. Et svingpunkt er først kjent k lys etterpå, så ingenting ser inn i framtiden.
// Reglene er heuristikker (laget på forhånd, ikke tilpasset), og «history()» måler hva som skjedde etter hver gang de slo til før.
(function (root) {
  'use strict';
  const RG = root.RG || (typeof require !== 'undefined' ? require('./regime.js') : null);
  const K = { '4h': 5, '1d': 5, '1w': 3 }, LOOK = { '4h': 300, '1d': 300, '1w': 200 };

  // forberedte serier (alle kausale: verdien på i bruker bare lys ≤ i)
  function prep(B) { const c = B.map(b => b.c); const vs = RG.sma(B.map(b => b.v || 0), 50);
    return { atr: RG.atr(B), rsi: RG.rsi(c), vavg: vs }; }
  // speilvendte lys: topper blir bunner. Brukes for å finne fordeling/dobbel topp med samme kode som akkumulering/dobbel bunn.
  const mirror = B => B.map(b => ({ t: b.t, o: -b.o, h: -b.l, l: -b.h, c: -b.c, v: b.v }));
  const A_ = (X, i, B) => X.atr[i] || Math.abs(B[i].c) * 0.02;

  // ---------------------------------------------------------------- svingpunkter (zigzag)
  // Svingtopp: høyeste høy k lys på hver side. Bekreftet på lys i + k. Påfølgende svingpunkter må veksle (topp/bunn)
  // og ligge minst 1,5 ATR fra forrige; to av samme type på rad → beholder den mest ekstreme.
  function pivots(B, e, X, k, look) {
    const from = Math.max(k, e - look), raw = [];
    for (let i = from; i <= e - k; i++) { let hi = true, lo = true;
      for (let j = i - k; j <= i + k; j++) { if (j === i) continue; if (B[j].h >= B[i].h) hi = false; if (B[j].l <= B[i].l) lo = false; if (!hi && !lo) break; }
      if (hi) raw.push({ i, t: B[i].t, p: B[i].h, type: 'H', conf: i + k }); if (lo) raw.push({ i, t: B[i].t, p: B[i].l, type: 'L', conf: i + k }); }
    const P = [];
    for (const x of raw) { const L = P[P.length - 1];
      if (!L) { P.push(x); continue; }
      if (L.type === x.type) { if (x.type === 'H' ? x.p > L.p : x.p < L.p) P[P.length - 1] = x; continue; }
      if (Math.abs(x.p - L.p) >= 1.5 * A_(X, x.i, B)) P.push(x); }
    return P;
  }

  // ---------------------------------------------------------------- markedsstruktur: HH/HL/LH/LL, BOS og CHoCH
  // BOS (brudd i strukturen) = lukk forbi siste svingtopp/-bunn i samme retning som trenden. CHoCH (skifte i karakter) = første brudd mot trenden.
  function structure(B, e, P) {
    let pH = null, pL = null; const lab = P.map(x => { let s; if (x.type === 'H') { s = pH == null ? 'H' : x.p > pH ? 'HH' : 'LH'; pH = x.p; } else { s = pL == null ? 'L' : x.p > pL ? 'HL' : 'LL'; pL = x.p; } return Object.assign({}, x, { lab: s }); });
    const lastH = [...lab].reverse().find(x => x.type === 'H'), lastL = [...lab].reverse().find(x => x.type === 'L');
    let trend = 'range'; if (lastH && lastL) { if (lastH.lab === 'HH' && lastL.lab === 'HL') trend = 'up'; else if (lastH.lab === 'LH' && lastL.lab === 'LL') trend = 'down'; }
    const br = []; let dir = 0, hB = null, lB = null, h = null, l = null, pi = 0; const start = P.length ? P[0].i : e;
    for (let i = start; i <= e; i++) {
      while (pi < P.length && P[pi].conf <= i) { if (P[pi].type === 'H') h = P[pi]; else l = P[pi]; pi++; } // bare svingpunkter som er kjent på lys i
      if (h && h !== hB && B[i].c > h.p) { br.push({ i, t: B[i].t, kind: dir === -1 ? 'CHoCH' : 'BOS', dir: 1, level: h.p, from: h.i }); dir = 1; hB = h; }
      if (l && l !== lB && B[i].c < l.p) { br.push({ i, t: B[i].t, kind: dir === 1 ? 'CHoCH' : 'BOS', dir: -1, level: l.p, from: l.i }); dir = -1; lB = l; }
    }
    return { piv: lab, trend, breaks: br, last: br[br.length - 1] || null };
  }

  // ---------------------------------------------------------------- Wyckoff-akkumulering (fordeling = samme regler på speilvendte lys)
  // SC salgsklimaks → AR automatisk reaksjon (toppen av rangen) → ST sekundær test → Spring (falskt brudd under bunnen) →
  // SOS styrketegn (lukk over toppen) → LPS siste støttepunkt (tilbaketrekk som holder over midten). Fase A–E etter hvor langt den er kommet.
  function wyAcc(B, e, X, look) {
    const s0 = Math.max(1, e - look); if (e - s0 < 40) return null;
    let m = s0; for (let i = s0; i <= e; i++) if (B[i].l < B[m].l) m = i;
    const decl = i => { let hi = -Infinity; for (let j = Math.max(0, i - 150); j <= i; j++) hi = Math.max(hi, B[j].h); return (hi - B[i].l) / A_(X, i, B); };
    const isLow = (i, r) => { for (let j = Math.max(0, i - r); j <= Math.min(e, i + r); j++) if (j !== i && B[j].l < B[i].l) return false; return i + r <= e; };
    // salgsklimaks: første bunn i området rundt laveste kurs, etter et fall på minst 8 ATR, med et rally på minst 3 ATR imellom
    let sc = m;
    for (let j = s0; j <= m - 15; j++) { if (!isLow(j, 3) || B[j].l > B[m].l + 1.5 * A_(X, m, B)) continue; let mx = -Infinity; for (let q = j; q <= m; q++) mx = Math.max(mx, B[q].h);
      if (mx - B[j].l >= 3 * A_(X, j, B) && decl(j) >= 8) { sc = j; break; } }
    if (decl(sc) < 8 || sc > e - 3) return null;
    const A0 = A_(X, sc, B), ev = { SC: { i: sc, p: B[sc].l, vol: X.vavg[sc] ? B[sc].v / X.vavg[sc] : null } };
    let ar = -1; for (let i = sc + 1; i <= Math.min(e, sc + 40); i++) if (ar < 0 || B[i].h > B[ar].h) ar = i;
    if (ar < 0 || B[ar].h < B[sc].l + 2 * A0 || ar > e - 2) return { kind: 'acc', phase: 'A', ev, bot: B[sc].l, top: null, active: true, from: sc, to: e, score: 1 };
    ev.AR = { i: ar, p: B[ar].h }; const bot = B[sc].l, top = B[ar].h, Hg = top - bot, mid = bot + Hg / 2;
    // sekundær test: første bunn etter AR i nedre tredjedel av rangen (men ikke langt under bunnen)
    for (let i = ar + 2; i <= e - 2; i++) if (isLow(i, 2) && B[i].l <= bot + 0.35 * Hg && B[i].l >= bot - 0.1 * Hg) { ev.ST = { i, p: B[i].l, lowerVol: ev.SC.vol != null && X.vavg[i] ? B[i].v / X.vavg[i] < ev.SC.vol : null }; break; }
    // spring: stikker under bunnen (maks 25 % av rangen eller 3 ATR) og lukker tilbake over innen 3 lys
    const s1 = ev.ST ? ev.ST.i : ar + 2;
    for (let i = s1; i <= e; i++) { if (B[i].l >= bot || B[i].l < bot - Math.max(0.25 * Hg, 3 * A0)) continue; let back = -1; for (let q = i; q <= Math.min(e, i + 3); q++) if (B[q].c > bot) { back = q; break; } if (back >= 0) { ev.Spring = { i, p: B[i].l, back }; break; } }
    // styrketegn: lukk over toppen av rangen
    const s2 = ev.Spring ? ev.Spring.i : ev.ST ? ev.ST.i : ar + 5;
    for (let i = s2; i <= e; i++) if (B[i].c > top + 0.1 * A0) { ev.SOS = { i, p: B[i].c, vol: X.vavg[i] ? B[i].v / X.vavg[i] : null }; break; }
    if (ev.SOS) for (let i = ev.SOS.i + 2; i <= e - 2; i++) if (isLow(i, 2) && B[i].l >= mid && B[i].l <= top + 0.5 * Hg) { ev.LPS = { i, p: B[i].l }; break; }
    // brutt ned: siste lukk godt under bunnen (og ingen ny spring etterpå)
    const lastC = B[e].c, failed = lastC < bot - 0.3 * Hg, done = lastC > top + 2 * Hg;
    let phase = ev.SOS ? (ev.LPS && lastC > top + 0.5 * Hg ? 'E' : 'D') : ev.Spring ? 'C' : ev.ST ? 'B' : 'A';
    const score = 1 + !!ev.AR + !!ev.ST + !!ev.Spring + !!ev.SOS + !!ev.LPS + (ev.SC.vol >= 1.5 ? 1 : 0) + (ev.ST && ev.ST.lowerVol ? 1 : 0) + (ev.SOS && ev.SOS.vol >= 1.2 ? 1 : 0);
    return { kind: 'acc', phase, ev, bot, top, mid, Hg, active: !failed && !done, failed, done, back: !!ev.SOS && lastC < top, from: sc, to: e, score };
  }
  function wyckoff(B, e, X, Mb, look) {
    const a = wyAcc(B, e, X, look), d0 = wyAcc(Mb, e, X, look);
    const flip = r => { if (!r) return null; const ev = {}, map = { SC: 'BC', AR: 'AR', ST: 'ST', Spring: 'UTAD', SOS: 'SOW', LPS: 'LPSY' };
      for (const [k, v] of Object.entries(r.ev)) ev[map[k]] = Object.assign({}, v, { p: -v.p });
      return Object.assign({}, r, { kind: 'dist', ev, bot: r.top == null ? null : -r.top, top: -r.bot, mid: r.mid == null ? null : -r.mid }); };
    const d = flip(d0), c = [a, d].filter(Boolean); if (!c.length) return null;
    c.sort((x, y) => (y.active - x.active) || (y.from - x.from)); return c[0];
  }

  // ---------------------------------------------------------------- mønstre: dobbel bunn og invers hode-og-skuldre (topp-versjonene = speilvendt)
  function bottoms(B, e, P, X) {
    const out = [], Ls = P.map((x, j) => [x, j]).filter(([x]) => x.type === 'L');
    // dobbel bunn: to bunner innenfor 1 ATR, minst 8 lys mellom, toppen imellom minst 3 ATR over
    for (let q = Math.max(1, Ls.length - 2); q < Ls.length; q++) { const [L2, j2] = Ls[q], [L1, j1] = Ls[q - 1]; if (j2 - j1 !== 2) continue; const Hp = P[j1 + 1], A = A_(X, L2.i, B);
      if (Math.abs(L2.p - L1.p) > A || L2.i - L1.i < 8 || L2.i - L1.i > 150 || Hp.p - Math.max(L1.p, L2.p) < 3 * A) continue;
      const lo = Math.min(L1.p, L2.p); let st = 'forming', at = null;
      for (let i = L2.conf; i <= e; i++) { if (B[i].c > Hp.p) { st = 'confirmed'; at = i; break; } if (B[i].c < lo - A) { st = 'failed'; at = i; break; } }
      if (L2.i < e - 80 && !(st === 'confirmed' && at >= e - 40)) continue;
      out.push({ type: 'db', st, at, pts: [L1, Hp, L2], neck: { a: { i: L1.i, p: Hp.p }, b: { i: e, p: Hp.p } }, target: Hp.p + (Hp.p - lo), stop: lo, key: `db:${L1.i}:${L2.i}` }); }
    // invers hode-og-skuldre: L1 H1 L2 H2 L3 der L2 er lavest, skuldrene L1/L3 omtrent like, halsen gjennom H1 og H2
    for (let j = Math.max(0, P.length - 7); j + 4 < P.length; j++) { const [s1, h1, hd, h2, s2] = P.slice(j, j + 5); if (s1.type !== 'L') continue; const A = A_(X, s2.i, B);
      if (hd.p > Math.min(s1.p, s2.p) - A || Math.abs(s1.p - s2.p) > 0.35 * (Math.max(h1.p, h2.p) - hd.p)) continue;
      const neck = i => h1.p + (h2.p - h1.p) * (i - h1.i) / (h2.i - h1.i); let st = 'forming', at = null;
      for (let i = s2.conf; i <= e; i++) { if (B[i].c > neck(i)) { st = 'confirmed'; at = i; break; } if (B[i].c < hd.p) { st = 'failed'; at = i; break; } }
      if (s2.i < e - 80 && !(st === 'confirmed' && at >= e - 40)) continue;
      out.push({ type: 'ihs', st, at, pts: [s1, h1, hd, h2, s2], neck: { a: { i: h1.i, p: h1.p }, b: { i: e, p: neck(e) } }, target: neck(hd.i) + (neck(hd.i) - hd.p), stop: Math.min(s2.p, hd.p), key: `ihs:${hd.i}` }); }
    return out;
  }
  function patterns(B, e, P, X, Mb, PM) {
    const flipT = { db: 'dt', ihs: 'hs' }, neg = p => ({ ...p, p: -p.p });
    const bull = bottoms(B, e, P, X), bear = bottoms(Mb, e, PM, X).map(x => ({ ...x, type: flipT[x.type], pts: x.pts.map(neg), neck: { a: neg(x.neck.a), b: neg(x.neck.b) }, target: -x.target, stop: -x.stop, key: flipT[x.type] + x.key.slice(x.key.indexOf(':')) }));
    return bull.concat(bear);
  }

  // ---------------------------------------------------------------- trekanter, kiler og kanaler: linje gjennom de to siste toppene og de to siste bunnene (log-pris)
  function shapes(B, e, P, X) {
    const Hs = P.filter(x => x.type === 'H').slice(-2), Ls = P.filter(x => x.type === 'L').slice(-2); if (Hs.length < 2 || Ls.length < 2) return null;
    const ln = (a, b) => { const s = (Math.log(b.p) - Math.log(a.p)) / (b.i - a.i); return { s, f: i => Math.exp(Math.log(a.p) + s * (i - a.i)), a, b }; };
    if (Hs.some(x => x.p <= 0) || Ls.some(x => x.p <= 0)) return null;
    const U = ln(Hs[0], Hs[1]), D = ln(Ls[0], Ls[1]), st = Math.max(Hs[0].i, Ls[0].i), en = Math.max(Hs[1].i, Ls[1].i), span = e - Math.min(Hs[0].i, Ls[0].i);
    if (span < 20 || en < e - 40 || U.f(en) <= D.f(en)) return null;
    const A = A_(X, e, B), tol = A / B[e].c, flat = s => Math.abs(s * span) < 0.6 * tol * 3; // flat = beveger seg mindre enn ca. 2 ATR over hele mønsteret
    let viol = 0; for (let i = st; i <= Math.min(e, en); i++) if (B[i].c > U.f(i) * (1 + tol * 0.5) || B[i].c < D.f(i) * (1 - tol * 0.5)) viol++; if (viol > 2) return null;
    const conv = U.s < D.s - tol / span, par = Math.abs(U.s - D.s) <= tol / span;
    let type = null;
    if (conv) { if (flat(U.s) && D.s > 0) type = 'asc'; else if (flat(D.s) && U.s < 0) type = 'desc'; else if (U.s < 0 && D.s > 0) type = 'sym'; else if (U.s > 0 && D.s > 0) type = 'rwedge'; else if (U.s < 0 && D.s < 0) type = 'fwedge'; }
    else if (par) type = U.s > 0 && !flat(U.s) ? 'chup' : U.s < 0 && !flat(U.s) ? 'chdn' : 'rng';
    if (!type) return null;
    let br = null; for (let i = en + 1; i <= e; i++) { if (B[i].c > U.f(i) + 0.2 * A) { br = { dir: 1, i }; break; } if (B[i].c < D.f(i) - 0.2 * A) { br = { dir: -1, i }; break; } }
    return { type, up: { a: { i: U.a.i, p: U.a.p }, b: { i: e, p: U.f(e) } }, lo: { a: { i: D.a.i, p: D.a.p }, b: { i: e, p: D.f(e) } }, br, key: `${type}:${Hs[0].i}:${Ls[0].i}` };
  }

  // ---------------------------------------------------------------- RSI-divergens: kursen lager lavere bunn men RSI høyere bunn (positiv), og omvendt på toppene
  function divergence(B, e, P, X) {
    const out = [];
    for (const [ty, dir] of [['L', 1], ['H', -1]]) { const S = P.filter(x => x.type === ty).slice(-2); if (S.length < 2) continue; const [a, b] = S, ra = X.rsi[a.i], rb = X.rsi[b.i];
      if (ra == null || rb == null || b.i - a.i > 60 || b.i < e - 25) continue;
      if (dir > 0 && b.p < a.p && rb > ra + 2) out.push({ type: 'bull', a, b, ra, rb, key: `dv+:${b.i}` });
      if (dir < 0 && b.p > a.p && rb < ra - 2) out.push({ type: 'bear', a, b, ra, rb, key: `dv-:${b.i}` }); }
    return out;
  }

  // ---------------------------------------------------------------- alt samlet for lys e
  function analyze(B, e, tf, X, Mb) {
    X = X || prep(B); Mb = Mb || mirror(B); const k = K[tf] || 5, look = LOOK[tf] || 300;
    const P = pivots(B, e, X, k, look), PM = pivots(Mb, e, X, k, look);
    return { e, t: B[e].t, piv: P, st: structure(B, e, P), wy: wyckoff(B, e, X, Mb, look), pat: patterns(B, e, P, X, Mb, PM), sh: shapes(B, e, P, X), div: divergence(B, e, P, X) };
  }

  // ---------------------------------------------------------------- historikk: hva skjedde etter hver gang en struktur slo til før (samme coin og tidsramme)
  // Kjører analyze() for hvert lys med bare data kjent da, og registrerer første lys der hver hendelse ble kjent.
  const KINDS = {
    wyA_C: 'Wyckoff-akkumulering: spring', wyA_D: 'Wyckoff-akkumulering: styrketegn (SOS)', wyD_C: 'Wyckoff-fordeling: UTAD', wyD_D: 'Wyckoff-fordeling: svakhetstegn (SOW)',
    db: 'Dobbel bunn bekreftet', dt: 'Dobbel topp bekreftet', ihs: 'Invers hode-og-skuldre bekreftet', hs: 'Hode-og-skuldre bekreftet',
    br_up: 'Brudd opp fra trekant/kile', br_dn: 'Brudd ned fra trekant/kile', dv_bull: 'Positiv RSI-divergens', dv_bear: 'Negativ RSI-divergens', ch_up: 'CHoCH opp (trendskifte)', ch_dn: 'CHoCH ned (trendskifte)' };
  function history(B, tf, opt = {}) {
    const X = prep(B), Mb = mirror(B), e1 = opt.end == null ? B.length - 1 : opt.end, from = opt.from || 250, seen = new Set(), ev = [];
    const add = (kind, key, e) => { if (seen.has(key)) return; seen.add(key); ev.push({ kind, e, t: B[e].t }); };
    for (let e = from; e <= e1; e += opt.step || 1) { const a = analyze(B, e, tf, X, Mb);
      if (a.wy && a.wy.active !== false) { const w = a.wy, id = (w.kind === 'acc' ? 'wyA' : 'wyD') + ':' + w.from; if (w.phase === 'C') add(w.kind === 'acc' ? 'wyA_C' : 'wyD_C', id + ':C', e); if (w.phase === 'D') add(w.kind === 'acc' ? 'wyA_D' : 'wyD_D', id + ':D', e); }
      for (const p of a.pat) if (p.st === 'confirmed') add(p.type, p.key, e);
      if (a.sh && a.sh.br) add(a.sh.br.dir > 0 ? 'br_up' : 'br_dn', a.sh.key, e);
      for (const d of a.div) add(d.type === 'bull' ? 'dv_bull' : 'dv_bear', d.key, e);
      const lb = a.st.last; if (lb && lb.kind === 'CHoCH' && lb.i === e) add(lb.dir > 0 ? 'ch_up' : 'ch_dn', `ch:${lb.i}`, e); }
    return { ev, stats: stats(B, ev, from, e1) };
  }
  // endring etter 30 og 90 dager (lukk til lukk), for hendelsene og for alle lys (basis)
  function fwd(B, e, days) { const tt = B[e].t + days * 864e5; let lo = e, hi = B.length - 1; if (B[hi].t < tt) return null; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m].t < tt) lo = m + 1; else hi = m; } return B[lo].c / B[e].c - 1; }
  const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
  function stats(B, ev, from, e1) {
    const sum = rows => { const o = {}; for (const h of [30, 90]) { const v = rows.map(e => fwd(B, e, h)).filter(x => x != null); o[h] = { n: v.length, med: med(v), up: v.length ? v.filter(x => x > 0).length / v.length : null }; } return o; };
    const base = []; for (let e = from; e <= e1; e++) base.push(e);
    const by = {}; for (const x of ev) (by[x.kind] = by[x.kind] || []).push(x.e);
    return { base: sum(base), kinds: Object.fromEntries(Object.entries(by).map(([k, es]) => [k, Object.assign(sum(es), { n: es.length, last: es[es.length - 1] })])) };
  }

  const TA = { prep, mirror, pivots, structure, wyckoff, patterns, shapes, divergence, analyze, history, fwd, KINDS, K, LOOK };
  if (typeof module !== 'undefined' && module.exports) module.exports = TA; else root.TA = TA;
})(typeof window !== 'undefined' ? window : globalThis);
