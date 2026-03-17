"""
USDC Full Optimization Pipeline
Phase 1: Import 15m/1H/4H data for 16 USDC pairs (4 years) — direct Python
Phase 2: Optimize dual profiles (12 combos per pair, 4 parallel) — HTTP API
Phase 3: Final validation + profitability ranking
"""
import sys
import os

import requests
import json
import time
import copy
import threading
import math

BASE = "http://localhost:8000/api"

PAIRS = [
    "BTCUSDC", "ETHUSDC", "BNBUSDC", "XRPUSDC", "LTCUSDC",
    "ADAUSDC", "LINKUSDC", "ATOMUSDC", "XLMUSDC", "ETCUSDC",
    "BCHUSDC", "TRXUSDC", "DOGEUSDC", "NEOUSDC", "SOLUSDC", "ALGOUSDC",
]

DATE_START = "2022-01-01T00:00:00+00:00"
DATE_END   = "2026-03-16T23:59:00+00:00"
CAPITAL    = 5000.0
RISK_PCT   = 0.015
YEARS      = 4.21
IMPORT_DAYS = 1460

GRID = [
    {"bull_rr": 2.5, "bear_rr": 1.5, "lb": 14},
    {"bull_rr": 2.5, "bear_rr": 1.5, "lb": 16},
    {"bull_rr": 2.5, "bear_rr": 2.0, "lb": 14},
    {"bull_rr": 2.5, "bear_rr": 2.0, "lb": 16},
    {"bull_rr": 3.0, "bear_rr": 1.5, "lb": 14},
    {"bull_rr": 3.0, "bear_rr": 1.5, "lb": 16},
    {"bull_rr": 3.0, "bear_rr": 2.0, "lb": 14},
    {"bull_rr": 3.0, "bear_rr": 2.0, "lb": 16},
    {"bull_rr": 4.0, "bear_rr": 1.5, "lb": 14},
    {"bull_rr": 4.0, "bear_rr": 1.5, "lb": 16},
    {"bull_rr": 4.0, "bear_rr": 2.0, "lb": 14},
    {"bull_rr": 4.0, "bear_rr": 2.0, "lb": 16},
]

MAX_PARALLEL = 3   # concurrent backtests per pair


def log(msg):
    from datetime import datetime
    print(f"[{datetime.utcnow().strftime('%H:%M:%S')}] {msg}", flush=True)


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1: Import candles via backend HTTP API (avoids SQLite locking)
# ─────────────────────────────────────────────────────────────────────────────

def _db_count(symbol, tf):
    import sqlite3
    try:
        con = sqlite3.connect("/home/runner/workspace/trading_platform.db", timeout=10)
        cur = con.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM marketcandle WHERE symbol=? AND timeframe=?",
            (symbol, tf)
        )
        n = cur.fetchone()[0]
        con.close()
        return n
    except Exception:
        return 0


def _wait_for_pair(symbol, min_counts, timeout=300):
    """Wait until all TFs have sufficient candles. Returns True if ready."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(10)
        counts = {tf: _db_count(symbol, tf) for tf in min_counts}
        if all(counts[tf] >= min_counts[tf] for tf in min_counts):
            return True
    return False


def phase1_import():
    log("═" * 72)
    log("PHASE 1 — Import séquentiel (1 paire à la fois, évite verrous SQLite)")
    log("═" * 72)

    TFS = ["4h", "1h", "15m"]
    MIN_CANDLES = {"4h": 500, "1h": 2000, "15m": 8000}
    success = []
    failed  = []

    for idx, symbol in enumerate(PAIRS):
        # Check existing
        counts = {tf: _db_count(symbol, tf) for tf in TFS}
        already_ok = all(counts[tf] >= MIN_CANDLES[tf] for tf in TFS)

        if already_ok:
            log(f"  ✓ [{idx+1}/{len(PAIRS)}] {symbol}: déjà en DB "
                f"(4H={counts['4h']:,} 1H={counts['1h']:,} 15m={counts['15m']:,})")
            success.append(symbol)
            continue

        missing_tfs = [tf for tf in TFS if counts[tf] < MIN_CANDLES[tf]]
        log(f"\n  [{idx+1}/{len(PAIRS)}] {symbol} — import {missing_tfs}...")

        # Launch import for this single pair
        r = requests.post(f"{BASE}/data/fetch/bulk", json={
            "symbols": [symbol],
            "timeframes": missing_tfs,
            "days": IMPORT_DAYS,
            "source": "binance",
        }, timeout=20)

        if r.status_code != 200:
            log(f"    ✗ Erreur API: {r.text[:150]}")
            failed.append(symbol)
            continue

        jobs = r.json().get("jobs", [])
        log(f"    {len(jobs)} jobs lancés — attente (~2-3 min pour 15m)...")

        # Wait for this pair's data to appear in DB
        ready = _wait_for_pair(symbol, MIN_CANDLES, timeout=300)
        counts = {tf: _db_count(symbol, tf) for tf in TFS}

        if ready:
            log(f"    ✓ {symbol}: 4H={counts['4h']:,} 1H={counts['1h']:,} 15m={counts['15m']:,}")
            success.append(symbol)
        else:
            # Accept partial data if at least 15m has some coverage
            has_15m = counts["15m"] >= 5000
            has_1h  = counts["1h"]  >= 1000
            has_4h  = counts["4h"]  >= 200
            if has_4h and has_1h and has_15m:
                log(f"    ⚠ {symbol}: données partielles acceptées "
                    f"4H={counts['4h']:,} 1H={counts['1h']:,} 15m={counts['15m']:,}")
                success.append(symbol)
            else:
                log(f"    ✗ {symbol}: insuffisant 4H={counts['4h']:,} 1H={counts['1h']:,} 15m={counts['15m']:,}")
                failed.append(symbol)

        # Brief pause between pairs to let DB settle
        time.sleep(5)

    log(f"\nPhase 1 terminée: {len(success)}/{len(PAIRS)} paires prêtes")
    if failed:
        log(f"Paires exclues: {failed}")
    return success


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2: Optimize profiles
# ─────────────────────────────────────────────────────────────────────────────

def get_base_params():
    r = requests.get(f"{BASE}/strategy/profiles", timeout=10)
    profiles = r.json().get("rows", [])
    p15 = next((p for p in profiles if p["id"] == 15), None)
    if not p15:
        raise RuntimeError("Profil id=15 introuvable")
    return json.loads(p15["parameters"])


def build_params(base, combo, symbol):
    p = copy.deepcopy(base)
    p["bull_config"]["take_profit_rr"]   = combo["bull_rr"]
    p["bull_config"]["wyckoff_lookback"] = combo["lb"]
    p["bear_config"]["take_profit_rr"]   = combo["bear_rr"]
    p["bear_config"]["wyckoff_lookback"] = combo["lb"]
    return p


def create_profile(name, symbol, params):
    r = requests.post(f"{BASE}/strategy/profiles", json={
        "name": name,
        "symbol": symbol,
        "description": "Pipeline optimization temp",
        "parameters": params,
    }, timeout=10)
    data = r.json()
    return data.get("profile", {}).get("id") or data.get("id")


def update_profile(pid, name, symbol, params):
    requests.put(f"{BASE}/strategy/profiles/{pid}", json={
        "name": name,
        "symbol": symbol,
        "description": f"Profil Dual-Mode optimisé — {symbol}",
        "parameters": params,
    }, timeout=10)


def delete_profile(pid):
    try:
        requests.delete(f"{BASE}/strategy/profiles/{pid}", timeout=5)
    except Exception:
        pass


def run_backtest(symbol, profile_id, timeout=360):
    try:
        r = requests.post(f"{BASE}/backtest/replay/start", json={
            "symbol": symbol,
            "date_start": DATE_START,
            "date_end":   DATE_END,
            "profile_id": profile_id,
        }, timeout=15)
        sid = r.json().get("session_id")
        if not sid:
            return None
    except Exception:
        return None

    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(4)
        try:
            s = requests.get(f"{BASE}/backtest/replay/status/{sid}", timeout=8).json()
            st = s.get("status", "")
            if st == "COMPLETED":
                return s
            if st in ("FAILED", "ERROR"):
                return None
        except Exception:
            pass
    return None


def composite_score(result):
    if not result:
        return -999.0
    m  = result.get("metrics", {})
    pf = m.get("profit_factor", 0.0)
    dd = m.get("max_drawdown",  1.0)
    wr = m.get("win_rate",      0.0)
    n  = m.get("total_trades",  0)
    if n < 8 or pf <= 0:
        return -999.0
    return pf * (1.0 - dd) * (1.0 + wr)


def run_combo_batch(symbol, batch_combos, base_params, results_out, pids_out):
    pids  = []
    store = [None] * len(batch_combos)

    for combo in batch_combos:
        tag  = f"B{combo['bull_rr']}_b{combo['bear_rr']}_lb{combo['lb']}"
        name = f"_tmp_{symbol}_{tag}"
        pid  = create_profile(name, symbol, build_params(base_params, combo, symbol))
        pids.append(pid)

    threads = []
    for i, (combo, pid) in enumerate(zip(batch_combos, pids)):
        if not pid:
            continue
        def _run(idx, sym, p, store=store):
            store[idx] = run_backtest(sym, p)
        t = threading.Thread(target=_run, args=(i, symbol, pid))
        threads.append(t)
        t.start()
    for t in threads:
        t.join()

    for combo, pid, result in zip(batch_combos, pids, store):
        sc = composite_score(result)
        m  = result.get("metrics", {}) if result else {}
        log(f"    [{symbol}] BullRR={combo['bull_rr']} BearRR={combo['bear_rr']} lb={combo['lb']} "
            f"→ PF={m.get('profit_factor',0):.2f} WR={m.get('win_rate',0)*100:.0f}% "
            f"DD={m.get('max_drawdown',0)*100:.1f}% T={m.get('total_trades',0)} score={sc:.3f}")
        results_out.append((sc, combo, result, pid))
        pids_out.append(pid)


def phase2_optimize(valid_pairs):
    log("\n" + "═" * 72)
    log("PHASE 2 — Optimisation profils (12 combos × paire, 3 en parallèle)")
    log("═" * 72)

    base_params = get_base_params()
    winners = {}
    all_temp_ids = []

    for idx, symbol in enumerate(valid_pairs):
        log(f"\n[{idx+1}/{len(valid_pairs)}] {symbol} — optimisation...")

        pair_name = f"{symbol}-SMC-Dual-Optimized"
        init_params = build_params(base_params, {"bull_rr": 4.0, "bear_rr": 2.0, "lb": 16}, symbol)
        pair_pid = create_profile(pair_name, symbol, init_params)
        if not pair_pid:
            log(f"  ✗ Création profil échouée pour {symbol}")
            continue
        log(f"  Profil id={pair_pid} créé — lancement 12 combos ({MAX_PARALLEL} en //)...")

        combo_results = []
        temp_ids      = []
        batches = [GRID[i:i+MAX_PARALLEL] for i in range(0, len(GRID), MAX_PARALLEL)]
        for batch in batches:
            run_combo_batch(symbol, batch, base_params, combo_results, temp_ids)

        all_temp_ids.extend(temp_ids)

        valid = [x for x in combo_results if x[0] > -999]
        if not valid:
            log(f"  ✗ Aucun combo valide pour {symbol}")
            winners[symbol] = {"pid": pair_pid, "combo": None, "result": None}
            continue

        best_sc, best_combo, best_result, _ = max(valid, key=lambda x: x[0])
        m = best_result.get("metrics", {}) if best_result else {}
        log(f"  ★ WINNER: BullRR={best_combo['bull_rr']} BearRR={best_combo['bear_rr']} lb={best_combo['lb']}"
            f" | PF={m.get('profit_factor',0):.2f} WR={m.get('win_rate',0)*100:.1f}%"
            f" DD={m.get('max_drawdown',0)*100:.1f}% T={m.get('total_trades',0)}")

        best_params = build_params(base_params, best_combo, symbol)
        update_profile(pair_pid, pair_name, symbol, best_params)
        winners[symbol] = {"pid": pair_pid, "combo": best_combo, "result": best_result}

    log(f"\nNettoyage {len(all_temp_ids)} profils temporaires...")
    for pid in all_temp_ids:
        delete_profile(pid)
    log("Nettoyage terminé.")
    return winners


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3: Final validation + ranking
# ─────────────────────────────────────────────────────────────────────────────

def compound_stats(trades, capital=CAPITAL, risk=RISK_PCT, years=YEARS):
    cap = float(capital)
    eq  = [cap]
    for t in trades:
        cap += cap * risk * t.get("r_multiple", 0)
        eq.append(cap)

    profit  = cap - capital
    pct     = profit / capital * 100
    cagr    = ((cap / capital) ** (1 / years) - 1) * 100 if cap > 0 else 0
    monthly = profit / (years * 12)

    peak = capital
    max_dd = 0.0
    for e in eq:
        if e > peak:
            peak = e
        dd = (peak - e) / peak * 100
        if dd > max_dd:
            max_dd = dd

    return {"final": cap, "profit": profit, "pct": pct,
            "cagr": cagr, "monthly": monthly, "max_dd_real": max_dd}


def phase3_ranking(winners):
    log("\n" + "═" * 72)
    log("PHASE 3 — Validation finale et classement")
    log("═" * 72)

    ranking = []

    for symbol, info in winners.items():
        if not info.get("combo"):
            log(f"  Skipping {symbol} — pas de combo gagnant")
            continue

        pid = info["pid"]
        log(f"  Backtest final {symbol} (id={pid})...")
        final = run_backtest(symbol, pid, timeout=420)
        if not final:
            log(f"  ✗ Backtest final échoué pour {symbol}")
            continue

        m      = final.get("metrics", {})
        trades = final.get("trades", [])
        stats  = compound_stats(trades)

        longs  = sum(1 for t in trades if t.get("direction") == "LONG")
        shorts = sum(1 for t in trades if t.get("direction") == "SHORT")

        ranking.append({
            "symbol":  symbol,
            "pid":     pid,
            "combo":   info["combo"],
            "trades":  m.get("total_trades", 0),
            "longs":   longs,
            "shorts":  shorts,
            "wr":      m.get("win_rate", 0),
            "pf":      m.get("profit_factor", 0),
            "total_r": m.get("total_r", 0),
            "max_dd":  m.get("max_drawdown", 0),
            **stats,
        })
        log(f"  ✓ {symbol}: CAGR={stats['cagr']:.1f}%  Profit={stats['profit']:+,.0f}$"
            f"  PF={m.get('profit_factor',0):.2f}")

    ranking.sort(key=lambda x: x["cagr"], reverse=True)

    # ── Table ─────────────────────────────────────────────────────────────────
    W = 120
    print()
    print("╔" + "═" * W + "╗")
    print("║" + " CLASSEMENT FINAL — USDC Dual-Mode Profiles ".center(W) + "║")
    print("║" + f" Capital: {CAPITAL:,.0f}$ | Risk: {RISK_PCT*100:.1f}%/trade | Compoundé | {DATE_START[:10]} → {DATE_END[:10]} ".center(W) + "║")
    print("╠" + "═" * W + "╣")
    hdr = (f"  {'#':<3} {'Paire':<12} {'Trades':>6} {'L/S':>9} {'WR%':>6} {'PF':>5}"
           f" {'TotalR':>7} {'DD%':>6} {'CAGR%':>7} {'Gain $':>10}"
           f" {'Cap fin':>10} {'$/mois':>9}  {'B_RR':>5} {'b_RR':>5} {'lb':>4}")
    print("║" + hdr + " " * max(0, W - len(hdr)) + "║")
    print("╠" + "═" * W + "╣")

    for i, r in enumerate(ranking, 1):
        c  = r["combo"]
        ls = f"{r['longs']}L/{r['shorts']}S"
        line = (f"  {i:<3} {r['symbol']:<12} {r['trades']:>6} {ls:>9} "
                f"{r['wr']*100:>5.1f}% {r['pf']:>5.2f}"
                f" {r['total_r']:>+6.1f}R {r['max_dd']*100:>5.1f}% "
                f"{r['cagr']:>6.1f}% {r['profit']:>+9,.0f}$ "
                f"{r['final']:>9,.0f}$ {r['monthly']:>+8,.0f}$/m"
                f"  {c['bull_rr']:>5} {c['bear_rr']:>5} {c['lb']:>4}")
        print("║" + line + " " * max(0, W - len(line)) + "║")

    print("╚" + "═" * W + "╝")

    # Stats summary
    if ranking:
        best  = ranking[0]
        worst = ranking[-1]
        cagrs = [r["cagr"] for r in ranking]
        print(f"\n  Meilleur:  {best['symbol']} (CAGR {best['cagr']:.1f}%)")
        print(f"  Moins bon: {worst['symbol']} (CAGR {worst['cagr']:.1f}%)")
        print(f"  Médiane CAGR: {sorted(cagrs)[len(cagrs)//2]:.1f}%")
        print(f"  {len(ranking)} profils optimisés en DB.\n")

    return ranking


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    t0 = time.time()
    log("=" * 72)
    log("USDC FULL OPTIMIZATION PIPELINE — START")
    log(f"Paires: {len(PAIRS)} | Combos/paire: {len(GRID)} | Période: {DATE_START[:10]}→{DATE_END[:10]}")
    log("=" * 72)

    valid = phase1_import()

    if not valid:
        log("ERREUR: aucune paire importée. Abandon.")
        sys.exit(1)

    log(f"\n{len(valid)} paires prêtes pour l'optimisation: {valid}")
    winners = phase2_optimize(valid)

    ranking = phase3_ranking(winners)

    elapsed = (time.time() - t0) / 60
    log(f"Pipeline complet en {elapsed:.1f} minutes — {len(ranking)} profils dans la DB.")
