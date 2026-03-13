from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
from pathlib import Path
import sqlite3
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .models import Trade


class TradeExecution:
    """Live execution wrapper.

    Uses Binance signed endpoint when enabled via env:
    - OPENCLAW_LIVE_ENABLED=true
    - BINANCE_API_KEY, BINANCE_API_SECRET
    Optional:
    - BINANCE_BASE_URL (default https://api.binance.com)
    """

    def __init__(self, db_path: str = "data/execution_state.db") -> None:
        self.executed: list[Trade] = []
        self.db_path = db_path
        self._init_db()

    def execute(self, trade: Trade, risk_approved: bool, backtest_approved: bool) -> str:
        if not risk_approved:
            raise PermissionError("risk approval required")
        if not backtest_approved:
            raise PermissionError("backtest approval required before live mode")

        live_enabled = os.getenv("OPENCLAW_LIVE_ENABLED", "false").lower() == "true"
        if not live_enabled:
            raise PermissionError("live_execution_disabled")

        api_key = os.getenv("BINANCE_API_KEY", "")
        api_secret = os.getenv("BINANCE_API_SECRET", "")
        if not api_key or not api_secret:
            raise PermissionError("missing_binance_credentials")

        order_payload = self._place_binance_market_order(trade, api_key=api_key, api_secret=api_secret)
        self.executed.append(trade)
        order_id = f"live-{order_payload.get('orderId', len(self.executed))}"
        self._persist_execution(order_id, trade, order_payload)
        return order_id

    def _place_binance_market_order(self, trade: Trade, api_key: str, api_secret: str) -> dict:
        side = "BUY" if trade.direction == "long" else "SELL"
        params = {
            "symbol": trade.symbol,
            "side": side,
            "type": "MARKET",
            "quantity": f"{trade.size:.6f}",
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
            "recvWindow": 5000,
        }
        query = urlencode(params)
        signature = hmac.new(api_secret.encode("utf-8"), query.encode("utf-8"), hashlib.sha256).hexdigest()
        body = f"{query}&signature={signature}".encode("utf-8")

        base_url = os.getenv("BINANCE_BASE_URL", "https://api.binance.com").rstrip("/")
        request = Request(
            url=f"{base_url}/api/v3/order",
            data=body,
            method="POST",
            headers={"X-MBX-APIKEY": api_key, "Content-Type": "application/x-www-form-urlencoded"},
        )
        with urlopen(request, timeout=8.0) as response:
            return json.loads(response.read().decode("utf-8"))

    def _init_db(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                order_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                direction TEXT NOT NULL,
                payload TEXT NOT NULL,
                trade_json TEXT NOT NULL
            )
            """
        )
        conn.commit()
        conn.close()

    def _persist_execution(self, order_id: str, trade: Trade, payload: dict) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "INSERT INTO executions(ts, order_id, symbol, direction, payload, trade_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                datetime.now(timezone.utc).isoformat(),
                order_id,
                trade.symbol,
                trade.direction,
                json.dumps(payload),
                json.dumps(asdict(trade), default=str),
            ),
        )
        conn.commit()
        conn.close()
