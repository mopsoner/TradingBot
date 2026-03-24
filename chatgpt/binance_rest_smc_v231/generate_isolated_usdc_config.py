from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from collector import BinanceRestClient
from config_utils import DEFAULT_GENERATED_CONFIG, load_config
from console_colors import headline, info, success, warning


def main() -> None:
    cfg = load_config()
    sd = cfg.get("symbol_discovery", {})
    output_path = Path(cfg.get("generated_config_path", DEFAULT_GENERATED_CONFIG))
    client = BinanceRestClient(cfg["binance_rest_base"])
    info_payload = client.exchange_info()
    quote_assets = set(sd.get("quote_assets", ["USDC"]))
    status = sd.get("status", "TRADING")
    spot_only = bool(sd.get("spot_only", True))
    margin_only = bool(sd.get("margin_only", True))
    out: list[str] = []
    for row in info_payload.get("symbols", []):
        symbol = row.get("symbol")
        if not symbol:
            continue
        if quote_assets and row.get("quoteAsset") not in quote_assets:
            continue
        if row.get("status") != status:
            continue
        if spot_only and not row.get("isSpotTradingAllowed", False):
            continue
        if margin_only and not row.get("isMarginTradingAllowed", False):
            continue
        out.append(symbol)
    out = sorted(set(out))
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        "generator": "generate_isolated_usdc_config.py",
        "note": "isolated API removed; generated from exchangeInfo using classic margin filter",
        "symbol_discovery": {
            "use_static_symbols": True,
            "static_symbols": out,
            "isolated_only": False,
            "margin_only": True
        }
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(headline(f"Generated static config: {output_path}"))
    print(warning("Isolated Binance API call removed. Using classic margin filter."))
    print(info(f"symbols_count={len(out)}"))
    if out:
        print(info(", ".join(out[:20]) + (" ..." if len(out) > 20 else "")))
    print(success("Done"))


if __name__ == "__main__":
    main()
