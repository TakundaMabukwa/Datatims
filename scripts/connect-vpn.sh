#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

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

load_env_file "$ENV_FILE"

VPN_HOST="$(pick_first "${VPN_HOST:-}" "${vpn_host:-}")"
VPN_USERNAME="$(pick_first "${VPN_USERNAME:-}" "${vpn_username:-}")"
VPN_PASSWORD="$(pick_first "${VPN_PASSWORD:-}" "${vpn_password:-}")"
DB_HOST_VALUE="$(pick_first "${DB_HOST:-}" "")"
DB_PORT_VALUE="$(pick_first "${DB_PORT:-}" "3357")"
OPENCONNECT_BIN="${OPENCONNECT_BIN:-openconnect}"

if [[ -z "${VPN_HOST:-}" ]]; then
  echo "VPN host is missing. Set VPN_HOST or vpn_host in .env" >&2
  exit 1
fi

if [[ -z "${VPN_USERNAME:-}" ]]; then
  echo "VPN username is missing. Set VPN_USERNAME or vpn_username in .env" >&2
  exit 1
fi

if [[ -z "${VPN_PASSWORD:-}" ]]; then
  echo "VPN password is missing. Set VPN_PASSWORD or vpn_password in .env" >&2
  exit 1
fi

if ! command -v "$OPENCONNECT_BIN" >/dev/null 2>&1; then
  echo "openconnect was not found in PATH. Set OPENCONNECT_BIN if it is installed elsewhere." >&2
  exit 1
fi

echo "Starting Cisco AnyConnect-compatible VPN session to $VPN_HOST as $VPN_USERNAME"

if [[ "${1:-}" == "--background" ]]; then
  shift
  printf '%s\n' "$VPN_PASSWORD" | "$OPENCONNECT_BIN" \
    --protocol=anyconnect \
    --user "$VPN_USERNAME" \
    --passwd-on-stdin \
    --background \
    "$VPN_HOST" \
    "$@"
else
  printf '%s\n' "$VPN_PASSWORD" | "$OPENCONNECT_BIN" \
    --protocol=anyconnect \
    --user "$VPN_USERNAME" \
    --passwd-on-stdin \
    "$VPN_HOST" \
    "$@"
fi

if command -v nc >/dev/null 2>&1 && [[ -n "${DB_HOST_VALUE:-}" && -n "${DB_PORT_VALUE:-}" ]]; then
  echo "Checking DB reachability on $DB_HOST_VALUE:$DB_PORT_VALUE"
  if nc -z -w 5 "$DB_HOST_VALUE" "$DB_PORT_VALUE"; then
    echo "DB host is reachable through the VPN"
  else
    echo "DB host is still not reachable yet" >&2
  fi
fi
