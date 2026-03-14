# Web Trading Platform (OpenClaw-Inspired Architecture)

Standalone web-based crypto trading platform with modular "skills" inspired by OpenClaw architecture, without importing OpenClaw.

## Architecture

- `backend/` FastAPI backend API + trading engine orchestration.
- `backend/skills/` isolated skill modules:
  - market-data
  - smc-wyckoff-signals
  - session-filter
  - risk-manager
  - backtesting-manager
  - paper-trade-manager
  - trade-execution
  - trade-journal
- `frontend/` React admin dashboard with configurable pages.
- `tests/` unit tests for critical engine flows.

## Features

- Dynamic Binance symbol universe loading.
- SMC/Wyckoff sequence-only strategy (liquidity → sweep → spring/utad → displacement → BOS → fib retracement).
- Per-symbol risk controls, max concurrent trades, and capital allocation.
- Backtesting with walk-forward and performance metrics.
- Paper-by-default execution safety with live-trade safeguards.

## Run backend

```bash
uvicorn backend.app.main:app --reload
```

## Run tests

```bash
pytest -q
```
