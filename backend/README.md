# Backend — OpenClaw

## Binance API Test Script

A standalone script that verifies connectivity to every Binance API endpoint used by the platform.

### Running the tests

```bash
python backend/tests/test_binance_api.py
```

### Required environment variables

| Variable | Description |
|---|---|
| `BINANCE_API_KEY` | Your Binance API key |
| `BINANCE_API_SECRET` | Your Binance API secret |

If the variables are not set, public endpoint tests will still run; private endpoint tests will be skipped.

### Required Binance API permissions

For all tests to pass, the API key must have the following permissions enabled on Binance:

- **Enable Reading** — required for all GET endpoints (account info, orders, trades, interest history, etc.)
- **Enable Margin Loan, Repay & Transfer** — required for the dry-run borrow/repay/transfer connectivity tests
- **Enable Spot & Margin Trading** — required for the dry-run order placement/cancellation connectivity tests
- **IP Access Restriction** — recommended: restrict the key to trusted IPs only

### Test categories

1. **Public endpoints** — `exchangeInfo`, `ticker/price`, `klines` (no API key needed)
2. **Private GET endpoints** — all read-only isolated margin endpoints (account, pairs, orders, trades, history, etc.)
3. **Dry-run POST/DELETE endpoints** — mutating endpoints called with intentionally invalid parameters to verify connectivity without executing real operations. A Binance validation error (e.g. code `-1100`, `-2010`) counts as a PASS.

### Output

Each test displays PASS / FAIL / SKIP with details. A summary line at the end shows totals:

```
========================================================================
  SUMMARY:  25 passed,  0 failed,  0 skipped
========================================================================
```
