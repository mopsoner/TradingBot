from dataclasses import dataclass


@dataclass
class BacktestMetrics:
    win_rate: float
    profit_factor: float
    expectancy: float
    drawdown: float
    r_multiple: float


class BacktestingEngine:
    def run(self, outcomes_r: list[float]) -> BacktestMetrics:
        if not outcomes_r:
            return BacktestMetrics(0, 0, 0, 0, 0)
        wins = [x for x in outcomes_r if x > 0]
        losses = [x for x in outcomes_r if x <= 0]
        gross_profit = sum(wins)
        gross_loss = abs(sum(losses)) or 1e-9
        win_rate = len(wins) / len(outcomes_r)
        expectancy = sum(outcomes_r) / len(outcomes_r)
        peak = 0.0
        equity = 0.0
        max_dd = 0.0
        for r in outcomes_r:
            equity += r
            peak = max(peak, equity)
            max_dd = max(max_dd, peak - equity)
        return BacktestMetrics(win_rate, gross_profit / gross_loss, expectancy, max_dd, expectancy)
