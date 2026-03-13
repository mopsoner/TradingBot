from __future__ import annotations

from dataclasses import dataclass

from .models import SignalSetup


@dataclass(slots=True)
class RiskDecision:
    approved: bool
    reason: str
    position_size: float = 0.0


class RiskManager:
    def __init__(
        self,
        account_balance: float = 10_000.0,
        risk_pct: float = 0.01,
        min_rr: float = 1.5,
        max_open_positions_per_symbol: int = 1,
        daily_loss_limit_pct: float = 0.02,
        weekly_loss_limit_pct: float = 0.05,
    ) -> None:
        self.account_balance = account_balance
        self.risk_pct = risk_pct
        self.min_rr = min_rr
        self.max_open_positions_per_symbol = max_open_positions_per_symbol
        self.daily_loss_limit_pct = daily_loss_limit_pct
        self.weekly_loss_limit_pct = weekly_loss_limit_pct

    def evaluate(
        self,
        setup: SignalSetup,
        backtest_approved: bool,
        explicit_approval: bool,
        open_positions_for_symbol: int = 0,
        daily_realized_pnl: float = 0.0,
        weekly_realized_pnl: float = 0.0,
    ) -> RiskDecision:
        if not setup.setup_valid:
            return RiskDecision(False, "setup_invalid")
        if not backtest_approved:
            return RiskDecision(False, "backtest_not_approved")
        if not explicit_approval:
            return RiskDecision(False, "risk_approval_required")

        if open_positions_for_symbol >= self.max_open_positions_per_symbol:
            return RiskDecision(False, "max_open_positions_per_symbol_reached")

        daily_loss_limit = -self.account_balance * self.daily_loss_limit_pct
        if daily_realized_pnl <= daily_loss_limit:
            return RiskDecision(False, "daily_loss_limit_reached")

        weekly_loss_limit = -self.account_balance * self.weekly_loss_limit_pct
        if weekly_realized_pnl <= weekly_loss_limit:
            return RiskDecision(False, "weekly_loss_limit_reached")

        entry = sum(setup.entry_zone) / 2
        if not setup.targets:
            return RiskDecision(False, "missing_targets")
        risk_per_unit = abs(entry - setup.stop_loss)
        reward_per_unit = abs(setup.targets[0] - entry)
        if risk_per_unit <= 0:
            return RiskDecision(False, "invalid_stop")

        rr = reward_per_unit / risk_per_unit
        if rr < self.min_rr:
            return RiskDecision(False, f"rr_below_threshold:{rr:.2f}")

        risk_capital = self.account_balance * self.risk_pct
        size = risk_capital / risk_per_unit
        return RiskDecision(True, "approved", position_size=round(size, 6))
