#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/connect-vpn.sh" --background
sleep 5
node "$ROOT_DIR/scripts/fetch-view.js" "${1:-epssched.vsl_drmaster}" "${2:-5}"
