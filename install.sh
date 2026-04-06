#!/usr/bin/env bash
# JWForge Installer v2
# Installs skills, commands, and hooks into Claude Code's .claude/ directory.
# Supports both global (~/.claude) and project-local (.claude/) installation.

set -e

JWFORGE_HOME="$(cd "$(dirname "$0")" && pwd)"

# --- Helpers ---

# Cross-platform path handling
to_node_path() {
  if command -v cygpath &>/dev/null; then
    cygpath -m "$1"
  else
    echo "$1"
  fi
}

copy_file() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
}

copy_dir() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  cp -r "$src"/* "$dst"/ 2>/dev/null || true
}

# --- Parse arguments ---

INSTALL_MODE="global"   # global = ~/.claude, local = ./.claude (project)
TARGET_PROJECT=""

usage() {
  echo "Usage: bash install.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --global           Install to ~/.claude (default)"
  echo "  --local [PATH]     Install to <PATH>/.claude (default: current dir)"
  echo "  --help             Show this help"
  echo ""
  echo "Examples:"
  echo "  bash install.sh                        # Global install"
  echo "  bash install.sh --local                # Install into current project"
  echo "  bash install.sh --local /path/to/proj  # Install into specific project"
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --global)
      INSTALL_MODE="global"
      shift
      ;;
    --local)
      INSTALL_MODE="local"
      if [[ -n "$2" && ! "$2" =~ ^-- ]]; then
        TARGET_PROJECT="$2"
        shift
      fi
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# --- Determine target directory ---

if [[ "$INSTALL_MODE" == "global" ]]; then
  CLAUDE_DIR="$HOME/.claude"
  echo "JWForge Installer (global)"
  echo "=========================="
else
  if [[ -n "$TARGET_PROJECT" ]]; then
    CLAUDE_DIR="$TARGET_PROJECT/.claude"
  else
    CLAUDE_DIR="$(pwd)/.claude"
  fi
  echo "JWForge Installer (local)"
  echo "========================="
fi

JWFORGE_HOME_NODE="$(to_node_path "$JWFORGE_HOME")"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
SETTINGS_FILE_NODE="$(to_node_path "$SETTINGS_FILE")"

echo "Source:  $JWFORGE_HOME"
echo "Target:  $CLAUDE_DIR"
echo ""

# --- 1. Install Skills ---

echo "[1/6] Installing skills..."

# Install all skills from skill-sources/
for skill_dir in "$JWFORGE_HOME/skill-sources"/*/; do
  skill_name="$(basename "$skill_dir")"
  TARGET_SKILL="$CLAUDE_DIR/skills/$skill_name"
  mkdir -p "$TARGET_SKILL"
  copy_file "$skill_dir/SKILL.md" "$TARGET_SKILL/SKILL.md"
  # Copy skill-local subdirectories (e.g., references/)
  for subdir in "$skill_dir"*/; do
    if [[ -d "$subdir" ]]; then
      subdir_name="$(basename "$subdir")"
      copy_dir "$subdir" "$TARGET_SKILL/$subdir_name"
      echo "  [OK] /$skill_name/$subdir_name/ -> $TARGET_SKILL/$subdir_name/"
    fi
  done
  echo "  [OK] /$skill_name skill -> $TARGET_SKILL/SKILL.md"
done

# Install commands from commands/ subdirectories
for cmd_dir in "$JWFORGE_HOME/commands"/*/; do
  if [[ -d "$cmd_dir" ]]; then
    cmd_name="$(basename "$cmd_dir")"
    TARGET_CMD="$CLAUDE_DIR/commands/$cmd_name"
    copy_dir "$cmd_dir" "$TARGET_CMD"
    echo "  [OK] /$cmd_name commands -> $TARGET_CMD/"
  fi
done

# --- 2. Install JWForge runtime files ---

echo "[2/6] Installing runtime files..."

# Create jwforge runtime directory inside .claude
RUNTIME_DIR="$CLAUDE_DIR/jwforge"
mkdir -p "$RUNTIME_DIR"

# Copy agents, templates, config, hooks
copy_dir "$JWFORGE_HOME/agents" "$RUNTIME_DIR/agents"
echo "  [OK] agents/ -> $RUNTIME_DIR/agents/"

copy_dir "$JWFORGE_HOME/templates" "$RUNTIME_DIR/templates"
echo "  [OK] templates/ -> $RUNTIME_DIR/templates/"

copy_dir "$JWFORGE_HOME/config" "$RUNTIME_DIR/config"
echo "  [OK] config/ -> $RUNTIME_DIR/config/"

copy_dir "$JWFORGE_HOME/hooks" "$RUNTIME_DIR/hooks"
echo "  [OK] hooks/ -> $RUNTIME_DIR/hooks/"

# Copy skill source files (referenced by commands)
copy_dir "$JWFORGE_HOME/skills" "$RUNTIME_DIR/skills"
echo "  [OK] skills/ -> $RUNTIME_DIR/skills/"

# --- 3. Patch paths in installed files ---

echo "[3/6] Configuring paths..."

RUNTIME_DIR_NODE="$(to_node_path "$RUNTIME_DIR")"

# Patch all SKILL.md files to reference the runtime directory
for skill_file in "$CLAUDE_DIR/skills"/*/SKILL.md; do
  if [[ -f "$skill_file" ]]; then
    sed -i "s|Read(\"skills/|Read(\"$RUNTIME_DIR_NODE/skills/|g" "$skill_file"
    sed -i "s|Read(\"config/|Read(\"$RUNTIME_DIR_NODE/config/|g" "$skill_file"
    sed -i "s|in \`agents/\`|in \`$RUNTIME_DIR_NODE/agents/\`|g" "$skill_file"
    sed -i "s|in \`templates/\`|in \`$RUNTIME_DIR_NODE/templates/\`|g" "$skill_file"
    # Patch skill-local reference paths (e.g., wiki references/)
    local skill_name="$(basename "$(dirname "$skill_file")")"
    local skill_dir_node="$(to_node_path "$CLAUDE_DIR/skills/$skill_name")"
    sed -i "s|Read(\"references/|Read(\"$skill_dir_node/references/|g" "$skill_file"
  fi
done

echo "  [OK] Paths configured to $RUNTIME_DIR_NODE"

# --- 4. Register hooks ---

echo "[4/6] Registering hooks..."

# Read hooks.json and register into settings.json
HOOKS_JSON="$JWFORGE_HOME/hooks/hooks.json"
if [[ -f "$HOOKS_JSON" ]]; then
  HOOKS_JSON_NODE="$(to_node_path "$HOOKS_JSON")"

  if [ ! -f "$SETTINGS_FILE" ]; then
    echo '{}' > "$SETTINGS_FILE"
  fi

  node -e "
    const fs = require('fs');
    const raw = fs.readFileSync('$SETTINGS_FILE_NODE', 'utf8').replace(/^\uFEFF/, '');
    const settings = JSON.parse(raw);
    const hooksConfig = JSON.parse(fs.readFileSync('$HOOKS_JSON_NODE', 'utf8'));

    if (!settings.hooks) settings.hooks = {};

    // Replace \$CLAUDE_PLUGIN_ROOT with actual runtime path
    const runtimePath = '$RUNTIME_DIR_NODE';
    const replaceRoot = (cmd) => cmd.replace(/\\\$CLAUDE_PLUGIN_ROOT|\\\"\\\$CLAUDE_PLUGIN_ROOT\\\"/g, '\"' + runtimePath + '\"').replace(/\"\"/g, '\"');

    // Remove old JWForge hooks from every event array, preserve all others
    for (const event of Object.keys(settings.hooks)) {
      settings.hooks[event] = (settings.hooks[event] || []).filter(
        (h) => typeof h.command !== 'string' || !h.command.includes('jwforge')
      );
    }

    // Add fresh JWForge hooks
    for (const [event, matchers] of Object.entries(hooksConfig.hooks || {})) {
      if (!settings.hooks[event]) settings.hooks[event] = [];
      for (const matcher of matchers) {
        for (const hook of matcher.hooks) {
          const entry = {
            matcher: matcher.matcher || '',
            command: replaceRoot(hook.command)
          };
          if (hook.timeout) entry.timeout = hook.timeout;
          settings.hooks[event].push(entry);
        }
      }
    }

    fs.writeFileSync('$SETTINGS_FILE_NODE', JSON.stringify(settings, null, 2));
  "
  echo "  [OK] Hooks merged from hooks.json (old JWForge hooks replaced, others preserved)"
else
  echo "  [WARN] hooks.json not found, skipping hook registration"
fi

# --- 6/6. Add .jwforge/ to gitignore ---

if [[ "$INSTALL_MODE" == "global" ]]; then
  GITIGNORE="$HOME/.gitignore_global"
  if [ -f "$GITIGNORE" ]; then
    if ! grep -q ".jwforge/" "$GITIGNORE" 2>/dev/null; then
      echo ".jwforge/" >> "$GITIGNORE"
      echo "  [OK] Added .jwforge/ to global gitignore"
    fi
  else
    echo ".jwforge/" > "$GITIGNORE"
    git config --global core.excludesfile "$GITIGNORE" 2>/dev/null || true
    echo "  [OK] Created global gitignore with .jwforge/"
  fi
else
  # Local: add to project .gitignore
  PROJECT_DIR="$(dirname "$CLAUDE_DIR")"
  GITIGNORE="$PROJECT_DIR/.gitignore"
  if [ -f "$GITIGNORE" ]; then
    if ! grep -q ".jwforge/" "$GITIGNORE" 2>/dev/null; then
      echo "" >> "$GITIGNORE"
      echo "# JWForge runtime state" >> "$GITIGNORE"
      echo ".jwforge/" >> "$GITIGNORE"
      echo "  [OK] Added .jwforge/ to project .gitignore"
    fi
  else
    echo "# JWForge runtime state" > "$GITIGNORE"
    echo ".jwforge/" >> "$GITIGNORE"
    echo "  [OK] Created .gitignore with .jwforge/"
  fi
fi

# --- 5. Install statusline ---

echo "[5/6] Installing statusline..."

STATUSLINE_SRC="$JWFORGE_HOME/statusline/statusline.sh"
STATUSLINE_DST="$CLAUDE_DIR/statusline.sh"

if [[ -f "$STATUSLINE_SRC" ]]; then
  copy_file "$STATUSLINE_SRC" "$STATUSLINE_DST"
  chmod +x "$STATUSLINE_DST"

  # Register statusLine in settings.json
  node -e "
    const fs = require('fs');
    const raw = fs.readFileSync('$SETTINGS_FILE_NODE', 'utf8').replace(/^\uFEFF/, '');
    const settings = JSON.parse(raw);
    settings.statusLine = {
      type: 'command',
      command: '~/.claude/statusline.sh',
      padding: 1
    };
    fs.writeFileSync('$SETTINGS_FILE_NODE', JSON.stringify(settings, null, 2));
  "
  echo "  [OK] statusline.sh -> $STATUSLINE_DST"
  echo "  [OK] statusLine registered in settings.json"
else
  echo "  [SKIP] statusline/statusline.sh not found"
fi

# --- Done ---

# Write install metadata for uninstaller
REPO_VERSION=$(node -e "try{const s=JSON.parse(require('fs').readFileSync('$(to_node_path "$JWFORGE_HOME/config/settings.json")', 'utf8'));console.log(s.version||'unknown')}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")
INSTALL_COMMIT=$(cd "$JWFORGE_HOME" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
cat > "$RUNTIME_DIR/.install-meta.json" <<EOF
{
  "version": "$REPO_VERSION",
  "commit": "$INSTALL_COMMIT",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "install_mode": "$INSTALL_MODE",
  "source": "$JWFORGE_HOME_NODE",
  "target": "$(to_node_path "$CLAUDE_DIR")"
}
EOF

echo ""
echo "================================"
echo "  JWForge installed successfully"
echo "================================"
echo ""
echo "Skills available:"
echo "  /jwforge <task>  Full pipeline (new features, complex changes)"
echo "  /deeptk <task>   Heavy pipeline with relay architecture (M/L/XL tasks)"
echo "  /surface <task>  Light pipeline (bug fix, refactor, config)"
echo "  /resume          Resume a stopped pipeline"
echo "  /wiki            LLM wiki — knowledge base management (standalone)"
echo ""
echo "To uninstall: bash $JWFORGE_HOME/uninstall.sh $([ "$INSTALL_MODE" == "local" ] && echo "--local $(dirname "$CLAUDE_DIR")")"
