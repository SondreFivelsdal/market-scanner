// Fanen «Teknisk analyse»: leter etter strukturer i grafen (markedsstruktur, Wyckoff, mønstre, trekanter/kiler, RSI-divergens)
// med faste regler fra site/ta.js, tegner dem i grafen og viser hva som skjedde de tidligere gangene samme struktur slo til.
(() => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const NS = 'http://www.w3.org/2000/svg';
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const price = v => v == null || !isFinite(v) ? '–' : (v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) : v >= 1 ? nf(v, { maximumFractionDigits: 2 }) : nf(v, { maximumSignificantDigits: 3 })) + ' $';
  const pct = v => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v * 100), { maximumFractionDigits: 0 }) + ' %';
  const dm = t => new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const TFS = { '4h': ['4 timer', 3, 144e5], '1d': ['1 dag', 4, 864e5], '1w': ['1 uke', 1, 6048e5] };
  const SHOW = { st: 'Struktur', wy: 'Wyckoff', pat: 'Mønstre' };
  const S = { sym: null, tf: '1d', show: { st: true, wy: true, pat: true }, B: null, A: null, H: {}, built: false, C: null, D: null, err: null, load: 0 };
  try { const s = JSON.parse(localStorage.getItem('ms-ta') || '{}'); if (TFS[s.tf]) S.tf = s.tf; if (s.show) Object.assign(S.show, s.show); } catch (e) { /* ingen lagring */ }
  const save = () => { try { localStorage.setItem('ms-ta', JSON.stringify({ tf: S.tf, show: S.show })); } catch (e) { /* ignorer */ } };
  const NAME = { db: 'Dobbel bunn', dt: 'Dobbel topp', ihs: 'Invers hode-og-skuldre', hs: 'Hode-og-skuldre', asc: 'Stigende trekant', desc: 'Fallende trekant', sym: 'Symmetrisk trekant', rwedge: 'Stigende kile', fwedge: 'Fallende kile', chup: 'Stigende kanal', chdn: 'Fallende kanal', rng: 'Sidelengs kanal' };
  const BULL = { db: 1, ihs: 1, asc: 1, fwedge: 1, dt: -1, hs: -1, desc: -1, rwedge: -1 };
  const ST = { forming: ['Dannes', 'warn'], confirmed: ['Bekreftet', ''], failed: ['Feilet', 'muted'] };

  // ---------------------------------------------------------------- graf
  function makeChart(host) {
    const LW = window.LightweightCharts; if (!LW) return null;
    const ch = LW.createChart(host, { autoSize: true, localization: { locale: 'nb-NO', dateFormat: 'dd.MM.yy' }, layout: { background: { type: 'solid', color: css('--panel') }, textColor: css('--muted'), fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 12 },
      grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line'), mode: 1 }, timeScale: { borderColor: css('--line'), rightOffset: 8 }, crosshair: { mode: 0 } });
    const up = css('--up'), dn = css('--down'), candle = ch.addCandlestickSeries({ upColor: up, downColor: dn, wickUpColor: up, wickDownColor: dn, borderVisible: false });
    host.style.position = 'relative'; const layer = el('div', 'zlayer'); host.append(layer);
    const C = { ch, candle, layer }; ch.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(overlay));
    C.D = window.DRAW ? DRAW.create({ ch, series: candle, host, bars: () => S.B, step: () => TFS[S.tf][2], key: () => S.sym, onScale: () => overlay() }) : null;
    return C;
  }
  const ts = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60;
  function paint() {
    const C = S.C, B = S.B, A = S.A; if (!C || !B) return; const p = B[B.length - 1].c, pr = p >= 1000 ? 0 : p >= 100 ? 1 : p >= 1 ? 3 : 5;
    C.candle.applyOptions({ priceFormat: { type: 'price', precision: pr, minMove: Math.pow(10, -pr) } });
    C.candle.setData(B.map(b => ({ time: ts(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    const mk = [];
    if (A && S.show.st) for (const x of A.st.piv.slice(-14)) mk.push({ time: ts(x.t), position: x.type === 'H' ? 'aboveBar' : 'belowBar', color: css('--muted'), shape: 'circle', size: 0.1, text: x.lab });
    if (A && S.show.wy && A.wy) { const lowEv = A.wy.kind === 'acc' ? ['SC', 'ST', 'Spring', 'LPS'] : ['AR', 'SOW'];
      for (const [k, v] of Object.entries(A.wy.ev)) { if (!B[v.i]) continue; const below = lowEv.includes(k);
        mk.push({ time: ts(B[v.i].t), position: below ? 'belowBar' : 'aboveBar', color: A.wy.kind === 'acc' ? css('--up') : css('--down'), shape: below ? 'arrowUp' : 'arrowDown', text: k }); } }
    mk.sort((a, b) => a.time - b.time); const seen = new Map(); for (const m of mk) { const k = m.time + m.position; if (seen.has(k)) { seen.get(k).text += ' · ' + m.text; m.drop = true; } else seen.set(k, m); }
    C.candle.setMarkers(mk.filter(m => !m.drop));
    if (C.k !== S.sym + S.tf) { C.k = S.sym + S.tf; const n = B.length; C.ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - (S.tf === '1w' ? 260 : 220)), to: n + 6 }); }
    requestAnimationFrame(overlay); if (C.D) C.D.refresh();
  }
  // strekene: BOS/CHoCH, Wyckoff-rangen, mønstre, trekanter og divergens. Tegnes i SVG med koordinater fra grafen.
  function overlay() {
    const C = S.C, B = S.B, A = S.A; if (!C || !B || !A) return; const ch = C.ch, w = ch.timeScale().width(), h = C.layer.clientHeight - (ch.timeScale().height ? ch.timeScale().height() : 28);
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', w); svg.setAttribute('height', Math.max(0, h));
    const X = i => ch.timeScale().logicalToCoordinate(i), Y = p => C.candle.priceToCoordinate(p);
    const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); svg.append(e); return e; };
    const seg = (a, b, col, o = {}) => { const x1 = X(a.i), x2 = X(b.i), y1 = Y(a.p), y2 = Y(b.p); if ([x1, x2, y1, y2].some(v => v == null)) return; mk('line', Object.assign({ x1, x2, y1, y2, stroke: col, 'stroke-width': 1.6 }, o)); };
    const txt = (i, p, s, col, o = {}) => { const x = X(i), y = Y(p); if (x == null || y == null) return; const t = mk('text', Object.assign({ x, y, fill: col, 'font-size': 11, 'font-weight': 600 }, o)); t.textContent = s; };
    if (S.show.st) for (const b of A.st.breaks.slice(-4)) { const col = b.dir > 0 ? css('--up') : css('--down'); seg({ i: b.from, p: b.level }, { i: b.i, p: b.level }, col, { 'stroke-dasharray': b.kind === 'CHoCH' ? '' : '4 3' }); txt((b.from + b.i) / 2, b.level, b.kind, col, { 'text-anchor': 'middle', dy: b.dir > 0 ? -4 : 12 }); }
    if (S.show.wy && A.wy && A.wy.top != null) { const W = A.wy, col = W.kind === 'acc' ? css('--up') : css('--down'), x1 = X(W.from), x2 = X(Math.max(W.from + 1, W.ev.SOS || W.ev.SOW ? (W.ev.SOS || W.ev.SOW).i : W.to)), y1 = Y(W.top), y2 = Y(W.bot);
      if ([x1, x2, y1, y2].every(v => v != null)) { mk('rect', { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), fill: col, 'fill-opacity': 0.07, stroke: col, 'stroke-opacity': 0.5, 'stroke-dasharray': '5 4' });
        const t = mk('text', { x: Math.min(x1, x2) + 6, y: Math.min(y1, y2) + 14, fill: col, 'font-size': 11.5, 'font-weight': 700 }); t.textContent = `${W.kind === 'acc' ? 'Akkumulering' : 'Fordeling'} · fase ${W.phase}`; } }
    if (S.show.pat) { for (const p of latestPats(A)) { const col = BULL[p.type] > 0 ? css('--up') : css('--down'); for (let k = 0; k + 1 < p.pts.length; k++) seg(p.pts[k], p.pts[k + 1], col, { 'stroke-width': 1.4, opacity: 0.8 });
        seg(p.neck.a, p.neck.b, col, { 'stroke-dasharray': '6 4' }); txt(p.neck.b.i, p.neck.b.p, NAME[p.type], col, { 'text-anchor': 'end', dy: -5 }); }
      if (A.sh) { const col = BULL[A.sh.type] > 0 ? css('--up') : BULL[A.sh.type] < 0 ? css('--down') : css('--blue'); seg(A.sh.up.a, A.sh.up.b, col); seg(A.sh.lo.a, A.sh.lo.b, col); txt(A.sh.up.b.i, A.sh.up.b.p, NAME[A.sh.type], col, { 'text-anchor': 'end', dy: -5 }); }
      for (const d of A.div) { const col = d.type === 'bull' ? css('--up') : css('--down'); seg(d.a, d.b, col, { 'stroke-width': 2, opacity: 0.8 }); txt(d.b.i, d.b.p, 'Divergens', col, { 'text-anchor': 'middle', dy: d.type === 'bull' ? 18 : -10 }); } }
    C.layer.replaceChildren(svg);
  }
  // nyeste mønster av hver type (unngår doble streker når to nesten like mønstre deler svingpunkter)
  function latestPats(A) { const by = {}; for (const p of A.pat) if (!by[p.type] || p.pts[p.pts.length - 1].i > by[p.type].pts[by[p.type].pts.length - 1].i) by[p.type] = p; return Object.values(by); }

  // ---------------------------------------------------------------- funn i klartekst
  function hist(key) {
    const H = S.H[S.sym + S.tf]; if (!H) return el('span', 'muted small', 'Regner ut historikk …'); const k = H.stats.kinds[key], b = H.stats.base, nm = window.NAMES ? NAMES[S.sym] || S.sym : S.sym;
    if (!k || !k[90].n) return el('span', 'muted small', `Før: ikke funnet tidligere for ${nm} på denne tidsrammen.`);
    const s = el('span', 'small'); s.append(el('b', null, `Før: ${k.n} ${k.n === 1 ? 'gang' : 'ganger'}. `), document.createTextNode(`3 mnd etter: ${pct(k[90].med)} median, opp i ${nf(k[90].up * 100, { maximumFractionDigits: 0 })} % (vanlig: ${pct(b[90].med)}, ${nf(b[90].up * 100, { maximumFractionDigits: 0 })} %).`));
    if (k[90].n < 6) s.append(el('span', 'muted', ' Få tilfeller.')); return s;
  }
  function items(A) {
    const out = [];
    // markedsstruktur
    { const t = A.st.trend, lb = A.st.last, pill = t === 'up' ? ['Opptrend', 'up'] : t === 'down' ? ['Nedtrend', 'down'] : ['Sidelengs', 'warn'];
      const line = (t === 'up' ? 'Høyere topper og bunner.' : t === 'down' ? 'Lavere topper og bunner.' : 'Blandede topper og bunner – ingen klar trend.') + (lb ? ` Siste brudd: ${lb.kind} ${lb.dir > 0 ? 'opp over' : 'ned under'} ${price(lb.level)} (${dm(lb.t)}).` : '');
      out.push({ k: 'Markedsstruktur', pill, line, hk: lb && lb.kind === 'CHoCH' ? (lb.dir > 0 ? 'ch_up' : 'ch_dn') : null }); }
    // Wyckoff
    if (A.wy) { const W = A.wy, acc = W.kind === 'acc', E = W.ev, ph = W.phase;
      const T = acc ? { A: `Salgsklimaks ${price(E.SC.p)} – venter på reaksjon.`, B: `Bygger en range mellom ${price(W.bot)} og ${price(W.top)}.`, C: `Spring: stakk under ${price(W.bot)} og kom tilbake.`, D: `Lukket over toppen av rangen (${price(W.top)}) – styrketegn.`, E: 'Har forlatt rangen oppover.' }
        : { A: `Kjøpsklimaks ${price(E.BC.p)} – venter på reaksjon.`, B: `Bygger en range mellom ${price(W.bot)} og ${price(W.top)}.`, C: `UTAD: stakk over ${price(W.top)} og falt tilbake.`, D: `Lukket under bunnen av rangen (${price(W.bot)}) – svakhetstegn.`, E: 'Har forlatt rangen nedover.' };
      let line = T[ph]; if (W.failed) line = acc ? `Rangen er brutt ned (under ${price(W.bot)}) – ikke lenger akkumulering.` : `Rangen er brutt opp (over ${price(W.top)}) – ikke lenger fordeling.`;
      else if (W.back) line += ' Men kursen er tilbake inne i rangen.';
      const hk = ph === 'C' ? (acc ? 'wyA_C' : 'wyD_C') : ph === 'D' || ph === 'E' ? (acc ? 'wyA_D' : 'wyD_D') : null;
      out.push({ k: `Wyckoff-${acc ? 'akkumulering' : 'fordeling'}`, pill: [W.failed ? 'Brutt' : `Fase ${ph}`, W.failed ? 'muted' : acc ? 'up' : 'down'], line, sub: `Funnet: ${Object.keys(E).join(' · ')}`, hk }); }
    else out.push({ k: 'Wyckoff', pill: ['Ingen', 'muted'], line: 'Ingen tydelig akkumulering eller fordeling i perioden.' });
    // mønstre
    for (const p of latestPats(A)) { const [s, c] = ST[p.st], dir = BULL[p.type];
      out.push({ k: NAME[p.type], pill: [s, p.st === 'confirmed' ? (dir > 0 ? 'up' : 'down') : c], line: `Halsen ${price(p.neck.b.p)}. ${p.st === 'failed' ? 'Mønsteret holdt ikke.' : `Mål ved brudd ${price(p.target)}, ugyldig ${dir > 0 ? 'under' : 'over'} ${price(p.stop)}.`}`, hk: p.type }); }
    if (A.sh) { const s = A.sh, dir = BULL[s.type];
      out.push({ k: NAME[s.type], pill: s.br ? [s.br.dir > 0 ? 'Brudd opp' : 'Brudd ned', s.br.dir > 0 ? 'up' : 'down'] : ['Inne i mønsteret', 'warn'], line: `Tak ${price(s.up.b.p)}, gulv ${price(s.lo.b.p)}.${dir ? ` Bryter oftest ${dir > 0 ? 'opp' : 'ned'} ifølge læreboka.` : ''}`, hk: s.br ? (s.br.dir > 0 ? 'br_up' : 'br_dn') : null }); }
    for (const d of A.div) out.push({ k: d.type === 'bull' ? 'Positiv RSI-divergens' : 'Negativ RSI-divergens', pill: [d.type === 'bull' ? 'Mulig bunn' : 'Mulig topp', d.type === 'bull' ? 'up' : 'down'],
      line: `Kursen lagde ${d.type === 'bull' ? 'lavere bunn' : 'høyere topp'}, men RSI ${d.type === 'bull' ? 'høyere' : 'lavere'} (${nf(d.ra, { maximumFractionDigits: 0 })} → ${nf(d.rb, { maximumFractionDigits: 0 })}).`, hk: d.type === 'bull' ? 'dv_bull' : 'dv_bear' });
    if (!A.pat.length && !A.sh && !A.div.length) out.push({ k: 'Mønstre', pill: ['Ingen', 'muted'], line: 'Ingen klassiske mønstre akkurat nå.' });
    return out;
  }
  function drawItems() {
    const box = document.getElementById('ta-items'); if (!box || !S.A) return;
    box.replaceChildren(...items(S.A).map(x => { const d = el('div', 'taitem'), top = el('div', 'row'); top.append(el('b', null, x.k), el('span', 'pill ' + (x.pill[1] || ''), x.pill[0]));
      d.append(top, el('span', null, x.line)); if (x.sub) d.append(el('span', 'muted small', x.sub)); if (x.hk) d.append(hist(x.hk)); return d; }));
  }

  // ---------------------------------------------------------------- kortsiktige regler per tidsramme (flyttet fra Oversikt)
  function drawRules() {
    const box = document.getElementById('ta-rules'), det = document.getElementById('ta-rules-d'); if (!box || !det || !det.open) return; const sym = S.sym;
    box.replaceChildren(el('p', 'muted small', 'Henter …'));
    Promise.all(['1h', '4h', '1d'].map(tf => KL.all(sym, tf, 1).catch(() => null))).then(R => { if (sym !== S.sym) return;
      const t = el('table', 't'), hr = el('tr'); ['Tidsramme', 'Retning', 'Regelscore', 'RSI', 'ADX', 'Regime'].forEach((h, i) => hr.append(el('th', i === 0 || i === 5 ? 'l' : '', h))); t.append(hr);
      R.forEach((B, k) => { const x = el('tr'); x.append(el('td', 'l', ['1 time', '4 timer', '1 dag'][k]));
        const a = B ? RG.assess(B, KL.closedEnd(B)) : { ok: false, why: 'ikke tilgjengelig' }; if (!a.ok) { const d = el('td', 'l muted', a.why); d.colSpan = 5; x.append(d); t.append(x); return; }
        const b = { long: ['▲ opp', 'up'], short: ['▼ ned', 'down'], neutral: ['– nøytral', ''] }[a.bias];
        x.append(el('td', b[1], b[0]), el('td', null, (a.score > 0 ? '+' : a.score < 0 ? '−' : '') + Math.abs(a.score) + ' av ±5'), el('td', null, nf(a.rsi, { maximumFractionDigits: 0 })), el('td', null, nf(a.adx, { maximumFractionDigits: 0 })), el('td', 'l', a.regime)); t.append(x); });
      const tw = el('div', 'tw'); tw.append(t); box.replaceChildren(tw, el('p', 'muted small', 'Fem enkle regler (kurs over 50-linja, 20 over 50, 50-linja stiger, MACD over 0, RSI over 50). Ikke en sannsynlighet – slike kortsiktige signaler har ikke gitt fortjeneste i våre tester.')); });
  }

  // ---------------------------------------------------------------- oppsett og lasting
  function build(root) {
    root.replaceChildren();
    const ctl = el('div', 'stack'); ctl.style.gap = '10px'; const sc = el('div', 'seg'); sc.id = 'ta-coins'; const st = el('div', 'seg'); st.id = 'ta-tf'; ctl.append(sc, st);
    const kp = el('div', 'kpis'); kp.id = 'ta-kpis';
    const card = el('div', 'card'), bar = el('div', 'tbar'); bar.id = 'ta-bar'; const chips = el('div', 'tgroup'); chips.id = 'ta-show';
    const host = el('div', 'chart'); host.id = 'ta-chart'; const lg = el('div', 'legend'); lg.id = 'ta-legend'; const stat = el('p', 'muted small'); stat.id = 'ta-status';
    card.append(bar, host, lg, stat);
    const found = el('div', 'card'); found.append(el('h2', null, 'Funnet nå'), Object.assign(el('div', 'taitems'), { id: 'ta-items' }));
    const gl = el('details', 'more'); gl.append(el('summary', null, 'Hva betyr ordene?')); const gi = el('div', 'in'); gl.append(gi);
    const ul = el('ul', 'plain small'); [['HH / HL / LH / LL', 'Høyere topp, høyere bunn, lavere topp, lavere bunn. Opptrend = HH + HL.'], ['BOS', 'Brudd i strukturen: lukk forbi forrige topp/bunn i trendens retning.'], ['CHoCH', 'Skifte i karakter: første brudd mot trenden – tidlig tegn på trendskifte.'],
      ['Wyckoff', 'Store aktører samler opp (akkumulering) eller selger ut (fordeling) i en range. Fase A stopp → B range → C test (spring/UTAD) → D brudd → E trend.'],
      ['SC / BC, AR, ST', 'Salgs-/kjøpsklimaks, automatisk reaksjon (rangens andre kant) og sekundær test.'], ['Spring / UTAD', 'Falskt brudd under bunnen / over toppen som raskt snur.'], ['SOS / SOW, LPS / LPSY', 'Styrke-/svakhetstegn (lukk ut av rangen) og siste test før trenden.']]
      .forEach(([a, b]) => { const li = el('li'); li.append(el('b', null, a + ': '), document.createTextNode(b)); ul.append(li); });
    gi.append(ul, el('p', 'muted small', 'Reglene er faste og laget på forhånd. Et svingpunkt er først kjent 5 lys (3 på ukegraf) etter at det skjedde, så strukturen kommer alltid litt etter. «Før» regnes på samme coin og tidsramme med bare data som var kjent da.'));
    const rd = el('details', 'more'); rd.id = 'ta-rules-d'; rd.append(el('summary', null, 'Kortsiktige regler per tidsramme')); const ri = el('div', 'in'); ri.id = 'ta-rules'; rd.append(ri); rd.addEventListener('toggle', drawRules);
    root.append(ctl, kp, card, found, gl, rd, el('div', 'note', 'Mønstre er tolkninger, ikke garantier. Se «Før»-linjene: mange av dem har ikke slått en vanlig dag.'));
    S.C = makeChart(host); if (S.C && S.C.D) bar.append(S.C.D.toolbar()); bar.append(chips);
  }
  function controls() {
    const L = window.COINS || ['BTC'], n = window.NAMES || {}, sc = document.getElementById('ta-coins'), st = document.getElementById('ta-tf'), sh = document.getElementById('ta-show');
    sc.replaceChildren(...L.map(s => { const b = el('button', null, n[s] ? `${n[s]}` : s); b.type = 'button'; b.setAttribute('aria-pressed', s === S.sym ? 'true' : 'false'); b.addEventListener('click', () => { dash.setParams({ coin: s }); }); return b; }));
    st.replaceChildren(...Object.entries(TFS).map(([k, [l]]) => { const b = el('button', null, l); b.type = 'button'; b.setAttribute('aria-pressed', k === S.tf ? 'true' : 'false'); b.addEventListener('click', () => { S.tf = k; save(); controls(); load(); }); return b; }));
    sh.replaceChildren(...Object.entries(SHOW).map(([k, l]) => { const lb = el('label', 'chip sm'), i = el('input'); i.type = 'checkbox'; i.checked = !!S.show[k]; i.addEventListener('change', () => { S.show[k] = i.checked; save(); paint(); }); lb.append(i, document.createTextNode(l)); return lb; }));
  }
  function kpis() {
    const box = document.getElementById('ta-kpis'); if (!box) return; const A = S.A;
    const kpi = (k, v, c, s) => { const d = el('div', 'kpi'); d.append(el('span', 'k', k), el('span', 'v ' + (c || ''), v), el('span', 's', s || '')); return d; };
    if (!A) { box.replaceChildren(kpi('Struktur', S.err ? 'Ikke tilgjengelig' : 'Henter …', 'muted')); return; }
    const t = A.st.trend, W = A.wy, pats = latestPats(A).filter(p => p.st !== 'failed'), sh = A.sh;
    box.replaceChildren(kpi('Struktur', t === 'up' ? 'Opptrend' : t === 'down' ? 'Nedtrend' : 'Sidelengs', t === 'up' ? 'up' : t === 'down' ? 'down' : 'warn', A.st.last ? `Siste: ${A.st.last.kind} ${A.st.last.dir > 0 ? 'opp' : 'ned'}` : ''),
      kpi('Wyckoff', W && !W.failed ? `${W.kind === 'acc' ? 'Akkumulering' : 'Fordeling'} ${W.phase}` : 'Ingen', W && !W.failed ? (W.kind === 'acc' ? 'up' : 'down') : 'muted', W && W.back ? 'Tilbake i rangen' : ''),
      kpi('Mønster', pats.length ? NAME[pats[pats.length - 1].type] : sh ? NAME[sh.type] : 'Ingen', '', pats.length ? ST[pats[pats.length - 1].st][0] : sh ? (sh.br ? 'Brutt ' + (sh.br.dir > 0 ? 'opp' : 'ned') : 'Inne i mønsteret') : ''),
      kpi('RSI-divergens', A.div.length ? (A.div[0].type === 'bull' ? 'Positiv' : 'Negativ') : 'Ingen', A.div.length ? (A.div[0].type === 'bull' ? 'up' : 'down') : 'muted', ''));
  }
  function legend() { const box = document.getElementById('ta-legend'); if (!box) return; const it = (c, t, dash2) => { const s = el('span'), i = el('i'); i.style.borderTopColor = c; if (dash2) i.style.borderTopStyle = 'dashed'; s.append(i, document.createTextNode(t)); return s; };
    box.replaceChildren(it(css('--up'), 'Bullish'), it(css('--down'), 'Bearish'), it(css('--axis'), 'Halslinje / BOS', true), el('span', null, 'Loggskala · tegneverktøyene er felles med Oversikt')); }
  function load() {
    const sym = S.sym, tf = S.tf, id = ++S.load; S.err = null; const stat = document.getElementById('ta-status'); if (stat) stat.textContent = 'Henter kurser …';
    KL.all(sym, tf, TFS[tf][1]).then(B => { if (id !== S.load) return; const e = KL.closedEnd(B); S.B = B; S.A = e > 120 ? TA.analyze(B, e, tf) : null;
      if (stat) stat.textContent = `Kilde: Binance · ${B.length} lys fra ${dm(B[0].t)} · analyse på lukkede lys (siste ${dm(B[e].t)})`;
      paint(); kpis(); drawItems(); legend();
      const hk = sym + tf; if (!S.H[hk] && e > 400) setTimeout(() => { if (id !== S.load) return; try { S.H[hk] = TA.history(B.slice(0, e + 1), tf); } catch (x) { console.error(x); } drawItems(); }, 60); })
      .catch(err => { if (id !== S.load) return; S.err = String(err.message || err); S.A = null; if (stat) stat.textContent = 'Kursdata er ikke tilgjengelig akkurat nå (Binance svarte ikke).'; kpis(); });
    drawRules();
  }
  function render() {
    const root = document.getElementById('ta-in'); if (!root || typeof TA === 'undefined' || typeof KL === 'undefined') return;
    if (!S.built) { S.built = true; build(root); }
    const p = dash.params(), L = window.COINS || ['BTC'], sym = p.coin && L.includes(p.coin) ? p.coin : S.sym || L[0];
    if (sym !== S.sym) { S.sym = sym; controls(); load(); } else controls();
  }
  window.TAUI = { render, _S: S };
})();
