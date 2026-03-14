from backend.app.services.backtesting import BacktestingEngine
from backend.app.services.risk_manager import RiskManager, RiskState
from backend.app.services.signal_engine import SetupInput, SignalEngine


def test_pipeline_happy_path() -> None:
    signal_engine = SignalEngine([0.5, 0.618, 0.705])
    risk_manager = RiskManager(0.01, 5, 0.03, 0.08)
    side = signal_engine.detect(
        SetupInput(
            symbol="BTCUSDT",
            liquidity_zone=True,
            sweep=True,
            spring=True,
            utad=False,
            displacement=True,
            bos=True,
            fib_retracement=0.5,
        )
    )
    approved, _ = risk_manager.approve(RiskState(open_positions=1, daily_loss=0, weekly_loss=0))
    assert side == "LONG"
    assert approved


def test_backtesting_engine_pipeline() -> None:
    metrics = BacktestingEngine().run([1, -1, 1.2, 0.7, -0.4])
    assert metrics.profit_factor > 1
