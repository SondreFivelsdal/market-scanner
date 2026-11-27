// Scenario-triggere (fanen Scenarioer): for hvert scenario – opp, sidelengs, ned – hva som aktiverer, bekrefter og ugyldiggjør det,
// med konkrete nivåer fra dagsgrafen og om betingelsen er oppfylt nå. Nivåene: siste bekreftede svingtopp/-bunn (TA, 5 lys bekreftelse),
// 200-dagerslinja, 50-ukerslinja (350 dager) og – for Bitcoin – realisert pris (Coin Metrics). Faste regler, ingen prognose.
(() => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const usd = v => v == null || !isFinite(v) ? '–' : (v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) : v >= 1 ? nf(v, { maximumFractionDigits: 2 }) : nf(v, { maximumSignificantDigits: 3 })) + ' $';
  const pct = v => v == null || !isFinite(v) ? '' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v * 100), { maximumFractionDigits: 1 }) + ' %';
  const S = { sym: null, B: {}, err: {} };
  function render() {
    const box = document.getElementById('hs-trig'); if (!box || typeof KL === 'undefined' || typeof TA === 'undefined') return;
    const L = window.COINS || ['BTC'], p = dash.params(), sym = p.coin && L.includes(p.coin) ? p.coin : L[0]; S.sym = sym;
    if (!S.B[sym] && !S.err[sym]) { box.replaceChildren(el('p', 'muted small', 'Henter kurser …')); KL.all(sym, '1d', 2).then(B => { S.B[sym] = B; render(); }).catch(e => { S.err[sym] = e.message; render(); }); return; }
    if (S.err[sym]) { box.replaceChildren(el('p', 'muted small', 'Scenario-triggere er ikke tilgjengelige: kursdata fra Binance mangler.')); return; }
    const B = S.B[sym], e = KL.closedEnd(B); if (e < 360) { box.replaceChildren(); return; }
    const c = B.map(b => b.c), px = c[e], e200 = RG.ema(c, 200)[e], e50 = RG.ema(c, 50)[e], w50 = RG.sma(c, 350)[e], adx = RG.adx(B).adx[e], A = TA.analyze(B, e, '1d');
    const H = [...A.piv].reverse().find(x => x.type === 'H'), Lw = [...A.piv].reverse().find(x => x.type === 'L'); if (!H || !Lw) { box.replaceChildren(); return; }
    const cy = sym === 'BTC' ? dash.data('cycle') : null, rp = cy && cy.status === 'ok' && cy.data.now ? cy.data.now.rp : null;
    const dd = v => `${usd(v)} (${pct(v / px - 1)})`, hi = Math.max(H.p, Lw.p), lo = Math.min(H.p, Lw.p);
    const act = px > hi ? 'bull' : px < lo ? 'bear' : 'neu';
    const SC = [
      ['bull', 'Opp', 'up', [['Aktiveres', `Dagslukk over siste svingtopp ${dd(hi)}`, px > hi], ['Bekreftes', '50-dagerslinja over 200-dagerslinja', e50 > e200], ['Bekreftes', `Kurs over 50-ukerslinja ${dd(w50)}`, px > w50], ['Ugyldig', `Dagslukk under siste svingbunn ${dd(lo)}`, px < lo, true]]],
      ['neu', 'Sidelengs', 'warn', [['Aktiv', `Kurs mellom ${usd(lo)} og ${usd(hi)} (range ${nf((hi / lo - 1) * 100, { maximumFractionDigits: 0 })} %)`, px >= lo && px <= hi], ['Bekreftes', `Svak trendstyrke: ADX under 20 (nå ${nf(adx, { maximumFractionDigits: 0 })})`, adx != null && adx < 20], ['Ugyldig', 'Dagslukk utenfor rangen', px > hi || px < lo, true]]],
      ['bear', 'Ned', 'down', [['Aktiveres', `Dagslukk under siste svingbunn ${dd(lo)}`, px < lo], ['Bekreftes', `Kurs under 200-dagerslinja ${dd(e200)}`, px < e200], ['Bekreftes', `Kurs under 50-ukerslinja ${dd(w50)}`, px < w50], ...(rp ? [['Dypt', `Kurs under realisert pris ${dd(rp)}`, px < rp]] : []), ['Ugyldig', `Dagslukk over siste svingtopp ${dd(hi)}`, px > hi, true]]]];
    const g = el('div', 'trig');
    for (const [k, nm, cl, rows] of SC) { const conf = rows.filter(r => r[0] === 'Bekreftes'), nOk = conf.filter(r => r[2]).length, on = k === act, col = el('div', 'tcol' + (on ? ' on ' + cl : ''));
      const hd = el('div', 'row'); hd.append(el('b', cl, nm), el('span', 'badge' + (on ? '' : ' dim'), on ? (conf.length && nOk === conf.length ? 'Aktiv · bekreftet' : `Aktiv · ${nOk}/${conf.length} bekreftet`) : 'Ikke aktiv')); col.append(hd);
      for (const [lab, txt, met, inval] of rows) { const r = el('div', 'tr' + (met ? ' met' : '') + (inval ? ' inv' : '')); r.append(el('span', 'ti', met ? (inval ? '✕' : '✓') : '○'), el('span', 'tl', lab), el('span', null, txt)); col.append(r); }
      g.append(col); }
    const hd = el('div', 'row'); hd.append(el('h3', null, `Triggere – ${(window.NAMES || {})[sym] || sym}`), el('span', 'muted small', `kurs ${usd(px)} · dagslukk ${new Date(B[e].t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} · svingpunkter bekreftes 5 dager etter`));
    const card = el('div', 'card tight'); card.append(hd, g); box.replaceChildren(card);
  }
  window.TRIG = { render };
})();
