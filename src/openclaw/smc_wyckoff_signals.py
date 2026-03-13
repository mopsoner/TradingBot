from __future__ import annotations

from .models import Candle, SignalSetup

FIB_LEVELS = [0.5, 0.618, 0.705]


class SmcWyckoffSignalEngine:
    """Signal engine constrained to liquidity/sweep/Spring-UTAD/displacement/BOS/fib only."""

    def detect(self, symbol: str, context: list[Candle], entry: list[Candle], timeframe_context: list[str]) -> SignalSetup:
        if len(entry) < 60 or len(context) < 80:
            return self._invalid(symbol, timeframe_context)

        # Liquidity zones from prior structure (excluding current candle)
        recent_window = entry[-25:-1]
        prior_window = entry[-55:-25]
        prior_low = min(c.low for c in prior_window)
        prior_high = max(c.high for c in prior_window)
        current = entry[-1]

        # Sweep logic
        sweep_below = current.low < prior_low and current.close > prior_low
        sweep_above = current.high > prior_high and current.close < prior_high

        direction = "none"
        pattern = "none"
        sweep_level = 0.0
        liquidity_zone: dict[str, float] = {"low": prior_low, "high": prior_high}

        if sweep_below and not sweep_above:
            direction = "long"
            pattern = "spring"
            sweep_level = current.low
        elif sweep_above and not sweep_below:
            direction = "short"
            pattern = "utad"
            sweep_level = current.high
        else:
            return self._invalid(symbol, timeframe_context)

        # Displacement from impulse body size versus recent median range proxy.
        body = abs(current.close - current.open)
        recent_ranges = [c.high - c.low for c in entry[-15:-1]]
        median_range = sorted(recent_ranges)[len(recent_ranges) // 2]
        displacement = body >= median_range * 1.2

        # BOS logic
        if direction == "long":
            bos_level = max(c.high for c in entry[-12:-1])
            valid_bos = current.close > bos_level
            swing_low = min(c.low for c in entry[-20:])
            fib_low, fib_high = swing_low, bos_level
            stop_loss = min(sweep_level, swing_low) * 0.998
            target = max(c.high for c in context[-40:])
        else:
            bos_level = min(c.low for c in entry[-12:-1])
            valid_bos = current.close < bos_level
            swing_high = max(c.high for c in entry[-20:])
            fib_low, fib_high = bos_level, swing_high
            stop_loss = max(sweep_level, swing_high) * 1.002
            target = min(c.low for c in context[-40:])

        fib_prices = [fib_high - (fib_high - fib_low) * lvl for lvl in FIB_LEVELS]
        zone_min, zone_max = min(fib_prices), max(fib_prices)
        in_fib_zone = zone_min <= current.close <= zone_max

        setup_valid = displacement and valid_bos and in_fib_zone
        confidence = 0.9 if setup_valid else 0.25

        return SignalSetup(
            symbol=symbol,
            timeframe_context=timeframe_context,
            pattern=pattern,
            direction=direction,
            liquidity_zone=liquidity_zone,
            sweep_level=sweep_level,
            displacement=displacement,
            bos_level=bos_level,
            fib_entry_zone={"levels": FIB_LEVELS, "prices": fib_prices},
            entry_zone=[zone_min, zone_max],
            stop_loss=stop_loss,
            targets=[target],
            setup_valid=setup_valid,
            confidence=confidence,
        )

    def _invalid(self, symbol: str, timeframe_context: list[str]) -> SignalSetup:
        return SignalSetup(
            symbol=symbol,
            timeframe_context=timeframe_context,
            pattern="none",
            direction="none",
            liquidity_zone={},
            sweep_level=0.0,
            displacement=False,
            bos_level=0.0,
            fib_entry_zone={},
            entry_zone=[0.0, 0.0],
            stop_loss=0.0,
            targets=[],
            setup_valid=False,
            confidence=0.0,
        )
