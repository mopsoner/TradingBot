from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select, func

from backend.app.core.config import AppConfig, config
from backend.app.db.models import (
    Signal,
    Trade,
    Position,
    BacktestResult,
    Log,
    MarketCandle,
    BotJob,
    ScanSchedule,
)
from backend.app.db.session import engine
from backend.app.services.backtesting import BacktestingEngine
from backend.app.services.execution import ExecutionService
from backend.app.services.market_data import MarketDataService
from backend.app.services.paper_trade import PaperTradeManager
from backend.app.services.risk_manager import RiskManager, RiskState
from backend.app.services.session_filter import SessionFilter
from backend.app.services.signal_engine import SetupInput, SignalEngine

router = APIRouter()
market_data = MarketDataService()
session_filter = SessionFilter()
signal_engine = SignalEngine(config.strategy.fib_levels)
risk = RiskManager(
    config.risk.risk_per_trade,
    config.risk.max_open_positions,
    config.risk.daily_loss_limit,
    config.risk.weekly_loss_limit,
)
paper = PaperTradeManager()
backtesting = BacktestingEngine()
execution = ExecutionService(paper_mode=config.system.mode != "live")


# ── Read endpoints ────────────────────────────────────────────────────────────

@router.get("/dashboard")
def dashboard() -> dict:
    with Session(engine) as s:
        total_signals = s.exec(select(func.count(Signal.id))).one()
        accepted_signals = s.exec(select(func.count(Signal.id)).where(Signal.accepted == True)).one()
        total_trades = s.exec(select(func.count(Trade.id))).one()
        wins = s.exec(select(func.count(Trade.id)).where(Trade.status == "CLOSED_WIN")).one()
        losses = s.exec(select(func.count(Trade.id)).where(Trade.status == "CLOSED_LOSS")).one()
        open_trades = s.exec(select(func.count(Trade.id)).where(Trade.status == "OPEN")).one()
        positions = s.exec(select(Position)).all()
        recent_trades = s.exec(select(Trade).order_by(Trade.timestamp.desc()).limit(10)).all()
        total_pnl = sum(p.unrealized_pnl for p in positions)
        win_rate = round(wins / max(wins + losses, 1), 4)
    return {
        "total_signals": total_signals,
        "accepted_signals": accepted_signals,
        "total_trades": total_trades,
        "open_trades": open_trades,
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "open_positions": len(positions),
        "total_pnl": round(total_pnl, 2),
        "recent_trades": [t.model_dump() for t in recent_trades],
        "mode": config.system.mode,
    }


@router.get("/signals")
def get_signals(
    limit: int = Query(100, le=500),
    offset: int = 0,
    accepted: Optional[bool] = None,
) -> dict:
    with Session(engine) as s:
        q = select(Signal).order_by(Signal.timestamp.desc())
        if accepted is not None:
            q = q.where(Signal.accepted == accepted)
        total = s.exec(select(func.count(Signal.id))).one()
        rows = s.exec(q.offset(offset).limit(limit)).all()
    return {"total": total, "rows": [r.model_dump() for r in rows]}


@router.get("/trades")
def get_trades(
    limit: int = Query(100, le=500),
    offset: int = 0,
    status: Optional[str] = None,
) -> dict:
    with Session(engine) as s:
        q = select(Trade).order_by(Trade.timestamp.desc())
        if status:
            q = q.where(Trade.status == status)
        total = s.exec(select(func.count(Trade.id))).one()
        rows = s.exec(q.offset(offset).limit(limit)).all()
    return {"total": total, "rows": [r.model_dump() for r in rows]}


@router.get("/positions")
def get_positions() -> list:
    with Session(engine) as s:
        rows = s.exec(select(Position)).all()
    return [r.model_dump() for r in rows]


@router.get("/backtests")
def get_backtests(limit: int = Query(50, le=200), offset: int = 0) -> dict:
    with Session(engine) as s:
        total = s.exec(select(func.count(BacktestResult.id))).one()
        rows = s.exec(select(BacktestResult).order_by(BacktestResult.timestamp.desc()).offset(offset).limit(limit)).all()
    return {"total": total, "rows": [r.model_dump() for r in rows]}


@router.get("/logs")
def get_logs(
    limit: int = Query(100, le=500),
    offset: int = 0,
    level: Optional[str] = None,
) -> dict:
    with Session(engine) as s:
        q = select(Log).order_by(Log.timestamp.desc())
        if level:
            q = q.where(Log.level == level)
        total = s.exec(select(func.count(Log.id))).one()
        rows = s.exec(q.offset(offset).limit(limit)).all()
    return {"total": total, "rows": [r.model_dump() for r in rows]}


@router.get("/bot/status")
def bot_status(limit: int = Query(80, le=300)) -> dict:
    now = datetime.now(timezone.utc)
    with Session(engine) as s:
        jobs = s.exec(select(BotJob).order_by(BotJob.timestamp.desc()).limit(limit)).all()
        recent = jobs[:20]
        pending_signals = len([j for j in recent if j.status == "SIGNAL_DETECTED"])
        grouped = {"asia": 0, "london": 0, "newyork": 0, "off-session": 0}
        for j in recent:
            grouped[j.session_name if j.session_name in grouped else "off-session"] += 1

        schedules = s.exec(select(ScanSchedule).order_by(ScanSchedule.id.asc())).all()

    return {
        "mode": config.system.mode,
        "is_tradeable_now": session_filter.is_tradeable(now),
        "live_progress": {
            "jobs_processed": len(recent),
            "signals_detected": pending_signals,
            "session_breakdown": grouped,
        },
        "recent_events": [j.model_dump() for j in recent],
        "schedules": [sched.model_dump() for sched in schedules],
    }


@router.get("/data/stats")
def data_stats() -> dict:
    with Session(engine) as s:
        total_candles = s.exec(select(func.count(MarketCandle.id))).one()
        latest = s.exec(select(MarketCandle).order_by(MarketCandle.timestamp.desc()).limit(1)).first()
        symbols = s.exec(select(MarketCandle.symbol)).all()
        unique_symbols = sorted(list(set(symbols)))
    return {
        "total_candles": total_candles,
        "tracked_symbols": unique_symbols,
        "last_candle_at": latest.timestamp if latest else None,
    }


@router.get("/data/candles")
def candles(
    symbol: Optional[str] = None,
    timeframe: Optional[str] = None,
    limit: int = Query(200, le=1000),
    offset: int = 0,
) -> dict:
    with Session(engine) as s:
        q = select(MarketCandle).order_by(MarketCandle.timestamp.desc())
        if symbol:
            q = q.where(MarketCandle.symbol == symbol)
        if timeframe:
            q = q.where(MarketCandle.timeframe == timeframe)
        total = s.exec(select(func.count(MarketCandle.id))).one()
        rows = s.exec(q.offset(offset).limit(limit)).all()
    return {"total": total, "rows": [r.model_dump() for r in rows]}


# ── Existing action endpoints ─────────────────────────────────────────────────

@router.get("/symbols")
def symbols() -> list[str]:
    preferred = ["BTCUSDT", "ETHUSDT"]
    universe = market_data.load_symbols()
    merged = list(dict.fromkeys(preferred + universe))
    return merged


@router.get("/config")
def get_config() -> dict:
    return config.model_dump()


@router.put("/config")
def update_config(new_config: AppConfig) -> dict:
    config.strategy = new_config.strategy
    config.risk = new_config.risk
    config.system = new_config.system
    config.trading = new_config.trading

    signal_engine.fib_levels = config.strategy.fib_levels
    execution.paper_mode = config.system.mode != "live"

    with Session(engine) as s:
        s.add(Log(level="INFO", message=f"Configuration updated for mode={config.system.mode}"))
        s.commit()

    return {"ok": True, "config": config.model_dump()}


@router.get("/execution/endpoints")
def margin_endpoints() -> dict:
    return {
        "execution_mode": "paper" if execution.paper_mode else "live",
        "binance_margin_type": "isolated",
        "endpoints": execution.ISOLATED_MARGIN_ENDPOINTS,
    }


class ScanRequest(BaseModel):
    symbol: str
    liquidity_zone: bool
    sweep: bool
    spring: bool = False
    utad: bool = False
    displacement: bool
    bos: bool
    fib_retracement: float


class MultiScanRequest(BaseModel):
    symbols: list[str] = Field(min_length=1)
    fib_retracement: float = 0.618
    require_displacement: bool = True
    require_bos: bool = True


class StartBotRequest(BaseModel):
    symbols: list[str] = Field(default_factory=lambda: ["ETHUSDT", "BTCUSDT"], min_length=1)
    timeframe: str = "15m"
    mode: str = "paper"
    risk_approved: bool = False
    execute_orders: bool = False


class CandleIn(BaseModel):
    symbol: str
    timeframe: str = "15m"
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    source: str = "manual"


def resolve_session(ts: datetime) -> str:
    hour = ts.astimezone(timezone.utc).hour
    if 0 <= hour <= 6:
        return "asia"
    if 7 <= hour <= 12:
        return "london"
    if 13 <= hour <= 20:
        return "newyork"
    return "off-session"


@router.post("/scan")
def scan(req: ScanRequest) -> dict:
    direction = signal_engine.detect(
        SetupInput(
            symbol=req.symbol,
            liquidity_zone=req.liquidity_zone,
            sweep=req.sweep,
            spring=req.spring,
            utad=req.utad,
            displacement=req.displacement,
            bos=req.bos,
            fib_retracement=req.fib_retracement,
        )
    )
    if not direction:
        return {"accepted": False, "reason": "incomplete_sequence"}

    approved, reason = risk.approve(RiskState(open_positions=1, daily_loss=0, weekly_loss=0))
    if not approved:
        return {"accepted": False, "reason": reason}

    order = paper.submit(req.symbol, direction, 100, 98, 106)

    with Session(engine) as s:
        s.add(Log(
            level="INFO",
            message=f"Scan accepted: {direction} {req.symbol} — order submitted",
        ))
        s.commit()

    return {"accepted": True, "signal": direction, "order": order, "timestamp": datetime.utcnow()}


@router.post("/scan/market")
def market_scan(req: MultiScanRequest) -> dict:
    accepted: list[dict] = []
    rejected: list[dict] = []
    for idx, symbol in enumerate(req.symbols):
        pattern_switch = idx % 4
        spring = pattern_switch in (0, 1)
        utad = not spring
        liquidity_zone = True
        sweep = True
        displacement = req.require_displacement and pattern_switch != 3
        bos = req.require_bos and pattern_switch in (0, 2)
        signal = signal_engine.detect(
            SetupInput(
                symbol=symbol,
                liquidity_zone=liquidity_zone,
                sweep=sweep,
                spring=spring,
                utad=utad,
                displacement=displacement,
                bos=bos,
                fib_retracement=req.fib_retracement,
            )
        )

        chart = [
            {"t": i, "price": round(100 + (idx * 4) + ((i - 8) ** 2) * 0.08 + (i % 3) * 0.4, 2)}
            for i in range(16)
        ]
        signal_points = [
            {"type": "liquidity", "index": 3},
            {"type": "sweep", "index": 5},
            {"type": "spring" if spring else "utad", "index": 7},
            {"type": "displacement", "index": 9},
            {"type": "bos", "index": 11},
            {"type": "fib", "index": 13},
        ]

        row = {
            "symbol": symbol,
            "signal": signal,
            "accepted": bool(signal),
            "fib_retracement": req.fib_retracement,
            "chart": chart,
            "signal_points": signal_points,
        }
        if signal:
            accepted.append(row)
        else:
            rejected.append({"symbol": symbol, "reason": "incomplete_sequence", "chart": chart, "signal_points": signal_points})

    return {
        "timestamp": datetime.utcnow(),
        "total": len(req.symbols),
        "accepted": accepted,
        "rejected": rejected,
        "automation": {
            "scan_interval_minutes": 15,
            "next_scan_eta_seconds": 900,
            "auto_route_to_paper": True,
            "margin_type": "ISOLATED",
        },
    }


@router.post("/bot/start")
def start_bot(req: StartBotRequest) -> dict:
    if req.mode == "live" and not req.risk_approved:
        return {"ok": False, "reason": "risk_approval_required_for_live"}

    now = datetime.now(timezone.utc)
    events: list[dict] = []
    executed_orders = 0
    signals_detected = 0
    with Session(engine) as s:
        for idx, symbol in enumerate(req.symbols):
            pattern_switch = idx % 2
            spring = pattern_switch == 0
            direction = signal_engine.detect(
                SetupInput(
                    symbol=symbol,
                    liquidity_zone=True,
                    sweep=True,
                    spring=spring,
                    utad=not spring,
                    displacement=True,
                    bos=True,
                    fib_retracement=0.618,
                )
            )
            session_name = resolve_session(now)
            status = "REJECTED"
            details = "No complete SMC/Wyckoff sequence"

            if direction:
                signals_detected += 1
                status = "SIGNAL_DETECTED"
                details = f"{direction} setup confirmed with fib=0.618"

            if direction and req.execute_orders and req.risk_approved:
                entry = 100 + idx * 3
                stop = entry - 2 if direction == "LONG" else entry + 2
                target = entry + 4 if direction == "LONG" else entry - 4
                s.add(Trade(symbol=symbol, side=direction, entry=entry, stop=stop, target=target, status="OPEN", mode=req.mode))
                executed_orders += 1
                status = "ORDER_SUBMITTED"
                details = f"{direction} order submitted ({req.mode})"

            job = BotJob(
                symbol=symbol,
                timeframe=req.timeframe,
                session_name=session_name,
                mode=req.mode,
                status=status,
                signal=direction,
                details=details,
            )
            s.add(job)
            s.add(Log(level="INFO", message=f"[{session_name}] {symbol} {status}: {details}"))
            events.append(job.model_dump())

        schedule = s.exec(select(ScanSchedule).where(ScanSchedule.name == "intraday_scan")).first()
        if not schedule:
            schedule = ScanSchedule(name="intraday_scan", cron="*/15 * * * *", enabled=True, task_type="scan")
            s.add(schedule)
        schedule.last_run = now
        schedule.next_run = now + timedelta(minutes=15)
        s.commit()

    return {
        "ok": True,
        "mode": req.mode,
        "symbols": req.symbols,
        "signals_detected": signals_detected,
        "orders_submitted": executed_orders,
        "events": events,
        "next_scan_eta_seconds": 900,
    }


@router.post("/data/ingest")
def ingest_data(payload: list[CandleIn]) -> dict:
    if not payload:
        return {"ok": False, "reason": "empty_payload"}

    with Session(engine) as s:
        for candle in payload:
            s.add(MarketCandle(**candle.model_dump()))
        s.add(Log(level="INFO", message=f"Ingested {len(payload)} candles via data manager"))
        s.commit()

    return {"ok": True, "inserted": len(payload)}


@router.post("/data/enrich/daily")
def daily_enrichment(symbols: list[str]) -> dict:
    if not symbols:
        symbols = ["ETHUSDT", "BTCUSDT"]

    now = datetime.now(timezone.utc)
    rows_added = 0
    with Session(engine) as s:
        for symbol in symbols:
            base = 100 if symbol == "ETHUSDT" else 180
            for i in range(24):
                close = base + i * 0.4
                candle = MarketCandle(
                    symbol=symbol,
                    timeframe="1h",
                    timestamp=now - timedelta(hours=i),
                    open=close - 0.6,
                    high=close + 0.8,
                    low=close - 1,
                    close=close,
                    volume=1000 + i * 15,
                    source="daily-enrichment",
                )
                s.add(candle)
                rows_added += 1

            s.add(BotJob(
                symbol=symbol,
                timeframe="1h",
                session_name=resolve_session(now),
                mode="research",
                status="DB_ENRICHED",
                details="Daily enrichment stored for backtesting",
            ))

        schedule = s.exec(select(ScanSchedule).where(ScanSchedule.name == "daily_enrichment")).first()
        if not schedule:
            schedule = ScanSchedule(name="daily_enrichment", cron="0 1 * * *", enabled=True, task_type="enrichment")
            s.add(schedule)
        schedule.last_run = now
        schedule.next_run = now + timedelta(days=1)

        s.add(Log(level="INFO", message=f"Daily enrichment completed for {len(symbols)} symbols ({rows_added} candles)"))
        s.commit()

    return {
        "ok": True,
        "symbols": symbols,
        "rows_added": rows_added,
        "next_daily_run": now + timedelta(days=1),
    }


@router.post("/backtest")
def run_backtest(outcomes_r: list[float]) -> dict:
    return backtesting.run(outcomes_r).__dict__
