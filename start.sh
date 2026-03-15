#!/bin/bash
echo "=== STARTUP: PORT env='${PORT}', using=${PORT:-8080} ==="
exec uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1
