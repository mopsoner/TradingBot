from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, timezone

from .models import Decision


class TradeJournal:
    def __init__(self, path: str = "data/trade_journal.jsonl") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def log_decision(self, symbol: str, decision: Decision) -> None:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "symbol": symbol,
            "status": decision.status,
            "reason": decision.reason,
            "setup_valid": decision.setup.setup_valid if decision.setup else False,
        }
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
