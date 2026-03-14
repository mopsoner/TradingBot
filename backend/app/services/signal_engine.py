from dataclasses import dataclass


@dataclass
class SetupInput:
    symbol: str
    liquidity_zone: bool
    sweep: bool
    spring: bool
    utad: bool
    displacement: bool
    bos: bool
    fib_retracement: float


class SignalEngine:
    def __init__(self, fib_levels: list[float]) -> None:
        self.fib_levels = fib_levels

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
        if payload.fib_retracement not in self.fib_levels:
            return None
        return "LONG" if payload.spring else "SHORT"
