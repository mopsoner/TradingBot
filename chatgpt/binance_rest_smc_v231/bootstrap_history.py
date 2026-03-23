from __future__ import annotations

import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collector import BinanceRestClient, safe_sleep
from config_utils import load_config
from console_colors import error, headline, info, success, warning
from runner import discover_symbols
from storage import init_ohlc_cache, upsert_ohlc

INTERVAL_MS = {
    "1m": 60_000,
    "5m": 300_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
}
DEFAULT_HISTORY_DAYS = {
    "1m": 7,
    "5m": 30,
    "1h": 180,
    "4h": 365,
}


def now_ms() -> int:
    return int(time.time() * 1000)


def history_days(cfg: dict[str, Any], interval: str) -> int:
    return int(cfg.get("bootstrap", {}).get("history_days", {}).get(interval, DEFAULT_HISTORY_DAYS[interval]))


def request_pause_seconds(cfg: dict[str, Any]) -> float:
    return float(cfg.get("bootstrap", {}).get("request_pause_seconds", 0.08))


def max_symbols(cfg: dict[str, Any]) -> int | None:
    value = cfg.get("bootstrap", {}).get("max_symbols")
    return int(value) if value else None


def cache_bounds(db_path: str, symbol: str, interval: str) -> tuple[int | None, int | None]:
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT MIN(open_time), MAX(close_time) FROM ohlc_cache WHERE symbol = ? AND interval = ?",
            (symbol, interval),
        ).fetchone()
    if not row:
        return None, None
    return (int(row[0]) if row[0] is not None else None, int(row[1]) if row[1] is not None else None)


def fetch_range(client: BinanceRestClient, db_path: str, symbol: str, interval: str, start_ms: int, end_ms: int, pause_s: float) -> int:
    if start_ms > end_ms:
        return 0
    total = 0
    current = start_ms
    while current <= end_ms:
        candles = client.klines(symbol, interval, 1000, start_time=current, end_time=end_ms)
        if not candles:
            break
        upsert_ohlc(db_path, symbol, interval, candles)
        total += len(candles)
        next_start = candles[-1]["close_time"] + 1
        if next_start <= current:
            break
        current = next_start
        safe_sleep(pause_s)
    return total


def bootstrap_symbol_interval(client: BinanceRestClient, db_path: str, symbol: str, interval: str, cfg: dict[str, Any]) -> tuple[int, str]:
    pause_s = request_pause_seconds(cfg)
    ms_window = history_days(cfg, interval) * 24 * 60 * 60 * 1000
    desired_start = now_ms() - ms_window
    earliest, latest = cache_bounds(db_path, symbol, interval)
    inserted = 0
    mode_parts: list[str] = []
    if earliest is None or latest is None:
        inserted += fetch_range(client, db_path, symbol, interval, desired_start, now_ms(), pause_s)
        mode_parts.append("full_bootstrap")
    else:
        if earliest > desired_start:
            inserted += fetch_range(client, db_path, symbol, interval, desired_start, earliest - 1, pause_s)
            mode_parts.append("backfill_old")
        tail_start = latest + 1
        if tail_start < now_ms() - INTERVAL_MS[interval]:
            inserted += fetch_range(client, db_path, symbol, interval, tail_start, now_ms(), pause_s)
            mode_parts.append("fill_recent_gap")
        if not mode_parts:
            mode_parts.append("up_to_date")
    return inserted, "+".join(mode_parts)


def main() -> None:
    cfg = load_config()
    db_path = cfg["ohlc_cache_db_path"]
    init_ohlc_cache(db_path)
    client = BinanceRestClient(
        cfg["binance_rest_base"],
        api_key=cfg.get("binance_api_key"),
        api_secret=cfg.get("binance_api_secret"),
    )
    symbols = discover_symbols(client, cfg)
    limit = max_symbols(cfg)
    if limit:
        symbols = symbols[:limit]
    intervals = cfg.get("bootstrap", {}).get("intervals", ["1m", "5m", "1h", "4h"])
    print(headline(f"Bootstrap history start symbols={len(symbols)} intervals={','.join(intervals)}"))
    total_inserted = 0
    for symbol in symbols:
        print(info(f"symbol={symbol}"))
        for interval in intervals:
            try:
                inserted, mode = bootstrap_symbol_interval(client, db_path, symbol, interval, cfg)
                total_inserted += inserted
                msg = f"{symbol} {interval} mode={mode} inserted={inserted}"
                if inserted > 0:
                    print(success(msg))
                else:
                    print(warning(msg))
            except Exception as exc:
                print(error(f"bootstrap_error symbol={symbol} interval={interval} err={exc}"))
    print(headline(f"Bootstrap completed at {datetime.now(timezone.utc).isoformat()}"))
    print(success(f"total_inserted={total_inserted}"))


if __name__ == "__main__":
    main()
