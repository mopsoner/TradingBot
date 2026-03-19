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


def append_log(path: str, line: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def write_dashboard(path: str, dashboard: dict[str, Any]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(dashboard, f, ensure_ascii=False, indent=2)
