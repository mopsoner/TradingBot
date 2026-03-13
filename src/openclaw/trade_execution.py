from __future__ import annotations

from .models import Trade


class TradeExecution:
    def __init__(self) -> None:
        self.executed: list[Trade] = []

    def execute(self, trade: Trade, risk_approved: bool, backtest_approved: bool) -> str:
        if not risk_approved:
            raise PermissionError("risk approval required")
        if not backtest_approved:
            raise PermissionError("backtest approval required before live mode")
        self.executed.append(trade)
        return f"live-{len(self.executed)}"
