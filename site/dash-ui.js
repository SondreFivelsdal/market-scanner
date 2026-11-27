// Forsiden «Oversikt»: hele markedet på én skjerm. Markedsdata (fakta) og beregnede signaler (faste regler) er tydelig skilt.
// Kilder: Binance (kurser, 24t), CoinGecko (markedsverdi, dominans, volum), alternative.me (Fear & Greed), data/cycle.json
// (realisert pris fra Coin Metrics), data/macro.json (makro). Regimet gjenbruker RG (trend) og TA (Wyckoff).
(() => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const NS = 'http://www.w3.org/2000/svg', sv = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a || {}) e.setAttribute(k, a[k]); return e; };
  const nf = (v, o) => v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('nb-NO', o);
  const usd = v => v == null || !isFinite(v) ? '–' : v >= 1e12 ? nf(v / 1e12, { maximumFractionDigits: 2 }) + ' bill. $' : v >= 1e9 ? nf(v / 1e9, { maximumFractionDigits: 1 }) + ' mrd. $' : v >= 1000 ? nf(v, { maximumFractionDigits: 0 }) + ' $' : v >= 1 ? nf(v, { maximumFractionDigits: 2 }) + ' $' : nf(v, { maximumSignificantDigits: 3 }) + ' $';
  const pct = (v, d = 1) => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v * 100), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  const cls = v => v == null ? 'muted' : v > 0 ? 'up' : v < 0 ? 'down' : '';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const DAY = 864e5, quantRank = (a, x) => a.length ? a.filter(v => v < x).length / a.length : null;
  const get = url => { const c = new AbortController(), to = setTimeout(() => c.abort(), 15000); return fetch(url, { cache: 'no-store', signal: c.signal }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(() => clearTimeout(to)); };
  const S = { K: {}, tick: null, glob: null, fng: null, at: 0, built: false, rng: 365, ch: null, show: { e200: true, rp: true, w200: true } };
  const coins = () => window.COINS || ['BTC', 'ETH'], names = () => window.NAMES || {};

  // ---------------------------------------------------------------- data (hver kilde for seg, siden tegnes etter hvert som noe kommer)
  function load() {
    if (Date.now() - S.at < 6e4) return; S.at = Date.now();
    const H = window.HEALTH || { mark() {}, fail() {} };
    coins().forEach(s => KL.all(s, '1d', s === 'BTC' ? 2 : 1).then(B => { S.K[s] = B; if (s === 'BTC') { const e = KL.closedEnd(B); H.mark('klines', B[e].ct); } draw(); }).catch(e => { S.K[s] = S.K[s] || null; if (s === 'BTC') H.fail('klines', e.message); draw(); }));
    get(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(coins().map(s => s + 'USDT')))}`).then(a => { S.tick = Object.fromEntries(a.map(x => [x.symbol.replace('USDT', ''), { p: +x.lastPrice, chg: +x.priceChangePercent / 100, qv: +x.quoteVolume }])); draw(); }).catch(() => draw());
    get('https://api.coingecko.com/api/v3/global').then(j => { S.glob = j && j.data; H.mark('global', S.glob && S.glob.updated_at ? S.glob.updated_at * 1000 : Date.now()); draw(); }).catch(e => { H.fail('global', e.message); draw(); });
    get('https://api.alternative.me/fng/?limit=400').then(j => { S.fng = (j.data || []).map(x => +x.value).reverse(); S.fngCls = j.data && j.data[0] && j.data[0].value_classification; if (j.data && j.data[0]) H.mark('fng', (+j.data[0].timestamp + 86399) * 1000); draw(); }).catch(e => { H.fail('fng', e.message); draw(); });
  }

  // ---------------------------------------------------------------- beregninger
  const ret = (B, n) => { if (!B || B.length <= n) return null; const e = KL.closedEnd(B); return B[e].c / B[Math.max(0, e - n)].c - 1; };
  function vol30(B) { if (!B || B.length < 400) return null; const e = KL.closedEnd(B), r = []; for (let i = 1; i <= e; i++) r.push(Math.log(B[i].c / B[i - 1].c));
    const roll = []; for (let i = 30; i <= r.length; i++) { const w = r.slice(i - 30, i), m = w.reduce((a, b) => a + b, 0) / 30; roll.push(Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 29) * Math.sqrt(365)); }
    const now = roll[roll.length - 1]; return { now, pr: quantRank(roll.slice(-1000), now), spark: roll.slice(-365) }; }
  function rel() { const btc = S.K.BTC; return coins().map(s => { const B = S.K[s]; if (!B) return null; const t = S.tick && S.tick[s];
      return { s, p: t ? t.p : B[B.length - 1].c, d1: t ? t.chg : ret(B, 1), d7: ret(B, 7), d30: ret(B, 30), vb: s === 'BTC' ? 0 : ret(B, 30) != null && ret(btc, 30) != null ? (1 + ret(B, 30)) / (1 + ret(btc, 30)) - 1 : null, qv: t ? t.qv : null }; }).filter(Boolean); }
  // indikatorer for hele BTC-serien (kausale), regnes én gang per serie
  function pre(B) { if (S.pre && S.pre.n === B.length) return S.pre; const c = B.map(b => b.c), vol = new Array(B.length).fill(null);
    for (let i = 31; i < B.length; i++) { let m = 0; const r = []; for (let j = i - 29; j <= i; j++) { const x = Math.log(c[j] / c[j - 1]); r.push(x); m += x; } m /= 30; vol[i] = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / 29) * Math.sqrt(365); }
    return (S.pre = { n: B.length, c, e200: RG.ema(c, 200), e50: RG.ema(c, 50), e20: RG.ema(c, 20), s350: RG.sma(c, 350), rsi: RG.rsi(c), hist: RG.macd(c).hist, vol }); }
  // trend, momentum og volatilitet på lukket lys e – samme regler for i dag og for 7 dager siden
  function partsAt(B, e) { const P = pre(B), c = P.c;
    const tp = [c[e] > P.e200[e] ? 1 : -1, P.e50[e] > P.e200[e] ? 1 : -1, P.s350[e] ? (c[e] > P.s350[e] ? 1 : -1) : 0], ts = tp.reduce((a, x) => a + x, 0);
    const trend = ts >= 2 ? 'Bullish' : ts <= -2 ? 'Bearish' : 'Nøytral', rsi = P.rsi[e], hs = P.hist[e] != null && P.hist[e - 5] != null ? P.hist[e] - P.hist[e - 5] : 0;
    const ms = (rsi > 55) + (c[e] > P.e20[e]) + (hs > 0) - (rsi < 45) - (c[e] < P.e20[e]) - (hs < 0), mom = ms >= 2 ? 'Sterk' : ms <= -2 ? 'Svak' : hs > 0 ? 'Bedres' : 'Svekkes';
    const vw = P.vol.slice(Math.max(31, e - 1000), e + 1).filter(v => v != null), vpr = vw.length ? vw.filter(v => v < P.vol[e]).length / vw.length : null;
    return { trend, ts, mom, rsi, hs, vol: vpr == null ? null : vpr > 0.75 ? 'Høy' : vpr < 0.25 ? 'Lav' : 'Normal', vpr, v: P.vol[e], c: c[e], e200: P.e200[e], s350: P.s350[e] }; }
  // markedsregimet: hver del er en enkel regel. Data som er forsinket eller mangler brukes ikke (se datahelse).
  function regime() {
    const B = S.K.BTC; if (!B || B.length < 400) return null; const H = window.HEALTH, ok = k => !H || H.fresh(k);
    if (!ok('klines')) return { stale: true };
    const e = KL.closedEnd(B), p = partsAt(B, e), p7 = partsAt(B, e - 7);
    const C = (v, up, dn) => v === up ? 'up' : v === dn ? 'down' : 'warn';
    const trend = { k: 'Trend', v: p.trend, c: C(p.trend, 'Bullish', 'Bearish'), why: `BTC ${p.c > p.e200 ? 'over' : 'under'} 200-dagerslinja (${usd(p.e200)}), ${p.s350 ? (p.c > p.s350 ? 'over' : 'under') + ' 50-ukerslinja' : ''}`, dir: p.ts >= 2 ? 1 : p.ts <= -2 ? -1 : 0 };
    const mom = { k: 'Momentum', v: p.mom, c: p.mom === 'Sterk' ? 'up' : p.mom === 'Svak' ? 'down' : 'warn', why: `RSI ${nf(p.rsi, { maximumFractionDigits: 0 })}, MACD ${p.hs > 0 ? 'stiger' : 'faller'}, kurs ${p.c > pre(B).e20[e] ? 'over' : 'under'} 20-dagerslinja`, dir: p.mom === 'Sterk' || p.mom === 'Bedres' ? 1 : -1 };
    const R = rel().filter(x => x.s !== 'BTC' && x.vb != null), share = R.length ? R.filter(x => x.vb > 0).length / R.length : null, eth = R.find(x => x.s === 'ETH');
    const fg = ok('fng') && S.fng ? S.fng[S.fng.length - 1] : null, mc = ok('macro') && window.MACRO ? MACRO.summary() : null;
    const rp = [fg == null ? 0 : fg >= 55 ? 1 : fg <= 45 ? -1 : 0, share == null ? 0 : share > 0.5 ? 1 : -1, eth && eth.vb != null ? (eth.vb > 0 ? 1 : -1) : 0, mc ? (mc.cls === 'up' ? 1 : mc.cls === 'down' ? -1 : 0) : 0], rs = rp.reduce((a, x) => a + x, 0);
    const risk = { k: 'Risikoappetitt', v: rs >= 2 ? 'Risk-on' : rs <= -2 ? 'Risk-off' : 'Blandet', c: rs >= 2 ? 'up' : rs <= -2 ? 'down' : 'warn', why: `Fear & Greed ${fg ?? 'ukjent'}, ${share != null ? Math.round(share * R.length) + ' av ' + R.length + ' altcoins slår BTC' : 'altcoins ukjent'}, makro ${mc ? mc.label.toLowerCase() : 'ukjent'}`, dir: rs >= 2 ? 1 : rs <= -2 ? -1 : 0 };
    const vol = p.vol ? { k: 'Volatilitet', v: p.vol, c: p.vol === 'Høy' ? 'warn' : '', why: `30 d: ${nf(p.v * 100, { maximumFractionDigits: 0 })} % i året, persentil ${nf(p.vpr * 100, { maximumFractionDigits: 0 })} (siste 1000 d)` } : null;
    const alts = share == null ? null : { k: 'Altcoins', v: share > 0.6 ? 'Sterkere enn BTC' : share < 0.4 ? 'Svakere enn BTC' : 'Som BTC', c: share > 0.6 ? 'up' : share < 0.4 ? 'down' : '', why: `${Math.round(share * R.length)} av ${R.length} slår Bitcoin siste 30 dager`, dir: share > 0.6 ? 1 : share < 0.4 ? -1 : 0 };
    let ph = null; if (window.TA) { try { const a = TA.analyze(B, e, '1d'); if (a.wy && !a.wy.failed) ph = { k: 'Fase (Wyckoff)', v: `${a.wy.kind === 'acc' ? 'Akkumulering' : 'Fordeling'} ${a.wy.phase}`, c: a.wy.kind === 'acc' ? 'up' : 'down', why: 'Regelbasert struktur på dagsgrafen – se Teknisk', dir: a.wy.kind === 'acc' ? 1 : -1 }; } catch (x) { /* ingen */ } }
    // konflikter: signaler som peker hver sin vei
    const cf = [];
    if (trend.dir > 0 && mom.dir < 0) cf.push(`Trenden er opp, men momentum ${p.mom === 'Svak' ? 'er svakt' : 'svekkes'} (RSI ${nf(p.rsi, { maximumFractionDigits: 0 })})`);
    if (trend.dir < 0 && mom.dir > 0) cf.push(`Trenden er ned, men momentum ${p.mom === 'Sterk' ? 'er sterkt' : 'bedres'} (RSI ${nf(p.rsi, { maximumFractionDigits: 0 })})`);
    if (fg != null && fg <= 25 && trend.dir > 0) cf.push(`Ekstrem frykt (${fg}) selv om trenden er opp`);
    if (fg != null && fg >= 75 && trend.dir < 0) cf.push(`Grådighet (${fg}) selv om trenden er ned`);
    if (mc && ((mc.cls === 'up' && trend.dir < 0) || (mc.cls === 'down' && trend.dir > 0))) cf.push(`Makro (${mc.label.toLowerCase()}) og kryptotrenden peker hver sin vei`);
    if (alts && risk.dir > 0 && alts.dir < 0) cf.push('Risk-on-stemning, men altcoins er svakere enn BTC');
    if (ph && trend.dir && ph.dir !== trend.dir) cf.push(`${ph.v.split(' ')[0]} (Wyckoff) i en ${trend.dir > 0 ? 'opptrend' : 'nedtrend'}`);
    const sig = [trend, mom, risk, alts, ph].filter(x => x && x.dir != null), up = sig.filter(x => x.dir > 0).length, dn = sig.filter(x => x.dir < 0).length;
    return { trend, mom, risk, vol, alts, ph, cf, up, dn, n: sig.length, p, p7, e, fg, share, R, mc };
  }
  // endringer siste 7 dager, fra dataene (ikke fra når du sist var innom)
  function changes(G) { const B = S.K.BTC, out = [], { p, p7, e } = G, P = pre(B);
    for (const [k, a, b] of [['Trend', p7.trend, p.trend], ['Momentum', p7.mom, p.mom], ['Volatilitet', p7.vol, p.vol]]) if (a && b && a !== b) out.push([k, `${a} → ${b}`, '']);
    let flip = null; for (let i = e; i > e - 30 && i > 1; i--) if ((P.c[i] > P.e200[i]) !== (P.c[i - 1] > P.e200[i - 1])) { flip = i; break; }
    if (flip != null) out.push(['200-dagerslinja', `krysset ${P.c[flip] > P.e200[flip] ? 'over' : 'under'} ${new Date(B[flip].t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}`, P.c[flip] > P.e200[flip] ? 'up' : 'down']);
    const r7 = P.c[e] / P.c[e - 7] - 1; out.push(['BTC 7 d', pct(r7), cls(r7)]);
    if (S.fng && S.fng.length > 8 && G.fg != null) { const a = S.fng[S.fng.length - 8]; out.push(['Fear & Greed', `${a} → ${G.fg}`, cls(G.fg - a)]); }
    if (p.v && p7.v) out.push(['Volatilitet 30 d', `${nf(p7.v * 100, { maximumFractionDigits: 0 })} → ${nf(p.v * 100, { maximumFractionDigits: 0 })} %`, '']);
    const cy = dash.data('cycle'), w = cy && cy.status === 'ok' && cy.data.w; if (w && w.length > 5 && (!window.HEALTH || HEALTH.fresh('cycle'))) { const a = w[w.length - 5][7], b = w[w.length - 1][7]; if (a && b) out.push(['MVRV 4 uker', `${nf(a, { maximumFractionDigits: 2 })} → ${nf(b, { maximumFractionDigits: 2 })}`, cls(b - a)]); }
    return out; }
  // de tre viktigste tingene nå: kandidater med fast poengsum, bare fra tall vi har
  function intel(G) { const B = S.K.BTC, P = pre(B), e = G.e, c = P.c, L = [], add = (sc, tag, t) => L.push({ sc, tag, t });
    let flip = null; for (let i = e; i > e - 14; i--) if ((c[i] > P.e200[i]) !== (c[i - 1] > P.e200[i - 1])) { flip = i; break; }
    if (flip != null) add(10, 'Trend', `BTC krysset ${c[flip] > P.e200[flip] ? 'over' : 'under'} 200-dagerslinja for ${e - flip} ${e - flip === 1 ? 'dag' : 'dager'} siden.`);
    const r7 = c[e] / c[e - 7] - 1; if (Math.abs(r7) >= 0.08) { let j = null; for (let i = e - 8; i >= 7; i--) if (Math.abs(c[i] / c[i - 7] - 1) >= Math.abs(r7)) { j = i; break; } add(8, 'Kurs', `BTC ${pct(r7)} siste 7 dager – ${j ? 'største ukesbevegelse siden ' + new Date(B[j].t).toLocaleDateString('nb-NO', { month: 'short', year: 'numeric' }) : 'største ukesbevegelse i dataene'}.`); }
    if (G.fg != null && (G.fg <= 20 || G.fg >= 80)) { const a = S.fng, rk = a.filter(v => (G.fg <= 20 ? v <= G.fg : v >= G.fg)).length / a.length; add(7, 'Sentiment', `Fear & Greed ${G.fg} (${G.fg <= 20 ? 'ekstrem frykt' : 'ekstrem grådighet'}) – ${G.fg <= 20 ? 'like lavt' : 'like høyt'} eller ${G.fg <= 20 ? 'lavere' : 'høyere'} bare ${nf(rk * 100, { maximumFractionDigits: 0 })} % av dagene siste 13 mnd.`); }
    if (G.p.vpr != null && (G.p.vpr <= 0.1 || G.p.vpr >= 0.9)) add(6, 'Volatilitet', `30-dagers volatilitet ${nf(G.p.v * 100, { maximumFractionDigits: 0 })} % – ${G.p.vpr <= 0.1 ? 'lavere' : 'høyere'} enn ${nf((G.p.vpr <= 0.1 ? 1 - G.p.vpr : G.p.vpr) * 100, { maximumFractionDigits: 0 })} % av dagene siste 1000.`);
    const cy = dash.data('cycle'), N = cy && cy.status === 'ok' && (!window.HEALTH || HEALTH.fresh('cycle')) ? cy.data.now : null;
    const lv = [['200-dagerslinja', P.e200[e]], ['50-ukerslinja', P.s350[e]], ...(N ? [['realisert pris', N.rp], ['200-ukerslinja', N.w200]] : [])].filter(x => x[1]);
    for (const [nm, v] of lv) { const d = c[e] / v - 1; if (Math.abs(d) <= 0.03) add(6 + (0.03 - Math.abs(d)) * 50, 'Nivå', `BTC er ${pct(Math.abs(d))} ${d >= 0 ? 'over' : 'under'} ${nm} (${usd(v)}) – et nivå som ofte testes.`); }
    if (N && N.mvrv != null && (N.mvrv < 1 || N.mvrv > 3)) add(7, 'On-chain', `MVRV ${nf(N.mvrv, { maximumFractionDigits: 2 })}: kursen er ${N.mvrv < 1 ? 'under realisert pris – den typiske eieren sitter med tap' : 'over 3× realisert pris – historisk overopphetet sone'}.`);
    if (G.share != null && G.R.length >= 4 && (G.share >= 0.8 || G.share <= 0.2)) add(5, 'Bredde', `${Math.round(G.share * G.R.length)} av ${G.R.length} altcoins slår Bitcoin siste 30 dager.`);
    if (G.cf.length >= 2) add(5, 'Usikkerhet', `Signalene spriker (${G.cf.length} konflikter): ${G.cf[0].charAt(0).toLowerCase() + G.cf[0].slice(1)}.`);
    if (!L.length) add(1, 'Trend', `Ingen uvanlige utslag: trend ${G.trend.v.toLowerCase()}, momentum ${G.mom.v.toLowerCase()}, volatilitet ${G.p.vol ? G.p.vol.toLowerCase() : 'ukjent'}.`);
    return L.sort((a, b) => b.sc - a.sc).slice(0, 3); }
  // ---------------------------------------------------------------- små byggeklosser
  function spark(a, w = 90, h = 26, col) { const s = sv('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'spark', 'aria-hidden': 'true' }); const v = (a || []).filter(x => x != null && isFinite(x)); if (v.length < 2) return s;
    const lo = Math.min(...v), hi = Math.max(...v), X = i => i / (v.length - 1) * w, Y = x => h - 2 - (x - lo) / (hi - lo || 1) * (h - 4);
    s.append(sv('path', { d: v.map((x, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1)).join(''), fill: 'none', stroke: col || css('--muted'), 'stroke-width': 1.4 })); return s; }
  function cell(k, v, sub, subCls, sp, go, title) { const d = el(go ? 'button' : 'div', 'mcell'); if (go) { d.type = 'button'; d.addEventListener('click', go); } if (title) d.title = title;
    const t = el('div', 'mtop'); t.append(el('span', 'mlab', k)); if (sp) t.append(sp); d.append(t, el('span', 'mv', v), el('span', 'ms ' + (subCls || ''), sub || '')); return d; }
  const goTab = (tab, extra) => () => { dash.setParams(Object.assign({ tab }, extra || {})); window.scrollTo({ top: 0 }); };

  // ---------------------------------------------------------------- tegning
  function draw() {
    const root = document.getElementById('dash-in'); if (!root || document.getElementById('dash').hidden) return;
    if (!S.built) { S.built = true; root.replaceChildren(...['reg', 'strip', 'main', 'ind'].map(id => { const d = el('div'); d.id = 'd-' + id; return d; })); document.getElementById('d-main').className = 'dgrid'; }
    drawReg(); drawStrip(); drawMain(); drawInd();
  }
  function drawReg() {
    const box = document.getElementById('d-reg'), R = regime(); box.className = 'regime';
    if (!R) { box.replaceChildren(el('span', 'muted', S.K.BTC === null ? 'Kursdata fra Binance er ikke tilgjengelig akkurat nå.' : 'Henter markedsdata …')); return; }
    if (R.stale) { box.replaceChildren(el('span', 'warn', 'Kursdataene er forsinket – markedsregime og signaler vises ikke før dataene er ferske igjen (se datahelse øverst).')); return; }
    const head = el('div', 'rhead'); head.append(el('span', 'rk', 'Markedsregime'), el('span', 'badge', 'Beregnet')); if (R.cf.length >= 2) head.append(el('span', 'badge warnb', 'Usikkert'));
    const big = el('div', 'rbig'); big.append(el('b', R.trend.c, R.trend.v), el('span', 'sep', '·'), el('b', R.risk.c, R.risk.v)); if (R.vol) big.append(el('span', 'sep', '·'), el('span', 'muted', `${R.vol.v.toLowerCase()} volatilitet`));
    const agree = el('span', 'muted small', `${R.up} av ${R.n} signaler peker opp, ${R.dn} ned`);
    const left = el('div', 'rleft'); left.append(head, big, agree);
    const sig = el('div', 'rsig'); for (const x of [R.trend, R.mom, R.risk, R.vol, R.alts, R.ph].filter(Boolean)) { const s2 = el('div', 'rs'); s2.title = x.why; s2.append(el('span', 'mlab', x.k), el('b', x.c, x.v), el('span', 'ms', x.why)); sig.append(s2); }
    const col = (t, items) => { const d = el('div', 'rcol'); d.append(el('span', 'mlab', t), ...items); return d; };
    const I = intel(R).map((x, i) => { const r = el('div', 'rline'); r.append(el('span', 'rn', String(i + 1)), el('span', 'tag', x.tag), el('span', null, x.t)); return r; });
    const Ch = changes(R).map(([k, v, c]) => { const r = el('div', 'rline kv'); r.append(el('span', 'muted', k), el('b', c, v)); return r; });
    const Cf = R.cf.length ? R.cf.map(t => { const r = el('div', 'rline'); r.append(el('span', 'warn', '⚠'), el('span', null, t)); return r; }) : [el('div', 'rline muted', 'Ingen – signalene er samstemte.')];
    const bot = el('div', 'rgrid'); bot.append(col('Viktigst nå', I), col('Endret siste 7 dager', Ch), col(`Signalkonflikter (${R.cf.length})`, Cf));
    box.replaceChildren(left, sig, bot);
  }
  function drawStrip() {
    const box = document.getElementById('d-strip'); box.className = 'mstrip'; const t = S.tick || {}, g = S.glob, B = S.K.BTC, E = S.K.ETH, cy = dash.data('cycle'), C = cy && cy.status === 'ok' ? cy.data : null;
    const tot = g && g.total_market_cap && g.total_market_cap.usd, dom = g && g.market_cap_percentage && g.market_cap_percentage.btc, edom = g && g.market_cap_percentage && g.market_cap_percentage.eth;
    const V = B ? vol30(B) : null, fg = S.fng && S.fng[S.fng.length - 1], vol24 = g && g.total_volume && g.total_volume.usd;
    const fgc = fg == null ? '' : fg <= 25 ? 'down' : fg >= 75 ? 'up' : '', old = k => window.HEALTH && HEALTH.state(k) === 'late' ? ' · ⚠ forsinket' : '';
    box.replaceChildren(
      cell('Bitcoin', usd(t.BTC ? t.BTC.p : B && B[B.length - 1].c), t.BTC ? pct(t.BTC.chg) + ' 24t' : '', cls(t.BTC && t.BTC.chg), B && spark(B.slice(-90).map(b => b.c)), goTab('terminal', { coin: 'BTC' })),
      cell('Ethereum', usd(t.ETH ? t.ETH.p : E && E[E.length - 1].c), t.ETH ? pct(t.ETH.chg) + ' 24t' : '', cls(t.ETH && t.ETH.chg), E && spark(E.slice(-90).map(b => b.c)), goTab('terminal', { coin: 'ETH' })),
      cell('Total markedsverdi', usd(tot), g && g.market_cap_change_percentage_24h_usd != null ? pct(g.market_cap_change_percentage_24h_usd / 100) + ' 24t' + old('global') : 'CoinGecko', cls(g && g.market_cap_change_percentage_24h_usd)),
      cell('BTC-dominans', dom != null ? nf(dom, { maximumFractionDigits: 1 }) + ' %' : '–', edom != null ? `ETH ${nf(edom, { maximumFractionDigits: 1 })} %` : ''),
      cell('Altcoins (uten BTC)', tot && dom != null ? usd(tot * (1 - dom / 100)) : '–', tot && dom != null && edom != null ? `uten BTC og ETH: ${usd(tot * (1 - (dom + edom) / 100))}` : ''),
      cell('Fear & Greed', fg != null ? String(fg) : '–', S.fngCls ? { 'Extreme Fear': 'Ekstrem frykt', Fear: 'Frykt', Neutral: 'Nøytral', Greed: 'Grådighet', 'Extreme Greed': 'Ekstrem grådighet' }[S.fngCls] + old('fng') || S.fngCls : '', fgc, S.fng && spark(S.fng.slice(-90)), goTab('fng')),
      cell('Volatilitet 30d', V ? nf(V.now * 100, { maximumFractionDigits: 0 }) + ' %' : '–', V ? `persentil ${nf(V.pr * 100, { maximumFractionDigits: 0 })}` : 'BTC, i året', '', V && spark(V.spark.slice(-180))),
      cell('Volum 24t', usd(vol24), vol24 ? 'hele kryptomarkedet' : t.BTC ? `BTC ${usd(t.BTC.qv)}` : ''),
      cell('Mot realisert pris', C && C.now && C.now.vsRp != null ? pct(C.now.vsRp) : '–', C && C.now && C.now.mvrv ? `MVRV ${nf(C.now.mvrv, { maximumFractionDigits: 2 })}${old('cycle')}` : 'Coin Metrics', C && C.now ? cls(C.now.vsRp) : '', C && C.w && spark(C.w.slice(-104).map(r => r[7])), goTab('syklus')));
  }
  function drawMain() {
    const box = document.getElementById('d-main');
    if (!box.dataset.b) { box.dataset.b = 1; const c = el('div', 'card tight dchart'), hd = el('div', 'row'), ttl = el('h3', null, 'Bitcoin'), ctl = el('div', 'tbar');
      const rg = el('div', 'tgroup'); [[182, '6M'], [365, '1Å'], [1095, '3Å'], [3000, 'Alt']].forEach(([n, l]) => { const b = el('button', 'tb', l); b.type = 'button'; b.dataset.n = n; b.addEventListener('click', () => { S.rng = n; range(); }); rg.append(b); });
      const sh = el('div', 'tgroup'); [['e200', '200d', '--orange'], ['rp', 'Realisert pris', '#d6336c'], ['w200', '200W', '--purple']].forEach(([k, l]) => { const b = el('button', 'tb', l); b.type = 'button'; b.dataset.k = k; b.addEventListener('click', () => { S.show[k] = !S.show[k]; lines(); }); sh.append(b); });
      ctl.append(rg, sh); hd.append(ttl, ctl); const host = el('div', 'dhost'); c.append(hd, host);
      const side = el('div', 'card tight'); side.id = 'd-rel'; const rec = el('div', 'card tight'); rec.id = 'd-rec'; const right = el('div', 'stack'); right.append(side, rec); box.append(c, right); S.host = host; S.rg = rg; S.sh = sh; }
    if (!S.ch && S.K.BTC && window.LightweightCharts) mkChart();
    lines(); drawRel(); drawRecent();
  }
  function mkChart() { const LW = window.LightweightCharts;
    S.ch = LW.createChart(S.host, { autoSize: true, localization: { locale: 'nb-NO', dateFormat: 'dd.MM.yy' }, layout: { background: { type: 'solid', color: css('--panel') }, textColor: css('--muted'), fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line'), mode: 1 }, timeScale: { borderColor: css('--line'), rightOffset: 4 }, crosshair: { mode: 0 } });
    const up = css('--up'), dn = css('--down');
    S.cs = S.ch.addCandlestickSeries({ upColor: up, downColor: dn, wickUpColor: up, wickDownColor: dn, borderVisible: false, priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    const ln = (c, w, st = 0, t = 0) => S.ch.addLineSeries({ color: c, lineWidth: w, lineStyle: st, lineType: t, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    S.ls = { e200: ln(css('--orange'), 2), rp: ln('#d6336c', 2, 0, 1), w200: ln(css('--purple'), 2, 2, 1) }; if (window.ZOOM) ZOOM.attach(S.ch, S.host, { onReset: range }); }
  function lines() {
    if (!S.ch) return; const B = S.K.BTC, ts = t => Math.floor(t / 1000);
    if (S.cs._n !== B.length) { S.cs._n = B.length; S.cs.setData(B.map(b => ({ time: ts(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
      const E = RG.ema(B.map(b => b.c), 200); S.ls.e200.setData(B.map((b, i) => E[i] == null ? { time: ts(b.t) } : { time: ts(b.t), value: E[i] })); range(); }
    const cy = dash.data('cycle'), C = cy && cy.status === 'ok' ? cy.data : null;
    if (C && C.w && !S.cyOk) { S.cyOk = true; const from = B[0].t / DAY - 7, w = C.w.filter(r => r[0] >= from);
      S.ls.rp.setData(w.filter(r => r[4]).map(r => ({ time: r[0] * 86400, value: r[4] }))); S.ls.w200.setData(w.filter(r => r[2]).map(r => ({ time: r[0] * 86400, value: r[2] }))); }
    for (const k in S.ls) S.ls[k].applyOptions({ visible: !!S.show[k] });
    S.sh.querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', S.show[b.dataset.k] ? 'true' : 'false'); if (b.dataset.k === 'rp' && !C) b.title = 'Realisert pris (Coin Metrics) er ikke lastet'; });
  }
  function range() { if (!S.ch || !S.K.BTC) return; const B = S.K.BTC, last = B[B.length - 1].t / 1000; S.ch.timeScale().setVisibleRange({ from: Math.max(B[0].t / 1000, last - S.rng * 86400), to: last }); S.rg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.n === S.rng ? 'true' : 'false')); }
  function drawRel() {
    const box = document.getElementById('d-rel'); if (!box) return; const R = rel().sort((a, b) => (b.vb ?? -9) - (a.vb ?? -9));
    const t = el('table', 't compact rel'), hr = el('tr'); ['', 'Pris', '24t', '7d', '30d', 'mot BTC'].forEach((x, i) => hr.append(el('th', i ? '' : 'l', x))); t.append(hr);
    const mx = Math.max(0.05, ...R.map(x => Math.abs(x.vb || 0)));
    for (const x of R) { const tr = el('tr', 'evrow'); tr.tabIndex = 0; tr.title = `Åpne ${names()[x.s] || x.s} i grafen`; const go = goTab('terminal', { coin: x.s }); tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      const n = el('td', 'l'); n.append(el('b', null, x.s)); const bar = el('td', 'barc'); if (x.s !== 'BTC' && x.vb != null) { const w = el('span', 'bar ' + cls(x.vb)); w.style.width = Math.round(Math.abs(x.vb) / mx * 50) + '%'; w.style[x.vb > 0 ? 'left' : 'right'] = '50%'; bar.append(w, el('span', 'bv ' + cls(x.vb), pct(x.vb, 0))); } else bar.append(el('span', 'muted', '–'));
      tr.append(n, el('td', null, usd(x.p)), el('td', cls(x.d1), pct(x.d1)), el('td', cls(x.d7), pct(x.d7, 0)), el('td', cls(x.d30), pct(x.d30, 0)), bar); t.append(tr); }
    const hd = el('div', 'row'); hd.append(el('h3', null, 'Relativ styrke'), el('span', 'muted small', '30 d mot BTC'));
    const tw = el('div', 'tw'); tw.append(t); box.replaceChildren(hd, tw);
  }
  // nylige hendelser (siste 30 dager) fra Historikk, med hvordan BTC gikk 30 dager etter de tidligere gangene
  function drawRecent() {
    const box = document.getElementById('d-rec'); if (!box) return; const hd = el('div', 'row'); hd.append(el('h3', null, 'Nylig i markedet'), el('span', 'muted small', 'BTC 30 d etter, før'));
    const d = dash.data('events'), m = d && d.status === 'ok' ? d.data : null; if (!m) { box.replaceChildren(hd, el('p', 'muted small', d && d.status === 'error' ? 'Hendelsesdata er ikke tilgjengelige.' : 'Henter …')); return; }
    if (box._b === m.built) return; box._b = m.built;
    const A = m.assets.BTC, T = { t: [], c: A ? A.c : [] }; if (A) { let p = 0; for (const x of A.t) { p += x; T.t.push(p); } }
    const at = dd => { let lo = 0, hi = T.t.length - 1; if (!T.t.length || dd < T.t[0]) return -1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (T.t[k] <= dd) lo = k; else hi = k - 1; } return lo; };
    const dOf = ds => Math.floor(Date.parse(ds + 'T00:00:00Z') / DAY), today = Math.floor(Date.now() / DAY), last = T.t[T.t.length - 1];
    const seen = new Set(), rows = [];
    for (const e of m.events) for (const ds of e.dates || []) { const d0 = dOf(ds); if (today - d0 < 0 || today - d0 > 30) continue; rows.push({ e, ds, d0 }); }
    rows.sort((a, b) => b.d0 - a.d0 || (b.e.imp || 2) - (a.e.imp || 2));
    const out = rows.filter(r => !seen.has(r.e.id) && seen.add(r.e.id)).slice(0, 7).map(r => {
      const v = []; for (const ds of r.e.dates) { const d0 = dOf(ds); if (d0 + 30 > last) continue; const i = at(d0 - 1) + 1, j = at(d0 + 30); if (i < 0 || i >= T.t.length || j <= i) continue; v.push(T.c[j] / T.c[i] - 1); }
      v.sort((a, b) => a - b); const md = v.length ? v[Math.floor((v.length - 1) / 2)] : null;
      const b = el('button'); b.type = 'button'; b.title = `Åpne «${r.e.name}» i Historikk`; b.addEventListener('click', goTab('hendelser', { ev: r.e.id }));
      const nm = (r.e.labels && r.e.labels[r.ds]) || r.e.name; b.append(el('span', 'd', new Date(r.d0 * DAY).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', timeZone: 'UTC' })), el('span', 'nm', nm), el('span', 'r ' + cls(md), md == null ? '–' : `${pct(md, 0)} · n=${v.length}`)); return b; });
    const l = el('div', 'recent'); l.append(...out); box.replaceChildren(hd, out.length ? l : el('p', 'muted small', 'Ingen registrerte hendelser siste 30 dager.'));
  }
  function drawInd() {
    const box = document.getElementById('d-ind'); box.className = 'dind'; const cy = dash.data('cycle'), C = cy && cy.status === 'ok' ? cy.data : null, mc = window.MACRO && MACRO.summary(), w = C && C.w ? C.w.slice(-156) : null, n = C && C.now;
    const zc = v => v == null ? '' : v > 0.8 ? 'down' : v < 0.2 ? 'up' : '';
    const items = [
      cell('MVRV', n && n.mvrv != null ? nf(n.mvrv, { maximumFractionDigits: 2 }) : '–', n && n.mvrv != null ? (n.mvrv < 1 ? 'under realisert pris' : n.mvrv > 3 ? 'overopphetet sone' : 'pris / realisert pris') : 'Coin Metrics', n && n.mvrv != null ? (n.mvrv < 1 ? 'up' : n.mvrv > 3 ? 'down' : '') : '', w && spark(w.map(r => r[7]), 110, 30), goTab('syklus')),
      cell('MVRV-Z', n && n.z != null ? nf(n.z, { maximumFractionDigits: 2 }) : '–', 'markedsverdi mot realisert, i std.avvik', '', w && spark(w.map(r => r[5]), 110, 30), goTab('syklus')),
      cell('Syklusrisiko', n && n.risk != null ? nf(n.risk, { maximumFractionDigits: 2 }) : '–', 'beregnet 0–1 (lav = billig historisk)', zc(n && n.risk), w && spark(w.map(r => r[6]), 110, 30), goTab('syklus')),
      cell('200-ukerslinja', n && n.vs200 != null ? pct(n.vs200, 0) : '–', n && n.w200 ? `linja ${usd(n.w200)}` : '', n ? cls(n.vs200) : '', w && spark(w.map(r => r[2] ? r[1] / r[2] : null), 110, 30), goTab('syklus')),
      cell('50-ukerslinja', n && n.vs50 != null ? pct(n.vs50, 0) : '–', n && n.w50 ? `linja ${usd(n.w50)}` : '', n ? cls(n.vs50) : '', w && spark(w.map(r => r[3] ? r[1] / r[3] : null), 110, 30), goTab('syklus')),
      cell('Makro', mc ? mc.label : '–', mc ? `${mc.counts.gronn} av ${mc.counts.gronn + mc.counts.gul + mc.counts.rod} drivere grønne` : 'makrodata ikke lastet', mc ? mc.cls : '', null, goTab('makro')),
      cell('Siden rekorden', n && n.weeksSinceAth != null ? `${n.weeksSinceAth} uker` : '–', n && n.ath ? `topp ${usd(n.ath)}` : '', '', null, goTab('syklus'))];
    const hd = el('div', 'row'); hd.append(el('h3', null, 'Indikatorer'), el('span', 'muted small', 'Bitcoin · ukesdata · trykk for detaljer'));
    const g = el('div', 'mstrip ind'); g.append(...items); box.replaceChildren(hd, g);
  }
  function render() { if (typeof KL === 'undefined' || typeof RG === 'undefined') return; dash.data('cycle'); dash.data('events'); load(); draw(); }
  window.DASHUI = { render, _S: S, regime };
})();
