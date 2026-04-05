#!/usr/bin/env bash
# JWForge Updater — pulls latest from GitHub and reinstalls
set -e

REPO="newoostory/jwforge"
JWFORGE_LOCAL="$HOME/jwforge"

# ── Colors ──
GRN='\033[92m'; YEL='\033[93m'; RED='\033[91m'; CYN='\033[96m'; RST='\033[0m'; BLD='\033[1m'

info()  { echo -e "${CYN}[jwforge]${RST} $1"; }
ok()    { echo -e "${GRN}[  OK  ]${RST} $1"; }
warn()  { echo -e "${YEL}[ WARN ]${RST} $1"; }
fail()  { echo -e "${RED}[ FAIL ]${RST} $1"; exit 1; }

# ── Preflight checks ──

command -v gh &>/dev/null || fail "gh CLI not found. Install: https://cli.github.com"
gh auth status &>/dev/null 2>&1 || fail "gh not authenticated. Run: gh auth login"

echo -e "${BLD}${CYN}⚡ JWForge Updater${RST}"
echo ""

# ── Determine current version ──

CURRENT_VER="unknown"
CURRENT_COMMIT="unknown"
META_FILE="$HOME/.claude/jwforge/.install-meta.json"
if [ -f "$META_FILE" ]; then
  CURRENT_VER=$(node -e "const m=JSON.parse(require('fs').readFileSync('$META_FILE','utf8')); console.log(m.version||'unknown')" 2>/dev/null || echo "unknown")
  CURRENT_COMMIT=$(node -e "const m=JSON.parse(require('fs').readFileSync('$META_FILE','utf8')); console.log(m.commit||'unknown')" 2>/dev/null || echo "unknown")
fi
info "Current version: ${BLD}${CURRENT_VER}${RST} (${CURRENT_COMMIT})"

# ── Strategy: clone/pull to ~/jwforge, then reinstall ──

if [ -d "$JWFORGE_LOCAL/.git" ]; then
  # Already cloned — pull latest
  info "Pulling latest from ${BLD}$REPO${RST}..."
  cd "$JWFORGE_LOCAL"
  BEFORE=$(git rev-parse HEAD)
  git pull --ff-only origin main 2>/dev/null || git pull --ff-only origin master 2>/dev/null || fail "git pull failed. Resolve manually in $JWFORGE_LOCAL"
  AFTER=$(git rev-parse HEAD)

  if [ "$BEFORE" = "$AFTER" ]; then
    AFTER_SHORT="${AFTER:0:7}"
    # Also check if the installed commit already matches this commit
    if [ "$CURRENT_COMMIT" = "$AFTER_SHORT" ] || [ "$CURRENT_COMMIT" = "$AFTER" ]; then
      ok "Already up to date (${AFTER_SHORT}) — installed version matches repo"
      echo ""
      read -p "Reinstall anyway? (y/N) " -n 1 -r
      echo ""
      [[ ! $REPLY =~ ^[Yy]$ ]] && { info "No changes. Done."; exit 0; }
    else
      ok "No new commits (${AFTER_SHORT}) — but reinstalling to sync installed state"
    fi
  else
    COMMITS=$(git log --oneline "$BEFORE".."$AFTER" | wc -l | tr -d ' ')
    ok "Updated: ${COMMITS} new commit(s)"
    git log --oneline "$BEFORE".."$AFTER" | head -5 | while read line; do
      echo -e "  ${GRN}+${RST} $line"
    done
    [ "$COMMITS" -gt 5 ] && echo -e "  ${YEL}... and $((COMMITS - 5)) more${RST}"
  fi
else
  # Fresh clone
  info "Cloning ${BLD}$REPO${RST} to $JWFORGE_LOCAL..."
  gh repo clone "$REPO" "$JWFORGE_LOCAL" -- --depth 1
  ok "Cloned successfully"
fi

echo ""

# ── Reinstall ──

info "Running installer..."
cd "$JWFORGE_LOCAL"
bash install.sh --global

# ── Read new version ──

NEW_VER="unknown"
NEW_COMMIT="unknown"
if [ -f "$META_FILE" ]; then
  NEW_VER=$(node -e "const m=JSON.parse(require('fs').readFileSync('$META_FILE','utf8')); console.log(m.version||'unknown')" 2>/dev/null || echo "unknown")
  NEW_COMMIT=$(node -e "const m=JSON.parse(require('fs').readFileSync('$META_FILE','utf8')); console.log(m.commit||'unknown')" 2>/dev/null || echo "unknown")
fi

echo ""
echo -e "${BLD}${GRN}⚡ JWForge updated: ${CURRENT_VER} (${CURRENT_COMMIT}) → ${NEW_VER} (${NEW_COMMIT})${RST}"
