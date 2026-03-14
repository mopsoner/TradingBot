from dataclasses import dataclass
from datetime import datetime


@dataclass
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketDataService:
    REQUIRED_TIMEFRAMES = ("15m", "1H", "4H")

    def load_symbols(self) -> list[str]:
        return [
            "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AVAXUSDT",
            "XRPUSDT", "ADAUSDT", "DOGEUSDT", "DOTUSDT", "MATICUSDT",
            "LINKUSDT", "UNIUSDT", "LTCUSDT", "ATOMUSDT", "NEARUSDT",
            "AAVEUSDT", "FILUSDT", "APTUSDT", "ARBUSDT", "OPUSDT",
            "SUIUSDT", "INJUSDT", "TIAUSDT", "SEIUSDT", "WLDUSDT",
        ]

    def normalize_candle(self, raw: dict) -> Candle:
        return Candle(
            timestamp=datetime.fromtimestamp(raw["t"]),
            open=float(raw["o"]),
            high=float(raw["h"]),
            low=float(raw["l"]),
            close=float(raw["c"]),
            volume=float(raw["v"]),
        )
