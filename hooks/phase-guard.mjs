#!/usr/bin/env node

/**
 * JWForge Phase Guard — Unified Edit/Write/Bash PreToolUse Hook
 *
 * Single hook replacing pre-tool-guard.mjs, bash-guard.mjs, and block-plan-mode.mjs.
 * Registered in settings.json as PreToolUse matching Edit, Write, and Bash tools.
 *
 * Logic order (per architecture.md Task-4 spec):
 *   1. Read stdin, parse JSON
 *   2. Determine if file-modifying operation; safe read-only Bash → early ALLOW
 *   3. Pipeline artifacts (.jwforge/**) → always ALLOW
 *   4. Sensitive files (.env, credentials, .pem, etc.) → BLOCK
 *   5. Pipeline lock exists but no state.json → BLOCK file writes
 *   6. No active pipeline (no state or status != in_progress) → ALLOW
 *   7. evaluatePhaseGuard() from common.mjs → enforce phase-based access control
 *
 * Fail open: any internal error → ALLOW (hooks must never block the user on hook failure).
 */

import { basename } from 'path';
import {
  readStdin,
  readState,
  getCwd,
  isPipelineArtifact,
  checkPipelineLock,
  evaluatePhaseGuard,
  getArtifactOwner,
  shouldSkipHook,
  ALLOW,
  BLOCK,
  ALLOW_MSG,
  logHookError,
} from './lib/common.mjs';

// ---------------------------------------------------------------------------
// Sensitive file patterns — always blocked regardless of phase
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /\.env$/i,
  /\.env\.\w+$/i,
  /credentials\.json$/i,
  /secrets?\.\w+$/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /\.aws\/credentials/i,
];

// ---------------------------------------------------------------------------
// Bash: patterns that indicate file-writing commands
// ---------------------------------------------------------------------------

const FILE_WRITE_PATTERNS = [
  /\bsed\s+-i/i,              // sed -i (in-place edit)
  /\bsed\s+.*-i/i,            // sed with -i flag anywhere
  />\s*\S+/,                  // redirect to file (> or >>)
  />>?\s*\S+/,                // redirect append
  /\bcat\s*<<\s*/,            // cat << heredoc
  /\btee\s+/,                 // tee file
  /\bcp\s+/,                  // cp source dest
  /\bmv\s+/,                  // mv source dest
  /\bchmod\s+/,               // chmod (modifying permissions)
  /\bpatch\s+/,               // patch files
  /\bprintf\s+.*>/,           // printf > file
  /\bdd\s+/,                  // dd (disk duplicate)
  /\binstall\s+-.*\s+\S+/,    // install command
  /\bln\s+-/,                 // ln -s (symlinks)
  /\brm\s+/,                  // rm (file deletion)
  /\bmkdir\s+/,               // mkdir (directory creation)
  /\btouch\s+/,               // touch (file creation)
  /\bnpm\s+init/,             // npm init (creates package.json)
  /\bnpx\s+/,                 // npx (can create/modify files)
  /\bpip\s+install/,          // pip install
  /\bnpm\s+install/,          // npm install
  /\byarn\s+add/,             // yarn add
  /\bpnpm\s+add/,             // pnpm add
];

// Read-only commands — bypass all checks
const SAFE_PATTERNS = [
  /^\s*git\s+(status|log|diff|show|branch|tag|remote|rev-parse|describe)/,
  /^\s*ls\b/,
  /^\s*cat\s+(?!<<)/,         // cat without heredoc (reading only)
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*wc\b/,
  /^\s*find\b/,
  /^\s*grep\b/,
  /^\s*rg\b/,
  /^\s*node\s+-e.*console/,   // node -e with console output
  /^\s*echo\s+[^>]/,          // echo without redirect
  /^\s*echo$/,                 // bare echo
  /^\s*pwd\b/,
  /^\s*which\b/,
  /^\s*type\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
];

// Redirect targets that are always safe regardless of phase
const SAFE_REDIRECT_PREFIXES = ['/dev/null', '/dev/stdout', '/dev/stderr', '/tmp/', '.git/'];

// ---------------------------------------------------------------------------
// Bash helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if this Bash command looks like a file-writing operation.
 * Safe patterns are checked first so read-only commands are never flagged.
 */
function isFileWriteCommand(command) {
  if (SAFE_PATTERNS.some(p => p.test(command))) return false;
  return FILE_WRITE_PATTERNS.some(p => p.test(command));
}

/**
 * Extract explicit write targets from redirect operators and tee invocations.
 */
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

/**
 * Returns true if ALL detected write targets are safe (e.g. /dev/null, /tmp/).
 * Returns false if no redirect targets are found — commands like cp/sed don't
 * use redirects, so we can't confirm they're safe this way.
 */
function hasOnlySafeWriteTargets(command) {
  const targets = extractWriteTargets(command);
  if (targets.length === 0) return false;
  return targets.every(t => SAFE_REDIRECT_PREFIXES.some(prefix => t.startsWith(prefix)));
}

/**
 * Returns true if all file-like tokens in the command point to pipeline artifacts.
 * Used to allow writes to .jwforge/** via Bash.
 */
function isWritingToPipelineArtifact(command, cwd) {
  const rawMatches = [
    ...command.matchAll(/(?:^|[\s"'=])([.\w][\w./-]*\.\w{1,5})(?=[\s"';)|]|$)/g),
  ].map(m => m[1]);
  const commandFiles = rawMatches.filter(f => !/\.(tar\.\w+|min\.js|min\.css)$/i.test(f));
  if (commandFiles.length === 0) return false;
  return commandFiles.every(f => isPipelineArtifact(f, cwd));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    // Step 1: Read and parse stdin
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    // Fast-path: skip all pipeline logic when no .jwforge/ directory is present
    if (shouldSkipHook(process.cwd())) { process.stdout.write(ALLOW); process.exit(0); }

    const cwd = getCwd();

    // Determine the tool type by inspecting input fields.
    // Edit/Write have file_path; Bash has command.
    const filePath = data.tool_input?.file_path || data.input?.file_path || data.file_path || data.filePath || '';
    const command  = data.tool_input?.command || data.input?.command || data.command || '';

    // Early state read — needed by R6 (state.json protection) and R1 (artifact ownership)
    // checks that must run BEFORE safe-command bypass and blanket pipeline-artifact ALLOW.
    const state = readState(cwd);

    // R6 — Block Edit/Bash to state.json; only Write (via state-validator) is allowed.
    // This check runs before the safe-command bypass (Step 2a) because Bash commands like
    // `echo '{}' > state.json` match safe patterns but must still be blocked for state.json.
    if (state && state.status === 'in_progress') {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const isStateJson = normalizedPath.endsWith('state.json') && normalizedPath.includes('.jwforge/current/');

      // Also check Bash command redirect targets for state.json
      let bashTargetsStateJson = false;
      if (!isStateJson && command) {
        const targets = extractWriteTargets(command);
        bashTargetsStateJson = targets.some(t => {
          const nt = t.replace(/\\/g, '/');
          return nt.endsWith('state.json') && nt.includes('.jwforge/current/');
        });
      }

      if (isStateJson || bashTargetsStateJson) {
        // Edit tool has old_string/new_string but no content
        // Bash tool has command
        // Write tool has content — Write goes through state-validator which checks _recorder
        const isEdit = data.tool_input?.old_string !== undefined;
        const isBash = data.tool_input?.command !== undefined;
        if (isEdit || isBash) {
          console.log(BLOCK('state.json must be written via state-recorder using the Write tool only. Edit and Bash to state.json are blocked.'));
          return;
        }
      }
    }

    // Step 2a: For Bash — check if this is even a file-modifying operation.
    // Safe read-only commands bypass everything.
    if (command) {
      if (!isFileWriteCommand(command)) {
        console.log(ALLOW);
        return;
      }
      // Safe redirect targets (/dev/null, /tmp/, .git/) are always fine.
      if (hasOnlySafeWriteTargets(command)) {
        console.log(ALLOW);
        return;
      }
    }

    // Step 2b: For Edit/Write — must have a file path to guard.
    if (!command && !filePath) {
      console.log(ALLOW);
      return;
    }

    // R1 — Artifact ownership: agent-owned .jwforge/current/ files must have content marker
    if (state && state.status === 'in_progress' && filePath && isPipelineArtifact(filePath, cwd)) {
      const fileName = filePath.replace(/\\/g, '/').split('/').pop();
      const owner = getArtifactOwner(fileName);
      if (owner) {
        const isEdit = data.tool_input?.old_string !== undefined;
        const isBash = data.tool_input?.command !== undefined;
        const content = data.tool_input?.content || '';

        // Edit to agent-owned artifacts: always block
        if (isEdit) {
          console.log(BLOCK(`"${fileName}" is owned by the ${owner} agent. Use Write with full content including <!-- _agent: ${owner} --> marker, not Edit.`));
          return;
        }

        // Bash to agent-owned artifacts: block (can't include content marker)
        if (isBash) {
          console.log(BLOCK(`"${fileName}" is owned by the ${owner} agent. Bash writes to agent-owned artifacts are blocked.`));
          return;
        }

        // Write tool: validate content marker
        const firstLine = content.split('\n')[0]?.trim() || '';
        const markerMatch = firstLine.match(/^<!--\s*_agent:\s*(\w+)\s*-->$/);
        if (!markerMatch) {
          console.log(BLOCK(`"${fileName}" is owned by the ${owner} agent. Content must start with <!-- _agent: ${owner} --> as the very first line.`));
          return;
        }
        if (markerMatch[1] !== owner) {
          console.log(BLOCK(`"${fileName}" is owned by the ${owner} agent, but content has <!-- _agent: ${markerMatch[1]} --> marker. Wrong agent.`));
          return;
        }
      }
    }

    // Step 3: Pipeline artifacts (.jwforge/**) are always writable.
    if (filePath && isPipelineArtifact(filePath, cwd)) {
      console.log(ALLOW);
      return;
    }
    if (command && isWritingToPipelineArtifact(command, cwd)) {
      console.log(ALLOW);
      return;
    }

    // Step 4: Sensitive files are always blocked.
    if (filePath) {
      const fileName = basename(filePath);
      if (SENSITIVE_PATTERNS.some(p => p.test(filePath) || p.test(fileName))) {
        console.log(BLOCK(
          `[JWForge Guard] BLOCKED: write to sensitive file "${fileName}". ` +
          `Remove the guard manually if this is intentional.`
        ));
        return;
      }
    }

    // Step 5: Pipeline lock check — lock file exists but state.json doesn't.
    // This means a pipeline was triggered but not yet initialized.
    const lockData = checkPipelineLock(cwd);
    if (lockData) {
      const pipelineName = lockData.pipeline || 'forge';
      console.log(BLOCK(
        `[JWForge Guard] BLOCKED: Pipeline /${pipelineName} was triggered but ` +
        `state.json has not been initialized. You MUST follow the pipeline protocol: ` +
        `create state.json, then proceed through phases. No file modifications allowed ` +
        `until the pipeline is properly started.`
      ));
      return;
    }

    // Step 6: No active pipeline → allow everything.
    if (!state || state.status !== 'in_progress') {
      console.log(ALLOW);
      return;
    }

    // Step 7: Active pipeline — delegate to evaluatePhaseGuard.
    const context = filePath ? { filePath, cwd } : { command, cwd };
    const guard = evaluatePhaseGuard(state, context);

    if (guard.action === 'block') {
      console.log(BLOCK(`[JWForge Guard] BLOCKED: ${guard.reason}`));
      return;
    }
    if (guard.action === 'warn') {
      console.log(ALLOW_MSG(`[JWForge] ${guard.reason}`));
      return;
    }

    console.log(ALLOW);
  } catch (e) {
    // Fail open — hook errors must never block the user.
    logHookError('phase-guard', e);
    console.log(ALLOW);
  }
}

main();
