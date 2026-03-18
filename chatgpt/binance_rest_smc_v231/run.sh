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
  symbols)
    python runner.py --symbols
    ;;
  serve-ui)
    python3 -m http.server 8080
    ;;
  *)
    echo "Usage: bash run.sh [once|loop|backtest|symbols|serve-ui]"
    exit 1
    ;;
esac
