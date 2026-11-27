// Bitcoin mot realisert pris. Realisert pris = realisert markedsverdi / antall bitcoins, fra Coin Metrics Community
// (CapMrktCurUSD / CapMVRVCur / SplyCur – regnet i scripts/cycle.js). Ingen tilnærming: mangler dataene, vises det.
// Ukesdata fra data/cycle.json: w = [dag, pris, 200W, 50W, realisert pris, MVRV-Z, risiko, MVRV].
(() => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const usd = v => v == null || !isFinite(v) ? '–' : nf(v, { maximumFractionDigits: v >= 100 ? 0 : 2 }) + ' $';
  const pct = v => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v * 100), { maximumFractionDigits: 0 }) + ' %';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const dm = d => new Date(d * 864e5).toLocaleDateString('nb-NO', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  // soner for MVRV (pris / realisert pris). Grensene er vanlige terskler i on-chain-analyse, ikke tilpasset.
  const Z = [[0, 1, 'Under realisert pris', '#26a69a'], [1, 2, 'Normal', null], [2, 3, 'Dyrt', '#e0a33a'], [3, 99, 'Overopphetet', '#ef5350']];
  const zone = v => Z.find(z => v >= z[0] && v < z[1]) || Z[1];
  const S = { built: false, rng: 'Alt', chs: [] };
  function render() {
    const root = document.getElementById('rp-in'); if (!root) return; const cy = dash.data('cycle');
    if (!cy || cy.status === 'loading') { root.replaceChildren(el('p', 'muted', 'Henter on-chain-data …')); return; }
    const C = cy.data, w = C && C.w ? C.w.filter(r => r[4] && r[7]) : [];
    if (cy.status !== 'ok' || w.length < 52) { root.replaceChildren(el('div', 'card tight', 'Realisert pris er ikke tilgjengelig: data fra Coin Metrics Community (CapMVRVCur, CapMrktCurUSD, SplyCur) mangler i siste oppdatering.')); S.sig = null; return; }
    const sig = w.length + '|' + w[w.length - 1][0]; if (sig === S.sig && root.childElementCount) return; S.sig = sig;
    const L = w[w.length - 1], mv = w.map(r => r[7]), rank = mv.filter(v => v < L[7]).length / mv.length, z = zone(L[7]);
    // under/over-perioder og kryssinger
    // kryssinger der kursen ble værende på den nye siden i minst 8 uker (filtrerer bort korte vipp rundt linja)
    const raw = []; for (let i = 1; i < w.length; i++) { const a = w[i - 1][7] >= 1, b = w[i][7] >= 1; if (a !== b) raw.push({ i, d: w[i][0], up: b }); }
    const cross = raw.filter((x, k) => (k + 1 < raw.length ? raw[k + 1].i : w.length) - x.i >= 8);
    let under = 0; for (let i = w.length - 1; i >= 0 && w[i][7] < 1; i--) under++;
    const card = el('div', 'card tight'), hd = el('div', 'row'); hd.append(el('h2', null, 'Bitcoin mot realisert pris'));
    const seg = el('div', 'tgroup'); ['2Å', '4Å', '8Å', 'Alt'].forEach(r => { const b = el('button', 'tb', r); b.type = 'button'; b.setAttribute('aria-pressed', r === S.rng ? 'true' : 'false'); b.addEventListener('click', () => { S.rng = r; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); setR(); }); seg.append(b); });
    hd.append(seg);
    const k = el('div', 'mstrip'), c = (a, b, s, cl) => { const d = el('div', 'mcell'); d.append(el('span', 'mlab', a), el('span', 'mv ' + (cl || ''), b), el('span', 'ms', s || '')); return d; };
    k.append(c('Bitcoin', usd(L[1]), `uke ${dm(L[0])}`), c('Realisert pris', usd(L[4]), 'snittprisen alle BTC sist ble flyttet til'), c('Premie', pct(L[1] / L[4] - 1), under ? `under i ${under} uker` : 'over realisert pris', L[7] >= 1 ? '' : 'up'),
      c('MVRV', nf(L[7], { maximumFractionDigits: 2 }), z[2], z[3] ? '' : ''), c('Historisk persentil', nf(rank * 100, { maximumFractionDigits: 0 }), `MVRV lavere ${nf(rank * 100, { maximumFractionDigits: 0 })} % av ukene`), c('Siste kryssing', cross.length ? dm(cross[cross.length - 1].d) : '–', cross.length ? (cross[cross.length - 1].up ? 'gikk over' : 'gikk under') : ''));
    const top = el('div'), bot = el('div'); top.style.height = 'clamp(260px, 42vh, 420px)'; bot.style.height = '150px'; const host = el('div'); host.append(top, bot);
    const lg = el('div', 'legend small'); [['Bitcoin (farget etter MVRV-sone)', css('--fg')], ['Realisert pris', '#d6336c']].forEach(([t, col]) => { const s = el('span'), i = el('i'); i.style.borderTopColor = col; s.append(i, document.createTextNode(t)); lg.append(s); });
    Z.forEach(([a, b, t, col]) => { if (!col) return; const s = el('span'), d = el('span', 'dot'); d.style.background = col; d.style.marginRight = '6px'; s.append(d, document.createTextNode(`${t} (${b < 99 ? a + '–' + b : '>' + a})`)); lg.append(s); });
    // syklus for syklus: MVRV ved bunn og topp (fra cycle.json)
    const ct = el('table', 't compact'), hr = el('tr'); ['Syklus', 'Bunn', 'MVRV ved bunn', 'Kurs mot RP ved bunn', 'Topp', 'MVRV ved topp'].forEach((x, i) => hr.append(el('th', i ? '' : 'l', x))); ct.append(hr);
    (C.cycles || []).forEach((cyc, i) => { const b = (C.atBot || []).find(x => x.d === cyc.bot), t = (C.atTop || [])[i]; const tr = el('tr'); tr.append(el('td', 'l', cyc.top.slice(0, 4) + (cyc.done ? '' : ' (pågår)')), el('td', null, cyc.done ? cyc.bot : '…'), el('td', b && b.mvrv < 1 ? 'up' : '', b ? nf(b.mvrv, { maximumFractionDigits: 2 }) : '–'), el('td', null, b ? pct(b.vsRp) : '–'), el('td', null, cyc.top), el('td', t && t.mvrv > 3 ? 'down' : '', t ? nf(t.mvrv, { maximumFractionDigits: 2 }) : '–')); ct.append(tr); });
    const tr = el('tr', 'cur'); tr.append(el('td', 'l', 'Nå'), el('td'), el('td'), el('td', null, pct(L[1] / L[4] - 1)), el('td'), el('td', null, nf(L[7], { maximumFractionDigits: 2 }))); ct.append(tr);
    const tw = el('div', 'tw'); tw.append(ct);
    const ex = el('details', 'more'); ex.append(el('summary', null, 'Hva er realisert pris?')); const ei = el('div', 'in'); ei.append(el('p', 'small', 'Realisert pris er snittprisen da hver bitcoin sist ble flyttet på blokkjeden – omtrent «hva eierne i snitt har betalt». MVRV = kurs / realisert pris. Under 1 betyr at den typiske eieren sitter med tap; historisk har det vært nær bunnene i bjørnemarkeder. Over ca. 3 har vært overopphetede faser. Få sykluser – historikk, ikke prognose.'),
      el('p', 'muted small', 'Kilde: Coin Metrics Community API: CapMrktCurUSD / CapMVRVCur / SplyCur. Ukesverdier (siste dag i uka).')); ex.append(ei);
    card.append(hd, k, host, lg, tw, ex); root.replaceChildren(card);
    requestAnimationFrame(() => chart(top, bot, w, cross));
  }
  function chart(top, bot, w, cross) {
    const LW = window.LightweightCharts; if (!LW) return; S.chs.forEach(c => { try { c.remove(); } catch (e) { /* ok */ } });
    const opt = vis => ({ autoSize: true, localization: { locale: 'nb-NO', dateFormat: 'dd.MM.yy' }, layout: { background: { type: 'solid', color: css('--panel') }, textColor: css('--muted'), fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line'), minimumWidth: 72 }, timeScale: { borderColor: css('--line'), visible: vis }, crosshair: { mode: 0 } });
    const c1 = LW.createChart(top, opt(false)), c2 = LW.createChart(bot, opt(true)); c1.priceScale('right').applyOptions({ mode: 1 }); c2.applyOptions({ layout: { attributionLogo: false } });
    const t = r => r[0] * 86400;
    const rp = c1.addAreaSeries({ lineColor: '#d6336c', topColor: 'rgba(214,51,108,.18)', bottomColor: 'rgba(214,51,108,0)', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'RP', priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    rp.setData(w.map(r => ({ time: t(r), value: r[4] })));
    const px = c1.addLineSeries({ lineWidth: 2, priceLineVisible: false, priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    px.setData(w.map(r => ({ time: t(r), value: r[1], color: zone(r[7])[3] || css('--fg') })));
    px.setMarkers(cross.map(x => ({ time: x.d * 86400, position: x.up ? 'belowBar' : 'aboveBar', shape: x.up ? 'arrowUp' : 'arrowDown', color: x.up ? css('--up') : css('--down'), text: x.up ? 'over RP' : 'under RP' })));
    const mv = c2.addBaselineSeries({ baseValue: { type: 'price', price: 1 }, topLineColor: '#ef5350', topFillColor1: 'rgba(239,83,80,.25)', topFillColor2: 'rgba(239,83,80,.03)', bottomLineColor: '#26a69a', bottomFillColor1: 'rgba(38,166,154,.03)', bottomFillColor2: 'rgba(38,166,154,.3)', lineWidth: 1.5, priceLineVisible: false, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    mv.setData(w.map(r => ({ time: t(r), value: r[7] })));
    [[1, 'RP'], [2, ''], [3, '']].forEach(([p, ti]) => mv.createPriceLine({ price: p, color: css('--axis'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: ti }));
    let lock = false; const sync = (a, b) => a.timeScale().subscribeVisibleTimeRangeChange(r => { if (lock || !r) return; lock = true; try { b.timeScale().setVisibleRange(r); } catch (e) { /* ok */ } lock = false; }); sync(c1, c2); sync(c2, c1);
    S.chs = [c1, c2]; S.w = w; setR();
  }
  function setR() { if (!S.chs.length || !S.w) return; const last = S.w[S.w.length - 1][0], n = { '2Å': 730, '4Å': 1461, '8Å': 2922, Alt: 1e6 }[S.rng]; S.chs[0].timeScale().setVisibleRange({ from: Math.max(S.w[0][0], last - n) * 86400, to: last * 86400 }); }
  window.RPUI = { render };
})();
