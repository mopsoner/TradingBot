from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3

from .models import Candle, Trade


@dataclass(slots=True)
class PaperFill:
    order_id: str
    symbol: str
    fill_price: float
    fee_paid: float
    slippage_pct: float


class PaperTradeManager:
    """Paper executor with slippage/fees, position limits, persistence and candle-driven exits."""

    def __init__(self, fee_pct: float = 0.0004, slippage_pct: float = 0.0003, db_path: str = "data/paper_state.db") -> None:
        self.fee_pct = fee_pct
        self.slippage_pct = slippage_pct
        self.trades: list[Trade] = []
        self.fills: list[PaperFill] = []
        self.open_positions: dict[str, Trade] = {}
        self.realized_pnl: float = 0.0
        self.db_path = db_path
        self._init_db()

    def place(self, trade: Trade) -> str:
        if trade.symbol in self.open_positions:
            raise ValueError(f"position_already_open:{trade.symbol}")

        order_id = f"paper-{len(self.trades) + 1}"
        signed_slippage = self.slippage_pct if trade.direction == "long" else -self.slippage_pct
        fill_price = trade.entry * (1 + signed_slippage)
        fee_paid = abs(fill_price * trade.size) * self.fee_pct

        trade.metadata.update({"paper_fill_price": round(fill_price, 6), "paper_fee_paid": round(fee_paid, 6), "paper_slippage_pct": self.slippage_pct})

        self.trades.append(trade)
        self.open_positions[trade.symbol] = trade
        fill = PaperFill(order_id=order_id, symbol=trade.symbol, fill_price=round(fill_price, 6), fee_paid=round(fee_paid, 6), slippage_pct=self.slippage_pct)
        self.fills.append(fill)
        self._persist_fill(fill, trade)
        return order_id

    def update_with_candle(self, symbol: str, candle: Candle) -> str | None:
        trade = self.open_positions.get(symbol)
        if not trade:
            return None

        exit_price: float | None = None
        reason = ""
        if trade.direction == "long":
            if candle.low <= trade.stop_loss:
                exit_price, reason = trade.stop_loss, "stop_loss"
            elif candle.high >= trade.target:
                exit_price, reason = trade.target, "target"
        else:
            if candle.high >= trade.stop_loss:
                exit_price, reason = trade.stop_loss, "stop_loss"
            elif candle.low <= trade.target:
                exit_price, reason = trade.target, "target"

        if exit_price is None:
            return None

        pnl = ((exit_price - trade.entry) if trade.direction == "long" else (trade.entry - exit_price)) * trade.size
        self.realized_pnl += pnl
        trade.metadata.update({"exit_price": exit_price, "exit_reason": reason, "closed_at": datetime.now(timezone.utc).isoformat(), "realized_pnl": round(pnl, 6)})
        self._persist_close(trade, reason, pnl)
        self.close(symbol)
        return reason

    def close(self, symbol: str) -> None:
        self.open_positions.pop(symbol, None)

    def _init_db(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_fills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                order_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                fill_price REAL NOT NULL,
                fee_paid REAL NOT NULL,
                trade_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_closes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                symbol TEXT NOT NULL,
                reason TEXT NOT NULL,
                pnl REAL NOT NULL,
                trade_json TEXT NOT NULL
            )
            """
        )
        conn.commit()
        conn.close()

    def _persist_fill(self, fill: PaperFill, trade: Trade) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "INSERT INTO paper_fills(ts, order_id, symbol, fill_price, fee_paid, trade_json) VALUES (?, ?, ?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), fill.order_id, fill.symbol, fill.fill_price, fill.fee_paid, json.dumps(asdict(trade), default=str)),
        )
        conn.commit()
        conn.close()

    def _persist_close(self, trade: Trade, reason: str, pnl: float) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "INSERT INTO paper_closes(ts, symbol, reason, pnl, trade_json) VALUES (?, ?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), trade.symbol, reason, pnl, json.dumps(asdict(trade), default=str)),
        )
        conn.commit()
        conn.close()
