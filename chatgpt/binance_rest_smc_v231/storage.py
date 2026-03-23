from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


def init_db(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts DATETIME DEFAULT CURRENT_TIMESTAMP,
                symbol TEXT,
                session TEXT,
                price REAL,
                rsi_5m REAL,
                state TEXT,
                trigger TEXT,
                bias TEXT,
                tp_zone INTEGER,
                score INTEGER,
                payload TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS live_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT UNIQUE,
                started_at TEXT,
                completed_at TEXT,
                runtime_mode TEXT,
                all_symbols_count INTEGER,
                batch_count INTEGER,
                scanned_count INTEGER,
                wait_count INTEGER,
                watch_count INTEGER,
                confirm_count INTEGER,
                trade_count INTEGER,
                blocked_count INTEGER,
                error_count INTEGER,
                batch_symbols_json TEXT,
                recent_symbols_json TEXT,
                stats_json TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS setup_journal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts DATETIME DEFAULT CURRENT_TIMESTAMP,
                run_id TEXT,
                symbol TEXT,
                session TEXT,
                stage TEXT,
                accepted INTEGER,
                actionability TEXT,
                score INTEGER,
                bias TEXT,
                trigger TEXT,
                state TEXT,
                reason TEXT,
                confirm_source TEXT,
                liquidity_type TEXT,
                liquidity_level REAL,
                entry_price REAL,
                stop_price REAL,
                target_price REAL,
                payload TEXT
            )
            """
        )
        conn.commit()


def init_ohlc_cache(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ohlc_cache (
                symbol TEXT NOT NULL,
                interval TEXT NOT NULL,
                open_time INTEGER NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL NOT NULL,
                close_time INTEGER NOT NULL,
                PRIMARY KEY (symbol, interval, open_time)
            )
            """
        )
        conn.commit()


def upsert_ohlc(path: str, symbol: str, interval: str, candles: list[dict[str, Any]]) -> None:
    if not candles:
        return
    with sqlite3.connect(path) as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO ohlc_cache
            (symbol, interval, open_time, open, high, low, close, volume, close_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    symbol,
                    interval,
                    c["open_time"],
                    c["open"],
                    c["high"],
                    c["low"],
                    c["close"],
                    c["volume"],
                    c["close_time"],
                )
                for c in candles
            ],
        )
        conn.commit()


def load_cached_ohlc(path: str, symbol: str, interval: str, limit: int) -> list[dict[str, Any]]:
    with sqlite3.connect(path) as conn:
        cur = conn.execute(
            """
            SELECT open_time, open, high, low, close, volume, close_time
            FROM ohlc_cache
            WHERE symbol = ? AND interval = ?
            ORDER BY open_time DESC
            LIMIT ?
            """,
            (symbol, interval, limit),
        )
        rows = cur.fetchall()
    rows.reverse()
    return [
        {
            "open_time": int(r[0]),
            "open": float(r[1]),
            "high": float(r[2]),
            "low": float(r[3]),
            "close": float(r[4]),
            "volume": float(r[5]),
            "close_time": int(r[6]),
        }
        for r in rows
    ]


def save_signal(path: str, signal: dict[str, Any]) -> None:
    rsi_value = signal.get("rsi_main", signal.get("rsi_5m"))
    with sqlite3.connect(path) as conn:
        conn.execute(
            "INSERT INTO signals (symbol, session, price, rsi_5m, state, trigger, bias, tp_zone, score, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                signal["symbol"],
                signal["session"],
                signal["price"],
                rsi_value,
                signal["state"],
                signal["trigger"],
                signal["bias"],
                1 if signal["tp_zone"] else 0,
                signal["score"],
                json.dumps(signal),
            ),
        )
        conn.commit()


def _stage_name(signal: dict[str, Any]) -> str:
    pipeline = signal.get("pipeline", {})
    if pipeline.get("trade"):
        return "trade"
    if pipeline.get("confirm"):
        return "confirm"
    if pipeline.get("zone"):
        return "zone"
    if pipeline.get("liquidity"):
        return "liquidity"
    if pipeline.get("collect"):
        return "collect"
    return "none"


def _journal_reason(signal: dict[str, Any]) -> str:
    if signal.get("confirm_blocked_by_session"):
        return "confirm pattern found but blocked by session filter"
    stage = _stage_name(signal)
    if stage == "trade":
        return "confirmed trade candidate ready"
    if stage == "confirm":
        return "confirmation obtained"
    if stage == "zone":
        return "watch setup active after liquidity sweep / wyckoff zone"
    if stage == "liquidity":
        return "liquidity context detected"
    return "collecting / no actionable confirmation yet"


def save_setup_journal(path: str, run_id: str, signal: dict[str, Any]) -> None:
    trade = signal.get("trade", {}) or {}
    liq = signal.get("liquidity_target", {}) or {}
    stage = _stage_name(signal)
    accepted = 1 if stage in {"confirm", "trade"} else 0
    if signal.get("confirm_blocked_by_session"):
        actionability = "blocked"
    elif stage == "trade":
        actionability = "actionable"
    elif "watch" in str(signal.get("bias", "")):
        actionability = "watch"
    else:
        actionability = "wait"
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            INSERT INTO setup_journal (
                run_id, symbol, session, stage, accepted, actionability, score, bias, trigger, state,
                reason, confirm_source, liquidity_type, liquidity_level, entry_price, stop_price, target_price, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                signal.get("symbol"),
                signal.get("session"),
                stage,
                accepted,
                actionability,
                signal.get("score"),
                signal.get("bias"),
                signal.get("trigger"),
                signal.get("state"),
                _journal_reason(signal),
                signal.get("confirm_source"),
                liq.get("type"),
                liq.get("level"),
                trade.get("entry", signal.get("price")),
                trade.get("stop"),
                trade.get("target"),
                json.dumps(signal),
            ),
        )
        conn.commit()


def start_live_run(path: str, run_id: str, started_at: str, runtime_mode: str, all_symbols_count: int, batch_symbols: list[str]) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO live_runs (
                run_id, started_at, runtime_mode, all_symbols_count, batch_count, batch_symbols_json,
                scanned_count, wait_count, watch_count, confirm_count, trade_count, blocked_count, error_count,
                recent_symbols_json, stats_json
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?, ?)
            """,
            (
                run_id,
                started_at,
                runtime_mode,
                all_symbols_count,
                len(batch_symbols),
                json.dumps(batch_symbols),
                json.dumps([]),
                json.dumps({}),
            ),
        )
        conn.commit()


def complete_live_run(path: str, run_id: str, completed_at: str, results: list[dict[str, Any]], error_count: int = 0) -> None:
    wait_count = 0
    watch_count = 0
    confirm_count = 0
    trade_count = 0
    blocked_count = 0
    recent_symbols: list[str] = []
    for sig in results:
        recent_symbols.append(sig.get("symbol"))
        stage = _stage_name(sig)
        if sig.get("confirm_blocked_by_session"):
            blocked_count += 1
        if stage == "trade":
            trade_count += 1
        elif stage == "confirm":
            confirm_count += 1
        elif "watch" in str(sig.get("bias", "")) or stage == "zone":
            watch_count += 1
        else:
            wait_count += 1
    stats = {
        "wait_count": wait_count,
        "watch_count": watch_count,
        "confirm_count": confirm_count,
        "trade_count": trade_count,
        "blocked_count": blocked_count,
        "error_count": error_count,
    }
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            UPDATE live_runs
            SET completed_at = ?, scanned_count = ?, wait_count = ?, watch_count = ?, confirm_count = ?, trade_count = ?,
                blocked_count = ?, error_count = ?, recent_symbols_json = ?, stats_json = ?
            WHERE run_id = ?
            """,
            (
                completed_at,
                len(results),
                wait_count,
                watch_count,
                confirm_count,
                trade_count,
                blocked_count,
                error_count,
                json.dumps(recent_symbols[:12]),
                json.dumps(stats),
                run_id,
            ),
        )
        conn.commit()


def append_log(path: str, line: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def write_dashboard(path: str, dashboard: dict[str, Any]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(dashboard, f, ensure_ascii=False, indent=2)
