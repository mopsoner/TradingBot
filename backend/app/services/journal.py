from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Optional


@dataclass
class SetupJournalEntry:
    timestamp: datetime
    symbol: str
    timeframe: str
    setup_type: str
    direction: Optional[str]
    accepted: bool
    reject_reason: Optional[str]

    liquidity_zone: str
    sweep_level: float
    fake_breakout: bool
    equal_highs_lows: bool
    wyckoff_event: str
    displacement_force: float
    bos_level: float
    expansion_detected: bool
    fib_zone: str

    tf_4h_structure: str
    tf_1h_validation: str
    session: str

    entry: Optional[float]
    stop: Optional[float]
    targets: str
    stop_logic: str

    result: str


class TradeJournal:
    def __init__(self) -> None:
        self.entries: list[dict] = []

    def log(self, entry: SetupJournalEntry) -> dict:
        payload = asdict(entry)
        self.entries.append(payload)
        return payload

    def get_all(self) -> list[dict]:
        return list(self.entries)

    def get_accepted(self) -> list[dict]:
        return [e for e in self.entries if e["accepted"]]

    def get_rejected(self) -> list[dict]:
        return [e for e in self.entries if not e["accepted"]]
