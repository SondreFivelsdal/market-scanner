// Fanen «Fear & Greed»: dagens stemning, hele historikken (fra feb. 2018) mot Bitcoin-kursen, og hva som skjedde med
// Bitcoin etter dager med hver stemning. Kilder: alternative.me (indeksen) og Binance (BTC-dagslukk). Alt regnes i nettleseren.
(() => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const NS = 'http://www.w3.org/2000/svg', sv = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a || {}) e.setAttribute(k, a[k]); return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const pct = v => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v * 100), { maximumFractionDigits: 0 }) + ' %';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const DAY = 864e5, dm = t => new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
  const CL = [['Extreme Fear', 'Ekstrem frykt', '#c2362c'], ['Fear', 'Frykt', '#e07b39'], ['Neutral', 'Nøytral', '#a8a29e'], ['Greed', 'Grådighet', '#7cb342'], ['Extreme Greed', 'Ekstrem grådighet', '#1a7f4b']];
  const clOf = v => v < 25 ? 0 : v < 47 ? 1 : v < 55 ? 2 : v < 76 ? 3 : 4; // reserve hvis kilden ikke oppgir klasse
  const ixOf = x => { const i = CL.findIndex(c => c[0] === x.cls); return i >= 0 ? i : clOf(x.v); };
  const S = { F: null, B: null, err: null, built: false, rng: '3Å', ch: null, at: 0 };
  const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), x = q * (s.length - 1), lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); };
  const get = url => { const c = new AbortController(), to = setTimeout(() => c.abort(), 15000); return fetch(url, { cache: 'no-store', signal: c.signal }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(() => clearTimeout(to)); };

  function load() {
    if (Date.now() - S.at < 10 * 6e4 && (S.F || S.err)) return; S.at = Date.now();
    get('https://api.alternative.me/fng/?limit=0').then(j => { const a = (j && j.data || []).map(x => ({ d: Math.floor(+x.timestamp * 1000 / DAY), v: +x.value, cls: x.value_classification })).filter(x => isFinite(x.v)).sort((a, b) => a.d - b.d);
      if (!a.length) throw new Error('tomt svar'); S.F = a; S.err = null; }).catch(e => { S.err = String(e.message || e); }).finally(draw);
    KL.all('BTC', '1d', 4).then(B => { S.B = B; }).catch(() => { S.B = S.B || null; }).finally(draw);
  }

  // ---------------------------------------------------------------- måler (halvsirkel)
  function gauge(v, idx) {
    const W = 260, H = 150, cx = 130, cy = 132, R = 110, r = 78, s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'gauge', role: 'img', 'aria-label': `Fear & Greed ${v} av 100` });
    const P = (a, rad) => [cx - rad * Math.cos(a), cy - rad * Math.sin(a)], A = x => Math.PI * x / 100;
    [[0, 25], [25, 47], [47, 55], [55, 76], [76, 100]].forEach(([a, b], i) => { const [x1, y1] = P(A(a), R), [x2, y2] = P(A(b), R), [x3, y3] = P(A(b), r), [x4, y4] = P(A(a), r);
      s.append(sv('path', { d: `M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 0 0 ${x4} ${y4}Z`, fill: CL[i][2], opacity: i === idx ? 1 : 0.28 })); });
    const [nx, ny] = P(A(v), R - 4); s.append(sv('line', { x1: cx, y1: cy, x2: nx, y2: ny, stroke: css('--fg'), 'stroke-width': 3, 'stroke-linecap': 'round' }), sv('circle', { cx, cy, r: 6, fill: css('--fg') }));
    const t = sv('text', { x: cx, y: cy - 30, 'text-anchor': 'middle', 'font-size': 34, 'font-weight': 700, fill: css('--fg') }); t.textContent = v; s.append(t);
    return s;
  }

  // ---------------------------------------------------------------- graf: indeksen (søyler, venstre) og Bitcoin (linje, høyre, logg)
  function chart(host) {
    const LW = window.LightweightCharts; if (!LW || !S.F) return; (S.chs || []).forEach(c => { try { c.remove(); } catch (e) { /* allerede fjernet */ } }); host.replaceChildren();
    const top = el('div'), bot = el('div'); top.style.height = 'clamp(240px, 40vh, 380px)'; bot.style.height = '150px'; host.append(top, bot);
    const opt = vis => ({ autoSize: true, localization: { locale: 'nb-NO', dateFormat: 'dd.MM.yy' }, layout: { background: { type: 'solid', color: css('--panel') }, textColor: css('--muted'), fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 12 },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line'), minimumWidth: 70 }, timeScale: { borderColor: css('--line'), visible: vis }, crosshair: { mode: 0 } });
    const c1 = LW.createChart(top, opt(false)), c2 = LW.createChart(bot, opt(true)); c1.priceScale('right').applyOptions({ mode: 1 }); c2.priceScale('right').applyOptions({ scaleMargins: { top: 0.04, bottom: 0.02 } }); c2.applyOptions({ layout: { attributionLogo: false } });
    const fg = c2.addHistogramSeries({ priceFormat: { type: 'price', precision: 0, minMove: 1 }, priceLineVisible: false, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    fg.setData(S.F.map(x => ({ time: x.d * 86400, value: x.v, color: CL[ixOf(x)][2] })));
    [25, 50, 75].forEach(p => fg.createPriceLine({ price: p, color: css('--axis'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' }));
    if (S.B) { const btc = c1.addLineSeries({ color: css('--fg'), lineWidth: 2, priceLineVisible: false, priceFormat: { type: 'price', precision: 0, minMove: 1 } }); btc.setData(S.B.filter(b => b.t >= S.F[0].d * DAY).map(b => ({ time: Math.floor(b.t / DAY) * 86400, value: b.c }))); }
    let lock = false; const sync = (a, b2) => a.timeScale().subscribeVisibleTimeRangeChange(r => { if (lock || !r) return; lock = true; try { b2.timeScale().setVisibleRange(r); } catch (e) { /* utenfor data */ } lock = false; }); sync(c1, c2); sync(c2, c1);
    S.chs = [c1, c2]; S.ch = c2; if (window.ZOOM) { ZOOM.attach(c1, top, { onReset: setRange }); ZOOM.attach(c2, bot, { onReset: setRange, quiet: true }); } setRange();
  }
  function setRange() { if (!S.ch || !S.F) return; const last = S.F[S.F.length - 1].d, n = { '1Å': 365, '3Å': 1095, Alt: 1e5 }[S.rng]; S.ch.timeScale().setVisibleRange({ from: Math.max(S.F[0].d, last - n) * 86400, to: last * 86400 }); }

  // ---------------------------------------------------------------- hva skjedde med Bitcoin etter hver stemning
  function table(cur) {
    if (!S.B) return el('p', 'muted small', S.F ? 'Henter Bitcoin-kurser …' : '');
    const byD = new Map(S.B.map(b => [Math.floor(b.t / DAY), b.c])), H = [30, 90, 365], rows = CL.map(() => H.map(() => [])), all = H.map(() => []), cnt = CL.map(() => 0);
    for (const x of S.F) { const c0 = byD.get(x.d); if (!c0) continue; const i = ixOf(x); cnt[i]++; H.forEach((h, k) => { const c1 = byD.get(x.d + h); if (c1) { rows[i][k].push(c1 / c0 - 1); all[k].push(c1 / c0 - 1); } }); }
    const t = el('table', 't compact'), hr = el('tr'); ['Stemning', 'Dager', '1 mnd etter', '3 mnd etter', '1 år etter'].forEach((x, i) => hr.append(el('th', i ? '' : 'l', x))); t.append(hr);
    const cell = a => { const td = el('td'); if (!a.length) { td.textContent = '–'; td.className = 'muted'; return td; } const m = quant(a, 0.5); td.className = m > 0 ? 'up' : m < 0 ? 'down' : ''; td.append(el('b', null, pct(m)), el('span', 'muted small sub2', `opp ${nf(a.filter(v => v > 0).length / a.length * 100, { maximumFractionDigits: 0 })} %`)); return td; };
    CL.forEach((c, i) => { const tr = el('tr', 'evrow' + (i === cur ? ' cur' : '')); tr.style.cursor = 'default'; const l = el('td', 'l'); const dot = el('span', 'dot'); dot.style.background = c[2]; l.append(dot, document.createTextNode(' ' + c[1])); if (i === cur) l.append(el('span', 'small sub2', 'i dag'));
      tr.append(l, el('td', null, nf(cnt[i]))); rows[i].forEach(a => tr.append(cell(a))); t.append(tr); });
    const tr = el('tr'); tr.append(el('td', 'l', 'Alle dager'), el('td', null, nf(cnt.reduce((a, b) => a + b, 0)))); all.forEach(a => tr.append(cell(a))); t.append(tr);
    const tw = el('div', 'tw'); tw.append(t); return tw;
  }

  // ---------------------------------------------------------------- tegning
  function draw() {
    const root = document.getElementById('fng-in'); if (!root || document.getElementById('fng').hidden) return;
    if (!S.F) { root.replaceChildren(el('p', 'muted', S.err ? 'Fear & Greed-indeksen er ikke tilgjengelig akkurat nå (alternative.me svarer ikke).' : 'Henter …')); S.sig = null; return; }
    const F = S.F, L = F[F.length - 1], sig = `${F.length}|${L.v}|${S.B ? S.B.length : 0}`; if (sig === S.sig && root.childElementCount) return; S.sig = sig;
    const idx = ixOf(L), back = n => { const x = F.find(y => y.d === L.d - n); return x ? x.v : null; };
    let run = 0; for (let i = F.length - 1; i >= 0 && ixOf(F[i]) === idx; i--) run++;
    const y1 = F.filter(x => x.d > L.d - 365).map(x => x.v), lo = Math.min(...y1), hi = Math.max(...y1), rank = F.filter(x => x.v < L.v).length / F.length;
    // øverst: måler og noen få tall
    const top = el('div', 'card fngtop'), g = el('div', 'stack'); g.style.justifyItems = 'center'; g.append(gauge(L.v, idx), el('span', 'pill big', CL[idx][1])); g.lastChild.style.background = CL[idx][2] + '22'; g.lastChild.style.color = CL[idx][2];
    const k = el('div', 'kpis'); const kpi = (a, b, c) => { const d = el('div', 'kpi'); d.append(el('span', 'k', a), el('span', 'v', b), el('span', 's', c || '')); return d; };
    k.append(kpi('I går', nf(back(1)), ''), kpi('For en uke siden', nf(back(7)), ''), kpi('For en måned siden', nf(back(30)), ''),
      kpi(`${CL[idx][1]} på rad`, `${run} ${run === 1 ? 'dag' : 'dager'}`, ''), kpi('Siste år', `${lo}–${hi}`, 'laveste – høyeste'), kpi('Lavere enn i dag', `${nf(rank * 100, { maximumFractionDigits: 0 })} %`, 'av alle dager siden 2018'));
    top.append(g, k);
    // graf
    const gc = el('div', 'card'), hd = el('div', 'row'); hd.append(el('h2', null, 'Stemningen og Bitcoin-kursen'));
    const seg = el('div', 'seg'); ['1Å', '3Å', 'Alt'].forEach(r => { const b = el('button', null, { '1Å': '1 år', '3Å': '3 år', Alt: 'Alt' }[r]); b.type = 'button'; b.setAttribute('aria-pressed', r === S.rng ? 'true' : 'false'); b.addEventListener('click', () => { S.rng = r; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); setRange(); }); seg.append(b); });
    hd.append(seg); const host = el('div', 'stack'); host.style.gap = '0'; host.id = 'fng-chart';
    const lg = el('div', 'legend'); CL.forEach(c => { const s = el('span'), d = el('span', 'dot'); d.style.background = c[2]; d.style.marginRight = '6px'; s.append(d, document.createTextNode(c[1])); lg.append(s); });
    { const s = el('span'), i = el('i'); i.style.borderTopColor = css('--fg'); s.append(i, document.createTextNode('Bitcoin (loggskala, øverst)')); lg.append(s); }
    gc.append(hd, host, lg);
    // tabell
    const tc = el('div', 'card'); tc.append(el('h2', null, 'Hva skjedde med Bitcoin etterpå?'), el('p', 'muted small', 'Median endring etter alle dager med hver stemning, og hvor ofte kursen var høyere.'), table(idx),
      el('p', 'muted small', 'Dager på rad ligner hverandre, så det reelle antallet uavhengige tilfeller er mye lavere enn antall dager. Historikk, ikke prognose.'));
    root.replaceChildren(top, gc, tc, el('p', 'muted small', `Kilde: alternative.me (fra ${dm(F[0].d * DAY)}, sist ${dm(L.d * DAY)}) og Binance. Indeksen bygger på volatilitet, volum, sosiale medier, dominans og søk.`));
    requestAnimationFrame(() => chart(host));
  }
  function render() { if (typeof KL === 'undefined') return; load(); draw(); }
  window.FNG = { render, _S: S };
})();
