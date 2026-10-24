// Hovedfil: to faner (Oversikt og Historiske scenarioer). Valgt fane og coin ligger i adressen (#tab=…&coin=…).
(() => {
  'use strict';
  const TABS = ['terminal', 'historikk'];
  window.COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'POL', 'SAND'];
  window.NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano', POL: 'Polygon', SAND: 'The Sandbox' };
  const tabNow = () => { const p = dash.params().tab; return TABS.includes(p) ? p : 'terminal'; };
  document.querySelectorAll('#faner [data-tab]').forEach(b => b.addEventListener('click', () => { dash.setParams({ tab: b.dataset.tab }); window.scrollTo({ top: 0 }); }));
  function draw() {
    const tab = tabNow();
    document.querySelectorAll('#faner [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
    TABS.forEach(t => { document.getElementById(t).hidden = t !== tab; });
    try { if (tab === 'terminal' && window.TERM) TERM.render(); if (tab === 'historikk' && window.HIST) HIST.render(); } catch (e) { console.error(e); }
  }
  dash.onData(draw); draw();
})();
