"""
Technical Analysis Engine — SMC/Wyckoff real candle computations.
Replaces all random-number simulation in the pipeline with real OHLCV analysis.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional


# ── Low-level primitives ──────────────────────────────────────────────────────

def atr(candles: list, period: int = 14) -> float:
    """Average True Range."""
    if len(candles) < 2:
        return max((candles[0].high - candles[0].low) if candles else 1.0, 1e-9)
    trs = []
    for i in range(1, len(candles)):
        tr = max(
            candles[i].high - candles[i].low,
            abs(candles[i].high - candles[i - 1].close),
            abs(candles[i].low  - candles[i - 1].close),
        )
        trs.append(tr)
    subset = trs[-period:] if len(trs) >= period else trs
    return max(sum(subset) / len(subset), 1e-9)


def sma(values: list[float], period: int) -> float:
    """Simple moving average of last `period` values."""
    subset = values[-period:] if len(values) >= period else values
    return sum(subset) / len(subset) if subset else 0.0


def swing_highs_lows(candles: list, n: int = 3) -> tuple[list, list]:
    """
    Identify pivot swing highs/lows using n-bar left+right confirmation.
    Returns (highs, lows) as lists of candle objects.
    """
    highs, lows = [], []
    for i in range(n, len(candles) - n):
        if all(candles[i].high >= candles[j].high for j in range(i - n, i + n + 1) if j != i):
            highs.append(candles[i])
        if all(candles[i].low <= candles[j].low for j in range(i - n, i + n + 1) if j != i):
            lows.append(candles[i])
    return highs, lows


# ── Step 0 (pre-flight): 4H structure ────────────────────────────────────────

def detect_structure(candles_4h: list) -> str:
    """
    HH+HL  → "Bullish"
    LH+LL  → "Bearish"
    else   → "Neutre / Range"
    Requires at least 10 candles; returns "Neutre / Range" if insufficient.
    """
    if len(candles_4h) < 10:
        return "Neutre / Range"

    highs, lows = swing_highs_lows(candles_4h, n=3)

    if len(highs) >= 2 and len(lows) >= 2:
        hh = highs[-1].high > highs[-2].high
        hl = lows[-1].low  > lows[-2].low
        lh = highs[-1].high < highs[-2].high
        ll = lows[-1].low  < lows[-2].low
        if hh and hl:
            return "Bullish"
        if lh and ll:
            return "Bearish"

    # Fallback: compare last close to 20-period SMA
    closes = [c.close for c in candles_4h]
    ema20  = sma(closes, 20)
    last   = closes[-1]
    if last > ema20 * 1.005:
        return "Bullish"
    if last < ema20 * 0.995:
        return "Bearish"
    return "Neutre / Range"


# ── Step 0 (pre-flight): 1H HTF alignment ────────────────────────────────────

def validate_htf_1h(candles_1h: list, structure_4h: str) -> bool:
    """
    Returns True if 1H price action aligns with the 4H structure.
    Alignment = last close above SMA20 (Bullish) or below SMA20 (Bearish).
    """
    if not candles_1h or structure_4h == "Neutre / Range":
        return False
    closes = [c.close for c in candles_1h]
    ema20  = sma(closes, 20)
    last   = closes[-1]
    if structure_4h == "Bullish":
        return last > ema20
    if structure_4h == "Bearish":
        return last < ema20
    return False


# ── Step 0: Liquidity zone (Equal Highs / Equal Lows / HOD / LOD) ────────────

def detect_liquidity_zone(
    candles_4h: list,
    require_eqhl: bool = True,
    lookback: int = 540,
    tolerance: float = 0.005,
) -> tuple[str, float, bool]:
    """
    Détecte une zone de liquidité (Equal Highs / Equal Lows) sur le 4H.
    Remonte jusqu'à `lookback` bougies 4H en arrière (défaut 540 = ~3 mois).

    Returns (zone_type, zone_price, is_high_zone).
    - require_eqhl=True  : strict Wyckoff — rejette si aucun cluster EQH/EQL trouvé.
    - require_eqhl=False : fallback sur HOD/LOD si aucun cluster trouvé.
    - tolerance          : écart max entre deux pivots pour être considérés "égaux" (défaut 0.3 %).
    """
    if not candles_4h:
        return "LOD", 0.0, False

    recent = candles_4h[-lookback:]
    # n s'adapte à la taille de la fenêtre : n=2 standard, n=1 si fenêtre très courte (<7 bars)
    _n = 2 if len(recent) >= 7 else 1
    highs, lows = swing_highs_lows(recent, n=_n) if len(recent) >= 3 else ([], [])

    # Equal Highs — cherche le cluster le plus récent dans tout le lookback
    if len(highs) >= 2:
        for i in range(len(highs) - 2, -1, -1):
            ratio = abs(highs[-1].high - highs[i].high) / max(highs[i].high, 1e-9)
            if ratio <= tolerance:
                zone_price = (highs[-1].high + highs[i].high) / 2
                return "Equal Highs", round(zone_price, 6), True

    # Equal Lows
    if len(lows) >= 2:
        for i in range(len(lows) - 2, -1, -1):
            ratio = abs(lows[-1].low - lows[i].low) / max(lows[i].low, 1e-9)
            if ratio <= tolerance:
                zone_price = (lows[-1].low + lows[i].low) / 2
                return "Equal Lows", round(zone_price, 6), False

    # Aucun cluster EQH/EQL trouvé
    if require_eqhl:
        return "None", 0.0, False

    # HOD / LOD fallback (mode permissif uniquement)
    last = recent[-1]
    hod_c = max(recent, key=lambda c: c.high)
    lod_c = min(recent, key=lambda c: c.low)

    if abs(last.close - hod_c.high) < abs(last.close - lod_c.low):
        return "HOD", round(hod_c.high, 6), True
    return "LOD", round(lod_c.low, 6), False


def detect_target_liquidity(
    candles_15m: list,
    direction: str,
    entry_price: float,
    sl_distance: float = 0.0,
    rr_ratio: float = 2.0,
    tolerance: float = 0.004,
    min_cluster: int = 2,
    lookback: int = 200,
) -> tuple[float, bool, str]:
    """
    Cherche la zone de liquidité CIBLE distante : cluster EQH (LONG) ou EQL (SHORT)
    situé AU-DELÀ du TP RR-based courant — pour étendre le TP vers la vraie liquidité.

    Logique SMC :
      - LONG  (Spring) : EQH AU-DELÀ de entry + sl_distance × rr_ratio
      - SHORT (UTAD)   : EQL EN-DEÇÀ de entry − sl_distance × rr_ratio

    Si sl_distance = 0, la distance minimum = 1.0 % de l'entry (fallback permissif).

    Paramètres :
      sl_distance : distance SL depuis l'entry (en prix) — sert à calculer le seuil min
      rr_ratio    : RR minimum configuré — le cluster doit être au-delà de ce niveau
      tolerance   : tolérance de regroupement des pivots (0.4 % par défaut)
      min_cluster : minimum de pivots pour valider un cluster (2)
      lookback    : bougies analysées (200 = ~50h sur 15m)

    Retourne (price, found, label).
    """
    if len(candles_15m) < 10 or entry_price <= 0:
        return 0.0, False, "no_data"

    # Seuil minimum : le cluster doit être au-delà du TP RR-based actuel
    if sl_distance > 0:
        min_dist = sl_distance * rr_ratio
    else:
        min_dist = entry_price * 0.01  # fallback 1 %

    window = candles_15m[-lookback:] if len(candles_15m) > lookback else candles_15m
    highs, lows = swing_highs_lows(window, n=2)

    if direction == "LONG":
        # Chercher uniquement AU-DELÀ du TP RR-based (plus loin que min_dist)
        min_price = entry_price + min_dist
        candidates = [c.high for c in highs if c.high > min_price]
        if len(candidates) < min_cluster:
            return 0.0, False, "no_eqh_beyond_rr"

        # Trier du plus proche au plus loin
        candidates.sort()

        for i in range(len(candidates)):
            cluster = [candidates[i]]
            for j in range(i + 1, len(candidates)):
                if abs(candidates[j] - candidates[i]) / candidates[i] <= tolerance:
                    cluster.append(candidates[j])
            if len(cluster) >= min_cluster:
                price = round(sum(cluster) / len(cluster), 6)
                dist_r = (price - entry_price) / sl_distance if sl_distance > 0 else 0
                return price, True, f"EQH @ {price:.4f} ({dist_r:.1f}R, {len(cluster)} pivots)"

        return 0.0, False, "no_eqh_cluster_beyond_rr"

    else:
        # Chercher uniquement EN-DEÇÀ du TP RR-based
        max_price = entry_price - min_dist
        candidates = [c.low for c in lows if c.low < max_price]
        if len(candidates) < min_cluster:
            return 0.0, False, "no_eql_beyond_rr"

        candidates.sort(reverse=True)

        for i in range(len(candidates)):
            cluster = [candidates[i]]
            for j in range(i + 1, len(candidates)):
                if abs(candidates[i] - candidates[j]) / candidates[i] <= tolerance:
                    cluster.append(candidates[j])
            if len(cluster) >= min_cluster:
                price = round(sum(cluster) / len(cluster), 6)
                dist_r = (entry_price - price) / sl_distance if sl_distance > 0 else 0
                return price, True, f"EQL @ {price:.4f} ({dist_r:.1f}R, {len(cluster)} pivots)"

        return 0.0, False, "no_eql_cluster_beyond_rr"


# ── Step 1: Sweep detection ───────────────────────────────────────────────────

def detect_sweep(candles_15m: list, zone_price: float, is_high_zone: bool) -> tuple[bool, float]:
    """
    True if a recent candle swept the zone (wick beyond zone, close back inside).
    Returns (sweep_ok, actual_sweep_price).
    Looks back up to 12 candles (3 h on 15m TF) for a sweep event.
    """
    if not candles_15m:
        return False, zone_price

    for c in reversed(candles_15m[-12:]):
        if is_high_zone:
            if c.high >= zone_price * 0.995 and c.close < zone_price:
                return True, round(c.high, 6)
        else:
            if c.low <= zone_price * 1.005 and c.close > zone_price:
                return True, round(c.low, 6)

    return False, zone_price


# ── Step 2: Spring / UTAD (Wyckoff events) ───────────────────────────────────

def detect_wyckoff(
    candles_15m: list,
    structure_4h: str,
    enable_spring: bool = True,
    enable_utad: bool = True,
    lookback: int = 5,
) -> tuple[bool, bool, Optional[str], str]:
    """
    Returns (spring, utad, direction, wyckoff_event).
    Spring → bullish (LONG), UTAD → bearish (SHORT).
    `lookback` controls how many recent candles are scanned for the event
    (live=5, backtest=20 for a wider detection window).
    """
    if len(candles_15m) < 6:
        return False, False, None, "Aucun"

    # Reference window for swing detection
    ref_window = max(lookback + 5, 20)
    reference  = candles_15m[-ref_window:]
    highs, lows = swing_highs_lows(reference, n=1) if len(reference) >= 5 else ([], [])

    # Scan the last `lookback` candles for a Spring or UTAD event
    for last in reversed(candles_15m[-lookback:]):
        if enable_spring and structure_4h in ("Bullish", "Neutre / Range") and lows:
            ref_low = lows[-1].low
            if last.low < ref_low and last.close > ref_low:
                return True, False, "LONG", "Spring bullish"

        if enable_utad and structure_4h in ("Bearish", "Neutre / Range") and highs:
            ref_high = highs[-1].high
            if last.high > ref_high and last.close < ref_high:
                return False, True, "SHORT", "UTAD bearish"

    return False, False, None, "Aucun"


# ── Step 3: Displacement (ATR-adaptive) ──────────────────────────────────────

def detect_displacement(
    candles_15m: list,
    direction: str,
    disp_threshold: float = 0.40,
    atr_min: float = 0.75,
    vol_min: float = 1.3,
) -> tuple[bool, float, float, float]:
    """
    Returns (ok, disp_val, atr_ratio, vol_ratio).
    Scans the last 3 candles — displacement may lead by 1-2 bars.
    disp_val  = candle range / ATR capped at 1.0
    atr_ratio = candle range / ATR(14)
    vol_ratio = candle volume / SMA20(volume)
    """
    if len(candles_15m) < 5:
        return False, 0.0, 0.0, 1.0

    atr_val = atr(candles_15m, 14)
    vols    = [c.volume for c in candles_15m]
    vol_sma = sma(vols[:-1], 20) if len(vols) > 1 else vols[0]

    best: tuple[bool, float, float, float] | None = None

    for last in reversed(candles_15m[-3:]):
        candle_range = last.high - last.low
        atr_ratio    = round(candle_range / max(atr_val, 1e-9), 2)
        vol_ratio    = round(last.volume / max(vol_sma, 1e-9), 2)
        disp_val     = round(min(atr_ratio / 2.0, 1.0), 2)
        atr_ok       = atr_ratio >= atr_min
        vol_ok       = vol_ratio >= vol_min
        ok           = disp_val >= disp_threshold and atr_ok and vol_ok
        if ok:
            return True, disp_val, atr_ratio, vol_ratio
        if best is None:
            best = (False, disp_val, atr_ratio, vol_ratio)

    return best if best is not None else (False, 0.0, 0.0, 1.0)


# ── Step 4: BOS (Break of Structure) ─────────────────────────────────────────

def detect_bos(
    candles_15m: list,
    direction: str,
    bos_sens: int = 7,
    close_confirmation: bool = True,
) -> tuple[bool, float]:
    """
    Returns (bos_ok, bos_level).
    Higher sensitivity → shorter lookback (easier to trigger BOS).
    bos_level is the swing level that was broken.
    Scans the last 5 candles: BOS may have occurred a few bars before the current candle.
    """
    if len(candles_15m) < 5:
        return False, candles_15m[-1].close if candles_15m else 0.0

    # Sensitivity 3 → lookback 22, sensitivity 10 → lookback 8
    lookback = max(8, 25 - int(bos_sens * 1.7))
    lookback = min(lookback, len(candles_15m) - 4)

    # Scan last 5 candles — BOS could have been confirmed a few bars ago
    for offset in range(5):
        idx     = len(candles_15m) - 1 - offset        # current candidate
        end_idx = idx + 1
        start   = max(0, end_idx - lookback - 1)
        prev    = candles_15m[start:idx]
        if not prev:
            continue
        current = candles_15m[idx]
        if direction == "LONG":
            level  = max(c.high for c in prev)
            bos_ok = (current.close > level) if close_confirmation else (current.high > level)
        else:
            level  = min(c.low for c in prev)
            bos_ok = (current.close < level) if close_confirmation else (current.low < level)
        if bos_ok:
            return True, round(level, 6)

    # Return reference level from latest context
    ref = candles_15m[-lookback - 1:-1] if len(candles_15m) > lookback + 1 else candles_15m[:-1]
    if direction == "LONG":
        level = max(c.high for c in ref) if ref else candles_15m[-1].close
    else:
        level = min(c.low  for c in ref) if ref else candles_15m[-1].close
    return False, round(level, 6)


# ── Step 5 (pre): Volume ─────────────────────────────────────────────────────

def detect_volume(candles_15m: list, vol_mult: float = 1.8) -> tuple[bool, float]:
    """
    Returns (vol_ok, vol_ratio).
    vol_ratio = last candle volume / SMA20(volume, excluding last candle).
    """
    if not candles_15m:
        return True, 1.0

    vols      = [c.volume for c in candles_15m]
    vol_sma   = sma(vols[:-1], 20) if len(vols) > 1 else vols[0]
    vol_ratio = round(candles_15m[-1].volume / max(vol_sma, 1e-9), 2)
    return vol_ratio >= vol_mult, vol_ratio


# ── Step 5: Expansion toward next liquidity ──────────────────────────────────

def detect_expansion(candles_15m: list, direction: str) -> tuple[bool, str]:
    """
    Returns (expansion_ok, next_liq_label).
    Expansion = current candle range ≥ 0.8×ATR and close confirms direction.
    """
    if len(candles_15m) < 5:
        return True, "N/A"

    atr_val = atr(candles_15m, 14)
    last    = candles_15m[-1]
    r       = last.high - last.low
    closes  = [c.close for c in candles_15m]
    sma5    = sma(closes[-5:], 5)

    range_ok = r >= atr_val * 0.8

    if direction == "LONG":
        next_liq     = "Weekly High"
        direction_ok = last.close > sma5
    else:
        next_liq     = "Weekly Low"
        direction_ok = last.close < sma5

    return range_ok and direction_ok, next_liq


# ── Step 6: Fibonacci retracement ────────────────────────────────────────────

def detect_fibonacci(
    candles_15m: list,
    direction: str,
    allowed_fib: list[float],
) -> tuple[float, bool]:
    """
    Returns (closest_fib, fib_ok).
    Computes retracement % from last identified swing range.
    fib_ok = closest allowed level within 5% of actual retracement.
    """
    if not allowed_fib:
        return 0.618, False

    if len(candles_15m) < 10:
        # Not enough candles — accept if 0.618 in allowed levels
        return 0.618, 0.618 in allowed_fib

    recent     = candles_15m[-40:]
    swing_high = max(c.high for c in recent)
    swing_low  = min(c.low  for c in recent)
    s_range    = swing_high - swing_low

    if s_range < 1e-9:
        return allowed_fib[0], True

    last_close = candles_15m[-1].close

    if direction == "LONG":
        # Price pulling back from highs toward lows
        retrace_pct = (swing_high - last_close) / s_range
    else:
        # Price pulling back from lows toward highs
        retrace_pct = (last_close - swing_low) / s_range

    retrace_pct = max(0.0, min(1.0, retrace_pct))

    best_fib  = allowed_fib[0]
    best_dist = abs(retrace_pct - best_fib)
    for fib in allowed_fib[1:]:
        d = abs(retrace_pct - fib)
        if d < best_dist:
            best_dist = d
            best_fib  = fib

    fib_ok = best_dist < 0.08  # within 8 percentage points of the level (SMC standard)
    return round(best_fib, 3), fib_ok


# ── 5m refinement ────────────────────────────────────────────────────────────

def detect_5m_refinement(candles_5m: list, direction: str) -> tuple[bool, str]:
    """
    Returns (ok, message).
    Checks: candle body ≥ 0.5×ATR, volume ≥ 1.2× SMA20, close aligns with direction.
    """
    if len(candles_5m) < 5:
        return True, "5m OK (données insuffisantes)"

    atr_val = atr(candles_5m, 14)
    last    = candles_5m[-1]
    r       = last.high - last.low

    vols    = [c.volume for c in candles_5m]
    v_sma   = sma(vols[:-1], 20) if len(vols) > 1 else vols[0]
    m5_vol  = round(last.volume / max(v_sma, 1e-9), 2)

    close_pct  = (last.close - last.low) / max(r, 1e-9)
    m5_align   = close_pct >= 0.60 if direction == "LONG" else close_pct <= 0.40

    m5_body_ok = r >= atr_val * 0.5
    m5_vol_ok  = m5_vol >= 1.2
    ok         = m5_body_ok and m5_vol_ok and m5_align

    dir_mark = "✓" if m5_align else "✗"
    body_pct = round(r / max(atr_val, 1e-9) * 100, 1)
    msg = (
        f"5m {'✓' if ok else '✗'} body {body_pct:.0f}%ATR | vol {m5_vol:.2f}× | dir {dir_mark}"
    )
    return ok, msg


# ── Outcome resolution (walk-forward backtest) ────────────────────────────────

def resolve_outcome(
    candles_future: list,
    direction: str,
    tp_price: float,
    sl_price: float,
) -> str:
    """
    Scan `candles_future` (already filtered after the signal timestamp).
    Returns "win", "loss", or "timeout".
    """
    for c in candles_future:
        if direction == "LONG":
            if c.low  <= sl_price:  return "loss"
            if c.high >= tp_price:  return "win"
        else:  # SHORT
            if c.high >= sl_price:  return "loss"
            if c.low  <= tp_price:  return "win"
    return "timeout"
