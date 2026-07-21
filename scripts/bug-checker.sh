#!/bin/bash

# ============================================================
# JMCS Portal — Desktop Bug Checker
#
# Checks the built output in portal/dist-website/ for common
# issues that cause a blank screen in the Electron desktop app.
#
# The api-server/ folder is the BACKEND — this script only
# checks the portal/ (frontend) desktop build.
#
# Usage:
#   bash /path/to/jmcs/scripts/bug-checker.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
JMCS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
PORTAL_DIR="$JMCS_ROOT/portal"
DIST_WEBSITE="$PORTAL_DIR/dist-website"

echo ""
echo "==========================================="
echo "  JMCS Portal — Desktop Bug Checker"
echo "==========================================="
echo "  Root: $JMCS_ROOT"
echo "  Portal (desktop app): $PORTAL_DIR"
echo "  API Server (separate): $JMCS_ROOT/api-server"
echo ""

# ── 1. Find dist-website ──────────────────────
if [ ! -d "$DIST_WEBSITE" ]; then
  echo "  [✗] dist-website/ NOT FOUND"
  echo "      → You need to build the portal first:"
  echo "        cd $PORTAL_DIR"
  echo "        npm run build"
  exit 1
fi

if [ ! -f "$DIST_WEBSITE/index.html" ]; then
  echo "  [✗] dist-website/index.html missing"
  echo "      → Run: cd $PORTAL_DIR && npm run build"
  exit 1
fi
echo "  [✓] dist-website/index.html found"

# ── 2. Check asset paths ──────────────────────
echo ""
echo "── Asset Paths ─────────────────────────────"
SCRIPT_SRC=$(sed -n 's/.*src="\([^"]*\)".*/\1/p' "$DIST_WEBSITE/index.html" | head -1)
echo "  Script src: $SCRIPT_SRC"
if echo "$SCRIPT_SRC" | grep -q '^\./'; then
  echo "    ✓ Relative (./assets/) — works on file://"
elif echo "$SCRIPT_SRC" | grep -q '^/'; then
  echo "    ✗ Absolute (/) — BROKEN on file://"
  echo "    Fix: set 'base: \"./\"' in portal/vite.config.ts"
else
  echo "    ? Unknown format"
fi

# ── 3. Check crossorigin ──────────────────────
echo ""
echo "── crossorigin Check ────────────────────────"
if grep -q 'crossorigin' "$DIST_WEBSITE/index.html"; then
  echo "  ✗ 'crossorigin' still present — causes CORS errors"
else
  echo "  ✓ Clean — no crossorigin attributes"
fi

# ── 4. Verify JS file exists ──────────────────
echo ""
echo "── JS Bundle ────────────────────────────────"
JS_REL=$(sed -n 's/.*<script[^>]* src="\([^"]*\)".*/\1/p' "$DIST_WEBSITE/index.html" | head -1)
JS_REL="${JS_REL#./}"  # strip leading ./
JS_FILE="$DIST_WEBSITE/$JS_REL"
if [ -f "$JS_FILE" ]; then
  echo "  ✓ $JS_REL $(wc -c < "$JS_FILE" | tr -d ' ') bytes"
else
  echo "  ✗ Missing: $JS_FILE"
  echo "    → Build didn't complete successfully"
fi

# ── 5. Verify CSS file exists ──────────────────
echo ""
echo "── CSS Bundle ──────────────────────────────"
CSS_REL=$(sed -n 's/.*<link[^>]* href="\([^"]*\)".*/\1/p' "$DIST_WEBSITE/index.html" | grep '\.css' | head -1)
CSS_REL="${CSS_REL#./}"
CSS_FILE="$DIST_WEBSITE/$CSS_REL"
if [ -f "$CSS_FILE" ]; then
  echo "  ✓ $CSS_REL $(wc -c < "$CSS_FILE" | tr -d ' ') bytes"
else
  echo "  ✗ Missing: $CSS_FILE"
fi

# ── 6. Check Electron main.cjs ───────────────
echo ""
echo "── Electron Entry Point ────────────────────"
MAIN_CJS="$PORTAL_DIR/electron/main.cjs"
if [ -f "$MAIN_CJS" ]; then
  echo "  ✓ $MAIN_CJS"
  # Check what it loads
  LOAD_PATH=$(grep -oP "loadFile\([^)]+\)|loadURL\([^)]+\)" "$MAIN_CJS" | head -1)
  echo "    Loads: $LOAD_PATH"
  if echo "$LOAD_PATH" | grep -q 'dist-website'; then
    echo "    ✓ Points to dist-website — correct"
  else
    echo "    ✗ Not pointing to dist-website — check config"
  fi
else
  echo "  ✗ electron/main.cjs missing — desktop can't start"
fi

# ── 7. Check .env ─────────────────────────────
echo ""
echo "── Firebase Config ─────────────────────────"
if [ -f "$PORTAL_DIR/.env" ]; then
  echo "  ✓ .env found"
  grep -E '^VITE_' "$PORTAL_DIR/.env" | grep -v '^#' | while IFS='=' read -r key val; do
    echo "    $key = ${val:0:30}..."
  done
else
  echo "  ✗ No .env — Firebase auth will fail"
fi

# ── 8. Summary + Next Steps ──────────────────
echo ""
echo "==========================================="
echo "  Summary"
echo "==========================================="
echo ""
echo "  If everything passes (✓), the desktop build"
echo "  should work. If you still see a blank/white"
echo "  screen, check the Console in Electron:"
echo ""
echo "    1. Run: cd $PORTAL_DIR && npm run electron:dev"
echo "    2. Press Ctrl+Shift+I to open DevTools"
echo "    3. Look at the Console tab for errors"
echo ""
echo "  Or test in browser first:"
echo "    1. cd $PORTAL_DIR && npm run dev"
echo "    2. Open http://localhost:5173"
echo "    3. If it works there but not in Electron,"
echo "       it's a file:// protocol issue"
echo ""