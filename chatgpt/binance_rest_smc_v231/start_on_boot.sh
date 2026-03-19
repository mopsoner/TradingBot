#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"

cd "$APP_DIR"

# Attendre un peu que le réseau et le système soient prêts
sleep 15

# Nettoyage léger des anciens process
pkill -f "python runner.py" || true
pkill -f "python3 runner.py" || true
pkill -f "python admin_server.py" || true
pkill -f "python3 admin_server.py" || true

# Initialiser le dashboard/cache une fois
bash "$APP_DIR/run.sh" once >> "$LOG_DIR/bootstrap.log" 2>&1 || true

# Lancer la boucle live en arrière-plan
nohup bash "$APP_DIR/run.sh" loop >> "$LOG_DIR/runner_boot.log" 2>&1 &

# Lancer l'UI en arrière-plan
nohup bash "$APP_DIR/run.sh" serve-ui >> "$LOG_DIR/ui_boot.log" 2>&1 &

# Garder le service vivant et vérifier que les deux process existent
while true; do
  RUNNER_COUNT=$(pgrep -fc "python3? .*runner.py" || true)
  UI_COUNT=$(pgrep -fc "python3? .*admin_server.py" || true)

  if [ "${RUNNER_COUNT:-0}" -lt 1 ]; then
    nohup bash "$APP_DIR/run.sh" loop >> "$LOG_DIR/runner_boot.log" 2>&1 &
  fi

  if [ "${UI_COUNT:-0}" -lt 1 ]; then
    nohup bash "$APP_DIR/run.sh" serve-ui >> "$LOG_DIR/ui_boot.log" 2>&1 &
  fi

  sleep 30
done
