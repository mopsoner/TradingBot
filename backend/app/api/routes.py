from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from backend.app.core.config import config
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


class ScanRequest(BaseModel):
    symbol: str
    liquidity_zone: bool
    sweep: bool
    spring: bool = False
    utad: bool = False
    displacement: bool
    bos: bool
    fib_retracement: float


@router.get("/symbols")
def symbols() -> list[str]:
    return market_data.load_symbols()


@router.get("/config")
def get_config() -> dict:
    return config.model_dump()


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
    return {"accepted": True, "signal": direction, "order": order, "timestamp": datetime.utcnow()}


@router.post("/backtest")
def run_backtest(outcomes_r: list[float]) -> dict:
    return backtesting.run(outcomes_r).__dict__
