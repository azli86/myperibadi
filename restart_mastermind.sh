#!/bin/bash
set -euo pipefail
ROOT="/home/digitalport2budget/htdocs/budget.digitalport.my/apps/mastermind"
API_PORT="${MASTERMIND_API_PORT:-8031}"
WEB_PORT="${MASTERMIND_WEB_PORT:-8030}"
[ -f "$ROOT/api/.env" ] || { echo "Missing $ROOT/api/.env"; exit 1; }
# Kill all mastermind processes (next-server, uvicorn, node) by cwd regardless of listen state.
for pid in $(ps -eo pid,args | grep -E 'next start|next-server|uvicorn main:app' | grep -v grep | awk '{print $1}'); do
  cwd="$(readlink /proc/$pid/cwd 2>/dev/null || true)"
  case "$cwd" in
    "$ROOT/api"*|"$ROOT/web"*) kill -9 "$pid" 2>/dev/null || true ;;
  esac
done
# Also clear any lingering listeners on our ports.
for port in "$API_PORT" "$WEB_PORT"; do
  pid="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  [ -z "$pid" ] || kill -9 "$pid" 2>/dev/null || true
done
sleep 2
cd "$ROOT/api"
setsid -f venv/bin/uvicorn main:app --host 127.0.0.1 --port "$API_PORT" > mastermind-api.log 2>&1
cd "$ROOT/web"
setsid -f env MASTERMIND_API_INTERNAL_ORIGIN="http://127.0.0.1:$API_PORT" node_modules/.bin/next start -H 127.0.0.1 -p "$WEB_PORT" > mastermind-web.log 2>&1
for url in "http://127.0.0.1:$API_PORT/health" "http://127.0.0.1:$WEB_PORT"; do
  for _ in {1..30}; do curl -fsS "$url" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS "$url" >/dev/null || { echo "Failed: $url"; exit 1; }
done
echo "Mastermind started: web 127.0.0.1:$WEB_PORT, API 127.0.0.1:$API_PORT"
