# AGENTS.md

## Mission
Build an OpenClaw trading bot for ETHUSDT and BTCUSDT using only:
- liquidity zone
- liquidity sweep
- Spring / UTAD
- displacement
- BOS
- Fibonacci retracement entries (0.5 / 0.618 / 0.705)

Do not use RSI, MACD, EMA, or similar indicators as entry logic.

## Required components
- market-data
- smc-wyckoff-signals
- session-filter
- risk-manager
- backtesting-manager
- paper-trade-manager
- trade-execution
- trade-journal

## Required modes
- research
- paper
- live

## Strategy logic
Long:
- liquidity below
- sweep below
- Spring
- bullish displacement
- bullish BOS
- retracement into fib 0.5 / 0.618 / 0.705

Short:
- liquidity above
- sweep above
- UTAD
- bearish displacement
- bearish BOS
- retracement into fib 0.5 / 0.618 / 0.705

## Safety
- default to paper mode
- require risk approval for execution
- require backtest approval before live mode
- log every accepted and rejected setup
