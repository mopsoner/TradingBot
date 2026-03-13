from __future__ import annotations

from datetime import datetime, timedelta, timezone
import random

from .models import Candle


class MarketDataService:
    """Synthetic deterministic OHLCV provider for local research/paper tests."""

    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int = 200) -> list[Candle]:
        seed = hash((symbol, timeframe, limit)) & 0xFFFFFFFF
        rng = random.Random(seed)
        base = 3200.0 if symbol == "ETHUSDT" else 65000.0
        step_minutes = {"15m": 15, "1H": 60, "4H": 240}.get(timeframe, 60)
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)

        candles: list[Candle] = []
        price = base
        for i in range(limit):
            ts = now - timedelta(minutes=step_minutes * (limit - i))
            drift = rng.uniform(-0.0025, 0.0025)
            wick = rng.uniform(0.0008, 0.0045)
            open_p = price
            close = max(1.0, open_p * (1.0 + drift))
            high = max(open_p, close) * (1.0 + wick)
            low = min(open_p, close) * (1.0 - wick)

            candles.append(
                Candle(
                    ts=ts,
                    open=open_p,
                    high=high,
                    low=low,
                    close=close,
                    volume=rng.uniform(120, 2200),
                )
            )
            price = close

        return candles
