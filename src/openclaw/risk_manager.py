from __future__ import annotations

from dataclasses import dataclass

from .models import SignalSetup


@dataclass(slots=True)
class RiskDecision:
    approved: bool
    reason: str
    position_size: float = 0.0


class RiskManager:
    def __init__(self, account_balance: float = 10_000.0, risk_pct: float = 0.01, min_rr: float = 1.5) -> None:
        self.account_balance = account_balance
        self.risk_pct = risk_pct
        self.min_rr = min_rr

    def evaluate(self, setup: SignalSetup, backtest_approved: bool, explicit_approval: bool) -> RiskDecision:
        if not setup.setup_valid:
            return RiskDecision(False, "setup_invalid")
        if not backtest_approved:
            return RiskDecision(False, "backtest_not_approved")
        if not explicit_approval:
            return RiskDecision(False, "risk_approval_required")

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
