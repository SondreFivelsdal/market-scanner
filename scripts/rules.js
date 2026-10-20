// Regelen for «tydelig signal» (eget push-varsel med høy prioritet). Brukes både av update.js (live) og backtest.js,
// slik at backtesten tester nøyaktig den samme regelen som sender varsler.
// c: coin-resultat fra engine.run(), prevCode: status ved forrige bygg/dag, newDay: om det har kommet et nytt dagslukk.
function clearSignal(c, prevCode, newDay) {
  const st = c.status;
  const today = newDay ? (c.eventsAll || []).filter(e => e.t === c.asOf) : [];
  const has = t => today.some(e => e.type === t);
  const atSup = st.nearSup || !!st.recentUp, atRes = st.nearRes || !!st.recentDn;
  if (st.code === 'buy' && prevCode !== 'buy') return { dir: 1, kind: 'status', why: 'Alle kriteriene for et kjøpsoppsett er oppfylt.' };
  if (st.code === 'sell' && prevCode !== 'sell') return { dir: -1, kind: 'status', why: 'Alle kriteriene for et salgs-/exit-oppsett er oppfylt.' };
  if (has('wtBuy') && atSup && c.long.score > -20) return { dir: 1, kind: 'wt', why: 'WaveTrend kjøpssignal mens kursen står ved støtte.' };
  if (has('wtSell') && atRes) return { dir: -1, kind: 'wt', why: 'WaveTrend salgssignal mens kursen står ved motstand.' };
  return null;
}
module.exports = { clearSignal };
