"""
Candle importer service.
Supports three data sources: binance, yfinance, csv (pandas).
ALL candle storage to DB goes through this module.
"""
from __future__ import annotations

import io
import math
import logging
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Literal

logger = logging.getLogger(__name__)

BINANCE_TF_MAP: dict[str, str] = {
    "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d",
}

YF_TF_MAP: dict[str, str] = {
    "5m": "5m", "15m": "15m", "1h": "1h", "4h": "1h", "1d": "1d",
}

YF_TICKER_MAP: dict[str, str] = {
    "BTCUSDT": "BTC-USD",   "ETHUSDT": "ETH-USD",   "BNBUSDT": "BNB-USD",
    "SOLUSDT": "SOL-USD",   "XRPUSDT": "XRP-USD",   "ADAUSDT": "ADA-USD",
    "AVAXUSDT": "AVAX-USD", "DOGEUSDT": "DOGE-USD",  "DOTUSDT": "DOT-USD",
    "MATICUSDT": "MATIC-USD","LINKUSDT": "LINK-USD", "LTCUSDT": "LTC-USD",
    "UNIUSDT":  "UNI-USD",  "ATOMUSDT": "ATOM-USD",  "NEARUSDT": "NEAR-USD",
    "AAVEUSDT": "AAVE-USD", "APTUSDT":  "APT-USD",   "ARBUSDT":  "ARB-USD",
    "OPUSDT":   "OP-USD",   "SUIUSDT":  "SUI-USD",   "INJUSDT":  "INJ-USD",
    "FILUSDT":  "FIL-USD",  "TIAUSDT":  "TIA-USD",   "SEIUSDT":  "SEI-USD",
    "WLDUSDT":  "WLD-USD",
}

YF_MAX_DAYS: dict[str, int] = {
    "5m": 59, "15m": 59, "1h": 729, "4h": 729, "1d": 9999,
}

CANDLES_PER_DAY: dict[str, int] = {
    "5m": 288, "15m": 96, "1h": 24, "4h": 6, "1d": 1,
}


@dataclass
class RawCandle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


# ── Binance ────────────────────────────────────────────────────────────────────

def _binance_klines(symbol: str, interval: str, start_ms: int, end_ms: int) -> list[RawCandle]:
    import httpx
    url = "https://api.binance.com/api/v3/klines"
    candles: list[RawCandle] = []
    chunk_start = start_ms
    while chunk_start < end_ms:
        params = {
            "symbol": symbol,
            "interval": interval,
            "startTime": chunk_start,
            "endTime": end_ms,
            "limit": 1000,
        }
        try:
            resp = httpx.get(url, params=params, timeout=15)
            resp.raise_for_status()
            rows = resp.json()
        except Exception as exc:
            logger.warning("Binance klines failed %s %s: %s", symbol, interval, exc)
            break
        if not rows:
            break
        for row in rows:
            ts = datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc)
            candles.append(RawCandle(
                timestamp=ts,
                open=float(row[1]), high=float(row[2]),
                low=float(row[3]), close=float(row[4]),
                volume=float(row[5]),
            ))
        chunk_start = rows[-1][0] + 1
        if len(rows) < 1000:
            break
    return candles


def fetch_binance(symbol: str, timeframe: str, days: int) -> list[RawCandle]:
    interval = BINANCE_TF_MAP.get(timeframe, "1h")
    end_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp() * 1000)
    return _binance_klines(symbol, interval, start_ms, end_ms)


# ── yfinance ──────────────────────────────────────────────────────────────────

def _agg_to_4h(candles_1h: list[RawCandle]) -> list[RawCandle]:
    result: list[RawCandle] = []
    bucket: list[RawCandle] = []
    for c in candles_1h:
        bucket.append(c)
        if len(bucket) == 4:
            result.append(RawCandle(
                timestamp=bucket[0].timestamp,
                open=bucket[0].open,
                high=max(b.high for b in bucket),
                low=min(b.low for b in bucket),
                close=bucket[-1].close,
                volume=sum(b.volume for b in bucket),
            ))
            bucket = []
    return result


def fetch_yfinance(symbol: str, timeframe: str, days: int) -> list[RawCandle]:
    import yfinance as yf
    import pandas as pd

    ticker = YF_TICKER_MAP.get(symbol.upper(), symbol.upper().replace("USDT", "-USD"))
    yf_interval = YF_TF_MAP.get(timeframe, "1h")
    max_days = YF_MAX_DAYS.get(timeframe, 729)
    actual_days = min(days, max_days)

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=actual_days)

    chunk_days = 55 if timeframe in ("5m", "15m") else 700
    all_candles: list[RawCandle] = []
    seen: set[str] = set()
    chunk_start = start

    while chunk_start < end:
        chunk_end = min(chunk_start + timedelta(days=chunk_days), end)
        try:
            df = yf.download(ticker, start=chunk_start, end=chunk_end,
                             interval=yf_interval, progress=False, auto_adjust=True)
            if df.empty:
                chunk_start = chunk_end
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            for idx, row in df.iterrows():
                ts = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                o, h, l, c = float(row["Open"]), float(row["High"]), float(row["Low"]), float(row["Close"])
                v = float(row["Volume"]) if "Volume" in row.index else 0.0
                if any(math.isnan(x) for x in [o, h, l, c]):
                    continue
                key = ts.isoformat()
                if key not in seen:
                    seen.add(key)
                    all_candles.append(RawCandle(timestamp=ts, open=o, high=h, low=l, close=c, volume=v))
        except Exception as exc:
            logger.warning("yfinance chunk %s→%s failed: %s", chunk_start.date(), chunk_end.date(), exc)
        chunk_start = chunk_end

    all_candles.sort(key=lambda c: c.timestamp)
    if timeframe == "4h" and yf_interval == "1h":
        all_candles = _agg_to_4h(all_candles)
    return all_candles


# ── CSV / pandas ──────────────────────────────────────────────────────────────

def parse_csv(csv_text: str, symbol: str, timeframe: str) -> list[RawCandle]:
    """
    Parse CSV text into candles.
    Expected columns (case-insensitive, flexible order):
      timestamp/date/time, open, high, low, close, volume
    """
    import pandas as pd

    df = pd.read_csv(io.StringIO(csv_text))
    df.columns = [c.strip().lower() for c in df.columns]

    ts_col = next((c for c in df.columns if c in ("timestamp", "date", "time", "datetime", "open_time")), None)
    if ts_col is None:
        raise ValueError("CSV missing timestamp column (expected: timestamp, date, time, datetime, open_time)")
    for col in ("open", "high", "low", "close"):
        if col not in df.columns:
            raise ValueError(f"CSV missing required column: {col}")

    candles: list[RawCandle] = []
    for _, row in df.iterrows():
        try:
            ts_raw = row[ts_col]
            if isinstance(ts_raw, (int, float)):
                ts = datetime.fromtimestamp(ts_raw / 1000 if ts_raw > 1e10 else ts_raw, tz=timezone.utc)
            else:
                ts = pd.to_datetime(ts_raw, utc=True).to_pydatetime()
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
            o, h, l, c = float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"])
            v = float(row["volume"]) if "volume" in df.columns else 0.0
            if any(math.isnan(x) for x in [o, h, l, c]):
                continue
            candles.append(RawCandle(timestamp=ts, open=o, high=h, low=l, close=c, volume=v))
        except Exception:
            continue
    candles.sort(key=lambda c: c.timestamp)
    return candles


# ── DB persistence ────────────────────────────────────────────────────────────

def save_candles_to_db(candles: list[RawCandle], symbol: str, timeframe: str, source: str) -> int:
    """
    Upsert candles into MarketCandle table. Returns number of new rows inserted.
    Deduplicates by (symbol, timeframe, timestamp).
    """
    from backend.app.db.session import engine
    from backend.app.db.models import MarketCandle
    from sqlmodel import Session, select

    if not candles:
        return 0

    with Session(engine) as s:
        existing_rows = s.exec(
            select(MarketCandle.timestamp)
            .where(MarketCandle.symbol == symbol, MarketCandle.timeframe == timeframe)
        ).all()
        existing = {(ts.isoformat() if hasattr(ts, "isoformat") else str(ts)) for ts in existing_rows}

        batch: list[MarketCandle] = []
        for c in candles:
            key = c.timestamp.isoformat()
            if key in existing:
                continue
            batch.append(MarketCandle(
                timestamp=c.timestamp,
                symbol=symbol,
                timeframe=timeframe,
                open=round(c.open, 8),
                high=round(c.high, 8),
                low=round(c.low, 8),
                close=round(c.close, 8),
                volume=round(c.volume, 4),
                source=source,
            ))
        if batch:
            s.add_all(batch)
            s.commit()
        return len(batch)


# ── Main entry point ──────────────────────────────────────────────────────────

def import_candles(
    symbol: str,
    timeframe: str,
    days: int,
    source: Literal["binance", "yfinance"],
) -> dict:
    """
    Download candles from the given source and store them in DB.
    Returns a summary dict.
    """
    if source == "binance":
        candles = fetch_binance(symbol, timeframe, days)
    elif source == "yfinance":
        candles = fetch_yfinance(symbol, timeframe, days)
    else:
        raise ValueError(f"Unknown source: {source}. Use binance, yfinance, or POST CSV to /data/import/csv")

    inserted = save_candles_to_db(candles, symbol, timeframe, source)

    period_start = candles[0].timestamp.date().isoformat() if candles else None
    period_end = candles[-1].timestamp.date().isoformat() if candles else None

    return {
        "ok": True,
        "symbol": symbol,
        "timeframe": timeframe,
        "source": source,
        "downloaded": len(candles),
        "inserted": inserted,
        "skipped": len(candles) - inserted,
        "period_start": period_start,
        "period_end": period_end,
    }
