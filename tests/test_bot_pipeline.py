from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from urllib.error import URLError

import pytest

from openclaw.backtesting_manager import BacktestingManager
from openclaw.bot import BotConfig, OpenClawBot
from openclaw.market_data import MarketDataService, MarketDataUnavailable
from openclaw.models import Candle, Decision, SignalSetup, Trade
from openclaw.paper_trade_manager import PaperTradeManager
from openclaw.risk_manager import RiskManager
from openclaw.session_filter import SessionFilter
from openclaw.trade_execution import TradeExecution
from openclaw.trade_journal import TradeJournal


def mk_candles(n: int, base: float = 100.0) -> list[Candle]:
    out: list[Candle] = []
    for _ in range(n):
        out.append(
            Candle(
                ts=datetime.now(timezone.utc),
                open=base,
                high=base * 1.01,
                low=base * 0.99,
                close=base,
                volume=1000,
            )
        )
    return out


def mk_setup() -> SignalSetup:
    return SignalSetup(
        symbol="ETHUSDT",
        timeframe_context=["4H", "1H"],
        pattern="spring",
        direction="long",
        liquidity_zone={"low": 90, "high": 110},
        sweep_level=90,
        displacement=True,
        bos_level=110,
        fib_entry_zone={"levels": [0.5, 0.618, 0.705], "prices": [100, 98, 96]},
        entry_zone=[97, 101],
        stop_loss=94,
        targets=[110],
        setup_valid=True,
        confidence=0.8,
    )


def test_session_filter():
    sf = SessionFilter((7, 20))
    assert sf.is_allowed(datetime(2026, 1, 1, 10, tzinfo=timezone.utc))
    assert not sf.is_allowed(datetime(2026, 1, 1, 2, tzinfo=timezone.utc))


def test_risk_manager_requires_approval():
    rm = RiskManager()
    decision = rm.evaluate(mk_setup(), backtest_approved=True, explicit_approval=False)
    assert not decision.approved
    assert decision.reason == "risk_approval_required"


def test_backtesting_report_shape():
    bt = BacktestingManager()
    setup = SignalSetup(
        symbol="BTCUSDT",
        timeframe_context=["4H", "1H"],
        pattern="utad",
        direction="short",
        liquidity_zone={"low": 90, "high": 110},
        sweep_level=112,
        displacement=True,
        bos_level=95,
        fib_entry_zone={"levels": [0.5, 0.618, 0.705], "prices": [103, 105, 106]},
        entry_zone=[103, 106],
        stop_loss=111,
        targets=[95],
        setup_valid=True,
        confidence=0.8,
    )
    report = bt.run("BTCUSDT", "1H", mk_candles(220, base=105), setup)
    assert report.symbol == "BTCUSDT"
    assert report.recommendation in {"enable_live", "paper_only", "reject"}
    assert "metrics" in report.results
    assert "walk_forward" in report.results["metrics"]


def test_bot_runs_and_outputs_decisions():
    bot = OpenClawBot(BotConfig(mode="research"))
    decisions = bot.run_once(risk_approval=False, backtest_approval=True)
    assert set(decisions.keys()) == {"ETHUSDT", "BTCUSDT"}
    assert all(d.status in {"valid_setup", "rejected_setup", "no_trade"} for d in decisions.values())


def test_trade_journal_logs_rejected_and_valid_setup(tmp_path):
    path = tmp_path / "journal.jsonl"
    journal = TradeJournal(str(path))
    rejected = mk_setup()
    rejected.setup_valid = False
    journal.log_decision("ETHUSDT", decision=Decision(status="rejected_setup", reason="x", setup=rejected))
    lines = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    assert lines[0]["status"] == "rejected_setup"
    assert lines[0]["setup"]["direction"] == "long"


def test_market_data_uses_binance_payload(monkeypatch):
    service = MarketDataService()

    def fake_fetch_binance_klines(symbol: str, interval: str, limit: int):
        assert symbol == "ETHUSDT"
        assert interval == "1h"
        assert limit == 10
        return [
            [1700000000000, "100", "101", "99", "100.5", "1200", 0],
            [1700003600000, "100.5", "102", "100", "101.5", "1400", 0],
            [1700007200000, "101.5", "103", "101", "102.5", "1600", 0],
        ]

    monkeypatch.setattr(service, "_fetch_binance_klines", fake_fetch_binance_klines)
    candles = service.fetch_ohlcv("ETHUSDT", "1H", 3)
    assert len(candles) == 3
    assert candles[-1].close == 102.5


def test_market_data_raises_when_fallback_disabled(monkeypatch):
    service = MarketDataService()

    def failing_fetch_binance_klines(symbol: str, interval: str, limit: int):
        raise URLError("network down")

    monkeypatch.setattr(service, "_fetch_binance_klines", failing_fetch_binance_klines)
    with pytest.raises(MarketDataUnavailable):
        service.fetch_ohlcv("BTCUSDT", "1H", 20, allow_synthetic_fallback=False)


def test_paper_trade_manager_blocks_second_position_same_symbol():
    manager = PaperTradeManager(db_path="data/test_paper_state.db")
    trade = Trade(
        symbol="ETHUSDT",
        direction="long",
        entry=100,
        stop_loss=95,
        target=110,
        size=1.0,
        mode="paper",
        opened_at=datetime.now(timezone.utc),
    )
    manager.place(trade)
    with pytest.raises(ValueError):
        manager.place(trade)


def test_paper_trade_manager_closes_on_target():
    manager = PaperTradeManager(db_path="data/test_paper_state_2.db")
    trade = Trade(
        symbol="BTCUSDT",
        direction="long",
        entry=100,
        stop_loss=95,
        target=110,
        size=2.0,
        mode="paper",
        opened_at=datetime.now(timezone.utc),
    )
    manager.place(trade)
    reason = manager.update_with_candle("BTCUSDT", Candle(ts=datetime.now(timezone.utc), open=100, high=111, low=99, close=110))
    assert reason == "target"
    assert "BTCUSDT" not in manager.open_positions


def test_trade_execution_requires_live_enable(tmp_path):
    execer = TradeExecution(db_path=str(tmp_path / "exec.db"))
    trade = Trade(
        symbol="ETHUSDT",
        direction="long",
        entry=100,
        stop_loss=95,
        target=110,
        size=1.0,
        mode="live",
        opened_at=datetime.now(timezone.utc),
    )
    os.environ.pop("OPENCLAW_LIVE_ENABLED", None)
    with pytest.raises(PermissionError):
        execer.execute(trade, risk_approved=True, backtest_approved=True)
