from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any


def closes(candles: list[dict[str, Any]]) -> list[float]:
    return [c["close"] for c in candles]


def rsi(values: list[float], period: int = 14) -> float | None:
    if len(values) < period + 1:
        return None
    gains = []
    losses = []
    for i in range(1, period + 1):
        diff = values[-period - 1 + i] - values[-period - 2 + i]
        if diff >= 0:
            gains.append(diff)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(diff))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def recent_extremes(candles: list[dict[str, Any]], window: int) -> tuple[float, float]:
    subset = candles[-window:]
    return max(c["high"] for c in subset), min(c["low"] for c in subset)


def current_session(offset_hours: int) -> str:
    now = datetime.now(timezone.utc) + timedelta(hours=offset_hours)
    h = now.hour
    if 2 <= h < 4:
        return "asia"
    if 4 <= h < 6:
        return "london_open"
    if 6 <= h < 9:
        return "london"
    if 9 <= h < 12:
        return "new_york"
    return "off_session"


def near_level(price: float, level: float, pct: float) -> bool:
    if level == 0:
        return False
    return abs(price - level) / level <= pct
