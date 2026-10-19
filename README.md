# Market scanner – AI Crypto Analyst

Teknisk analyse av BTC, XRP, POL og SAND (Binance-kurser). Kjører automatisk i GitHub Actions og publiseres på
**https://sondrefivelsdal.github.io/market-scanner/**

- `engine.js` – analysemotoren (samme som i Claude-prosjektet, `scanner/v2/engine.js`).
- `scripts/update.js` – henter candles fra Binance sitt åpne markedsdata-API, kjører motoren, skriver `site/data/*.json` og sender push-varsel (ntfy).
- `site/` – nettsiden (`index.html`, `app.js`, `dash-shim.js`). Live-pris hentes direkte i nettleseren hvert 30. sekund.
- `.github/workflows/update.yml` – kjører hvert 15. minutt, men bygger og publiserer bare når en ny 4-timers candle er lukket (ca. 6 ganger i døgnet). Dagsanalysen endrer seg ved dagslukk (kl. 02:00 norsk sommertid / 01:00 vintertid).

**Varsler:** installer appen *ntfy* og abonner på kanalen `msc-6d2f0a04f4c8`. Du får varsel når en status endres
(høy prioritet ved «Mulig kjøpsoppsett» / «Mulig salgs-/exit-oppsett»), ved nye signaler etter dagslukk og ved bekreftede brudd.

Kjør manuelt: Actions → «Oppdater scanner» → *Run workflow*. Test lokalt: `node test_engine.js` (krever `candles_1d.json` og `candles_4h.json` i rotmappen).

Ikke finansiell rådgivning.
