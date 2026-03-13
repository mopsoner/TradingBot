from __future__ import annotations

from .models import Candle, SignalSetup

FIB_LEVELS = [0.5, 0.618, 0.705]


class SmcWyckoffSignalEngine:
    """Strict SMC/Wyckoff detector with fib retracement filtering."""

    def detect(self, symbol: str, context: list[Candle], entry: list[Candle], timeframe_context: list[str]) -> SignalSetup:
        if len(context) < 60 or len(entry) < 60:
            return self._invalid(symbol, timeframe_context)

        last = entry[-1]
        lookback = entry[-40:]
        recent = entry[-20:]

        recent_low = min(c.low for c in recent)
        recent_high = max(c.high for c in recent)
        prior_low = min(c.low for c in lookback[:-5])
        prior_high = max(c.high for c in lookback[:-5])

        swept_below = recent_low < prior_low
        swept_above = recent_high > prior_high

        long_spring = swept_below and last.close > prior_low and last.close > last.open
        short_utad = swept_above and last.close < prior_high and last.close < last.open

        direction = "none"
        pattern = "none"
        if long_spring:
            direction, pattern = "long", "spring"
        elif short_utad:
            direction, pattern = "short", "utad"
        else:
            return self._invalid(symbol, timeframe_context)

        impulse_ref = entry[-8]
        displacement = abs(last.close - impulse_ref.close) / impulse_ref.close >= 0.004

        if direction == "long":
            bos_level = max(c.high for c in entry[-12:-1])
            valid_bos = last.close > bos_level
            fib_low, fib_high = min(c.low for c in entry[-12:]), bos_level
            sweep_level = recent_low
            stop = min(recent_low, fib_low) * 0.998
            target = max(c.high for c in context[-80:])
            liquidity_zone = {"side": "buy-side", "low": prior_low, "high": prior_high}
        else:
            bos_level = min(c.low for c in entry[-12:-1])
            valid_bos = last.close < bos_level
            fib_low, fib_high = bos_level, max(c.high for c in entry[-12:])
            sweep_level = recent_high
            stop = max(recent_high, fib_high) * 1.002
            target = min(c.low for c in context[-80:])
            liquidity_zone = {"side": "sell-side", "low": prior_low, "high": prior_high}

        fib_entries = [fib_high - (fib_high - fib_low) * level for level in FIB_LEVELS]
        zone_min, zone_max = min(fib_entries), max(fib_entries)
        in_fib_zone = zone_min <= last.close <= zone_max

        valid = all([displacement, valid_bos, in_fib_zone])
        confidence = 0.9 if valid else 0.25

        return SignalSetup(
            symbol=symbol,
            timeframe_context=timeframe_context,
            pattern=pattern,
            direction=direction,
            liquidity_zone=liquidity_zone,
            sweep_level=sweep_level,
            displacement=displacement,
            bos_level=bos_level,
            fib_entry_zone={"levels": FIB_LEVELS, "prices": fib_entries},
            entry_zone=[zone_min, zone_max],
            stop_loss=stop,
            targets=[target],
            setup_valid=valid,
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
