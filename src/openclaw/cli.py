from __future__ import annotations

import argparse
import json

from .bot import BotConfig, OpenClawBot


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenClaw bot runner")
    parser.add_argument("--mode", choices=["research", "paper", "live"], default="paper")
    parser.add_argument("--risk-approval", action="store_true")
    parser.add_argument("--backtest-approval", action="store_true")
    args = parser.parse_args()

    config = BotConfig(mode=args.mode)
    bot = OpenClawBot(config)
    decisions = bot.run_once(risk_approval=args.risk_approval, backtest_approval=args.backtest_approval)
    printable = {k: {"status": v.status, "reason": v.reason} for k, v in decisions.items()}
    print(json.dumps(printable, indent=2))


if __name__ == "__main__":
    main()
