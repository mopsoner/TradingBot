from backend.app.services.risk_manager import RiskManager, RiskState


def test_risk_limits_reject_when_daily_limit_hit() -> None:
    manager = RiskManager(0.01, 2, 0.03, 0.08)
    approved, reason = manager.approve(RiskState(open_positions=1, daily_loss=-0.04, weekly_loss=0))
    assert not approved
    assert reason == "daily_loss_limit_hit"
