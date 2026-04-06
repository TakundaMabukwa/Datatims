#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
VPN_PID_FILE="${VPN_PID_FILE:-/tmp/datatims-openconnect.pid}"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-45}"
LOG_FILE="${LOG_FILE:-$ROOT_DIR/logs/pull-live.log}"
VIEW_NAME="${1:-${DB_VIEW:-epssched.vsl_drmaster}}"
ROW_LIMIT="${2:-${DB_LIMIT:-10}}"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

pick_first() {
  for value in "$@"; do
    if [[ -n "${value:-}" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done
  return 1
}

pick_optional() {
  for value in "$@"; do
    if [[ -n "${value:-}" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done
  printf '%s' ''
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local timeout_seconds="$3"
  local elapsed=0

  while (( elapsed < timeout_seconds )); do
    if command -v nc >/dev/null 2>&1; then
      if nc -z -w 2 "$host" "$port" >/dev/null 2>&1; then
        return 0
      fi
    else
      if bash -c "exec 3<>/dev/tcp/$host/$port" >/dev/null 2>&1; then
        return 0
      fi
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

run_with_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
    return 0
  fi

  if [[ -n "${SUDO_PASSWORD_VALUE:-}" ]]; then
    printf '%s\n' "$SUDO_PASSWORD_VALUE" | sudo -S -p '' "$@"
    return 0
  fi

  sudo -n "$@"
}

load_env_file "$ENV_FILE"

mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] pull-live starting"
echo "Using env file: $ENV_FILE"
echo "Logging to: $LOG_FILE"

VPN_HOST_VALUE="$(pick_first "${VPN_HOST:-}" "${vpn_host:-}")"
VPN_USERNAME_VALUE="$(pick_first "${VPN_USERNAME:-}" "${vpn_username:-}")"
VPN_PASSWORD_VALUE="$(pick_first "${VPN_PASSWORD:-}" "${vpn_password:-}")"
SUDO_PASSWORD_VALUE="$(pick_optional "${SUDO_PASSWORD:-}" "${sudo_password:-}")"
DB_HOST_VALUE="$(pick_first "${DB_HOST:-}" "")"
DB_PORT_VALUE="$(pick_first "${DB_PORT:-}" "3357")"
OPENCONNECT_BIN="${OPENCONNECT_BIN:-openconnect}"

if [[ -z "${VPN_HOST_VALUE:-}" ]]; then
  echo "VPN host is missing. Set VPN_HOST or vpn_host in .env" >&2
  exit 1
fi

if [[ -z "${VPN_USERNAME_VALUE:-}" ]]; then
  echo "VPN username is missing. Set VPN_USERNAME or vpn_username in .env" >&2
  exit 1
fi

if [[ -z "${VPN_PASSWORD_VALUE:-}" ]]; then
  echo "VPN password is missing. Set VPN_PASSWORD or vpn_password in .env" >&2
  exit 1
fi

if [[ -z "${DB_HOST_VALUE:-}" ]]; then
  echo "DB_HOST is missing in .env" >&2
  exit 1
fi

if ! command -v "$OPENCONNECT_BIN" >/dev/null 2>&1; then
  echo "openconnect was not found in PATH. Set OPENCONNECT_BIN if it is installed elsewhere." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node was not found in PATH." >&2
  exit 1
fi

echo "Connecting VPN to $VPN_HOST_VALUE as $VPN_USERNAME_VALUE"

if [[ -f "$VPN_PID_FILE" ]]; then
  OLD_PID="$(cat "$VPN_PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" >/dev/null 2>&1; then
    echo "Existing openconnect process found with pid $OLD_PID, reusing it"
  else
    rm -f "$VPN_PID_FILE"
  fi
fi

if [[ ! -f "$VPN_PID_FILE" ]]; then
  printf '%s\n' "$VPN_PASSWORD_VALUE" | run_with_sudo \
    "$OPENCONNECT_BIN" \
    --protocol=anyconnect \
    --user "$VPN_USERNAME_VALUE" \
    --passwd-on-stdin \
    --background \
    --pid-file "$VPN_PID_FILE" \
    "$VPN_HOST_VALUE"
fi

echo "Waiting for DB host $DB_HOST_VALUE:$DB_PORT_VALUE"
if ! wait_for_port "$DB_HOST_VALUE" "$DB_PORT_VALUE" "$WAIT_TIMEOUT_SECONDS"; then
  echo "DB host did not become reachable within ${WAIT_TIMEOUT_SECONDS}s" >&2
  exit 1
fi

echo "DB is reachable, fetching $VIEW_NAME (limit $ROW_LIMIT)"
cd "$ROOT_DIR"
node "$ROOT_DIR/scripts/fetch-view.js" "$VIEW_NAME" "$ROW_LIMIT"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] pull-live completed"
