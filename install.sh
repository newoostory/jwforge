#!/usr/bin/env bash
# JWForge Installer
# Usage: install.sh [<target-project-path>] [--global] [--dry-run]
# Default scope: project-local (writes to <target>/.claude/settings.json).
# --global:  writes to ~/.claude/settings.json (interactive confirmation required).
# --dry-run: prints the plan and exits 0 without touching the filesystem.

set -e

JWFORGE_HOME="$(cd "$(dirname "$0")" && pwd)"

TARGET_ARG=""
GLOBAL=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --global) GLOBAL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      sed -n '2,6p' "$0"; exit 0 ;;
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
resolve_scope() {
  if [ "$GLOBAL" -eq 1 ]; then
    CLAUDE_DIR="$HOME/.claude"
    SCOPE_LABEL="global (~/.claude)"
  else
    local tgt
    if [ -n "$TARGET_ARG" ]; then tgt="$TARGET_ARG"
    else tgt="$PWD"; fi
    # Absolute-ize without requiring the path to exist yet.
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

# migration_check: scan ~/.claude/settings.json for JWForge hook entries via node.
# Prints the canonical WARNING substring iff a command string contains 'jwforge/hooks/'.
# Must never fail the script even if HOME/.claude/settings.json is missing or malformed.
migration_check() {
  local global_settings="$HOME/.claude/settings.json"
  if [ ! -f "$global_settings" ]; then return 0; fi
  local found
  found="$(SETTINGS_PATH="$global_settings" node -e '
    const fs = require("fs");
    try {
      const raw = fs.readFileSync(process.env.SETTINGS_PATH, "utf8").replace(/^\uFEFF/, "");
      const data = JSON.parse(raw);
      let hit = false;
      const isJwforgeCmd = (c) => {
        if (typeof c !== "string") return false;
        return c.replace(/["\\]/g, "").includes("jwforge/hooks/");
      };
      const walk = (v) => {
        if (hit) return;
        if (typeof v === "string") { if (isJwforgeCmd(v)) hit = true; return; }
        if (Array.isArray(v)) { for (const x of v) walk(x); return; }
        if (v && typeof v === "object") { for (const k of Object.keys(v)) walk(v[k]); }
      };
      walk(data);
      process.stdout.write(hit ? "1" : "0");
    } catch (e) { process.stdout.write("0"); }
  ' 2>/dev/null || echo 0)"
  if [ "$found" = "1" ]; then
    echo "WARNING: JWForge previously installed globally. The default scope is now project-local; run 'uninstall.sh --global' to remove the legacy global install."
  fi
}

# print_plan: list the JSON keys and files install would touch. Used for dry-run.
print_plan() {
  echo "[dry-run] scope: $SCOPE_LABEL"
  echo "[dry-run] settings file: $SETTINGS_FILE"
  echo "[dry-run] install dir:   $INSTALL_DIR"
  echo "[dry-run] would merge JSON keys into settings.json: hooks, env"
  echo "[dry-run] would set env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"
  echo "[dry-run] would set env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1"
  echo "[dry-run] would register hooks: UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop"
  echo "[dry-run] would copy files:"
  echo "  [dry-run]   skill-sources/forge/SKILL.md -> $CLAUDE_DIR/skills/forge/SKILL.md"
  echo "  [dry-run]   skills/forge.md              -> $INSTALL_DIR/skills/forge.md"
  echo "  [dry-run]   agents/*.md                  -> $INSTALL_DIR/agents/"
  echo "  [dry-run]   config/pipeline.json         -> $INSTALL_DIR/config/pipeline.json"
  echo "  [dry-run]   templates/*.md               -> $INSTALL_DIR/templates/"
  echo "  [dry-run]   hooks/*.mjs                  -> $INSTALL_DIR/hooks/"
  echo "  [dry-run]   hooks/lib/*.mjs              -> $INSTALL_DIR/hooks/lib/"
}

# confirm_global: interactive prompt reading from /dev/tty. Called only for real --global runs.
confirm_global() {
  echo ""
  echo "About to install JWForge GLOBALLY. Side-effects:"
  echo "  - write $SETTINGS_FILE (merge hooks + env keys)"
  echo "  - set env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"
  echo "  - set env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1"
  echo "  - register JWForge hooks for UserPromptSubmit/PreToolUse/PostToolUse/PreCompact/Stop"
  echo "  - copy files under $INSTALL_DIR"
  echo ""
  if [ ! -r /dev/tty ]; then
    echo "Refusing to install globally without an interactive terminal. Re-run directly (not piped)." >&2
    exit 1
  fi
  printf "Proceed? [y/N]: "
  local reply=""
  read -r reply < /dev/tty || reply=""
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
}

# create_dirs: make all required directories under the chosen scope.
create_dirs() {
  mkdir -p "$CLAUDE_DIR/skills/forge"
  mkdir -p "$INSTALL_DIR/skills" "$INSTALL_DIR/agents" "$INSTALL_DIR/config"
  mkdir -p "$INSTALL_DIR/templates" "$INSTALL_DIR/hooks" "$INSTALL_DIR/hooks/lib"
}

# copy_files: copy the runtime tree into INSTALL_DIR.
copy_files() {
  cp "$JWFORGE_HOME/skill-sources/forge/SKILL.md" "$CLAUDE_DIR/skills/forge/SKILL.md"
  cp "$JWFORGE_HOME/skills/forge.md" "$INSTALL_DIR/skills/forge.md"
  for f in "$JWFORGE_HOME/agents/"*.md; do [ -f "$f" ] || continue; cp "$f" "$INSTALL_DIR/agents/$(basename "$f")"; done
  cp "$JWFORGE_HOME/config/pipeline.json" "$INSTALL_DIR/config/pipeline.json"
  for f in "$JWFORGE_HOME/templates/"*.md; do [ -f "$f" ] || continue; cp "$f" "$INSTALL_DIR/templates/$(basename "$f")"; done
  for f in "$JWFORGE_HOME/hooks/"*.mjs; do [ -f "$f" ] || continue; cp "$f" "$INSTALL_DIR/hooks/$(basename "$f")"; done
  for f in "$JWFORGE_HOME/hooks/lib/"*.mjs; do [ -f "$f" ] || continue; cp "$f" "$INSTALL_DIR/hooks/lib/$(basename "$f")"; done
}

# merge_settings: parse the chosen scope's settings.json, merge hooks + env, write back.
merge_settings() {
  if [ ! -f "$SETTINGS_FILE" ]; then echo '{}' > "$SETTINGS_FILE"; fi
  local hooks_json="$JWFORGE_HOME/hooks/hooks.json"
  SETTINGS_PATH="$SETTINGS_FILE" HOOKS_PATH="$hooks_json" INSTALL_PATH="$INSTALL_DIR" node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(process.env.SETTINGS_PATH, "utf8").replace(/^\uFEFF/, "");
    const settings = JSON.parse(raw);
    const hooksConfig = JSON.parse(fs.readFileSync(process.env.HOOKS_PATH, "utf8"));
    const installDir = process.env.INSTALL_PATH;
    if (!settings.hooks) settings.hooks = {};
    if (!settings.env) settings.env = {};
    settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
    settings.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = "1";
    const sub = (cmd) => cmd.replace(/\{\{INSTALL_DIR\}\}/g, installDir);
    for (const [event, matchers] of Object.entries(hooksConfig.hooks || {})) {
      settings.hooks[event] = matchers.map(m => ({
        matcher: m.matcher || "",
        hooks: m.hooks.map(h => {
          const out = { type: h.type || "command", command: sub(h.command) };
          if (h.timeout) out.timeout = h.timeout;
          return out;
        }),
      }));
    }
    fs.writeFileSync(process.env.SETTINGS_PATH, JSON.stringify(settings, null, 2));
  '
}

# cleanup_legacy: remove legacy hooks, skills, templates, agents under the chosen scope.
cleanup_legacy() {
  local old_hooks=(pre-tool-guard.mjs bash-guard.mjs block-plan-mode.mjs keyword-detector.mjs git-commit-guard.mjs lifecycle.mjs)
  for h in "${old_hooks[@]}"; do [ -f "$INSTALL_DIR/hooks/$h" ] && rm "$INSTALL_DIR/hooks/$h" && echo "  [CLEAN] removed old hook: $h"; done
  local old_skill_dirs=(jwforge deeptk resume retro)
  for d in "${old_skill_dirs[@]}"; do [ -d "$CLAUDE_DIR/skills/$d" ] && rm -rf "$CLAUDE_DIR/skills/$d" && echo "  [CLEAN] removed old skills dir: $d"; done
  local old_skill_files=(jwforge.md deeptk.md retro.md surface.md)
  for s in "${old_skill_files[@]}"; do [ -f "$INSTALL_DIR/skills/$s" ] && rm "$INSTALL_DIR/skills/$s" && echo "  [CLEAN] removed old skill file: $s"; done
  local old_configs=(phase-config.json)
  for c in "${old_configs[@]}"; do [ -f "$INSTALL_DIR/config/$c" ] && rm "$INSTALL_DIR/config/$c" && echo "  [CLEAN] removed old config: $c"; done
  [ -f "$INSTALL_DIR/hooks/lib/core.mjs" ] && rm "$INSTALL_DIR/hooks/lib/core.mjs" && echo "  [CLEAN] removed old hook lib: core.mjs"
  local old_tmpl=(deeptk-spec.md retro-report.md)
  for t in "${old_tmpl[@]}"; do [ -f "$INSTALL_DIR/templates/$t" ] && rm "$INSTALL_DIR/templates/$t" && echo "  [CLEAN] removed old template: $t"; done
  local new_agents=(conductor.md interviewer.md analyst.md researcher.md designer.md reviewer-phase1.md reviewer-phase2.md state-recorder.md test-writer.md executor.md code-reviewer.md verifier.md fixer.md tester.md reviewer-phase4.md)
  if [ -d "$INSTALL_DIR/agents" ]; then
    for af in "$INSTALL_DIR/agents/"*.md; do
      [ -f "$af" ] || continue
      local name; name="$(basename "$af")"
      local keep=0
      for na in "${new_agents[@]}"; do [ "$name" = "$na" ] && keep=1 && break; done
      [ "$keep" -eq 0 ] && rm "$af" && echo "  [CLEAN] removed old agent: $name"
    done
  fi
  return 0
}

# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

resolve_scope

echo "JWForge Installer"
echo "================="
echo "Source: $JWFORGE_HOME"
echo "Scope:  $SCOPE_LABEL"
echo ""

migration_check

if [ "$DRY_RUN" -eq 1 ]; then
  print_plan
  echo ""
  echo "[dry-run] no filesystem changes performed."
  exit 0
fi

if [ "$GLOBAL" -eq 1 ]; then confirm_global; fi

echo "[1/5] Creating directories..."
create_dirs
echo "  [OK] directories ready"

echo "[2/5] Copying files..."
copy_files
echo "  [OK] runtime files copied"

echo "[3/5] Cleaning up old files..."
cleanup_legacy
echo "  [OK] legacy cleanup complete"

echo "[4/5] Registering hooks and env vars in $SETTINGS_FILE ..."
merge_settings
echo "  [OK] settings.json updated"

echo "[5/5] Done."
echo ""
echo "================================"
echo "  JWForge installed successfully"
echo "  scope: $SCOPE_LABEL"
echo "================================"
echo ""
echo "Skills available:"
echo "  /forge <task>   Full pipeline (interview -> design -> build -> verify)"
echo "  /fix            Fix-only mode (Phase 4 verification + repair)"
