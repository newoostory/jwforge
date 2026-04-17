#!/usr/bin/env bash
# JWForge Uninstaller
# Usage: uninstall.sh [<target-project-path>] [--global]
# Default scope: project-local (reads <target>/.claude/settings.json).
# --global:      reads ~/.claude/settings.json.
#
# Removes ONLY JWForge hook entries (commands containing 'jwforge/hooks/')
# and the two JWForge env vars from the chosen scope's settings.json,
# plus the <scope>/.claude/jwforge/ runtime directory. Leaves unrelated
# hook entries and env vars intact. Idempotent.

set -e

JWFORGE_HOME="$(cd "$(dirname "$0")" && pwd)"

TARGET_ARG=""
GLOBAL=0

for arg in "$@"; do
  case "$arg" in
    --global) GLOBAL=1 ;;
    --help|-h)
      sed -n '2,11p' "$0"; exit 0 ;;
    --*)
      echo "Unknown flag: $arg" >&2; exit 2 ;;
    *)
      if [ -z "$TARGET_ARG" ]; then TARGET_ARG="$arg"
      else echo "Unexpected argument: $arg" >&2; exit 2; fi ;;
  esac
done

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

# resolve_scope: populates CLAUDE_DIR, INSTALL_DIR, SETTINGS_FILE, SCOPE_LABEL
# Mirrors install.sh's resolve_scope: --global -> ~/.claude; else target arg
# (absolutized) or $PWD; CLAUDE_DIR = <scope>/.claude.
resolve_scope() {
  if [ "$GLOBAL" -eq 1 ]; then
    CLAUDE_DIR="$HOME/.claude"
    SCOPE_LABEL="global (~/.claude)"
  else
    local tgt
    if [ -n "$TARGET_ARG" ]; then tgt="$TARGET_ARG"
    else tgt="$PWD"; fi
    case "$tgt" in
      /*) ;;
      *) tgt="$PWD/$tgt" ;;
    esac
    CLAUDE_DIR="$tgt/.claude"
    SCOPE_LABEL="project ($tgt)"
  fi
  INSTALL_DIR="$CLAUDE_DIR/jwforge"
  SETTINGS_FILE="$CLAUDE_DIR/settings.json"
}

# clean_settings: parse SETTINGS_FILE, remove JWForge hook entries and env
# vars, write back pretty-printed JSON. Handles BOTH hook shapes:
#   (flat)   { matcher, command }
#   (nested) { matcher, hooks: [ { type, command } ] }
# A JWForge entry is any one whose `command` string contains 'jwforge/hooks/'.
# Leaves all other entries and env vars intact. No-op if SETTINGS_FILE missing.
clean_settings() {
  if [ ! -f "$SETTINGS_FILE" ]; then return 0; fi
  SETTINGS_PATH="$SETTINGS_FILE" node -e '
    const fs = require("fs");
    const p = process.env.SETTINGS_PATH;
    let raw;
    try { raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""); }
    catch (e) { process.exit(0); }
    let settings;
    try { settings = JSON.parse(raw); } catch (e) { process.exit(0); }

    const isJwforgeCmd = (c) =>
      typeof c === "string" && c.includes("jwforge/hooks/");

    if (settings && typeof settings === "object" && settings.hooks &&
        typeof settings.hooks === "object") {
      for (const event of Object.keys(settings.hooks)) {
        const arr = settings.hooks[event];
        if (!Array.isArray(arr)) continue;
        const kept = [];
        for (const entry of arr) {
          if (!entry || typeof entry !== "object") { kept.push(entry); continue; }
          // Flat-shape entry with direct command on the entry itself.
          if (isJwforgeCmd(entry.command)) continue;
          // Nested-shape entry with entry.hooks[] of { type, command }.
          if (Array.isArray(entry.hooks)) {
            const innerKept = entry.hooks.filter(
              (h) => !(h && typeof h === "object" && isJwforgeCmd(h.command))
            );
            if (innerKept.length === 0) continue;
            entry.hooks = innerKept;
          }
          kept.push(entry);
        }
        if (kept.length === 0) delete settings.hooks[event];
        else settings.hooks[event] = kept;
      }
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    }

    if (settings && typeof settings === "object" && settings.env &&
        typeof settings.env === "object") {
      delete settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      delete settings.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING;
      if (Object.keys(settings.env).length === 0) delete settings.env;
    }

    fs.writeFileSync(p, JSON.stringify(settings, null, 2));
  '
}

# remove_runtime_dir: delete <scope>/.claude/jwforge/ idempotently.
remove_runtime_dir() {
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo "  [OK] removed runtime dir: $INSTALL_DIR"
  fi
}

# remove_forge_skill: delete <scope>/.claude/skills/forge/ idempotently.
remove_forge_skill() {
  local d="$CLAUDE_DIR/skills/forge"
  if [ -d "$d" ]; then
    rm -rf "$d"
    echo "  [OK] removed skill dir: $d"
  fi
}

# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

resolve_scope

echo "JWForge Uninstaller"
echo "==================="
echo "Scope: $SCOPE_LABEL"
echo "Settings: $SETTINGS_FILE"
echo ""

echo "[1/3] Cleaning settings.json (hooks + env vars)..."
clean_settings || true
echo "  [OK] settings.json cleaned (if present)"

echo "[2/3] Removing runtime directory..."
remove_runtime_dir
echo "  [OK] runtime removal complete"

echo "[3/3] Removing forge skill directory..."
remove_forge_skill
echo "  [OK] skill removal complete"

echo ""
echo "================================"
echo "  JWForge uninstalled"
echo "  scope: $SCOPE_LABEL"
echo "================================"
