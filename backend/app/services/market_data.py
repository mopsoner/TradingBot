from dataclasses import dataclass
from datetime import datetime, timedelta
import threading
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


def _call_binance(url: str, timeout: int = 8) -> dict | list | None:
    """Single entry-point for all Binance public API calls. Returns None on failure."""
    import httpx
    try:
        resp = httpx.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("Binance API call failed [%s]: %s", url, exc)
        return None


# ── Symbol cache (TTL 6h — margin pairs rarely change) ───────────────────────
class _SymbolCache:
    _lock = threading.Lock()
    _data: dict[str, list[str]] | None = None
    _expires: datetime | None = None
    TTL = timedelta(hours=6)

    def get(self) -> dict[str, list[str]]:
        with self._lock:
            now = datetime.utcnow()
            if self._data and self._expires and now < self._expires:
                return self._data
            result = self._fetch()
            self._data = result
            self._expires = now + self.TTL
            return result

    def _fetch(self) -> dict[str, list[str]]:
        raw = _call_binance("https://api.binance.com/api/v3/exchangeInfo")
        if raw is None:
            return _FALLBACK

        result: dict[str, list[str]] = {q: [] for q in _QUOTES}
        for sym in raw.get("symbols", []):
            if sym.get("status") != "TRADING":
                continue
            if not sym.get("isMarginTradingAllowed", False):
                continue
            quote = sym.get("quoteAsset", "")
            if quote in result:
                result[quote].append(sym["symbol"])

        for q in result:
            result[q].sort()

        if not any(result.values()):
            logger.warning("Binance exchangeInfo returned no margin symbols — using fallback")
            return _FALLBACK

        logger.info(
            "Binance symbol cache refreshed: %s",
            {q: len(v) for q, v in result.items()},
        )
        return result


# ── Price cache (TTL 5 min — prices change often) ────────────────────────────
class _PriceCache:
    _lock = threading.Lock()
    _data: dict[str, float] | None = None
    _expires: datetime | None = None
    TTL = timedelta(minutes=5)

    def get(self, known_symbols: set[str]) -> dict[str, float]:
        with self._lock:
            now = datetime.utcnow()
            if self._data and self._expires and now < self._expires:
                return self._data
            result = self._fetch(known_symbols)
            if result:
                self._data = result
                self._expires = now + self.TTL
                logger.info("Binance price cache refreshed: %d symbols", len(result))
            return self._data or {}

    def _fetch(self, known_symbols: set[str]) -> dict[str, float]:
        raw = _call_binance("https://api.binance.com/api/v3/ticker/price")
        if raw is None or not isinstance(raw, list):
            return {}
        return {
            t["symbol"]: float(t["price"])
            for t in raw
            if t["symbol"] in known_symbols
        }


_symbol_cache = _SymbolCache()
_price_cache = _PriceCache()


class MarketDataService:
    REQUIRED_TIMEFRAMES = ("15m", "1H", "4H")

    def load_symbols_by_quote(self) -> dict[str, list[str]]:
        return _symbol_cache.get()

    def load_symbols(self) -> list[str]:
        return self.load_symbols_by_quote().get("USDT", _FALLBACK["USDT"])

    def load_prices(self) -> dict[str, float]:
        all_syms: set[str] = set()
        for syms in self.load_symbols_by_quote().values():
            all_syms.update(syms)
        return _price_cache.get(all_syms)

    def normalize_candle(self, raw: dict) -> Candle:
        return Candle(
            timestamp=datetime.fromtimestamp(raw["t"]),
            open=float(raw["o"]),
            high=float(raw["h"]),
            low=float(raw["l"]),
            close=float(raw["c"]),
            volume=float(raw["v"]),
        )
