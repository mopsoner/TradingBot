from __future__ import annotations

from typing import Any
from signals import closes, equal_highs_lows, near_level, recent_extremes, rsi, session_extremes, current_session


def build_signal(symbol: str, candles_1m: list[dict[str, Any]], candles_5m: list[dict[str, Any]], candles_1h: list[dict[str, Any]], cfg: dict[str, Any]) -> dict[str, Any]:
    price = candles_1m[-1]["close"]
    rsi_5m = rsi(closes(candles_5m), cfg["rsi_period"])
    high_5m, low_5m = recent_extremes(candles_5m, cfg["swing_window"] * 3)
    high_1h, low_1h = recent_extremes(candles_1h, min(len(candles_1h), cfg["swing_window"] * 6))
    prev_high = max(c["high"] for c in candles_5m[-6:-1])
    prev_low = min(c["low"] for c in candles_5m[-6:-1])
    last = candles_5m[-1]
    session = current_session(cfg["session_timezone_offset_hours"])
    near_extreme_pct = cfg["signals"]["price_near_extreme_pct"]
    eq = equal_highs_lows(candles_5m, cfg["equal_level_tolerance_pct"], lookback=20)
    asia_high, asia_low = session_extremes(candles_5m, cfg["session_timezone_offset_hours"], "asia")
    london_high, london_low = session_extremes(candles_5m, cfg["session_timezone_offset_hours"], "london")

    state = "neutral"
    trigger = "wait"
    bias = "neutral"
    score = 0
    tp_zone = False
    pipeline = {"collect": True, "liquidity": False, "zone": False, "confirm": False, "trade": False}
    trade = {"status": "watch", "side": "none", "entry": None, "stop": None, "target": None}

    near_recent_high = near_level(price, high_5m, near_extreme_pct)
    near_recent_low = near_level(price, low_5m, near_extreme_pct)
    near_htf_high = near_level(price, high_1h, near_extreme_pct * 2)
    near_htf_low = near_level(price, low_1h, near_extreme_pct * 2)

    if eq["equal_highs"] or eq["equal_lows"] or near_recent_high or near_recent_low:
        pipeline["liquidity"] = True
        score += 1

    utad_watch = False
    spring_watch = False

    if rsi_5m is not None and rsi_5m >= cfg["signals"]["overbought"] and (near_recent_high or near_htf_high or eq["equal_highs"]):
        utad_watch = True
        score += 2
    if rsi_5m is not None and rsi_5m <= cfg["signals"]["oversold"] and (near_recent_low or near_htf_low or eq["equal_lows"]):
        spring_watch = True
        score += 2

    if last["high"] > prev_high and last["close"] < prev_high:
        utad_watch = True
        score += 2
    if last["low"] < prev_low and last["close"] > prev_low:
        spring_watch = True
        score += 2

    if utad_watch:
        state = "utad_watch"
        bias = "bear_watch"
        pipeline["zone"] = True
    if spring_watch:
        state = "spring_watch"
        bias = "bull_watch"
        pipeline["zone"] = True

    if utad_watch and last["close"] < prev_low:
        trigger = "m5_break_down"
        bias = "bear_confirm"
        pipeline["confirm"] = True
        score += 3
    elif spring_watch and last["close"] > prev_high:
        trigger = "m5_break_up"
        bias = "bull_confirm"
        pipeline["confirm"] = True
        score += 3

    if session in {"london_open", "london", "new_york"}:
        score += 1

    if session == "london_open" and rsi_5m is not None and rsi_5m >= cfg["signals"]["overbought"]:
        tp_zone = True
    if session == "asia" and rsi_5m is not None and rsi_5m <= cfg["signals"]["oversold"]:
        tp_zone = True
    if session == "new_york" and (near_recent_high or near_recent_low):
        tp_zone = True

    if trigger == "m5_break_down":
        trade = {"status": "simulated", "side": "short", "entry": price, "stop": high_5m, "target": low_5m}
        pipeline["trade"] = True
    elif trigger == "m5_break_up":
        trade = {"status": "simulated", "side": "long", "entry": price, "stop": low_5m, "target": high_5m}
        pipeline["trade"] = True

    return {
        "symbol": symbol,
        "session": session,
        "price": price,
        "rsi_5m": rsi_5m,
        "range_high_5m": high_5m,
        "range_low_5m": low_5m,
        "range_high_1h": high_1h,
        "range_low_1h": low_1h,
        "asia_high": asia_high,
        "asia_low": asia_low,
        "london_high": london_high,
        "london_low": london_low,
        "equal_highs": eq["equal_highs"],
        "equal_lows": eq["equal_lows"],
        "state": state,
        "trigger": trigger,
        "bias": bias,
        "tp_zone": tp_zone,
        "score": score,
        "pipeline": pipeline,
        "trade": trade,
    }
