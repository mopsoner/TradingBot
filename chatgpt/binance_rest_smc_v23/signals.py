from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any


def closes(candles: list[dict[str, Any]]) -> list[float]:
    return [c["close"] for c in candles]


def highs(candles: list[dict[str, Any]]) -> list[float]:
    return [c["high"] for c in candles]


def lows(candles: list[dict[str, Any]]) -> list[float]:
    return [c["low"] for c in candles]


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


def session_extremes(candles: list[dict[str, Any]], offset_hours: int, session_name: str) -> tuple[float | None, float | None]:
    selected: list[dict[str, Any]] = []
    for c in candles:
        dt = datetime.fromtimestamp(c["open_time"] / 1000, tz=timezone.utc) + timedelta(hours=offset_hours)
        h = dt.hour
        ses = "off_session"
        if 2 <= h < 4:
            ses = "asia"
        elif 4 <= h < 6:
            ses = "london_open"
        elif 6 <= h < 9:
            ses = "london"
        elif 9 <= h < 12:
            ses = "new_york"
        if ses == session_name:
            selected.append(c)
    if not selected:
        return None, None
    return max(c["high"] for c in selected), min(c["low"] for c in selected)


def equal_highs_lows(candles: list[dict[str, Any]], tolerance_pct: float, lookback: int = 20) -> dict[str, bool]:
    subset = candles[-lookback:]
    hs = highs(subset)
    ls = lows(subset)
    eqh = False
    eql = False
    if len(hs) >= 2:
        top = max(hs)
        near = [h for h in hs if abs(h - top) / top <= tolerance_pct]
        eqh = len(near) >= 2
    if len(ls) >= 2:
        bot = min(ls)
        near = [l for l in ls if abs(l - bot) / bot <= tolerance_pct]
        eql = len(near) >= 2
    return {"equal_highs": eqh, "equal_lows": eql}
