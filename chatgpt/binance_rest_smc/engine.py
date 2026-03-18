from __future__ import annotations

from typing import Any
from signals import closes, current_session, near_level, recent_extremes, rsi


def build_signal(symbol: str, candles_1m: list[dict[str, Any]], candles_5m: list[dict[str, Any]], cfg: dict[str, Any]) -> dict[str, Any]:
    price = candles_1m[-1]["close"]
    rsi_5m = rsi(closes(candles_5m), cfg["rsi_period"])
    high_5m, low_5m = recent_extremes(candles_5m, cfg["swing_window"] * 3)
    prev_high = max(c["high"] for c in candles_5m[-6:-1])
    prev_low = min(c["low"] for c in candles_5m[-6:-1])
    last = candles_5m[-1]
    session = current_session(cfg["session_timezone_offset_hours"])
    near_extreme_pct = cfg["signals"]["price_near_extreme_pct"]

    state = "neutral"
    trigger = "wait"
    score = 0

    if rsi_5m is not None and rsi_5m >= cfg["signals"]["overbought"] and near_level(price, high_5m, near_extreme_pct):
        state = "possible_utad"
        score += 2
    if rsi_5m is not None and rsi_5m <= cfg["signals"]["oversold"] and near_level(price, low_5m, near_extreme_pct):
        state = "possible_spring"
        score += 2

    if last["high"] > prev_high and last["close"] < prev_high:
        state = "possible_utad"
        score += 2
    if last["low"] < prev_low and last["close"] > prev_low:
        state = "possible_spring"
        score += 2

    if state == "possible_utad" and last["close"] < prev_low:
        trigger = "m5_break_down"
        score += 3
    elif state == "possible_spring" and last["close"] > prev_high:
        trigger = "m5_break_up"
        score += 3

    if session in {"london_open", "london", "new_york"}:
        score += 1

    bias = "neutral"
    if state == "possible_utad":
        bias = "bear_watch"
    elif state == "possible_spring":
        bias = "bull_watch"
    if trigger == "m5_break_down":
        bias = "bear_confirm"
    elif trigger == "m5_break_up":
        bias = "bull_confirm"

    return {
        "symbol": symbol,
        "session": session,
        "price": price,
        "rsi_5m": rsi_5m,
        "range_high_5m": high_5m,
        "range_low_5m": low_5m,
        "state": state,
        "trigger": trigger,
        "bias": bias,
        "score": score,
    }
