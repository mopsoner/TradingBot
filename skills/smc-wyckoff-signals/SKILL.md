# Skill: smc-wyckoff-signals

## Responsibility
Detect only:
- liquidity zone
- liquidity sweep
- Spring
- UTAD
- displacement
- BOS
- Fibonacci entry zone

## Rules
- no sweep = no trade
- no displacement = no trade
- no BOS = no trade
- no fib retracement = no trade
- only 0.5 / 0.618 / 0.705 fib levels are valid

## Output
Return a normalized setup JSON following the signal schema.
