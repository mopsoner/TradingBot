from __future__ import annotations

from dataclasses import dataclass

from .models import Trade


@dataclass(slots=True)
class PaperFill:
    order_id: str
    symbol: str
    fill_price: float
    fee_paid: float
    slippage_pct: float


class PaperTradeManager:
    """Simple paper executor with slippage/fees and one open position per symbol."""

    def __init__(self, fee_pct: float = 0.0004, slippage_pct: float = 0.0003) -> None:
        self.fee_pct = fee_pct
        self.slippage_pct = slippage_pct
        self.trades: list[Trade] = []
        self.fills: list[PaperFill] = []
        self.open_positions: dict[str, Trade] = {}

    def place(self, trade: Trade) -> str:
        if trade.symbol in self.open_positions:
            raise ValueError(f"position_already_open:{trade.symbol}")

        order_id = f"paper-{len(self.trades) + 1}"
        signed_slippage = self.slippage_pct if trade.direction == "long" else -self.slippage_pct
        fill_price = trade.entry * (1 + signed_slippage)
        fee_paid = abs(fill_price * trade.size) * self.fee_pct

        trade.metadata.update(
            {
                "paper_fill_price": round(fill_price, 6),
                "paper_fee_paid": round(fee_paid, 6),
                "paper_slippage_pct": self.slippage_pct,
            }
        )

        self.trades.append(trade)
        self.open_positions[trade.symbol] = trade
        self.fills.append(
            PaperFill(
                order_id=order_id,
                symbol=trade.symbol,
                fill_price=round(fill_price, 6),
                fee_paid=round(fee_paid, 6),
                slippage_pct=self.slippage_pct,
            )
        )
        return order_id

    def close(self, symbol: str) -> None:
        self.open_positions.pop(symbol, None)
