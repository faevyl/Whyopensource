#!/usr/bin/env bash
# Run the Wisp server and keep a Cloudflare tunnel in front of it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-8741}"

node server.js >> /tmp/why-revived.log 2>&1 &
server_pid=$!

cleanup() {
  kill "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ready=0
for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [[ "$ready" != 1 ]]; then
  echo "Wisp server did not start" >&2
  exit 1
fi

bash "$ROOT/scripts/cloudflare-tunnel.sh"
