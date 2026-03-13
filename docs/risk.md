# Risk Rules

## Position risk
- risk_per_trade: 0.5% to 1.0%

## Portfolio risk
- max_open_positions_per_symbol: 1
- daily_loss_limit: 2%
- weekly_loss_limit: 5%

## Execution constraints
- no live order without risk approval
- no live order without backtest profile approval
- no entry outside fib zone
- stop must sit beyond sweep invalidation
