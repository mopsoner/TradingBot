from __future__ import annotations

from .models import BacktestReport, Candle, SignalSetup


class BacktestingManager:
    """Simple scenario backtester around fib retracement entries."""

    def run(self, symbol: str, timeframe: str, candles: list[Candle], setup: SignalSetup) -> BacktestReport:
        if len(candles) < 80 or not setup.targets:
            return self._reject(symbol, timeframe, "insufficient_data")

        fib_prices = setup.fib_entry_zone.get("prices", [])[:3]
        fib_labels = ["0.5", "0.618", "0.705"]
        outcomes: dict[str, dict[str, float]] = {}

        for idx, fib in enumerate(fib_prices):
            wins = 0
            losses = 0
            unresolved = 0

            for i in range(50, len(candles) - 8):
                c = candles[i]
                entry_hit = (setup.direction == "long" and c.low <= fib) or (
                    setup.direction == "short" and c.high >= fib
                )
                if not entry_hit:
                    continue

                forward = candles[i + 1 : i + 8]
                resolved = False
                for f in forward:
                    if setup.direction == "long":
                        if f.low <= setup.stop_loss:
                            losses += 1
                            resolved = True
                            break
                        if f.high >= setup.targets[0]:
                            wins += 1
                            resolved = True
                            break
                    else:
                        if f.high >= setup.stop_loss:
                            losses += 1
                            resolved = True
                            break
                        if f.low <= setup.targets[0]:
                            wins += 1
                            resolved = True
                            break
                if not resolved:
                    unresolved += 1

            decided = wins + losses
            win_rate = wins / decided if decided else 0.0
            outcomes[fib_labels[idx]] = {
                "wins": wins,
                "losses": losses,
                "unresolved": unresolved,
                "win_rate": round(win_rate, 4),
            }

        best_entry = max(outcomes, key=lambda k: outcomes[k]["win_rate"]) if outcomes else "0.5"
        best_rate = outcomes.get(best_entry, {}).get("win_rate", 0.0)
        recommendation = "enable_live" if best_rate >= 0.55 else "paper_only" if best_rate >= 0.45 else "reject"

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
