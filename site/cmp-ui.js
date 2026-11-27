// Fanen «Sammenlign»: krypto, aksjeindekser, edelmetaller og olje i samme graf, normalisert til 0 % ved periodens start,
// med avkastning, verste fall, volatilitet og korrelasjon. Kursene er de samme dagsseriene som «Historikk» bruker (data/events.json).
(() => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const pct = (v, d = 0) => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v * 100), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  const cls = v => v == null ? 'muted' : v > 0 ? 'up' : v < 0 ? 'down' : '';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const DAY = 864e5, PAL = ['#f7931a', '#4c8dff', '#26a69a', '#a78bfa', '#ef5350', '#e0a33a', '#9ca3af', '#d6336c', '#2aa198', '#c084fc', '#84cc16'];
  const RNG = { '1M': 30, '3M': 91, '6M': 182, YTD: 'ytd', '1Å': 365, '3Å': 1095, '5Å': 1826, '10Å': 3652, Alt: 'all' };
  const FQ = { d: ['Daglig', 1], w: ['Ukentlig', 7], m: ['Månedlig', 30] };
  const S = { sel: ['BTC', 'GOLD', 'SPX', 'NDX'], rng: '1Å', fq: 'w', log: true, ser: {}, ch: null, rc: null, sig: null };
  try { const s = JSON.parse(localStorage.getItem('ms-cmp') || '{}'); if (Array.isArray(s.sel) && s.sel.length) S.sel = s.sel; if (RNG[s.rng]) S.rng = s.rng; if (FQ[s.fq]) S.fq = s.fq; if (s.log != null) S.log = s.log; } catch (e) { /* ingen lagring */ }
  const save = () => { try { localStorage.setItem('ms-cmp', JSON.stringify({ sel: S.sel, rng: S.rng, fq: S.fq, log: S.log })); } catch (e) { /* ignorer */ } };
  function ser(m, k) { if (S.ser[k]) return S.ser[k]; const A = m.assets[k]; if (!A) return null; const t = []; let p = 0; for (const x of A.t) { p += x; t.push(p); } return (S.ser[k] = { t, c: A.c, name: A.name, kind: A.kind, src: A.src }); }
  const at = (T, d) => { let lo = 0, hi = T.t.length - 1; if (d < T.t[0]) return -1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T.t[m] <= d) lo = m; else hi = m - 1; } return lo; };
  // periodens start (dag) ut fra siste felles dag
  function span(m) { const T = S.sel.map(k => ser(m, k)).filter(Boolean); if (!T.length) return null; const end = Math.min(...T.map(x => x.t[x.t.length - 1])), first = Math.max(...T.map(x => x.t[0])), r = RNG[S.rng];
    const from = r === 'all' ? first : r === 'ytd' ? Date.UTC(new Date(end * DAY).getUTCFullYear(), 0, 1) / DAY - 1 : end - r; return { from: Math.max(first, from), end }; }
  // avkastning per periode (dag/uke/måned), bare perioder der alle valgte har kurs
  function buckets(T, sp, fq) { const out = new Map(); for (let i = 0; i < T.t.length; i++) { const d = T.t[i]; if (d < sp.from || d > sp.end) continue; const k = fq === 'd' ? d : fq === 'w' ? Math.floor((d + 3) / 7) : new Date(d * DAY).getUTCFullYear() * 12 + new Date(d * DAY).getUTCMonth(); out.set(k, T.c[i]); } return out; }
  function rets(bk, keys) { const r = []; for (let i = 1; i < keys.length; i++) r.push(Math.log(bk.get(keys[i]) / bk.get(keys[i - 1]))); return r; }
  function corr(a, b) { const n = Math.min(a.length, b.length); if (n < 8) return null; let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; } const ma = sa / n, mb = sb / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return va && vb ? c / Math.sqrt(va * vb) : null; }

  function render() {
    const root = document.getElementById('cmp-in'); if (!root) return; const d = dash.data('events'), m = d && d.status === 'ok' ? d.data : null;
    if (!m) { root.replaceChildren(el('p', 'muted', d && d.status === 'error' ? 'Kursdataene er ikke tilgjengelige akkurat nå.' : 'Henter kurser …')); return; }
    S.sel = S.sel.filter(k => m.assets[k]); if (!S.sel.length) S.sel = m.order.slice(0, 2);
    const sig = `${m.built}|${S.sel.join(',')}|${S.rng}|${S.fq}|${S.log}`; if (sig === S.sig && root.childElementCount) return; S.sig = sig;
    // velger: grupper, flervalg
    const pick = el('div', 'cmpsel'), KN = { krypto: 'Krypto', aksjer: 'Indekser', 'råvarer': 'Metaller og råvarer' };
    for (const [kd, kn] of Object.entries(KN)) { const ks = m.order.filter(k => m.assets[k].kind === kd); if (!ks.length) continue; const g = el('div', 'tgroup'); g.append(el('span', 'glab', kn));
      ks.forEach(k => { const on = S.sel.includes(k), b = el('button', 'tb', m.assets[k].name); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (on) { const i = S.sel.indexOf(k); b.style.boxShadow = `inset 0 -2px 0 ${PAL[i % PAL.length]}`; }
        b.addEventListener('click', () => { if (on) { if (S.sel.length > 1) S.sel = S.sel.filter(x => x !== k); } else if (S.sel.length < 8) S.sel = [...S.sel, k]; save(); render(); }); g.append(b); }); pick.append(g); }
    const missing = ['OSEBX', 'SILVER'].filter(k => !m.assets[k]); if (missing.length) pick.append(el('span', 'muted small', `Ikke tilgjengelig ennå: ${missing.map(k => ({ OSEBX: 'Oslo Børs', SILVER: 'Sølv' })[k]).join(', ')} (hentes ved neste dataoppdatering).`));
    const bar = el('div', 'tbar'), rg = el('div', 'tgroup'); Object.keys(RNG).forEach(r => { const b = el('button', 'tb', r); b.type = 'button'; b.setAttribute('aria-pressed', r === S.rng ? 'true' : 'false'); b.addEventListener('click', () => { S.rng = r; save(); render(); }); rg.append(b); });
    const fq = el('div', 'tgroup'); Object.entries(FQ).forEach(([k, [l]]) => { const b = el('button', 'tb', l); b.type = 'button'; b.title = 'Avkastningsperiode for volatilitet og korrelasjon'; b.setAttribute('aria-pressed', k === S.fq ? 'true' : 'false'); b.addEventListener('click', () => { S.fq = k; save(); render(); }); fq.append(b); });
    const lg = el('button', 'tb', 'log'); lg.type = 'button'; lg.setAttribute('aria-pressed', S.log ? 'true' : 'false'); lg.addEventListener('click', () => { S.log = !S.log; save(); render(); });
    bar.append(rg, el('span', 'tsep'), fq, el('span', 'grow'), lg);
    const sp = span(m); const card = el('div', 'card tight'); const host = el('div', 'cmpchart'); card.append(bar, host);
    if (!sp) { root.replaceChildren(pick, card); return; }
    // statistikk og korrelasjon
    const T = S.sel.map(k => ser(m, k)), bk = T.map(x => buckets(x, sp, S.fq)), keys = [...bk[0].keys()].filter(k => bk.every(b => b.has(k))).sort((a, b) => a - b), R = bk.map(b => rets(b, keys)), per = { d: 252, w: 52, m: 12 }[S.fq];
    const st = el('table', 't compact'), sh = el('tr'); ['', 'Avkastning', 'Verste fall', 'Volatilitet (år)', ...(S.sel.includes('BTC') ? ['Korr. med BTC'] : [])].forEach((x, i) => sh.append(el('th', i ? '' : 'l', x))); st.append(sh);
    T.forEach((x, i) => { const i0 = at(x, sp.from - 1) + 1, i1 = at(x, sp.end); let pk = 0, dd = 0; for (let j = i0; j <= i1; j++) { pk = Math.max(pk, x.c[j]); dd = Math.min(dd, x.c[j] / pk - 1); }
      const r = R[i], mu = r.reduce((a, b) => a + b, 0) / (r.length || 1), sd = Math.sqrt(r.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, r.length - 1)) * Math.sqrt(per), bi = S.sel.indexOf('BTC');
      const tr = el('tr'), n = el('td', 'l'), dot = el('span', 'dot'); dot.style.background = PAL[i % PAL.length]; n.append(dot, document.createTextNode(' ' + x.name)); const rv = x.c[i1] / x.c[i0] - 1;
      tr.append(n, el('td', cls(rv), pct(rv)), el('td', 'down', pct(dd)), el('td', null, r.length > 3 ? nf(sd * 100, { maximumFractionDigits: 0 }) + ' %' : '–')); if (bi >= 0) tr.append(el('td', null, i === bi ? '–' : nf(corr(R[bi], r), { maximumFractionDigits: 2 }))); st.append(tr); });
    const cm = el('table', 't compact corr'), ch = el('tr'); ch.append(el('th')); T.forEach(x => ch.append(el('th', null, x.name))); cm.append(ch);
    T.forEach((x, i) => { const tr = el('tr'); tr.append(el('td', 'l', x.name)); T.forEach((y, j) => { const c = i === j ? 1 : corr(R[i], R[j]), td = el('td', null, c == null ? '–' : nf(c, { maximumFractionDigits: 2 })); if (c != null && i !== j) td.style.background = `color-mix(in srgb, ${c > 0 ? css('--up') : css('--down')} ${Math.round(Math.abs(c) * 45)}%, transparent)`; tr.append(td); }); cm.append(tr); });
    const s1 = el('div', 'card tight'), s2 = el('div', 'card tight'), tw1 = el('div', 'tw'), tw2 = el('div', 'tw'); tw1.append(st); tw2.append(cm);
    s1.append(el('h3', null, 'Nøkkeltall'), tw1); s2.append(el('h3', null, `Korrelasjon (${FQ[S.fq][0].toLowerCase()} avkastning, ${keys.length - 1} perioder)`), tw2, el('p', 'muted small', 'Korrelasjon viser om kursene har beveget seg i takt – ikke at det ene påvirker det andre. Bare perioder der alle valgte markeder har kurs er med.'));
    const g = el('div', 'dgrid even'); g.append(s1, s2);
    root.replaceChildren(pick, card, g, el('p', 'muted small', `Kilder: ${[...new Set(T.map(x => x.src).filter(Boolean))].join(' · ')} · dagslukk. Normalisert = 0 % ved periodens start (${new Date(sp.from * DAY).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })}).`));
    requestAnimationFrame(() => chart(host, T, sp));
  }
  function chart(host, T, sp) {
    const LW = window.LightweightCharts; if (!LW) return; if (S.ch) { try { S.ch.remove(); } catch (e) { /* ok */ } }
    S.ch = LW.createChart(host, { autoSize: true, localization: { locale: 'nb-NO', dateFormat: 'dd.MM.yy', priceFormatter: v => pct(v - 1) }, layout: { background: { type: 'solid', color: css('--panel') }, textColor: css('--muted'), fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line'), mode: S.log ? 1 : 0 }, timeScale: { borderColor: css('--line') }, crosshair: { mode: 0 } });
    T.forEach((x, i) => { const i0 = at(x, sp.from - 1) + 1, i1 = at(x, sp.end), b = x.c[i0], s = S.ch.addLineSeries({ color: PAL[i % PAL.length], lineWidth: 2, priceLineVisible: false, title: x.name });
      const d = []; for (let j = i0; j <= i1; j++) d.push({ time: x.t[j] * 86400, value: x.c[j] / b }); s.setData(d); if (i === 0) s.createPriceLine({ price: 1, color: css('--axis'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false }); });
    S.ch.timeScale().fitContent();
  }
  window.CMP = { render, _corr: corr };
})();
