from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

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
            "metadata": decision.metadata,
            "setup": {
                "valid": decision.setup.setup_valid if decision.setup else False,
                "direction": decision.setup.direction if decision.setup else "none",
                "pattern": decision.setup.pattern if decision.setup else "none",
                "liquidity_zone": decision.setup.liquidity_zone if decision.setup else {},
                "sweep_level": decision.setup.sweep_level if decision.setup else 0.0,
                "displacement": decision.setup.displacement if decision.setup else False,
                "bos_level": decision.setup.bos_level if decision.setup else 0.0,
                "entry_zone": decision.setup.entry_zone if decision.setup else [],
                "stop_loss": decision.setup.stop_loss if decision.setup else 0.0,
                "targets": decision.setup.targets if decision.setup else [],
                "confidence": decision.setup.confidence if decision.setup else 0.0,
            },
        }
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
