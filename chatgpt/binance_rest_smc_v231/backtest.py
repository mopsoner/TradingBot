from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from collector import BinanceRestClient
from pipeline import build_batch_signal, replay_slices
from storage import init_ohlc_cache, load_cached_ohlc, upsert_ohlc

BATCH_REPLAY_INTERVAL = "batch_replay_1m_5m_1h"


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


def _calc_r_multiple(side: str, entry: float, exit_price: float | None, stop: float | None) -> float | None:
    if exit_price is None or stop is None:
        return None
    if side == "long" and entry > stop:
        risk_pct = (entry - stop) / entry
        return ((exit_price - entry) / entry) / risk_pct if risk_pct > 0 else None
    if side == "short" and stop > entry:
        risk_pct = (stop - entry) / entry
        return ((entry - exit_price) / entry) / risk_pct if risk_pct > 0 else None
    return None


def _calc_return_pct(side: str, entry: float, exit_price: float | None) -> float | None:
    if exit_price is None:
        return None
    if side == "long":
        return (exit_price - entry) / entry * 100
    return (entry - exit_price) / entry * 100


def _reward_risk_ratio(side: str, entry: float, target: float | None, stop: float | None) -> float | None:
    if target is None or stop is None:
        return None
    if side == "long":
        reward = target - entry
        risk = entry - stop
    else:
        reward = entry - target
        risk = stop - entry
    if reward <= 0 or risk <= 0:
        return None
    return reward / risk


def _close_trade(open_trade: dict, signal: dict | None, exit_price: float, exit_session: str | None, exit_reason: str, bars_held: int) -> dict:
    open_trade["status"] = "closed"
    open_trade["exit_signal_time"] = signal.get("signal_time") if signal else None
    open_trade["exit_signal_type"] = signal.get("trigger") if signal else None
    open_trade["exit_signal_bias"] = signal.get("bias") if signal else None
    open_trade["exit_price"] = exit_price
    open_trade["exit_session"] = exit_session
    open_trade["exit_reason"] = exit_reason
    open_trade["bars_held"] = bars_held
    ret = _calc_return_pct(open_trade["side"], open_trade["entry_price"], exit_price)
    open_trade["return_pct"] = round(ret, 4) if ret is not None else None
    r_val = _calc_r_multiple(open_trade["side"], open_trade["entry_price"], exit_price, open_trade["stop_price"])
    open_trade["r_multiple"] = round(r_val, 4) if r_val is not None else None
    return open_trade


def _write_backtest_archive(base_dir: Path, run_id: str, report: dict, trades: list[dict]) -> None:
    base_dir.mkdir(parents=True, exist_ok=True)
    report_name = f"{run_id}_report.json"
    trades_name = f"{run_id}_trades.json"
    (base_dir / report_name).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (base_dir / trades_name).write_text(json.dumps(trades, ensure_ascii=False, indent=2), encoding="utf-8")

    index_path = base_dir / "index.json"
    entries: list[dict] = []
    if index_path.exists():
        try:
            data = json.loads(index_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                entries = data
        except Exception:
            entries = []
    entry = {
        "run_id": run_id,
        "created_at": report.get("created_at"),
        "symbol": report.get("symbol"),
        "interval": report.get("interval"),
        "closed_trades": report.get("closed_trades"),
        "open_trades": report.get("open_trades"),
        "winrate_pct": report.get("winrate_pct"),
        "total_r": report.get("total_r"),
        "report_file": report_name,
        "trades_file": trades_name,
    }
    entries = [e for e in entries if e.get("run_id") != run_id]
    entries.insert(0, entry)
    index_path.write_text(json.dumps(entries[:200], ensure_ascii=False, indent=2), encoding="utf-8")


def backtest(cfg: dict) -> None:
    bt = cfg["backtest"]
    symbol = bt["symbol"]
    limit = bt["history_limit"]
    min_score = bt["min_score"]
    min_rr = bt.get("min_rr", 0.8)
    cache_db = cfg["ohlc_cache_db_path"]
    lookback_limit = cfg.get("lookback_limit", 180)
    report_path = cfg.get("backtest_report_path", "data/backtest_report.json")
    trades_path = cfg.get("backtest_trades_path", "data/backtest_trades.json")
    archive_dir = Path(cfg.get("backtest_runs_dir", "data/backtests"))
    created_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    run_id = f"{symbol}_{BATCH_REPLAY_INTERVAL}_{created_at.replace(':', '').replace('-', '').replace('T', '_').replace('Z', '')}"

    init_ohlc_cache(cache_db)
    client = BinanceRestClient(cfg["binance_rest_base"])
    candles_1m = get_candles(client, cache_db, symbol, "1m", limit)
    candles_5m = get_candles(client, cache_db, symbol, "5m", max(lookback_limit, (limit // 5) + lookback_limit))
    candles_1h = get_candles(client, cache_db, symbol, "1h", max(120, (limit // 60) + lookback_limit))

    closed_returns = []
    closed_r = []
    trade_objects = []
    open_trade: dict | None = None
    wins = 0
    losses = 0
    gross_profit = 0.0
    gross_loss = 0.0
    equity = 1.0
    long_count = 0
    short_count = 0
    closed_count = 0
    open_count = 0
    opposite_signal_exit_count = 0
    stop_invalidation_count = 0
    filtered_rr_count = 0
    bars_held_closed: list[int] = []
    durations_minutes_closed: list[float] = []

    warmup = min(max(40, lookback_limit), max(40, len(candles_1m) - 1))
    for i in range(warmup, len(candles_1m)):
        current = candles_1m[i]
        c1, c5, c1h = replay_slices(candles_1m, candles_5m, candles_1h, current["close_time"], lookback_limit)
        if len(c1) < 20 or len(c5) < 20 or len(c1h) < 10:
            continue
        signal = build_batch_signal(symbol, c1, c5, c1h, cfg)

        if open_trade is not None:
            invalidated = (
                open_trade["side"] == "short" and current["close"] > open_trade["stop_price"]
            ) or (
                open_trade["side"] == "long" and current["close"] < open_trade["stop_price"]
            )
            if invalidated:
                open_trade = _close_trade(
                    open_trade=open_trade,
                    signal=None,
                    exit_price=current["close"],
                    exit_session=signal.get("session"),
                    exit_reason="stop_invalidation",
                    bars_held=i - open_trade["entry_index"],
                )
                trade_objects.append(open_trade)
                ret_pct = open_trade["return_pct"]
                if ret_pct is not None:
                    closed_returns.append(ret_pct)
                    equity *= (1 + ret_pct / 100)
                    if ret_pct > 0:
                        wins += 1
                        gross_profit += ret_pct / 100
                    elif ret_pct < 0:
                        losses += 1
                        gross_loss += abs(ret_pct / 100)
                if open_trade["r_multiple"] is not None:
                    closed_r.append(open_trade["r_multiple"])
                closed_count += 1
                stop_invalidation_count += 1
                bars_held_closed.append(open_trade["bars_held"])
                if open_trade["entry_signal_time"] and current["close_time"]:
                    durations_minutes_closed.append((current["close_time"] - open_trade["entry_signal_time"]) / 60000)
                open_trade = None
                continue

        if signal["score"] < min_score:
            continue
        bias = signal["bias"]
        if bias not in {"bull_confirm", "bear_confirm"}:
            continue

        if open_trade is None:
            side = "long" if bias == "bull_confirm" else "short"
            rr_ratio = _reward_risk_ratio(side, signal["price"], signal.get("trade", {}).get("target"), signal.get("trade", {}).get("stop"))
            if rr_ratio is None or rr_ratio < min_rr:
                filtered_rr_count += 1
                continue
            if side == "long":
                long_count += 1
            else:
                short_count += 1
            open_trade = {
                "status": "open",
                "symbol": symbol,
                "side": side,
                "entry_signal_time": signal.get("signal_time"),
                "entry_signal_open_time": signal.get("signal_open_time"),
                "entry_signal_close_time": signal.get("signal_close_time"),
                "entry_signal_interval": signal.get("signal_interval"),
                "entry_signal_type": signal.get("trigger"),
                "entry_signal_bias": bias,
                "entry_price": signal["price"],
                "entry_session": signal.get("session"),
                "entry_index": i,
                "entry_rsi_main": signal.get("rsi_main"),
                "entry_reward_risk_ratio": round(rr_ratio, 4) if rr_ratio is not None else None,
                "score": signal.get("score"),
                "state": signal.get("state"),
                "tp_zone": signal.get("tp_zone"),
                "stop_price": signal.get("trade", {}).get("stop"),
                "target_price": signal.get("trade", {}).get("target"),
                "liquidity_target_at_entry": signal.get("liquidity_target"),
                "exit_signal_time": None,
                "exit_signal_type": None,
                "exit_signal_bias": None,
                "exit_price": None,
                "exit_session": None,
                "exit_reason": None,
                "bars_held": None,
                "return_pct": None,
                "r_multiple": None,
            }
            continue

        is_opposite = (open_trade["side"] == "long" and bias == "bear_confirm") or (open_trade["side"] == "short" and bias == "bull_confirm")
        if not is_opposite:
            continue

        open_trade = _close_trade(
            open_trade=open_trade,
            signal=signal,
            exit_price=signal["price"],
            exit_session=signal.get("session"),
            exit_reason="opposite_signal",
            bars_held=i - open_trade["entry_index"],
        )
        trade_objects.append(open_trade)

        ret_pct = open_trade["return_pct"]
        if ret_pct is not None:
            closed_returns.append(ret_pct)
            equity *= (1 + ret_pct / 100)
            if ret_pct > 0:
                wins += 1
                gross_profit += ret_pct / 100
            elif ret_pct < 0:
                losses += 1
                gross_loss += abs(ret_pct / 100)
        if open_trade["r_multiple"] is not None:
            closed_r.append(open_trade["r_multiple"])
        closed_count += 1
        opposite_signal_exit_count += 1
        bars_held_closed.append(open_trade["bars_held"])
        if open_trade["entry_signal_time"] and open_trade["exit_signal_time"]:
            durations_minutes_closed.append((open_trade["exit_signal_time"] - open_trade["entry_signal_time"]) / 60000)
        open_trade = None

    if open_trade is not None:
        open_trade["status"] = "open"
        open_trade["exit_reason"] = "open_end_of_data"
        open_trade["mark_price"] = candles_1m[-1]["close"]
        unrealized = _calc_return_pct(open_trade["side"], open_trade["entry_price"], candles_1m[-1]["close"])
        open_trade["unrealized_return_pct"] = round(unrealized, 4) if unrealized is not None else None
        r_unrealized = _calc_r_multiple(open_trade["side"], open_trade["entry_price"], candles_1m[-1]["close"], open_trade["stop_price"])
        open_trade["unrealized_r_multiple"] = round(r_unrealized, 4) if r_unrealized is not None else None
        open_trade["bars_held"] = len(candles_1m) - 1 - open_trade["entry_index"]
        trade_objects.append(open_trade)
        open_count += 1

    total = closed_count
    avg_ret = (sum(closed_returns) / total) if total else 0.0
    med_ret = median(closed_returns) if total else 0.0
    winrate = (wins / total * 100) if total else 0.0
    best = max(closed_returns) if total else 0.0
    worst = min(closed_returns) if total else 0.0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else None
    cumulative = (equity - 1) * 100
    avg_r = (sum(closed_r) / len(closed_r)) if closed_r else None
    med_r = median(closed_r) if closed_r else None
    best_r = max(closed_r) if closed_r else None
    worst_r = min(closed_r) if closed_r else None
    total_r = sum(closed_r) if closed_r else None

    report = {
        "run_id": run_id,
        "created_at": created_at,
        "symbol": symbol,
        "interval": BATCH_REPLAY_INTERVAL,
        "replay_timeframes": ["1m", "5m", "1h"],
        "scan_step_interval": "1m",
        "trades": closed_count + open_count,
        "closed_trades": closed_count,
        "open_trades": open_count,
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
        "min_rr": min_rr,
        "filtered_rr_count": filtered_rr_count,
        "opposite_signal_exit_count": opposite_signal_exit_count,
        "stop_invalidation_count": stop_invalidation_count,
        "average_bars_held_closed": round(sum(bars_held_closed) / len(bars_held_closed), 2) if bars_held_closed else None,
        "average_trade_duration_minutes_closed": round(sum(durations_minutes_closed) / len(durations_minutes_closed), 2) if durations_minutes_closed else None
    }

    Path(report_path).parent.mkdir(parents=True, exist_ok=True)
    Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    Path(trades_path).parent.mkdir(parents=True, exist_ok=True)
    Path(trades_path).write_text(json.dumps(trade_objects, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_backtest_archive(archive_dir, run_id, report, trade_objects)

    print(f"Backtest symbol={symbol} interval={BATCH_REPLAY_INTERVAL} run_id={run_id}")
    for k, v in report.items():
        if k in {"symbol", "interval", "run_id", "created_at", "replay_timeframes", "scan_step_interval"}:
            continue
        print(f"{k}: {v}")
    print(f"trades_saved: {len(trade_objects)}")


if __name__ == "__main__":
    backtest(load_config())
