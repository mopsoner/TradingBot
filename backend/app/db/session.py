import json
import logging

from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy import text

logger = logging.getLogger(__name__)

engine = create_engine(
    "sqlite:///trading_platform.db",
    echo=False,
    connect_args={"check_same_thread": False},
)

_CONFIG_KEY = "app_config"

# ── Schema migrations ─────────────────────────────────────────────────────────

_MIGRATIONS: list[tuple[str, str, str]] = [
    ("strategyprofile", "last_backtest_win_rate",    "REAL"),
    ("strategyprofile", "last_backtest_profit_factor", "REAL"),
    ("strategyprofile", "last_backtest_drawdown",    "REAL"),
    ("strategyprofile", "last_backtest_id",          "INTEGER"),
    # Signal — new fields for full SMC/Wyckoff compliance
    ("signal", "direction",          "TEXT"),
    ("signal", "reject_reason",      "TEXT"),
    ("signal", "fake_breakout",      "INTEGER DEFAULT 0"),
    ("signal", "equal_highs_lows",   "INTEGER DEFAULT 0"),
    ("signal", "expansion",          "INTEGER DEFAULT 0"),
    ("signal", "tf_4h_structure",    "TEXT"),
    ("signal", "tf_1h_validation",   "TEXT"),
    ("signal", "session_name",       "TEXT"),
    ("signal", "displacement_force", "REAL"),
    ("signal", "wyckoff_event",      "TEXT"),
    # Position — margin/liquidation enrichment
    ("position", "side",                "TEXT DEFAULT 'LONG'"),
    ("position", "notional",            "REAL DEFAULT 0.0"),
    ("position", "borrowed",            "REAL DEFAULT 0.0"),
    ("position", "interest",            "REAL DEFAULT 0.0"),
    ("position", "margin_level",        "REAL DEFAULT 999.0"),
    ("position", "margin_level_status", "TEXT DEFAULT 'NORMAL'"),
    ("position", "liquidate_rate",      "REAL DEFAULT 999.0"),
    ("position", "liquidate_price",     "REAL DEFAULT 0.0"),
    ("position", "margin_ratio",        "REAL DEFAULT 0.0"),
    ("position", "total_asset_value",   "REAL DEFAULT 0.0"),
    ("position", "total_debt_value",    "REAL DEFAULT 0.0"),
    ("strategyprofile", "enable_auto_borrow_repay", "BOOLEAN DEFAULT 0"),
    ("strategyprofile", "description",              "TEXT"),
    ("signal", "pipeline_run_id", "TEXT"),
    ("signal", "zone_low",  "REAL"),
    ("signal", "zone_high", "REAL"),
    ("backtestresult", "pipeline_run_id", "TEXT"),
    # Walk-forward backtest enrichment
    ("signal",         "bt_outcome",      "TEXT"),       # "win" | "loss" | "timeout" | NULL
    ("signal",         "bt_r_multiple",   "REAL"),       # actual R achieved (NULL for live)
    ("signal",         "entry_price",     "REAL"),       # entry price stored on signal
    ("signal",         "tp_price",        "REAL"),       # take-profit price
    ("signal",         "sl_price",        "REAL"),       # stop-loss price
    ("backtestresult", "signal_count",    "INTEGER"),    # total signals in walk-forward run
    ("backtestresult", "step_count",      "INTEGER"),    # number of 4H steps evaluated
    ("backtestresult", "date_from",       "TEXT"),       # ISO date start of backtest range
    ("backtestresult", "date_to",         "TEXT"),       # ISO date end of backtest range
    ("backtestresult", "status",          "TEXT"),       # RUNNING / COMPLETED / FAILED
    ("backtestresult", "config",          "TEXT"),       # JSON config (symbol, timeframe, dates)
    ("backtestresult", "trades_json",     "TEXT"),       # JSON array of replay trades
]


def _apply_migrations() -> None:
    """Add missing columns to existing tables (idempotent, safe on every startup)."""
    with engine.connect() as conn:
        for table, column, col_type in _MIGRATIONS:
            try:
                rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                existing = [r[1] for r in rows]
                if column not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                    conn.commit()
                    logger.info("Migration: added column %s.%s", table, column)
            except Exception as exc:
                logger.warning("Migration skipped for %s.%s: %s", table, column, exc)


# ── Config persistence ────────────────────────────────────────────────────────

def load_app_config():
    """Load AppConfig from the DB.  Returns None if no persisted config exists."""
    from backend.app.db.models import Configuration
    from backend.app.core.config import AppConfig
    try:
        with Session(engine) as s:
            row = s.exec(
                select(Configuration).where(Configuration.key == _CONFIG_KEY)
            ).first()
            if row:
                data = json.loads(row.payload)
                return AppConfig.model_validate(data)
    except Exception as exc:
        logger.warning("Could not load persisted config: %s — using defaults", exc)
    return None


def save_app_config(cfg) -> None:
    """Persist the current AppConfig to the DB (upsert)."""
    from backend.app.db.models import Configuration
    try:
        payload = json.dumps(cfg.model_dump())
        with Session(engine) as s:
            row = s.exec(
                select(Configuration).where(Configuration.key == _CONFIG_KEY)
            ).first()
            if row:
                row.payload = payload
                s.add(row)
            else:
                s.add(Configuration(key=_CONFIG_KEY, payload=payload))
            s.commit()
    except Exception as exc:
        logger.warning("Could not persist config to DB: %s", exc)


# ── Public init ───────────────────────────────────────────────────────────────

def _patch_profiles_missing_fields() -> None:
    """
    One-time data patch: profiles created by the AI Workshop may not have
    all strategy fields in their parameters JSON (e.g. allow_weekend_trading
    was added after some profiles were created).  This ensures every profile
    has the full set of fields with safe defaults so profile_params.get()
    always finds the value and never falls back to the global config.
    """
    from backend.app.db.models import StrategyProfile

    DEFAULTS: dict[str, object] = {
        "allow_weekend_trading": False,
        "use_5m_refinement": False,
        "require_equal_highs_lows": True,
        "bos_close_confirmation": True,
        "fib_entry_split": True,
        "htf_alignment_required": True,
        "volume_adaptive": True,
        "rsi_divergence_only": True,
    }

    try:
        with Session(engine) as s:
            profiles = s.exec(select(StrategyProfile)).all()
            patched = 0
            for prof in profiles:
                try:
                    params: dict = json.loads(prof.parameters or "{}")
                except Exception:
                    params = {}
                changed = False
                for key, default_val in DEFAULTS.items():
                    if key not in params:
                        params[key] = default_val
                        changed = True
                if changed:
                    prof.parameters = json.dumps(params)
                    s.add(prof)
                    patched += 1
            if patched:
                s.commit()
                logger.info("Profile data patch: added missing fields to %d profile(s)", patched)
    except Exception as exc:
        logger.warning("Profile data patch failed: %s", exc)


_BT22_PARAMS = {
    "enable_spring": True,
    "enable_utad": True,
    "displacement_threshold": 0.65,
    "displacement_atr_min": 1.4,
    "bos_sensitivity": 6,
    "bos_close_confirmation": True,
    "fib_levels": [0.5, 0.707, 0.786],
    "fib_entry_split": True,
    "htf_alignment_required": True,
    "htf_long_min_bias": "neutral",
    "htf_short_min_bias": "SHORT",
    "tf1h_long_min_bias": "neutral",
    "tf1h_short_min_bias": "SHORT",
    "volume_adaptive": True,
    "volume_multiplier_active": 1.9,
    "volume_multiplier_offpeak": 1.3,
    "rsi_period": 12,
    "rsi_overbought": 68,
    "rsi_oversold": 32,
    "rsi_divergence_only": True,
    "require_equal_highs_lows": True,
    "stop_logic": "structure",
    "allow_weekend_trading": False,
    "use_5m_refinement": True,
    "risk_per_trade": 0.012,
    "stop_loss_atr_mult": 1.6,
    "take_profit_rr": 2.75,
}


def _seed_default_profile() -> None:
    """Insert the validated ETH-SMC-IA-v1 profile (BT#22) if the table is empty."""
    from backend.app.db.models import StrategyProfile
    import datetime

    try:
        with Session(engine) as s:
            count = len(s.exec(select(StrategyProfile)).all())
            if count > 0:
                return
            profile = StrategyProfile(
                timestamp=datetime.datetime.utcnow(),
                name="ETH-SMC-IA-v1",
                mode="research",
                parameters=json.dumps(_BT22_PARAMS),
                is_active=True,
                approved_for_live=False,
                enable_auto_borrow_repay=False,
                description="Profil validé BT#22 — +12.5R/an, WR=31%, PF=1.21, DD=28%",
            )
            s.add(profile)
            s.commit()
            logger.info("Seed: profil ETH-SMC-IA-v1 (BT#22) inséré (DB vide au démarrage)")
    except Exception as exc:
        logger.warning("Seed profil échoué: %s", exc)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _apply_migrations()
    _patch_profiles_missing_fields()
    _seed_default_profile()


def get_session() -> Session:
    return Session(engine)
