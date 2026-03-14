class ExecutionService:
    def __init__(self, paper_mode: bool = True) -> None:
        self.paper_mode = paper_mode

    def can_go_live(self, api_key: str | None, api_secret: str | None, risk_approved: bool, live_confirmed: bool) -> bool:
        return bool(api_key and api_secret and risk_approved and live_confirmed)
