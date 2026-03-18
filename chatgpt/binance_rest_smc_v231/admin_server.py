from __future__ import annotations

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
REPORT_PATH = ROOT / "data" / "backtest_report.json"
RUNTIME_PATH_DEFAULT = ROOT / "data" / "runtime_control.json"


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
        return self._json(404, {"ok": False, "error": "not found"})


def main():
    port = int(os.environ.get('PORT', '8080'))
    httpd = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f'Serving on http://0.0.0.0:{port}')
    httpd.serve_forever()


if __name__ == '__main__':
    main()
