// Historiske scenarioer: hvor kan kursen realistisk være om 1 uke – 1 år, og hvor ofte har et slikt spenn stemt før?
// Data: data/history.json (scripts/history.js). Treffrekorden er regnet bakover i tid med bare data kjent den dagen.
(() => {
  'use strict';
  const HZ = [[7, '1 uke'], [30, '1 måned'], [90, '3 måneder'], [180, '6 måneder'], [365, '1 år']];
  const S = { sym: null, hz: 90 };
  try { const h = +localStorage.getItem('ms-hz'); if (HZ.some(x => x[0] === h)) S.hz = h; } catch (e) { /* ingen lagring */ }
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
  const lab = () => HZ.find(x => x[0] === S.hz)[1];
  const segBtn = (txt, on, fn) => { const b = el('button', null, txt); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.addEventListener('click', fn); return b; };

  // «Hvis trenden fortsetter»: rett linje gjennom log-kursen de siste L dagene (L = tidsrommet, minst 30 dager), forlenget fremover.
  const TL = { 7: ['siste måned', 30], 30: ['siste måned', 30], 90: ['siste 3 månedene', 90], 180: ['siste 6 månedene', 180], 365: ['siste året', 365] };
  const TERR = { 7: 50, 30: 50, 90: 49, 180: 57, 365: 77 }; // research/trend_extrap.js: hvor mye større snittfeilen var enn «uendret kurs»
  function trendSlope(C) { const L = TL[S.hz][1], P = C.past.slice(-L); if (P.length < 20) return null; let sx = 0, sy = 0, sxx = 0, sxy = 0; const n = P.length;
    P.forEach(([, c], k) => { const y = Math.log(c); sx += k; sy += y; sxx += k * k; sxy += k * y; }); return (n * sxy - sx * sy) / (n * sxx - sx * sx); }
  const where = (v, r, px) => { const q = x => px * (1 + x); return v > q(r.hi) ? 'over hele spennet – bedre enn det gode utfallet' : v > q(r.q75) ? 'i den øvre delen av spennet' : v >= q(r.q25) ? 'midt i spennet' : v >= q(r.lo) ? 'i den nedre delen av spennet' : 'under hele spennet – verre enn det dårlige utfallet'; };
  // syklus: kursendring j dager etter samme fase i en tidligere syklus
  const cycAt = (cy, j) => { let best = null; for (const [d, v] of cy.path) if (d <= j) best = v; return cy.path.length && cy.path[cy.path.length - 1][0] >= j - 3 ? best : null; };
  function render() {
    const H = dash.data('history'), main = document.getElementById('hs-main'), L = window.COINS || [], p = dash.params();
    if (p.coin && L.includes(p.coin)) S.sym = p.coin; if (!S.sym) S.sym = L[0];
    document.getElementById('hs-coins').replaceChildren(...L.map(s => segBtn(names()[s] || s, s === S.sym, () => { S.sym = s; dash.setParams({ coin: s }); })));
    document.getElementById('hs-hz').replaceChildren(el('span', 'muted', 'Om:'), ...HZ.map(([h, l]) => segBtn(l, h === S.hz, () => { S.hz = h; try { localStorage.setItem('ms-hz', h); } catch (e) { /* ignorer */ } render(); })));
    if (H.status !== 'ok') { main.replaceChildren(el('p', H.status === 'error' ? 'down' : 'muted', H.status === 'error' ? 'Beregningene er ikke tilgjengelige akkurat nå. De lages automatisk hver 4. time.' : 'Henter …')); ['hs-track', 'hs-similar'].forEach(id => document.getElementById(id).replaceChildren()); return; }
    const D = H.data, C = D.coins[S.sym]; if (!C) { main.replaceChildren(el('p', 'muted', 'Ingen beregning for denne coinen ennå.')); return; }
    drawMain(D, C); drawTrack(D, C); drawSimilar(D, C); drawHow(D);
  }

  // ---------------------------------------------------------------- hovedsvaret
  function drawMain(D, C) {
    const box = document.getElementById('hs-main'), n = names()[S.sym] || S.sym, Lv = (window.__live || {})[S.sym], px = Lv && Lv.p ? Lv.p : C.now.c, h = C.hz[S.hz], r = h && h.range;
    if (!r) { box.replaceChildren(el('p', 'muted', 'Ikke tilgjengelig for denne coinen.')); return; }
    const lo = px * (1 + r.lo), mid = px * (1 + r.mid), hi = px * (1 + r.hi), cov = r.cover;
    const head = el('p', 'big'); head.append(document.createTextNode(`Om ${lab()} ligger ${n} trolig mellom `), el('b', null, price(lo)), document.createTextNode(' og '), el('b', null, price(hi)), document.createTextNode('.'));
    const sub = el('p', 'muted', `Regnet fra dagens kurs ${price(px)}${Lv && Lv.p ? '' : ` (dagslukk ${dmy(C.now.t)})`}. Spennet er laget for å treffe 8 av 10 ganger.`);
    const sc = (k, c, v, p) => { const d = el('div', 'sc ' + c); d.append(el('span', 'k', k), el('span', 'v', price(v)), el('span', 'p ' + cls(p), pct0(p))); return d; };
    const scen = el('div', 'scen'); scen.append(sc('Dårlig utfall (1 av 10 ganger verre)', 'bad', lo, r.lo), sc('Midt i', '', mid, r.mid), sc('Godt utfall (1 av 10 ganger bedre)', 'good', hi, r.hi));
    const dir = el('p', null, `Opp eller ned? Omtrent like stor sjanse for begge (${ofTen(r.pUp)} ganger høyere). Vi har testet flere måter å spå retningen på – ingen har truffet sikkert bedre enn kron og mynt. Syklusen så best ut på 6–12 måneder, men bygger på bare to tidligere sykluser.`);
    // tillit: faktisk treffprosent bakover i tid for denne coinen og tidsrommet
    const trust = el('div', 'trust');
    if (cov && cov.n) { const dots = el('span', 'dots'); const k = Math.round(cov.cover * 10); for (let i = 0; i < 10; i++) dots.append(el('i', i < k ? 'on' : null));
      const t = el('span', null); t.append(el('b', null, `Har faktisk stemt ${ofTen(cov.cover)} ganger`), document.createTextNode(` for ${n} (testet ${cov.n} ganger siden 2020${cov.below > 0.15 ? `; når det bommet, endte kursen oftest lavere enn spennet` : cov.above > 0.15 ? '; når det bommet, endte kursen oftest høyere' : ''}).`));
      trust.append(dots, t); }
    const b = trendSlope(C), tv = b == null ? null : px * Math.exp(b * S.hz);
    const tr = tv == null ? null : el('div', 'note'); if (tr) { tr.style.borderLeftColor = css('--orange');
      tr.append(el('b', null, `Hvis trenden fortsetter: ca. ${price(tv)} om ${lab()} (${pct0(tv / px - 1)}).`), document.createTextNode(` Det er hvis ${n} fortsetter i samme tempo som de ${TL[S.hz][0]}, og ligger ${where(tv, r, px)}. Men trender snur ofte: i testen stemte retningen bare halvparten av gangene, og bommet i snitt ${TERR[S.hz]} % mer enn å anta uendret kurs. Se det som et «hva om», ikke en spådom.`)); }
    const CY = C.cycles, cl = CY && CY.list ? CY.list.map(cy => ({ cy, v: cycAt(cy, S.hz) })).filter(x => x.v != null) : [];
    let cyc = null; if (cl.length) { cyc = el('div', 'note'); cyc.style.borderLeftColor = css('--purple'); const months = Math.round(CY.phaseDays / 30.44);
      const when = cl.map(x => new Date(x.cy.start).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })).join(' og ');
      const res = cl.map(x => `${pct0(x.v - 1)} (fra ${new Date(x.cy.start).toLocaleDateString('nb-NO', { month: 'short', year: 'numeric' })})`).join(' og ');
      const bigDrop = ['BTC', 'ETH'].includes(S.sym) ? cl.map(x => pa(x.cy.dd)).join(' og ') : null;
      cyc.append(el('b', null, `Hvis syklusen gjentar seg: ${cl.map(x => price(px * x.v)).join(' eller ')} om ${lab()}.`), document.createTextNode(` ${n} er nå ${months} måneder etter forrige Bitcoin-halvering (april 2024). På samme tidspunkt i ${cl.length === 1 ? 'forrige syklus' : 'de forrige syklusene'} (${when}) ble utviklingen de neste ${lab()} ${res}. ` +
        (bigDrop ? `Men denne syklusen er allerede annerledes: da hadde ${n} falt ${bigDrop} fra toppen – nå bare ${pa(C.now.dd)}. ` : '') +
        `Det finnes bare ${cl.length === 1 ? 'én tidligere syklus' : 'to tidligere sykluser'} i dataene våre, og i testen ble spennet smalere med syklusen, men det bommet oftere (omtrent 7 mot 8 av 10). Derfor er syklusen vist som et eksempel, ikke brukt i spennet.`)); }
    const out = [head, sub, scen, ...(tr ? [tr] : []), ...(cyc ? [cyc] : []), trust, dir];
    if (S.hz >= 180) out.push(el('div', 'note', `Langt frem (${lab()}) er spennet mest usikkert. I testen havnet kursen oftere under spennet enn den skulle – særlig etter de store oppgangene i 2021. Regn med at et dårlig utfall kan bli verre enn tallet over.`));
    const fan = el('div', 'fan'); box.replaceChildren(...out.slice(0, 3), fan, ...out.slice(3)); drawFan(fan, C, px, b);
  }
  function drawFan(box, C, px, slope) {
    if (typeof d3 === 'undefined' || !C.past || !C.past.length) return;
    const W = Math.max(300, box.clientWidth || 700), H = 240, m = { l: 64, r: 16, t: 14, b: 26 }, past = C.past.map(([t, c]) => ({ t, c })), t0 = past[past.length - 1].t, DAY = 864e5;
    const fut = [{ j: 0, lo: px, mid: px, hi: px, q25: px, q75: px }, ...HZ.map(([h]) => { const r = C.hz[h] && C.hz[h].range; return r ? { j: h, lo: px * (1 + r.lo), q25: px * (1 + r.q25), mid: px * (1 + r.mid), q75: px * (1 + r.q75), hi: px * (1 + r.hi) } : null; }).filter(Boolean)];
    fut.forEach(f => { f.t = t0 + f.j * DAY; }); const show = fut.filter(f => f.j <= Math.max(S.hz, 30)), pastShow = past.filter(p => p.t >= t0 - Math.max(S.hz * 2, 90) * DAY);
    const ys = [...pastShow.map(p => p.c), ...show.map(f => f.lo), ...show.map(f => f.hi)]; if (slope != null) { const tv = px * Math.exp(slope * S.hz); if (tv < d3.max(ys) * 3 && tv > d3.min(ys) / 3) ys.push(tv); } if (C.cycles && C.cycles.list) for (const cy of C.cycles.list) for (const [d, v] of cy.path) if (d <= S.hz && px * v < d3.max(ys) * 2 && px * v > d3.min(ys) / 2) ys.push(px * v);
    const x = d3.scaleTime([pastShow[0].t, show[show.length - 1].t], [m.l, W - m.r]), y = d3.scaleLog([d3.min(ys) * 0.95, d3.max(ys) * 1.05], [H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `Kursen før og spennet de neste ${lab()}`);
    const ticks = y.ticks(5).filter((v, i, a) => a.length < 7 || i % 2 === 0);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', css('--grid'));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', css('--muted')).text(v => price(v).replace(' $', ''));
    const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 120))).tickFormat(d => d.toLocaleDateString('nb-NO', S.hz <= 30 ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' })).tickSizeOuter(0));
    xa.selectAll('text').attr('fill', css('--muted')).attr('font-size', 12); xa.select('.domain').attr('stroke', css('--line')); xa.selectAll('.tick line').attr('stroke', css('--line'));
    const area = (a, b) => d3.area().x(f => x(f.t)).y0(f => y(f[a])).y1(f => y(f[b])).curve(d3.curveMonotoneX);
    svg.append('path').datum(show).attr('d', area('lo', 'hi')).attr('fill', css('--axis')).attr('opacity', 0.2);
    svg.append('path').datum(show).attr('d', area('q25', 'q75')).attr('fill', css('--axis')).attr('opacity', 0.35);
    svg.append('path').datum(pastShow).attr('d', d3.line().x(p => x(p.t)).y(p => y(p.c))).attr('fill', 'none').attr('stroke', css('--fg')).attr('stroke-width', 2);
    const f = show[show.length - 1];
    const ends = [[f.hi, css('--up'), `godt: ${price(f.hi)}`], [f.mid, css('--fg'), `midt i: ${price(f.mid)}`], [f.lo, css('--down'), `dårlig: ${price(f.lo)}`]];
    if (slope != null) { const tv = px * Math.exp(slope * S.hz); if (tv > y.domain()[0] && tv < y.domain()[1]) ends.push([tv, css('--orange'), `trenden: ${price(tv)}`]); }
    const lab2 = ends.map(([v, c, t]) => ({ v, c, t, y: y(v) })).sort((a, b) => a.y - b.y); for (let i = 1; i < lab2.length; i++) if (lab2[i].y - lab2[i - 1].y < 15) lab2[i].y = lab2[i - 1].y + 15;
    const over = lab2.length ? lab2[lab2.length - 1].y - (H - m.b - 4) : 0; if (over > 0) lab2.forEach(l => { l.y -= over; });
    lab2.forEach(l => { svg.append('circle').attr('cx', x(f.t)).attr('cy', y(l.v)).attr('r', 4).attr('fill', l.c);
      svg.append('text').attr('class', 'endlab').attr('x', x(f.t) - 9).attr('y', l.y).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 12).attr('font-weight', 700).attr('fill', l.c).attr('paint-order', 'stroke').attr('stroke', css('--panel')).attr('stroke-width', 3).text(l.t); });
    if (slope != null) { const tp = d3.range(0, S.hz + 1, Math.max(1, Math.round(S.hz / 60))).map(j => ({ t: t0 + j * DAY, v: px * Math.exp(slope * j) })), last = tp[tp.length - 1];
      const inR = last.v > y.domain()[0] && last.v < y.domain()[1];
      svg.append('path').datum(tp.filter(p => p.v > y.domain()[0] && p.v < y.domain()[1])).attr('d', d3.line().x(p => x(p.t)).y(p => y(p.v))).attr('fill', 'none').attr('stroke', css('--orange')).attr('stroke-width', 2.5).attr('stroke-dasharray', '7 5');
      void inR; }
    if (C.cycles && C.cycles.list) for (const cy of C.cycles.list) { const pts = cy.path.filter(([d]) => d <= S.hz).map(([d, v]) => ({ t: t0 + d * DAY, v: px * v })).filter(p => p.v > y.domain()[0] && p.v < y.domain()[1]);
      if (pts.length < 2) continue; svg.append('path').datum(pts).attr('d', d3.line().x(p => x(p.t)).y(p => y(p.v))).attr('fill', 'none').attr('stroke', css('--purple')).attr('stroke-width', 1.8).attr('stroke-dasharray', '2 4');
      const lp = pts[Math.floor(pts.length * 0.55)]; svg.append('text').attr('class', 'endlab').attr('x', x(lp.t) + 4).attr('y', y(lp.v)).attr('dy', '0.35em').attr('dy', '-0.6em').attr('font-size', 11).attr('fill', css('--purple')).attr('paint-order', 'stroke').attr('stroke', css('--panel')).attr('stroke-width', 3).text(`som i ${new Date(cy.start).getUTCFullYear()}`); }
    svg.selectAll('.endlab').raise();
    // verktøytips: les av hvilken som helst dato
    const tip = el('div', 'tip'); tip.hidden = true; box.append(tip); const vline = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--muted')).attr('display', 'none');
    const at = j => { const a = show.filter(f => f.j <= j).pop(), b2 = show.find(f => f.j >= j) || a; if (!a || a === b2 || b2.j === a.j) return a; const w = Math.sqrt(j / b2.j) * (b2.j ? 1 : 0), w0 = a.j ? Math.sqrt(j / a.j) : 0;
      const g = k => { const la = Math.log(a[k] / px), lb = Math.log(b2[k] / px); const f2 = (j - a.j) / (b2.j - a.j); return px * Math.exp(la + (lb - la) * f2); }; return { lo: g('lo'), mid: g('mid'), hi: g('hi') }; };
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', ev => { const [mx] = d3.pointer(ev), t = x.invert(mx).getTime(); vline.attr('display', null).attr('x1', mx).attr('x2', mx); let txt;
        if (t <= t0) { const i = d3.bisector(p => p.t).center(pastShow, t), p = pastShow[i]; txt = `${dmy(p.t)}: ${price(p.c)}`; }
        else { const j = Math.round((t - t0) / DAY), q = at(j); if (!q) return; txt = `${dmy(t)}: dårlig ${price(q.lo)} · midt i ${price(q.mid)} · godt ${price(q.hi)}${slope != null ? ` · trenden ${price(px * Math.exp(slope * j))}` : ''}`; }
        tip.textContent = txt; tip.hidden = false; const k = box.clientWidth / W; tip.style.left = Math.min(box.clientWidth - tip.offsetWidth, Math.max(0, mx * k - tip.offsetWidth / 2)) + 'px'; tip.style.top = '0px'; })
      .on('pointerleave', () => { tip.hidden = true; vline.attr('display', 'none'); });
    { const lg = el('div', 'legend'), it = (style, txt) => { const sp = el('span'); const ii = el('i'); Object.assign(ii.style, style); sp.append(ii, document.createTextNode(txt)); return sp; };
      lg.append(it({ borderTopColor: css('--axis'), borderTopWidth: '10px', opacity: 0.6 }, 'Spennet (mørkest: halvparten av gangene)'), ...(slope != null ? [it({ borderTopColor: css('--orange'), borderTopStyle: 'dashed' }, 'Hvis trenden fortsetter')] : []), ...(C.cycles && C.cycles.list && C.cycles.list.length ? [it({ borderTopColor: css('--purple'), borderTopStyle: 'dotted' }, 'Hvis syklusen gjentar seg')] : []), el('span', null, 'Hold musa/fingeren over grafen for å lese av en dato')); box.append(lg); }
    svg.append('line').attr('x1', x(t0)).attr('x2', x(t0)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--blue')).attr('stroke-dasharray', '3 3');
    svg.append('text').attr('x', x(t0) + 4).attr('y', m.t + 2).attr('font-size', 12).attr('fill', css('--blue')).text('i dag');
  }

  // ---------------------------------------------------------------- har det stemt før?
  function drawTrack(D, C) {
    const box = document.getElementById('hs-track'), n = names()[S.sym] || S.sym, Hs = C.track && C.track[S.hz] ? S.hz : [90, 30, 365].find(h => C.track && C.track[h]);
    if (!Hs) { box.replaceChildren(); return; } const L = C.track[Hs].filter(r => r[5] != null), Hl = HZ.find(x => x[0] === Hs)[1], DAY = 864e5;
    const out = [el('h2', null, 'Har dette stemt før?')];
    if (!L.length) { out.push(el('p', 'muted', 'Ingen ferdige tester ennå for dette tidsrommet.')); box.replaceChildren(...out); return; }
    const hit = L.filter(r => r[5] >= r[2] && r[5] <= r[4]).length, over = L.filter(r => r[5] > r[4]).length, under = L.filter(r => r[5] < r[2]).length;
    out.push(el('p', null, `Hver uke de siste par årene regnet vi ut spennet for ${n} ${Hl} frem – med bare det vi visste den dagen. Det grå båndet viser spennet, den svarte linja hva kursen faktisk ble. Kursen havnet innenfor ${hit} av ${L.length} ganger (${ofTen(hit / L.length)}), over ${over} ganger og under ${under} ganger.`));
    if (Hs !== S.hz) out.push(el('p', 'muted small', `Viser ${Hl}, fordi treffrekorden lagres for 1 måned, 3 måneder og 1 år.`));
    const wrap = el('div', 'fan'); out.push(wrap); box.replaceChildren(...out);
    if (typeof d3 === 'undefined') return;
    const W = Math.max(300, wrap.clientWidth || 700), H = 220, m = { l: 64, r: 12, t: 10, b: 26 }, pts = L.map(r => ({ t: r[0] + Hs * DAY, lo: r[2], mid: r[3], hi: r[4], a: r[5] }));
    const x = d3.scaleTime(d3.extent(pts, p => p.t), [m.l, W - m.r]), y = d3.scaleLog([d3.min(pts, p => Math.min(p.lo, p.a)) * 0.95, d3.max(pts, p => Math.max(p.hi, p.a)) * 1.05], [H - m.b, m.t]);
    const svg = d3.select(wrap).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Spenn regnet på forhånd og faktisk kurs');
    const ticks = y.ticks(5).filter((v, i, a) => a.length < 7 || i % 2 === 0);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', css('--grid'));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', css('--muted')).text(v => price(v).replace(' $', ''));
    const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 120))).tickFormat(d => d.toLocaleDateString('nb-NO', { month: 'short', year: '2-digit' })).tickSizeOuter(0));
    xa.selectAll('text').attr('fill', css('--muted')).attr('font-size', 12); xa.select('.domain').attr('stroke', css('--line')); xa.selectAll('.tick line').attr('stroke', css('--line'));
    svg.append('path').datum(pts).attr('d', d3.area().x(p => x(p.t)).y0(p => y(p.lo)).y1(p => y(p.hi)).curve(d3.curveStepAfter)).attr('fill', css('--axis')).attr('opacity', 0.3);
    svg.append('path').datum(pts).attr('d', d3.line().x(p => x(p.t)).y(p => y(p.a))).attr('fill', 'none').attr('stroke', css('--fg')).attr('stroke-width', 2);
    svg.append('g').selectAll('circle').data(pts.filter(p => p.a < p.lo || p.a > p.hi)).join('circle').attr('cx', p => x(p.t)).attr('cy', p => y(p.a)).attr('r', 3.5).attr('fill', p => p.a > p.hi ? css('--up') : css('--down'));
    const lg = el('div', 'legend'); const it = (style, txt) => { const s = el('span'); const i = el('i'); Object.assign(i.style, style); s.append(i, document.createTextNode(txt)); return s; };
    lg.append(it({ borderTopColor: css('--axis'), borderTopWidth: '10px', opacity: 0.5 }, 'Spennet vi ville sagt på forhånd'), it({ borderTopColor: css('--fg') }, 'Faktisk kurs'), it({ borderTopColor: css('--down'), width: '8px', borderRadius: '4px' }, 'Under spennet'), it({ borderTopColor: css('--up'), width: '8px', borderRadius: '4px' }, 'Over spennet'));
    wrap.append(lg);
  }

  // ---------------------------------------------------------------- eksempler (ingen treffsikkerhet på retning)
  function drawSimilar(D, C) {
    const box = document.getElementById('hs-similar'), n = names()[S.sym] || S.sym, h = C.hz[S.hz], N = C.now, l = lab(), long = S.hz >= 90;
    const out = [el('div', 'note', 'Dette er eksempler, ikke en spådom. Tester bakover i tid viser at «lignende situasjoner» ikke har truffet bedre enn å gjette på om kursen går opp eller ned.'),
      el('p', null, long
        ? `I dag er ${n} ${pa(N.dd)} under toppen, ${pa(N.d200)} ${N.d200 >= 0 ? 'over' : 'under'} 200-dagerslinja, ${pct0(N.r90)} siste 3 måneder og ${pct0(N.r365)} siste år.${S.sym !== 'BTC' ? ` Bitcoin er ${pa(N.btcDd)} under sin topp.` : ''} Her er dagene som lignet mest, blant ${D.poolCoins.length} store coins:`
        : `I dag er ${n} ${pct0(N.r7)} siste uke og ${pct0(N.r30)} siste måned. Her er dagene som lignet mest, blant ${D.poolCoins.length} store coins:`)];
    if (!h || !h.ok) { out.push(el('p', 'muted', 'Ikke nok data.')); box.replaceChildren(...out); return; }
    const list = el('div', 'cases');
    for (const c of h.cases) { const d = el('div', 'case'), a = el('div', 'stack'); a.style.gap = '0';
      a.append(el('b', null, `${names()[c.sym] || c.sym} · ${my(c.t)}`), el('span', 'muted small', long ? `Da: ${pct0(c.dd)} fra toppen, ${pct0(c.d200)} fra 200-dagerslinja` : `Da: ${pct0(c.d200)} fra 200-dagerslinja`));
      const b = el('div', 'stack'); b.style.gap = '0'; b.append(el('span', 'res ' + cls(c.r), `${l} senere: ${pct0(c.r)}`), el('span', 'muted small', `laveste underveis ${pct0(c.dip)}`)); d.append(a, b); list.append(d); }
    out.push(list, el('p', 'muted small', `Av de ${h.n} mest like dagene var kursen høyere ${l} senere i ${ofTen(h.up)} tilfeller. På en vanlig dag: ${ofTen(h.base.up)}.`));
    box.replaceChildren(...out);
  }

  // ---------------------------------------------------------------- metode
  function drawHow(D) {
    const box = document.getElementById('hs-how-in'), R = D.ranges || {};
    const t = el('table', 't'), hr = el('tr'); ['Tidsrom', 'Innenfor spennet', 'Over', 'Under', 'Antall tester'].forEach((h, i) => hr.append(el('th', i ? '' : 'l', h))); t.append(hr);
    for (const [H, l] of HZ) { const x = R[H] && R[H].cover; if (!x) continue; const r = el('tr'); r.append(el('td', 'l', l), el('td', null, ofTen(x.all)), el('td', null, ofTen(x.above)), el('td', null, ofTen(x.below)), el('td', null, nf(x.n))); t.append(r); }
    const tw = el('div', 'tw'); tw.append(t);
    box.replaceChildren(
      el('p', null, `Data: dagskurser fra Binance for ${D.poolCoins.length} store coins (${D.poolCoins.join(', ')}) fra ${D.poolFrom.slice(0, 4)}. Polygon har med MATIC-historikken. Første år etter at en coin ble notert er utelatt.`),
      el('p', null, 'Spennet: hvor mye coinen svinger nå (snitt av siste måned, 3 måneder og år) ganget med hvordan alle coinene faktisk har beveget seg tidligere når de svingte like mye. Det enkleste som virket best i testene – å legge til trend, fall fra toppen eller Bitcoin-trend gjorde ikke spennet bedre.'),
      el('p', null, 'Testen: for hver 7. dag siden 2020 er spennet regnet med bare data som var kjent den dagen, og sammenlignet med kursen etterpå. Et godt spenn skal treffe omtrent 8 av 10 ganger, og bomme omtrent like ofte over som under. Tabellen gjelder de sju coinene på siden samlet:'),
      tw, el('p', 'muted small', `Beregnet ${new Date(D.built).toLocaleString('nb-NO')}.`));
  }
  window.HIST = { render };
})();
