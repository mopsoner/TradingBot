from backend.app.services.signal_engine import SetupInput, SignalEngine


def test_sequence_must_be_complete() -> None:
    engine = SignalEngine([0.5, 0.618, 0.705])
    signal = engine.detect(
        SetupInput(
            symbol="BTCUSDT",
            liquidity_zone=True,
            sweep=True,
            spring=True,
            utad=False,
            displacement=True,
            bos=False,
            fib_retracement=0.618,
        )
    )
    assert signal is None


def test_long_sequence_passes() -> None:
    engine = SignalEngine([0.5, 0.618, 0.705])
    signal = engine.detect(
        SetupInput(
            symbol="ETHUSDT",
            liquidity_zone=True,
            sweep=True,
            spring=True,
            utad=False,
            displacement=True,
            bos=True,
            fib_retracement=0.618,
        )
    )
    assert signal == "LONG"
