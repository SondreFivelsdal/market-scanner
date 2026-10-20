// Push-varsel når et daytrading-oppsett utløses på en nettopp lukket 15-min candle.
// Kjøres hvert 15. minutt av GitHub Actions. Husker siste kontrollerte candle per coin i .dtstate.json (Actions-cache).
// Som standard varsles bare oppsett som har vært lønnsomme i backtesten (DT_ALERTS=good). DT_ALERTS=all varsler alt, off slår av.
const fs = require('fs');
const DT = require('../site/daytrade.js');
const MS = require('../engine.js');
const { klines } = require('./dtdata.js');
const PAGES = process.env.PAGES_URL || '', TOPIC = process.env.NTFY_TOPIC || '';
const MODE = process.env.DT_ALERTS || 'good', STATE = process.env.DT_STATE || '.dtstate.json';
const fp = v => v >= 1000 ? Math.round(v).toLocaleString('nb-NO').replace(/[  ]/g, ' ') : v >= 1 ? v.toLocaleString('nb-NO', { maximumFractionDigits: 3 }) : v.toLocaleString('nb-NO', { maximumSignificantDigits: 4 });
const pc = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('nb-NO', { maximumFractionDigits: 2 }) + ' %';
const pr = v => Math.round(v * 100) + ' %', rr = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('nb-NO', { maximumFractionDigits: 2 }) + ' R';

// hvilken statistikk gjelder for et oppsett: coinens egen hvis nok handler, ellers alle coins samlet
function btFor(bt, sym, key) { if (!bt) return null; const c = bt.coins && bt.coins[sym] && bt.coins[sym][key]; if (c && c.verdict !== 'few') return { ...c, scope: sym }; const a = bt.ALL && bt.ALL[key]; return a ? { ...a, scope: 'alle coins' } : null; }
function shouldAlert(b) { if (MODE === 'off') return false; if (MODE === 'all') return true; return !!b && b.verdict === 'good'; }

async function notify(title, lines, priority, tags, click) {
  if (!TOPIC) { console.log('(ingen NTFY_TOPIC)', title, '\n' + lines.join('\n')); return; }
  const body = { topic: TOPIC, title, message: lines.join('\n'), priority, tags }; if (click) body.click = click;
  try { const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); console.log('ntfy', r.status); } catch (e) { console.log('ntfy feilet', e.message); }
}
function message(sym, s, b) {
  const T = DT.TYPES[s.type], name = MS.NAMES[sym] || sym, entry = s.ref, risk = (entry - s.stop) * s.dir;
  const lines = [`${T.label} (${s.dir > 0 ? 'long' : 'short'}) på 15 min.`, `Inngang ca. ${fp(entry)} · stopp ${fp(s.stop)} (${pc(-s.dir * risk / entry * 100)})`,
    `Mål 1R ${fp(entry + s.dir * risk)} (${pc(s.dir * risk / entry * 100)}) · 2R ${fp(entry + s.dir * 2 * risk)} (${pc(s.dir * 2 * risk / entry * 100)})`,
    `Lukk etter 6 timer hvis verken mål eller stopp er nådd.`];
  if (b && b.all && b.all.n) lines.push(`Backtest 12 mnd (${b.scope}): ${b.all.n} handler, ${pr(b.all.win)} treff, ${rr(b.all.exp)} per handel etter gebyr (siste 4 mnd: ${b.oos.n ? rr(b.oos.exp) : '–'}).`);
  lines.push('', 'Gjelder bare nå – sjekk kursen før du handler. Ikke finansiell rådgivning.');
  return { title: `Daytrade ${s.dir > 0 ? 'LONG' : 'SHORT'}: ${name} (${sym}) – ${T.short}`, lines };
}

async function main() {
  let state = {}; try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { /* første kjøring */ }
  state.last = state.last || {};
  let bt = null; if (PAGES) try { const r = await fetch(`${PAGES}data/daytrade.json?t=${Date.now()}`); if (r.ok) bt = await r.json(); } catch (e) { /* uten statistikk */ }
  for (const sym of MS.COINS) {
    try {
      const [m15, h1] = await Promise.all([klines(sym, '15m', { limit: 400 }), klines(sym, '1h', { limit: 300 })]);
      const B = DT.bars(m15), H = DT.bars(h1); if (B.N < 300) continue;
      const lastT = B.t[B.N - 1], seen = state.last[sym];
      state.last[sym] = lastT;
      if (seen == null) { console.log(sym, 'første kjøring – ingen varsler'); continue; }
      const I = DT.prepare(B, H);
      const fresh = DT.simulate(B, I, B.N - 200).filter(x => x.t > seen && x.t >= lastT - 2 * DT.M15); // bare de siste candlene (ikke gamle hvis Actions har vært nede)
      for (const s of fresh) { const b = btFor(bt, sym, s.key); console.log(sym, s.key, new Date(s.t).toISOString(), b ? b.verdict : 'ingen backtest');
        if (!shouldAlert(b)) continue; const m = message(sym, s, b);
        await notify(m.title, m.lines, 4, [s.dir > 0 ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend'], PAGES ? `${PAGES}#tab=daytrading&coin=${sym}` : null); }
    } catch (e) { console.log(sym, 'feilet', e.message); }
  }
  fs.writeFileSync(STATE, JSON.stringify(state));
}
module.exports = { btFor, shouldAlert, message, main };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
