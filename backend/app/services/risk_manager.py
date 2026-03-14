from dataclasses import dataclass


@dataclass
class RiskState:
    open_positions: int
    daily_loss: float
    weekly_loss: float


class RiskManager:
    def __init__(self, risk_per_trade: float, max_open_positions: int, daily_loss_limit: float, weekly_loss_limit: float):
        self.risk_per_trade = risk_per_trade
        self.max_open_positions = max_open_positions
        self.daily_loss_limit = daily_loss_limit
        self.weekly_loss_limit = weekly_loss_limit

    def approve(self, state: RiskState) -> tuple[bool, str]:
        if state.open_positions >= self.max_open_positions:
            return False, "max_open_positions_reached"
        if state.daily_loss <= -self.daily_loss_limit:
            return False, "daily_loss_limit_hit"
        if state.weekly_loss <= -self.weekly_loss_limit:
            return False, "weekly_loss_limit_hit"
        return True, "approved"
