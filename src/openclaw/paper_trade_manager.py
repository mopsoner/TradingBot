from __future__ import annotations

from .models import Trade


class PaperTradeManager:
    def __init__(self) -> None:
        self.trades: list[Trade] = []

    def place(self, trade: Trade) -> str:
        self.trades.append(trade)
        return f"paper-{len(self.trades)}"
