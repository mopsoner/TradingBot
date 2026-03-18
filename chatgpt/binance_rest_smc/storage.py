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
                score INTEGER,
                payload TEXT
            )
            """
        )
        conn.commit()


def save_signal(path: str, signal: dict[str, Any]) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute(
            "INSERT INTO signals (symbol, session, price, rsi_5m, state, trigger, bias, score, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                signal["symbol"],
                signal["session"],
                signal["price"],
                signal["rsi_5m"],
                signal["state"],
                signal["trigger"],
                signal["bias"],
                signal["score"],
                json.dumps(signal),
            ),
        )
        conn.commit()


def append_log(path: str, line: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(line + "\n")
