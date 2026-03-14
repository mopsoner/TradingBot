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

    _BY_QUOTE: dict[str, list[str]] = {
        "USDT": [
            "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AVAXUSDT",
            "XRPUSDT", "ADAUSDT", "DOGEUSDT", "DOTUSDT", "MATICUSDT",
            "LINKUSDT", "UNIUSDT", "LTCUSDT", "ATOMUSDT", "NEARUSDT",
            "AAVEUSDT", "FILUSDT", "APTUSDT", "ARBUSDT", "OPUSDT",
            "SUIUSDT", "INJUSDT", "TIAUSDT", "SEIUSDT", "WLDUSDT",
        ],
        "USDC": [
            "BTCUSDC", "ETHUSDC", "SOLUSDC", "BNBUSDC", "XRPUSDC",
            "ADAUSDC", "DOGEUSDC", "AVAXUSDC", "DOTUSDC", "LINKUSDC",
            "LTCUSDC", "UNIUSDC", "NEARUSDC", "MATICUSDC", "ATOMUSDC",
            "APTUSDC", "ARBUSDC", "OPUSDC", "SUIUSDC",
        ],
        "BTC": [
            "ETHBTC", "SOLBTC", "BNBBTC", "XRPBTC", "ADABTC",
            "DOGEBTC", "DOTBTC", "LINKBTC", "LTCBTC", "ATOMBTC",
        ],
    }

    def load_symbols(self) -> list[str]:
        return self._BY_QUOTE["USDT"]

    def load_symbols_by_quote(self) -> dict[str, list[str]]:
        return self._BY_QUOTE

    def normalize_candle(self, raw: dict) -> Candle:
        return Candle(
            timestamp=datetime.fromtimestamp(raw["t"]),
            open=float(raw["o"]),
            high=float(raw["h"]),
            low=float(raw["l"]),
            close=float(raw["c"]),
            volume=float(raw["v"]),
        )
