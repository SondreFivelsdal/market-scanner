// Hovedfil: fanene (Oversikt, Graf, Teknisk, Historikk, Sammenlign, Makro, Bitcoin-syklus, Sentiment, Scenarioer). Valgt fane og coin ligger i adressen (#tab=…&coin=…).
(() => {
  'use strict';
  const TABS = ['dash', 'terminal', 'ta', 'hendelser', 'cmp', 'makro', 'syklus', 'fng', 'historikk'];
  window.COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'POL', 'SAND'];
  window.NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano', POL: 'Polygon', SAND: 'The Sandbox' };
  const tabNow = () => { const p = dash.params().tab; return TABS.includes(p) ? p : 'dash'; };
  const tb = document.getElementById('theme-btn'); if (tb) tb.addEventListener('click', () => { const l = document.documentElement.dataset.theme !== 'light'; try { localStorage.setItem('ms-theme', l ? 'light' : 'dark'); } catch (e) { /* ignorer */ } location.reload(); });
  document.querySelectorAll('#faner [data-tab]').forEach(b => b.addEventListener('click', () => { dash.setParams({ tab: b.dataset.tab }); window.scrollTo({ top: 0 }); }));
  function draw() {
    const tab = tabNow();
    document.querySelectorAll('#faner [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
    TABS.forEach(t => { document.getElementById(t).hidden = t !== tab; });
    try { if (tab === 'terminal' && window.TERM) TERM.render(); if (tab === 'historikk' && window.HIST) HIST.render(); if (tab === 'makro' && window.MACRO) MACRO.render(); if (tab === 'hendelser' && window.EVENTS) EVENTS.render(); if (tab === 'syklus' && window.CYCLE) CYCLE.render(); if (tab === 'ta' && window.TAUI) TAUI.render(); if (tab === 'fng' && window.FNG) FNG.render(); if (tab === 'dash' && window.DASHUI) DASHUI.render(); if (tab === 'cmp' && window.CMP) CMP.render(); if (tab === 'syklus' && window.RPUI) RPUI.render(); } catch (e) { console.error(e); }
  }
  dash.onData(draw); draw();
})();
