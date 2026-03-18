# Binance REST SMC Lite V2

Version V2 du moteur léger SMC/Wyckoff pour Raspberry Pi ancien.

## Nouveautés V2
- support de **toutes les paires Spot Binance actives** via découverte automatique
- scan par lots pour éviter de saturer un vieux Raspberry Pi
- mini dashboard local ultra léger (HTML + JS + JSON)
- pipeline visible par symbole
- signaux simulés et trades théoriques visibles dans l'interface
- backtest intégré

## Philosophie
- REST only
- aucune clé API
- aucun ordre envoyé
- aucun websocket
- terminal-first + mini UI locale read-only

## Flux
1. découverte des symboles Spot actifs
2. scan par batch rotatif
3. calcul RSI + extrêmes + spring / UTAD / break
4. sauvegarde SQLite + JSON dashboard
5. affichage local dans l'UI

## Modes
```bash
bash run.sh once
bash run.sh loop
bash run.sh backtest
bash run.sh symbols
```

## Raspberry Pi
Sur un vieux Raspberry Pi, le support de toutes les cryptos existe, mais le scan se fait par rotation de batch pour rester léger. La configuration par défaut privilégie les paires `quoteAsset = USDT` et limite le nombre de symboles par cycle.

## UI locale
Le moteur génère `data/dashboard.json`.
L'interface statique se trouve dans `ui/`.
Tu peux l'ouvrir localement ou servir le dossier avec Python.

## Installation rapide
```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip sqlite3
cd ~
git clone https://github.com/mopsoner/TradingBot.git
cd TradingBot/chatgpt/binance_rest_smc_v2
cp config.example.json config.json
bash install_pi.sh
bash run.sh once
```

## Servir l'UI localement
```bash
cd ui
python3 -m http.server 8080
```
Puis ouvrir `http://<ip-du-pi>:8080/`.
