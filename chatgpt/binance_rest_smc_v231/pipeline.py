from __future__ import annotations

from typing import Any

from engine import build_signal

BATCH_TIMEFRAMES = ("1m", "5m", "1h", "4h")


def build_batch_signal(
    symbol: str,
    candles_1m: list[dict[str, Any]],
    candles_5m: list[dict[str, Any]],
    candles_1h: list[dict[str, Any]],
    candles_4h: list[dict[str, Any]],
    cfg: dict[str, Any],
) -> dict[str, Any]:
    return build_signal(symbol, candles_1m, candles_5m, candles_1h, candles_4h, cfg)


def replay_slices(
    candles_1m: list[dict[str, Any]],
    candles_5m: list[dict[str, Any]],
    candles_1h: list[dict[str, Any]],
    candles_4h: list[dict[str, Any]],
    current_close_time: int,
    lookback_limit: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    c1 = [c for c in candles_1m if c["close_time"] <= current_close_time]
    c5 = [c for c in candles_5m if c["close_time"] <= current_close_time]
    c1h = [c for c in candles_1h if c["close_time"] <= current_close_time]
    c4h = [c for c in candles_4h if c["close_time"] <= current_close_time]
    return c1[-lookback_limit:], c5[-lookback_limit:], c1h[-max(120, lookback_limit):], c4h[-max(90, lookback_limit):]
