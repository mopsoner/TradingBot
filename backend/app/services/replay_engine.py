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
    analyze_window,
    _compute_atr,
    _find_swing_points,
    _detect_equal_levels,
)

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
    disp_atr_mult: float = 0.8

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
        htf_bias: str, tf_1h: str, rr_ratio: float = 2.0
    ) -> None:
        entry = candle.close
        if direction == "LONG":
            sl = entry - atr * 1.5
            tp = entry + atr * 1.5 * rr_ratio
        else:
            sl = entry + atr * 1.5
            tp = entry - atr * 1.5 * rr_ratio

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
    candles: list[CandleData] = []
    offset = 0
    while True:
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
                .offset(offset)
                .limit(CHUNK_SIZE)
            ).all()
        if not rows:
            break
        for r in rows:
            ts = r.timestamp
            if ts.tzinfo is not None:
                ts = ts.replace(tzinfo=None)
            candles.append(CandleData(
                timestamp=ts,
                open=r.open, high=r.high, low=r.low, close=r.close, volume=r.volume,
            ))
        offset += len(rows)
        if len(rows) < CHUNK_SIZE:
            break
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


def _run_replay(
    session: ReplaySession,
    fib_levels: list[float],
    rr_ratio: float,
    htf_long_min_bias: str = "neutral",
    htf_short_min_bias: str = "SHORT",
    tf1h_short_min_bias: str = "neutral",
    tf1h_long_min_bias: str = "neutral",
    disp_atr_mult: float = 0.8,
) -> None:
    _persist_running(session)
    try:
        engine_inst = SignalEngine(fib_levels)

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

        candles_15m_in_range = [
            c for c in candles_15m if c.timestamp >= date_start_naive
        ]

        with session._lock:
            session.total_candles = len(candles_15m_in_range)

        cooldown_bars = 0

        for idx, current_candle in enumerate(candles_15m_in_range):
            with session._lock:
                session.candles_processed = idx + 1

            session._check_open_positions(current_candle)

            if cooldown_bars > 0:
                cooldown_bars -= 1
                continue

            if len(session.open_positions) >= 1:
                continue

            pos_in_full = candles_15m.index(current_candle) if current_candle in candles_15m else -1
            if pos_in_full < WINDOW_15M:
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

            direction_15m, _ = analyze_window(window_15m, engine_inst, disp_atr_mult=disp_atr_mult)

            if direction_15m is None:
                continue

            if direction_15m == "LONG":
                if htf_bias == "SHORT":
                    continue
                if htf_long_min_bias == "LONG" and htf_bias != "LONG":
                    continue
                if tf1h_long_min_bias == "LONG" and tf_1h_struct != "LONG":
                    continue
            else:
                if htf_bias == "LONG":
                    continue
                if htf_short_min_bias == "SHORT" and htf_bias != "SHORT":
                    continue
                if tf1h_short_min_bias == "SHORT" and tf_1h_struct != "SHORT":
                    continue

            atr = _compute_atr(window_15m)
            if atr <= 0:
                continue

            session._open_position(
                current_candle, direction_15m, atr,
                htf_bias=htf_bias or "neutral",
                tf_1h=tf_1h_struct or "neutral",
                rr_ratio=rr_ratio,
            )
            cooldown_bars = 4

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
        disp_atr_mult: float = 0.8,
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
            disp_atr_mult=disp_atr_mult,
        )

        with self._lock:
            self._sessions[session_id] = session

        thread = threading.Thread(
            target=_run_replay,
            args=(session, fib_levels, rr_ratio, htf_long_min_bias, htf_short_min_bias,
                  tf1h_short_min_bias, tf1h_long_min_bias, disp_atr_mult),
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

        return result


replay_manager = ReplayManager()
