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
  generate-config)
    python generate_isolated_usdc_config.py
    ;;
  bootstrap-history)
    python bootstrap_history.py
    ;;
  prepare-data)
    python generate_isolated_usdc_config.py
    python bootstrap_history.py
    ;;
  serve-ui)
    python admin_server.py
    ;;
  *)
    echo "Usage: bash run.sh [once|loop|backtest|symbols|generate-config|bootstrap-history|prepare-data|serve-ui]"
    exit 1
    ;;
esac
