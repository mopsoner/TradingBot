from __future__ import annotations

import logging

from .models import Trade

logger = logging.getLogger("openclaw.trade_execution")


def derive_margin_asset(symbol: str, direction: str) -> tuple[str, bool]:
    """Return (asset, is_quote). LONG → borrow quote, SHORT → borrow base."""
    for quote in ("USDT", "BUSD", "USDC"):
        if symbol.endswith(quote):
            base = symbol[: -len(quote)]
            if direction.upper() == "LONG":
                return quote, True
            return base, False
    return symbol, False


def _compute_borrow_amount(trade: "Trade") -> float:
    _asset, is_quote = derive_margin_asset(trade.symbol, trade.direction)
    if is_quote:
        return trade.size * trade.entry
    return trade.size


class TradeExecution:
    def __init__(self) -> None:
        self.executed: list[Trade] = []

    def execute(
        self,
        trade: Trade,
        risk_approved: bool,
        backtest_approved: bool,
        enable_auto_borrow_repay: bool = False,
        execution_service=None,
    ) -> str:
        if not risk_approved:
            raise PermissionError("risk approval required")
        if not backtest_approved:
            raise PermissionError("backtest approval required before live mode")

        is_paper = trade.mode == "paper"

        if enable_auto_borrow_repay and execution_service is not None:
            asset, _is_quote = derive_margin_asset(trade.symbol, trade.direction)
            amount = _compute_borrow_amount(trade)
            try:
                execution_service.execute_borrow(
                    symbol=trade.symbol,
                    asset=asset,
                    amount=amount,
                    is_paper=is_paper,
                )
            except Exception as exc:
                logger.error("Auto-borrow failed for %s — trade cancelled: %s", trade.symbol, exc)
                raise RuntimeError(f"Auto-borrow failed, trade cancelled: {exc}") from exc

        self.executed.append(trade)
        return f"live-{len(self.executed)}"

    def close_trade(
        self,
        trade: Trade,
        enable_auto_borrow_repay: bool = False,
        execution_service=None,
    ) -> None:
        is_paper = trade.mode == "paper"

        if enable_auto_borrow_repay and execution_service is not None:
            asset, _is_quote = derive_margin_asset(trade.symbol, trade.direction)
            amount = _compute_borrow_amount(trade)
            try:
                execution_service.execute_repay(
                    symbol=trade.symbol,
                    asset=asset,
                    amount=amount,
                    is_paper=is_paper,
                )
            except Exception as exc:
                logger.error("Auto-repay failed for %s: %s", trade.symbol, exc)
