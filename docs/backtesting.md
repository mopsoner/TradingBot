# Backtesting Specification

## What to test
- Spring vs UTAD
- Fib entry 0.5 / 0.618 / 0.705
- Session filter impact
- Weekday vs weekend
- ETHUSDT vs BTCUSDT
- Timeframe combinations

## Metrics
- number of trades
- win rate
- profit factor
- expectancy
- max drawdown
- average R multiple
- performance by session
- performance by pattern
- performance by fib level
- performance by weekday/weekend

## Walk-forward
Use segmented train/validation/test instead of one global in-sample result.

## Live approval
- profit_factor > 1.30
- expectancy > 0
- max_drawdown < 12%
- minimum 50 trades for a setup family
