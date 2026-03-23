from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any


DEFAULT_GENERATED_CONFIG = "config.generated.json"


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def load_config(base_path: str = "config.json") -> dict[str, Any]:
    base = json.loads(Path(base_path).read_text(encoding="utf-8"))
    generated_path = base.get("generated_config_path", DEFAULT_GENERATED_CONFIG)
    gp = Path(generated_path)
    if gp.exists():
        generated = json.loads(gp.read_text(encoding="utf-8"))
        if isinstance(generated, dict):
            return _deep_merge(base, generated)
    return base
