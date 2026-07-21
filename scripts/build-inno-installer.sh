#!/bin/bash
# ============================================================
# Build the Inno Setup installer for Internal Portal
# 
# This replaces the default electron-builder NSIS with
# a custom Inno Setup script that shows a DISCLAIMER.
#
# Prerequisites: Inno Setup 6 (iscc.exe) must be installed
#   Download: https://jrsoftware.org/isdl.php
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
JMCS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

echo ""
echo "=== Building Internal Portal Installer (Inno Setup) ==="
echo ""

# ── 1. Build the portal ─────────────────────────────
echo "Step 1: Building portal..."
cd "$JMCS_ROOT/portal" && npm run build
echo "  ✓ dist-website built"

# ── 2. Check Inno Setup compiler ─────────────────────
echo ""
echo "Step 2: Checking for Inno Setup compiler..."
INNO_COMPILER=$(which iscc 2>/dev/null || echo "")
if [ -z "$INNO_COMPILER" ]; then
  echo "  ⚠ iscc not found on PATH"
  echo "  Try: 'C:\\Program Files (x86)\\Inno Setup 6\\Compil32.exe' /cc installer.iss"
  echo ""
  echo "  Or install manually from: https://jrsoftware.org/isdl.php"
fi

# ── 3. Run Inno Setup ────────────────────────────────
echo ""
echo "Step 3: Compiling installer..."
echo "  Script: $SCRIPT_DIR/installer.iss"
echo ""

if [ -n "$INNO_COMPILER" ]; then
  "$INNO_COMPILER" "$SCRIPT_DIR/installer.iss"
  echo "  ✓ Installer built at: $JMCS_ROOT/dist/Internal-Portal-Setup.exe"
else
  echo ""
  echo "  To compile manually:"
  echo "    iscc $SCRIPT_DIR/installer.iss"
  echo ""
  echo "  Or with Inno Setup GUI:"
  echo "    1. Open: $SCRIPT_DIR/installer.iss"
  echo "    2. Press F9 to compile"
  echo ""
  echo "  Installer will be at: $JMCS_ROOT/dist/"
fi

echo ""
echo "=== Done ==="