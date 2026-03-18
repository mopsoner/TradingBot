from __future__ import annotations

import json
from collector import BinanceRestClient
from engine import build_signal


def load_config() -> dict:
    with open("config.json", "r", encoding="utf-8") as f:
        return json.load(f)


def backtest(cfg: dict) -> None:
    symbol = cfg["backtest"]["symbol"]
    interval = cfg["backtest"]["interval"]
    limit = cfg["backtest"]["history_limit"]
    hold = cfg["backtest"]["holding_bars"]
    min_score = cfg["backtest"]["min_score"]
    client = BinanceRestClient(cfg["binance_rest_base"])
    candles = client.klines(symbol, interval, limit)

    wins = 0
    losses = 0
    trades = []

    for i in range(40, len(candles) - hold):
        c5 = candles[: i + 1]
        c1 = c5[-min(len(c5), 60):]
        c1h = candles[max(0, i - 80): i + 1]
        signal = build_signal(symbol, c1, c5, c1h, cfg)
        if signal["score"] < min_score:
            continue
        future = candles[i + hold]["close"]
        price = signal["price"]
        if signal["bias"] == "bull_confirm":
            ret = (future - price) / price
        elif signal["bias"] == "bear_confirm":
            ret = (price - future) / price
        else:
            continue
        trades.append(ret)
        if ret > 0:
            wins += 1
        else:
            losses += 1

    total = len(trades)
    avg = (sum(trades) / total * 100) if total else 0.0
    winrate = (wins / total * 100) if total else 0.0

    print(f"Backtest symbol={symbol} interval={interval}")
    print(f"Trades: {total}")
    print(f"Wins: {wins} Losses: {losses}")
    print(f"Winrate: {winrate:.2f}%")
    print(f"Average return per trade: {avg:.3f}%")


if __name__ == "__main__":
    backtest(load_config())
