import logging
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.api.routes import router
from backend.app.db.session import init_db, load_app_config

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


def _restore_config() -> None:
    """Load persisted config from DB and apply it to the in-memory singleton."""
    from backend.app.api import routes as _routes

    saved = load_app_config()
    if saved is None:
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

    logging.getLogger(__name__).info(
        "Config restored from DB — mode=%s", saved.system.mode
    )

    if saved.system.mode == "paper":
        started = _routes._auto_start_for_paper()
        if started:
            logging.getLogger(__name__).info(
                "Paper mode: autonomous scanner auto-started on startup"
            )
        else:
            logging.getLogger(__name__).info(
                "Paper mode: no candle data found — scanner not started"
            )


@app.get("/")
def root() -> dict:
    return {"service": "web-trading-platform", "mode": "paper"}
