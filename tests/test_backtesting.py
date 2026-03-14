from backend.app.services.backtesting import BacktestingEngine


def test_backtesting_metrics() -> None:
    engine = BacktestingEngine()
    metrics = engine.run([1, -1, 2, -0.5])
    assert round(metrics.win_rate, 2) == 0.5
    assert metrics.profit_factor > 1
