// Datahelse: én liten indikator i toppmenyen (grønn/gul/rød) med en liste over hver kilde: sist oppdatert, kilde og status.
// Andre moduler melder inn ferske tidspunkter med HEALTH.mark(), og spør HEALTH.fresh() før de bruker data i signaler,
// slik at et signal aldri bygger på gamle eller manglende data uten at det vises.
(() => {
  'use strict';
  const H = 36e5, D = 864e5;
  // navn, kilde og hvor gammel en verdi kan være før den regnes som forsinket
  const SRC = {
    live: ['Live-priser', 'Binance', 3 * 6e4], klines: ['Dagslys (kurser)', 'Binance', 2 * D], global: ['Markedsverdi og dominans', 'CoinGecko', 2 * H], fng: ['Fear & Greed', 'alternative.me', 2 * D],
    macro: ['Makrodata', 'FRED, Yahoo, DefiLlama, OKX', 4 * D], cycle: ['On-chain (realisert pris)', 'Coin Metrics', 10 * D], events: ['Historiske kurser', 'Bitstamp/Binance, Yahoo, FRED', 4 * D], history: ['Scenarioer', 'beregnet fra Binance', 2 * D] };
  const st = {};
  const mark = (k, at, extra) => { st[k] = Object.assign({ at, err: null }, extra || {}); draw(); };
  const fail = (k, err) => { st[k] = Object.assign(st[k] || {}, { err: String(err || 'mangler') }); draw(); };
  // fra datafilene (tidspunktet dataene gjelder for, ikke når filen ble bygget, der det finnes)
  function files() {
    if (typeof dash === 'undefined') return;
    const f = (k, pick) => { const d = dash.data(k, { peek: true }); if (!d || d.status === 'loading' || d.status == null) return; if (d.status !== 'ok') { st[k] = { err: 'kunne ikke lastes', at: st[k] && st[k].at }; return; } const t = pick(d.data); if (t) st[k] = { at: t, err: null }; };
    const p = s => s ? Date.parse(s.length === 10 ? s + 'T23:59:59Z' : s) : null;
    f('macro', m => p(m.asOf) || p(m.built)); f('cycle', m => p(m.now && (m.now.rpD || m.now.d)) || p(m.built)); f('events', m => p(m.built)); f('history', m => p(m.built));
    const L = window.__live || {}, t = Math.max(0, ...Object.values(L).map(x => x.t || 0)); if (t) st.live = { at: t, err: null };
  }
  const state = k => { const x = st[k]; if (!x) return 'wait'; if (x.err && !x.at) return 'bad'; if (x.err) return 'late'; return Date.now() - x.at > SRC[k][2] ? 'late' : 'ok'; };
  const fresh = k => state(k) === 'ok';
  const ago = t => { if (!t) return '–'; const s = (Date.now() - t) / 1000; return s < 90 ? 'nå' : s < 5400 ? `${Math.round(s / 60)} min siden` : s < 2 * 86400 ? `${Math.round(s / 3600)} t siden` : `${Math.round(s / 86400)} d siden`; };
  const LAB = { ok: 'OK', late: 'Forsinket', bad: 'Mangler', wait: 'Laster' };
  let btn = null, pop = null;
  function draw() {
    if (!btn) { const bar = document.querySelector('.topbar'); if (!bar) return; btn = document.createElement('button'); btn.type = 'button'; btn.className = 'hbtn'; btn.setAttribute('aria-haspopup', 'true');
      pop = document.createElement('div'); pop.className = 'hpop'; pop.hidden = true; btn.addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; draw(); });
      document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; }); document.addEventListener('keydown', e => { if (e.key === 'Escape') pop.hidden = true; });
      const th = document.getElementById('theme-btn'); bar.insertBefore(btn, th); bar.append(pop); }
    files(); const ks = Object.keys(SRC), S = ks.map(state), bad = S.filter(x => x === 'bad').length, late = S.filter(x => x === 'late').length, c = bad ? 'bad' : late ? 'late' : 'ok';
    btn.replaceChildren(Object.assign(document.createElement('i'), { className: 'hdot ' + c }), document.createTextNode(bad ? `${bad} kilde${bad > 1 ? 'r' : ''} mangler` : late ? `${late} forsinket` : 'Data OK'));
    btn.title = 'Datahelse: status for hver datakilde';
    if (pop.hidden) return;
    const t = document.createElement('table'); t.className = 't compact'; t.innerHTML = '<tr><th class="l">Data</th><th class="l">Kilde</th><th>Sist</th><th>Status</th></tr>';
    ks.forEach((k, i) => { const tr = document.createElement('tr'); const td = (x, cl) => { const d = document.createElement('td'); if (cl) d.className = cl; d.textContent = x; return d; };
      tr.append(td(SRC[k][0], 'l'), td(SRC[k][1], 'l muted'), td(ago(st[k] && st[k].at)), td(LAB[S[i]], S[i] === 'ok' ? 'up' : S[i] === 'late' ? 'warn' : S[i] === 'bad' ? 'down' : 'muted')); t.append(tr); });
    const p = document.createElement('p'); p.className = 'muted small'; p.textContent = 'Signaler på Oversikt bruker ikke data som er forsinket eller mangler – de vises da som «ukjent».';
    pop.replaceChildren(t, p);
  }
  setInterval(draw, 30e3); document.addEventListener('DOMContentLoaded', draw); setTimeout(draw, 1500);
  window.HEALTH = { mark, fail, fresh, state, draw };
})();
