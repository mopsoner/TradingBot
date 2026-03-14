from dataclasses import dataclass, field


@dataclass
class SetupInput:
    symbol: str
    liquidity_zone: bool
    sweep: bool
    spring: bool
    utad: bool
    displacement: bool
    bos: bool
    expansion_to_next_liquidity: bool
    fib_retracement: float
    fake_breakout: bool = False
    equal_highs_lows: bool = False


class SignalEngine:
    """
    Enforces the mandatory SMC/Wyckoff sequence:
    liquidity zone → sweep → Spring/UTAD → displacement → BOS
    → expansion to next liquidity → fib retracement → entry

    RSI, MACD, EMA are NEVER used as primary triggers.
    """

    ALLOWED_FIB_LEVELS: frozenset[float] = frozenset([0.5, 0.618, 0.705])

    def __init__(self, fib_levels: list[float]) -> None:
        self.fib_levels = [round(f, 3) for f in fib_levels]

    def detect(self, payload: SetupInput) -> str | None:
        if not payload.liquidity_zone:
            return None
        if not payload.sweep:
            return None
        if not (payload.spring or payload.utad):
            return None
        if not payload.displacement:
            return None
        if not payload.bos:
            return None
        if not payload.expansion_to_next_liquidity:
            return None
        if round(payload.fib_retracement, 3) not in self.fib_levels:
            return None
        return "LONG" if payload.spring else "SHORT"

    def reject_reason(self, payload: SetupInput) -> str:
        if not payload.liquidity_zone:
            return "Pas de zone de liquidité"
        if not payload.sweep:
            return "Sweep liquidity absent"
        if not (payload.spring or payload.utad):
            return "Aucun événement Wyckoff (Spring ou UTAD)"
        if not payload.displacement:
            return "Displacement insuffisant"
        if not payload.bos:
            return "BOS non confirmé"
        if not payload.expansion_to_next_liquidity:
            return "Expansion vers liquidité suivante absente"
        if round(payload.fib_retracement, 3) not in self.fib_levels:
            return f"Niveau Fib {payload.fib_retracement} non autorisé (attendu: {self.fib_levels})"
        return "Séquence incomplète"
