from pydantic import BaseModel, Field


class StrategySettings(BaseModel):
    enable_spring: bool = True
    enable_utad: bool = True
    fib_levels: list[float] = Field(default_factory=lambda: [0.5, 0.618, 0.705])
    displacement_threshold: float = 0.35
    bos_sensitivity: int = 3


class RiskSettings(BaseModel):
    risk_per_trade: float = 0.01
    max_open_positions: int = 8
    daily_loss_limit: float = 0.03
    weekly_loss_limit: float = 0.08


class SystemSettings(BaseModel):
    mode: str = "paper"
    api_key: str | None = None
    api_secret: str | None = None
    max_daily_loss: float = 0.03
    max_weekly_loss: float = 0.08


class TradingSettings(BaseModel):
    enabled_symbols: list[str] = Field(default_factory=lambda: ["BTCUSDT", "ETHUSDT"])
    risk_per_symbol: dict[str, float] = Field(default_factory=dict)
    max_open_per_symbol: dict[str, int] = Field(default_factory=dict)
    timeframe: str = "1H"
    max_concurrent_trades: int = 8
    capital_allocation: float = 1.0


class AppConfig(BaseModel):
    trading: TradingSettings = Field(default_factory=TradingSettings)
    strategy: StrategySettings = Field(default_factory=StrategySettings)
    risk: RiskSettings = Field(default_factory=RiskSettings)
    system: SystemSettings = Field(default_factory=SystemSettings)


config = AppConfig()
