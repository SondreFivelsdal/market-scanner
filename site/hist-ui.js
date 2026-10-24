// Historiske scenarioer: realistisk spenn for 1 uke – 1 år og eksempler på lignende situasjoner før.
// Data: data/history.json (scripts/history.js). Alle tall er testet bakover i tid; resultatet av testen vises åpent.
(() => {
  'use strict';
  const HZ = [[7, '1 uke'], [30, '1 måned'], [90, '3 måneder'], [180, '6 måneder'], [365, '1 år']];
  const S = { sym: null, hz: 90 };
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const price = v => v == null || !isFinite(v) ? '–' : (v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) : v >= 1 ? nf(v, { maximumFractionDigits: 2 }) : nf(v, { maximumSignificantDigits: 3 })) + ' $';
  const pct0 = v => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v * 100), { maximumFractionDigits: 0 }) + ' %';
  const pa = v => v == null || !isFinite(v) ? '–' : nf(Math.abs(v * 100), { maximumFractionDigits: 0 }) + ' %';
  const ofTen = p => p == null ? '–' : `${nf(p * 10, { maximumFractionDigits: 0 })} av 10`;
  const my = t => new Date(t).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
  const dmy = t => new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const names = () => window.NAMES || {};

  function render() {
    const H = dash.data('history'), main = document.getElementById('hs-main');
    const p = dash.params(); const L = window.COINS || []; if (p.coin && L.includes(p.coin)) S.sym = p.coin; if (!S.sym) S.sym = L[0];
    const seg = document.getElementById('hs-coins');
    seg.replaceChildren(...L.map(s => { const b = el('button', null, names()[s] || s); b.type = 'button'; b.setAttribute('aria-pressed', s === S.sym ? 'true' : 'false'); b.addEventListener('click', () => { S.sym = s; dash.setParams({ coin: s }); }); return b; }));
    if (H.status !== 'ok') { main.replaceChildren(el('p', H.status === 'error' ? 'down' : 'muted', H.status === 'error' ? 'Beregningene er ikke tilgjengelige akkurat nå. De lages automatisk hver 4. time.' : 'Henter …')); document.getElementById('hs-similar').replaceChildren(); return; }
    const D = H.data, C = D.coins[S.sym]; if (!C) { main.replaceChildren(el('p', 'muted', 'Ingen beregning for denne coinen ennå.')); return; }
    drawMain(D, C); drawSimilar(D, C); drawHow(D);
  }

  // ---------------------------------------------------------------- spenn
  function drawMain(D, C) {
    const box = document.getElementById('hs-main'), n = names()[S.sym] || S.sym, L = (window.__live || {})[S.sym], px = L && L.p ? L.p : C.now.c;
    const head = el('div', 'stack'); head.append(el('h2', null, `${n}: realistisk spenn fremover`),
      el('p', 'muted', `Regnet fra dagens kurs ${price(px)}${L && L.p ? ' (live)' : ` (dagslukk ${dmy(C.now.t)})`}. Den mørke delen av hver stolpe er der kursen havnet halvparten av gangene, hele stolpen 8 av 10 ganger.`));
    const fan = el('div', 'fan'); box.replaceChildren(head, fan); const rows = el('div', 'range');
    for (const [H, lab] of HZ) { const h = C.hz[H], r = h && h.range; if (!r) { rows.append(el('p', 'muted', `${lab}: ikke tilgjengelig`)); continue; }
      const row = el('div', 'rr'), left = el('div', 'stack'); left.style.gap = '0'; left.append(el('span', 'h', 'Om ' + lab), el('span', 'muted small', `høyere: ${ofTen(r.pUp)}`));
      const right = el('div', 'stack'); right.style.gap = '2px';
      const lo = px * (1 + r.lo), hi = px * (1 + r.hi), a = Math.log(lo), b = Math.log(hi), X = v => ((Math.log(v) - a) / (b - a)) * 100;
      const bar = el('div', 'bar'), b80 = el('div', 'b80'), b50 = el('div', 'b50'), mid = el('div', 'mid'), now = el('div', 'now');
      b80.style.left = '0%'; b80.style.width = '100%'; const q25 = px * (1 + r.q25), q75 = px * (1 + r.q75); b50.style.left = X(q25) + '%'; b50.style.width = (X(q75) - X(q25)) + '%';
      mid.style.left = `calc(${X(px * (1 + r.mid))}% - 1px)`; now.style.left = X(px) + '%'; now.title = 'Dagens kurs';
      bar.append(b80, b50, now, mid); right.append(bar);
      const txt = el('div', 'row small'); txt.append(el('span', 'down', `Dårlig (1 av 10): under ${price(lo)} (${pct0(r.lo)})`), el('span', null, `Midt i: ${price(px * (1 + r.mid))}`), el('span', 'up', `Bra (1 av 10): over ${price(hi)} (${pct0(r.hi)})`));
      right.append(txt); row.append(left, right); rows.append(row); }
    const lg = el('p', 'muted small', 'Den stiplede blå streken er dagens kurs. Den svarte streken er midten av spennet.');
    const v = D.validation || {}, v90 = v[90] || {}, cov = v90.coverByTime;
    const why = el('p', null, `Spennet bygger på hvor mye ${n} svinger nå (${nf(C.now.vol * 100, { maximumFractionDigits: 0 })} % i året – ${C.now.vol > 0.9 ? 'mye' : C.now.vol > 0.6 ? 'middels' : 'lite, til krypto å være'}) og på hvordan ${D.poolCoins.length} store coins faktisk har beveget seg siden ${D.poolFrom.slice(0, 4)}. ` +
      (cov && cov.first != null ? `Testet bakover i tid havnet kursen innenfor spennet ${ofTen(cov.first)} ganger i første halvdel av perioden og ${ofTen(cov.second)} i andre halvdel.` : ''));
    const note = el('div', 'note', 'Ingen kan spå retningen. Sjansen for at kursen er høyere har ligget rundt 5 av 10 for alle tidsrom – omtrent som kron og mynt. Det spennet forteller deg, er hvor mye du realistisk må tåle å se kursen falle eller stige.');
    drawFan(fan, C, px);
    box.append(rows, lg, why, note);
  }
  function drawFan(box, C, px) {
    if (typeof d3 === 'undefined' || !C.past || !C.past.length) return;
    const W = Math.max(300, box.clientWidth || 700), H = 260, m = { l: 64, r: 16, t: 10, b: 26 }, past = C.past.map(([t, c]) => ({ t, c })), t0 = past[past.length - 1].t, DAY = 864e5;
    const fut = [{ j: 0, lo: px, q25: px, mid: px, q75: px, hi: px }, ...HZ.map(([h]) => { const r = C.hz[h] && C.hz[h].range; return r ? { j: h, lo: px * (1 + r.lo), q25: px * (1 + r.q25), mid: px * (1 + r.mid), q75: px * (1 + r.q75), hi: px * (1 + r.hi) } : null; }).filter(Boolean)];
    fut.forEach(f => { f.t = t0 + f.j * DAY; });
    const ys = [...past.map(p => p.c), ...fut.map(f => f.lo), ...fut.map(f => f.hi)];
    const x = d3.scaleTime([past[0].t, fut[fut.length - 1].t], [m.l, W - m.r]), y = d3.scaleLog([d3.min(ys) * 0.95, d3.max(ys) * 1.05], [H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Kurs siste år og realistisk spenn neste år');
    const fmt = v => price(v).replace(' $', ''); const ticks = y.ticks(5).filter((v, i, a) => a.length < 7 || i % 2 === 0);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', css('--grid'));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', css('--muted')).text(fmt);
    const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 120))).tickFormat(d => d.toLocaleDateString('nb-NO', { month: 'short', year: '2-digit' })).tickSizeOuter(0));
    xa.selectAll('text').attr('fill', css('--muted')).attr('font-size', 12); xa.select('.domain').attr('stroke', css('--line')); xa.selectAll('.tick line').attr('stroke', css('--line'));
    const area = (a, b) => d3.area().x(f => x(f.t)).y0(f => y(f[a])).y1(f => y(f[b])).curve(d3.curveMonotoneX);
    svg.append('path').datum(fut).attr('d', area('lo', 'hi')).attr('fill', css('--axis')).attr('opacity', 0.18);
    svg.append('path').datum(fut).attr('d', area('q25', 'q75')).attr('fill', css('--axis')).attr('opacity', 0.35);
    svg.append('path').datum(fut).attr('d', d3.line().x(f => x(f.t)).y(f => y(f.mid)).curve(d3.curveMonotoneX)).attr('fill', 'none').attr('stroke', css('--fg')).attr('stroke-width', 1.5).attr('stroke-dasharray', '5 4');
    svg.append('path').datum(past).attr('d', d3.line().x(p => x(p.t)).y(p => y(p.c))).attr('fill', 'none').attr('stroke', css('--fg')).attr('stroke-width', 2);
    svg.append('line').attr('x1', x(t0)).attr('x2', x(t0)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--blue')).attr('stroke-dasharray', '3 3');
    svg.append('text').attr('x', x(t0) + 4).attr('y', m.t + 12).attr('font-size', 12).attr('fill', css('--blue')).text('i dag');
    // verktøytips
    const tip = el('div', 'tip'); tip.hidden = true; box.append(tip);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', ev => { const [mx] = d3.pointer(ev), t = x.invert(mx).getTime(); let txt;
        if (t <= t0) { const i = d3.bisector(p => p.t).center(past, t), p = past[i]; txt = `${dmy(p.t)}: ${price(p.c)}`; }
        else { const f = fut.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a); if (!f.j) return; const lab = HZ.find(h => h[0] === f.j)[1]; txt = `Om ${lab}: 8 av 10 ganger mellom ${price(f.lo)} og ${price(f.hi)}`; }
        tip.textContent = txt; tip.hidden = false; const k = box.clientWidth / W; tip.style.left = Math.min(box.clientWidth - tip.offsetWidth, Math.max(0, mx * k - tip.offsetWidth / 2)) + 'px'; tip.style.top = '0px'; })
      .on('pointerleave', () => { tip.hidden = true; });
  }

  // ---------------------------------------------------------------- lignende situasjoner
  function drawSimilar(D, C) {
    const box = document.getElementById('hs-similar'), n = names()[S.sym] || S.sym, h = C.hz[S.hz], N = C.now, lab = HZ.find(x => x[0] === S.hz)[1];
    const seg = el('div', 'seg'); [[30, '1 måned'], [90, '3 måneder'], [365, '1 år']].forEach(([k, l]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', k === S.hz ? 'true' : 'false'); b.addEventListener('click', () => { S.hz = k; render(); }); seg.append(b); });
    const out = [el('h2', null, 'Lignende situasjoner før'), seg];
    const long = S.hz >= 90;
    out.push(el('p', null, long
      ? `I dag er ${n} ${pa(N.dd)} under toppen, ${pa(N.d200)} ${N.d200 >= 0 ? 'over' : 'under'} 200-dagerslinja, ${pct0(N.r90)} siste 3 måneder og ${pct0(N.r365)} siste år.${S.sym !== 'BTC' ? ` Bitcoin er ${pa(N.btcDd)} under sin topp.` : ''} Vi har lett etter dager med lignende tall for ${D.poolCoins.length} store coins.`
      : `I dag er ${n} ${pct0(N.r7)} siste uke og ${pct0(N.r30)} siste måned, og ${N.d200 >= 0 ? 'over' : 'under'} 200-dagerslinja. Vi har lett etter dager med lignende kortsiktig utvikling for ${D.poolCoins.length} store coins.`));
    if (!h || !h.ok) { out.push(el('p', 'muted', 'Ikke nok data.')); box.replaceChildren(...out); return; }
    const k = Math.round(h.up * h.n);
    out.push(el('p', null, `Av de ${h.n} mest like situasjonene var kursen høyere ${lab} senere i ${k} (${ofTen(h.up)}). På en helt vanlig dag har det skjedd ${ofTen(h.base.up)} ganger. Typisk utfall: ${pct0(h.ret.q50)}.`));
    const v = (D.validation || {})[S.hz]; const g = v ? v.grade : 'ukjent';
    out.push(el('div', 'note', g === 'middels' ? 'Tester bakover i tid viser at slike sammenligninger har truffet litt bedre enn å gjette for dette tidsrommet – men langt fra sikkert.' :
      'Tester bakover i tid viser at slike sammenligninger ikke har truffet bedre enn å gjette. Bruk eksemplene under for å se hva som kan skje – ikke som en spådom.'));
    const list = el('div', 'cases');
    for (const c of h.cases) { const d = el('div', 'case'), l = el('div', 'stack'); l.style.gap = '0';
      l.append(el('b', null, `${names()[c.sym] || c.sym} · ${my(c.t)}`), el('span', 'muted small', long ? `Da: ${pct0(c.dd)} fra toppen, ${pct0(c.d200)} fra 200-dagerslinja${c.r90 != null ? `, ${pct0(c.r90)} siste 3 mnd` : ''}` : `Da: ${pct0(c.d200)} fra 200-dagerslinja`));
      const r = el('div', 'stack'); r.style.gap = '0'; r.append(el('span', 'res ' + cls(c.r), `${lab} senere: ${pct0(c.r)}`), el('span', 'muted small', `laveste underveis ${pct0(c.dip)}`)); r.style.textAlign = 'right';
      d.append(l, r); list.append(d); }
    out.push(list); box.replaceChildren(...out);
  }

  // ---------------------------------------------------------------- metode
  function drawHow(D) {
    const box = document.getElementById('hs-how-in'), v = D.validation || {};
    const t = el('table', 't'), hr = el('tr'); ['Tidsrom', 'Innenfor spennet (1. / 2. halvdel)', 'Høyere når «lignende» sa opp', 'Høyere når «lignende» sa ned', 'Høyere på en vanlig dag', 'Vurdering'].forEach((h, i) => hr.append(el('th', i ? '' : 'l', h))); t.append(hr);
    const G = { ingen: 'Ingen treffsikkerhet', lav: 'Svak', middels: 'Middels', ukjent: 'For lite data' };
    for (const [H, lab] of HZ) { const x = v[H]; if (!x) continue; const r = el('tr');
      r.append(el('td', 'l', lab), el('td', null, x.coverByTime ? `${ofTen(x.coverByTime.first)} / ${ofTen(x.coverByTime.second)}` : '–'), el('td', null, x.hi.up != null ? `${ofTen(x.hi.up)} (${x.hi.n})` : '–'), el('td', null, x.lo.up != null ? `${ofTen(x.lo.up)} (${x.lo.n})` : '–'), el('td', null, ofTen(x.upAll)), el('td', null, G[x.grade] || x.grade)); t.append(r); }
    const tw = el('div', 'tw'); tw.append(t);
    box.replaceChildren(
      el('p', null, `Data: dagskurser fra Binance for ${D.poolCoins.join(', ')} (${nf(D.poolDays)} coin-dager fra ${D.poolFrom}). Polygon har med MATIC-historikken fra før byttet. Første år etter at en coin ble notert er utelatt.`),
      el('p', null, 'Spennet: «vanlig utvikling» for alle coins, gjort bredere eller smalere etter hvor mye coinen svinger nå. Bredden er justert slik at kursen historisk havnet innenfor 8 av 10 ganger.'),
      el('p', null, `Lignende situasjoner: på lang sikt (3–12 mnd) sammenlignes ${D.feats.long.join(', ').toLowerCase()}. På kort sikt (1 uke – 1 mnd) ${D.feats.short.join(', ').toLowerCase()}.`),
      el('p', null, 'Testen: for hver 14. dag siden 2019 er beregningen gjort på nytt med bare data som var kjent den dagen, og sammenlignet med hva som faktisk skjedde. Tallene i parentes er antall tester. Testene overlapper i tid, så de reelle uavhengige tilfellene er færre.'),
      tw, el('p', 'muted small', `Beregnet ${new Date(D.built).toLocaleString('nb-NO')}.`));
  }
  window.HIST = { render };
})();
