# replit.md

## Overview

This is a standalone web-based crypto trading platform inspired by the OpenClaw architecture. It is a full-stack application designed to trade ETHUSDT and BTCUSDT using a strict Smart Money Concepts (SMC) / Wyckoff methodology — no conventional indicators (RSI, MACD, EMA) are permitted as entry logic.

The platform runs in three modes: **research**, **paper** (default), and **live**. It enforces a mandatory signal sequence before any trade is considered valid:

> liquidity zone → liquidity sweep → Spring/UTAD (+ fake breakout) → displacement → BOS → expansion vers prochaine liquidité → Fibonacci retracement entry (0.5 / 0.618 / 0.705)

RSI / MACD / EMA : **jamais des déclencheurs**. Sessions et weekend : filtres uniquement. Week-end toujours bloqué.

Every setup, whether accepted or rejected, must be logged. Live trading requires both a backtest approval and an explicit risk approval.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend

- **Framework:** React 18 with TypeScript
- **Build tool:** Vite (port 3000, proxies `/api` to backend on port 8000)
- **Structure:** Single-page app with a sidebar navigation and page-based routing via a `useState` switcher in `App.tsx`
- **Pages:** Dashboard, Strategy Settings, Data Manager, Backtests, Live Trades, Positions (Margin Isolé), Admin, Signals, Logs, Journal Setups, AI Workshop, Pipeline Live
- **API layer:** Thin `api.ts` service using native `fetch`; wrapped by a `useApi` hook for loading/error state management
- **No UI framework library** (e.g., no MUI or Tailwind) — custom CSS variables in `index.css` for a dark GitHub-style theme

### Backend

- **Framework:** FastAPI (Python)
- **Entry point:** `backend/app/main.py` — mounts the API router under `/api` and initializes the database on startup
- **Database:** SQLite via SQLModel ORM (`trading_platform.db`). The engine is created in `backend/app/db/session.py`.
  - Tables: `Signal`, `Trade`, `Position`, `BacktestResult`, `Log`, `MarketCandle`, `BotJob`, `ScanSchedule`, `StrategyProfile`
  - Note: SQLite is used for simplicity. If Postgres is needed, only the connection string in `session.py` needs to change.
- **Configuration:** Pydantic models in `backend/app/core/config.py` — covers strategy, risk, system, and trading settings. A global `config` singleton is used throughout.

### Skills / Service Modules

Each skill is an isolated service class in `backend/app/services/`:

| Skill | Class | Responsibility |
|---|---|---|
| market-data | `MarketDataService` | Normalizes candle data, lists tradeable symbols |
| smc-wyckoff-signals | `SignalEngine` | Validates the full SMC/Wyckoff signal sequence |
| session-filter | `SessionFilter` | Filters trades to London/NY session hours |
| risk-manager | `RiskManager` | Enforces daily/weekly loss limits and position caps |
| backtesting-manager | `BacktestingEngine` | Computes win rate, profit factor, expectancy, drawdown |
| paper-trade-manager | `PaperTradeManager` | Simulates trade execution in-memory |
| trade-execution | `ExecutionService` | Builds Binance isolated margin order payloads; paper mode by default |
| trade-journal | `TradeJournal` (in `journal.py`) | Records all accepted and rejected setups |

### Signal Engine Logic

`SignalEngine.detect()` enforces strict sequential validation:
1. Liquidity zone present
2. Sweep detected
3. Spring (long) or UTAD (short) confirmed
4. Displacement confirmed
5. BOS confirmed
6. Fib retracement level is exactly one of `[0.5, 0.618, 0.705]`

Any missing step returns `None` (no trade).

### OpenClaw Reference Layer (`src/openclaw/`)

A parallel Python package in `src/openclaw/` mirrors the same skill set with more sophisticated implementations (real Binance kline fetching with synthetic fallback, slippage/fee simulation in paper trades, walk-forward backtesting). This is the "engine" layer; the `backend/app/services/` layer is the web-adapted version.

### Three Operating Modes

- **research:** market-data → smc-wyckoff-signals → backtesting-manager → reports
- **paper:** market-data → smc-wyckoff-signals → risk-manager → paper-trade-manager → trade-journal
- **live:** market-data → smc-wyckoff-signals → risk-manager → trade-execution → trade-journal

### Safety Rules

- Default mode is always **paper**
- Live mode requires: API key + API secret + explicit `risk_approved=True` + `backtest_approval=True`
- Backtest approval criteria: profit_factor > 1.30, expectancy > 0, max_drawdown < 12%, minimum 50 trades
- All decisions (valid or rejected) are journaled

### Testing

Tests live in `tests/` and cover:
- Signal engine sequence validation
- Risk manager limit enforcement
- Backtesting engine metric computation
- Execution service payload construction

Run with: `pytest -q`

---

## External Dependencies

### Python (Backend)

- **FastAPI** — REST API framework
- **SQLModel** — ORM over SQLAlchemy, used with SQLite
- **Pydantic** — config validation and data models
- **Uvicorn** — ASGI server (`uvicorn backend.app.main:app --reload`)

### JavaScript (Frontend)

- **React 18** — UI rendering
- **TypeScript** — type safety
- **Vite** — dev server and bundler
- **@vitejs/plugin-react** — JSX transform

### External Services

- **Binance API** — market data (klines via `https://api.binance.com/api/v3/klines`) and isolated margin order placement (`/sapi/v1/margin/order`). The `MarketDataService` in `src/openclaw/market_data.py` falls back to synthetic OHLCV data if Binance is unreachable.
- No other third-party services are integrated. No authentication service, no message queue, no external database.

### Data Storage

- **SQLite** (`trading_platform.db`) — default, zero-config, created automatically on startup
- **JSONL flat file** (`data/trade_journal.jsonl`) — append-only decision log used by the `src/openclaw/` journal
- Historical candle data stored in `data/historical/`, backtest reports in `data/backtests/`