# Forskning: finnes det daytrading-oppsett som tjener penger etter gebyr?

Kjørt 20. okt 2026. Data: Binance spot, 21. okt 2022 – 20. okt 2026, BTC, ETH, XRP, ADA, SOL, SAND og POL (fra sept 2024).
Hent data: kjør workflowen «Hent forskningsdata» (lagrer på grenen `research-data`), last ned `*.json.gz` til `research/data/`.

- `lib.js` – data, kausale indikatorer, simulering (inngang på neste åpning, stopp før mål, gap fylles på åpning, gebyr per side).
- `strategies.js` – kandidatene: utbrudd fra N-bars kanal (1t/4t), pullback i trend (1t), RSI(2)-dipp, utbrudd fra Asia-rangen (15m) og dagens oppsett i appen (15m).
- `run.js` – alle varianter, utvikling (første 60 %) og validering (neste 20 %). `control.js` – samme exit-regler med tilfeldige innganger og ulike gebyr. `holdout.js` – én gangs test på siste 20 % (2026-01-01 →) for forhåndsvalgte kandidater.

## Resultat (gebyr + glidning 0,07 % per side)
- Alle oppsett på 15 min (dagens tre og Asia-utbrudd) og RSI(2)-dipp taper etter gebyr i alle perioder.
- Eneste som besto alle tre periodene og slo tilfeldige innganger hver gang: **LONG ved 4t-lukk over høyeste høy siste 55 × 4t, bare når dagsgrafen er over EMA50; stopp 2 ATR, glidende stopp 3 ATR**.
  Utvikling +0,41 R (n 225, t 2,4) · validering +0,16 R (n 77) · holdout +0,18 R (n 62, t 0,7; tilfeldig +0,01 R). Treff ~30 %, snitt ~2,5 døgn i handel.
- Forbehold: holdout-utvalget er lite og ikke statistisk sikkert; perioden har vært gunstig for trendfølging; handlene varer i dager (swing, ikke daytrading).
