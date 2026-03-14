from dataclasses import dataclass
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


@dataclass
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


_QUOTES = ("USDT", "USDC", "BTC")

_FALLBACK: dict[str, list[str]] = {
    "USDT": [
        "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
        "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "DOTUSDT", "TRXUSDT",
        "LINKUSDT", "MATICUSDT", "LTCUSDT", "BCHUSDT", "ATOMUSDT",
        "UNIUSDT", "ETCUSDT", "XLMUSDT", "NEARUSDT", "AAVEUSDT",
        "CRVUSDT", "MKRUSDT", "SNXUSDT", "COMPUSDT", "LDOUSDT",
        "DYDXUSDT", "GMXUSDT", "RUNEUSDT", "CAKEUSDT", "GRTUSDT",
        "APTUSDT", "SUIUSDT", "ARBUSDT", "OPUSDT", "INJUSDT",
        "SEIUSDT", "TIAUSDT", "WLDUSDT", "FILUSDT", "ICPUSDT",
        "ALGOUSDT", "FETUSDT", "IMXUSDT", "STXUSDT", "KAVAUSDT",
        "MANAUSDT", "SANDUSDT", "AXSUSDT", "GALAUSDT", "CHZUSDT",
        "GMTUSDT", "ORDIUSDT", "WIFUSDT", "HBARUSDT", "RENDERUSDT",
        "WOOUSDT", "STGUSDT", "JUPUSDT", "PYTHUSDT", "KASUSDT",
    ],
    "USDC": [
        "BTCUSDC", "ETHUSDC", "BNBUSDC", "SOLUSDC", "XRPUSDC",
        "ADAUSDC", "AVAXUSDC", "DOGEUSDC", "DOTUSDC", "LINKUSDC",
        "LTCUSDC", "UNIUSDC", "NEARUSDC", "ATOMUSDC", "AAVEUSDC",
        "ARBUSDC", "OPUSDC", "SUIUSDC", "APTUSDC", "INJUSDC",
        "FETUSDC", "IMXUSDC", "STXUSDC", "SANDUSDC", "MANAUSDC",
    ],
    "BTC": [
        "ETHBTC", "BNBBTC", "SOLBTC", "XRPBTC", "ADABTC",
        "DOGEBTC", "DOTBTC", "LTCBTC", "ATOMBTC", "LINKBTC",
        "AVAXBTC", "UNIBTC", "NEARBTC", "BCHBTC", "ETCBTC",
    ],
}

_cache_data: dict[str, list[str]] | None = None
_cache_expires: datetime | None = None
_CACHE_TTL = timedelta(hours=1)


def _fetch_binance_margin_symbols() -> dict[str, list[str]]:
    """Fetch all isolated-margin-tradable symbols from Binance public API."""
    import httpx

    try:
        resp = httpx.get(
            "https://api.binance.com/api/v3/exchangeInfo",
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Binance exchangeInfo fetch failed: %s — using fallback list", exc)
        return _FALLBACK

    result: dict[str, list[str]] = {q: [] for q in _QUOTES}
    for sym in data.get("symbols", []):
        if sym.get("status") != "TRADING":
            continue
        if not sym.get("isMarginTradingAllowed", False):
            continue
        quote = sym.get("quoteAsset", "")
        if quote in result:
            result[quote].append(sym["symbol"])

    # Sort alphabetically within each quote bucket
    for q in result:
        result[q].sort()

    # If Binance returns empty buckets (e.g. network partial failure), keep fallback
    if not any(result.values()):
        return _FALLBACK

    return result


class MarketDataService:
    REQUIRED_TIMEFRAMES = ("15m", "1H", "4H")

    def load_symbols_by_quote(self) -> dict[str, list[str]]:
        global _cache_data, _cache_expires
        now = datetime.utcnow()
        if _cache_data and _cache_expires and now < _cache_expires:
            return _cache_data
        data = _fetch_binance_margin_symbols()
        _cache_data = data
        _cache_expires = now + _CACHE_TTL
        return data

    def load_symbols(self) -> list[str]:
        by_quote = self.load_symbols_by_quote()
        return by_quote.get("USDT", _FALLBACK["USDT"])

    def normalize_candle(self, raw: dict) -> Candle:
        return Candle(
            timestamp=datetime.fromtimestamp(raw["t"]),
            open=float(raw["o"]),
            high=float(raw["h"]),
            low=float(raw["l"]),
            close=float(raw["c"]),
            volume=float(raw["v"]),
        )
