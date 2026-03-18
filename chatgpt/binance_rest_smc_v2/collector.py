from __future__ import annotations

import time
from typing import Any
import requests


class BinanceRestClient:
    def __init__(self, base_url: str, timeout: int = 10) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.timeout = timeout

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}{path}"
        response = self.session.get(url, params=params or {}, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def exchange_info(self) -> dict[str, Any]:
        return self._get("/api/v3/exchangeInfo")

    def discover_symbols(self, quote_assets: list[str], status: str, spot_only: bool, max_symbols_total: int) -> list[str]:
        info = self.exchange_info()
        out: list[str] = []
        for symbol in info.get("symbols", []):
            if spot_only and not symbol.get("isSpotTradingAllowed", False):
                continue
            if symbol.get("status") != status:
                continue
            if quote_assets and symbol.get("quoteAsset") not in quote_assets:
                continue
            out.append(symbol["symbol"])
        out.sort()
        return out[:max_symbols_total]

    def klines(self, symbol: str, interval: str, limit: int) -> list[dict[str, Any]]:
        raw = self._get("/api/v3/klines", {"symbol": symbol, "interval": interval, "limit": limit})
        out: list[dict[str, Any]] = []
        for row in raw:
            out.append(
                {
                    "open_time": int(row[0]),
                    "open": float(row[1]),
                    "high": float(row[2]),
                    "low": float(row[3]),
                    "close": float(row[4]),
                    "volume": float(row[5]),
                    "close_time": int(row[6]),
                }
            )
        return out

    def price(self, symbol: str) -> float:
        data = self._get("/api/v3/ticker/price", {"symbol": symbol})
        return float(data["price"])


def safe_sleep(seconds: int) -> None:
    time.sleep(seconds)
