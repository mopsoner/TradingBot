class ExecutionService:
    ISOLATED_MARGIN_ENDPOINTS = {
        "new_order": "POST /sapi/v1/margin/order",
        "cancel_order": "DELETE /sapi/v1/margin/order",
        "account": "GET /sapi/v1/margin/isolated/account",
        "borrow_repay": "POST /sapi/v1/margin/borrow-repay",
        "max_borrowable": "GET /sapi/v1/margin/maxBorrowable",
    }

    def __init__(self, paper_mode: bool = True) -> None:
        self.paper_mode = paper_mode

    def can_go_live(self, api_key: str | None, api_secret: str | None, risk_approved: bool, live_confirmed: bool) -> bool:
        return bool(api_key and api_secret and risk_approved and live_confirmed)

    def build_isolated_margin_order_payload(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float | None = None,
        order_type: str = "MARKET",
    ) -> dict:
        payload: dict[str, str | float | bool] = {
            "symbol": symbol,
            "side": side,
            "type": order_type,
            "quantity": quantity,
            "isIsolated": "TRUE",
        }
        if price is not None:
            payload["price"] = price
            payload["timeInForce"] = "GTC"
        return payload
