from __future__ import annotations

import argparse
import json

from .bot import BotConfig, OpenClawBot


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenClaw bot runner")
    parser.add_argument("--mode", choices=["research", "paper", "live"], default="paper")
    parser.add_argument("--risk-approval", action="store_true")
    parser.add_argument("--backtest-approval", action="store_true")
    parser.add_argument("--symbols", default="ETHUSDT,BTCUSDT", help="Comma-separated symbols")
    parser.add_argument("--entry-tf", default="1H")
    parser.add_argument("--context-tf", default="4H,1H", help="Comma-separated context timeframes")
    parser.add_argument("--daily-realized-pnl", type=float, default=0.0)
    parser.add_argument("--weekly-realized-pnl", type=float, default=0.0)
    args = parser.parse_args()

    config = BotConfig(
        mode=args.mode,
        symbols=tuple(s.strip().upper() for s in args.symbols.split(",") if s.strip()),
        entry_tf=args.entry_tf,
        context_tf=tuple(tf.strip() for tf in args.context_tf.split(",") if tf.strip()),
    )

    bot = OpenClawBot(config)
    decisions = bot.run_once(
        risk_approval=args.risk_approval,
        backtest_approval=args.backtest_approval,
        daily_realized_pnl=args.daily_realized_pnl,
        weekly_realized_pnl=args.weekly_realized_pnl,
    )
    printable = {k: {"status": v.status, "reason": v.reason, "metadata": v.metadata} for k, v in decisions.items()}
    print(json.dumps(printable, indent=2))


if __name__ == "__main__":
    main()
