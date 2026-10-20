// Henter candles fra Binance, kjører analysemotoren og skriver site/data/*.json.
// Kjøres av GitHub Actions (.github/workflows/update.yml). Sender push-varsel via ntfy ved endringer.
// Miljø: PAGES_URL (adressen til siden, med / på slutten), NTFY_TOPIC (kanal i ntfy-appen), FORCE=1 (bygg uansett).
const fs = require('fs'), path = require('path');
const MS = require('../engine.js');
const { clearSignal } = require('./rules.js');
const API = 'https://data-api.binance.vision/api/v3/klines';
const DAY = 864e5, H4 = 4 * 36e5;
const OUT = path.join(__dirname, '..', 'site', 'data');
const PAGES = process.env.PAGES_URL || '';
const TOPIC = process.env.NTFY_TOPIC || '';
const FORCE = process.env.FORCE === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); console.log(`${k}=${v}`); };

async function get(url, tries = 4) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); err = new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); }
    catch (e) { err = e; }
    await sleep(1500 * (i + 1));
  }
  throw err;
}
const row = (s, x) => ({ sym: s, t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], qv: +(+x[7]).toPrecision(3) });
async function daily(sym, now) {
  const out = []; let start = 0;
  for (;;) {
    const k = await get(`${API}?symbol=${sym}USDT&interval=1d&startTime=${start}&limit=1000`);
    for (const x of k) if (x[6] < now) out.push(row(sym, x));
    if (k.length < 1000) break; start = k[k.length - 1][0] + DAY;
  }
  return out;
}
async function fourH(sym, now) { const k = await get(`${API}?symbol=${sym}USDT&interval=4h&limit=601`); return k.filter(x => x[6] < now).map(x => row(sym, x)).slice(-600); }
async function prevJSON(file) {
  if (!PAGES) return null;
  try { const r = await fetch(`${PAGES}data/${file}?t=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
const fp = v => v == null ? '–' : v >= 1000 ? Math.round(v).toLocaleString('nb-NO').replace(/[  ]/g, ' ') : v >= 1 ? v.toLocaleString('nb-NO', { maximumFractionDigits: 3 }) : v.toLocaleString('nb-NO', { maximumSignificantDigits: 4 });
const pc = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('nb-NO', { maximumFractionDigits: 1 }) + ' %';
const EV = { wtBuy: 'WaveTrend kjøpssignal', wtSell: 'WaveTrend salgssignal', rsiOS: 'RSI under 30', rsiOB: 'RSI over 70', golden: 'golden cross', death: 'death cross', reclaim: 'tilbake over 200D EMA', lose: 'brudd under 200D EMA' };

async function notify(title, lines, priority = 3, tags = []) {
  if (!TOPIC) { console.log('(ingen NTFY_TOPIC)', title, lines); return; }
  const body = { topic: TOPIC, title, message: lines.join('\n'), priority, tags };
  if (PAGES) body.click = PAGES;
  try { const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); console.log('ntfy', r.status); }
  catch (e) { console.log('ntfy feilet', e.message); }
}

(async () => {
  const now = Date.now();
  const prev = await prevJSON('meta.json');
  const prevBT = await prevJSON('backtest.json');
  // rask sjekk: har det kommet en ny lukket 4t-candle siden forrige bygg?
  const probe = await get(`${API}?symbol=BTCUSDT&interval=4h&limit=3`);
  const last4h = Math.max(...probe.filter(x => x[6] < now).map(x => x[0]));
  if (!FORCE && prev && prev.last4h === last4h) { console.log('Ingen ny 4t-candle siden', new Date(last4h).toISOString()); output('deploy', 'false'); return; }

  const d1 = [], h4 = [];
  for (const s of MS.COINS) { const [a, b] = await Promise.all([daily(s, now), fourH(s, now)]); d1.push(...a); h4.push(...b); console.log(s, a.length, 'dager,', b.length, '4t'); }
  const R = MS.run(d1, h4);
  const built = new Date().toISOString();
  const rows = R.coins.map(c => ({ ...c, generated: built }));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'analysis.json'), JSON.stringify(rows));
  fs.writeFileSync(path.join(OUT, 'candles_1d.json'), JSON.stringify(d1));
  fs.writeFileSync(path.join(OUT, 'candles_4h.json'), JSON.stringify(h4));
  // cache-busting: nye versjoner av app.js/dash-shim.js lastes med en gang
  const ver = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 8), ix = path.join(OUT, '..', 'index.html');
  fs.writeFileSync(ix, fs.readFileSync(ix, 'utf8').replace(/src="(app|dash-shim|daytrade)\.js[^"]*"/g, `src="$1.js?v=${ver}"`));
  const lastD = R.asOf;
  const coins = {};
  for (const c of R.coins) coins[c.sym] = { code: c.status.code, label: c.status.label, score: c.score, price: c.price,
    majUp: c.keys.majUp && c.keys.majUp.p, majDn: c.keys.majDn && c.keys.majDn.p,
    breaks: (c.breaks || []).filter(b => b.type === 'bekreftet' || b.type === 'retest').map(b => `${b.dir}:${b.level}:${b.date}`) };
  const meta = { built, last4h, lastD, coins };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
  console.log('OK', new Date(lastD).toISOString().slice(0, 10), R.coins.map(c => `${c.sym} ${c.price} ${c.status.label} ${c.score}`).join(' | '));

  // ---- varsler
  if (!prev || !prev.coins) {
    await notify('Krypto-scanner er i gang', [...R.coins.map(c => `${c.sym} ${fp(c.price)} · ${c.status.label} · score ${c.score}`), '', 'Du får varsel når en status endres eller nye signaler kommer.'], 3, ['white_check_mark']);
  } else {
    // 1) tydelige signaler: egne varsler med høy prioritet
    // 2) øvrige endringer: ett samlet varsel med lav prioritet (lydløst)
    const newDay = prev.lastD !== lastD;
    const other = [];
    for (const c of R.coins) {
      const o = prev.coins[c.sym]; if (!o) continue;
      const st = c.status, k = c.keys || {}, ex = c.ex || {};
      const today = newDay ? (c.eventsAll || []).filter(e => e.t === c.asOf) : [];
      const clear = clearSignal(c, o.code, newDay);
      if (clear) {
        const lines = [clear.why, `Kurs ${fp(c.price)} · score ${c.score} · ${c.long.label.toLowerCase()} langsiktig trend.`];
        if (clear.dir > 0) { if (ex.entry) lines.push(`Kjøpssone ${fp(ex.entry[0])}–${fp(ex.entry[1])}`); if (ex.stop) lines.push(`Stopp (ugyldig under) ${fp(ex.stop)}`); if (k.nextUp) lines.push(`Første mål ${fp(k.nextUp.p)} (${pc(k.nextUp.d)})`); }
        else { if (k.mustHold) lines.push(`Støtte som bør holde ${fp(k.mustHold.p)} (${pc(k.mustHold.d)})`); if (k.nextUp) lines.push(`Motstand ${fp(k.nextUp.p)}`); }
        const an = c.analog; if (an && an.ok) lines.push(`Lignende tilfeller: ${Math.round(an.stats.h30.pos * 100)} % høyere etter 30 d (vanlig: ${Math.round(an.base.pos * 100)} %).`);
        const bt = prevBT && prevBT.summary && prevBT.summary.ALL && prevBT.summary.ALL[clear.dir > 0 ? 'clearBuy' : 'clearSell'];
        if (bt && bt.h[30] && bt.h[30].n) lines.push(`Backtest av denne varsel-regelen: riktig retning etter 30 d i ${Math.round(bt.h[30].hit * 100)} % av ${bt.h[30].n} tidligere varsler (vanlig: ${Math.round(bt.h[30].base * 100)} %).`);
        lines.push('', 'Ikke finansiell rådgivning.');
        await notify(`${clear.dir > 0 ? 'Kjøpssignal' : 'Salgssignal'}: ${c.name} (${c.sym})`, lines, 5, [clear.dir > 0 ? 'green_circle' : 'red_circle']);
      } else if (o.code !== st.code) other.push(`${c.sym}: ${o.label} → ${st.label} (score ${c.score})`);
      if (newDay) {
        today.filter(e => !clear || !['wtBuy', 'wtSell'].includes(e.type)).forEach(e => other.push(`${c.sym}: ${EV[e.type]}`));
        if (o.majUp && c.price > o.majUp) other.push(`${c.sym}: dagslukk over avgjørende motstand ${fp(o.majUp)}`);
        if (o.majDn && c.price < o.majDn) other.push(`${c.sym}: dagslukk under avgjørende støtte ${fp(o.majDn)}`);
      }
      const seen = new Set(o.breaks || []);
      (c.breaks || []).filter(b => (b.type === 'bekreftet' || b.type === 'retest') && b.daysAgo <= 2 && !seen.has(`${b.dir}:${b.level}:${b.date}`)).forEach(b => other.push(`${c.sym}: ${b.text}`));
    }
    if (other.length) await notify('Krypto-scanner: endringer', other, 2, []);
    else console.log('Ingen øvrige varsler.');
  }
  output('deploy', 'true');
})().catch(e => { console.error(e); process.exit(1); });
