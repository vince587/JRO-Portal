#!/bin/bash
# ============================================================
# Fix "blue screen" in JMCS Portal desktop build
#
# PROBLEM: Vite's production build adds `crossorigin` to 
#   <script type="module"> tags. In Electron (file:// protocol),
#   this causes CORS errors — the JS bundle fails to load,
#   React never mounts, and you see only the blue/gray CSS
#   background color.
#
# FIX: Remove `crossorigin` from the built index.html
#   so the script loads correctly in Electron.
#
# Use: bash scripts/fix-desktop-blue-screen.sh
# ============================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HTML_FILE="$ROOT_DIR/portal/dist-website/index.html"

if [ ! -f "$HTML_FILE" ]; then
  echo "ERROR: dist-website/index.html not found."
  echo "Run 'cd portal && npm run build' first."
  exit 1
fi

echo "Fixing: Removing crossorigin from script and link tags..."
echo "  File: $HTML_FILE"

# Remove crossorigin from <script> tags
sed -i 's/<script type="module" crossorigin src=/<script type="module" src=/g' "$HTML_FILE"

# Remove crossorigin from <link> tags (if any)
sed -i 's/<link rel="stylesheet" crossorigin href=/<link rel="stylesheet" href=/g' "$HTML_FILE"

echo "Done. The index.html now has non-crossorigin script/link tags."
echo ""
echo "Verify:"
grep -n 'crossorigin' "$HTML_FILE" || echo "  No crossorigin attributes remain — fix applied."

echo ""
echo "You can now run your desktop app. The React app should mount properly."