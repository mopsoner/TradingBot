#!/bin/bash
PORT=${PORT:-3000}
exec uvicorn backend.app.main:app --host 0.0.0.0 --port "$PORT" --workers 1
