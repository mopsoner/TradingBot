from __future__ import annotations

from datetime import datetime, timedelta, timezone
import random

from .models import Candle


class MarketDataService:
    """Synthetic market data service for ETHUSDT/BTCUSDT."""

    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int = 200) -> list[Candle]:
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
