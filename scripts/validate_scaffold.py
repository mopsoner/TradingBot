#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    'AGENTS.md',
    'README.md',
    'agents/eth-liquidity-trader/agent.md',
    'agents/eth-liquidity-trader/config.json',
    'agents/eth-liquidity-trader/prompts/system.md',
    'agents/eth-liquidity-trader/prompts/risk.md',
    'docs/architecture.md',
    'docs/strategy.md',
    'docs/backtesting.md',
    'docs/risk.md',
    'docs/journal.md',
    'docs/sessions.md',
    'skills/smc-wyckoff-signals/SKILL.md',
    'skills/smc-wyckoff-signals/schemas/signal.schema.json',
    'skills/backtesting-manager/schemas/backtest.schema.json',
    'templates/setup_checklist.md',
    'templates/research_report_template.md',
]

JSON_FILES = [
    'agents/eth-liquidity-trader/config.json',
    'skills/smc-wyckoff-signals/schemas/signal.schema.json',
    'skills/backtesting-manager/schemas/backtest.schema.json',
]


def fail(message: str) -> None:
    print(f'[FAIL] {message}')
    sys.exit(1)


def ok(message: str) -> None:
    print(f'[OK] {message}')


for rel in REQUIRED_FILES:
    path = ROOT / rel
    if not path.exists():
        fail(f'Missing required file: {rel}')
ok(f'Required files present ({len(REQUIRED_FILES)})')

for rel in JSON_FILES:
    path = ROOT / rel
    try:
        with path.open('r', encoding='utf-8') as f:
            json.load(f)
    except Exception as exc:  # noqa: BLE001
        fail(f'Invalid JSON in {rel}: {exc}')
ok(f'JSON files parse correctly ({len(JSON_FILES)})')

config = json.loads((ROOT / 'agents/eth-liquidity-trader/config.json').read_text(encoding='utf-8'))

expected_symbols = {'ETHUSDT', 'BTCUSDT'}
if set(config.get('symbol_universe', [])) != expected_symbols:
    fail('config.json symbol_universe must be exactly ETHUSDT and BTCUSDT')
ok('config.json symbol_universe matches expected set')

expected_modes = ['research', 'paper', 'live']
if config.get('modes') != expected_modes:
    fail('config.json modes must be [research, paper, live] in that order')
ok('config.json modes are valid')

if config.get('default_mode') != 'paper':
    fail("config.json default_mode must be 'paper'")
ok('config.json default_mode is paper')

expected_model = [
    'liquidity_zone',
    'liquidity_sweep',
    'spring_or_utad',
    'displacement',
    'bos',
    'fib_entry',
]
if config.get('signal_model') != expected_model:
    fail('config.json signal_model does not match required sequence')
ok('config.json signal_model is valid')

expected_fibs = [0.5, 0.618, 0.705]
if config.get('fib_levels') != expected_fibs:
    fail('config.json fib_levels must be [0.5, 0.618, 0.705]')
ok('config.json fib levels are valid')

print('[DONE] Scaffold validation passed')
