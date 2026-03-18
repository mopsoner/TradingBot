#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source .venv/bin/activate
MODE="${1:-once}"
case "$MODE" in
  once)
    python runner.py --once
    ;;
  loop)
    python runner.py
    ;;
  backtest)
    python backtest.py
    ;;
  *)
    echo "Usage: bash run.sh [once|loop|backtest]"
    exit 1
    ;;
esac
