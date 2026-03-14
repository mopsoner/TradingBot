from fastapi import FastAPI

from backend.app.api.routes import router
from backend.app.db.session import init_db

app = FastAPI(title="Standalone Web Trading Platform")
app.include_router(router, prefix="/api")


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/")
def root() -> dict:
    return {"service": "web-trading-platform", "mode": "paper"}
