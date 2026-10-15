#!/usr/bin/env bash
set -euo pipefail

verify_preview() {
  local mode="$1"
  local log_file="preview-${mode}.log"
  local preview_pid
  local ready=false

  VITE_DATA_MODE="$mode" node node_modules/vite/bin/vite.js preview \
    --host 127.0.0.1 --port 5174 --strictPort >"$log_file" 2>&1 &
  preview_pid=$!

  cleanup_preview() {
    kill "$preview_pid" 2>/dev/null || true
    wait "$preview_pid" 2>/dev/null || true
  }
  trap cleanup_preview RETURN

  for _ in $(seq 1 30); do
    if curl --fail --silent http://127.0.0.1:5174/ >/dev/null; then
      ready=true
      break
    fi
    if ! kill -0 "$preview_pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if [[ "$ready" != true ]]; then
    echo "::error title=Production preview did not start::$mode preview did not answer on port 5174."
    cat "$log_file"
    return 1
  fi

  node scripts/verify-production.mjs "$mode"
}

export VITE_DATA_MODE=mock
npm run typecheck
VITE_DATA_MODE=mock npm run build
npm run lint
verify_preview mock
VITE_DATA_MODE=mock npm run test:ci

export VITE_DATA_MODE=api
VITE_DATA_MODE=api npm run build
verify_preview api
