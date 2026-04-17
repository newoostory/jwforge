#!/usr/bin/env bash
# JWForge Updater
# Usage: update.sh
#
# Detects an existing JWForge install by scanning for JWForge hook entries
# (commands containing 'jwforge/hooks/') first in <cwd>/.claude/settings.json
# (project scope) and then in ~/.claude/settings.json (global scope).
# Re-runs install.sh against the detected scope. Errors out if neither
# location shows a JWForge install.

set -e

JWFORGE_HOME="$(cd "$(dirname "$0")" && pwd)"

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

# has_jwforge_install: prints '1' iff the given settings.json file contains
# any hook `command` string that includes 'jwforge/hooks/'. Handles BOTH
# the flat { matcher, command } shape and the nested { matcher, hooks: [
# { type, command } ] } shape. Never fails the script; missing or malformed
# files print '0'.
has_jwforge_install() {
  local settings_path="$1"
  if [ ! -f "$settings_path" ]; then echo "0"; return 0; fi
  SETTINGS_PATH="$settings_path" node -e '
    const fs = require("fs");
    try {
      const raw = fs.readFileSync(process.env.SETTINGS_PATH, "utf8").replace(/^\uFEFF/, "");
      const data = JSON.parse(raw);
      let hit = false;
      const walk = (v) => {
        if (hit) return;
        if (typeof v === "string") { if (v.includes("jwforge/hooks/")) hit = true; return; }
        if (Array.isArray(v)) { for (const x of v) walk(x); return; }
        if (v && typeof v === "object") { for (const k of Object.keys(v)) walk(v[k]); }
      };
      walk(data);
      process.stdout.write(hit ? "1" : "0");
    } catch (e) { process.stdout.write("0"); }
  ' 2>/dev/null || echo "0"
}

# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

echo "JWForge Updater"
echo "==============="

PROJECT_SETTINGS="$PWD/.claude/settings.json"
GLOBAL_SETTINGS="$HOME/.claude/settings.json"

PROJECT_HIT="$(has_jwforge_install "$PROJECT_SETTINGS")"
GLOBAL_HIT="$(has_jwforge_install "$GLOBAL_SETTINGS")"

if [ "$PROJECT_HIT" = "1" ]; then
  echo "Detected: project install at $PWD/.claude/"
  echo "Re-running install.sh against project scope..."
  bash "$JWFORGE_HOME/install.sh" "$PWD"
elif [ "$GLOBAL_HIT" = "1" ]; then
  echo "Detected: global install at $HOME/.claude/"
  echo "Re-running install.sh --global..."
  bash "$JWFORGE_HOME/install.sh" --global
else
  echo "ERROR: no JWForge install detected." >&2
  echo "  Checked: $PROJECT_SETTINGS" >&2
  echo "  Checked: $GLOBAL_SETTINGS" >&2
  echo "Run install.sh first (see install.sh --help)." >&2
  exit 1
fi
