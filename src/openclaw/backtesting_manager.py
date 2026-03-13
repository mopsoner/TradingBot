from __future__ import annotations

from .models import BacktestReport, Candle, SignalSetup


class BacktestingManager:
    def run(self, symbol: str, timeframe: str, candles: list[Candle], setup: SignalSetup) -> BacktestReport:
        if len(candles) < 60:
            return self._reject(symbol, timeframe, "insufficient_data")

        fib_labels = ["0.5", "0.618", "0.705"]
        outcomes: dict[str, dict[str, float]] = {}

        for idx, fib in enumerate(setup.fib_entry_zone.get("prices", [])[:3]):
            wins = 0
            losses = 0
            for i in range(50, len(candles) - 1):
                c = candles[i]
                if setup.direction == "long" and c.low <= fib:
                    if candles[i + 1].high >= setup.targets[0]:
                        wins += 1
                    elif candles[i + 1].low <= setup.stop_loss:
                        losses += 1
                elif setup.direction == "short" and c.high >= fib:
                    if candles[i + 1].low <= setup.targets[0]:
                        wins += 1
                    elif candles[i + 1].high >= setup.stop_loss:
                        losses += 1
            total = wins + losses
            win_rate = wins / total if total else 0.0
            outcomes[fib_labels[idx]] = {"wins": wins, "losses": losses, "win_rate": round(win_rate, 4)}

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
