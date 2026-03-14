class ExecutionService:
    ISOLATED_MARGIN_ENDPOINTS = {
        "account":                    {"method": "GET",    "path": "/sapi/v1/margin/isolated/account",     "description": "Query isolated margin account details"},
        "isolated_pair_info":         {"method": "GET",    "path": "/sapi/v1/margin/isolated/pair",        "description": "Query isolated margin pair info"},
        "all_isolated_pairs":         {"method": "GET",    "path": "/sapi/v1/margin/isolated/allPairs",    "description": "List all isolated margin trading pairs"},
        "isolated_margin_tier":       {"method": "GET",    "path": "/sapi/v1/margin/isolatedMarginTier",   "description": "Query isolated margin tier data"},
        "isolated_margin_data":       {"method": "GET",    "path": "/sapi/v1/margin/isolatedMarginData",   "description": "Query isolated margin data for a symbol"},
        "new_order":                  {"method": "POST",   "path": "/sapi/v1/margin/order",                "description": "Place a new margin order"},
        "cancel_order":               {"method": "DELETE", "path": "/sapi/v1/margin/order",                "description": "Cancel an existing margin order"},
        "query_order":                {"method": "GET",    "path": "/sapi/v1/margin/order",                "description": "Query a single margin order by ID"},
        "open_orders":                {"method": "GET",    "path": "/sapi/v1/margin/openOrders",           "description": "List all currently open margin orders"},
        "all_orders":                 {"method": "GET",    "path": "/sapi/v1/margin/allOrders",            "description": "List all margin orders (open + filled + cancelled)"},
        "my_trades":                  {"method": "GET",    "path": "/sapi/v1/margin/myTrades",             "description": "List executed margin trades"},
        "borrow_repay":               {"method": "POST",   "path": "/sapi/v1/margin/borrow-repay",        "description": "Borrow or repay margin assets"},
        "get_borrow_repay":           {"method": "GET",    "path": "/sapi/v1/margin/borrow-repay",        "description": "Query borrow/repay history"},
        "max_borrowable":             {"method": "GET",    "path": "/sapi/v1/margin/maxBorrowable",       "description": "Query maximum borrowable amount"},
        "max_transferable":           {"method": "GET",    "path": "/sapi/v1/margin/maxTransferable",     "description": "Query maximum transferable amount"},
        "interest_history":           {"method": "GET",    "path": "/sapi/v1/margin/interestHistory",     "description": "Query margin interest charge history"},
        "interest_rate_history":      {"method": "GET",    "path": "/sapi/v1/margin/interestRateHistory", "description": "Query historical interest rates"},
        "force_liquidation_records":  {"method": "GET",    "path": "/sapi/v1/margin/forceLiquidationRec", "description": "Query forced liquidation records"},
        "isolated_transfer":          {"method": "POST",   "path": "/sapi/v1/margin/isolated/transfer",   "description": "Transfer assets to/from isolated margin"},
        "isolated_transfer_history":  {"method": "GET",    "path": "/sapi/v1/margin/isolated/transfer",   "description": "Query isolated margin transfer history"},
    }

    INTEREST_RATES = {
        "BTCUSDT":   {"hourly": 0.000416, "daily": 0.01, "annual": 3.65},
        "ETHUSDT":   {"hourly": 0.000416, "daily": 0.01, "annual": 3.65},
        "BNBUSDT":   {"hourly": 0.000555, "daily": 0.01333, "annual": 4.87},
        "SOLUSDT":   {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "XRPUSDT":   {"hourly": 0.000555, "daily": 0.01333, "annual": 4.87},
        "ADAUSDT":   {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "AVAXUSDT":  {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "DOGEUSDT":  {"hourly": 0.000833, "daily": 0.02, "annual": 7.30},
        "DOTUSDT":   {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "LINKUSDT":  {"hourly": 0.000555, "daily": 0.01333, "annual": 4.87},
        "MATICUSDT": {"hourly": 0.000833, "daily": 0.02, "annual": 7.30},
        "UNIUSDT":   {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "LTCUSDT":   {"hourly": 0.000555, "daily": 0.01333, "annual": 4.87},
        "ATOMUSDT":  {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "NEARUSDT":  {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "AAVEUSDT":  {"hourly": 0.000555, "daily": 0.01333, "annual": 4.87},
        "FILUSDT":   {"hourly": 0.000833, "daily": 0.02, "annual": 7.30},
        "APTUSDT":   {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "ARBUSDT":   {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "OPUSDT":    {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "SUIUSDT":   {"hourly": 0.000833, "daily": 0.02, "annual": 7.30},
        "INJUSDT":   {"hourly": 0.000694, "daily": 0.01666, "annual": 6.08},
        "TIAUSDT":   {"hourly": 0.000833, "daily": 0.02, "annual": 7.30},
        "SEIUSDT":   {"hourly": 0.000833, "daily": 0.02, "annual": 7.30},
        "WLDUSDT":   {"hourly": 0.000833, "daily": 0.02, "annual": 7.30},
    }

    def __init__(self, paper_mode: bool = True) -> None:
        self.paper_mode = paper_mode

    def can_go_live(self, api_key: str | None, api_secret: str | None, risk_approved: bool, live_confirmed: bool) -> bool:
        return bool(api_key and api_secret and risk_approved and live_confirmed)

    def build_isolated_margin_order_payload(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float | None = None,
        order_type: str = "MARKET",
    ) -> dict:
        payload: dict[str, str | float | bool] = {
            "symbol": symbol,
            "side": side,
            "type": order_type,
            "quantity": quantity,
            "isIsolated": "TRUE",
        }
        if price is not None:
            payload["price"] = price
            payload["timeInForce"] = "GTC"
        return payload

    @staticmethod
    def _classify_margin_status(rate: float) -> str:
        if rate < 1.06:
            return "FORCE_LIQUIDATION"
        if rate < 1.12:
            return "MARGIN_CALL"
        return "NORMAL"

    def simulate_margin_account(self, positions: list, enable_auto_borrow_repay: bool = False, leverage: float = 2.0) -> list:
        import random
        results = []
        for pos in positions:
            side = "LONG" if pos.get("quantity", 0) > 0 else "SHORT"
            entry = pos.get("entry_price", 0)
            current = pos.get("current_price", 0)
            qty = abs(pos.get("quantity", 0))
            notional = qty * current

            if enable_auto_borrow_repay:
                borrow_ratio = (leverage - 1.0) / leverage
                borrowed = notional * borrow_ratio
                interest = borrowed * 0.0005
                equity = notional / leverage
                total_asset = notional + equity * 0.1
            else:
                borrowed = notional * random.uniform(0.3, 0.7)
                interest = borrowed * random.uniform(0.0001, 0.001)
                total_asset = notional + random.uniform(50, 200)

            total_debt = borrowed + interest
            margin_level = total_asset / total_debt if total_debt > 0 else 999.0

            if enable_auto_borrow_repay:
                if side == "LONG":
                    liq_price = entry * (1.0 - 1.0 / leverage * 0.9)
                else:
                    liq_price = entry * (1.0 + 1.0 / leverage * 0.9)
                liquidate_rate = margin_level * 0.9
            else:
                if side == "LONG":
                    liq_price = entry * random.uniform(0.70, 0.88)
                else:
                    liq_price = entry * random.uniform(1.12, 1.30)
                liquidate_rate = margin_level * random.uniform(0.85, 0.95)

            status = self._classify_margin_status(liquidate_rate)
            margin_ratio = total_debt / total_asset if total_asset > 0 else 0

            results.append({
                "symbol": pos.get("symbol", ""),
                "side": side,
                "entryPrice": round(entry, 2),
                "currentPrice": round(current, 2),
                "quantity": qty,
                "notional": round(notional, 2),
                "unrealizedPnl": round(pos.get("unrealized_pnl", 0), 2),
                "marginLevel": round(margin_level, 4),
                "marginLevelStatus": status,
                "liquidateRate": round(liquidate_rate, 4),
                "liquidatePrice": round(liq_price, 2),
                "marginRatio": round(margin_ratio, 4),
                "borrowed": round(borrowed, 4),
                "interest": round(interest, 6),
                "totalAsset": round(total_asset, 2),
                "totalDebt": round(total_debt, 4),
            })
        return results

    def fetch_live_margin_account(self) -> list:
        import os, hmac, hashlib, time, requests
        api_key = os.getenv("BINANCE_API_KEY", "")
        api_secret = os.getenv("BINANCE_API_SECRET", "")
        if not api_key or not api_secret:
            return []
        base = "https://api.binance.com"
        ts = int(time.time() * 1000)
        query = f"timestamp={ts}"
        sig = hmac.new(api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
        url = f"{base}/sapi/v1/margin/isolated/account?{query}&signature={sig}"
        headers = {"X-MBX-APIKEY": api_key}
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []

        results = []
        for pair in data.get("assets", []):
            base_asset = pair.get("baseAsset", {})
            quote_asset = pair.get("quoteAsset", {})
            symbol = pair.get("symbol", "")

            base_borrowed = float(base_asset.get("borrowed", 0))
            base_interest = float(base_asset.get("interest", 0))
            base_net = float(base_asset.get("netAsset", 0))
            base_total = float(base_asset.get("totalAsset", 0))
            base_free = float(base_asset.get("free", 0))

            quote_borrowed = float(quote_asset.get("borrowed", 0))
            quote_interest = float(quote_asset.get("interest", 0))
            quote_total = float(quote_asset.get("totalAsset", 0))

            if base_total == 0 and base_borrowed == 0 and quote_borrowed == 0:
                continue

            ml = float(pair.get("marginLevel", 999))
            liq_price = float(pair.get("liquidatePrice", 0))
            liq_rate = float(pair.get("liquidateRate", 999))
            binance_status = pair.get("marginLevelStatus", "")
            if binance_status in ("FORCE_LIQUIDATION", "MARGIN_CALL", "NORMAL"):
                status = binance_status
            else:
                status = self._classify_margin_status(liq_rate)

            index_price = float(pair.get("indexPrice", 0))
            entry_price = index_price
            current_price = index_price
            qty = base_free + base_borrowed
            notional = qty * current_price if current_price > 0 else 0

            base_debt_usd = (base_borrowed + base_interest) * current_price
            quote_debt_usd = quote_borrowed + quote_interest
            total_debt = base_debt_usd + quote_debt_usd

            base_asset_usd = base_total * current_price
            total_asset_usd = base_asset_usd + quote_total

            pnl = total_asset_usd - total_debt - notional
            margin_ratio = total_debt / total_asset_usd if total_asset_usd > 0 else 0

            total_borrowed = base_borrowed * current_price + quote_borrowed
            total_interest = base_interest * current_price + quote_interest

            results.append({
                "symbol": symbol,
                "side": "LONG" if base_net >= 0 else "SHORT",
                "entryPrice": round(entry_price, 2),
                "currentPrice": round(current_price, 2),
                "quantity": round(qty, 6),
                "notional": round(notional, 2),
                "unrealizedPnl": round(pnl, 2),
                "marginLevel": round(ml, 4),
                "marginLevelStatus": status,
                "liquidateRate": round(liq_rate, 4),
                "liquidatePrice": round(liq_price, 2),
                "marginRatio": round(margin_ratio, 4),
                "borrowed": round(total_borrowed, 6),
                "interest": round(total_interest, 8),
                "totalAsset": round(total_asset_usd, 2),
                "totalDebt": round(total_debt, 4),
            })
        return results

    def fetch_live_force_liquidations(self) -> list:
        import os, hmac, hashlib, time, requests
        api_key = os.getenv("BINANCE_API_KEY", "")
        api_secret = os.getenv("BINANCE_API_SECRET", "")
        if not api_key or not api_secret:
            return []
        base = "https://api.binance.com"
        ts = int(time.time() * 1000)
        query = f"isIsolated=TRUE&timestamp={ts}"
        sig = hmac.new(api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
        url = f"{base}/sapi/v1/margin/forceLiquidationRec?{query}&signature={sig}"
        headers = {"X-MBX-APIKEY": api_key}
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []
        rows = data.get("rows", [])
        results = []
        for r in rows:
            results.append({
                "orderId": r.get("orderId"),
                "symbol": r.get("symbol", ""),
                "side": r.get("side", ""),
                "type": r.get("type", ""),
                "qty": r.get("qty", "0"),
                "price": r.get("price", "0"),
                "avgPrice": r.get("avgPrice", "0"),
                "status": r.get("status", ""),
                "time": r.get("time", 0),
                "isIsolated": r.get("isIsolated", True),
                "updatedTime": r.get("updatedTime", 0),
            })
        return results

    def execute_borrow(self, symbol: str, asset: str, amount: float, is_paper: bool) -> dict:
        import logging
        logger = logging.getLogger("openclaw.execution")
        if is_paper:
            logger.info("[PAPER] Borrow %.6f %s on %s (simulated)", amount, asset, symbol)
            return {"tranId": 0, "status": "SIMULATED", "asset": asset, "amount": amount}
        import os, hmac, hashlib, time, requests
        api_key = os.getenv("BINANCE_API_KEY", "")
        api_secret = os.getenv("BINANCE_API_SECRET", "")
        if not api_key or not api_secret:
            raise RuntimeError("Missing Binance API credentials for borrow")
        base = "https://api.binance.com"
        ts = int(time.time() * 1000)
        params = f"asset={asset}&isIsolated=TRUE&symbol={symbol}&amount={amount}&type=BORROW&timestamp={ts}"
        sig = hmac.new(api_secret.encode(), params.encode(), hashlib.sha256).hexdigest()
        url = f"{base}/sapi/v1/margin/borrow-repay?{params}&signature={sig}"
        headers = {"X-MBX-APIKEY": api_key}
        resp = requests.post(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            detail = resp.text
            logger.error("Borrow failed for %s %s on %s: %s", amount, asset, symbol, detail)
            raise RuntimeError(f"Borrow failed: {detail}")
        data = resp.json()
        logger.info("Borrow success: %.6f %s on %s (tranId=%s)", amount, asset, symbol, data.get("tranId"))
        return data

    def execute_repay(self, symbol: str, asset: str, amount: float, is_paper: bool) -> dict:
        import logging
        logger = logging.getLogger("openclaw.execution")
        if is_paper:
            logger.info("[PAPER] Repay %.6f %s on %s (simulated)", amount, asset, symbol)
            return {"tranId": 0, "status": "SIMULATED", "asset": asset, "amount": amount}
        import os, hmac, hashlib, time, requests
        api_key = os.getenv("BINANCE_API_KEY", "")
        api_secret = os.getenv("BINANCE_API_SECRET", "")
        if not api_key or not api_secret:
            raise RuntimeError("Missing Binance API credentials for repay")
        base = "https://api.binance.com"
        ts = int(time.time() * 1000)
        params = f"asset={asset}&isIsolated=TRUE&symbol={symbol}&amount={amount}&type=REPAY&timestamp={ts}"
        sig = hmac.new(api_secret.encode(), params.encode(), hashlib.sha256).hexdigest()
        url = f"{base}/sapi/v1/margin/borrow-repay?{params}&signature={sig}"
        headers = {"X-MBX-APIKEY": api_key}
        resp = requests.post(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            detail = resp.text
            logger.error("Repay failed for %s %s on %s: %s", amount, asset, symbol, detail)
            raise RuntimeError(f"Repay failed: {detail}")
        data = resp.json()
        logger.info("Repay success: %.6f %s on %s (tranId=%s)", amount, asset, symbol, data.get("tranId"))
        self._check_remaining_borrowable(symbol, asset, api_key, api_secret)
        return data

    @staticmethod
    def _check_remaining_borrowable(symbol: str, asset: str, api_key: str, api_secret: str) -> None:
        import hmac, hashlib, time, requests, logging
        logger = logging.getLogger("openclaw.execution")
        try:
            base = "https://api.binance.com"
            ts = int(time.time() * 1000)
            params = f"asset={asset}&isolatedSymbol={symbol}&timestamp={ts}"
            sig = hmac.new(api_secret.encode(), params.encode(), hashlib.sha256).hexdigest()
            url = f"{base}/sapi/v1/margin/maxBorrowable?{params}&signature={sig}"
            headers = {"X-MBX-APIKEY": api_key}
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                logger.info("Post-repay max borrowable for %s on %s: %s", asset, symbol, data.get("amount", "N/A"))
        except Exception as exc:
            logger.warning("Could not check max_borrowable after repay: %s", exc)

    def get_interest_rates(self) -> dict:
        by_pair = self.INTEREST_RATES
        by_token: dict[str, dict] = {}
        for pair, rates in by_pair.items():
            token = pair.replace("USDT", "")
            by_token[token] = rates
        return {"byPair": by_pair, "byToken": by_token}
