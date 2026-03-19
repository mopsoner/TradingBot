from __future__ import annotations

import json
import os
import signal
import sqlite3
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
REPORT_PATH = ROOT / "data" / "backtest_report.json"
RUNTIME_PATH_DEFAULT = ROOT / "data" / "runtime_control.json"
DATA_DIR = ROOT / "data"


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
        for p in sorted(DATA_DIR.glob('*.json')):
            try:
                stat = p.stat()
                out.append({'name': p.name, 'size': stat.st_size, 'mtime': int(stat.st_mtime * 1000), 'url': f'/data/{p.name}'})
            except Exception:
                continue
        return out

    def _list_cached_symbols(self) -> list[str]:
        try:
            cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
            db_path = ROOT / cfg.get('ohlc_cache_db_path', 'data/ohlc_cache.db')
            if not db_path.exists():
                return []
            with sqlite3.connect(db_path) as conn:
                rows = conn.execute("SELECT DISTINCT symbol FROM ohlc_cache ORDER BY symbol ASC").fetchall()
            return [r[0] for r in rows if r and r[0]]
        except Exception:
            return []

    def do_GET(self):
        if self.path.startswith('/api/config'):
            try:
                data = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
                return self._json(200, {"ok": True, "config": data})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if self.path.startswith('/api/backtest_report'):
            if not REPORT_PATH.exists():
                return self._json(200, {"ok": True, "report": None})
            try:
                data = json.loads(REPORT_PATH.read_text(encoding='utf-8'))
                return self._json(200, {"ok": True, "report": data})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if self.path.startswith('/api/runtime'):
            p = self._runtime_path()
            if not p.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(json.dumps({"paused": False}), encoding='utf-8')
            try:
                data = json.loads(p.read_text(encoding='utf-8'))
                return self._json(200, {"ok": True, "runtime": data})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        if self.path.startswith('/api/processes'):
            return self._json(200, {"ok": True, "processes": self._list_processes()})
        if self.path.startswith('/api/data-files'):
            return self._json(200, {"ok": True, "files": self._list_data_files()})
        if self.path.startswith('/api/cached-symbols'):
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
    print(f'Serving on http://0.0.0.0:{port}')
    httpd.serve_forever()


if __name__ == '__main__':
    main()
