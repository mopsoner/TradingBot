from dataclasses import asdict, dataclass
from datetime import datetime


@dataclass
class SetupJournalEntry:
    timestamp: datetime
    symbol: str
    setup_type: str
    liquidity_zone: str
    sweep_level: float
    bos_level: float
    fib_zone: str
    entry: float
    stop: float
    targets: str
    result: str


class TradeJournal:
    def __init__(self) -> None:
        self.entries: list[dict] = []

    def log(self, entry: SetupJournalEntry) -> dict:
        payload = asdict(entry)
        self.entries.append(payload)
        return payload
