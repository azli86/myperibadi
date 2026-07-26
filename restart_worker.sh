#!/bin/bash
PROJECT_ROOT="/home/digitalport2budget/htdocs/budget.digitalport.my"
WORKER_DIR="$PROJECT_ROOT/apps/worker"
API_ENV="$PROJECT_ROOT/apps/api/.env"
read_env_value() {
  local key="$1"
  local file="$2"
  if [ -f "$file" ]; then
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); gsub(/^"|"$/, ""); print; exit }' "$file"
  fi
}
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use default >/dev/null 2>&1 || true
fi
export WA_AUTOSTART_ALL_SESSIONS=true
export WA_AUTOSTART_STAGGER_MS=${WA_AUTOSTART_STAGGER_MS:-8000}
export WA_AUTOSTART_MAX_SESSIONS=${WA_AUTOSTART_MAX_SESSIONS:-20}
export WA_WEBHOOK_TIMEOUT_MS=${WA_WEBHOOK_TIMEOUT_MS:-120000}
export WA_CRYPTO_ERROR_WINDOW_MS=${WA_CRYPTO_ERROR_WINDOW_MS:-120000}
export WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD=${WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD:-20}
export WA_KEEP_ACTIVE_MS=${WA_KEEP_ACTIVE_MS:-60000}
export WA_KEEP_ACTIVE_STUCK_MS=${WA_KEEP_ACTIVE_STUCK_MS:-120000}
export WA_WORKER_HOST=${WA_WORKER_HOST:-$(read_env_value WA_WORKER_HOST "$API_ENV")}
export WA_WORKER_PORT=${WA_WORKER_PORT:-$(read_env_value WA_WORKER_PORT "$API_ENV")}
export WA_API_GATEWAY_URL=${WA_API_GATEWAY_URL:-$(read_env_value WA_API_GATEWAY_URL "$API_ENV")}
export WA_WORKER_HOST=${WA_WORKER_HOST:-127.0.0.1}
export WA_WORKER_PORT=${WA_WORKER_PORT:-8024}
export WA_API_GATEWAY_URL=${WA_API_GATEWAY_URL:-http://127.0.0.1:8023}
export WA_ALLOW_NON_SELF_DM=false

echo "Stopping WhatsApp Worker service..."
pkill -u $(whoami) -f "index_v2\\.js" || true
sleep 3
if pgrep -u $(whoami) -f "index_v2\\.js" >/dev/null; then
  echo "Force stopping lingering worker process..."
  pkill -9 -u $(whoami) -f "index_v2\\.js" || true
fi
sleep 2

echo "Starting WhatsApp Worker service..."
cd "$WORKER_DIR"
setsid -f node index_v2.js > worker.log 2>&1

if pgrep -u $(whoami) -f "index_v2\\.js" >/dev/null; then
  worker_count=$(pgrep -u $(whoami) -f "index_v2\\.js" | wc -l | tr -d ' ')
  if [ "$worker_count" -gt 1 ]; then
    echo "Warning: $worker_count worker processes detected. Keeping latest and stopping duplicates..."
    latest_pid=$(pgrep -u $(whoami) -f "index_v2\\.js" | tail -n 1)
    for pid in $(pgrep -u $(whoami) -f "index_v2\\.js"); do
      if [ "$pid" != "$latest_pid" ]; then
        kill -9 "$pid" || true
      fi
    done
  fi
  echo "WhatsApp Worker service started on $WA_WORKER_HOST:$WA_WORKER_PORT."
  echo "Autostart: WA_AUTOSTART_ALL_SESSIONS=$WA_AUTOSTART_ALL_SESSIONS WA_AUTOSTART_STAGGER_MS=$WA_AUTOSTART_STAGGER_MS WA_AUTOSTART_MAX_SESSIONS=$WA_AUTOSTART_MAX_SESSIONS WA_WEBHOOK_TIMEOUT_MS=$WA_WEBHOOK_TIMEOUT_MS WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD=$WA_CRYPTO_ERROR_QUARANTINE_THRESHOLD WA_API_GATEWAY_URL=$WA_API_GATEWAY_URL"
else
  echo "Failed to start WhatsApp Worker service."
  exit 1
fi
