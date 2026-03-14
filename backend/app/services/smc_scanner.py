"""
Real SMC/Wyckoff signal scanner.
Reads actual OHLCV candles from the DB and applies the 7-step pipeline
to detect genuine setups — no randomness.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Bar:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class StepResult:
    passed: bool
    detail: str


@dataclass
class SMCSignal:
    timestamp: datetime
    symbol: str
    timeframe: str
    direction: str          # "LONG" | "SHORT"
    entry_price: float
    sl_price: float
    tp_price: float
    rr_ratio: float
    fib_level: float
    wyckoff_event: str      # "Spring" | "UTAD"
    sweep_level: float
    bos_level: float
    steps: list[StepResult] = field(default_factory=list)
    tf_4h_structure: str = ""
    session: str = ""

    @property
    def accepted(self) -> bool:
        return len(self.steps) == 7 and all(s.passed for s in self.steps)


# ─────────────────────────────────────────────────────────────────────────────
# Indicator helpers
# ─────────────────────────────────────────────────────────────────────────────

def _atr(bars: list[Bar], period: int = 14) -> float:
    if len(bars) < period + 1:
        return (bars[-1].high - bars[-1].low) if bars else 0.0
    trs: list[float] = []
    for i in range(1, len(bars)):
        tr = max(
            bars[i].high - bars[i].low,
            abs(bars[i].high - bars[i - 1].close),
            abs(bars[i].low - bars[i - 1].close),
        )
        trs.append(tr)
    recent = trs[-period:]
    return sum(recent) / len(recent)


def _sma_volume(bars: list[Bar], period: int = 20) -> float:
    vols = [b.volume for b in bars[-period:]]
    return sum(vols) / len(vols) if vols else 1.0


def _swing_highs(bars: list[Bar], strength: int = 3) -> list[tuple[int, float]]:
    """Return (index, price) of local swing highs."""
    result: list[tuple[int, float]] = []
    n = len(bars)
    for i in range(strength, n - strength):
        h = bars[i].high
        if all(bars[i - j].high <= h for j in range(1, strength + 1)) and \
           all(bars[i + j].high <= h for j in range(1, strength + 1)):
            result.append((i, h))
    return result


def _swing_lows(bars: list[Bar], strength: int = 3) -> list[tuple[int, float]]:
    """Return (index, price) of local swing lows."""
    result: list[tuple[int, float]] = []
    n = len(bars)
    for i in range(strength, n - strength):
        lo = bars[i].low
        if all(bars[i - j].low >= lo for j in range(1, strength + 1)) and \
           all(bars[i + j].low >= lo for j in range(1, strength + 1)):
            result.append((i, lo))
    return result


def _find_eqh(bars: list[Bar], tolerance: float = 0.002) -> list[float]:
    """Equal Highs — at least 2 swing highs within tolerance%."""
    sh = _swing_highs(bars, strength=3)
    groups: list[list[float]] = []
    for _, h in sh:
        placed = False
        for g in groups:
            if abs(h - g[0]) / g[0] <= tolerance:
                g.append(h)
                placed = True
                break
        if not placed:
            groups.append([h])
    return [sum(g) / len(g) for g in groups if len(g) >= 2]


def _find_eql(bars: list[Bar], tolerance: float = 0.002) -> list[float]:
    """Equal Lows — at least 2 swing lows within tolerance%."""
    sl = _swing_lows(bars, strength=3)
    groups: list[list[float]] = []
    for _, lo in sl:
        placed = False
        for g in groups:
            if abs(lo - g[0]) / g[0] <= tolerance:
                g.append(lo)
                placed = True
                break
        if not placed:
            groups.append([lo])
    return [sum(g) / len(g) for g in groups if len(g) >= 2]


def _detect_sweep(bars: list[Bar], level: float, direction: str, lookback: int = 8) -> Optional[int]:
    """
    Detect a sweep (wick beyond level, close back on opposite side).
    direction = "above" → sweep of resistance (for UTAD/EQH)
    direction = "below" → sweep of support (for Spring/EQL)
    Returns the index of the sweep candle or None.
    """
    recent = bars[-lookback:]
    for i, b in enumerate(recent):
        if direction == "above":
            if b.high > level * 1.001 and b.close < level:
                return len(bars) - lookback + i
        else:  # below
            if b.low < level * 0.999 and b.close > level:
                return len(bars) - lookback + i
    return None


def _tf4h_structure(bars_4h: list[Bar], n: int = 20) -> str:
    """Simple 4H structure: compare last N closes to determine trend."""
    if len(bars_4h) < n:
        return "Neutre"
    recent = bars_4h[-n:]
    highs = [b.high for b in recent]
    lows = [b.low for b in recent]
    # Higher highs + higher lows = Bullish
    if highs[-1] > highs[0] and lows[-1] > lows[0]:
        return "Bullish"
    if highs[-1] < highs[0] and lows[-1] < lows[0]:
        return "Bearish"
    return "Neutre"


# ─────────────────────────────────────────────────────────────────────────────
# Main scanner
# ─────────────────────────────────────────────────────────────────────────────

class SMCScanner:
    """
    Sliding-window SMC/Wyckoff scanner.
    Uses real OHLCV bars — no randomness.
    """

    def __init__(
        self,
        *,
        disp_threshold: float = 0.55,
        atr_min: float = 1.2,
        bos_sensitivity: int = 7,
        bos_close_conf: bool = True,
        fib_levels: list[float] | None = None,
        fib_split: bool = True,
        htf_required: bool = True,
        vol_adaptive: bool = True,
        vol_mult_active: float = 1.8,
        vol_mult_off: float = 1.25,
        allow_weekend: bool = False,
        risk_per_trade: float = 0.01,
        tp_rr: float = 2.5,
        stop_logic: str = "structure",
        window: int = 80,
    ) -> None:
        self.disp_threshold = disp_threshold
        self.atr_min = atr_min
        self.bos_sensitivity = bos_sensitivity
        self.bos_close_conf = bos_close_conf
        self.fib_levels = fib_levels or [0.5, 0.618, 0.786]
        self.fib_split = fib_split
        self.htf_required = htf_required
        self.vol_adaptive = vol_adaptive
        self.vol_mult_active = vol_mult_active
        self.vol_mult_off = vol_mult_off
        self.allow_weekend = allow_weekend
        self.risk_per_trade = risk_per_trade
        self.tp_rr = tp_rr
        self.stop_logic = stop_logic
        self.window = window

    def scan(
        self,
        bars_1h: list[Bar],
        bars_4h: list[Bar],
        step_bars: int = 4,
    ) -> list[SMCSignal]:
        """
        Run full 7-step SMC/Wyckoff scan on 1H bars with 4H HTF structure.
        step_bars: advance by N bars between each window check (controls density).
        """
        signals: list[SMCSignal] = []
        n = len(bars_1h)
        last_signal_idx = -50  # minimum spacing between signals

        for end in range(self.window, n, step_bars):
            if end - last_signal_idx < 24:
                continue

            window = bars_1h[end - self.window: end]
            current = bars_1h[end - 1]

            # Weekend filter
            if not self.allow_weekend and current.timestamp.weekday() >= 5:
                continue

            # ── 4H HTF structure ────────────────────────────────────────────
            # Map 1H index to 4H index
            cutoff = current.timestamp
            bars_4h_slice = [b for b in bars_4h if b.timestamp <= cutoff][-40:]
            tf4h = _tf4h_structure(bars_4h_slice)

            # ── Step 1: Zone de liquidité ────────────────────────────────────
            eqh_levels = _find_eqh(window)
            eql_levels = _find_eql(window)
            has_liq = bool(eqh_levels or eql_levels)
            step1 = StepResult(
                has_liq,
                f"EQH: {[round(l, 2) for l in eqh_levels[:2]]} | EQL: {[round(l, 2) for l in eql_levels[:2]]}"
                if has_liq else "Aucune zone EQH/EQL"
            )
            if not step1.passed:
                continue

            # Try both directions
            for direction, sweep_level in self._candidate_setups(eqh_levels, eql_levels, current, tf4h):
                sig = self._evaluate_setup(
                    window, current, direction, sweep_level, tf4h, step1,
                    bars_4h_slice, end
                )
                if sig and sig.accepted:
                    signals.append(sig)
                    last_signal_idx = end
                    break  # One signal per window

        logger.info("SMCScanner: %d signals found in %d bars", len(signals), len(bars_1h))
        return signals

    def _candidate_setups(
        self,
        eqh: list[float],
        eql: list[float],
        current: Bar,
        tf4h: str,
    ) -> list[tuple[str, float]]:
        """Return (direction, sweep_level) candidates filtered by HTF."""
        candidates: list[tuple[str, float]] = []
        price = current.close

        # LONG candidates (EQL sweep → Spring)
        if tf4h != "Bearish" or not self.htf_required:
            for lvl in eql:
                if price > lvl * 0.998:  # price currently above the level (after sweep)
                    candidates.append(("LONG", lvl))

        # SHORT candidates (EQH sweep → UTAD)
        if tf4h != "Bullish" or not self.htf_required:
            for lvl in eqh:
                if price < lvl * 1.002:
                    candidates.append(("SHORT", lvl))

        return candidates[:2]

    def _evaluate_setup(
        self,
        window: list[Bar],
        current: Bar,
        direction: str,
        sweep_level: float,
        tf4h: str,
        step1: StepResult,
        bars_4h: list[Bar],
        end_idx: int,
    ) -> Optional[SMCSignal]:
        steps: list[StepResult] = [step1]

        # ── Step 2: Sweep ────────────────────────────────────────────────────
        sweep_dir = "below" if direction == "LONG" else "above"
        sweep_idx = _detect_sweep(window, sweep_level, sweep_dir, lookback=12)
        step2 = StepResult(
            sweep_idx is not None,
            f"Sweep {'EQL' if direction == 'LONG' else 'EQH'} @ {sweep_level:.2f}" if sweep_idx else "Pas de sweep"
        )
        steps.append(step2)
        if not step2.passed:
            return None

        # ── Step 3: Spring/UTAD ──────────────────────────────────────────────
        wyckoff_ok = False
        wyckoff_event = ""
        post_sweep = window[sweep_idx:] if sweep_idx else window[-10:]
        if direction == "LONG" and len(post_sweep) >= 2:
            # Spring: candle whose low < sweep_level but closes above
            for b in post_sweep:
                if b.low < sweep_level and b.close > sweep_level:
                    wyckoff_ok = True
                    wyckoff_event = "Spring"
                    break
        elif direction == "SHORT" and len(post_sweep) >= 2:
            for b in post_sweep:
                if b.high > sweep_level and b.close < sweep_level:
                    wyckoff_ok = True
                    wyckoff_event = "UTAD"
                    break

        step3 = StepResult(wyckoff_ok, f"{wyckoff_event} détecté" if wyckoff_ok else f"{'Spring' if direction == 'LONG' else 'UTAD'} absent")
        steps.append(step3)
        if not step3.passed:
            return None

        # ── Step 4: Displacement (ATR-adaptatif) ─────────────────────────────
        atr = _atr(window)
        vol_sma = _sma_volume(window)
        disp_bar: Optional[Bar] = None
        disp_start_price: float = 0.0
        disp_end_price: float = 0.0

        for b in post_sweep:
            bar_range = b.high - b.low
            is_impulsive_long = direction == "LONG" and b.close > b.open and bar_range >= atr * self.atr_min
            is_impulsive_short = direction == "SHORT" and b.close < b.open and bar_range >= atr * self.atr_min
            vol_ok = b.volume >= vol_sma * 1.2
            if (is_impulsive_long or is_impulsive_short) and vol_ok:
                disp_bar = b
                disp_start_price = b.low if direction == "LONG" else b.high
                disp_end_price = b.high if direction == "LONG" else b.low
                break

        step4 = StepResult(
            disp_bar is not None,
            f"Displacement {bar_range:.2f} vs ATR {atr:.2f} (×{bar_range / atr:.1f})" if disp_bar else f"Displacement absent (ATR={atr:.2f})"
        )
        steps.append(step4)
        if not step4.passed:
            return None

        # ── Step 5: BOS (Break of Structure) ────────────────────────────────
        swing_str = max(1, 10 - self.bos_sensitivity)  # lower bos_sens = more sensitive
        bos_level: float = 0.0
        bos_ok = False

        if direction == "LONG":
            shs = _swing_highs(window, strength=swing_str)
            if shs:
                bos_level = shs[-1][1]  # most recent swing high
                # Close above it
                for b in post_sweep:
                    if self.bos_close_conf:
                        if b.close > bos_level:
                            bos_ok = True
                            break
                    else:
                        if b.high > bos_level:
                            bos_ok = True
                            break
        else:
            sls = _swing_lows(window, strength=swing_str)
            if sls:
                bos_level = sls[-1][1]
                for b in post_sweep:
                    if self.bos_close_conf:
                        if b.close < bos_level:
                            bos_ok = True
                            break
                    else:
                        if b.low < bos_level:
                            bos_ok = True
                            break

        step5 = StepResult(
            bos_ok,
            f"BOS @ {bos_level:.2f} ({'clôture' if self.bos_close_conf else 'wick'})" if bos_ok else f"BOS absent (target={bos_level:.2f})"
        )
        steps.append(step5)
        if not step5.passed:
            return None

        # ── Step 6: Expansion ────────────────────────────────────────────────
        expansion_ok = False
        post_bos = [b for b in post_sweep if (direction == "LONG" and b.close > bos_level) or
                    (direction == "SHORT" and b.close < bos_level)]
        if len(post_bos) >= 1:
            if direction == "LONG":
                expansion_ok = post_bos[-1].close > post_bos[0].open
            else:
                expansion_ok = post_bos[-1].close < post_bos[0].open

        step6 = StepResult(
            expansion_ok,
            f"Expansion {'haussière' if direction == 'LONG' else 'baissière'} confirmée ({len(post_bos)} bougies)" if expansion_ok else "Expansion absente"
        )
        steps.append(step6)
        if not step6.passed:
            return None

        # ── Step 7: Fibonacci retracement ────────────────────────────────────
        move_high = max(b.high for b in post_sweep) if post_sweep else current.high
        move_low = min(b.low for b in post_sweep) if post_sweep else current.low
        move_range = move_high - move_low
        if move_range < 1e-10:
            return None

        fib_level_used: float = 0.0
        fib_entry: float = 0.0
        fib_ok = False

        current_price = current.close
        for fl in sorted(self.fib_levels):
            if direction == "LONG":
                fib_price = move_high - fl * move_range
                if current_price <= fib_price * 1.005:  # price near or below fib level
                    fib_level_used = fl
                    fib_entry = fib_price
                    fib_ok = True
                    break
            else:
                fib_price = move_low + fl * move_range
                if current_price >= fib_price * 0.995:
                    fib_level_used = fl
                    fib_entry = fib_price
                    fib_ok = True
                    break

        if not fib_ok:
            # Check if price is near any fib level (within 1.5%)
            for fl in self.fib_levels:
                if direction == "LONG":
                    fib_price = move_high - fl * move_range
                    if abs(current_price - fib_price) / fib_price <= 0.015:
                        fib_level_used = fl
                        fib_entry = fib_price
                        fib_ok = True
                        break
                else:
                    fib_price = move_low + fl * move_range
                    if abs(current_price - fib_price) / fib_price <= 0.015:
                        fib_level_used = fl
                        fib_entry = fib_price
                        fib_ok = True
                        break

        step7 = StepResult(
            fib_ok,
            f"Fib {fib_level_used:.3f} @ {fib_entry:.2f}" if fib_ok else f"Prix hors zone Fib ({', '.join(str(f) for f in self.fib_levels)})"
        )
        steps.append(step7)
        if not step7.passed:
            return None

        # ── Entry / SL / TP ──────────────────────────────────────────────────
        entry = fib_entry
        if self.stop_logic == "structure":
            if direction == "LONG":
                sl = min(b.low for b in post_sweep) - atr * 0.3
            else:
                sl = max(b.high for b in post_sweep) + atr * 0.3
        elif self.stop_logic == "atr":
            sl = entry - atr * 1.5 if direction == "LONG" else entry + atr * 1.5
        else:  # fixed
            sl = entry * (0.98 if direction == "LONG" else 1.02)

        risk = abs(entry - sl)
        tp = entry + risk * self.tp_rr if direction == "LONG" else entry - risk * self.tp_rr
        rr = self.tp_rr

        return SMCSignal(
            timestamp=current.timestamp,
            symbol="ETHUSDT",
            timeframe="1h",
            direction=direction,
            entry_price=round(entry, 4),
            sl_price=round(sl, 4),
            tp_price=round(tp, 4),
            rr_ratio=rr,
            fib_level=fib_level_used,
            wyckoff_event=wyckoff_event,
            sweep_level=round(sweep_level, 4),
            bos_level=round(bos_level, 4),
            steps=steps,
            tf_4h_structure=tf4h,
            session="London" if 7 <= current.timestamp.hour < 11 else
                     "New York" if 13 <= current.timestamp.hour < 17 else
                     "Asia" if 0 <= current.timestamp.hour < 6 else "Off-session",
        )
