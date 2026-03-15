from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta

import logging

import yfinance as yf
import pandas as pd

from backend.app.services.signal_engine import SetupInput, SignalEngine

logger = logging.getLogger(__name__)


YFINANCE_TICKER_MAP = {
    "ETHUSDT": "ETH-USD",
    "BTCUSDT": "BTC-USD",
    "SOLUSDT": "SOL-USD",
    "BNBUSDT": "BNB-USD",
    "XRPUSDT": "XRP-USD",
    "ADAUSDT": "ADA-USD",
    "AVAXUSDT": "AVAX-USD",
    "DOTUSDT": "DOT-USD",
    "MATICUSDT": "MATIC-USD",
    "LINKUSDT": "LINK-USD",
    "DOGEUSDT": "DOGE-USD",
    "LTCUSDT": "LTC-USD",
}

TF_MAP = {
    "1h": "1h",
    "4h": "1h",
    "1d": "1d",
    "15m": "15m",
}

TF_CHUNK_DAYS = {
    "15m": 55,
    "1h": 700,
    "4h": 700,
    "1d": 1460,
}

TF_YF_MAX_AGE_DAYS = {
    "15m": 59,
    "1h": 729,
    "4h": 729,
    "1d": 99999,
}


@dataclass
class CandleData:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class WalkForwardSignal:
    timestamp: str
    direction: str
    entry_price: float
    tp_price: float
    sl_price: float
    result: str
    r_multiple: float
    steps: dict


@dataclass
class WalkForwardResult:
    signals: list[WalkForwardSignal]
    total_signals: int
    wins: int
    losses: int
    pending: int
    win_rate: float
    profit_factor: float
    max_drawdown: float
    total_r: float
    candles_downloaded: int
    period_start: str
    period_end: str


def _yf_ticker(symbol: str) -> str:
    return YFINANCE_TICKER_MAP.get(symbol.upper(), symbol.upper().replace("USDT", "-USD"))


def _df_to_candles(df: pd.DataFrame) -> list[CandleData]:
    if df.empty:
        return []
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    candles: list[CandleData] = []
    for idx, row in df.iterrows():
        ts = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        o = float(row["Open"])
        h = float(row["High"])
        l = float(row["Low"])
        c = float(row["Close"])
        v = float(row["Volume"]) if "Volume" in row.index else 0.0
        if not (math.isnan(o) or math.isnan(h) or math.isnan(l) or math.isnan(c)):
            candles.append(CandleData(timestamp=ts, open=o, high=h, low=l, close=c, volume=v))
    return candles


def download_candles(symbol: str, years: int, timeframe: str) -> list[CandleData]:
    ticker = _yf_ticker(symbol)
    chunk_days = TF_CHUNK_DAYS.get(timeframe, 700)
    max_age = TF_YF_MAX_AGE_DAYS.get(timeframe, 729)
    requested_days = years * 365
    yf_interval = TF_MAP.get(timeframe, "1h")

    end = datetime.now(timezone.utc)
    earliest_possible = end - timedelta(days=max_age)
    start = max(end - timedelta(days=requested_days), earliest_possible)

    all_candles: list[CandleData] = []
    seen_timestamps: set[str] = set()

    chunk_start = start
    while chunk_start < end:
        chunk_end = min(chunk_start + timedelta(days=chunk_days), end)

        try:
            df = yf.download(
                ticker,
                start=chunk_start,
                end=chunk_end,
                interval=yf_interval,
                progress=False,
                auto_adjust=True,
            )
            chunk_candles = _df_to_candles(df)
            for c in chunk_candles:
                ts_key = c.timestamp.isoformat()
                if ts_key not in seen_timestamps:
                    seen_timestamps.add(ts_key)
                    all_candles.append(c)
        except Exception as exc:
            logger.warning("yfinance chunk %s → %s failed: %s", chunk_start.date(), chunk_end.date(), exc)

        chunk_start = chunk_end

    all_candles.sort(key=lambda c: c.timestamp)

    if timeframe == "4h" and yf_interval == "1h":
        all_candles = _aggregate_to_4h(all_candles)

    return all_candles


def _aggregate_to_4h(candles_1h: list[CandleData]) -> list[CandleData]:
    if not candles_1h:
        return []
    result: list[CandleData] = []
    bucket: list[CandleData] = []
    for c in candles_1h:
        bucket.append(c)
        if len(bucket) == 4:
            agg = CandleData(
                timestamp=bucket[0].timestamp,
                open=bucket[0].open,
                high=max(b.high for b in bucket),
                low=min(b.low for b in bucket),
                close=bucket[-1].close,
                volume=sum(b.volume for b in bucket),
            )
            result.append(agg)
            bucket = []
    return result


def _compute_atr(candles: list[CandleData], period: int = 14) -> float:
    if len(candles) < 2:
        return 0.0
    trs: list[float] = []
    for i in range(1, len(candles)):
        c = candles[i]
        prev_close = candles[i - 1].close
        tr = max(c.high - c.low, abs(c.high - prev_close), abs(c.low - prev_close))
        trs.append(tr)
    if not trs:
        return 0.0
    return sum(trs[-period:]) / min(len(trs), period)


def _find_swing_points(candles: list[CandleData], lookback: int = 5) -> tuple[list[float], list[float]]:
    swing_highs: list[float] = []
    swing_lows: list[float] = []
    for i in range(lookback, len(candles) - lookback):
        is_high = all(candles[i].high >= candles[i + j].high for j in range(-lookback, lookback + 1) if j != 0)
        is_low = all(candles[i].low <= candles[i + j].low for j in range(-lookback, lookback + 1) if j != 0)
        if is_high:
            swing_highs.append(candles[i].high)
        if is_low:
            swing_lows.append(candles[i].low)
    return swing_highs, swing_lows


def _detect_equal_levels(levels: list[float], tolerance: float) -> list[float]:
    if len(levels) < 2:
        return []
    eq_zones: list[float] = []
    for i in range(len(levels)):
        for j in range(i + 1, len(levels)):
            if abs(levels[i] - levels[j]) <= tolerance:
                eq_zones.append((levels[i] + levels[j]) / 2)
    return eq_zones


def analyze_window(candles: list[CandleData], engine: SignalEngine) -> tuple[str | None, dict]:
    if len(candles) < 20:
        return None, {}

    atr = _compute_atr(candles)
    if atr <= 0:
        return None, {}

    tolerance = atr * 0.5
    swing_highs, swing_lows = _find_swing_points(candles, lookback=3)

    eq_high_zones = _detect_equal_levels(swing_highs, tolerance)
    eq_low_zones = _detect_equal_levels(swing_lows, tolerance)
    has_liquidity = len(eq_high_zones) > 0 or len(eq_low_zones) > 0

    last_3 = candles[-3:]
    last = candles[-1]

    swept_high = any(
        c.high > z and c.close < z
        for c in last_3
        for z in eq_high_zones
    )
    swept_low = any(
        c.low < z and c.close > z
        for c in last_3
        for z in eq_low_zones
    )
    has_sweep = swept_high or swept_low

    prior = candles[:-3] if len(candles) > 5 else candles[:-1]
    prior_lows = [c.low for c in prior[-15:]]
    prior_highs = [c.high for c in prior[-15:]]
    support = min(prior_lows) if prior_lows else last.low
    resistance = max(prior_highs) if prior_highs else last.high

    is_spring = any(c.low < support and c.close > support for c in last_3)
    is_utad = any(c.high > resistance and c.close < resistance for c in last_3)

    if not is_spring and not is_utad:
        support_tight = sorted(prior_lows)[:3]
        resistance_tight = sorted(prior_highs, reverse=True)[:3]
        if support_tight:
            avg_support = sum(support_tight) / len(support_tight)
            is_spring = any(c.low < avg_support - atr * 0.2 and c.close > avg_support for c in last_3)
        if resistance_tight:
            avg_resistance = sum(resistance_tight) / len(resistance_tight)
            is_utad = any(c.high > avg_resistance + atr * 0.2 and c.close < avg_resistance for c in last_3)

    has_displacement = any(abs(c.close - c.open) > atr * 0.8 for c in last_3)

    prev_swing_high = max(swing_highs[-3:]) if len(swing_highs) >= 1 else resistance
    prev_swing_low = min(swing_lows[-3:]) if len(swing_lows) >= 1 else support

    bos_long = any(c.close > prev_swing_high for c in last_3)
    bos_short = any(c.close < prev_swing_low for c in last_3)
    has_bos = bos_long or bos_short

    next_liq_up = [z for z in eq_high_zones if z > last.close]
    next_liq_down = [z for z in eq_low_zones if z < last.close]
    has_expansion = (bos_long and len(next_liq_up) > 0) or (bos_short and len(next_liq_down) > 0)
    if not has_expansion:
        has_expansion = has_bos

    if len(swing_highs) >= 1 and len(swing_lows) >= 1:
        swing_h = max(swing_highs[-3:]) if swing_highs else last.high
        swing_l = min(swing_lows[-3:]) if swing_lows else last.low
        swing_range = swing_h - swing_l
        if swing_range > 0:
            retrace = abs(last.close - swing_h) / swing_range if bos_long or is_spring else abs(last.close - swing_l) / swing_range
        else:
            retrace = 0.0
    else:
        retrace = 0.0

    fib_levels = engine.fib_levels
    best_fib = min(fib_levels, key=lambda f: abs(retrace - f)) if fib_levels else 0.5
    fib_match = abs(retrace - best_fib) < 0.18

    payload = SetupInput(
        symbol="",
        liquidity_zone=has_liquidity,
        sweep=has_sweep,
        spring=is_spring,
        utad=is_utad,
        displacement=has_displacement,
        bos=has_bos,
        expansion_to_next_liquidity=has_expansion,
        fib_retracement=best_fib if fib_match else 0.0,
        equal_highs_lows=has_liquidity,
    )

    direction = engine.detect(payload)

    steps = {
        "liquidity_zone": has_liquidity,
        "sweep": has_sweep,
        "spring": is_spring,
        "utad": is_utad,
        "displacement": has_displacement,
        "bos": has_bos,
        "expansion": has_expansion,
        "fib_retracement": round(best_fib if fib_match else retrace, 3),
        "fib_match": fib_match,
        "atr": round(atr, 4),
    }

    return direction, steps


def simulate_trade(
    direction: str,
    entry_candle: CandleData,
    future_candles: list[CandleData],
    atr: float,
    rr_ratio: float = 2.0,
) -> tuple[str, float]:
    entry = entry_candle.close
    if direction == "LONG":
        sl = entry - atr * 1.5
        tp = entry + atr * 1.5 * rr_ratio
        for fc in future_candles:
            hit_sl = fc.low <= sl
            hit_tp = fc.high >= tp
            if hit_sl and hit_tp:
                if abs(fc.open - sl) <= abs(fc.open - tp):
                    return "SL", -1.0
                return "TP", rr_ratio
            if hit_sl:
                return "SL", -1.0
            if hit_tp:
                return "TP", rr_ratio
    else:
        sl = entry + atr * 1.5
        tp = entry - atr * 1.5 * rr_ratio
        for fc in future_candles:
            hit_sl = fc.high >= sl
            hit_tp = fc.low <= tp
            if hit_sl and hit_tp:
                if abs(fc.open - sl) <= abs(fc.open - tp):
                    return "SL", -1.0
                return "TP", rr_ratio
            if hit_sl:
                return "SL", -1.0
            if hit_tp:
                return "TP", rr_ratio

    if future_candles:
        last_close = future_candles[-1].close
        if direction == "LONG":
            r = (last_close - entry) / (atr * 1.5) if atr > 0 else 0
        else:
            r = (entry - last_close) / (atr * 1.5) if atr > 0 else 0
        return "OPEN", round(r, 2)
    return "OPEN", 0.0


def _store_candles_to_db(candles: list[CandleData], symbol: str, timeframe: str) -> None:
    from backend.app.db.session import engine as db_engine
    from backend.app.db.models import MarketCandle
    from sqlmodel import Session, select

    with Session(db_engine) as session:
        existing = set()
        rows = session.exec(
            select(MarketCandle.timestamp)
            .where(MarketCandle.symbol == symbol, MarketCandle.timeframe == timeframe)
        ).all()
        for ts in rows:
            existing.add(ts.isoformat() if hasattr(ts, 'isoformat') else str(ts))

        batch: list[MarketCandle] = []
        for c in candles:
            ts_key = c.timestamp.isoformat()
            if ts_key in existing:
                continue
            batch.append(MarketCandle(
                timestamp=c.timestamp,
                symbol=symbol,
                timeframe=timeframe,
                open=c.open,
                high=c.high,
                low=c.low,
                close=c.close,
                volume=c.volume,
                source="yfinance",
            ))
        if batch:
            session.add_all(batch)
            session.commit()


def run_walkforward(
    symbol: str,
    years: int = 4,
    timeframe: str = "1h",
    fib_levels: list[float] | None = None,
    window_size: int = 50,
    rr_ratio: float = 2.0,
) -> WalkForwardResult:
    if fib_levels is None:
        fib_levels = [0.5, 0.618, 0.705]

    engine = SignalEngine(fib_levels)
    candles = download_candles(symbol, years, timeframe)

    if not candles:
        return WalkForwardResult(
            signals=[], total_signals=0, wins=0, losses=0, pending=0,
            win_rate=0, profit_factor=0, max_drawdown=0, total_r=0,
            candles_downloaded=0, period_start="", period_end="",
        )

    signals: list[WalkForwardSignal] = []

    for i in range(window_size, len(candles)):
        window = candles[i - window_size : i]
        direction, steps = analyze_window(window, engine)

        if direction is None:
            continue

        entry_candle = candles[i - 1]
        atr = _compute_atr(window)
        future = candles[i:]
        result, r_mult = simulate_trade(direction, entry_candle, future, atr, rr_ratio)

        entry_price = entry_candle.close
        if direction == "LONG":
            sl_price = entry_price - atr * 1.5
            tp_price = entry_price + atr * 1.5 * rr_ratio
        else:
            sl_price = entry_price + atr * 1.5
            tp_price = entry_price - atr * 1.5 * rr_ratio

        signals.append(WalkForwardSignal(
            timestamp=entry_candle.timestamp.isoformat(),
            direction=direction,
            entry_price=round(entry_price, 2),
            tp_price=round(tp_price, 2),
            sl_price=round(sl_price, 2),
            result=result,
            r_multiple=r_mult,
            steps=steps,
        ))

    wins = sum(1 for s in signals if s.result == "TP")
    losses = sum(1 for s in signals if s.result == "SL")
    pending = sum(1 for s in signals if s.result == "OPEN")
    total = len(signals)

    win_rate = wins / max(total, 1)
    gross_profit = sum(s.r_multiple for s in signals if s.r_multiple > 0)
    gross_loss = abs(sum(s.r_multiple for s in signals if s.r_multiple < 0)) or 1e-9
    profit_factor = gross_profit / gross_loss

    equity = 0.0
    peak = 0.0
    max_dd = 0.0
    for s in signals:
        equity += s.r_multiple
        if equity > peak:
            peak = equity
        dd = peak - equity
        if dd > max_dd:
            max_dd = dd
    max_dd_pct = max_dd / max(peak, gross_profit, 1.0)
    max_dd_pct = min(max_dd_pct, 1.0)

    total_r = sum(s.r_multiple for s in signals)

    return WalkForwardResult(
        signals=signals,
        total_signals=total,
        wins=wins,
        losses=losses,
        pending=pending,
        win_rate=round(win_rate, 4),
        profit_factor=round(profit_factor, 4),
        max_drawdown=round(max_dd_pct, 4),
        total_r=round(total_r, 2),
        candles_downloaded=len(candles),
        period_start=candles[0].timestamp.isoformat() if candles else "",
        period_end=candles[-1].timestamp.isoformat() if candles else "",
    )
