from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

from .models import Decision


class TradeJournal:
    def __init__(self, path: str = "data/trade_journal.jsonl") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def log_decision(self, symbol: str, decision: Decision) -> None:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "symbol": symbol,
            "status": decision.status,
            "reason": decision.reason,
            "setup_valid": decision.setup.setup_valid if decision.setup else False,
            "direction": decision.setup.direction if decision.setup else "none",
        }
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")

    def read_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        lines = self.path.read_text(encoding="utf-8").splitlines()[-limit:]
        return [json.loads(line) for line in lines if line.strip()]
