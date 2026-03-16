import logging
import os
import threading

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.api.routes import router
from backend.app.db.session import init_db, load_app_config, save_app_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(title="Standalone Web Trading Platform")
app.include_router(router, prefix="/api")

_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        candidate = os.path.join(_DIST, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_DIST, "index.html"))


@app.on_event("startup")
def startup() -> None:
    init_db()
    _restore_config()
    _auto_seed_candles()


def _try_start_paper_scanner() -> None:
    """
    Tente de démarrer le scanner paper sur ETHUSDT/profil actif.
    Appelé après restore config ET après le seed des bougies.
    Ne fait rien si déjà en cours ou si pas de bougies.
    """
    from backend.app.api import routes as _routes
    log = logging.getLogger(__name__)

    if _routes.config.system.mode == "live":
        return

    started = _routes._auto_start_for_paper()
    if started:
        log.info("Paper scanner démarré sur ETHUSDT (mode paper)")
    else:
        log.info("Paper scanner: déjà en cours ou pas de bougies")


def _auto_seed_candles() -> None:
    """
    Si la table marketcandle est vide, lance un thread d'arrière-plan
    qui télécharge 2 ans de bougies ETHUSDT (4 TF) depuis Binance,
    puis démarre le scanner paper automatiquement.
    Idempotent : ne fait rien si des bougies existent déjà.
    """
    from sqlmodel import Session, select
    from backend.app.db.session import engine
    from backend.app.db.models import MarketCandle

    log = logging.getLogger(__name__)
    try:
        with Session(engine) as s:
            exists = s.exec(select(MarketCandle).limit(1)).first()
            if exists:
                _try_start_paper_scanner()
                return
    except Exception as exc:
        log.warning("Auto-seed candles: impossible de vérifier la table — %s", exc)
        return

    log.info("Auto-seed: DB vide — lancement du téléchargement ETHUSDT 2 ans en arrière-plan")

    def _download() -> None:
        from backend.app.services.candle_importer import import_candles
        timeframes = ["5m", "15m", "1h", "4h"]
        all_ok = True
        for tf in timeframes:
            try:
                result = import_candles("ETHUSDT", tf, days=730, source="binance")
                log.info(
                    "Auto-seed ETHUSDT %s : %d bougies insérées (%s → %s)",
                    tf, result["inserted"], result["period_start"], result["period_end"],
                )
            except Exception as exc:
                log.error("Auto-seed ETHUSDT %s échoué: %s", tf, exc)
                all_ok = False
        log.info("Auto-seed ETHUSDT terminé — succès=%s", all_ok)
        _try_start_paper_scanner()

    t = threading.Thread(target=_download, daemon=True, name="auto-seed-candles")
    t.start()


def _restore_config() -> None:
    """Load persisted config from DB and apply it to the in-memory singleton."""
    from backend.app.api import routes as _routes

    log = logging.getLogger(__name__)
    saved = load_app_config()

    if saved is None:
        # Aucune config sauvegardée (premier démarrage) — persister les defaults
        # pour que les redémarrages suivants trouvent mode=paper
        save_app_config(_routes.config)
        log.info("Premier démarrage — config par défaut (paper) sauvegardée en DB")
        return

    cfg = _routes.config
    cfg.strategy = saved.strategy
    cfg.risk     = saved.risk
    cfg.system   = saved.system
    cfg.trading  = saved.trading
    cfg.backtest = saved.backtest
    cfg.session  = saved.session
    cfg.data     = saved.data

    # Re-apply side-effects that depend on config values
    _routes.signal_engine.fib_levels = saved.strategy.fib_levels
    _routes.execution.paper_mode = saved.system.mode != "live"
    _routes.risk.risk_per_trade = saved.risk.risk_per_trade
    _routes.risk.max_open_positions = saved.risk.max_open_positions

    log.info("Config restaurée depuis DB — mode=%s", saved.system.mode)


@app.get("/")
def root() -> dict:
    return {"service": "web-trading-platform", "mode": "paper"}
