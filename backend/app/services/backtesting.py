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

        wins   = [x for x in outcomes_r if x > 0]
        losses = [x for x in outcomes_r if x <= 0]

        gross_profit = sum(wins)
        gross_loss   = abs(sum(losses)) or 1e-9
        win_rate     = len(wins) / len(outcomes_r)
        expectancy   = sum(outcomes_r) / len(outcomes_r)

        equity   = 0.0
        peak     = 0.0
        max_dd_r = 0.0
        for r in outcomes_r:
            equity += r
            if equity > peak:
                peak = equity
            dd = peak - equity
            if dd > max_dd_r:
                max_dd_r = dd

        drawdown_pct = max_dd_r / max(peak, gross_profit, 1e-9)
        drawdown_pct = min(drawdown_pct, 1.0)

        avg_win  = (gross_profit / len(wins))   if wins   else 0.0
        avg_loss = (gross_loss  / len(losses))  if losses else 1e-9
        r_multiple = avg_win / avg_loss

        return BacktestMetrics(win_rate, gross_profit / gross_loss, expectancy, drawdown_pct, r_multiple)
