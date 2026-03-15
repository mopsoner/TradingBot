from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Session, select

from backend.app.db.session import engine as db_engine
from backend.app.db.models import MarketCandle, BacktestResult
from backend.app.services.signal_engine import SetupInput, SignalEngine
from backend.app.services.walkforward import (
    CandleData,
    analyze_window,
    _compute_atr,
)

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500


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
    timeframe: str
    date_start: datetime
    date_end: datetime
    status: ReplayStatus = ReplayStatus.RUNNING
    error: str | None = None
    metrics: ReplayMetrics = field(default_factory=ReplayMetrics)
    trades: list[ReplayTrade] = field(default_factory=list)
    candles_processed: int = 0
    total_candles: int = 0
    backtest_result_id: int | None = None

    equity: float = field(default=10.0, repr=False)
    peak: float = field(default=10.0, repr=False)
    max_dd: float = field(default=0.0, repr=False)
    open_positions: list[dict] = field(default_factory=list, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

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
                if direction == "LONG":
                    hit_sl = abs(candle.open - sl) <= abs(candle.open - tp)
                else:
                    hit_sl = abs(candle.open - sl) <= abs(candle.open - tp)
                hit_tp = not hit_sl

            if hit_sl:
                r = -1.0
                self._record_trade_close(pos, "SL", r)
                closed.append(pos)
            elif hit_tp:
                r = pos["rr_ratio"]
                self._record_trade_close(pos, "TP", r)
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
        self, candle: CandleData, direction: str, atr: float, rr_ratio: float = 2.0
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

        if self.peak > 0:
            dd_pct = min(self.max_dd / self.peak, 1.0)
        else:
            dd_pct = min(self.max_dd, 1.0) if self.max_dd > 0 else 0.0

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
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            candles.append(CandleData(
                timestamp=ts,
                open=r.open, high=r.high, low=r.low, close=r.close, volume=r.volume,
            ))
        offset += len(rows)
        if len(rows) < CHUNK_SIZE:
            break
    return candles


MAX_CONCURRENT_REPLAYS = 3


def _persist_running(session: ReplaySession) -> None:
    import json
    config_json = json.dumps({
        "symbol": session.symbol,
        "timeframe": session.timeframe,
        "date_start": session.date_start.isoformat(),
        "date_end": session.date_end.isoformat(),
    })
    with Session(db_engine) as s:
        bt = BacktestResult(
            symbol=session.symbol,
            timeframe=session.timeframe,
            strategy_version="SMC/Wyckoff Replay",
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


def _run_replay(session: ReplaySession, fib_levels: list[float], rr_ratio: float) -> None:
    _persist_running(session)
    try:
        engine_inst = SignalEngine(fib_levels)
        candles = _load_candles_from_db(
            session.symbol, session.timeframe, session.date_start, session.date_end
        )
        with session._lock:
            session.total_candles = len(candles)

        if not candles:
            with session._lock:
                session.status = ReplayStatus.FAILED
                session.error = "Aucune bougie trouvée pour cette configuration."
            _persist_result(session)
            return

        window_size = 50

        for i in range(len(candles)):
            with session._lock:
                session.candles_processed = i + 1

            current_candle = candles[i]
            session._check_open_positions(current_candle)

            if i < window_size:
                continue

            if len(session.open_positions) >= 1:
                continue

            window = candles[i - window_size: i]
            direction, steps = analyze_window(window, engine_inst)

            if direction is not None:
                atr = _compute_atr(window)
                if atr > 0:
                    session._open_position(current_candle, direction, atr, rr_ratio)

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
        timeframe: str,
        date_start: datetime,
        date_end: datetime,
        fib_levels: list[float] | None = None,
        rr_ratio: float = 2.0,
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
            timeframe=timeframe,
            date_start=date_start,
            date_end=date_end,
        )

        with self._lock:
            self._sessions[session_id] = session

        thread = threading.Thread(
            target=_run_replay,
            args=(session, fib_levels, rr_ratio),
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
                "timeframe": session.timeframe,
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
                    }
                    for t in session.trades
                ]
                result["backtest_result_id"] = session.backtest_result_id

        return result


replay_manager = ReplayManager()
