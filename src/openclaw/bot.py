from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from .backtesting_manager import BacktestingManager
from .market_data import MarketDataService
from .models import Decision, Trade
from .paper_trade_manager import PaperTradeManager
from .risk_manager import RiskManager
from .session_filter import SessionFilter
from .smc_wyckoff_signals import SmcWyckoffSignalEngine
from .trade_execution import TradeExecution
from .trade_journal import TradeJournal

logger = logging.getLogger("openclaw.bot")

Mode = Literal["research", "paper", "live"]


@dataclass(slots=True)
class BotConfig:
    symbols: tuple[str, ...] = ("ETHUSDT", "BTCUSDT")
    context_tf: tuple[str, ...] = ("4H", "1H")
    entry_tf: str = "1H"
    mode: Mode = "paper"
    enable_auto_borrow_repay: bool = False


class OpenClawBot:
    def __init__(self, config: BotConfig) -> None:
        self.config = config
        self.market_data = MarketDataService()
        self.signals = SmcWyckoffSignalEngine()
        self.session_filter = SessionFilter()
        self.risk = RiskManager()
        self.backtesting = BacktestingManager()
        self.paper = PaperTradeManager()
        self.execution = TradeExecution()
        self.journal = TradeJournal()
        self._execution_service = None
        if config.enable_auto_borrow_repay:
            try:
                from backend.app.services.execution import ExecutionService
                self._execution_service = ExecutionService(paper_mode=(config.mode != "live"))
            except ImportError:
                logger.warning("ExecutionService unavailable — auto borrow/repay disabled")

    def run_once(self, risk_approval: bool = False, backtest_approval: bool = False) -> dict[str, Decision]:
        decisions: dict[str, Decision] = {}
        now = datetime.now(timezone.utc)
        for symbol in self.config.symbols:
            if not self.session_filter.is_allowed(now):
                decision = Decision(status="no_trade", reason="session_filtered")
                self.journal.log_decision(symbol, decision)
                decisions[symbol] = decision
                continue

            try:
                context = self.market_data.fetch_ohlcv(symbol, self.config.context_tf[-1], 220, allow_synthetic_fallback=allow_fallback)
                entry = self.market_data.fetch_ohlcv(symbol, self.config.entry_tf, 220, allow_synthetic_fallback=allow_fallback)
            except Exception:
                decision = Decision(status="no_trade", reason="market_data_unavailable")
                self.journal.log_decision(symbol, decision)
                decisions[symbol] = decision
                continue

            setup = self.signals.detect(symbol, context, entry, list(self.config.context_tf))
            if not setup.setup_valid:
                decision = Decision(status="rejected_setup", reason="signal_validation_failed", setup=setup)
                self.journal.log_decision(symbol, decision)
                decisions[symbol] = decision
                continue

            backtest = self.backtesting.run(symbol, self.config.entry_tf, entry, setup)
            backtest_ok = backtest_approval and backtest.recommendation in {"enable_live", "paper_only"}

            risk_decision = self.risk.evaluate(setup, backtest_approved=backtest_ok, explicit_approval=risk_approval)
            if not risk_decision.approved:
                decision = Decision(
                    status="rejected_setup",
                    reason=risk_decision.reason,
                    setup=setup,
                    metadata={"backtest_recommendation": backtest.recommendation},
                )
                self.journal.log_decision(symbol, decision)
                decisions[symbol] = decision
                continue

            trade = Trade(
                symbol=symbol,
                direction=setup.direction,
                entry=sum(setup.entry_zone) / 2,
                stop_loss=setup.stop_loss,
                target=setup.targets[0],
                size=risk_decision.position_size,
                mode="paper" if self.config.mode != "live" else "live",
                opened_at=now,
                metadata={"confidence": setup.confidence, "backtest": backtest.recommendation},
            )

            auto_br = self.config.enable_auto_borrow_repay
            exec_svc = self._execution_service if auto_br else None

            if self.config.mode == "paper":
                order_id = self.paper.place(trade)
                decision = Decision(
                    status="valid_setup",
                    reason=f"paper_order:{order_id}",
                    setup=setup,
                    metadata={"backtest_recommendation": backtest.recommendation},
                )
            else:
                if not backtest_approval:
                    decision = Decision(
                        status="rejected_setup",
                        reason="live_requires_backtest_approval",
                        setup=setup,
                    )
                    self.journal.log_decision(symbol, decision)
                    decisions[symbol] = decision
                    continue
                try:
                    order_id = self.execution.execute(
                        trade,
                        risk_approved=True,
                        backtest_approved=backtest_ok,
                        enable_auto_borrow_repay=auto_br,
                        execution_service=exec_svc,
                    )
                except RuntimeError as exc:
                    decision = Decision(
                        status="rejected_setup",
                        reason=f"borrow_failed: {exc}",
                        setup=setup,
                    )
                    self.journal.log_decision(symbol, decision)
                    decisions[symbol] = decision
                    continue
                decision = Decision(
                    status="valid_setup",
                    reason=f"live_order:{order_id}",
                    setup=setup,
                    metadata={"backtest_recommendation": backtest.recommendation},
                )

            self.journal.log_decision(symbol, decision)
            decisions[symbol] = decision

        return decisions
