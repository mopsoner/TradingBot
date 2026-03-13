from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

Direction = Literal["long", "short", "none"]
Pattern = Literal["spring", "utad", "none"]


@dataclass(slots=True)
class Candle:
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


@dataclass(slots=True)
class SignalSetup:
    symbol: str
    timeframe_context: list[str]
    pattern: Pattern
    direction: Direction
    liquidity_zone: dict
    sweep_level: float
    displacement: bool
    bos_level: float
    fib_entry_zone: dict
    entry_zone: list[float]
    stop_loss: float
    targets: list[float]
    setup_valid: bool
    confidence: float = 0.0


@dataclass(slots=True)
class Decision:
    status: Literal["valid_setup", "rejected_setup", "no_trade"]
    reason: str
    setup: SignalSetup | None = None


@dataclass(slots=True)
class Trade:
    symbol: str
    direction: Direction
    entry: float
    stop_loss: float
    target: float
    size: float
    mode: Literal["paper", "live"]
    opened_at: datetime
    metadata: dict = field(default_factory=dict)


@dataclass(slots=True)
class BacktestReport:
    symbol: str
    timeframe: str
    period: str
    setup: str
    entries_tested: list[str]
    results: dict
    best_entry: str
    recommendation: Literal["enable_live", "paper_only", "reject"]
