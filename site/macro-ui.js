// Makro-fanen: «Har markedet medvind eller motvind?» – leser data/macro.json (bygges av scripts/macro.js i GitHub Actions).
// Hver del vises med grønt / gult / rødt, tallet, en kort forklaring på hvorfor den betyr noe, og hvordan den har slått ut før.
(() => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const pct = (v, d = 1) => { if (v == null || !isFinite(v)) return '–'; const r = Math.round(v * 100 * 10 ** d) / 10 ** d; return (r > 0 ? '+' : r < 0 ? '−' : '') + nf(Math.abs(r), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %'; };
  const pa = (v, d = 0) => v == null || !isFinite(v) ? '–' : nf(Math.abs(v * 100), { maximumFractionDigits: d }) + ' %';
  const price = v => v == null || !isFinite(v) ? '–' : (v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) : v >= 1 ? nf(v, { maximumFractionDigits: 2 }) : nf(v, { maximumSignificantDigits: 3 })) + ' $';
  const big = v => v == null ? '–' : v >= 1e12 ? nf(v / 1e12, { maximumFractionDigits: 2 }) + ' billioner $' : nf(v / 1e9, { maximumFractionDigits: 0 }) + ' milliarder $';
  const dmy = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
  const my = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('nb-NO', { month: 'short', year: 'numeric' }) : '–';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const ST = { 1: ['Grønt', 'up', 'medvind'], 0: ['Gult', 'warn', 'nøytralt'], '-1': ['Rødt', 'down', 'motvind'] };
  const LAB = { medvind: ['Medvind', 'up', 'Flertallet av de store driverne – trend, bredde, penger og aksjer – peker i positiv retning.'],
    blandet: ['Blandet', 'warn', 'Driverne peker i ulike retninger. Markedet mangler en tydelig felles retning.'],
    motvind: ['Motvind', 'down', 'Flertallet av de store driverne – trend, bredde, penger og aksjer – peker i negativ retning.'] };
  const M = () => { const d = dash.data('macro'); return d.status === 'ok' ? d.data : d.status === 'error' ? { err: true } : null; };

  // tallet for en komponent i klartekst
  function valueText(c) {
    if (c.err) return 'Ikke tilgjengelig';
    const v = c.v;
    switch (c.k) {
      case 'btc50w': return `${pa(v, 1)} ${v >= 0 ? 'over' : 'under'} (linja: ${price(c.level)})`;
      case 'btc200': return `${pa(v, 1)} ${v >= 0 ? 'over' : 'under'} (linja: ${price(c.level)})`;
      case 'breadth': return `${pa(v)} av ${c.nCoins || 25} coins er over linja`;
      case 'stables': return `${pct(v)} siste 3 mnd${c.total ? ` · totalt ${big(c.total)}` : ''}`;
      case 'fng': return `${nf(v)} av 100${c.cls ? ` (${({ 'Extreme Fear': 'ekstrem frykt', Fear: 'frykt', Neutral: 'nøytral', Greed: 'grådighet', 'Extreme Greed': 'ekstrem grådighet' })[c.cls] || c.cls})` : ''}`;
      case 'us10y': return `${nf(c.level, { maximumFractionDigits: 2 })} % (${v > 0 ? '+' : v < 0 ? '−' : '±'}${nf(Math.abs(v), { maximumFractionDigits: 2 })} prosentpoeng siste 3 mnd)`;
      case 'fed': return `${nf(c.level, { maximumFractionDigits: 2 })} % (${Math.abs(v) < 0.05 ? 'uendret' : (v > 0 ? 'hevet ' : 'kuttet ') + nf(Math.abs(v), { maximumFractionDigits: 2 }) + ' prosentpoeng'} siste 6 mnd)`;
      case 'm2': return `${pct(v)} siste år`;
      case 'vix': return nf(v, { maximumFractionDigits: 1 });
      case 'funding': return `${nf(v * 100, { maximumFractionDigits: 4 })} % per 8 t (snitt siste 7 dager)${c.oiUsd ? ` · åpne posisjoner ${big(c.oiUsd)}` : ''}`;
      default: return `${pa(v, 1)} ${v >= 0 ? 'over' : 'under'} linja${c.px ? ` (kurs ${nf(c.px, { maximumFractionDigits: c.px > 100 ? 0 : 2 })})` : ''}`;
    }
  }
  // liten graf (siste ~3 år, ukentlig)
  function spark(arr, c) {
    const ns = 'http://www.w3.org/2000/svg', W = 132, H = 34, s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('class', 'spark'); s.setAttribute('aria-hidden', 'true');
    const v = (arr || []).map(x => x == null ? null : +x); const ok = v.filter(x => x != null); if (ok.length < 3) return s;
    let lo = Math.min(...ok), hi = Math.max(...ok); const zero = ['btc50w', 'btc200', 'dxy', 'spx', 'rut', 'soxx', 'gold', 'silver', 'stables', 'us10y', 'fed', 'm2', 'score', 'funding'].includes(c);
    if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); } if (hi === lo) { hi += 1; lo -= 1; }
    const x = i => i / (v.length - 1) * (W - 2) + 1, y = q => H - 2 - (q - lo) / (hi - lo) * (H - 4);
    if (zero) { const z = document.createElementNS(ns, 'line'); z.setAttribute('x1', 0); z.setAttribute('x2', W); z.setAttribute('y1', y(0)); z.setAttribute('y2', y(0)); z.setAttribute('stroke', css('--axis')); z.setAttribute('stroke-dasharray', '2 3'); s.append(z); }
    let d = ''; v.forEach((q, i) => { if (q == null) return; d += (d && v[i - 1] != null ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(q).toFixed(1); });
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', css('--fg')); p.setAttribute('stroke-width', '1.5'); s.append(p);
    const L = ok[ok.length - 1], dot = document.createElementNS(ns, 'circle'); let li = v.length - 1; while (v[li] == null) li--; dot.setAttribute('cx', x(li)); dot.setAttribute('cy', y(L)); dot.setAttribute('r', 2.6); dot.setAttribute('fill', css('--blue')); s.append(dot);
    return s;
  }
  const dotEl = st => { const d = el('span', 'dot ' + (st == null ? 'muted' : ST[st][1])); d.setAttribute('aria-hidden', 'true'); return d; };

  // ---------------------------------------------------------------- hovedkort
  function head(m) {
    const n = m.now, L = LAB[n.label], box = el('div', 'card');
    if (!L) { box.append(el('h2', null, 'Makrobildet'), el('p', 'muted', 'For få kilder svarte til å regne ut makroklimaet.')); return box; }
    const top = el('div', 'row'); const t = el('div', 'stack'); t.style.gap = '4px';
    t.append(el('span', 'muted', 'Makroklimaet nå'), el('span', 'pill big ' + L[1], L[0]));
    const c = n.counts, cnt = el('div', 'stack'); cnt.style.justifyItems = 'end';
    cnt.append(el('span', null, `${c.gronn} grønne · ${c.gul} gule · ${c.rod} røde`), el('span', 'muted small', `av ${c.gronn + c.gul + c.rod} som teller · slik siden ${dmy(n.since)}`));
    top.append(t, cnt); box.append(top, el('p', null, L[2]));
    const sp = el('div', 'stack'); sp.style.gap = '4px'; const g = spark(n.spark, 'score'); g.classList.add('wide'); g.setAttribute('preserveAspectRatio', 'none'); g.querySelectorAll('path,line').forEach(x => x.setAttribute('vector-effect', 'non-scaling-stroke')); const cc = g.querySelector('circle'); if (cc) cc.remove(); sp.append(el('span', 'muted small', 'Makroklimaet de siste 3 årene (over streken = medvind, under = motvind)'), g); box.append(sp);
    // hva har skjedd før i samme klima
    const T = m.test && m.test.hz; if (T) {
      const tb = el('table', 't compact'), hr = el('tr'); ['', '1 mnd', '3 mnd', '6 mnd'].forEach((h, i) => hr.append(el('th', i ? '' : 'l', h))); tb.append(hr);
      const row = (name, f) => { const r = el('tr'); r.append(el('td', 'l', name)); [30, 90, 180].forEach(H => { const x = f(T[H]); const td = el('td', x && x.q50 != null ? (x.q50 > 0 ? 'up' : 'down') : 'muted'); if (x && x.n) td.append(el('b', null, pct(x.q50, 0)), el('span', 'muted small sub2', `opp ${pa(x.up)}`)); else td.textContent = '–'; r.append(td); }); tb.append(r); };
      row(`Bitcoin i uker med ${L[0].toLowerCase()}`, h => h.btc[n.label]); row('Bitcoin, alle uker', h => h.btc.alle);
      row(`Altcoins (median) i uker med ${L[0].toLowerCase()}`, h => h.alt[n.label]); row('Altcoins (median), alle uker', h => h.alt.alle);
      const v90 = T[90], nEff = v90.btc[n.label] && v90.btc[n.label].nEff;
      const verdict = v90.verdict === 'skilte' ? 'Testen viser at uker med medvind har vært klart bedre enn uker med motvind, i begge halvdeler av perioden.' : 'Testen viser ikke et tydelig skille mellom uker med medvind og motvind som holder i begge halvdeler av perioden. Bruk makroklimaet som bakgrunn, ikke som kjøps- eller salgssignal.';
      const w = el('div', 'stack'); w.append(el('h3', null, `Hva har skjedd før, når makroklimaet var «${L[0].toLowerCase()}»?`), el('div', 'tw'), el('p', 'muted small', `Tall: median endring og hvor ofte kursen var høyere. ${m.test.weeks} uker fra ${dmy(m.test.from)} til ${dmy(m.test.to)}, bare med data som var kjent hver uke. Ca. ${nEff || '–'} uavhengige 3-månedersperioder i denne gruppen – ${nEff >= 8 ? 'nok til en grov pekepinn' : 'få, så tallene er usikre'}.`), el('p', null, verdict));
      w.children[1].append(tb); box.append(w);
    }
    return box;
  }
  // ---------------------------------------------------------------- komponenter per gruppe
  function compRow(c, m) {
    const d = el('details', 'mrow'); const s = el('summary');
    const nm = el('span', 'nm'); nm.append(dotEl(c.state), el('b', null, c.name)); if (!c.w) nm.append(el('span', 'tag', 'info'));
    s.append(nm, el('span', 'val' + (c.err ? ' muted' : ''), valueText(c)), c.spark ? spark(c.spark, c.k) : el('span'));
    d.append(s);
    const inn = el('div', 'in'); inn.append(el('p', null, c.why), el('p', 'muted small', 'Regel: ' + c.rule));
    const tc = m.test && m.test.comp && m.test.comp[c.k];
    if (tc && c.w && tc.gronn.n && tc.rod.n) inn.append(el('p', 'small', `Før: når denne var grønn, var Bitcoin ${pct(tc.gronn.q50, 0)} (median) 3 måneder senere og høyere i ${pa(tc.gronn.up)} av ukene. Når den var rød: ${pct(tc.rod.q50, 0)}, høyere i ${pa(tc.rod.up)}. (${tc.gronn.nEff} og ${tc.rod.nEff} uavhengige perioder.)`));
    inn.append(el('p', 'muted small', c.err ? `Kilde svarte ikke: ${c.err}` : `Kilde: ${c.src || '–'} · siste verdi ${dmy(c.asOf)}${c.stale ? ' ⚠ gammel verdi' : ''}${c.note ? ' · ' + c.note : ''}`));
    d.append(inn); return d;
  }
  function groups(m) {
    const out = [];
    for (const [g, gname] of Object.entries(m.groups)) { const cs = m.now.comps.filter(c => c.g === g); if (!cs.length) continue;
      const card = el('div', 'card'); const hd = el('div', 'row'); hd.append(el('h2', null, gname));
      const sc = cs.filter(c => c.w && c.state != null); if (sc.length) { const sum = sc.reduce((a, c) => a + c.state, 0) / sc.length; hd.append(el('span', 'pill ' + (sum >= 0.3 ? 'up' : sum <= -0.3 ? 'down' : 'warn'), sum >= 0.3 ? 'Medvind' : sum <= -0.3 ? 'Motvind' : 'Blandet')); }
      else if (g === 'deriv') hd.append(el('span', 'muted small', 'Bare informasjon'));
      card.append(hd);
      if (g === 'krypto' && m.now.global && m.now.global.mcap) card.append(el('p', 'muted', `Hele kryptomarkedet: ${big(m.now.global.mcap)} · Bitcoin er ${nf(m.now.global.btcD, { maximumFractionDigits: 1 })} % av verdien (CoinGecko). Når Bitcoins andel stiger, går pengene til det «tryggeste» i krypto – typisk i usikre perioder. Når den faller, sprer pengene seg ut i altcoins.`));
      const list = el('div', 'mlist'); cs.forEach(c => list.append(compRow(c, m))); card.append(list); out.push(card); }
    return out;
  }
  // ---------------------------------------------------------------- støttetester (brukerens spørsmål: «sist BTC testet 200/300-dagers…»)
  function events(m) {
    const card = el('div', 'card'); card.append(el('h2', null, 'Når kursen testet de store trendlinjene – og hva makroklimaet var da'));
    const S = m.evSum && m.evSum.ma; if (!S) return card;
    const line = (L, x) => x && x.n ? `${LAB[L] ? LAB[L][0] : 'Alle'}: høyere 6 mnd senere i ${Math.round(x.up * x.n)} av ${x.n} (median ${pct(x.q50, 0)})` : null;
    card.append(el('p', null, 'En «test» her betyr at kursen har vært godt over både 200- og 300-dagerslinja i minst 60 dager, og så faller ned og treffer dem. Slike tester har ofte gitt store oppturer, men ikke alltid. Makroklimaet på tidspunktet er tatt med for å se om det skilte de gode fra de dårlige.'));
    const ul = el('ul', 'plain'); ['alle', 'medvind', 'blandet', 'motvind'].forEach(L => { const t = line(L, S[L]); if (t) ul.append(el('li', null, t)); }); card.append(ul);
    const W = m.evSum.w50; if (W && W.alle.n) { const ul2 = el('ul', 'plain'); ['alle', 'medvind', 'blandet', 'motvind'].forEach(L => { const t = line(L, W[L]); if (t) ul2.append(el('li', null, t)); });
      card.append(el('h3', null, 'Tilbake over 50-ukerslinja (2 ukelukk over, etter minst 12 uker under)'), ul2); }
    const tb = el('table', 't'), hr = el('tr'); ['Dato', 'Coin', 'Hva', 'Makro da', '3 mnd etter', '6 mnd etter'].forEach((h, i) => hr.append(el('th', i < 4 ? 'l' : '', h))); tb.append(hr);
    m.events.slice(-14).reverse().forEach(e => { const r = el('tr'); r.append(el('td', 'l', dmy(e.date)), el('td', 'l', e.sym), el('td', 'l', e.type === 'ma' ? (e.held ? 'Testet 200/300-dagers – holdt' : 'Testet 200/300-dagers – brøt') : 'Tilbake over 50-ukers'));
      const L = LAB[e.macro]; r.append(el('td', 'l ' + (L ? L[1] : 'muted'), L ? L[0] : '–'));
      [e.r90, e.r180].forEach(v => r.append(el('td', v == null ? 'muted' : v > 0 ? 'up' : 'down', v == null ? 'venter' : pct(v, 0)))); tb.append(r); });
    const w = el('div', 'tw'); w.append(tb); card.append(w);
    card.append(el('p', 'muted small', 'Få tilfeller – se på dette som eksempler, ikke som en sikker regel. Makroklimaet bruker bare data som var kjent den dagen.'));
    const d = el('details', 'more'), inn = el('div', 'in'); inn.append(...[...card.childNodes].slice(1)); d.append(el('summary', null, 'Tester av de store trendlinjene – og hva makroklimaet var da'), inn); return d;
  }
  function method(m) {
    const d = el('details', 'more'); d.append(el('summary', null, 'Hvordan er makroklimaet regnet ut?')); const inn = el('div', 'in');
    inn.append(el('p', null, `Hver del gjøres om til grønt (+1), gult (0) eller rødt (−1) etter faste regler som ble satt før testen ble kjørt. Makroklimaet er snittet av delene som teller: ${m.method.labels.medvind} = medvind, ${m.method.labels.motvind} = motvind, ellers blandet. Deler merket «info» vises, men teller ikke – enten fordi de ikke peker entydig (gull, stemning) eller fordi historikken er for kort (funding).`),
      el('p', null, 'Testen går gjennom hver uke siden 2018 og bruker bare tall som var kjent den uka (renter og pengemengde med forsinkelse slik de faktisk publiseres). Så sammenlignes hva Bitcoin og altcoins gjorde de neste 1, 3 og 6 månedene. Perioden deles i to halvdeler; et skille må holde i begge for å regnes som reelt.'),
      el('p', 'muted small', 'Inspirert av hvordan makroanalytikere (bl.a. Blockchain Backer) ser på 50-ukerslinja, bredde, stablecoins, aksjer og dollaren. Reglene her er våre egne og forenklet.'),
      el('p', 'muted small', `Oppdatert ${new Date(m.built).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Kilder: Binance, DefiLlama, alternative.me, FRED (St. Louis Fed), Yahoo Finance, OKX, CoinGecko.`));
    d.append(inn); return d;
  }
  function render() {
    const box = document.getElementById('makro-in'); if (!box) return; const m = M();
    if (!m) { box.replaceChildren(el('p', 'muted', 'Henter makrobildet …')); return; }
    if (m.err || !m.now) { box.replaceChildren(el('div', 'card', 'Makrobildet er ikke tilgjengelig akkurat nå. Det bygges automatisk ved neste oppdatering.')); return; }
    box.replaceChildren(head(m), ...groups(m), events(m), method(m), el('div', 'note', 'Makrobildet beskriver omgivelsene markedet er i – ikke hva som skjer i morgen. Det er ikke kjøps- eller salgsråd.'));
  }
  // kort sammendrag til Oversikt-fanen
  function summary() { const m = M(); if (!m || m.err || !m.now || !LAB[m.now.label]) return null; const n = m.now, L = LAB[n.label], h = m.test && m.test.hz && m.test.hz[90];
    return { label: L[0], cls: L[1], counts: n.counts, since: n.since, text: L[2], btc90: h && h.btc[n.label], alle90: h && h.btc.alle, verdict: h && h.verdict, lines: m.lines || {} }; }
  window.MACRO = { render, summary, data: M };
})();
