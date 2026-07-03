#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="$ROOT/surrealdb-js-sdk"

cd "$SDK"
bun install

# @tauri-apps/api is a peer of packages/sdk; declaration generation needs it on disk.
if ! bun -e "import('@tauri-apps/api/core')" >/dev/null 2>&1; then
    bun add -d "@tauri-apps/api@^2" --cwd packages/sdk
fi

bun run build:sqon
bun run build:sdk
