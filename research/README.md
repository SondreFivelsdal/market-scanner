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

## Terminal-fanens oppsett (site/regime.js) – research/setup_bt.js

Regler bestemt på forhånd (ikke tilpasset): regelscore (5 enkle regler) på 1 t, 4 t og 1 d må peke samme vei, og risiko/gevinst til nærmeste 4 t-nivå må være minst 1,5. Inngang ved neste 1 t-åpning, stopp eller mål 1, maks 30 dager, 0,1 % gebyr per side. 7 coins, nov. 2022 – okt. 2026.

| | Antall | Snitt per handel | t | Treff |
|---|---|---|---|---|
| Alle | 936 | −0,03 R | −0,7 | 35 % |
| Long | 449 | +0,02 R | 0,3 | 37 % |
| Short | 487 | −0,09 R | −1,3 | 34 % |

Konklusjon: ingen påvist fordel. Nettsiden viser dette rett under hver vurdering, og «Mulig long/short» skal leses som en oversikt over hva tidsrammene sier – ikke som et handelssignal.

## EMA-linje: kjøp over, selg under (research/ema_test.js, workflow «EMA-test», resultater på grenen research-results)

Signal på lukk, handel på neste lukk, 0,1 % gebyr, kontantrente (^IRX) for aksjer/fond, utbyttejustert. Kjørt 24. okt. 2026.

Antall tilfeller der regelen ga høyere årlig avkastning enn å kjøpe og holde:

| | EMA 50 d | EMA 200 d | EMA 21 u |
|---|---|---|---|
| Krypto topp 5 (BTC, ETH, BNB, XRP, SOL) | 4/5 | 3/5 | 3/5 |
| Krypto, siste halvdel av perioden | 1/5 | 0/5 | 0/5 |
| 28 aksjer, fond og indekser (USA + Oslo Børs) | 2/28 | 4/28 | 3/28 |

Maks fall var mindre enn ved kjøp-og-hold i de fleste tilfellene. Konklusjon: regelen er en fallbeskyttelse, ikke en avkastningsmotor. Fordelen i krypto kom nesten bare fra krakket i 2018 og 2022 og har ikke holdt seg i siste halvdel.
