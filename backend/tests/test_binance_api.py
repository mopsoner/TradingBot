#!/usr/bin/env python3
"""
Comprehensive Binance API connectivity test script.

Tests all endpoints used by the platform (public + private / isolated margin).
Mutating endpoints (POST/DELETE) are tested in "dry" mode: called with
intentionally invalid or minimal parameters so the API responds with a
validation error — proving connectivity + auth without executing real operations.

Usage:
    python backend/tests/test_binance_api.py
"""

import hashlib
import hmac
import os
import sys
import time
import json

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package is required.  pip install requests")
    sys.exit(1)

BASE_URL = "https://api.binance.com"
TEST_SYMBOL = "BTCUSDT"
TEST_ASSET = "USDT"

passed = 0
failed = 0
skipped = 0


def _header():
    print("=" * 72)
    print("  Binance API Connectivity Test Suite")
    print("=" * 72)
    print()


def _sign(query_string: str, secret: str) -> str:
    return hmac.new(secret.encode(), query_string.encode(), hashlib.sha256).hexdigest()


def _result(name: str, status: str, detail: str = ""):
    global passed, failed, skipped
    icon = {"PASS": "\u2705", "FAIL": "\u274c", "SKIP": "\u23ed\ufe0f"}.get(status, "?")
    if status == "PASS":
        passed += 1
    elif status == "FAIL":
        failed += 1
    else:
        skipped += 1
    line = f"  {icon} [{status:4s}] {name}"
    if detail:
        line += f"  —  {detail}"
    print(line)


def _binance_error_is_connectivity_pass(resp) -> bool:
    try:
        body = resp.json()
        code = body.get("code", 0)
        if code in (-1100, -1101, -1102, -1104, -1105, -1106, -1013, -1021, -2010, -2011, -3003, -3006, -3015, -11001):
            return True
    except Exception:
        pass
    return False


def test_public_exchange_info():
    name = "Public: exchangeInfo"
    try:
        resp = requests.get(f"{BASE_URL}/api/v3/exchangeInfo", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            count = len(data.get("symbols", []))
            _result(name, "PASS", f"{count} symbols returned")
        else:
            _result(name, "FAIL", f"HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_public_ticker_price():
    name = "Public: ticker/price"
    try:
        resp = requests.get(f"{BASE_URL}/api/v3/ticker/price", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"{len(data)} prices returned")
        else:
            _result(name, "FAIL", f"HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_public_ticker_price_single():
    name = f"Public: ticker/price?symbol={TEST_SYMBOL}"
    try:
        resp = requests.get(f"{BASE_URL}/api/v3/ticker/price", params={"symbol": TEST_SYMBOL}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"price={data.get('price')}")
        else:
            _result(name, "FAIL", f"HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_public_klines():
    name = f"Public: klines ({TEST_SYMBOL} 1h)"
    try:
        resp = requests.get(
            f"{BASE_URL}/api/v3/klines",
            params={"symbol": TEST_SYMBOL, "interval": "1h", "limit": 5},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"{len(data)} candles returned")
        else:
            _result(name, "FAIL", f"HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        _result(name, "FAIL", str(e))


def _signed_get(path: str, extra_params: str, api_key: str, api_secret: str):
    ts = int(time.time() * 1000)
    qs = f"{extra_params}&timestamp={ts}" if extra_params else f"timestamp={ts}"
    sig = _sign(qs, api_secret)
    url = f"{BASE_URL}{path}?{qs}&signature={sig}"
    headers = {"X-MBX-APIKEY": api_key}
    return requests.get(url, headers=headers, timeout=10)


def _signed_post(path: str, extra_params: str, api_key: str, api_secret: str):
    ts = int(time.time() * 1000)
    qs = f"{extra_params}&timestamp={ts}" if extra_params else f"timestamp={ts}"
    sig = _sign(qs, api_secret)
    url = f"{BASE_URL}{path}?{qs}&signature={sig}"
    headers = {"X-MBX-APIKEY": api_key}
    return requests.post(url, headers=headers, timeout=10)


def _signed_delete(path: str, extra_params: str, api_key: str, api_secret: str):
    ts = int(time.time() * 1000)
    qs = f"{extra_params}&timestamp={ts}" if extra_params else f"timestamp={ts}"
    sig = _sign(qs, api_secret)
    url = f"{BASE_URL}{path}?{qs}&signature={sig}"
    headers = {"X-MBX-APIKEY": api_key}
    return requests.delete(url, headers=headers, timeout=10)


def _format_binance_error(resp) -> str:
    try:
        body = resp.json()
        code = body.get("code", "?")
        msg = body.get("msg", resp.text[:200])
        return f"HTTP {resp.status_code} | Binance code={code}: {msg}"
    except Exception:
        return f"HTTP {resp.status_code}: {resp.text[:200]}"


def test_private_isolated_account(api_key: str, api_secret: str):
    name = "Private: isolated/account"
    try:
        resp = _signed_get("/sapi/v1/margin/isolated/account", "", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            assets = data.get("assets", [])
            _result(name, "PASS", f"{len(assets)} isolated pairs found")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_isolated_pair(api_key: str, api_secret: str):
    name = f"Private: isolated/pair ({TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/isolated/pair", f"symbol={TEST_SYMBOL}", api_key, api_secret)
        if resp.status_code == 200:
            _result(name, "PASS", f"pair info received")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_all_isolated_pairs(api_key: str, api_secret: str):
    name = "Private: isolated/allPairs"
    try:
        resp = _signed_get("/sapi/v1/margin/isolated/allPairs", "", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"{len(data)} pairs returned")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_isolated_margin_tier(api_key: str, api_secret: str):
    name = f"Private: isolatedMarginTier ({TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/isolatedMarginTier", f"symbol={TEST_SYMBOL}", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"{len(data)} tier(s)")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_isolated_margin_data(api_key: str, api_secret: str):
    name = f"Private: isolatedMarginData ({TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/isolatedMarginData", f"symbol={TEST_SYMBOL}", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"{len(data)} record(s)")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_max_borrowable(api_key: str, api_secret: str):
    name = f"Private: maxBorrowable ({TEST_ASSET} on {TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/maxBorrowable", f"asset={TEST_ASSET}&isolatedSymbol={TEST_SYMBOL}", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"maxBorrowable={data.get('amount', 'N/A')}")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_max_transferable(api_key: str, api_secret: str):
    name = f"Private: maxTransferable ({TEST_ASSET} on {TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/maxTransferable", f"asset={TEST_ASSET}&isolatedSymbol={TEST_SYMBOL}", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"maxTransferable={data.get('amount', 'N/A')}")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_open_orders(api_key: str, api_secret: str):
    name = f"Private: openOrders ({TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/openOrders", f"symbol={TEST_SYMBOL}&isIsolated=TRUE", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"{len(data)} open order(s)")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_all_orders(api_key: str, api_secret: str):
    name = f"Private: allOrders ({TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/allOrders", f"symbol={TEST_SYMBOL}&isIsolated=TRUE", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"{len(data)} order(s) in history")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_my_trades(api_key: str, api_secret: str):
    name = f"Private: myTrades ({TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/myTrades", f"symbol={TEST_SYMBOL}&isIsolated=TRUE", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"{len(data)} trade(s)")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_borrow_repay_history(api_key: str, api_secret: str):
    name = "Private: borrow-repay history (GET)"
    try:
        resp = _signed_get("/sapi/v1/margin/borrow-repay", f"type=BORROW&isolatedSymbol={TEST_SYMBOL}", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get("rows", [])
            _result(name, "PASS", f"{len(rows)} borrow record(s)")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_interest_history(api_key: str, api_secret: str):
    name = f"Private: interestHistory ({TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/interestHistory", f"isolatedSymbol={TEST_SYMBOL}", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get("rows", [])
            _result(name, "PASS", f"{len(rows)} interest record(s)")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_interest_rate_history(api_key: str, api_secret: str):
    name = f"Private: interestRateHistory ({TEST_ASSET})"
    try:
        resp = _signed_get("/sapi/v1/margin/interestRateHistory", f"asset={TEST_ASSET}", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            _result(name, "PASS", f"{len(data)} rate record(s)")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_force_liquidation_records(api_key: str, api_secret: str):
    name = "Private: forceLiquidationRec"
    try:
        resp = _signed_get("/sapi/v1/margin/forceLiquidationRec", "isIsolated=TRUE", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get("rows", [])
            _result(name, "PASS", f"{len(rows)} liquidation record(s)")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_private_isolated_transfer_history(api_key: str, api_secret: str):
    name = f"Private: isolated/transfer history ({TEST_SYMBOL})"
    try:
        resp = _signed_get("/sapi/v1/margin/isolated/transfer", f"symbol={TEST_SYMBOL}", api_key, api_secret)
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get("rows", [])
            _result(name, "PASS", f"{len(rows)} transfer record(s)")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_dry_new_order(api_key: str, api_secret: str):
    name = "DRY: POST margin/order (invalid symbol → connectivity check)"
    try:
        params = "symbol=INVALIDPAIR&side=BUY&type=MARKET&quantity=1&isIsolated=TRUE"
        resp = _signed_post("/sapi/v1/margin/order", params, api_key, api_secret)
        if resp.status_code == 200:
            _result(name, "FAIL", "UNEXPECTED: order accepted on invalid symbol — investigate!")
        elif _binance_error_is_connectivity_pass(resp):
            body = resp.json()
            _result(name, "PASS", f"connectivity OK — Binance code={body.get('code')}: {body.get('msg','')[:100]}")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_dry_cancel_order(api_key: str, api_secret: str):
    name = "DRY: DELETE margin/order (invalid symbol → connectivity check)"
    try:
        params = "symbol=INVALIDPAIR&orderId=999999999999&isIsolated=TRUE"
        resp = _signed_delete("/sapi/v1/margin/order", params, api_key, api_secret)
        if resp.status_code == 200:
            _result(name, "FAIL", "UNEXPECTED: cancel accepted on invalid symbol — investigate!")
        elif _binance_error_is_connectivity_pass(resp):
            body = resp.json()
            _result(name, "PASS", f"connectivity OK — Binance code={body.get('code')}: {body.get('msg','')[:100]}")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_dry_query_order(api_key: str, api_secret: str):
    name = "DRY: GET margin/order (invalid symbol → connectivity check)"
    try:
        resp = _signed_get("/sapi/v1/margin/order", "symbol=INVALIDPAIR&orderId=999999999999&isIsolated=TRUE", api_key, api_secret)
        if resp.status_code == 200:
            _result(name, "PASS", "order details received")
        elif _binance_error_is_connectivity_pass(resp):
            body = resp.json()
            _result(name, "PASS", f"connectivity OK — Binance code={body.get('code')}: {body.get('msg','')[:100]}")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_dry_borrow(api_key: str, api_secret: str):
    name = "DRY: POST borrow-repay BORROW (invalid symbol → connectivity check)"
    try:
        params = "asset=FAKEASSET&isIsolated=TRUE&symbol=INVALIDPAIR&amount=1&type=BORROW"
        resp = _signed_post("/sapi/v1/margin/borrow-repay", params, api_key, api_secret)
        if resp.status_code == 200:
            _result(name, "FAIL", "UNEXPECTED: borrow accepted on invalid symbol — investigate!")
        elif _binance_error_is_connectivity_pass(resp):
            body = resp.json()
            _result(name, "PASS", f"connectivity OK — Binance code={body.get('code')}: {body.get('msg','')[:100]}")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_dry_repay(api_key: str, api_secret: str):
    name = "DRY: POST borrow-repay REPAY (invalid symbol → connectivity check)"
    try:
        params = "asset=FAKEASSET&isIsolated=TRUE&symbol=INVALIDPAIR&amount=1&type=REPAY"
        resp = _signed_post("/sapi/v1/margin/borrow-repay", params, api_key, api_secret)
        if resp.status_code == 200:
            _result(name, "FAIL", "UNEXPECTED: repay accepted on invalid symbol — investigate!")
        elif _binance_error_is_connectivity_pass(resp):
            body = resp.json()
            _result(name, "PASS", f"connectivity OK — Binance code={body.get('code')}: {body.get('msg','')[:100]}")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def test_dry_isolated_transfer(api_key: str, api_secret: str):
    name = "DRY: POST isolated/transfer (invalid symbol → connectivity check)"
    try:
        params = "asset=FAKEASSET&symbol=INVALIDPAIR&transFrom=SPOT&transTo=ISOLATED_MARGIN&amount=1"
        resp = _signed_post("/sapi/v1/margin/isolated/transfer", params, api_key, api_secret)
        if resp.status_code == 200:
            _result(name, "FAIL", "UNEXPECTED: transfer accepted on invalid symbol — investigate!")
        elif _binance_error_is_connectivity_pass(resp):
            body = resp.json()
            _result(name, "PASS", f"connectivity OK — Binance code={body.get('code')}: {body.get('msg','')[:100]}")
        else:
            _result(name, "FAIL", _format_binance_error(resp))
    except Exception as e:
        _result(name, "FAIL", str(e))


def main():
    _header()

    api_key = os.getenv("BINANCE_API_KEY", "")
    api_secret = os.getenv("BINANCE_API_SECRET", "")
    has_keys = bool(api_key and api_secret)

    if has_keys:
        print(f"  API Key:    {api_key[:4]}****")
    else:
        print("  WARNING: BINANCE_API_KEY / BINANCE_API_SECRET not set.")
        print("           Public tests will run; private tests will be SKIPPED.")
    print()

    print("-" * 72)
    print("  PUBLIC ENDPOINTS")
    print("-" * 72)
    test_public_exchange_info()
    test_public_ticker_price()
    test_public_ticker_price_single()
    test_public_klines()
    print()

    print("-" * 72)
    print("  PRIVATE ENDPOINTS (GET — read-only)")
    print("-" * 72)
    if not has_keys:
        for skip_name in [
            "isolated/account", "isolated/pair", "isolated/allPairs",
            "isolatedMarginTier", "isolatedMarginData", "maxBorrowable",
            "maxTransferable", "openOrders", "allOrders", "myTrades",
            "borrow-repay history", "interestHistory", "interestRateHistory",
            "forceLiquidationRec", "isolated/transfer history",
        ]:
            _result(f"Private: {skip_name}", "SKIP", "API keys not configured")
    else:
        test_private_isolated_account(api_key, api_secret)
        test_private_isolated_pair(api_key, api_secret)
        test_private_all_isolated_pairs(api_key, api_secret)
        test_private_isolated_margin_tier(api_key, api_secret)
        test_private_isolated_margin_data(api_key, api_secret)
        test_private_max_borrowable(api_key, api_secret)
        test_private_max_transferable(api_key, api_secret)
        test_private_open_orders(api_key, api_secret)
        test_private_all_orders(api_key, api_secret)
        test_private_my_trades(api_key, api_secret)
        test_private_borrow_repay_history(api_key, api_secret)
        test_private_interest_history(api_key, api_secret)
        test_private_interest_rate_history(api_key, api_secret)
        test_private_force_liquidation_records(api_key, api_secret)
        test_private_isolated_transfer_history(api_key, api_secret)
    print()

    print("-" * 72)
    print("  DRY-RUN ENDPOINTS (POST/DELETE — no real operations)")
    print("-" * 72)
    if not has_keys:
        for skip_name in [
            "POST margin/order", "DELETE margin/order", "GET margin/order",
            "POST borrow-repay BORROW", "POST borrow-repay REPAY",
            "POST isolated/transfer",
        ]:
            _result(f"DRY: {skip_name}", "SKIP", "API keys not configured")
    else:
        test_dry_new_order(api_key, api_secret)
        test_dry_cancel_order(api_key, api_secret)
        test_dry_query_order(api_key, api_secret)
        test_dry_borrow(api_key, api_secret)
        test_dry_repay(api_key, api_secret)
        test_dry_isolated_transfer(api_key, api_secret)
    print()

    print("=" * 72)
    print(f"  SUMMARY:  {passed} passed,  {failed} failed,  {skipped} skipped")
    print("=" * 72)

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
