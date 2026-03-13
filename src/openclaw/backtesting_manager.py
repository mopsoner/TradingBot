from __future__ import annotations

from .models import BacktestReport, Candle, SignalSetup


class BacktestingManager:
    def run(self, symbol: str, timeframe: str, candles: list[Candle], setup: SignalSetup) -> BacktestReport:
        if len(candles) < 180:
            return self._reject(symbol, timeframe, "insufficient_data")

        train, valid, test = self._split_walk_forward(candles)
        outcomes: dict[str, dict[str, float]] = {}
        stage_metrics = {}
        all_r_values: list[float] = []

        for stage_name, stage in {"train": train, "validation": valid, "test": test}.items():
            stage_result = self._evaluate_slice(stage, setup)
            stage_metrics[stage_name] = stage_result
            all_r_values.extend(stage_result["r_values"])

        fib_prices = setup.fib_entry_zone.get("prices", [])[:3]
        fib_labels = ["0.5", "0.618", "0.705"]
        for idx, label in enumerate(fib_labels[: len(fib_prices)]):
            outcomes[label] = {
                "wins": stage_metrics["test"]["wins_by_fib"][idx],
                "losses": stage_metrics["test"]["losses_by_fib"][idx],
                "win_rate": stage_metrics["test"]["win_rate_by_fib"][idx],
            }

        best_entry = max(outcomes, key=lambda k: outcomes[k]["win_rate"]) if outcomes else "0.5"
        trade_count = stage_metrics["test"]["trade_count"]
        gross_win = stage_metrics["test"]["gross_win"]
        gross_loss = stage_metrics["test"]["gross_loss"]
        avg_r = sum(all_r_values) / len(all_r_values) if all_r_values else 0.0
        profit_factor = gross_win / gross_loss if gross_loss > 0 else (999.0 if gross_win > 0 else 0.0)
        expectancy = avg_r
        max_drawdown = self._estimate_max_drawdown(all_r_values)

        outcomes["metrics"] = {
            "trade_count": trade_count,
            "profit_factor": round(profit_factor, 4),
            "expectancy_r": round(expectancy, 4),
            "max_drawdown_pct": round(max_drawdown, 4),
            "avg_r": round(avg_r, 4),
            "walk_forward": {
                "train_trades": stage_metrics["train"]["trade_count"],
                "validation_trades": stage_metrics["validation"]["trade_count"],
                "test_trades": stage_metrics["test"]["trade_count"],
            },
        }

        recommendation = "reject"
        if trade_count >= 50 and profit_factor > 1.30 and expectancy > 0 and max_drawdown < 12.0:
            recommendation = "enable_live"
        elif outcomes.get(best_entry, {}).get("win_rate", 0.0) >= 0.45:
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

    def _split_walk_forward(self, candles: list[Candle]) -> tuple[list[Candle], list[Candle], list[Candle]]:
        n = len(candles)
        train_end = int(n * 0.6)
        valid_end = int(n * 0.8)
        return candles[:train_end], candles[train_end:valid_end], candles[valid_end:]

    def _evaluate_slice(self, candles: list[Candle], setup: SignalSetup) -> dict:
        fib_prices = setup.fib_entry_zone.get("prices", [])[:3]
        wins_by_fib = [0, 0, 0]
        losses_by_fib = [0, 0, 0]
        trade_count = 0
        gross_win = 0.0
        gross_loss = 0.0
        r_values: list[float] = []

        for idx, fib in enumerate(fib_prices):
            for i in range(1, len(candles) - 1):
                c = candles[i]
                nxt = candles[i + 1]
                if setup.direction == "long" and c.low <= fib:
                    trade_count += 1
                    risk = abs(fib - setup.stop_loss)
                    if nxt.high >= setup.targets[0]:
                        wins_by_fib[idx] += 1
                        gain = abs(setup.targets[0] - fib)
                        gross_win += gain
                        r_values.append(gain / risk if risk else 0.0)
                    elif nxt.low <= setup.stop_loss:
                        losses_by_fib[idx] += 1
                        gross_loss += abs(fib - setup.stop_loss)
                        r_values.append(-1.0)
                elif setup.direction == "short" and c.high >= fib:
                    trade_count += 1
                    risk = abs(setup.stop_loss - fib)
                    if nxt.low <= setup.targets[0]:
                        wins_by_fib[idx] += 1
                        gain = abs(fib - setup.targets[0])
                        gross_win += gain
                        r_values.append(gain / risk if risk else 0.0)
                    elif nxt.high >= setup.stop_loss:
                        losses_by_fib[idx] += 1
                        gross_loss += abs(setup.stop_loss - fib)
                        r_values.append(-1.0)

        win_rate_by_fib = []
        for i in range(len(fib_prices)):
            total = wins_by_fib[i] + losses_by_fib[i]
            win_rate_by_fib.append(round((wins_by_fib[i] / total) if total else 0.0, 4))

        return {
            "trade_count": trade_count,
            "wins_by_fib": wins_by_fib,
            "losses_by_fib": losses_by_fib,
            "win_rate_by_fib": win_rate_by_fib,
            "gross_win": gross_win,
            "gross_loss": gross_loss,
            "r_values": r_values,
        }

    def _estimate_max_drawdown(self, r_values: list[float]) -> float:
        equity = 0.0
        peak = 0.0
        max_dd = 0.0
        for r in r_values:
            equity += r
            peak = max(peak, equity)
            max_dd = max(max_dd, peak - equity)
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
