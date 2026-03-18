# Binance REST SMC Lite

Moteur léger d'analyse SMC/Wyckoff basé uniquement sur les données publiques Binance REST.
Pensé pour vieux Raspberry Pi en terminal.

## Objectif
- aucune clé API
- aucune exécution d'ordre
- aucun websocket
- polling REST léger
- signaux locaux + logs SQLite
- backtest intégré

## Fonctions
- collecte BTCUSDT / ETHUSDT
- klines 1m / 5m / 15m
- RSI
- détection simple de spring / UTAD
- confirmation break M5
- classement par session (Asia / London / NY)
- backtest local

## Installation Raspberry Pi
```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip sqlite3
cd ~
git clone <TON_REPO>
cd TradingBot/binance_rest_smc
cp config.example.json config.json
bash install_pi.sh
bash run.sh once
```

## Lancer
```bash
bash run.sh once
bash run.sh loop
bash run.sh backtest
```

## Fichiers
- `collector.py` : récupération REST Binance
- `signals.py` : RSI, swings, sweep helpers
- `engine.py` : logique SMC/Wyckoff légère
- `storage.py` : SQLite + logs texte
- `runner.py` : mode live
- `backtest.py` : replay/backtest
- `config.example.json` : configuration
- `install_pi.sh` : bootstrap Pi
- `run.sh` : launcher
