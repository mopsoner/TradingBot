from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlmodel import Session, select, func

from backend.app.core.config import config
from backend.app.db.models import Signal, Trade, Position, BacktestResult, Log
from backend.app.db.session import engine
from backend.app.services.backtesting import BacktestingEngine
from backend.app.services.market_data import MarketDataService
from backend.app.services.paper_trade import PaperTradeManager
from backend.app.services.risk_manager import RiskManager, RiskState
from backend.app.services.signal_engine import SetupInput, SignalEngine

router = APIRouter()
market_data = MarketDataService()
signal_engine = SignalEngine(config.strategy.fib_levels)
risk = RiskManager(
    config.risk.risk_per_trade,
    config.risk.max_open_positions,
    config.risk.daily_loss_limit,
    config.risk.weekly_loss_limit,
)
paper = PaperTradeManager()
backtesting = BacktestingEngine()


# ── Read endpoints ────────────────────────────────────────────────────────────

@router.get("/dashboard")
def dashboard() -> dict:
    with Session(engine) as s:
        total_signals   = s.exec(select(func.count(Signal.id))).one()
        accepted_signals= s.exec(select(func.count(Signal.id)).where(Signal.accepted == True)).one()
        total_trades    = s.exec(select(func.count(Trade.id))).one()
        wins            = s.exec(select(func.count(Trade.id)).where(Trade.status == "CLOSED_WIN")).one()
        losses          = s.exec(select(func.count(Trade.id)).where(Trade.status == "CLOSED_LOSS")).one()
        open_trades     = s.exec(select(func.count(Trade.id)).where(Trade.status == "OPEN")).one()
        positions       = s.exec(select(Position)).all()
        recent_trades   = s.exec(select(Trade).order_by(Trade.timestamp.desc()).limit(10)).all()
        total_pnl       = sum(p.unrealized_pnl for p in positions)
        win_rate        = round(wins / max(wins + losses, 1), 4)
    return {
        "total_signals":    total_signals,
        "accepted_signals": accepted_signals,
        "total_trades":     total_trades,
        "open_trades":      open_trades,
        "wins":             wins,
        "losses":           losses,
        "win_rate":         win_rate,
        "open_positions":   len(positions),
        "total_pnl":        round(total_pnl, 2),
        "recent_trades":    [t.model_dump() for t in recent_trades],
        "mode":             config.system.mode,
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
        rows  = s.exec(q.offset(offset).limit(limit)).all()
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
        rows  = s.exec(q.offset(offset).limit(limit)).all()
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
        rows  = s.exec(select(BacktestResult).order_by(BacktestResult.timestamp.desc()).offset(offset).limit(limit)).all()
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
        rows  = s.exec(q.offset(offset).limit(limit)).all()
    return {"total": total, "rows": [r.model_dump() for r in rows]}


# ── Existing action endpoints ─────────────────────────────────────────────────

@router.get("/symbols")
def symbols() -> list[str]:
    return market_data.load_symbols()


@router.get("/config")
def get_config() -> dict:
    return config.model_dump()


class ScanRequest(BaseModel):
    symbol: str
    liquidity_zone: bool
    sweep: bool
    spring: bool = False
    utad: bool = False
    displacement: bool
    bos: bool
    fib_retracement: float


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


@router.post("/backtest")
def run_backtest(outcomes_r: list[float]) -> dict:
    return backtesting.run(outcomes_r).__dict__
