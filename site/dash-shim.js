// Liten erstatning for Claude-dashbordets `dash`-API, slik at app.js kan kjøre som vanlig nettside (GitHub Pages).
// Laster data/*.json, holder fane/coin i URL-en (#tab=…&coin=…) og henter live-priser direkte fra Binance i nettleseren.
(() => {
  const FILES = { analysis: 'data/analysis.json', candles_4h: 'data/candles_4h.json', candles_1d: 'data/candles_1d.json', meta: 'data/meta.json', backtest: 'data/backtest.json', daytrade: 'data/daytrade.json' };
  const LAZY = new Set(['candles_1d', 'backtest', 'daytrade']);
  const store = {}; const subs = [];
  const bust = () => '?v=' + Math.floor(Date.now() / 6e4);
  const fire = () => { for (const f of subs) { try { f(); } catch (e) { console.error(e); } } };
  let pending = null; const schedule = () => { if (pending) return; pending = requestAnimationFrame(() => { pending = null; fire(); }); };
  function fetchSet(name) {
    store[name] = store[name] && store[name].data ? { ...store[name], refreshing: true } : { status: 'loading', data: null };
    return fetch(FILES[name] + bust(), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { const old = store[name] && store[name].data; store[name] = { status: 'ok', data: d }; if (name === 'meta') showMeta(d); return old; })
      .catch(e => { console.error('data', name, e); if (!(store[name] && store[name].data)) store[name] = { status: 'error', data: null }; })
      .finally(schedule);
  }
  // fane/coin i URL-en
  const readParams = () => { const p = {}; new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { p[k] = v; }); return p; };
  let params = readParams();
  window.addEventListener('hashchange', () => { params = readParams(); schedule(); });
  const css = getComputedStyle(document.documentElement);
  const colors = () => ['--c1', '--c2', '--c3'].map(v => css.getPropertyValue(v).trim() || '#3b82f6');
  window.dash = {
    data(name) { if (!store[name]) { if (!FILES[name]) return { status: 'missing', data: null }; fetchSet(name); } return store[name]; },
    params: () => ({ ...params }),
    setParams(p) { params = { ...params, ...p }; const s = new URLSearchParams(params).toString(); history.replaceState(null, '', '#' + s); schedule(); },
    setLink() {},
    onData(fn) { subs.push(fn); if (Object.values(store).some(s => s.status === 'ok')) schedule(); },
    get colors() { return colors(); }
  };
  // last data ved oppstart; sjekk etter ny analyse hvert 5. minutt
  Object.keys(FILES).filter(n => !LAZY.has(n)).forEach(fetchSet);
  setInterval(() => { fetch(FILES.meta + bust(), { cache: 'no-store' }).then(r => r.json()).then(m => {
    const cur = store.meta && store.meta.data; if (!cur || m.built !== cur.built) { ['meta', 'analysis', 'candles_4h'].forEach(fetchSet); if (store.candles_1d) fetchSet('candles_1d'); if (store.backtest) fetchSet('backtest'); if (store.daytrade) fetchSet('daytrade'); } }).catch(() => {}); }, 5 * 6e4);
  // live-priser fra Binance (offentlig markedsdata-API, ingen nøkkel)
  window.__live = {};
  const SYMS = ['BTC', 'XRP', 'ADA', 'POL', 'SAND'];
  function live() {
    const q = encodeURIComponent(JSON.stringify(SYMS.map(s => s + 'USDT')));
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + q, { cache: 'no-store' }).then(r => r.json()).then(a => {
      if (!Array.isArray(a)) return; const t = Date.now();
      a.forEach(x => { const s = x.symbol.replace(/USDT$/, ''); window.__live[s] = { p: +x.lastPrice, chg: +x.priceChangePercent, t }; });
      liveStamp = t; showMeta(store.meta && store.meta.data); schedule();
    }).catch(() => {});
  }
  let liveStamp = null;
  const hm = t => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  function showMeta(m) { const el = document.getElementById('ms-updated'); if (!el) return;
    const parts = []; if (m && m.built) parts.push(`Analyse oppdatert ${new Date(m.built).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
    parts.push(liveStamp ? `live-pris ${hm(liveStamp)}` : 'live-pris ikke tilgjengelig');
    el.textContent = parts.join(' · '); }
  live(); setInterval(() => { if (!document.hidden) live(); }, 30e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) live(); });
  // tegn på nytt ved endret bredde
  let rw = null, lastW = window.innerWidth; window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - lastW) < 30) return; clearTimeout(rw); rw = setTimeout(() => { lastW = window.innerWidth; schedule(); }, 200); });
})();
