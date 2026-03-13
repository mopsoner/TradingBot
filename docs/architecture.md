# Architecture

## Pipeline
market-data
→ smc-wyckoff-signals
→ session-filter
→ risk-manager
→ backtesting-manager
→ paper/live execution
→ trade-journal

## Research pipeline
market-data → smc-wyckoff-signals → backtesting-manager → reports

## Paper pipeline
market-data → smc-wyckoff-signals → risk-manager → paper-trade-manager → trade-journal

## Live pipeline
market-data → smc-wyckoff-signals → risk-manager → trade-execution → trade-journal
