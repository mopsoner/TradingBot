# Binance REST SMC Lite V2.3

Version V2.3 organisée autour du coeur de ta méthode SMC / Wyckoff.

## Principes intégrés
- timing par session : Asia / London open / London / New York
- zones de liquidité : Asia high/low, London high/low, recent highs/lows, equal highs/lows simplifiés
- Spring / UTAD comme zones de travail, pas entrées automatiques
- confirmation par break M5
- RSI comme filtre de zone
- take profit zones par timing
- score multi-critères
- pipeline visible par crypto
- backtest intégré

## Contrainte matérielle
Pensé pour vieux Raspberry Pi :
- REST only
- aucun websocket
- aucune clé API
- scan par batch rotatif
- interface locale ultra légère

## Arborescence
- `collector.py` : Binance REST + découverte auto des symboles
- `signals.py` : RSI, sessions, liquidité, equal highs/lows
- `engine.py` : coeur méthode V2.3
- `storage.py` : SQLite + logs + dashboard.json
- `runner.py` : scan live / batch / génération dashboard
- `backtest.py` : backtest de la logique simplifiée
- `ui/` : interface locale read-only

## Modes
```bash
bash run.sh once
bash run.sh loop
bash run.sh backtest
bash run.sh symbols
bash run.sh serve-ui
```

## Raspberry Pi
```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip sqlite3
cd ~
git clone https://github.com/mopsoner/TradingBot.git
cd TradingBot/chatgpt/binance_rest_smc_v23
cp config.example.json config.json
bash install_pi.sh
bash run.sh once
```

## UI locale
```bash
bash run.sh serve-ui
```
Puis ouvrir `http://IP_DU_PI:8080/`
