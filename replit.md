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
  - Tables: `Signal`, `Trade`, `Position`, `BacktestResult`, `Log`, `MarketCandle`, `BotJob`, `ScanSchedule`, `StrategyProfile`, `PipelineRun`
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
| walk-forward | `WalkForwardService` (in `walkforward.py`) | Downloads real OHLCV data via yfinance, runs SMC/Wyckoff 7-step detection on sliding windows, simulates paper trades |
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

### RSI 4H Direction Selector + Dual Profile Mode

The `replay_engine.py` supports two advanced filtering modes, both transparent to the 7 mandatory pipeline steps:

**Simple RSI filter** (`use_rsi4h_direction=True`): Computes RSI 14-period on 4H candles before the pipeline. Only allows LONG when RSI > `rsi4h_bull_min` (default 55), SHORT when RSI < `rsi4h_bear_max` (default 45). Neutral zone skipped.

**Dual Profile mode** (`use_dual_mode=True`): A single profile contains `bull_config` and `bear_config` sub-dicts. The RSI 4H value routes each signal to the appropriate config block **before step 2 (Wyckoff)**, so Wyckoff pattern selection (Spring vs UTAD) and all other params (RR, SL mult, fib levels, lookback) can differ per regime. Steps 1-7 use `eff_*` (effective) variables populated from the selected config.

Profile structure for dual mode:
```json
{
  "use_dual_mode": true,
  "rsi4h_period": 14,
  "rsi4h_bull_min": 55.0,
  "rsi4h_bear_max": 45.0,
  "bull_config": { "enable_spring": true, "enable_utad": false, "take_profit_rr": 4.0, ... },
  "bear_config": { "enable_spring": false, "enable_utad": true,  "take_profit_rr": 2.0, "fib_entry_split": true, ... }
}
```

**Active profile:** `ETH-SMC-Dual-Optimized` (id=15), optimised on 4 years of ETHUSDT data.
- Bull (RSI > 55): Spring / RR=4.0 / lb=16 → 116 trades, WR=31.9%, +69R
- Bear (RSI < 45): UTAD / RR=2.0 / lb=16 → 80 trades, WR=50.0%, +8R
- **Combined: 196 trades, WR=39.3%, PF=1.78, +77R, MaxDD=12.6%**

**17 USDC Dual-Mode Profiles (ids 18-34)** — Optimized library for Binance Isolated Margin:
- **Grid winner**: Bull RR=4.0, Bear RR=2.0 (grid: 3×2×2=12 combos per pair)
- **wyckoff_lookback**: 16 for pairs with ≥80K candles, 14 for shorter-history pairs
- **DB critical fix**: `idx_mc_sym_tf_ts` index on `marketcandle` (3.5M rows) → queries 4500x faster (4.5s → 0.001s)

### Step 0 Liquidity Mode (`step0_liq_mode`)

Step 0 (EQH/EQL detection) uses a configurable lookback timeframe per profile, determined by a 4-year × 4-mode grid search (17 coins × 4 modes = 68 backtests):

| Mode | Candles | Lookback | Coins |
|---|---|---|---|
| `4h_6bars`  | 4H | 24h (6 bars)  | BTC, BNB, TRX |
| `4h_42bars` | 4H | 1 week (42 bars) | (legacy default) |
| `1h_24h`    | 1H | 24h (24 bars) | ETH, XRP, ADA, DOGE, ALGO, ETC |
| `1h_48h`    | 1H | 48h (48 bars) | LTC, LINK, ATOM, XLM, BCH, NEO, SOL, FET |

**Profile ranking by EXP/T (4-year backtest, best mode per coin):**
- NEO 1h_48h: PF=2.86 n=12 EXP=+0.775R
- XLM 1h_48h: PF=2.56 n=17 EXP=+0.733R
- ALGO 1h_24h: PF=2.36 n=19 EXP=+0.644R
- TRX 4h_6bars: PF=2.11 n=10 EXP=+0.554R
- BNB 4h_6bars: PF=2.04 n=12 EXP=+0.520R
- LTC 1h_48h: PF=2.03 n=37 EXP=+0.530R
- FET 1h_48h: PF=1.79 n=18 EXP=+0.438R
- DOGE 1h_24h: PF=1.80 n=17 EXP=+0.424R
- BTC 4h_6bars: PF=1.78 n=121 EXP=+0.420R ← most statistically robust
- SOL 1h_48h: PF=1.67 n=39 EXP=+0.380R
- BCH 1h_48h: PF=1.52 n=28 EXP=+0.313R
- LINK 1h_48h: PF=1.40 n=24 EXP=+0.248R
- ETH 1h_24h: PF=1.07 n=89 EXP=+0.043R
- ADA 1h_24h: PF=1.00 n=30 EXP=+0.002R
- XRP 1h_24h: PF=0.97 n=51 EXP=-0.018R (excluded from live)
- ATOM 1h_48h: PF=0.98 n=25 EXP=-0.014R (excluded from live)
- ETC: insufficient data

`step0_liq_mode` is stored in each profile's `parameters` JSON. The replay engine and live scanner both read it. The API also accepts a `step0_liq_mode` override in the replay request body for ad-hoc testing.

Data imported: 17 USDC pairs × 3 TF (15m/1h/4h) — ~3.5M candles in DB.

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