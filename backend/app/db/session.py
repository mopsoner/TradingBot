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


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _apply_migrations()
    _patch_profiles_missing_fields()


def get_session() -> Session:
    return Session(engine)
