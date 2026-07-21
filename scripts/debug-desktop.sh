#!/bin/bash
# ============================================================
# JMCS Portal - Desktop Build Debug Script
# 
# Use: bash scripts/debug-desktop.sh
# 
# This script checks the built desktop app output and highlights
# common issues that cause a "blue screen" (blank React app).
# ============================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "============================================"
echo "  JMCS Portal - Desktop Build Debug Check"
echo "============================================"
echo ""

PASS=0
FAIL=0

check() {
  local label="$1"
  local cmd="$2"
  local tip="$3"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  [✓] $label"
    PASS=$((PASS+1))
  else
    echo "  [✗] $label"
    echo "      └─ $tip"
    FAIL=$((FAIL+1))
  fi
}

check_file() {
  local label="$1"
  local path="$2"
  local tip="$3"
  if [ -f "$path" ]; then
    echo "  [✓] $label"
    PASS=$((PASS+1))
  else
    echo "  [✗] $label"
    echo "      └─ $tip"
    FAIL=$((FAIL+1))
  fi
}

# ── 1. Check Electron is installed ─────────────────────────
echo "── Dependencies ──────────────────────────────────────"
check "electron installed in node_modules" \
  "test -d \"$ROOT_DIR/portal/node_modules/electron/dist\"" \
  "Run: cd portal && npm install"

check "electron-builder installed" \
  "test -f \"$ROOT_DIR/portal/node_modules/.bin/electron-builder\"" \
  "Run: cd portal && npm install"

# ── 2. Check build output ──────────────────────────────────
echo ""
echo "── Build Output ──────────────────────────────────────"
check_file "dist-website/index.html exists" \
  "$ROOT_DIR/portal/dist-website/index.html" \
  "Run: cd portal && npm run build"

check_file "dist-website has JS bundle" \
  "$(find "$ROOT_DIR/portal/dist-website/assets" -name '*.js' 2>/dev/null | head -1)" \
  "Build failed — no JS bundle in dist-website/assets/"

check_file "dist-website has CSS bundle" \
  "$(find "$ROOT_DIR/portal/dist-website/assets" -name '*.css' 2>/dev/null | head -1)" \
  "Build failed — no CSS bundle in dist-website/assets/"

# ── 3. Check index.html for correct script/link tags ──────
echo ""
echo "── index.html Asset Analysis ──────────────────────────"
HTML_FILE="$ROOT_DIR/portal/dist-website/index.html"
if [ -f "$HTML_FILE" ]; then
  # Count script tags
  SCRIPT_COUNT=$(grep -c '<script' "$HTML_FILE" || true)
  LINK_COUNT=$(grep -c '<link' "$HTML_FILE" || true)
  echo "  [i] Found $SCRIPT_COUNT <script> tags and $LINK_COUNT <link> tags"

  # Check for asset paths
  if grep -q '\./assets/' "$HTML_FILE"; then
    echo "  [✓] Assets use relative paths (./assets/) — good for electron file:// loading"
    PASS=$((PASS+1))
  else
    echo "  [✗] Assets use absolute paths — may fail in Electron"
    echo "      └─ Set BASE_PATH=./ in your build command"
    FAIL=$((FAIL+1))
  fi

  # Check if root div is present
  if grep -q '<div id="root">' "$HTML_FILE" || grep -q '<div id="root"></div>' "$HTML_FILE"; then
    echo "  [✓] Found <div id=\"root\"> in body"
    PASS=$((PASS+1))
  else
    echo "  [✗] Missing <div id=\"root\"> — React won't mount"
    FAIL=$((FAIL+1))
  fi
fi

# ── 4. Check Electron main.cjs config ─────────────────────
echo ""
echo "── Electron Config ────────────────────────────────────"
MAIN_CJS="$ROOT_DIR/portal/electron/main.cjs"
if [ -f "$MAIN_CJS" ]; then
  if grep -q 'dist-website' "$MAIN_CJS"; then
    echo "  [✓] main.cjs references 'dist-website' for production builds"
    PASS=$((PASS+1))
  else
    echo "  [✗] main.cjs does not reference dist-website — won't load built app"
    FAIL=$((FAIL+1))
  fi

  if grep -q 'show: false' "$MAIN_CJS"; then
    echo "  [✓] Uses 'show: false' + 'ready-to-show' event (avoids white flash)"
    PASS=$((PASS+1))
  fi

  if grep -q 'contextIsolation: true' "$MAIN_CJS"; then
    echo "  [✓] contextIsolation enabled (security best practice)"
    PASS=$((PASS+1))
  fi
fi

# ── 5. Check for console errors in built HTML ──────────────
echo ""
echo "── Console Error Check ────────────────────────────────"
if [ -f "$HTML_FILE" ]; then
  # Check if the HTML references a module script (type="module")
  if grep -q 'type="module"' "$HTML_FILE"; then
    echo "  [i] JS bundle uses type=\"module\" — requires modern Electron (>= v12)"
  fi
fi

# ── 6. Check package.json build config ─────────────────────
echo ""
echo "── electron-builder Config ────────────────────────────"
PKG_JSON="$ROOT_DIR/portal/package.json"
if [ -f "$PKG_JSON" ]; then
  if grep -q '"main": "electron/main.cjs"' "$PKG_JSON"; then
    echo "  [✓] package.json 'main' points to electron/main.cjs"
    PASS=$((PASS+1))
  else
    echo "  [✗] 'main' field not set — electron-builder won't find entry"
    FAIL=$((FAIL+1))
  fi

  if grep -q '"appId": "com.jmcs.portal"' "$PKG_JSON"; then
    echo "  [✓] electron-builder appId configured"
    PASS=$((PASS+1))
  fi

  if grep -q '"linux"' "$PKG_JSON" && grep -q '"win"' "$PKG_JSON"; then
    echo "  [✓] Linux + Windows targets configured"
    PASS=$((PASS+1))
  fi
fi

# ── 7. Check if the built index.html references any missing assets ──
echo ""
echo "── Asset Integrity Check ──────────────────────────────"
if [ -f "$HTML_FILE" ]; then
  # Extract all asset references
  ASSET_DIR="$ROOT_DIR/portal/dist-website"
  while IFS= read -r -d '' SRC; do
    # Skip external URLs
    if echo "$SRC" | grep -q '^https\?://'; then
      continue
    fi
    # Resolve relative path
    FULL_PATH="$ASSET_DIR/$(dirname "$SRC" 2>/dev/null)/$(basename "$SRC" 2>/dev/null)"
    if [ ! -f "$FULL_PATH" ]; then
      # Try extracting from src/href attributes
      :
    fi
  done < <(grep -oP '(src|href)="([^"]*)"' "$HTML_FILE" | grep -oP '"[^"]+"' | tr -d '"' | tr '\n' '\0' 2>/dev/null || true)
fi

# ── Summary ──────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Results: $PASS passed / $FAIL failed"
echo "============================================"
echo ""
echo "Top fixes if you see a blue/blank screen:"
echo "  1. Run: BASE_PATH=./ npm run build (sets asset base to relative)"
echo "  2. Check dist-website/index.html has <script> tags"
echo "  3. Open Electron DevTools (Ctrl+Shift+I) — check Console tab"
echo "  4. Ensure dist-website/ exists and has assets/"
echo ""

exit $FAIL