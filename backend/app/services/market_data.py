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
            # Large caps
            "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
            "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "DOTUSDT", "TRXUSDT",
            "LINKUSDT", "MATICUSDT", "LTCUSDT", "BCHUSDT", "ATOMUSDT",
            "UNIUSDT", "ETCUSDT", "XLMUSDT", "NEARUSDT", "AAVEUSDT",
            # DeFi
            "CRVUSDT", "MKRUSDT", "SNXUSDT", "COMPUSDT", "BALUSDT",
            "SUSHIUSDT", "YFIUSDT", "LRCUSDT", "KNCUSDT", "LDOUSDT",
            "DYDXUSDT", "GMXUSDT", "PERPUSDT", "RUNEUSDT", "CAKEUSDT",
            "RDNTUSDT", "PENDLEUSDT", "ONDOUSDT", "QNTUSDT", "GRTUSDT",
            # Layer 1 / Layer 2
            "APTUSDT", "SUIUSDT", "ARBUSDT", "OPUSDT", "INJUSDT",
            "SEIUSDT", "TIAUSDT", "WLDUSDT", "FILUSDT", "ICPUSDT",
            "ALGOUSDT", "EOSUSDT", "XTZUSDT", "FLOWUSDT", "EGLDUSDT",
            "FETUSDT", "IMXUSDT", "STXUSDT", "MINAUSDT", "KAVAUSDT",
            "KLAYUSDT", "ZILUSDT", "IOSTUSDT", "ONTUSDT", "VETUSDT",
            # Metaverse / Gaming / NFT
            "MANAUSDT", "SANDUSDT", "AXSUSDT", "GALAUSDT", "ENJUSDT",
            "CHZUSDT", "GMTUSDT", "MAGICUSDT", "YGGUSDT", "ALICEUSDT",
            "ROSEUSDT", "HIGHUSDT", "ORDIUSDT", "WIFUSDT", "PEOPLEUSDT",
            # Layer 0 / infra
            "XMRUSDT", "DASHUSDT", "ZECUSDT", "RVNUSDT", "DCRUSDT",
            "HBARUSDT", "IOTAUSDT", "BANDUSDT", "STORJUSDT", "BATUSDT",
            "OCEANUSDT", "ANKRUSDT", "CELRUSDT", "SKLUSDT", "POWRUSDT",
            # Others commonly listed
            "WOOUSDT", "STGUSDT", "JASMYUSDT", "JTOUSDT", "JUPUSDT",
            "PYTHUSDT", "RENDERUSDT", "KASUSDT", "TRBUSDT", "ENSUSDT",
        ],
        "USDC": [
            # Large caps
            "BTCUSDC", "ETHUSDC", "BNBUSDC", "SOLUSDC", "XRPUSDC",
            "ADAUSDC", "AVAXUSDC", "DOGEUSDC", "DOTUSDC", "TRXUSDC",
            "LINKUSDC", "MATICUSDC", "LTCUSDC", "BCHUSDC", "ATOMUSDC",
            "UNIUSDC", "NEARUSDC", "XLMUSDC", "ETCUSDC", "AAVEUSDC",
            # DeFi
            "CRVUSDC", "MKRUSDC", "LDOUSDC", "GRTUSDC", "PENDLEUSDC",
            "RUNEUSDC", "CAKEUSDC", "INJUSDC", "SUSHIUSDC", "COMPUSDC",
            # Layer 1 / Layer 2
            "APTUSDC", "SUIUSDC", "ARBUSDC", "OPUSDC", "SEIUSDC",
            "TIAUSDC", "WLDUSDC", "FILUSDC", "ALGOUSDC", "FETUSDC",
            "IMXUSDC", "STXUSDC", "ICPUSDC", "KAVAUSDC", "FLOWUSDC",
            # Gaming / NFT
            "SANDUSDC", "MANAUSDC", "AXSUSDC", "GALAUSDC", "CHZUSDC",
            "ORDIUSDC", "WIFUSDC", "GMTUSDC",
            # Others
            "HBARUSDC", "RENDERUSDC", "WOOUSDC", "ENSUSDC", "STGUSDC",
        ],
        "BTC": [
            "ETHBTC", "BNBBTC", "SOLBTC", "XRPBTC", "ADABTC",
            "DOGEBTC", "DOTBTC", "LTCBTC", "ATOMBTC", "LINKBTC",
            "AVAXBTC", "UNIBTC", "NEARBTC", "BCHBTC", "ETCBTC",
            "XLMBTC", "AAVEBTC", "MATICBTC", "ALGBTC",  "DASHBTC",
            "XMRBTC", "EOSBTC", "SANDBTC", "MANABTC", "ZECBTC",
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
