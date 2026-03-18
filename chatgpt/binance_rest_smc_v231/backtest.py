from __future__ import annotations

import json
from pathlib import Path
from statistics import median
from collector import BinanceRestClient
from engine import build_signal
from storage import init_ohlc_cache, load_cached_ohlc, upsert_ohlc


def load_config() -> dict:
    with open("config.json", "r", encoding="utf-8") as f:
        return json.load(f)


def get_candles(client: BinanceRestClient, cache_db: str, symbol: str, interval: str, limit: int):
    cached = load_cached_ohlc(cache_db, symbol, interval, limit)
    if len(cached) >= limit:
        return cached
    fetched = client.klines(symbol, interval, limit)
    upsert_ohlc(cache_db, symbol, interval, fetched)
    return fetched


def backtest(cfg: dict) -> None:
    symbol = cfg["backtest"]["symbol"]
    limit = cfg["backtest"]["history_limit"]
    hold = cfg["backtest"]["holding_bars"]
    min_score = cfg["backtest"]["min_score"]
    cache_db = cfg["ohlc_cache_db_path"]
    report_path = cfg.get("backtest_report_path", "data/backtest_report.json")

    init_ohlc_cache(cache_db)
    client = BinanceRestClient(cfg["binance_rest_base"])
    candles = get_candles(client, cache_db, symbol, "5m", limit)
    candles_1h = get_candles(client, cache_db, symbol, "1h", min(120, limit))

    wins = 0
    losses = 0
    long_count = 0
    short_count = 0
    trades = []
    r_multiples = []
    gross_profit = 0.0
    gross_loss = 0.0
    equity = 1.0

    for i in range(40, len(candles) - hold):
        c5 = candles[: i + 1]
        c1 = c5[-min(len(c5), 60):]
        signal = build_signal(symbol, c1, c5, candles_1h, cfg)
        if signal["score"] < min_score:
            continue

        future = candles[i + hold]["close"]
        price = signal["price"]
        trade = signal.get("trade", {})
        side = trade.get("side")
        stop = trade.get("stop")
        risk_pct = None

        if signal["bias"] == "bull_confirm":
            ret = (future - price) / price
            long_count += 1
            if stop is not None and price > stop:
                risk_pct = (price - stop) / price
        elif signal["bias"] == "bear_confirm":
            ret = (price - future) / price
            short_count += 1
            if stop is not None and stop > price:
                risk_pct = (stop - price) / price
        else:
            continue

        trades.append(ret)
        equity *= (1 + ret)

        if risk_pct and risk_pct > 0:
            r_multiples.append(ret / risk_pct)

        if ret > 0:
            wins += 1
            gross_profit += ret
        else:
            losses += 1
            gross_loss += abs(ret)

    total = len(trades)
    avg_ret = (sum(trades) / total * 100) if total else 0.0
    med_ret = (median(trades) * 100) if total else 0.0
    winrate = (wins / total * 100) if total else 0.0
    best = (max(trades) * 100) if total else 0.0
    worst = (min(trades) * 100) if total else 0.0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else None
    cumulative = (equity - 1) * 100
    avg_r = (sum(r_multiples) / len(r_multiples)) if r_multiples else None
    med_r = median(r_multiples) if r_multiples else None
    best_r = max(r_multiples) if r_multiples else None
    worst_r = min(r_multiples) if r_multiples else None
    total_r = sum(r_multiples) if r_multiples else None

    report = {
        "symbol": symbol,
        "interval": "5m",
        "trades": total,
        "wins": wins,
        "losses": losses,
        "winrate_pct": round(winrate, 2),
        "average_return_pct": round(avg_ret, 4),
        "median_return_pct": round(med_ret, 4),
        "best_trade_pct": round(best, 4),
        "worst_trade_pct": round(worst, 4),
        "profit_factor": round(profit_factor, 4) if profit_factor is not None else None,
        "cumulative_return_pct": round(cumulative, 4),
        "average_r_multiple": round(avg_r, 4) if avg_r is not None else None,
        "median_r_multiple": round(med_r, 4) if med_r is not None else None,
        "best_r_multiple": round(best_r, 4) if best_r is not None else None,
        "worst_r_multiple": round(worst_r, 4) if worst_r is not None else None,
        "total_r": round(total_r, 4) if total_r is not None else None,
        "long_count": long_count,
        "short_count": short_count,
        "min_score": min_score,
        "holding_bars": hold
    }

    Path(report_path).parent.mkdir(parents=True, exist_ok=True)
    Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Backtest symbol={symbol} interval=5m")
    for k, v in report.items():
        if k in {"symbol", "interval"}:
            continue
        print(f"{k}: {v}")


if __name__ == "__main__":
    backtest(load_config())
