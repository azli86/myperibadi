#!/bin/bash
set -euo pipefail
ROOT="/home/digitalport2budget/htdocs/budget.digitalport.my/apps/mastermind"
cd "$ROOT/api"
[ -x venv/bin/python ] || python3 -m venv venv
venv/bin/pip install -q -r requirements.txt
venv/bin/python -m py_compile main.py
cd "$ROOT/web"
npm ci --ignore-scripts
npm run build
