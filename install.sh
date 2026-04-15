#!/usr/bin/env bash
# JWForge Installer
# Installs skills, hooks, and runtime files into ~/.claude/

set -e

JWFORGE_HOME="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
INSTALL_DIR="$CLAUDE_DIR/jwforge"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

echo "JWForge Installer"
echo "================="
echo "Source:  $JWFORGE_HOME"
echo "Target:  $CLAUDE_DIR"
echo ""

# --- 1. Create directories ---

echo "[1/5] Creating directories..."

mkdir -p "$CLAUDE_DIR/skills/forge"
mkdir -p "$INSTALL_DIR/skills"
mkdir -p "$INSTALL_DIR/agents"
mkdir -p "$INSTALL_DIR/config"
mkdir -p "$INSTALL_DIR/templates"
mkdir -p "$INSTALL_DIR/hooks"
mkdir -p "$INSTALL_DIR/hooks/lib"

echo "  [OK] Directories created"

# --- 2. Copy files ---

echo "[2/5] Copying files..."

# Skill discovery wrapper
cp "$JWFORGE_HOME/skill-sources/forge/SKILL.md" "$CLAUDE_DIR/skills/forge/SKILL.md"
echo "  [OK] skill-sources/forge/SKILL.md -> ~/.claude/skills/forge/SKILL.md"

# Full skill file
cp "$JWFORGE_HOME/skills/forge.md" "$INSTALL_DIR/skills/forge.md"
echo "  [OK] skills/forge.md -> ~/.claude/jwforge/skills/forge.md"

# Agent prompts
for f in "$JWFORGE_HOME/agents/"*.md; do
  [ -f "$f" ] || continue
  cp "$f" "$INSTALL_DIR/agents/$(basename "$f")"
done
echo "  [OK] agents/*.md -> ~/.claude/jwforge/agents/"

# Config
cp "$JWFORGE_HOME/config/pipeline.json" "$INSTALL_DIR/config/pipeline.json"
echo "  [OK] config/pipeline.json -> ~/.claude/jwforge/config/"

# Templates
for f in "$JWFORGE_HOME/templates/"*.md; do
  [ -f "$f" ] || continue
  cp "$f" "$INSTALL_DIR/templates/$(basename "$f")"
done
echo "  [OK] templates/*.md -> ~/.claude/jwforge/templates/"

# Hooks
for f in "$JWFORGE_HOME/hooks/"*.mjs; do
  [ -f "$f" ] || continue
  cp "$f" "$INSTALL_DIR/hooks/$(basename "$f")"
done
echo "  [OK] hooks/*.mjs -> ~/.claude/jwforge/hooks/"

# Hook library
for f in "$JWFORGE_HOME/hooks/lib/"*.mjs; do
  [ -f "$f" ] || continue
  cp "$f" "$INSTALL_DIR/hooks/lib/$(basename "$f")"
done
echo "  [OK] hooks/lib/*.mjs -> ~/.claude/jwforge/hooks/lib/"

# --- 3. Cleanup old files ---

echo "[3/5] Cleaning up old files..."

OLD_HOOKS=(
  "pre-tool-guard.mjs"
  "bash-guard.mjs"
  "block-plan-mode.mjs"
  "keyword-detector.mjs"
  "git-commit-guard.mjs"
  "agent-bg-guard.mjs"
  "lifecycle.mjs"
)
# Note: hooks that exist in BOTH old and new systems (notify.mjs, subagent-tracker.mjs, etc.)
# are NOT in this list — they get overwritten by the copy step above.

for hook in "${OLD_HOOKS[@]}"; do
  target="$INSTALL_DIR/hooks/$hook"
  if [ -f "$target" ]; then
    rm "$target"
    echo "  [CLEAN] Removed old hook: $hook"
  fi
done

OLD_SKILL_DIRS=("jwforge" "deeptk" "resume" "retro")
for skill_dir in "${OLD_SKILL_DIRS[@]}"; do
  target="$CLAUDE_DIR/skills/$skill_dir"
  if [ -d "$target" ]; then
    rm -rf "$target"
    echo "  [CLEAN] Removed old skills dir: ~/.claude/skills/$skill_dir/"
  fi
done

OLD_SKILL_FILES=("jwforge.md" "deeptk.md" "retro.md" "surface.md")

# Old config files
OLD_CONFIG_FILES=("phase-config.json")
for config_file in "${OLD_CONFIG_FILES[@]}"; do
  target="$INSTALL_DIR/config/$config_file"
  if [ -f "$target" ]; then
    rm "$target"
    echo "  [CLEAN] Removed old config: $config_file"
  fi
done

# Old hook library
if [ -f "$INSTALL_DIR/hooks/lib/core.mjs" ]; then
  rm "$INSTALL_DIR/hooks/lib/core.mjs"
  echo "  [CLEAN] Removed old hook lib: core.mjs (merged into common.mjs)"
fi

# Old template files
OLD_TEMPLATES=("deeptk-spec.md" "retro-report.md")
for tmpl in "${OLD_TEMPLATES[@]}"; do
  target="$INSTALL_DIR/templates/$tmpl"
  if [ -f "$target" ]; then
    rm "$target"
    echo "  [CLEAN] Removed old template: $tmpl"
  fi
done
for skill_file in "${OLD_SKILL_FILES[@]}"; do
  target="$INSTALL_DIR/skills/$skill_file"
  if [ -f "$target" ]; then
    rm "$target"
    echo "  [CLEAN] Removed old skill file: $skill_file"
  fi
done

# Whitelist: agents that belong in the new system
NEW_AGENTS=(
  "conductor.md" "interviewer.md" "analyst.md" "researcher.md"
  "designer.md" "reviewer-phase1.md" "reviewer-phase2.md" "state-recorder.md"
  "test-writer.md" "executor.md" "code-reviewer.md"
  "verifier.md" "fixer.md" "tester.md" "reviewer-phase4.md"
)
# Remove agents NOT in the whitelist (legacy: architect, analyzer, reviewer, contract-validator, etc.)
if [ -d "$INSTALL_DIR/agents" ]; then
  for agent_file in "$INSTALL_DIR/agents/"*.md; do
    [ -f "$agent_file" ] || continue
    agent_name="$(basename "$agent_file")"
    is_new=0
    for new_agent in "${NEW_AGENTS[@]}"; do
      if [ "$agent_name" = "$new_agent" ]; then
        is_new=1
        break
      fi
    done
    if [ "$is_new" -eq 0 ]; then
      rm "$agent_file"
      echo "  [CLEAN] Removed old agent: $agent_name"
    fi
  done
fi

# --- 4. Register hooks in settings.json ---

echo "[4/5] Registering hooks..."

if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

HOOKS_JSON="$JWFORGE_HOME/hooks/hooks.json"
INSTALL_DIR_ESC="$INSTALL_DIR"

node -e "
  const fs = require('fs');
  const raw = fs.readFileSync('$SETTINGS_FILE', 'utf8').replace(/^\uFEFF/, '');
  const settings = JSON.parse(raw);
  const hooksConfig = JSON.parse(fs.readFileSync('$HOOKS_JSON', 'utf8'));
  const installDir = '$INSTALL_DIR_ESC';

  // Preserve non-JWForge hooks; per-event entries in hooks.json will overwrite their events below
  if (!settings.hooks) settings.hooks = {};

  // Set required env vars (preserve existing env)
  if (!settings.env) settings.env = {};
  settings.env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] = '1';
  settings.env['CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING'] = '1';

  // Replace {{INSTALL_DIR}} with actual path and build hooks
  const replaceDir = (cmd) => cmd.replace(/\{\{INSTALL_DIR\}\}/g, installDir);

  for (const [event, matchers] of Object.entries(hooksConfig.hooks || {})) {
    settings.hooks[event] = [];
    for (const matcher of matchers) {
      const entry = {
        matcher: matcher.matcher || '',
        hooks: matcher.hooks.map(hook => {
          const h = { type: hook.type || 'command', command: replaceDir(hook.command) };
          if (hook.timeout) h.timeout = hook.timeout;
          return h;
        })
      };
      settings.hooks[event].push(entry);
    }
  }

  fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
"

echo "  [OK] Hooks registered, env vars set"

# --- 5. Add .jwforge/ to gitignore ---

echo "[5/5] Configuring gitignore..."

GITIGNORE="$HOME/.gitignore_global"
if [ -f "$GITIGNORE" ]; then
  if ! grep -q "\.jwforge/" "$GITIGNORE" 2>/dev/null; then
    echo ".jwforge/" >> "$GITIGNORE"
    echo "  [OK] Added .jwforge/ to global gitignore"
  else
    echo "  [OK] .jwforge/ already in global gitignore"
  fi
else
  echo ".jwforge/" > "$GITIGNORE"
  git config --global core.excludesfile "$GITIGNORE" 2>/dev/null || true
  echo "  [OK] Created global gitignore with .jwforge/"
fi

# --- Done ---

echo ""
echo "================================"
echo "  JWForge installed successfully"
echo "================================"
echo ""
echo "Skills available:"
echo "  /forge <task>   Full pipeline (interview -> design -> build -> verify)"
echo "  /fix            Fix-only mode (Phase 4 verification + repair)"
echo ""
