from __future__ import annotations

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

Mode = Literal["research", "paper", "live"]


@dataclass(slots=True)
class BotConfig:
    symbols: tuple[str, ...] = ("ETHUSDT", "BTCUSDT")
    context_tf: tuple[str, ...] = ("4H", "1H")
    entry_tf: str = "1H"
    mode: Mode = "paper"


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

    def run_once(self, risk_approval: bool = False, backtest_approval: bool = False) -> dict[str, Decision]:
        decisions: dict[str, Decision] = {}
        now = datetime.now(timezone.utc)

        for symbol in self.config.symbols:
            if not self.session_filter.is_allowed(now):
                decision = Decision(status="no_trade", reason="session_filtered")
                self.journal.log_decision(symbol, decision)
                decisions[symbol] = decision
                continue

            context = self.market_data.fetch_ohlcv(symbol, self.config.context_tf[-1], 240)
            entry = self.market_data.fetch_ohlcv(symbol, self.config.entry_tf, 240)
            setup = self.signals.detect(symbol, context, entry, list(self.config.context_tf))
            if not setup.setup_valid:
                decision = Decision(status="rejected_setup", reason="signal_validation_failed", setup=setup)
                self.journal.log_decision(symbol, decision)
                decisions[symbol] = decision
                continue

            backtest = self.backtesting.run(symbol, self.config.entry_tf, entry, setup)
            backtest_ok_for_live = backtest_approval and backtest.recommendation == "enable_live"
            backtest_ok_for_paper = backtest.recommendation in {"enable_live", "paper_only"}

            if self.config.mode == "live" and not backtest_ok_for_live:
                decision = Decision(status="rejected_setup", reason="backtest_not_approved", setup=setup)
                self.journal.log_decision(symbol, decision)
                decisions[symbol] = decision
                continue
            if self.config.mode == "paper" and not backtest_ok_for_paper:
                decision = Decision(status="rejected_setup", reason="backtest_rejected", setup=setup)
                self.journal.log_decision(symbol, decision)
                decisions[symbol] = decision
                continue

            requires_execution_approval = self.config.mode in {"paper", "live"}
            risk_decision = self.risk.evaluate(
                setup,
                backtest_approved=self.config.mode != "live" or backtest_ok_for_live,
                explicit_approval=(risk_approval if requires_execution_approval else True),
            )
            if not risk_decision.approved:
                decision = Decision(status="rejected_setup", reason=risk_decision.reason, setup=setup)
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

            if self.config.mode == "research":
                decision = Decision(status="valid_setup", reason="research_only", setup=setup)
            elif self.config.mode == "paper":
                order_id = self.paper.place(trade)
                decision = Decision(status="valid_setup", reason=f"paper_order:{order_id}", setup=setup)
            else:
                order_id = self.execution.execute(trade, risk_approved=True, backtest_approved=backtest_ok_for_live)
                decision = Decision(status="valid_setup", reason=f"live_order:{order_id}", setup=setup)

            self.journal.log_decision(symbol, decision)
            decisions[symbol] = decision

        return decisions
