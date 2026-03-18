from __future__ import annotations

import json
from collector import BinanceRestClient
from signals import closes, rsi


def load_config() -> dict:
    with open("config.json", "r", encoding="utf-8") as f:
        return json.load(f)


def backtest(cfg: dict) -> None:
    symbol = cfg["backtest"]["symbol"]
    interval = cfg["backtest"]["interval"]
    limit = cfg["backtest"]["history_limit"]
    hold = cfg["backtest"]["holding_bars"]
    client = BinanceRestClient(cfg["binance_rest_base"])
    candles = client.klines(symbol, interval, limit)
    period = cfg["rsi_period"]
    ob = cfg["signals"]["overbought"]
    os = cfg["signals"]["oversold"]

    wins = 0
    losses = 0
    trades = []

    for i in range(period + 10, len(candles) - hold):
        window = candles[: i + 1]
        price = window[-1]["close"]
        rv = rsi(closes(window), period)
        if rv is None:
            continue
        future = candles[i + hold]["close"]
        ret = (future - price) / price

        if rv <= os:
            trades.append(ret)
            if ret > 0:
                wins += 1
            else:
                losses += 1
        elif rv >= ob:
            sret = -ret
            trades.append(sret)
            if sret > 0:
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
