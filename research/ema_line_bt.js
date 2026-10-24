// «Kjøp over den grønne linja, selg under»: hold coinen når lukkekursen er over en EMA, ellers kontanter.
// Signal på dagslukk, handel på neste dags åpning (ingen titting fremover). 0,1 % gebyr per handel.
const RG = require('../site/regime.js'), zlib = require('zlib'), fs = require('fs');
const ld = s => JSON.parse(zlib.gunzipSync(fs.readFileSync(`${__dirname}/data/${s}_1d.json.gz`))).map(r => ({ t: r[0], o: +r[1], c: +r[4] }));
const COINS = 'BTC,ETH,XRP,ADA,SOL,BNB,LINK,DOGE,POL,SAND'.split(','), FEE = 0.001;
const weekly = D => { const W = []; for (const d of D) { const w = Math.floor((d.t / 864e5 + 3) / 7); if (!W.length || W[W.length - 1].w !== w) W.push({ w, t: d.t, o: d.o, c: d.c }); else W[W.length - 1].c = d.c; } return W; };
function run(B, len, warm) {
  const e = RG.ema(B.map(b => b.c), len); let eq = 1, bh = 1, inM = false, pk = 1, mdd = 0, bpk = 1, bmdd = 0, tr = 0, days = 0, inDays = 0;
  for (let i = warm; i < B.length - 1; i++) {
    const want = e[i] != null && B[i].c > e[i];
    if (want !== inM) { eq *= 1 - FEE; inM = want; tr++; }
    const r = B[i + 1].c / B[i].c; // posisjon tatt på åpning i+1 ≈ close i
    if (inM) { eq *= r; inDays++; } bh *= r; days++;
    pk = Math.max(pk, eq); mdd = Math.min(mdd, eq / pk - 1); bpk = Math.max(bpk, bh); bmdd = Math.min(bmdd, bh / bpk - 1);
  }
  return { eq, bh, mdd, bmdd, tr, inPct: inDays / days };
}
const f = v => (v >= 0 ? '+' : '') + Math.round(v * 100) + ' %';
for (const [name, len, wk] of [['EMA 50 dag', 50, false], ['EMA 200 dag', 200, false], ['EMA 21 uke', 21, true], ['EMA 50 uke', 50, true]]) {
  console.log('\n== ' + name); let better = 0, n = 0, betterDD = 0;
  for (const s of COINS) { let B = ld(s); if (wk) B = weekly(B); const warm = wk ? 52 : 200; if (B.length < warm + 50) continue;
    const r = run(B, len, warm); n++; if (r.eq > r.bh) better++; if (r.mdd > r.bmdd) betterDD++;
    console.log(`${s.padEnd(5)} fra ${new Date(B[warm].t).toISOString().slice(0, 7)}: regel ${f(r.eq - 1).padStart(9)} (maks fall ${f(r.mdd)}) | kjøp og hold ${f(r.bh - 1).padStart(9)} (maks fall ${f(r.bmdd)}) | ${r.tr} handler, i markedet ${Math.round(r.inPct * 100)} %`); }
  console.log(`Slår kjøp-og-hold i avkastning: ${better}/${n} · mindre maks fall: ${betterDD}/${n}`);
}
