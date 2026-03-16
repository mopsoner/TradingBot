from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from bisect import bisect_right

from sqlmodel import Session, select

from backend.app.db.session import engine as db_engine
from backend.app.db.models import MarketCandle, BacktestResult
from backend.app.services.signal_engine import SetupInput, SignalEngine
from backend.app.services.walkforward import (
    CandleData,
    _compute_atr,
    _find_swing_points,
    _detect_equal_levels,
)
import backend.app.services.ta_engine as ta

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500

# Windows used per timeframe
WINDOW_4H = 20    # 20 × 4H = 80H of HTF context
WINDOW_1H = 50    # 50 × 1H for intermediate structure
WINDOW_15M = 50   # 50 × 15m for entry


class ReplayStatus(str, Enum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass
class ReplayTrade:
    timestamp: str
    direction: str
    entry_price: float
    sl_price: float
    tp_price: float
    result: str
    r_multiple: float
    htf_bias: str = ""
    tf_1h_structure: str = ""


@dataclass
class ReplayMetrics:
    total_trades: int = 0
    wins: int = 0
    losses: int = 0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    max_drawdown: float = 0.0
    expectancy: float = 0.0
    total_r: float = 0.0


@dataclass
class ReplaySession:
    session_id: str
    symbol: str
    date_start: datetime
    date_end: datetime
    status: ReplayStatus = ReplayStatus.RUNNING
    error: str | None = None
    metrics: ReplayMetrics = field(default_factory=ReplayMetrics)
    trades: list[ReplayTrade] = field(default_factory=list)
    candles_processed: int = 0
    total_candles: int = 0
    backtest_result_id: int | None = None
    profile_name: str = "SMC/Wyckoff Multi-TF"
    step_rejections: dict = field(default_factory=lambda: {
        "no_data":        0,
        "step0_liq":      0,
        "step1_sweep":    0,
        "step2_wyckoff":  0,
        "htf_filter":     0,
        "weekly_trend":   0,
        "step3_disp":     0,
        "step4_bos":      0,
        "step5_vol_exp":  0,
        "step6_fib":      0,
        "weekend":        0,
    })

    equity: float = field(default=10.0, repr=False)
    peak: float = field(default=10.0, repr=False)
    max_dd: float = field(default=0.0, repr=False)
    open_positions: list[dict] = field(default_factory=list, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    @property
    def timeframe(self) -> str:
        return "4h/1h/15m"

    def _check_open_positions(self, candle: CandleData) -> None:
        closed = []
        for pos in self.open_positions:
            direction = pos["direction"]
            sl = pos["sl"]
            tp = pos["tp"]
            hit_sl = False
            hit_tp = False

            if direction == "LONG":
                hit_sl = candle.low <= sl
                hit_tp = candle.high >= tp
            else:
                hit_sl = candle.high >= sl
                hit_tp = candle.low <= tp

            if hit_sl and hit_tp:
                hit_sl = abs(candle.open - sl) <= abs(candle.open - tp)
                hit_tp = not hit_sl

            if hit_sl:
                self._record_trade_close(pos, "SL", -1.0)
                closed.append(pos)
            elif hit_tp:
                self._record_trade_close(pos, "TP", pos["rr_ratio"])
                closed.append(pos)

        for c in closed:
            self.open_positions.remove(c)

    def _record_trade_close(self, pos: dict, result: str, r_multiple: float) -> None:
        for trade in self.trades:
            if trade.timestamp == pos["timestamp"] and trade.result == "OPEN":
                trade.result = result
                trade.r_multiple = r_multiple
                break

        self.equity += r_multiple
        if self.equity > self.peak:
            self.peak = self.equity
        dd = self.peak - self.equity
        if dd > self.max_dd:
            self.max_dd = dd

    def _open_position(
        self, candle: CandleData, direction: str, atr: float,
        htf_bias: str, tf_1h: str, rr_ratio: float = 2.0,
        sl_atr_mult: float = 1.5,
    ) -> None:
        entry = candle.close
        if direction == "LONG":
            sl = entry - atr * sl_atr_mult
            tp = entry + atr * sl_atr_mult * rr_ratio
        else:
            sl = entry + atr * sl_atr_mult
            tp = entry - atr * sl_atr_mult * rr_ratio

        pos = {
            "direction": direction,
            "entry": entry,
            "sl": sl,
            "tp": tp,
            "rr_ratio": rr_ratio,
            "timestamp": candle.timestamp.isoformat(),
        }
        self.open_positions.append(pos)

        self.trades.append(ReplayTrade(
            timestamp=candle.timestamp.isoformat(),
            direction=direction,
            entry_price=round(entry, 6),
            sl_price=round(sl, 6),
            tp_price=round(tp, 6),
            result="OPEN",
            r_multiple=0.0,
            htf_bias=htf_bias,
            tf_1h_structure=tf_1h,
        ))

    def compute_final_metrics(self) -> None:
        for pos in self.open_positions:
            for trade in self.trades:
                if trade.timestamp == pos["timestamp"] and trade.result == "OPEN":
                    trade.result = "EXPIRED"
                    trade.r_multiple = 0.0
                    break

        closed_trades = [t for t in self.trades if t.result in ("TP", "SL")]
        total = len(closed_trades)
        wins = sum(1 for t in closed_trades if t.result == "TP")
        losses = sum(1 for t in closed_trades if t.result == "SL")

        r_values = [t.r_multiple for t in closed_trades]
        gross_profit = sum(r for r in r_values if r > 0)
        gross_loss = abs(sum(r for r in r_values if r < 0)) or 1e-9

        if self.peak > 10.0:
            dd_pct = min(self.max_dd / self.peak, 1.0)
        elif self.max_dd > 0:
            dd_pct = min(self.max_dd / 10.0, 1.0)
        else:
            dd_pct = 0.0

        self.metrics = ReplayMetrics(
            total_trades=total,
            wins=wins,
            losses=losses,
            win_rate=round(wins / max(total, 1), 4),
            profit_factor=round(gross_profit / gross_loss, 4),
            max_drawdown=round(dd_pct, 4),
            expectancy=round(sum(r_values) / max(total, 1), 4),
            total_r=round(sum(r_values), 4),
        )


def _load_candles_from_db(
    symbol: str, timeframe: str, date_start: datetime, date_end: datetime
) -> list[CandleData]:
    from sqlalchemy import text as _text
    with Session(db_engine) as s:
        rows = s.exec(
            select(MarketCandle)
            .where(
                MarketCandle.symbol == symbol,
                MarketCandle.timeframe == timeframe,
                MarketCandle.timestamp >= date_start,
                MarketCandle.timestamp <= date_end,
            )
            .order_by(MarketCandle.timestamp)
        ).all()
    candles: list[CandleData] = []
    for r in rows:
        ts = r.timestamp
        if ts.tzinfo is not None:
            ts = ts.replace(tzinfo=None)
        candles.append(CandleData(
            timestamp=ts,
            open=r.open, high=r.high, low=r.low, close=r.close, volume=r.volume,
        ))
    return candles


def _get_4h_bias(candles_4h: list[CandleData]) -> str | None:
    """
    Determine HTF 4H bias using structural swing analysis.
    Returns 'LONG' (higher highs + higher lows), 'SHORT' (lower highs + lower lows), or None.
    """
    if len(candles_4h) < 10:
        return None

    window = candles_4h[-WINDOW_4H:] if len(candles_4h) >= WINDOW_4H else candles_4h
    if len(window) < 6:
        return None

    mid = len(window) // 2
    first_half = window[:mid]
    second_half = window[mid:]

    first_high = max(c.high for c in first_half)
    first_low = min(c.low for c in first_half)
    second_high = max(c.high for c in second_half)
    second_low = min(c.low for c in second_half)

    atr_4h = _compute_atr(window)
    threshold = atr_4h * 0.5

    higher_highs = second_high > first_high + threshold
    higher_lows = second_low > first_low + threshold
    lower_highs = second_high < first_high - threshold
    lower_lows = second_low < first_low - threshold

    if higher_highs and higher_lows:
        return "LONG"
    elif lower_highs and lower_lows:
        return "SHORT"

    closes = [c.close for c in window]
    first_avg = sum(closes[:mid]) / max(mid, 1)
    second_avg = sum(closes[mid:]) / max(len(closes) - mid, 1)

    if second_avg > first_avg * 1.008:
        return "LONG"
    elif second_avg < first_avg * 0.992:
        return "SHORT"

    return None


def _get_1h_structure(candles_1h: list[CandleData]) -> str | None:
    """
    Determine 1H intermediate structure: BOS + displacement direction.
    Returns 'LONG', 'SHORT', or None.
    """
    if len(candles_1h) < 20:
        return None

    window = candles_1h[-WINDOW_1H:] if len(candles_1h) >= WINDOW_1H else candles_1h

    atr = _compute_atr(window)
    if atr <= 0:
        return None

    swing_highs, swing_lows = _find_swing_points(window, lookback=3)

    if not swing_highs or not swing_lows:
        mid = len(window) // 2
        prev_highs = [c.high for c in window[:mid]]
        prev_lows = [c.low for c in window[:mid]]
        rec_highs = [c.high for c in window[mid:]]
        rec_lows = [c.low for c in window[mid:]]
        if not prev_highs:
            return None
        prev_h = max(prev_highs)
        prev_l = min(prev_lows)
        rec_h = max(rec_highs)
        rec_l = min(rec_lows)
        if rec_h > prev_h and rec_l > prev_l:
            return "LONG"
        if rec_h < prev_h and rec_l < prev_l:
            return "SHORT"
        return None

    last_swing_high = swing_highs[-1]
    last_swing_low = swing_lows[-1]
    last_3 = window[-3:]

    bos_long = any(c.close > last_swing_high for c in last_3)
    bos_short = any(c.close < last_swing_low for c in last_3)
    has_displacement = any(abs(c.close - c.open) > atr * 0.7 for c in last_3)

    if bos_long and has_displacement:
        return "LONG"
    if bos_short and has_displacement:
        return "SHORT"

    if len(swing_highs) >= 2 and len(swing_lows) >= 2:
        if swing_highs[-1] > swing_highs[-2] and swing_lows[-1] > swing_lows[-2]:
            return "LONG"
        if swing_highs[-1] < swing_highs[-2] and swing_lows[-1] < swing_lows[-2]:
            return "SHORT"

    return None


def _build_ts_index(candles: list[CandleData]) -> list[datetime]:
    """Build a sorted list of timestamps for bisect lookups."""
    return [c.timestamp for c in candles]


def _build_weekly_candles(candles_1h: list[CandleData]) -> list[CandleData]:
    """
    Resample 1H candles → weekly candles (semaine ISO : lundi-dimanche).
    Retourne une liste triée par timestamp (lundi de la semaine).
    """
    from collections import OrderedDict
    buckets: dict[datetime, list] = {}
    for c in candles_1h:
        dt = c.timestamp
        week_start = (dt - timedelta(days=dt.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        if week_start not in buckets:
            buckets[week_start] = [c.open, c.high, c.low, c.close, c.volume]
        else:
            buckets[week_start][1] = max(buckets[week_start][1], c.high)
            buckets[week_start][2] = min(buckets[week_start][2], c.low)
            buckets[week_start][3] = c.close
            buckets[week_start][4] += c.volume
    result = []
    for ts in sorted(buckets.keys()):
        o, h, l, c_v, v = buckets[ts]
        result.append(CandleData(timestamp=ts, open=o, high=h, low=l, close=c_v, volume=v))
    return result


def _get_weekly_bias(
    candles_weekly: list[CandleData],
    ts_weekly: list[datetime],
    ts_now: datetime,
    direction: str,
    sma_period: int = 10,
    lookback_weeks: int = 4,
) -> bool:
    """
    Filtre de tendance weekly (F1a LONG / F1b SHORT).
    LONG  autorisé si close_wk > SMA(10 semaines) ET close_wk > close_4_semaines_avant.
    SHORT autorisé si close_wk < SMA(10 semaines) ET close_wk < close_4_semaines_avant.
    Retourne True si le signal est autorisé.
    """
    idx = bisect_right(ts_weekly, ts_now) - 1
    if idx < sma_period + lookback_weeks - 1:
        return True
    cur_close = candles_weekly[idx].close
    sma10 = sum(candles_weekly[i].close for i in range(idx - sma_period + 1, idx + 1)) / sma_period
    close_4w_ago = candles_weekly[idx - lookback_weeks].close
    if direction == "LONG":
        return cur_close > sma10 and cur_close > close_4w_ago
    else:
        return cur_close < sma10 and cur_close < close_4w_ago


MAX_CONCURRENT_REPLAYS = 3


def _persist_running(session: ReplaySession) -> None:
    import json
    config_json = json.dumps({
        "symbol": session.symbol,
        "timeframe": "4h/1h/15m",
        "date_start": session.date_start.isoformat(),
        "date_end": session.date_end.isoformat(),
        "mode": "multi-tf",
    })
    with Session(db_engine) as s:
        bt = BacktestResult(
            symbol=session.symbol,
            timeframe="4h/1h/15m",
            strategy_version=session.profile_name,
            win_rate=0.0, profit_factor=0.0, expectancy=0.0, drawdown=0.0, r_multiple=0.0,
            pipeline_run_id=session.session_id,
            signal_count=0,
            date_from=session.date_start.strftime("%Y-%m-%d"),
            date_to=session.date_end.strftime("%Y-%m-%d"),
            status=ReplayStatus.RUNNING.value,
            config=config_json,
            trades_json="[]",
        )
        s.add(bt)
        s.commit()
        s.refresh(bt)
        session.backtest_result_id = bt.id


def _naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt


_HTF_BIAS_TO_STRUCT = {
    "LONG": "Bullish",
    "SHORT": "Bearish",
    None: "Neutre / Range",
}


def _run_replay(
    session: ReplaySession,
    fib_levels: list[float],
    rr_ratio: float,
    htf_long_min_bias: str = "neutral",
    htf_short_min_bias: str = "SHORT",
    tf1h_short_min_bias: str = "neutral",
    tf1h_long_min_bias: str = "neutral",
    # --- Profile params now fully propagated ---
    enable_spring: bool = True,
    enable_utad: bool = True,
    disp_threshold: float = 0.40,
    disp_atr_min: float = 0.75,
    disp_vol_min: float = 0.8,
    bos_sensitivity: int = 6,
    bos_close_conf: bool = True,
    wyckoff_lookback: int = 12,
    vol_mult: float = 1.3,
    sl_atr_mult: float = 1.5,
    allow_weekend: bool = True,
    use_weekly_trend_filter: bool = False,
) -> None:
    _persist_running(session)
    try:
        date_start_naive = _naive(session.date_start)
        date_end_naive = _naive(session.date_end)
        buffer_start = date_start_naive - timedelta(days=90)

        candles_4h = _load_candles_from_db(session.symbol, "4h", buffer_start, date_end_naive)
        candles_1h = _load_candles_from_db(session.symbol, "1h", buffer_start, date_end_naive)
        candles_15m = _load_candles_from_db(session.symbol, "15m", buffer_start, date_end_naive)

        logger.info(
            "Replay %s — loaded: 4H=%d 1H=%d 15m=%d",
            session.session_id[:8], len(candles_4h), len(candles_1h), len(candles_15m)
        )

        if not candles_15m:
            with session._lock:
                session.status = ReplayStatus.FAILED
                session.error = "Aucune bougie 15m trouvée. Importez d'abord les données 15m."
            _persist_result(session)
            return

        if not candles_1h:
            with session._lock:
                session.status = ReplayStatus.FAILED
                session.error = "Aucune bougie 1H trouvée. Importez d'abord les données 1H."
            _persist_result(session)
            return

        ts_4h = _build_ts_index(candles_4h)
        ts_1h = _build_ts_index(candles_1h)

        # Bougies weekly (resamplées depuis 1H, incluent le buffer 90j)
        candles_weekly: list[CandleData] = []
        ts_weekly: list[datetime] = []
        if use_weekly_trend_filter:
            candles_weekly = _build_weekly_candles(candles_1h)
            ts_weekly = [c.timestamp for c in candles_weekly]
            logger.info(
                "Replay %s — weekly candles: %d (filter actif)",
                session.session_id[:8], len(candles_weekly)
            )

        candles_15m_in_range = [
            c for c in candles_15m if c.timestamp >= date_start_naive
        ]

        with session._lock:
            session.total_candles = len(candles_15m_in_range)

        cooldown_bars = 0
        _ts_index = {id(c): i for i, c in enumerate(candles_15m)}

        # Local rejection counters (merged into session at end)
        rej = {k: 0 for k in session.step_rejections}

        for idx, current_candle in enumerate(candles_15m_in_range):
            with session._lock:
                session.candles_processed = idx + 1

            session._check_open_positions(current_candle)

            if cooldown_bars > 0:
                cooldown_bars -= 1
                continue

            if len(session.open_positions) >= 1:
                continue

            # Skip weekend candles if profile disables weekend trading
            if not allow_weekend and current_candle.timestamp.weekday() >= 5:
                rej["weekend"] += 1
                continue

            pos_in_full = _ts_index.get(id(current_candle), -1)
            if pos_in_full < WINDOW_15M:
                rej["no_data"] += 1
                continue

            window_15m = candles_15m[pos_in_full - WINDOW_15M: pos_in_full]

            ts_now = current_candle.timestamp
            idx_4h = bisect_right(ts_4h, ts_now) - 1
            idx_1h = bisect_right(ts_1h, ts_now) - 1

            if idx_4h < WINDOW_4H:
                htf_bias = None
            else:
                window_4h = candles_4h[max(0, idx_4h - WINDOW_4H): idx_4h]
                htf_bias = _get_4h_bias(window_4h)

            if idx_1h < WINDOW_1H:
                tf_1h_struct = None
            else:
                window_1h = candles_1h[max(0, idx_1h - WINDOW_1H): idx_1h]
                tf_1h_struct = _get_1h_structure(window_1h)

            # ── Pipeline complet via ta_engine (identique au scanner live) ──

            # Step 0 — Liquidity Zone
            _zone_type, zone_price, is_high_zone = ta.detect_liquidity_zone(window_15m)
            if zone_price <= 0:
                rej["step0_liq"] += 1
                continue

            # Step 1 — Sweep
            sweep_ok, _sweep_price = ta.detect_sweep(window_15m, zone_price, is_high_zone)
            if not sweep_ok:
                rej["step1_sweep"] += 1
                continue

            # Step 2 — Wyckoff (Spring / UTAD)
            htf_str = _HTF_BIAS_TO_STRUCT.get(htf_bias, "Neutre / Range")
            _spring, _utad, direction_15m, _wyckoff_event = ta.detect_wyckoff(
                window_15m, htf_str,
                enable_spring=enable_spring,
                enable_utad=enable_utad,
                lookback=wyckoff_lookback,
            )
            if direction_15m is None:
                rej["step2_wyckoff"] += 1
                continue

            # HTF / 1H alignment filter
            htf_rejected = False
            if direction_15m == "LONG":
                if htf_bias == "SHORT":
                    htf_rejected = True
                elif htf_long_min_bias == "LONG" and htf_bias != "LONG":
                    htf_rejected = True
                elif tf1h_long_min_bias == "LONG" and tf_1h_struct != "LONG":
                    htf_rejected = True
            else:
                if htf_bias == "LONG":
                    htf_rejected = True
                elif htf_short_min_bias == "SHORT" and htf_bias != "SHORT":
                    htf_rejected = True
                elif tf1h_short_min_bias == "SHORT" and tf_1h_struct != "SHORT":
                    htf_rejected = True
            if htf_rejected:
                rej["htf_filter"] += 1
                continue

            # Weekly Trend Filter (F1a LONG / F1b SHORT)
            if use_weekly_trend_filter and candles_weekly:
                if not _get_weekly_bias(
                    candles_weekly, ts_weekly, ts_now, direction_15m
                ):
                    rej["weekly_trend"] += 1
                    continue

            # Step 3 — Displacement
            disp_ok, _disp_val, _atr_r, _vol_r = ta.detect_displacement(
                window_15m, direction_15m,
                disp_threshold=disp_threshold,
                atr_min=disp_atr_min,
                vol_min=disp_vol_min,
            )
            if not disp_ok:
                rej["step3_disp"] += 1
                continue

            # Step 4 — BOS
            bos_ok, _bos_level = ta.detect_bos(
                window_15m, direction_15m,
                bos_sens=bos_sensitivity,
                close_confirmation=bos_close_conf,
            )
            if not bos_ok:
                rej["step4_bos"] += 1
                continue

            # Step 5 — Volume + Expansion
            vol_ok, _vol_ratio = ta.detect_volume(window_15m, vol_mult=vol_mult)
            exp_ok, _next_liq = ta.detect_expansion(window_15m, direction_15m)
            if not vol_ok and not exp_ok:
                rej["step5_vol_exp"] += 1
                continue

            # Step 6 — Fibonacci
            _fib_level, fib_ok = ta.detect_fibonacci(window_15m, direction_15m, fib_levels)
            if not fib_ok:
                rej["step6_fib"] += 1
                continue

            # ── All steps passed → open position ──
            atr_val = _compute_atr(window_15m)
            if atr_val <= 0:
                continue

            session._open_position(
                current_candle, direction_15m, atr_val,
                htf_bias=htf_bias or "neutral",
                tf_1h=tf_1h_struct or "neutral",
                rr_ratio=rr_ratio,
                sl_atr_mult=sl_atr_mult,
            )
            cooldown_bars = 4

        # Merge local rejection counters into session
        with session._lock:
            for k, v in rej.items():
                session.step_rejections[k] = v

        session.compute_final_metrics()
        with session._lock:
            session.status = ReplayStatus.COMPLETED
        _persist_result(session)

    except Exception as exc:
        logger.exception("Replay session %s failed", session.session_id)
        with session._lock:
            session.status = ReplayStatus.FAILED
            session.error = str(exc)
        _persist_result(session)


def _persist_result(session: ReplaySession) -> None:
    import json
    trades_json = json.dumps([
        {
            "timestamp": t.timestamp,
            "direction": t.direction,
            "entry_price": t.entry_price,
            "sl_price": t.sl_price,
            "tp_price": t.tp_price,
            "result": t.result,
            "r_multiple": t.r_multiple,
            "htf_bias": t.htf_bias,
            "tf_1h_structure": t.tf_1h_structure,
        }
        for t in session.trades
    ])

    with Session(db_engine) as s:
        bt = s.get(BacktestResult, session.backtest_result_id)
        if bt is None:
            return
        bt.win_rate = session.metrics.win_rate
        bt.profit_factor = session.metrics.profit_factor
        bt.expectancy = session.metrics.expectancy
        bt.drawdown = session.metrics.max_drawdown
        bt.r_multiple = session.metrics.total_r
        bt.signal_count = session.metrics.total_trades
        bt.status = session.status.value
        bt.trades_json = trades_json
        s.add(bt)
        s.commit()


class ReplayManager:
    def __init__(self) -> None:
        self._sessions: dict[str, ReplaySession] = {}
        self._lock = threading.Lock()

    def start(
        self,
        symbol: str,
        date_start: datetime,
        date_end: datetime,
        fib_levels: list[float] | None = None,
        rr_ratio: float = 2.0,
        htf_long_min_bias: str = "neutral",
        htf_short_min_bias: str = "SHORT",
        tf1h_short_min_bias: str = "neutral",
        tf1h_long_min_bias: str = "neutral",
        profile_name: str = "SMC/Wyckoff Multi-TF",
        # --- All profile params ---
        enable_spring: bool = True,
        enable_utad: bool = True,
        disp_threshold: float = 0.40,
        disp_atr_min: float = 0.75,
        disp_vol_min: float = 0.8,
        bos_sensitivity: int = 6,
        bos_close_conf: bool = True,
        wyckoff_lookback: int = 12,
        vol_mult: float = 1.3,
        sl_atr_mult: float = 1.5,
        allow_weekend: bool = True,
        use_weekly_trend_filter: bool = False,
    ) -> str | None:
        if fib_levels is None:
            fib_levels = [0.5, 0.618, 0.705]

        with self._lock:
            running = sum(
                1 for s in self._sessions.values() if s.status == ReplayStatus.RUNNING
            )
            if running >= MAX_CONCURRENT_REPLAYS:
                return None

        session_id = str(uuid.uuid4())
        session = ReplaySession(
            session_id=session_id,
            symbol=symbol,
            date_start=date_start,
            date_end=date_end,
            profile_name=profile_name,
        )

        with self._lock:
            self._sessions[session_id] = session

        thread = threading.Thread(
            target=_run_replay,
            kwargs=dict(
                session=session,
                fib_levels=fib_levels,
                rr_ratio=rr_ratio,
                htf_long_min_bias=htf_long_min_bias,
                htf_short_min_bias=htf_short_min_bias,
                tf1h_short_min_bias=tf1h_short_min_bias,
                tf1h_long_min_bias=tf1h_long_min_bias,
                enable_spring=enable_spring,
                enable_utad=enable_utad,
                disp_threshold=disp_threshold,
                disp_atr_min=disp_atr_min,
                disp_vol_min=disp_vol_min,
                bos_sensitivity=bos_sensitivity,
                bos_close_conf=bos_close_conf,
                wyckoff_lookback=wyckoff_lookback,
                vol_mult=vol_mult,
                sl_atr_mult=sl_atr_mult,
                allow_weekend=allow_weekend,
                use_weekly_trend_filter=use_weekly_trend_filter,
            ),
            daemon=True,
            name=f"replay-{session_id[:8]}",
        )
        thread.start()
        return session_id

    def get_session(self, session_id: str) -> ReplaySession | None:
        with self._lock:
            return self._sessions.get(session_id)

    def get_status(self, session_id: str) -> dict | None:
        session = self.get_session(session_id)
        if session is None:
            return None

        with session._lock:
            status_val = session.status.value
            result: dict = {
                "session_id": session.session_id,
                "status": status_val,
                "symbol": session.symbol,
                "timeframe": "4h/1h/15m",
                "candles_processed": session.candles_processed,
                "total_candles": session.total_candles,
            }

            if session.error:
                result["error"] = session.error

            if session.status == ReplayStatus.COMPLETED:
                result["metrics"] = {
                    "total_trades": session.metrics.total_trades,
                    "wins": session.metrics.wins,
                    "losses": session.metrics.losses,
                    "win_rate": session.metrics.win_rate,
                    "profit_factor": session.metrics.profit_factor,
                    "max_drawdown": session.metrics.max_drawdown,
                    "expectancy": session.metrics.expectancy,
                    "total_r": session.metrics.total_r,
                }
                result["trades"] = [
                    {
                        "timestamp": t.timestamp,
                        "direction": t.direction,
                        "entry_price": t.entry_price,
                        "sl_price": t.sl_price,
                        "tp_price": t.tp_price,
                        "result": t.result,
                        "r_multiple": t.r_multiple,
                        "htf_bias": t.htf_bias,
                        "tf_1h_structure": t.tf_1h_structure,
                    }
                    for t in session.trades
                ]
                result["backtest_result_id"] = session.backtest_result_id
                result["step_rejections"] = dict(session.step_rejections)

        return result


replay_manager = ReplayManager()
