#!/bin/bash
PROJECT_ROOT="/home/digitalport2budget/htdocs/budget.digitalport.my"
API_DIR="$PROJECT_ROOT/apps/api"
read_env_value() {
  local key="$1"
  local file="$2"
  if [ -f "$file" ]; then
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); gsub(/^"|"$/, ""); print; exit }' "$file"
  fi
}
API_HOST="${API_HOST:-$(read_env_value API_HOST "$API_DIR/.env")}"
API_PORT="${API_PORT:-$(read_env_value API_PORT "$API_DIR/.env")}"
API_HOST="${API_HOST:-0.0.0.0}"
API_PORT="${API_PORT:-8023}"

echo "Stopping API service..."
pid=$(ss -ltnp | awk -v port=":$API_PORT" '$0 ~ port {print $NF}' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n1)
if [ -n "$pid" ]; then
  kill -9 "$pid" || true
fi
sleep 2

echo "Starting API service..."
cd "$API_DIR"
setsid -f env PYTHONUNBUFFERED=1 venv/bin/python main.py > backend.log 2>&1

for i in {1..10}; do
  if ss -ltn | grep -q ":$API_PORT"; then
    echo "API service started on $API_HOST:$API_PORT."
    exit 0
  fi
  sleep 1
done

echo "Failed to start API service on $API_HOST:$API_PORT."
exit 1
