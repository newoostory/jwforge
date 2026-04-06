#!/usr/bin/env bash
# JWForge Uninstaller v2

set -e

JWFORGE_HOME="$(cd "$(dirname "$0")" && pwd)"

# --- Helpers ---

to_node_path() {
  if command -v cygpath &>/dev/null; then
    cygpath -m "$1"
  else
    echo "$1"
  fi
}

# --- Parse arguments ---

INSTALL_MODE="global"
TARGET_PROJECT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --global) INSTALL_MODE="global"; shift ;;
    --local)
      INSTALL_MODE="local"
      if [[ -n "$2" && ! "$2" =~ ^-- ]]; then
        TARGET_PROJECT="$2"; shift
      fi
      shift
      ;;
    *) shift ;;
  esac
done

if [[ "$INSTALL_MODE" == "global" ]]; then
  CLAUDE_DIR="$HOME/.claude"
  echo "JWForge Uninstaller (global)"
  echo "============================"
else
  CLAUDE_DIR="${TARGET_PROJECT:-.}/.claude"
  echo "JWForge Uninstaller (local)"
  echo "==========================="
fi

RUNTIME_DIR="$CLAUDE_DIR/jwforge"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
SETTINGS_FILE_NODE="$(to_node_path "$SETTINGS_FILE")"

echo "Target: $CLAUDE_DIR"
echo ""

# --- 1. Remove skills ---

for skill_name in jwforge deeptk surface cancel commit verify simplify wiki; do
  if [ -d "$CLAUDE_DIR/skills/$skill_name" ]; then
    rm -rf "$CLAUDE_DIR/skills/$skill_name"
    echo "[OK] /$skill_name skill removed"
  fi
done

# Remove JWForge command subdirectories
for cmd_name in wiki; do
  if [ -d "$CLAUDE_DIR/commands/$cmd_name" ]; then
    rm -rf "$CLAUDE_DIR/commands/$cmd_name"
    echo "[OK] /$cmd_name commands removed"
  fi
done

# --- 2. Remove runtime files ---

if [ -d "$RUNTIME_DIR" ]; then
  rm -rf "$RUNTIME_DIR"
  echo "[OK] Runtime files removed ($RUNTIME_DIR)"
fi

# --- 3. Remove statusline ---

STATUSLINE_FILE="$CLAUDE_DIR/statusline.sh"
if [ -f "$STATUSLINE_FILE" ]; then
  rm -f "$STATUSLINE_FILE"
  echo "[OK] statusline.sh removed"
fi

# Remove statusLine from settings.json
if [ -f "$SETTINGS_FILE" ] && grep -q "statusLine" "$SETTINGS_FILE" 2>/dev/null; then
  node -e "
    const fs = require('fs');
    const raw = fs.readFileSync('$(to_node_path "$SETTINGS_FILE")', 'utf8').replace(/^\uFEFF/, '');
    const settings = JSON.parse(raw);
    delete settings.statusLine;
    fs.writeFileSync('$(to_node_path "$SETTINGS_FILE")', JSON.stringify(settings, null, 2));
  "
  echo "[OK] statusLine removed from settings.json"
fi

# --- 4. Remove stop hook (global only) ---

if [[ "$INSTALL_MODE" == "global" ]]; then
  if [ -f "$SETTINGS_FILE" ] && grep -q "jwforge" "$SETTINGS_FILE" 2>/dev/null; then
    node -e "
      const fs = require('fs');
      const raw = fs.readFileSync('$SETTINGS_FILE_NODE', 'utf8').replace(/^\uFEFF/, '');
      const settings = JSON.parse(raw);
      if (settings.hooks) {
        for (const [event, hooks] of Object.entries(settings.hooks)) {
          settings.hooks[event] = hooks.filter(h => !h.command || !h.command.includes('jwforge'));
          if (settings.hooks[event].length === 0) delete settings.hooks[event];
        }
        if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      }
      fs.writeFileSync('$SETTINGS_FILE_NODE', JSON.stringify(settings, null, 2));
    "
    echo "[OK] All JWForge hooks removed from settings.json"
  fi
fi

# --- 5. Clean up leftover team/task directories ---

for dir in "$HOME/.claude/teams"/jwforge-* "$HOME/.claude/tasks"/jwforge-*; do
  if [ -d "$dir" ]; then
    rm -rf "$dir"
    echo "[OK] Removed leftover: $(basename "$dir")"
  fi
done

echo ""
echo "JWForge uninstalled."
echo "Note: .jwforge/ directories in projects are preserved (delete manually if needed)."
