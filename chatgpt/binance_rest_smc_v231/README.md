# Binance REST SMC Lite V2.3.1

V2.3.1 = V2.3 + cache local léger des candles en SQLite.

## Ajout principal
- cache OHLC local SQLite
- priorité à la lecture locale
- fallback Binance REST si données manquantes
- réinjection des candles dans le cache à chaque scan

## Pourquoi
- moins d'appels Binance
- meilleur backtest local
- historique local léger
- toujours compatible vieux Raspberry Pi

## Lancer
```bash
bash run.sh once
bash run.sh loop
bash run.sh backtest
bash run.sh serve-ui
```
