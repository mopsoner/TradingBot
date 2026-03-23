from __future__ import annotations

import json
import os
import signal
import sqlite3
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from console_colors import headline, success

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
REPORT_PATH = ROOT / "data" / "backtest_report.json"
TRADES_PATH = ROOT / "data" / "backtest_trades.json"
RUNTIME_PATH_DEFAULT = ROOT / "data" / "runtime_control.json"
DATA_DIR = ROOT / "data"
BACKTEST_RUNS_DIR = DATA_DIR / "backtests"
BACKTEST_RUNS_INDEX = BACKTEST_RUNS_DIR / "index.json"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _runtime_path(self) -> Path:
        try:
            cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
            custom = cfg.get('runtime_control_path')
            if custom:
                return ROOT / custom if not custom.startswith('/') else Path(custom)
        except Exception:
            pass
        return RUNTIME_PATH_DEFAULT

    def _db_path(self) -> Path:
        try:
            cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
            custom = cfg.get('database_path', 'data/signals.db')
            return ROOT / custom if not str(custom).startswith('/') else Path(custom)
        except Exception:
            return ROOT / 'data/signals.db'

    def _ohlc_db_path(self) -> Path:
        try:
            cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
            custom = cfg.get('ohlc_cache_db_path', 'data/ohlc_cache.db')
            return ROOT / custom if not str(custom).startswith('/') else Path(custom)
        except Exception:
            return ROOT / 'data/ohlc_cache.db'

    def _list_processes(self) -> list[dict]:
        try:
            output = subprocess.check_output(['ps', '-eo', 'pid,etime,cmd'], text=True)
        except Exception:
            return []
        rows = output.splitlines()[1:]
        out = []
        keywords = ['runner.py', 'backtest.py', 'admin_server.py', 'http.server', 'binance_rest_smc_v231']
        for row in rows:
            parts = row.strip().split(None, 2)
            if len(parts) < 3:
                continue
            pid_s, etime, cmd = parts
            if not any(k in cmd for k in keywords):
                continue
            try:
                pid = int(pid_s)
            except ValueError:
                continue
            out.append({'pid': pid, 'etime': etime, 'cmd': cmd})
        return out

    def _list_data_files(self) -> list[dict]:
        if not DATA_DIR.exists():
            return []
        out = []
        for p in sorted(DATA_DIR.glob('*')):
            if p.is_dir():
                continue
            try:
                stat = p.stat()
                out.append({'name': p.name, 'size': stat.st_size, 'mtime': int(stat.st_mtime * 1000), 'url': f'/data/{p.name}'})
            except Exception:
                continue
        return out

    def _list_cached_symbols(self) -> list[str]:
        try:
            db_path = self._ohlc_db_path()
            if not db_path.exists():
                return []
            with sqlite3.connect(db_path) as conn:
                rows = conn.execute("SELECT DISTINCT symbol FROM ohlc_cache ORDER BY symbol ASC").fetchall()
            return [r[0] for r in rows if r and r[0]]
        except Exception:
            return []

    def _list_live_confirmed_signals(self, limit: int = 200) -> list[dict]:
        db_path = self._db_path()
        if not db_path.exists():
            return []
        limit = max(1, min(limit, 1000))
        with sqlite3.connect(db_path) as conn:
            rows = conn.execute(
                "SELECT id, ts, symbol, session, price, rsi_5m, state, trigger, bias, tp_zone, score, payload FROM signals ORDER BY id DESC LIMIT ?",
                (limit * 5,),
            ).fetchall()
        out: list[dict] = []
        for row in rows:
            try:
                payload = json.loads(row[11]) if row[11] else {}
            except Exception:
                payload = {}
            trigger = payload.get('trigger') or row[7]
            bias = payload.get('bias') or row[8]
            if trigger == 'wait' and bias not in {'bull_confirm', 'bear_confirm'}:
                continue
            out.append({
                'id': row[0],
                'ts': row[1],
                'symbol': payload.get('symbol') or row[2],
                'session': payload.get('session') or row[3],
                'price': payload.get('price') or row[4],
                'rsi_main': payload.get('rsi_main', row[5]),
                'state': payload.get('state') or row[6],
                'trigger': trigger,
                'bias': bias,
                'tp_zone': bool(payload.get('tp_zone', row[9])),
                'score': payload.get('score', row[10]),
                'signal_time': payload.get('signal_time'),
                'signal_interval': payload.get('signal_interval'),
                'trade': payload.get('trade', {}),
                'liquidity_target': payload.get('liquidity_target', {}),
            })
            if len(out) >= limit:
                break
        return out

    def _list_live_runs(self, limit: int = 50) -> list[dict]:
        db_path = self._db_path()
        if not db_path.exists():
            return []
        with sqlite3.connect(db_path) as conn:
            rows = conn.execute(
                "SELECT run_id, started_at, completed_at, runtime_mode, all_symbols_count, batch_count, scanned_count, wait_count, watch_count, confirm_count, trade_count, blocked_count, error_count, batch_symbols_json, recent_symbols_json, stats_json FROM live_runs ORDER BY id DESC LIMIT ?",
                (max(1, min(limit, 200)),),
            ).fetchall()
        out = []
        for r in rows:
            out.append({
                'run_id': r[0], 'started_at': r[1], 'completed_at': r[2], 'runtime_mode': r[3],
                'all_symbols_count': r[4], 'batch_count': r[5], 'scanned_count': r[6],
                'wait_count': r[7], 'watch_count': r[8], 'confirm_count': r[9], 'trade_count': r[10],
                'blocked_count': r[11], 'error_count': r[12],
                'batch_symbols': json.loads(r[13] or '[]'), 'recent_symbols': json.loads(r[14] or '[]'), 'stats': json.loads(r[15] or '{}'),
            })
        return out

    def _list_setup_journal(self, limit: int = 200, symbol: str | None = None, stage: str | None = None, actionability: str | None = None) -> list[dict]:
        db_path = self._db_path()
        if not db_path.exists():
            return []
        q = "SELECT id, ts, run_id, symbol, session, stage, accepted, actionability, score, bias, trigger, state, reason, confirm_source, liquidity_type, liquidity_level, entry_price, stop_price, target_price, payload FROM setup_journal"
        where = []
        params: list[object] = []
        if symbol:
            where.append("symbol = ?")
            params.append(symbol.upper())
        if stage and stage != 'all':
            where.append("stage = ?")
            params.append(stage)
        if actionability and actionability != 'all':
            where.append("actionability = ?")
            params.append(actionability)
        if where:
            q += " WHERE " + " AND ".join(where)
        q += " ORDER BY id DESC LIMIT ?"
        params.append(max(1, min(limit, 500)))
        with sqlite3.connect(db_path) as conn:
            rows = conn.execute(q, tuple(params)).fetchall()
        out = []
        for r in rows:
            try:
                payload = json.loads(r[19] or '{}')
            except Exception:
                payload = {}
            out.append({
                'id': r[0], 'ts': r[1], 'run_id': r[2], 'symbol': r[3], 'session': r[4], 'stage': r[5], 'accepted': bool(r[6]),
                'actionability': r[7], 'score': r[8], 'bias': r[9], 'trigger': r[10], 'state': r[11], 'reason': r[12],
                'confirm_source': r[13], 'liquidity_type': r[14], 'liquidity_level': r[15], 'entry_price': r[16], 'stop_price': r[17], 'target_price': r[18],
                'payload': payload,
            })
        return out

    def _system_health(self) -> dict:
        runtime = {'paused': False}
        try:
            p = self._runtime_path()
            if p.exists():
                runtime = json.loads(p.read_text(encoding='utf-8'))
        except Exception:
            pass
        dashboard_path = ROOT / 'data' / 'dashboard.json'
        dashboard = None
        if dashboard_path.exists():
            try:
                dashboard = json.loads(dashboard_path.read_text(encoding='utf-8'))
            except Exception:
                dashboard = None
        db_ok = False
        ohlc_ok = False
        try:
            with sqlite3.connect(self._db_path()) as conn:
                db_ok = conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        except Exception:
            db_ok = False
        try:
            with sqlite3.connect(self._ohlc_db_path()) as conn:
                ohlc_ok = conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        except Exception:
            ohlc_ok = False
        runs = self._list_live_runs(limit=1)
        latest_run = runs[0] if runs else None
        processes = self._list_processes()
        last_log_line = None
        log_path = ROOT / 'logs' / 'runner_boot.log'
        if log_path.exists():
            try:
                lines = log_path.read_text(encoding='utf-8', errors='ignore').splitlines()
                last_log_line = lines[-1] if lines else None
            except Exception:
                last_log_line = None
        return {
            'runtime': runtime,
            'dashboard_generated_at': dashboard.get('generated_at') if dashboard else None,
            'dashboard_mode': dashboard.get('runtime', {}).get('mode') if dashboard else None,
            'db_ok': db_ok,
            'ohlc_ok': ohlc_ok,
            'process_count': len(processes),
            'runner_detected': any('runner.py' in p.get('cmd', '') for p in processes),
            'latest_run': latest_run,
            'last_log_line': last_log_line,
        }

    def _data_coverage(self) -> dict:
        db_path = self._ohlc_db_path()
        if not db_path.exists():
            return {'rows': [], 'symbols': [], 'intervals': []}
        with sqlite3.connect(db_path) as conn:
            rows = conn.execute(
                "SELECT symbol, interval, COUNT(*) as n, MIN(open_time), MAX(close_time) FROM ohlc_cache GROUP BY symbol, interval ORDER BY symbol ASC, interval ASC"
            ).fetchall()
        coverage_rows = []
        symbols = set()
        intervals = set()
        for r in rows:
            symbols.add(r[0])
            intervals.add(r[1])
            coverage_rows.append({
                'symbol': r[0],
                'interval': r[1],
                'count': r[2],
                'first_open_time': r[3],
                'last_close_time': r[4],
            })
        return {'rows': coverage_rows, 'symbols': sorted(symbols), 'intervals': sorted(intervals)}

    def _list_backtest_runs(self) -> list[dict]:
        if not BACKTEST_RUNS_INDEX.exists():
            return []
        try:
            data = json.loads(BACKTEST_RUNS_INDEX.read_text(encoding='utf-8'))
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def _load_backtest_run(self, run_id: str) -> tuple[dict | None, list | None]:
        for entry in self._list_backtest_runs():
            if entry.get('run_id') != run_id:
                continue
            report_file = entry.get('report_file')
            trades_file = entry.get('trades_file')
            if not report_file or not trades_file:
                return None, None
            report_path = BACKTEST_RUNS_DIR / report_file
            trades_path = BACKTEST_RUNS_DIR / trades_file
            if not report_path.exists() or not trades_path.exists():
                return None, None
            report = json.loads(report_path.read_text(encoding='utf-8'))
            trades = json.loads(trades_path.read_text(encoding='utf-8'))
            return report, trades
        return None, None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path.startswith('/api/config'):
            try:
                data = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
                return self._json(200, {"ok": True, "config": data})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if path.startswith('/api/backtest_report'):
            if not REPORT_PATH.exists():
                return self._json(200, {"ok": True, "report": None})
            try:
                data = json.loads(REPORT_PATH.read_text(encoding='utf-8'))
                return self._json(200, {"ok": True, "report": data})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if path.startswith('/api/backtest-runs'):
            return self._json(200, {"ok": True, "runs": self._list_backtest_runs()})
        if path.startswith('/api/backtest-run'):
            run_id = (query.get('run_id') or [None])[0]
            if not run_id:
                return self._json(400, {"ok": False, "error": 'run_id is required'})
            try:
                report, trades = self._load_backtest_run(run_id)
                if report is None:
                    return self._json(404, {"ok": False, "error": 'run not found'})
                return self._json(200, {"ok": True, "report": report, "trades": trades})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if path.startswith('/api/live-confirmed-signals'):
            try:
                limit = int((query.get('limit') or ['200'])[0])
                signals = self._list_live_confirmed_signals(limit=limit)
                return self._json(200, {"ok": True, "signals": signals})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if path.startswith('/api/live-runs'):
            try:
                limit = int((query.get('limit') or ['50'])[0])
                return self._json(200, {"ok": True, "runs": self._list_live_runs(limit=limit)})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if path.startswith('/api/setup-journal'):
            try:
                limit = int((query.get('limit') or ['200'])[0])
                symbol = (query.get('symbol') or [None])[0]
                stage = (query.get('stage') or [None])[0]
                actionability = (query.get('actionability') or [None])[0]
                rows = self._list_setup_journal(limit=limit, symbol=symbol, stage=stage, actionability=actionability)
                return self._json(200, {"ok": True, "rows": rows})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if path.startswith('/api/system-health'):
            return self._json(200, {"ok": True, "health": self._system_health()})
        if path.startswith('/api/data-coverage'):
            return self._json(200, {"ok": True, "coverage": self._data_coverage()})
        if path.startswith('/api/runtime'):
            p = self._runtime_path()
            if not p.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(json.dumps({"paused": False}), encoding='utf-8')
            try:
                data = json.loads(p.read_text(encoding='utf-8'))
                return self._json(200, {"ok": True, "runtime": data})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if path.startswith('/api/processes'):
            return self._json(200, {"ok": True, "processes": self._list_processes()})
        if path.startswith('/api/data-files'):
            return self._json(200, {"ok": True, "files": self._list_data_files()})
        if path.startswith('/api/cached-symbols'):
            return self._json(200, {"ok": True, "symbols": self._list_cached_symbols()})
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/config'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                raw = self.rfile.read(length)
                payload = json.loads(raw.decode('utf-8'))
                config = payload.get('config')
                if not isinstance(config, dict):
                    return self._json(400, {"ok": False, "error": "config must be an object"})
                CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
                return self._json(200, {"ok": True})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if self.path.startswith('/api/runtime'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                raw = self.rfile.read(length)
                payload = json.loads(raw.decode('utf-8'))
                runtime = payload.get('runtime')
                if not isinstance(runtime, dict):
                    return self._json(400, {"ok": False, "error": "runtime must be an object"})
                p = self._runtime_path()
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(json.dumps(runtime, ensure_ascii=False, indent=2), encoding='utf-8')
                return self._json(200, {"ok": True, "runtime": runtime})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if self.path.startswith('/api/processes/stop'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                raw = self.rfile.read(length)
                payload = json.loads(raw.decode('utf-8'))
                pid = int(payload.get('pid'))
                current_pid = os.getpid()
                if pid == current_pid:
                    return self._json(400, {"ok": False, "error": "Refusing to stop current admin server process"})
                os.kill(pid, signal.SIGTERM)
                return self._json(200, {"ok": True, "stopped_pid": pid})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if self.path.startswith('/api/run-backtest'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                raw = self.rfile.read(length)
                payload = json.loads(raw.decode('utf-8')) if length else {}
                symbol = payload.get('symbol')
                if not symbol or not isinstance(symbol, str):
                    return self._json(400, {"ok": False, "error": "symbol is required"})
                cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
                cfg.setdefault('backtest', {})['symbol'] = symbol.strip().upper()
                CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding='utf-8')
                proc = subprocess.Popen(['python3', 'backtest.py'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return self._json(200, {"ok": True, "symbol": cfg['backtest']['symbol'], "pid": proc.pid})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        return self._json(404, {"ok": False, "error": "not found"})


def main():
    port = int(os.environ.get('PORT', '8080'))
    httpd = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(headline(f'Serving admin UI on http://0.0.0.0:{port}'))
    print(success('Admin server ready'))
    httpd.serve_forever()


if __name__ == '__main__':
    main()
