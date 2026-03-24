from __future__ import annotations

import time
from typing import Any

import requests


class BinanceRestClient:
    def __init__(self, base_url: str, timeout: int = 10, api_key: str | None = None, api_secret: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.timeout = timeout
        self.api_key = api_key or ""
        self.api_secret = api_secret or ""

    def _get(self, path: str, params: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> Any:
        url = f"{self.base_url}{path}"
        response = self.session.get(url, params=params or {}, headers=headers or {}, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def exchange_info(self) -> dict[str, Any]:
        return self._get("/api/v3/exchangeInfo")

    def discover_symbols(
        self,
        quote_assets: list[str],
        status: str,
        spot_only: bool,
        max_symbols_total: int,
        margin_only: bool = False,
        isolated_only: bool = False,
    ) -> list[str]:
        info = self.exchange_info()
        out: list[str] = []
        for symbol in info.get("symbols", []):
            if spot_only and not symbol.get("isSpotTradingAllowed", False):
                continue
            if margin_only and not symbol.get("isMarginTradingAllowed", False):
                continue
            if symbol.get("status") != status:
                continue
            if quote_assets and symbol.get("quoteAsset") not in quote_assets:
                continue
            out.append(symbol["symbol"])
        out.sort()
        return out[:max_symbols_total]

    def klines(self, symbol: str, interval: str, limit: int, start_time: int | None = None, end_time: int | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"symbol": symbol, "interval": interval, "limit": limit}
        if start_time is not None:
            params["startTime"] = start_time
        if end_time is not None:
            params["endTime"] = end_time
        raw = self._get("/api/v3/klines", params)
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


def safe_sleep(seconds: float) -> None:
    time.sleep(seconds)
