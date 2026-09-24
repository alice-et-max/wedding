#!/usr/bin/env bash
# Reconstruit _site/ (src/ + assets/) puis le sert en local.
# Usage : scripts/dev.sh [port]   (port par défaut : 8000)
set -euo pipefail

PORT="${1:-8000}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="$ROOT_DIR/_site"

rm -rf "$SITE_DIR"
mkdir -p "$SITE_DIR/assets"
cp -r "$ROOT_DIR"/src/. "$SITE_DIR"/
cp -r "$ROOT_DIR"/assets/. "$SITE_DIR/assets"/

echo "Site disponible sur http://localhost:${PORT}"
exec python3 -m http.server "$PORT" --directory "$SITE_DIR"
