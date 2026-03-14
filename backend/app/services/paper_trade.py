class PaperTradeManager:
    def __init__(self) -> None:
        self.orders: list[dict] = []

    def submit(self, symbol: str, side: str, entry: float, stop: float, target: float) -> dict:
        order = {
            "symbol": symbol,
            "side": side,
            "entry": entry,
            "stop": stop,
            "target": target,
            "status": "OPEN",
            "mode": "paper",
        }
        self.orders.append(order)
        return order
