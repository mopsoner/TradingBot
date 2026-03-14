from pydantic import BaseModel, Field


class StrategySettings(BaseModel):
    enable_spring: bool = True
    enable_utad: bool = True
    fib_levels: list[float] = Field(default_factory=lambda: [0.5, 0.618, 0.786])
    displacement_threshold: float = 0.55
    displacement_atr_min: float = 1.2
    bos_sensitivity: int = 7
    htf_alignment_required: bool = True
    volume_adaptive: bool = True
    volume_multiplier_active: float = 1.8
    volume_multiplier_offpeak: float = 1.25
    fib_entry_split: bool = True
    rsi_divergence_only: bool = True
    stop_logic: str = "structure"
    target_r_multiples: list[float] = Field(default_factory=lambda: [2.0, 3.0])
    fake_breakout_required: bool = True
    equal_highs_lows_filter: bool = True
    # ── Configurable rules (previously hardcoded) ──────────────────────────
    allow_weekend_trading: bool = False           # Désactivé par défaut — activable par profil
    use_5m_refinement: bool = False               # Affiner l'entrée sur bougies 5m
    min_volume_usd_24h: float = 0.0               # 0 = pas de filtre liquidité
    require_equal_highs_lows: bool = True         # EQH/EQL obligatoires pour définir liquidité
    bos_close_confirmation: bool = True           # BOS = clôture au-delà du swing (pas juste wick)


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
    enabled_symbols: list[str] = Field(default_factory=lambda: [
        "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AVAXUSDT",
        "XRPUSDT", "ADAUSDT", "DOGEUSDT", "DOTUSDT", "MATICUSDT",
        "LINKUSDT", "UNIUSDT", "LTCUSDT", "ATOMUSDT", "NEARUSDT",
        "AAVEUSDT", "FILUSDT", "APTUSDT", "ARBUSDT", "OPUSDT",
        "SUIUSDT", "INJUSDT", "TIAUSDT", "SEIUSDT", "WLDUSDT",
    ])
    risk_per_symbol: dict[str, float] = Field(default_factory=dict)
    max_open_per_symbol: dict[str, int] = Field(default_factory=dict)
    timeframe: str = "1H"
    max_concurrent_trades: int = 8
    capital_allocation: float = 1.0


class BacktestSettings(BaseModel):
    base_win_rate: float = Field(0.51, description="WR de base — optimisé avec filtre HTF 4H (IA opt ①②③)")
    spring_bonus: float = Field(0.06, description="Bonus WR si Spring activé")
    utad_bonus: float = Field(0.05, description="Bonus WR si UTAD activé")
    bos_max_sensitivity: float = Field(10.0, description="Sensibilité BOS max — montée à 10 (IA opt ②)")
    bos_penalty: float = Field(0.08, description="Pénalité WR réduite — haute sensibilité = qualité voulue")
    wr_min: float = Field(0.32, description="Win rate minimum possible (filtres plus stricts)")
    wr_max: float = Field(0.82, description="Win rate maximum possible")
    avg_win_r: float = Field(1.65, description="R moyen par trade gagnant — amélioré par filtre HTF (IA opt ①)")
    avg_loss_r: float = Field(1.0, description="R moyen par trade perdant")
    vol_scale: float = Field(80.0, description="Facteur d'échelle de la volatilité des bougies")
    vol_min: float = Field(0.6, description="Facteur de volatilité minimum")
    vol_max: float = Field(2.2, description="Facteur de volatilité maximum")
    tf_trades_15m: int = Field(90, description="Trades de base sur 30 jours (15m) — réduit par dépl.+BOS stricts")
    tf_trades_1h: int = Field(30, description="Trades de base sur 30 jours (1h) — réduit par dépl.+BOS stricts")
    tf_trades_4h: int = Field(12, description="Trades de base sur 30 jours (4h) — réduit par dépl.+BOS stricts")
    min_trades: int = Field(8, description="Nombre minimum de trades simulés")
    max_trades: int = Field(500, description="Nombre maximum de trades simulés (étendu pour 4 ans)")
    default_horizon_days: int = Field(45, description="Horizon de backtest par défaut (jours)")
    approved_pf_threshold: float = Field(1.4, description="Profit factor minimum pour approbation live (relevé)")
    approved_dd_threshold: float = Field(0.10, description="Drawdown maximum pour approbation live (resserré)")


class SessionSettings(BaseModel):
    active_sessions: list[str] = Field(
        default_factory=lambda: ["london", "newyork"],
        description="Sessions actives (london, newyork, asia)",
    )
    london_start: int = Field(7,  description="Heure UTC début session London")
    london_end:   int = Field(11, description="Heure UTC fin session London")
    newyork_start: int = Field(13, description="Heure UTC début session New York")
    newyork_end:   int = Field(17, description="Heure UTC fin session New York")
    asia_start: int = Field(0, description="Heure UTC début session Asie")
    asia_end:   int = Field(6, description="Heure UTC fin session Asie")


class DataSettings(BaseModel):
    enrichment_cron: str = Field("0 1 * * *", description="Cron d'enrichissement quotidien")
    candles_5m:  int = Field(2016, description="Bougies générées en 5m (2016 = 7 jours)")
    candles_15m: int = Field(672,  description="Bougies générées en 15m (672 = 7 jours)")
    candles_1h:  int = Field(720,  description="Bougies générées en 1h (720 = 30 jours)")
    candles_4h:  int = Field(540,  description="Bougies générées en 4h (540 = 90 jours)")
    symbol_prices: dict[str, float] = Field(
        default_factory=lambda: {
            "BTCUSDT": 65000, "ETHUSDT": 3500,  "SOLUSDT": 140,  "BNBUSDT": 550,   "AVAXUSDT": 35,
            "XRPUSDT": 0.55,  "ADAUSDT": 0.45,  "DOGEUSDT": 0.12, "DOTUSDT": 7.5,  "MATICUSDT": 0.85,
            "LINKUSDT": 14,   "UNIUSDT": 8,     "LTCUSDT": 80,   "ATOMUSDT": 8.5,  "NEARUSDT": 5.5,
            "AAVEUSDT": 95,   "FILUSDT": 5,     "APTUSDT": 8,    "ARBUSDT": 0.95,  "OPUSDT": 1.8,
            "SUIUSDT": 1.2,   "INJUSDT": 25,    "TIAUSDT": 6,    "SEIUSDT": 0.4,   "WLDUSDT": 2.5,
        },
        description="Prix de référence par symbole pour la génération de bougies",
    )


class AppConfig(BaseModel):
    trading:  TradingSettings  = Field(default_factory=TradingSettings)
    strategy: StrategySettings = Field(default_factory=StrategySettings)
    risk:     RiskSettings     = Field(default_factory=RiskSettings)
    system:   SystemSettings   = Field(default_factory=SystemSettings)
    backtest: BacktestSettings = Field(default_factory=BacktestSettings)
    session:  SessionSettings  = Field(default_factory=SessionSettings)
    data:     DataSettings     = Field(default_factory=DataSettings)


config = AppConfig()
