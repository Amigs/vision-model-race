#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/three ] || pnpm install --frozen-lockfile
exec pnpm start
