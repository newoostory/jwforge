#!/usr/bin/env node

/**
 * JWForge Bash Guard (PreToolUse hook for Bash)
 *
 * Prevents AI from bypassing Edit/Write guards by using Bash to modify files.
 * Blocks: sed -i, echo >, cat <<, tee, cp, mv, and other file-writing commands
 * during pipeline phases where Edit/Write would also be blocked.
 *
 * Same phase logic as pre-tool-guard.mjs but applied to Bash commands.
 * All phase rules check state.phase (pipeline-agnostic), so /deeptk is handled
 * identically to /deep.
 */

import { readStdin, readState, getCwd, isPipelineArtifact, checkPipelineLock, evaluatePhaseGuard, ALLOW, BLOCK, ALLOW_MSG, logHookError } from './lib/common.mjs';

// Patterns that indicate file-writing Bash commands
const FILE_WRITE_PATTERNS = [
  /\bsed\s+-i/i,                        // sed -i (in-place edit)
  /\bsed\s+.*-i/i,                      // sed with -i flag anywhere
  />\s*\S+/,                             // echo > file, command > file
  />>?\s*\S+/,                           // redirect to file
  /\bcat\s*<<\s*/,                       // cat << heredoc
  /\btee\s+/,                            // tee file
  /\bcp\s+/,                             // cp source dest
  /\bmv\s+/,                             // mv source dest
  /\bchmod\s+/,                          // chmod (modifying file permissions)
  /\bpatch\s+/,                          // patch files
  /\bprintf\s+.*>/,                      // printf > file
  /\bdd\s+/,                             // dd (disk duplicate)
  /\binstall\s+-.*\s+\S+/,              // install command
  /\bln\s+-/,                            // ln -s (symlinks)
  /\brm\s+/,                             // rm (file deletion)
  /\bmkdir\s+/,                          // mkdir (directory creation during wrong phase)
  /\btouch\s+/,                          // touch (file creation)
  /\bnpm\s+init/,                        // npm init (creates package.json)
  /\bnpx\s+/,                            // npx (can create/modify files)
  /\bpip\s+install/,                     // pip install
  /\bnpm\s+install/,                     // npm install (modifies node_modules, package.json)
  /\byarn\s+add/,                        // yarn add
  /\bpnpm\s+add/,                        // pnpm add
];

// Redirect/write targets that are always safe to write to regardless of phase
const SAFE_REDIRECT_PREFIXES = ['/dev/null', '/dev/stdout', '/dev/stderr', '/tmp/', '.git/'];

// Commands that are always safe (read-only operations)
const SAFE_PATTERNS = [
  /^\s*git\s+(status|log|diff|show|branch|tag|remote|rev-parse|describe)/,
  /^\s*ls\b/,
  /^\s*cat\s+(?!<<)/,                   // cat without heredoc (just reading)
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*wc\b/,
  /^\s*find\b/,
  /^\s*grep\b/,
  /^\s*rg\b/,
  /^\s*node\s+-e.*console/,             // node -e with console (evaluation)
  /^\s*echo\s+[^>]/,                    // echo without redirect (just printing)
  /^\s*echo$/,                           // bare echo
  /^\s*pwd\b/,
  /^\s*which\b/,
  /^\s*type\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
];

// Check if all file targets in a command are pipeline artifacts
function isWritingToPipelineArtifact(command, cwd) {
  const rawMatches = [...command.matchAll(/(?:^|[\s"'=])([.\w][\w./-]*\.\w{1,5})(?=[\s"';)|]|$)/g)].map(m => m[1]);
  const commandFiles = rawMatches.filter(f => !/\.(tar\.\w+|min\.js|min\.css)$/i.test(f));
  if (commandFiles.length === 0) return false;
  return commandFiles.every(f => isPipelineArtifact(f, cwd));
}

function isFileWriteCommand(command) {
  // Check if it matches any safe pattern first
  if (SAFE_PATTERNS.some(p => p.test(command))) return false;
  // Check if it matches any file write pattern
  return FILE_WRITE_PATTERNS.some(p => p.test(command));
}

// Extract explicit write targets from redirect operators and tee
function extractWriteTargets(command) {
  const targets = [];
  for (const m of command.matchAll(/>>?\s*["']?([^\s"';&|]+)/g)) {
    targets.push(m[1]);
  }
  for (const m of command.matchAll(/\btee\s+(?:-[a-z]\s+)*["']?([^\s"';&|]+)/g)) {
    targets.push(m[1]);
  }
  return targets;
}

// Returns true only if ALL detected write targets are on the safe whitelist.
// Returns false (not safe) if no targets were detected — commands like `cp` or
// `sed -i` write to paths not extractable by redirect regex, so fall through to
// normal blocking logic.
function hasOnlySafeWriteTargets(command) {
  const targets = extractWriteTargets(command);
  if (targets.length === 0) return false;
  return targets.every(t => SAFE_REDIRECT_PREFIXES.some(prefix => t.startsWith(prefix)));
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    const command = data.command || data.input?.command || '';
    if (!command) { console.log(ALLOW); return; }

    const cwd = getCwd();

    // === Pipeline lock check ===
    // If pipeline-required.json exists but state.json doesn't, AI is skipping protocol
    const lockData = checkPipelineLock(cwd);
    if (lockData) {
      // Only block file-writing commands, not read-only ones
      if (isFileWriteCommand(command) && !isWritingToPipelineArtifact(command, cwd) && !hasOnlySafeWriteTargets(command)) {
        console.log(BLOCK(`[JWForge Bash Guard] BLOCKED: Pipeline /${lockData.pipeline || 'deep'} was triggered but state.json not initialized. Follow the pipeline protocol first. No file modifications until pipeline is properly started.`));
        return;
      }
    }

    // No active pipeline and no lock — allow everything
    const state = readState(cwd);
    if (!state || state.status !== 'in_progress') {
      console.log(ALLOW);
      return;
    }

    // Pipeline artifact writes are always allowed
    if (isWritingToPipelineArtifact(command, cwd)) {
      console.log(ALLOW);
      return;
    }

    // Check if this is a file-writing command
    if (!isFileWriteCommand(command)) {
      console.log(ALLOW);
      return;
    }

    // If all detected write targets are safe (e.g. /dev/null, /tmp/, .git/), allow
    if (hasOnlySafeWriteTargets(command)) {
      console.log(ALLOW);
      return;
    }

    // === State.json Bash write block: state.json must only be modified via Write tool ===
    if (/state\.json/.test(command) && isFileWriteCommand(command)) {
      console.log(BLOCK('[JWForge Guard] BLOCKED: state.json must only be modified via the Write tool during active pipeline.'));
      return;
    }

    // === Phase guard: evaluate using shared logic ===
    const guard = evaluatePhaseGuard(state, { command, cwd });
    if (guard.action === 'block') {
      console.log(BLOCK(`[JWForge Bash Guard] BLOCKED: ${guard.reason}`));
      return;
    }
    if (guard.action === 'warn') {
      console.log(ALLOW_MSG(`[JWForge] ${guard.reason}`));
      return;
    }

    console.log(ALLOW);
  } catch (e) {
    logHookError('bash-guard', e);
    console.log(ALLOW);
  }
}

main();
