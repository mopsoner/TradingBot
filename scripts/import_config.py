#!/usr/bin/env python3
"""
Import / restauration de la configuration des profils stratégie depuis un JSON.

Usage:
  python scripts/import_config.py                           # importe profiles_latest.json
  python scripts/import_config.py configs/profiles_latest.json
  python scripts/import_config.py configs/snapshots/2026-03-17_01-00_v1.0.0_auto.json

Comportement :
  - Profil existant (même nom) → mise à jour des paramètres
  - Profil absent en DB        → création avec nouvel ID
  - Profil absent du JSON      → laissé intact en DB
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.services.config_manager import import_snapshot, LATEST_PATH, list_snapshots


def main() -> None:
    parser = argparse.ArgumentParser(description="Import profils stratégie depuis JSON")
    parser.add_argument(
        "snapshot",
        nargs="?",
        default=str(LATEST_PATH),
        help="Chemin vers le fichier snapshot JSON (défaut: configs/profiles_latest.json)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Affiche ce qui serait fait sans modifier la DB")
    args = parser.parse_args()

    snap_path = Path(args.snapshot)
    if not snap_path.exists():
        print(f"❌ Fichier introuvable : {snap_path}")
        snaps = list_snapshots()
        if snaps:
            print(f"\nSnapshots disponibles :")
            for s in snaps[:5]:
                print(f"  {s['filename']}")
        sys.exit(1)

    import json
    data = json.loads(snap_path.read_text())
    meta = data.get("meta", {})
    profiles = data.get("profiles", [])

    print(f"📦 Snapshot sélectionné : {snap_path.name}")
    print(f"   Version     : {meta.get('version', '?')}")
    print(f"   Exporté le  : {meta.get('exported_at', '?')[:19]}")
    print(f"   Label       : {meta.get('label', '(auto)')}")
    print(f"   Profils     : {len(profiles)}")
    print()

    if args.dry_run:
        print("🔍 Mode dry-run — aucune modification en DB")
        for p in profiles:
            print(f"   {'UPSERT':8s} {p['name']}")
        return

    print("🚀 Import en cours...")
    result = import_snapshot(snap_path)
    print(f"✅ Terminé — v{result['version']}")
    print(f"   Créés   : {result['created']}")
    print(f"   Mis à jour : {result['updated']}")
    print(f"   Total   : {result['total']}")


if __name__ == "__main__":
    main()
