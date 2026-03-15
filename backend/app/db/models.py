from datetime import datetime, timezone
from typing import Optional
import uuid

from sqlmodel import Field, SQLModel


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class PipelineRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: str = Field(default_factory=_uuid, index=True)
    started_at: datetime = Field(default_factory=_now_utc)
    completed_at: Optional[datetime] = None
    mode: str = "paper"
    source: str = "manual"
    symbols_json: str = "[]"
    timeframe: str = "1h"
    profile_id: Optional[int] = None
    accepted_count: int = 0
    rejected_count: int = 0
    error_count: int = 0
    total_count: int = 0
    results_json: str = "{}"


class Signal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_now_utc)
    symbol: str
    timeframe: str
    setup_type: str
    liquidity_zone: str
    sweep_level: float
    bos_level: float
    fib_zone: str
    accepted: bool = False
    direction: Optional[str] = None
    reject_reason: Optional[str] = None
    fake_breakout: bool = False
    equal_highs_lows: bool = False
    expansion: bool = False
    tf_4h_structure: Optional[str] = None
    tf_1h_validation: Optional[str] = None
    session_name: Optional[str] = None
    displacement_force: Optional[float] = None
    wyckoff_event: Optional[str] = None
    pipeline_run_id: Optional[str] = None
    zone_low: Optional[float] = None
    zone_high: Optional[float] = None


class Trade(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_now_utc)
    symbol: str
    side: str
    entry: float
    stop: float
    target: float
    status: str = "OPEN"
    mode: str = "paper"


class Position(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str
    quantity: float
    entry_price: float
    current_price: float
    unrealized_pnl: float = 0.0
    side: str = "LONG"
    notional: float = 0.0
    borrowed: float = 0.0
    interest: float = 0.0
    margin_level: float = 999.0
    margin_level_status: str = "NORMAL"
    liquidate_rate: float = 999.0
    liquidate_price: float = 0.0
    margin_ratio: float = 0.0
    total_asset_value: float = 0.0
    total_debt_value: float = 0.0


class BacktestResult(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_now_utc)
    symbol: str
    timeframe: str
    strategy_version: str
    win_rate: float
    profit_factor: float
    expectancy: float
    drawdown: float
    r_multiple: float


class Log(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_now_utc)
    level: str
    message: str


class Configuration(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str
    payload: str


class MarketCandle(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime
    symbol: str
    timeframe: str = "15m"
    open: float
    high: float
    low: float
    close: float
    volume: float
    source: str = "manual"


class BotJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_now_utc)
    symbol: str
    timeframe: str = "15m"
    session_name: str
    mode: str
    status: str
    signal: Optional[str] = None
    details: str = ""


class ScanSchedule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    cron: str
    enabled: bool = True
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    task_type: str = "scan"


class StrategyProfile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_now_utc)
    name: str
    mode: str = "research"
    parameters: str
    is_active: bool = False
    approved_for_live: bool = False
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    last_backtest_win_rate: Optional[float] = None
    last_backtest_profit_factor: Optional[float] = None
    last_backtest_drawdown: Optional[float] = None
    last_backtest_id: Optional[int] = None
    description: Optional[str] = None
    enable_auto_borrow_repay: bool = False
