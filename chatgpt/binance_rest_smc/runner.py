from __future__ import annotations

import argparse
import json
from datetime import datetime
from collector import BinanceRestClient, safe_sleep
from engine import build_signal
from storage import append_log, init_db, save_signal


def load_config() -> dict:
    with open("config.json", "r", encoding="utf-8") as f:
        return json.load(f)


def run_once(cfg: dict) -> None:
    client = BinanceRestClient(cfg["binance_rest_base"])
    for symbol in cfg["symbols"]:
        candles_1m = client.klines(symbol, "1m", cfg["lookback_limit"])
        candles_5m = client.klines(symbol, "5m", cfg["lookback_limit"])
        signal = build_signal(symbol, candles_1m, candles_5m, cfg)
        line = (
            f"[{datetime.utcnow().isoformat()}] {signal['symbol']} session={signal['session']} "
            f"price={signal['price']:.2f} rsi_5m={signal['rsi_5m']} state={signal['state']} "
            f"trigger={signal['trigger']} bias={signal['bias']} score={signal['score']}"
        )
        print(line)
        append_log(cfg["log_path"], line)
        save_signal(cfg["database_path"], signal)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    cfg = load_config()
    init_db(cfg["database_path"])
    if args.once:
        run_once(cfg)
        return
    while True:
        run_once(cfg)
        safe_sleep(cfg["poll_seconds"])


if __name__ == "__main__":
    main()
