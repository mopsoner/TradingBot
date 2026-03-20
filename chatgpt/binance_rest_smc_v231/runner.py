from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collector import BinanceRestClient, safe_sleep
from console_colors import error, headline, info, muted, signal_line, success, warning
from pipeline import build_batch_signal
from storage import append_log, init_db, init_ohlc_cache, load_cached_ohlc, save_signal, upsert_ohlc, write_dashboard


RUNTIME_DEFAULT = {"paused": False}


def load_config() -> dict[str, Any]:
    with open("config.json", "r", encoding="utf-8") as f:
        return json.load(f)


def runtime_control_path(cfg: dict[str, Any]) -> str:
    return cfg.get("runtime_control_path", "data/runtime_control.json")


def load_runtime_state(cfg: dict[str, Any]) -> dict[str, Any]:
    p = Path(runtime_control_path(cfg))
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(RUNTIME_DEFAULT), encoding="utf-8")
        return dict(RUNTIME_DEFAULT)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return dict(RUNTIME_DEFAULT)
        return {**RUNTIME_DEFAULT, **data}
    except Exception:
        return dict(RUNTIME_DEFAULT)


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


def discover_symbols(client: BinanceRestClient, cfg: dict[str, Any]) -> list[str]:
    sd = cfg["symbol_discovery"]
    return client.discover_symbols(
        quote_assets=sd["quote_assets"],
        status=sd["status"],
        spot_only=sd["spot_only"],
        max_symbols_total=sd["max_symbols_total"],
        margin_only=sd.get("margin_only", False),
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


def get_candles(client: BinanceRestClient, cache_db: str, symbol: str, interval: str, limit: int) -> list[dict[str, Any]]:
    cached = load_cached_ohlc(cache_db, symbol, interval, limit)
    if len(cached) >= limit:
        return cached
    fetched = client.klines(symbol, interval, limit)
    upsert_ohlc(cache_db, symbol, interval, fetched)
    return fetched


def scan_batch(client: BinanceRestClient, batch: list[str], cfg: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    cache_db = cfg["ohlc_cache_db_path"]
    for symbol in batch:
        try:
            candles_1m = get_candles(client, cache_db, symbol, "1m", cfg["lookback_limit"])
            candles_5m = get_candles(client, cache_db, symbol, "5m", cfg["lookback_limit"])
            candles_1h = get_candles(client, cache_db, symbol, "1h", max(120, cfg["lookback_limit"]))
            signal = build_batch_signal(symbol, candles_1m, candles_5m, candles_1h, cfg)
            results.append(signal)
            line = (
                f"[{datetime.now(timezone.utc).isoformat()}] {signal['symbol']} session={signal['session']} "
                f"price={signal['price']:.6f} state={signal['state']} trigger={signal['trigger']} "
                f"bias={signal['bias']} tp_zone={signal['tp_zone']} score={signal['score']}"
            )
            print(signal_line(
                line,
                trigger=signal.get("trigger", ""),
                bias=signal.get("bias", ""),
                blocked=bool(signal.get("confirm_blocked_by_session", False)),
                tp_zone=bool(signal.get("tp_zone", False)),
                score=signal.get("score"),
            ))
            append_log(cfg["log_path"], line)
            save_signal(cfg["database_path"], signal)
        except Exception as exc:
            line = f"[{datetime.now(timezone.utc).isoformat()}] ERROR symbol={symbol} err={exc}"
            print(error(line))
            append_log(cfg["log_path"], line)
    return results


def build_dashboard(all_symbols: list[str], batch: list[str], results: list[dict[str, Any]], cfg: dict[str, Any], runtime_state: dict[str, Any]) -> dict[str, Any]:
    top = sorted(results, key=lambda x: x.get("score", 0), reverse=True)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        "runtime": {
            "paused": bool(runtime_state.get("paused", False)),
            "mode": "paused" if runtime_state.get("paused", False) else "running",
        },
        "stats": {
            "all_symbols_count": len(all_symbols),
            "batch_count": len(batch),
            "loop_interval_seconds": cfg["poll_seconds"],
        },
        "batch_symbols": batch,
        "top_signals": top[:10],
        "signals": results,
    }


def list_symbols() -> None:
    cfg = load_config()
    client = BinanceRestClient(cfg["binance_rest_base"])
    symbols = discover_symbols(client, cfg)
    print(headline(f"Discovered {len(symbols)} symbols"))
    for s in symbols:
        print(info(s))


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
    init_ohlc_cache(cfg["ohlc_cache_db_path"])
    client = BinanceRestClient(cfg["binance_rest_base"])

    def tick() -> None:
        runtime_state = load_runtime_state(cfg)
        all_symbols = discover_symbols(client, cfg)
        batch = select_batch(all_symbols, cfg)
        results: list[dict[str, Any]] = []
        header = f"[{datetime.now(timezone.utc).isoformat()}] loop mode={'paused' if runtime_state.get('paused', False) else 'running'} all={len(all_symbols)} batch={len(batch)}"
        print(warning(header) if runtime_state.get("paused", False) else headline(header))
        if batch:
            print(muted(f"Batch symbols: {', '.join(batch)}"))
        if not runtime_state.get("paused", False):
            results = scan_batch(client, batch, cfg)
        dashboard = build_dashboard(all_symbols, batch, results, cfg, runtime_state)
        write_dashboard(cfg["dashboard_path"], dashboard)
        print(success(f"Dashboard written: {cfg['dashboard_path']} with {len(results)} signal(s)"))

    if args.once:
        print(headline("Running single scan tick"))
        tick()
        return

    print(headline("Starting live loop"))
    while True:
        tick()
        print(info(f"Sleeping {cfg['poll_seconds']}s"))
        safe_sleep(cfg["poll_seconds"])


if __name__ == "__main__":
    main()
