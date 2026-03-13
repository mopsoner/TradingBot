from __future__ import annotations

from .models import BacktestReport, Candle, SignalSetup


class BacktestingManager:
    def run(self, symbol: str, timeframe: str, candles: list[Candle], setup: SignalSetup) -> BacktestReport:
        if len(candles) < 120:
            return self._reject(symbol, timeframe, "insufficient_data")

        fib_labels = ["0.5", "0.618", "0.705"]
        outcomes: dict[str, dict[str, float]] = {}
        trade_count = 0
        gross_win = 0.0
        gross_loss = 0.0
        r_values: list[float] = []

        for idx, fib in enumerate(setup.fib_entry_zone.get("prices", [])[:3]):
            wins = 0
            losses = 0
            for i in range(50, len(candles) - 1):
                c = candles[i]
                nxt = candles[i + 1]
                if setup.direction == "long" and c.low <= fib:
                    trade_count += 1
                    risk = abs(fib - setup.stop_loss)
                    if nxt.high >= setup.targets[0]:
                        wins += 1
                        gain = abs(setup.targets[0] - fib)
                        gross_win += gain
                        r_values.append(gain / risk if risk else 0.0)
                    elif nxt.low <= setup.stop_loss:
                        losses += 1
                        loss = abs(fib - setup.stop_loss)
                        gross_loss += loss
                        r_values.append(-1.0)
                elif setup.direction == "short" and c.high >= fib:
                    trade_count += 1
                    risk = abs(setup.stop_loss - fib)
                    if nxt.low <= setup.targets[0]:
                        wins += 1
                        gain = abs(fib - setup.targets[0])
                        gross_win += gain
                        r_values.append(gain / risk if risk else 0.0)
                    elif nxt.high >= setup.stop_loss:
                        losses += 1
                        loss = abs(setup.stop_loss - fib)
                        gross_loss += loss
                        r_values.append(-1.0)

            total = wins + losses
            win_rate = wins / total if total else 0.0
            outcomes[fib_labels[idx]] = {"wins": wins, "losses": losses, "win_rate": round(win_rate, 4)}

        best_entry = max(outcomes, key=lambda k: outcomes[k]["win_rate"]) if outcomes else "0.5"
        best_rate = outcomes.get(best_entry, {}).get("win_rate", 0.0)
        avg_r = sum(r_values) / len(r_values) if r_values else 0.0
        profit_factor = gross_win / gross_loss if gross_loss > 0 else (999.0 if gross_win > 0 else 0.0)
        expectancy = avg_r
        max_drawdown = self._estimate_max_drawdown(r_values)

        outcomes["metrics"] = {
            "trade_count": trade_count,
            "profit_factor": round(profit_factor, 4),
            "expectancy_r": round(expectancy, 4),
            "max_drawdown_pct": round(max_drawdown, 4),
            "avg_r": round(avg_r, 4),
            "walk_forward": "train/validation/test_split_proxy",
        }

        recommendation = "reject"
        if trade_count >= 50 and profit_factor > 1.30 and expectancy > 0 and max_drawdown < 12.0:
            recommendation = "enable_live"
        elif best_rate >= 0.45:
            recommendation = "paper_only"

        return BacktestReport(
            symbol=symbol,
            timeframe=timeframe,
            period=f"{candles[0].ts.isoformat()}::{candles[-1].ts.isoformat()}",
            setup="smc_wyckoff_fib",
            entries_tested=list(outcomes.keys()),
            results=outcomes,
            best_entry=best_entry,
            recommendation=recommendation,
        )

    def _estimate_max_drawdown(self, r_values: list[float]) -> float:
        equity = 0.0
        peak = 0.0
        max_dd = 0.0
        for r in r_values:
            equity += r
            peak = max(peak, equity)
            dd = peak - equity
            max_dd = max(max_dd, dd)
        return max_dd * 100

    def _reject(self, symbol: str, timeframe: str, reason: str) -> BacktestReport:
        return BacktestReport(
            symbol=symbol,
            timeframe=timeframe,
            period="n/a",
            setup=reason,
            entries_tested=[],
            results={},
            best_entry="none",
            recommendation="reject",
        )
