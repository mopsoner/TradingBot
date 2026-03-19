#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
USER_NAME="$(whoami)"
SERVICE_PATH="/etc/systemd/system/tradingbot.service"

sudo tee "$SERVICE_PATH" >/dev/null <<EOF
[Unit]
Description=TradingBot boot service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP_DIR
ExecStart=/bin/bash $APP_DIR/start_on_boot.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tradingbot.service
sudo systemctl restart tradingbot.service

echo "Service installé et démarré."
echo "Vérification : sudo systemctl status tradingbot.service"
