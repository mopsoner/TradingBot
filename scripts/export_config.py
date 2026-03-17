#!/usr/bin/env python3
"""
Export de la configuration des profils stratégie vers un JSON versionné.

Usage:
  python scripts/export_config.py
  python scripts/export_config.py --label "avant-mep-v3"

Le fichier est écrit dans :
  configs/profiles_latest.json                    ← toujours à jour
  configs/snapshots/YYYY-MM-DD_HH-MM_vX.X.X.json ← snapshot versionné
"""
import argparse
import sys
from pathlib import Path

# Ajouter la racine au PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.services.config_manager import export_snapshot, list_snapshots


def main() -> None:
    parser = argparse.ArgumentParser(description="Export profils stratégie → JSON versionné")
    parser.add_argument("--label", default="", help="Label libre pour ce snapshot (ex: avant-mep-v3)")
    args = parser.parse_args()

    print("📦 Export de la configuration des profils stratégie...")
    snap_path = export_snapshot(label=args.label or None)
    print(f"✅ Snapshot créé : {snap_path}")
    print(f"✅ Latest mis à jour : configs/profiles_latest.json")

    snaps = list_snapshots()
    print(f"\n📁 {len(snaps)} snapshot(s) disponible(s) dans configs/snapshots/ :")
    for s in snaps[:5]:
        print(f"   v{s['version']:8s}  {s['exported_at'][:16]}  {s['profile_count']} profils  {s['label'] or '(auto)'}")


if __name__ == "__main__":
    main()
