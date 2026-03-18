from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from collector import BinanceRestClient, safe_sleep
from engine import build_signal
from storage import append_log, init_db, save_signal, write_dashboard


def load_config() -> dict[str, Any]:
    with open("config.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _load_batch_index(path: str) -> int:
    p = Path(path)
    if not p.exists():
        return 0
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return int(data.get("index", 0))
    except Exception:
        return 0


def _save_batch_index(path: str, index: int) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"index": index}), encoding="utf-8")


def discover_or_static_symbols(client: BinanceRestClient, cfg: dict[str, Any]) -> list[str]:
    sd = cfg["symbol_discovery"]
    return client.discover_symbols(
        quote_assets=sd["quote_assets"],
        status=sd["status"],
        spot_only=sd["spot_only"],
        max_symbols_total=sd["max_symbols_total"],
    )


def select_batch(symbols: list[str], cfg: dict[str, Any]) -> list[str]:
    sd = cfg["symbol_discovery"]
    batch_size = sd["batch_size"]
    state_file = sd["batch_rotation_file"]
    if not symbols:
        return []
    idx = _load_batch_index(state_file)
    start = idx * batch_size
    if start >= len(symbols):
        idx = 0
        start = 0
    batch = symbols[start : start + batch_size]
    next_idx = idx + 1
    if next_idx * batch_size >= len(symbols):
        next_idx = 0
    _save_batch_index(state_file, next_idx)
    return batch


def scan_symbols(client: BinanceRestClient, symbols: list[str], cfg: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for symbol in symbols:
        try:
            candles_1m = client.klines(symbol, "1m", cfg["lookback_limit"])
            candles_5m = client.klines(symbol, "5m", cfg["lookback_limit"])
            signal = build_signal(symbol, candles_1m, candles_5m, cfg)
            results.append(signal)
            line = (
                f"[{datetime.utcnow().isoformat()}] {signal['symbol']} session={signal['session']} "
                f"price={signal['price']:.6f} rsi_5m={signal['rsi_5m']} state={signal['state']} "
                f"trigger={signal['trigger']} bias={signal['bias']} score={signal['score']}"
            )
            print(line)
            append_log(cfg["log_path"], line)
            save_signal(cfg["database_path"], signal)
        except Exception as exc:
            line = f"[{datetime.utcnow().isoformat()}] ERROR symbol={symbol} err={exc}"
            print(line)
            append_log(cfg["log_path"], line)
    return results


def build_dashboard(all_symbols: list[str], batch: list[str], results: list[dict[str, Any]], cfg: dict[str, Any]) -> dict[str, Any]:
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "stats": {
            "all_symbols_count": len(all_symbols),
            "batch_count": len(batch),
            "loop_interval_seconds": cfg["poll_seconds"],
        },
        "batch_symbols": batch,
        "signals": results,
    }


def list_symbols() -> None:
    cfg = load_config()
    client = BinanceRestClient(cfg["binance_rest_base"])
    symbols = discover_or_static_symbols(client, cfg)
    print(f"Discovered {len(symbols)} symbols")
    for s in symbols:
        print(s)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--symbols", action="store_true")
    args = parser.parse_args()

    if args.symbols:
        list_symbols()
        return

    cfg = load_config()
    init_db(cfg["database_path"])
    client = BinanceRestClient(cfg["binance_rest_base"])

    def tick() -> None:
        all_symbols = discover_or_static_symbols(client, cfg)
        batch = select_batch(all_symbols, cfg)
        results = scan_symbols(client, batch, cfg)
        dashboard = build_dashboard(all_symbols, batch, results, cfg)
        write_dashboard(cfg["dashboard_path"], dashboard)

    if args.once:
        tick()
        return

    while True:
        tick()
        safe_sleep(cfg["poll_seconds"])


if __name__ == "__main__":
    main()
