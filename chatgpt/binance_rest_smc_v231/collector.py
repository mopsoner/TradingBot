from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any
from urllib.parse import urlencode

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

    def _signed_get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if not self.api_key or not self.api_secret:
            raise RuntimeError("isolated_only requires Binance API key and secret")
        query = dict(params or {})
        query["timestamp"] = int(time.time() * 1000)
        qs = urlencode(query, doseq=True)
        signature = hmac.new(self.api_secret.encode("utf-8"), qs.encode("utf-8"), hashlib.sha256).hexdigest()
        query["signature"] = signature
        return self._get(path, query, headers={"X-MBX-APIKEY": self.api_key})

    def exchange_info(self) -> dict[str, Any]:
        return self._get("/api/v3/exchangeInfo")

    def isolated_margin_pairs(self) -> set[str]:
        rows = self._signed_get("/sapi/v1/margin/isolated/allPairs")
        out: set[str] = set()
        if isinstance(rows, list):
            for row in rows:
                symbol = row.get("symbol")
                if symbol:
                    out.add(symbol)
        return out

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
        isolated_symbols: set[str] | None = None
        if isolated_only:
            isolated_symbols = self.isolated_margin_pairs()
        out: list[str] = []
        for symbol in info.get("symbols", []):
            if spot_only and not symbol.get("isSpotTradingAllowed", False):
                continue
            if isolated_symbols is not None and symbol.get("symbol") not in isolated_symbols:
                continue
            elif margin_only and not symbol.get("isMarginTradingAllowed", False):
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


def safe_sleep(seconds: int) -> None:
    time.sleep(seconds)
