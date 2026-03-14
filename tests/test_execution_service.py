from backend.app.services.execution import ExecutionService


def test_build_isolated_margin_payload_sets_required_fields() -> None:
    service = ExecutionService()
    payload = service.build_isolated_margin_order_payload(
        symbol="BTCUSDT",
        side="BUY",
        quantity=0.01,
        price=65000,
        order_type="LIMIT",
    )

    assert payload["isIsolated"] == "TRUE"
    assert payload["type"] == "LIMIT"
    assert payload["timeInForce"] == "GTC"
