from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import random
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from .models import Candle


class MarketDataService:
    """Market data service backed by Binance klines with optional synthetic fallback."""

    def __init__(self, base_url: str = "https://api.binance.com", timeout_s: float = 8.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 200,
        allow_synthetic_fallback: bool = True,
    ) -> list[Candle]:
        interval = self._to_binance_interval(timeframe)
        safe_limit = max(10, min(limit, 1000))

        try:
            raw_klines = self._fetch_binance_klines(symbol=symbol, interval=interval, limit=safe_limit)
            candles = [self._kline_to_candle(row) for row in raw_klines]
            if candles:
                return candles
            raise ValueError("empty_klines")
        except (URLError, HTTPError, TimeoutError, ValueError, json.JSONDecodeError):
            if allow_synthetic_fallback:
                return self._synthetic_ohlcv(symbol=symbol, timeframe=timeframe, limit=safe_limit)
            raise

    def _fetch_binance_klines(self, symbol: str, interval: str, limit: int) -> list[list]:
        query = urlencode({"symbol": symbol.upper(), "interval": interval, "limit": limit})
        url = f"{self.base_url}/api/v3/klines?{query}"
        with urlopen(url, timeout=self.timeout_s) as response:
            payload = response.read().decode("utf-8")
        data = json.loads(payload)
        if not isinstance(data, list):
            raise ValueError("Unexpected Binance response shape")
        return data

    def _kline_to_candle(self, row: list) -> Candle:
        return Candle(
            ts=datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc),
            open=float(row[1]),
            high=float(row[2]),
            low=float(row[3]),
            close=float(row[4]),
            volume=float(row[5]),
        )

    def _to_binance_interval(self, timeframe: str) -> str:
        mapping = {
            "15m": "15m",
            "1H": "1h",
            "1h": "1h",
            "4H": "4h",
            "4h": "4h",
            "1D": "1d",
            "1d": "1d",
        }
        if timeframe not in mapping:
            raise ValueError(f"Unsupported timeframe: {timeframe}")
        return mapping[timeframe]

    def _synthetic_ohlcv(self, symbol: str, timeframe: str, limit: int = 200) -> list[Candle]:
        seed = hash((symbol, timeframe, limit)) & 0xFFFFFFFF
        rng = random.Random(seed)
        base = 3200.0 if symbol == "ETHUSDT" else 65000.0
        step_minutes = 15 if timeframe == "15m" else 60
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)

        candles: list[Candle] = []
        price = base
        for i in range(limit):
            ts = now - timedelta(minutes=step_minutes * (limit - i))
            drift = rng.uniform(-0.004, 0.004)
            vol = rng.uniform(0.001, 0.008)
            open_p = price
            close = max(1.0, open_p * (1.0 + drift))
            high = max(open_p, close) * (1.0 + vol)
            low = min(open_p, close) * (1.0 - vol)
            candles.append(Candle(ts=ts, open=open_p, high=high, low=low, close=close, volume=rng.uniform(100, 2000)))
            price = close
        return candles
