// Tester for hendelsesmotoren: kjente datoer, ingen innsyn i framtiden og at analysen i nettleseren stemmer med rådata.
// Kjør: EVENTS_MOCK=mappe node scripts/test_events.js
'use strict';
const fs = require('fs'), path = require('path');
const EV = require('./events.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FEIL:', m); } else console.log('ok  ', m); };
const MK = process.env.EVENTS_MOCK; const mk = n => JSON.parse(fs.readFileSync(path.join(MK, n + '.json'), 'utf8'));
// 1) valgdager
ok(EV.iso(EV.electionDay(2022)) === '2022-11-08' && EV.iso(EV.electionDay(2018)) === '2018-11-06' && EV.iso(EV.electionDay(2026)) === '2026-11-03' && EV.iso(EV.electionDay(2024)) === '2024-11-05', 'valgdager');
// 2) Fed-regler på en kjent rekke beslutninger
const ch = EV.fedChanges([], mk('fred_DFEDTARU')); const F = EV.fedEvents(ch, EV.D('2026-11-16'));
const has = (a, s) => a.map(EV.iso).includes(s);
ok(has(F.firstHike, '2015-12-17') && has(F.firstHike, '2022-03-17') && has(F.firstHike, '2026-09-17') && !has(F.firstHike, '2016-12-15'), 'første renteheving: 2015, 2022, 2026 (ikke 2016)');
ok(has(F.firstCut, '2019-08-01') && has(F.firstCut, '2024-09-19') && !has(F.firstCut, '2025-09-18'), 'første rentekutt: 2019 og 2024 (ikke 2025)');
ok(has(F.lastHike, '2018-12-20') && has(F.lastHike, '2023-07-27') && !has(F.lastHike, '2026-09-17'), 'siste heving: 2018 og 2023, ikke 2026 (ukjent ennå)');
// 3) ingen innsyn i framtiden: hendelser før en dato er like når dataene kuttes ved datoen
const assets = { BTC: { data: mk('bitstamp_btc'), src: 'mock' }, SPX: { data: mk('yahoo__GSPC'), src: 'mock' } };
const macro = { fedTarU: mk('fred_DFEDTARU'), vix: mk('fred_VIXCLS') };
const full = EV.compute({ assets, macro, now: Date.UTC(2026, 10, 16) });
for (const cut of ['2020-06-01', '2023-01-15']) { const X = EV.D(cut), c = a => a.filter(x => x.d <= X);
  const part = EV.compute({ assets: { BTC: { data: c(assets.BTC.data) }, SPX: { data: c(assets.SPX.data) } }, macro: { fedTarU: c(macro.fedTarU), vix: c(macro.vix) }, now: (X + 1) * 864e5 - 1 });
  let same = true; for (const e of full.events) { const p = part.events.find(x => x.id === e.id); if (!p) continue; if (e.hindsight) continue;
    const A = (e.dates || (e.perAsset.BTC || [])).filter(d => d <= cut), B = (p.dates || (p.perAsset.BTC || [])).filter(d => d <= cut);
    if (JSON.stringify(A) !== JSON.stringify(B)) { same = false; console.log('  avvik', e.id, A.slice(-3), B.slice(-3)); } }
  ok(same, `kuttet ${cut}: samme hendelser fram til datoen (unntatt «vet først i etterkant»)`); }
// 4) kursserien som sendes til nettleseren kan dekodes tilbake
const A = full.assets.BTC; let p = 0; const t = A.t.map(x => (p += x)); const raw = assets.BTC.data;
ok(t.length === raw.length && t.every((d, i) => d === raw[i].d) && A.c.every((v, i) => Math.abs(v / raw[i].v - 1) < 1e-4), 'kursserien dekodes riktig (5 siffer)');
// 5) analysen i nettleseren (events-ui.js) mot rådata: BTC etter første heving 17.3.2022
global.window = {}; global.document = { getElementById: () => null }; global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.dash = { data: () => ({ status: 'ok', data: full }), params: () => ({}), setParams() {} };
new Function(fs.readFileSync(path.join(__dirname, '..', 'site', 'events-ui.js'), 'utf8'))();
const st = window.EVENTS._study(full, 'fed_first_hike', 'BTC', 365), r = st.rows.find(x => EV.iso(x.d) === '2022-03-17');
const i0 = raw.findIndex(x => x.d === EV.D('2022-03-17')); let mn = 0; for (let k = i0; k <= i0 + 365; k++) if (raw[k].v < raw[mn > 0 ? mn : i0].v) mn = k;
ok(r && Math.abs(r.mn - raw[mn].v / raw[i0].v) < 1e-3 && r.mnD === raw[mn].d - raw[i0].d, `2022: laveste dagslukk dag ${r && r.mnD} (rådata dag ${raw[mn].d - raw[i0].d}), ${r && Math.round((r.mn - 1) * 100)} %`);
ok(r && Math.abs(r.hz[91] - raw[i0 + 91].v / raw[i0].v) < 1e-3, '2022: endring etter 3 mnd stemmer med rådata');
const cur = st.rows[st.rows.length - 1]; ok(EV.iso(cur.d) === '2026-09-17' && cur.avail < 365, `pågående tilfelle (2026) er med og markert som ufullstendig (dag ${cur.avail})`);
// 6) søk
const s = window.EVENTS._search(full, 'rentehev'); ok(s.length && s[0].id.startsWith('fed_'), 'søk «rentehev» finner Fed-hendelser');
ok(window.EVENTS._search(full, 'midterm').slice(0, 3).some(e => e.id === 'midterm_day'), 'søk «midterm» finner midtvalg blant de tre første');
ok(!/NaN|Infinity/.test(JSON.stringify(full)), 'ingen NaN/Infinity i events.json');
console.log(fails ? `${fails} FEIL` : 'Alle tester ok'); process.exit(fails ? 1 : 0);
