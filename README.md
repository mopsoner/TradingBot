# OpenClaw SMC/Wyckoff Trading Bot — GitHub Project Scaffold

Ce dépôt contient le **scaffold documentaire complet** du projet OpenClaw pour ETHUSDT/BTCUSDT.

## Objectif
Définir une base claire pour implémenter un bot de trading avec une logique SMC/Wyckoff stricte :
1. Liquidity zone
2. Liquidity sweep
3. Spring / UTAD
4. Displacement
5. Break of Structure (BOS)
6. Fibonacci retracement entry (0.5 / 0.618 / 0.705)
7. Expansion vers la prochaine zone de liquidité

> Règle clé : pas de sweep/displacement/BOS/fib entry = pas de trade.

## Structure du dépôt
- `AGENTS.md` : mission, contraintes, règles de sécurité.
- `agents/` : définition de l’agent (`eth-liquidity-trader`), prompts et config.
- `skills/` : spécifications de chaque module + schémas JSON.
- `docs/` : architecture, stratégie, sessions, risque, journal, backtesting.
- `cron/` : exemples de planification.
- `templates/` : checklist setup et template de rapport de recherche.
- `data/` : conventions d’organisation des données.

## Modes supportés
- `research`
- `paper` (mode par défaut)
- `live` (après validations risque + backtest)

## Démarrage rapide (implémentation)
1. Implémenter les modules décrits dans `skills/`.
2. Respecter les pipelines décrits dans `docs/architecture.md`.
3. Valider la stratégie via `docs/backtesting.md`.
4. Démarrer en `paper` avant tout passage en `live`.

## Remarque
Ce dépôt inclut maintenant une implémentation Python exécutable (pipeline signal/risk/backtest/paper/live simulé + journal), avec alimentation market data Binance et fallback de recherche.

## Validation de la PR
Exécuter la validation locale du scaffold :

```bash
python scripts/validate_scaffold.py
```

La même vérification est exécutée automatiquement via GitHub Actions (`.github/workflows/validate-scaffold.yml`).



## État actuel
- Binance klines intégrées pour market-data.
- Détection SMC/Wyckoff stricte (sweep, Spring/UTAD, displacement, BOS, fib).
- Gardes risque/backtest actives.
- Paper trading avec slippage/frais simulés et limite de position par symbole.
- Journal JSONL détaillé des setups acceptés/rejetés.
