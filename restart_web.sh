#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/home/digitalport2budget/htdocs/budget.digitalport.my"
WEB_DIR="$PROJECT_ROOT/apps/web"
DEPLOY_ENV_FILE="${WEB_DEPLOY_ENV_FILE:-$WEB_DIR/.env.deploy}"
RUNTIME_DIR="$WEB_DIR/.runtime"
RELEASES_DIR="$RUNTIME_DIR/releases"
STATE_FILE="$RUNTIME_DIR/active.env"
GATEWAY_PID_FILE="$RUNTIME_DIR/gateway.pid"
SLOT_A_PID_FILE="$RUNTIME_DIR/slot-a.pid"
SLOT_B_PID_FILE="$RUNTIME_DIR/slot-b.pid"
GATEWAY_LOG_FILE="$RUNTIME_DIR/gateway.log"
SLOT_A_LOG_FILE="$RUNTIME_DIR/slot-a.log"
SLOT_B_LOG_FILE="$RUNTIME_DIR/slot-b.log"

if [ -f "$DEPLOY_ENV_FILE" ]; then
  log() {
    echo "[web] $*"
  }
  log "Loading deploy config from $DEPLOY_ENV_FILE"
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV_FILE"
fi

GATEWAY_HOST="${WEB_GATEWAY_HOST:-127.0.0.1}"
GATEWAY_PORT="${WEB_GATEWAY_PORT:-8022}"
SLOT_A_PORT="${WEB_SLOT_A_PORT:-18122}"
SLOT_B_PORT="${WEB_SLOT_B_PORT:-18123}"
HEALTH_PATH="${WEB_HEALTH_PATH:-/build-version.json}"
DRAIN_SECONDS="${WEB_DRAIN_SECONDS:-8}"
KEEP_RELEASE_COUNT="${WEB_KEEP_RELEASE_COUNT:-4}"
SLOT_HOST="${WEB_SLOT_HOST:-127.0.0.1}"

mkdir -p "$RUNTIME_DIR" "$RELEASES_DIR"

log() {
  echo "[web] $*"
}

pid_from_file() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    tr -d '[:space:]' < "$pid_file"
  fi
}

is_pid_running() {
  local pid="${1:-}"
  if [ -z "$pid" ]; then
    return 1
  fi

  kill -0 "$pid" 2>/dev/null
}

pidfile_is_running() {
  local pid_file="$1"
  local pid
  pid="$(pid_from_file "$pid_file")"
  is_pid_running "$pid"
}

port_listener_pid() {
  local port="$1"
  local pid=""

  pid="$(fuser -v "$port/tcp" 2>/dev/null | awk '{
    for (i = 1; i <= NF; i++) {
      if ($i ~ /^[0-9]+$/) {
        print $i
        exit
      }
    }
  }' || true)"
  if [ -n "$pid" ]; then
    printf '%s\n' "$pid"
    return 0
  fi

  pid="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [ -n "$pid" ]; then
    printf '%s\n' "$pid"
  fi
}

wait_for_port_to_clear() {
  local port="$1"
  local timeout_seconds="$2"

  for ((i = 0; i < timeout_seconds; i++)); do
    if [ -z "$(port_listener_pid "$port")" ]; then
      return 0
    fi
    sleep 1
  done

  return 1
}

wait_for_http() {
  local url="$1"
  local timeout_seconds="$2"

  for ((i = 0; i < timeout_seconds; i++)); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

read_state() {
  ACTIVE_SLOT=""
  ACTIVE_PORT=""
  ACTIVE_RELEASE_DIR=""
  BUILD_VERSION=""
  UPDATED_AT=""

  if [ -f "$STATE_FILE" ]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
  fi
}

write_state() {
  local slot="$1"
  local port="$2"
  local release_dir="$3"
  local build_version="$4"
  local tmp_file="$STATE_FILE.tmp"

  cat > "$tmp_file" <<EOF
ACTIVE_SLOT='$slot'
ACTIVE_PORT='$port'
ACTIVE_RELEASE_DIR='$release_dir'
BUILD_VERSION='$build_version'
UPDATED_AT='$(date -u +%Y-%m-%dT%H:%M:%SZ)'
EOF

  mv "$tmp_file" "$STATE_FILE"
}

stop_pidfile_process() {
  local pid_file="$1"
  local label="$2"
  local pid
  pid="$(pid_from_file "$pid_file")"

  if ! is_pid_running "$pid"; then
    rm -f "$pid_file"
    return 0
  fi

  log "Stopping $label (pid $pid)..."
  kill "$pid" 2>/dev/null || true

  for _ in {1..15}; do
    if ! is_pid_running "$pid"; then
      rm -f "$pid_file"
      return 0
    fi
    sleep 1
  done

  log "Force stopping $label (pid $pid)..."
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$pid_file"
}

detect_build_version_from_port() {
  local port="$1"
  curl -fsS --max-time 2 "http://$SLOT_HOST:$port$HEALTH_PATH" \
    | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

prepare_release_dir() {
  local release_id
  local release_dir

  release_id="$(date -u +%Y%m%d%H%M%S)"
  release_dir="$RELEASES_DIR/$release_id"

  mkdir -p "$release_dir"
  rsync -a --delete \
    --exclude "node_modules" \
    --exclude ".runtime" \
    --exclude "web.log" \
    "$WEB_DIR/" "$release_dir/"

  ln -sfn "$WEB_DIR/node_modules" "$release_dir/node_modules"
  printf '%s\n' "$release_dir"
}

start_slot() {
  local slot="$1"
  local port="$2"
  local pid_file="$3"
  local log_file="$4"
  local release_dir="$5"
  local listener_pid
  local tracked_pid

  listener_pid="$(port_listener_pid "$port")"
  tracked_pid="$(pid_from_file "$pid_file")"

  if [ -n "$listener_pid" ] && [ "$listener_pid" != "$tracked_pid" ]; then
    log "Port $port is already in use by unexpected pid $listener_pid. Aborting deploy."
    exit 1
  fi

  stop_pidfile_process "$pid_file" "slot $slot"

  if ! wait_for_port_to_clear "$port" 20; then
    log "Port $port did not clear after stopping slot $slot."
    exit 1
  fi

  log "Starting slot $slot on $SLOT_HOST:$port using release $release_dir..."
  rm -f "$pid_file"
  setsid -f bash -lc "cd '$release_dir' && exec '$WEB_DIR/node_modules/.bin/next' start -H $SLOT_HOST -p $port" \
    >> "$log_file" 2>&1

  if ! wait_for_http "http://$SLOT_HOST:$port$HEALTH_PATH" 60; then
    log "Slot $slot failed health checks. See $log_file"
    listener_pid="$(port_listener_pid "$port")"
    if [ -n "$listener_pid" ]; then
      echo "$listener_pid" > "$pid_file"
    fi
    stop_pidfile_process "$pid_file" "failed slot $slot"
    exit 1
  fi

  listener_pid="$(port_listener_pid "$port")"
  if [ -z "$listener_pid" ]; then
    log "Slot $slot passed health checks but listener pid could not be detected."
    exit 1
  fi
  echo "$listener_pid" > "$pid_file"
}

gateway_is_healthy() {
  curl -fsS --max-time 2 "http://$GATEWAY_HOST:$GATEWAY_PORT/__gateway/health" \
    | grep -q '"service":"budgetdigital-web-gateway"'
}

ensure_gateway_running() {
  local listener_pid

  if pidfile_is_running "$GATEWAY_PID_FILE" && gateway_is_healthy; then
    return 0
  fi

  listener_pid="$(port_listener_pid "$GATEWAY_PORT")"

  if [ -n "$listener_pid" ]; then
    if gateway_is_healthy; then
      echo "$listener_pid" > "$GATEWAY_PID_FILE"
      return 0
    fi

    log "Port $GATEWAY_PORT is held by a legacy web process (pid $listener_pid). Performing one-time cutover..."
    kill "$listener_pid" 2>/dev/null || true

    for _ in {1..15}; do
      if ! is_pid_running "$listener_pid"; then
        break
      fi
      sleep 1
    done

    if is_pid_running "$listener_pid"; then
      kill -9 "$listener_pid" 2>/dev/null || true
    fi

    if ! wait_for_port_to_clear "$GATEWAY_PORT" 20; then
      log "Port $GATEWAY_PORT is still busy after stopping legacy listener."
      exit 1
    fi
  fi

  log "Starting stable web gateway on port $GATEWAY_PORT..."
  nohup env WEB_GATEWAY_PORT="$GATEWAY_PORT" WEB_ROUTE_FILE="$STATE_FILE" \
    node "$WEB_DIR/scripts/web-gateway.mjs" >> "$GATEWAY_LOG_FILE" 2>&1 &
  echo "$!" > "$GATEWAY_PID_FILE"

  if ! wait_for_http "http://$GATEWAY_HOST:$GATEWAY_PORT/__gateway/health" 20; then
    log "Gateway failed to start. See $GATEWAY_LOG_FILE"
    exit 1
  fi
}

prune_old_releases() {
  local keep_release_a="$1"
  local keep_release_b="${2:-}"
  local count=0
  local release_dir

  while IFS= read -r release_dir; do
    if [ "$release_dir" = "$keep_release_a" ] || [ "$release_dir" = "$keep_release_b" ]; then
      continue
    fi

    count=$((count + 1))
    if [ "$count" -gt "$KEEP_RELEASE_COUNT" ]; then
      rm -rf "$release_dir"
    fi
  done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort -r)
}

if [ ! -d "$WEB_DIR/.next" ]; then
  log "No production build found in $WEB_DIR/.next"
  log "Run ./build_web.sh first so the new release can be deployed without downtime."
  exit 1
fi

read_state

PREVIOUS_SLOT="${ACTIVE_SLOT:-}"
PREVIOUS_RELEASE_DIR="${ACTIVE_RELEASE_DIR:-}"

if [ "${ACTIVE_SLOT:-}" = "a" ]; then
  NEXT_SLOT="b"
  NEXT_PORT="$SLOT_B_PORT"
  NEXT_PID_FILE="$SLOT_B_PID_FILE"
  NEXT_LOG_FILE="$SLOT_B_LOG_FILE"
  PREVIOUS_PID_FILE="$SLOT_A_PID_FILE"
else
  NEXT_SLOT="a"
  NEXT_PORT="$SLOT_A_PORT"
  NEXT_PID_FILE="$SLOT_A_PID_FILE"
  NEXT_LOG_FILE="$SLOT_A_LOG_FILE"
  PREVIOUS_PID_FILE="$SLOT_B_PID_FILE"
fi

RELEASE_DIR="$(prepare_release_dir)"
start_slot "$NEXT_SLOT" "$NEXT_PORT" "$NEXT_PID_FILE" "$NEXT_LOG_FILE" "$RELEASE_DIR"

BUILD_VERSION_DETECTED="$(detect_build_version_from_port "$NEXT_PORT")"
if [ -z "$BUILD_VERSION_DETECTED" ]; then
  BUILD_VERSION_DETECTED="unknown"
fi

write_state "$NEXT_SLOT" "$NEXT_PORT" "$RELEASE_DIR" "$BUILD_VERSION_DETECTED"
ensure_gateway_running

if ! wait_for_http "http://$GATEWAY_HOST:$GATEWAY_PORT$HEALTH_PATH" 15; then
  log "Gateway did not become ready after switching traffic."
  exit 1
fi

log "Traffic switched to slot $NEXT_SLOT on port $NEXT_PORT."
log "Active build version: $BUILD_VERSION_DETECTED"

if [ -n "$PREVIOUS_SLOT" ] && [ "$PREVIOUS_SLOT" != "$NEXT_SLOT" ]; then
  log "Draining previous slot $PREVIOUS_SLOT for ${DRAIN_SECONDS}s before shutdown..."
  sleep "$DRAIN_SECONDS"
  stop_pidfile_process "$PREVIOUS_PID_FILE" "previous slot $PREVIOUS_SLOT"
fi

prune_old_releases "$RELEASE_DIR" "$PREVIOUS_RELEASE_DIR"

log "Zero-downtime web deploy completed successfully."
log "Gateway : http://$GATEWAY_HOST:$GATEWAY_PORT"
log "Active  : slot $NEXT_SLOT on $SLOT_HOST:$NEXT_PORT"
