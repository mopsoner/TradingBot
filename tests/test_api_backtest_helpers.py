from datetime import datetime, timezone

from backend.app.api.routes import _build_backtest_outcomes, _render_backtest_report
from backend.app.db.models import BacktestResult, MarketCandle


def _candle(ts: str, close: float) -> MarketCandle:
    return MarketCandle(
        timestamp=datetime.fromisoformat(ts).replace(tzinfo=timezone.utc),
        symbol="ETHUSDT",
        timeframe="15m",
        open=close,
        high=close,
        low=close,
        close=close,
        volume=1000,
        source="test",
    )


def test_build_backtest_outcomes_uses_ordered_candle_returns_and_caps_extremes() -> None:
    candles = [
        _candle("2024-01-01T00:30:00", 200.0),
        _candle("2024-01-01T00:00:00", 100.0),
        _candle("2024-01-01T00:15:00", 101.0),
        _candle("2024-01-01T00:45:00", 50.0),
    ]

    outcomes = _build_backtest_outcomes(candles)

    assert outcomes == [1.0, 3.0, -3.0]


def test_render_backtest_report_includes_symbol_strategy_and_horizon() -> None:
    row = BacktestResult(
        symbol="BTCUSDT",
        timeframe="1h",
        strategy_version="swing-v2",
        win_rate=0.53,
        profit_factor=1.67,
        drawdown=0.12,
        expectancy=0.08,
        r_multiple=1.5,
    )

    report = _render_backtest_report(row, horizon_days=90)

    assert "# Backtest Report" in report
    assert "- Symbol: BTCUSDT" in report
    assert "- Strategy: swing-v2" in report
    assert "- Horizon: 90 days" in report
