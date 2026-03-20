from __future__ import annotations

from typing import Any
from signals import closes, equal_highs_lows, infer_interval_label, near_level, recent_extremes, rsi, session_extremes, session_from_timestamp

ALLOWED_CONFIRM_SESSIONS = {"london_open", "london", "new_york"}


def _pick_liquidity_target(
    *,
    bias: str,
    eq: dict[str, bool],
    asia_high: float | None,
    asia_low: float | None,
    london_high: float | None,
    london_low: float | None,
    high_main: float,
    low_main: float,
    high_htf: float,
    low_htf: float,
) -> dict[str, Any]:
    if bias in {"bear_watch", "bear_confirm"}:
        if eq["equal_highs"]:
            return {"type": "equal_highs", "level": high_main, "reason": "visible buy-side liquidity above equal highs"}
        if london_high is not None:
            return {"type": "london_high", "level": london_high, "reason": "london high as buy-side liquidity target"}
        if asia_high is not None:
            return {"type": "asia_high", "level": asia_high, "reason": "asia high as buy-side liquidity target"}
        return {"type": "recent_high", "level": high_htf or high_main, "reason": "recent visible high liquidity"}

    if bias in {"bull_watch", "bull_confirm"}:
        if eq["equal_lows"]:
            return {"type": "equal_lows", "level": low_main, "reason": "visible sell-side liquidity below equal lows"}
        if london_low is not None:
            return {"type": "london_low", "level": london_low, "reason": "london low as sell-side liquidity target"}
        if asia_low is not None:
            return {"type": "asia_low", "level": asia_low, "reason": "asia low as sell-side liquidity target"}
        return {"type": "recent_low", "level": low_htf or low_main, "reason": "recent visible low liquidity"}

    return {"type": "none", "level": None, "reason": "no clear liquidity target"}


def build_signal(symbol: str, candles_fast: list[dict[str, Any]], candles_main: list[dict[str, Any]], candles_htf: list[dict[str, Any]], cfg: dict[str, Any]) -> dict[str, Any]:
    price = candles_fast[-1]["close"]
    rsi_main = rsi(closes(candles_main), cfg["rsi_period"])
    high_main, low_main = recent_extremes(candles_main, cfg["swing_window"] * 3)
    high_htf, low_htf = recent_extremes(candles_htf, min(len(candles_htf), cfg["swing_window"] * 6))
    prev_high = max(c["high"] for c in candles_main[-6:-1])
    prev_low = min(c["low"] for c in candles_main[-6:-1])
    prev_mid = (prev_high + prev_low) / 2
    last = candles_main[-1]
    prev_bar = candles_main[-2] if len(candles_main) >= 2 else candles_main[-1]
    signal_open_time = last.get("open_time")
    signal_close_time = last.get("close_time")
    signal_interval = infer_interval_label(candles_main)
    session = session_from_timestamp(signal_close_time, cfg["session_timezone_offset_hours"])
    near_extreme_pct = cfg["signals"]["price_near_extreme_pct"]
    eq = equal_highs_lows(candles_main, cfg["equal_level_tolerance_pct"], lookback=20)
    asia_high, asia_low = session_extremes(candles_main, cfg["session_timezone_offset_hours"], "asia")
    london_high, london_low = session_extremes(candles_main, cfg["session_timezone_offset_hours"], "london")

    state = "neutral"
    trigger = "wait"
    bias = "neutral"
    score = 0
    tp_zone = False
    confirm_source = "none"
    confirm_blocked_by_session = False
    pipeline = {"collect": True, "liquidity": False, "zone": False, "confirm": False, "trade": False}
    trade = {"status": "watch", "side": "none", "entry": None, "stop": None, "target": None}

    near_recent_high = near_level(price, high_main, near_extreme_pct)
    near_recent_low = near_level(price, low_main, near_extreme_pct)
    near_htf_high = near_level(price, high_htf, near_extreme_pct * 2)
    near_htf_low = near_level(price, low_htf, near_extreme_pct * 2)

    if eq["equal_highs"] or eq["equal_lows"] or near_recent_high or near_recent_low:
        pipeline["liquidity"] = True
        score += 1

    utad_watch = False
    spring_watch = False

    if rsi_main is not None and rsi_main >= cfg["signals"]["overbought"] and (near_recent_high or near_htf_high or eq["equal_highs"]):
        utad_watch = True
        score += 2
    if rsi_main is not None and rsi_main <= cfg["signals"]["oversold"] and (near_recent_low or near_htf_low or eq["equal_lows"]):
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

    bear_strong_confirm = utad_watch and last["close"] < prev_low
    bull_strong_confirm = spring_watch and last["close"] > prev_high

    bear_soft_confirm = utad_watch and (
        last["close"] < prev_mid
        and last["close"] < last["open"]
        and last["close"] < prev_bar["close"]
    )
    bull_soft_confirm = spring_watch and (
        last["close"] > prev_mid
        and last["close"] > last["open"]
        and last["close"] > prev_bar["close"]
    )

    confirm_candidate = None
    confirm_score_bonus = 0
    if bear_strong_confirm:
        confirm_candidate = ("break_down_confirm", "bear_confirm", "5m_break")
        confirm_score_bonus = 3
    elif bull_strong_confirm:
        confirm_candidate = ("break_up_confirm", "bull_confirm", "5m_break")
        confirm_score_bonus = 3
    elif bear_soft_confirm:
        confirm_candidate = ("break_down_confirm_soft", "bear_confirm", "5m_soft")
        confirm_score_bonus = 2
    elif bull_soft_confirm:
        confirm_candidate = ("break_up_confirm_soft", "bull_confirm", "5m_soft")
        confirm_score_bonus = 2

    if confirm_candidate is not None:
        if session in ALLOWED_CONFIRM_SESSIONS:
            trigger, bias, confirm_source = confirm_candidate
            pipeline["confirm"] = True
            score += confirm_score_bonus
        else:
            confirm_blocked_by_session = True

    if session in ALLOWED_CONFIRM_SESSIONS:
        score += 1

    if session == "london_open" and rsi_main is not None and rsi_main >= cfg["signals"]["overbought"]:
        tp_zone = True
    if session == "asia" and rsi_main is not None and rsi_main <= cfg["signals"]["oversold"]:
        tp_zone = True
    if session == "new_york" and (near_recent_high or near_recent_low):
        tp_zone = True

    liquidity_target = _pick_liquidity_target(
        bias=bias,
        eq=eq,
        asia_high=asia_high,
        asia_low=asia_low,
        london_high=london_high,
        london_low=london_low,
        high_main=high_main,
        low_main=low_main,
        high_htf=high_htf,
        low_htf=low_htf,
    )

    if trigger in {"break_down_confirm", "break_down_confirm_soft"}:
        trade = {"status": "simulated", "side": "short", "entry": price, "stop": high_main, "target": low_main}
        pipeline["trade"] = True
    elif trigger in {"break_up_confirm", "break_up_confirm_soft"}:
        trade = {"status": "simulated", "side": "long", "entry": price, "stop": low_main, "target": high_main}
        pipeline["trade"] = True

    return {
        "symbol": symbol,
        "session": session,
        "signal_time": signal_close_time,
        "signal_open_time": signal_open_time,
        "signal_close_time": signal_close_time,
        "signal_interval": signal_interval,
        "price": price,
        "rsi_main": rsi_main,
        "range_high_main": high_main,
        "range_low_main": low_main,
        "range_high_htf": high_htf,
        "range_low_htf": low_htf,
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
        "confirm_source": confirm_source,
        "confirm_blocked_by_session": confirm_blocked_by_session,
        "pipeline": pipeline,
        "trade": trade,
        "liquidity_target": liquidity_target,
    }
