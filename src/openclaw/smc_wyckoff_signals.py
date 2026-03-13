from __future__ import annotations

from .models import Candle, SignalSetup


FIB_LEVELS = [0.5, 0.618, 0.705]


class SmcWyckoffSignalEngine:
    def detect(self, symbol: str, context: list[Candle], entry: list[Candle], timeframe_context: list[str]) -> SignalSetup:
        if len(entry) < 40:
            return self._invalid(symbol, timeframe_context)

        recent = entry[-30:]
        prior = entry[-35:-5]
        recent_low = min(c.low for c in recent)
        recent_high = max(c.high for c in recent)
        prior_low = min(c.low for c in prior)
        prior_high = max(c.high for c in prior)
        last = entry[-1]

        long_sweep = recent_low < prior_low and last.close > recent_low
        short_sweep = recent_high > prior_high and last.close < recent_high
        direction = "long" if long_sweep else "short" if short_sweep else "none"
        pattern = "spring" if direction == "long" else "utad" if direction == "short" else "none"

        swing_low = min(c.low for c in entry[-20:])
        swing_high = max(c.high for c in entry[-20:])
        displacement = abs(last.close - entry[-5].close) / entry[-5].close > 0.003

        if direction == "long":
            bos_level = max(c.high for c in entry[-10:-1])
            valid_bos = last.close > bos_level
            fib_low, fib_high = swing_low, bos_level
            stop = min(recent_low, swing_low) * 0.998
            target = max(c.high for c in context[-50:])
        elif direction == "short":
            bos_level = min(c.low for c in entry[-10:-1])
            valid_bos = last.close < bos_level
            fib_low, fib_high = bos_level, swing_high
            stop = max(recent_high, swing_high) * 1.002
            target = min(c.low for c in context[-50:])
        else:
            return self._invalid(symbol, timeframe_context)

        fib_entries = [fib_high - (fib_high - fib_low) * lvl for lvl in FIB_LEVELS]
        zone_min, zone_max = min(fib_entries), max(fib_entries)
        entry_price = last.close
        in_fib_zone = zone_min <= entry_price <= zone_max

        valid = displacement and valid_bos and in_fib_zone
        confidence = 0.9 if valid else 0.35

        return SignalSetup(
            symbol=symbol,
            timeframe_context=timeframe_context,
            pattern=pattern,
            direction=direction,
            liquidity_zone={"low": recent_low, "high": recent_high},
            sweep_level=recent_low if direction == "long" else recent_high,
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
