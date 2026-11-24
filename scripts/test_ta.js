// Tester for Teknisk analyse (site/ta.js): ingen innsyn i framtiden, speilvending og at historikken måles riktig.
// Kjør: node scripts/test_ta.js            (syntetiske kurser)
//       TA_DATA=fil.json.gz node scripts/test_ta.js   (ekte dagslys, f.eks. BTC_1d.json.gz fra grenen research-data)
'use strict';
const fs = require('fs'), zlib = require('zlib'), path = require('path');
global.RG = require(path.join(__dirname, '..', 'site', 'regime.js'));
const TA = require(path.join(__dirname, '..', 'site', 'ta.js'));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FEIL:', m); } else console.log('ok  ', m); };
function synth(n, seed) { let s = seed, p = 100; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const B = [];
  for (let i = 0; i < n; i++) { const reg = Math.sin(i / 90) * 0.004, ch = reg + (r() - 0.5) * 0.06, o = p; p = Math.max(1, p * (1 + ch)); const h = Math.max(o, p) * (1 + r() * 0.02), l = Math.min(o, p) * (1 - r() * 0.02);
    B.push({ t: Date.UTC(2018, 0, 1) + i * 864e5, o, h, l, c: p, v: 1000 * (1 + r() * 3) }); } return B; }
const B = process.env.TA_DATA ? JSON.parse(zlib.gunzipSync(fs.readFileSync(process.env.TA_DATA))).map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })) : synth(1600, 7);
const strip = a => JSON.stringify(a, (k, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
// 1) samme resultat på lys e med og uten senere lys (alle deler: svingpunkter, struktur, Wyckoff, mønstre, former, divergens)
const X = TA.prep(B), M = TA.mirror(B); let same = true;
for (const e of [400, 700, 1000, B.length - 300, B.length - 120]) { if (e < 300 || e >= B.length) continue;
  const full = TA.analyze(B, e, '1d', X, M), cut = TA.analyze(B.slice(0, e + 1), e, '1d');
  if (strip(full) !== strip(cut)) { same = false; console.log('  avvik ved e =', e); } }
ok(same, 'analyze(e) er lik med og uten framtidige lys');
// 2) endrede framtidige lys endrer ikke historikken før kuttet
{ const cut = B.length - 200, B2 = B.map((b, i) => i > cut ? Object.assign({}, b, { c: b.c * 1.3, h: b.h * 1.3, l: b.l * 1.3, o: b.o * 1.3 }) : b);
  const h1 = TA.history(B, '1d', { end: cut }).ev, h2 = TA.history(B2, '1d', { end: cut }).ev;
  ok(strip(h1) === strip(h2), `historikken fram til lys ${cut} er lik når senere kurser endres (${h1.length} hendelser)`); }
// 3) svingpunkter: bekreftet k lys etterpå, vekslende topp/bunn
{ const e = B.length - 1, P = TA.pivots(B, e, X, 5, 300); ok(P.every(p => p.conf === p.i + 5 && p.conf <= e), 'svingpunkter er bekreftet 5 lys etter');
  ok(P.every((p, i) => !i || p.type !== P[i - 1].type), 'svingpunktene veksler mellom topp og bunn'); }
// 4) speilvending: dobbel topp på speilet kurs = dobbel bunn
{ const base = []; const add = (n, a, b) => { for (let i = 0; i < n; i++) { const c = a + (b - a) * (i + 1) / n; base.push({ t: Date.UTC(2020, 0, 1) + base.length * 864e5, o: c, h: c * 1.005, l: c * 0.995, c, v: 1 }); } };
  add(60, 200, 100); add(15, 100, 130); add(15, 130, 100.5); add(25, 100.5, 140); add(10, 140, 135);
  const e = base.length - 1, a = TA.analyze(base, e, '1d'), db = a.pat.find(p => p.type === 'db');
  ok(db && db.st === 'confirmed', `konstruert dobbel bunn blir funnet og bekreftet (${db ? db.st : 'ingen'})`);
  const top = base.map(b => ({ t: b.t, o: 1000 - b.o, h: 1000 - b.l, l: 1000 - b.h, c: 1000 - b.c, v: 1 })), at = TA.analyze(top, e, '1d'), dt = at.pat.find(p => p.type === 'dt');
  ok(dt && dt.st === 'confirmed', `samme figur opp-ned blir dobbel topp (${dt ? dt.st : 'ingen'})`); }
// 5) endring etter 30 dager stemmer med rådata
{ const e = 500, r = TA.fwd(B, e, 30), j = B.findIndex(b => b.t >= B[e].t + 30 * 864e5); ok(Math.abs(r - (B[j].c / B[e].c - 1)) < 1e-12, 'endring etter 30 dager stemmer med rådata'); }
// 6) ingen NaN i siste analyse
{ const a = TA.analyze(B, B.length - 1, '1d'); ok(!/NaN|Infinity/.test(JSON.stringify(a)), 'ingen NaN/Infinity i analysen'); }
console.log(fails ? `${fails} feil` : 'alle tester ok'); process.exit(fails ? 1 : 0);
