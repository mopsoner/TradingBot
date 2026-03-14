from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Signal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    symbol: str
    timeframe: str
    setup_type: str
    liquidity_zone: str
    sweep_level: float
    bos_level: float
    fib_zone: str
    accepted: bool = False


class Trade(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
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


class BacktestResult(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
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
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    level: str
    message: str


class Configuration(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str
    payload: str
