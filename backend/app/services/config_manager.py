"""
Config Manager — sauvegarde et restauration des profils stratégie.

Fonctions exportées:
  export_snapshot(label=None) → str   : chemin du fichier JSON créé
  import_snapshot(path)       → dict  : résumé de l'import
  list_snapshots()            → list  : snapshots disponibles
  latest_snapshot_path()      → str   : chemin de profiles_latest.json
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

# ── Chemins ────────────────────────────────────────────────────────────────────
_ROOT       = Path(__file__).resolve().parents[3]          # racine du projet
CONFIGS_DIR = _ROOT / "configs"
SNAP_DIR    = CONFIGS_DIR / "snapshots"
LATEST_PATH = CONFIGS_DIR / "profiles_latest.json"

CONFIGS_DIR.mkdir(parents=True, exist_ok=True)
SNAP_DIR.mkdir(parents=True, exist_ok=True)

# ── Version sémantique auto-incrémentée ────────────────────────────────────────
def _next_version() -> str:
    """Lit la version courante depuis profiles_latest.json et incrémente le patch."""
    if LATEST_PATH.exists():
        try:
            data = json.loads(LATEST_PATH.read_text())
            v = data.get("meta", {}).get("version", "1.0.0")
            major, minor, patch = (int(x) for x in v.split("."))
            return f"{major}.{minor}.{patch + 1}"
        except Exception:
            pass
    return "1.0.0"


# ── Export ──────────────────────────────────────────────────────────────────────
def export_snapshot(label: str | None = None) -> str:
    """
    Exporte tous les profils stratégie (id >= 18) en JSON versionné.

    Écrit deux fichiers :
      - configs/profiles_latest.json          → toujours la dernière version
      - configs/snapshots/YYYY-MM-DD_HH-MM_vX.X.X[_label].json

    Retourne le chemin du snapshot créé.
    """
    from backend.app.db.session import engine
    from backend.app.db.models import StrategyProfile
    from sqlmodel import Session, select

    version = _next_version()
    now = datetime.now(timezone.utc)

    profiles_data: list[dict] = []
    with Session(engine) as s:
        profiles = s.exec(
            select(StrategyProfile)
            .where(StrategyProfile.id >= 18)
            .order_by(StrategyProfile.id)
        ).all()

        for p in profiles:
            params = (
                json.loads(p.parameters)
                if isinstance(p.parameters, str)
                else (p.parameters or {})
            )
            profiles_data.append({
                "id":                        p.id,
                "name":                      p.name,
                "symbol":                    p.symbol,
                "mode":                      p.mode,
                "direction":                 p.direction,
                "description":               p.description,
                "is_active":                 p.is_active,
                "approved_for_live":         p.approved_for_live,
                "parameters":                params,
                "last_backtest_win_rate":    p.last_backtest_win_rate,
                "last_backtest_profit_factor": p.last_backtest_profit_factor,
                "last_backtest_drawdown":    p.last_backtest_drawdown,
            })

    payload = {
        "meta": {
            "version":      version,
            "exported_at":  now.isoformat(),
            "label":        label or "",
            "profile_count": len(profiles_data),
            "engine":       "SMC/Wyckoff Multi-TF v2",
            "description":  (
                label or
                f"Auto-snapshot v{version} — {now.strftime('%Y-%m-%d %H:%M UTC')}"
            ),
        },
        "profiles": profiles_data,
    }

    # 1. Toujours écrire profiles_latest.json
    LATEST_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False))

    # 2. Écrire le snapshot versionné
    slug = re.sub(r"[^\w\-]", "_", label or "auto")[:30] if label else "auto"
    snap_name = f"{now.strftime('%Y-%m-%d_%H-%M')}_v{version}_{slug}.json"
    snap_path = SNAP_DIR / snap_name
    snap_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))

    return str(snap_path)


# ── Import / Restore ────────────────────────────────────────────────────────────
def import_snapshot(path: str | Path) -> dict:
    """
    Restaure les profils depuis un fichier JSON.

    Comportement :
      - Si un profil avec le même nom existe déjà → mise à jour des paramètres
      - Si le profil n'existe pas → création avec un nouvel ID auto
      - Les profils présents en DB mais absents du JSON ne sont PAS supprimés

    Retourne un dict {"created": int, "updated": int, "skipped": int, "version": str}
    """
    from backend.app.db.session import engine
    from backend.app.db.models import StrategyProfile
    from sqlmodel import Session, select

    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Snapshot introuvable : {path}")

    data = json.loads(path.read_text())
    meta     = data.get("meta", {})
    profiles = data.get("profiles", [])

    created = updated = skipped = 0

    with Session(engine) as s:
        for pd in profiles:
            name   = pd["name"]
            params = pd.get("parameters", {})

            existing = s.exec(
                select(StrategyProfile).where(StrategyProfile.name == name)
            ).first()

            if existing:
                existing.mode                   = pd.get("mode", existing.mode)
                existing.symbol                 = pd.get("symbol", existing.symbol)
                existing.direction              = pd.get("direction", existing.direction)
                existing.description            = pd.get("description", existing.description)
                existing.is_active              = pd.get("is_active", existing.is_active)
                existing.approved_for_live      = pd.get("approved_for_live", False)
                existing.parameters             = json.dumps(params)
                existing.last_backtest_win_rate        = pd.get("last_backtest_win_rate")
                existing.last_backtest_profit_factor   = pd.get("last_backtest_profit_factor")
                existing.last_backtest_drawdown        = pd.get("last_backtest_drawdown")
                s.add(existing)
                updated += 1
            else:
                new_p = StrategyProfile(
                    name                          = name,
                    mode                          = pd.get("mode", "research"),
                    symbol                        = pd.get("symbol", ""),
                    direction                     = pd.get("direction", "both"),
                    description                   = pd.get("description", ""),
                    is_active                     = pd.get("is_active", False),
                    approved_for_live             = pd.get("approved_for_live", False),
                    parameters                    = json.dumps(params),
                    last_backtest_win_rate        = pd.get("last_backtest_win_rate"),
                    last_backtest_profit_factor   = pd.get("last_backtest_profit_factor"),
                    last_backtest_drawdown        = pd.get("last_backtest_drawdown"),
                )
                s.add(new_p)
                created += 1

        s.commit()

    return {
        "version":  meta.get("version", "?"),
        "label":    meta.get("label", ""),
        "created":  created,
        "updated":  updated,
        "skipped":  skipped,
        "total":    len(profiles),
    }


# ── Listing ──────────────────────────────────────────────────────────────────────
def list_snapshots() -> list[dict]:
    """Retourne la liste des snapshots disponibles, du plus récent au plus ancien."""
    snaps = []
    for f in sorted(SNAP_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text())
            meta = data.get("meta", {})
            snaps.append({
                "filename":    f.name,
                "path":        str(f),
                "version":     meta.get("version", "?"),
                "exported_at": meta.get("exported_at", ""),
                "label":       meta.get("label", ""),
                "profile_count": meta.get("profile_count", 0),
            })
        except Exception:
            pass
    return snaps


def latest_snapshot_path() -> str:
    return str(LATEST_PATH)
