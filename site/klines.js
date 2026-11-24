// Felles laster for lange kursserier fra Binance (offentlig API, ingen nøkkel). Blar bakover i sider à 1000 lys.
// Brukes av «Teknisk analyse» og «Fear & Greed». Resultatet bufres i 2 minutter per coin og tidsramme.
(() => {
  'use strict';
  const BIN = 'https://data-api.binance.vision/api/v3/klines';
  const cache = {};
  const mapK = a => a.map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], ct: x[6], qv: +x[7] }));
  const get = url => { const c = new AbortController(), to = setTimeout(() => c.abort(), 15000);
    return fetch(url, { cache: 'no-store', signal: c.signal }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(() => clearTimeout(to)); };
  // pages: hvor mange sider à 1000 lys (bakover fra nå) som maks hentes
  function all(sym, tf, pages = 1) {
    const k = sym + '|' + tf + '|' + pages, c = cache[k];
    if (c && (c.p || Date.now() - c.at < 12e4)) return c.p || Promise.resolve(c.B);
    const e = cache[k] = { at: 0, B: c && c.B, p: null };
    e.p = (async () => { let out = [], end = null;
      for (let i = 0; i < pages; i++) { const a = await get(`${BIN}?symbol=${sym}USDT&interval=${tf}&limit=1000${end ? '&endTime=' + end : ''}`);
        if (!Array.isArray(a) || !a.length) break; const B = mapK(a); out = B.concat(out.filter(b => b.t > B[B.length - 1].t)); if (a.length < 1000) break; end = B[0].t - 1; }
      if (!out.length) throw new Error('tomt svar'); e.B = out; e.at = Date.now(); return out; })()
      .catch(err => { if (e.B) return e.B; throw err; }).finally(() => { e.p = null; });
    return e.p;
  }
  const closedEnd = B => { let e = B.length - 1; while (e >= 0 && B[e].ct > Date.now()) e--; return e; };
  window.KL = { all, closedEnd };
})();
