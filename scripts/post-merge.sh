#!/bin/bash
set -e

cd /home/runner/workspace

if [ -f "frontend/package.json" ]; then
  cd frontend && npm install --no-audit --no-fund && cd ..
fi

if [ -f "pyproject.toml" ]; then
  pip install -q -e . 2>&1 || true
fi

python3 -c "
from backend.app.db.session import init_db
init_db()
print('DB migrations applied successfully')
"
