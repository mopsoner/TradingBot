from __future__ import annotations

from datetime import datetime, timezone

from openclaw.backtesting_manager import BacktestingManager
from openclaw.bot import BotConfig, OpenClawBot
from openclaw.models import Candle, Decision, SignalSetup
from openclaw.risk_manager import RiskManager
from openclaw.session_filter import SessionFilter
from openclaw.trade_journal import TradeJournal


def mk_candles(n: int, base: float = 100.0) -> list[Candle]:
    out: list[Candle] = []
    for i in range(n):
        price = base + i * 0.1
        out.append(
            Candle(
                ts=datetime.now(timezone.utc),
                open=price,
                high=price * 1.01,
                low=price * 0.99,
                close=price * 1.001,
                volume=1000,
            )
        )
    return out


def mk_setup(direction: str = "long") -> SignalSetup:
    if direction == "long":
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

    return SignalSetup(
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


def test_session_filter():
    sf = SessionFilter((7, 20))
    assert sf.is_allowed(datetime(2026, 1, 1, 10, tzinfo=timezone.utc))
    assert not sf.is_allowed(datetime(2026, 1, 1, 2, tzinfo=timezone.utc))


def test_risk_manager_requires_approval():
    rm = RiskManager()
    decision = rm.evaluate(mk_setup("long"), backtest_approved=True, explicit_approval=False)
    assert not decision.approved
    assert decision.reason == "risk_approval_required"


def test_backtesting_report_shape():
    bt = BacktestingManager()
    report = bt.run("BTCUSDT", "1H", mk_candles(120, base=105), mk_setup("short"))
    assert report.symbol == "BTCUSDT"
    assert report.recommendation in {"enable_live", "paper_only", "reject"}


def test_trade_journal_read_recent(tmp_path):
    journal = TradeJournal(path=str(tmp_path / "journal.jsonl"))
    journal.log_decision("ETHUSDT", Decision(status="no_trade", reason="session_filtered"))
    logs = journal.read_recent(limit=10)
    assert len(logs) == 1
    assert logs[0]["symbol"] == "ETHUSDT"


def test_bot_runs_and_outputs_decisions(tmp_path):
    bot = OpenClawBot(BotConfig(mode="research"))
    bot.journal = TradeJournal(path=str(tmp_path / "journal.jsonl"))
    decisions = bot.run_once(risk_approval=False, backtest_approval=False)
    assert set(decisions.keys()) == {"ETHUSDT", "BTCUSDT"}
    assert all(d.status in {"valid_setup", "rejected_setup", "no_trade"} for d in decisions.values())
