#!/usr/bin/env node

/**
 * JWForge Hook Shared Utilities
 *
 * Common functions and constants used across all JWForge hooks.
 * Pure utility module — no hook-specific business logic.
 */

import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// --- Path Constants ---

export const JWFORGE_DIR = '.jwforge';
export const STATE_FILE = join(JWFORGE_DIR, 'current', 'state.json');
export const LOCK_FILE = join(JWFORGE_DIR, 'current', 'pipeline-required.json');

// --- Response Helpers ---

export const ALLOW = JSON.stringify({ continue: true, suppressOutput: true });

export function BLOCK(reason) {
  return JSON.stringify({ decision: 'block', reason });
}

export function ALLOW_MSG(message) {
  return JSON.stringify({ continue: true, message });
}

// --- Error Logger ---

export function logHookError(hookName, error) {
  process.stderr.write('[jwforge-hook-error] ' + hookName + ': ' + String(error) + '\n');
}

// --- Stdin Reader ---

export function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;

    // Fast path: stdin already closed before we even start — resolve immediately
    if (process.stdin.readableEnded) {
      resolve(Buffer.concat(chunks).toString('utf-8'));
      return;
    }

    let slowTimeout;
    let fastCheck;

    function settle(value) {
      if (!settled) {
        settled = true;
        clearTimeout(fastCheck);
        clearTimeout(slowTimeout);
        process.stdin.removeAllListeners();
        resolve(value);
      }
    }

    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => settle(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', () => settle(''));

    // Short-circuit check: after 100ms, if stdin ended (data arrived and stream closed), resolve.
    // Otherwise fall back to the 2000ms total timeout (1900ms remaining after the 100ms check).
    fastCheck = setTimeout(() => {
      if (process.stdin.readableEnded) {
        settle(Buffer.concat(chunks).toString('utf-8'));
      } else {
        slowTimeout = setTimeout(() => settle(Buffer.concat(chunks).toString('utf-8')), 1900);
      }
    }, 100);
  });
}

// --- State Readers ---

export function readState(cwd) {
  const stateFile = join(cwd, JWFORGE_DIR, 'current', 'state.json');
  if (!existsSync(stateFile)) return null;
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; }
}

export function getCwd() {
  return process.env.CLAUDE_CWD || process.cwd();
}

export function readLockFile(cwd) {
  const lockFile = join(cwd, JWFORGE_DIR, 'current', 'pipeline-required.json');
  if (!existsSync(lockFile)) return null;
  try { return JSON.parse(readFileSync(lockFile, 'utf8')); } catch { return null; }
}

// --- Surface Pipeline Phase Mapping ---

export const SURFACE_PHASE_MAP = {
  'analyze': 1, 'plan': 2, 'implement': 3, 'verify': 4
};

// --- Pipeline Artifact Check ---

export function isPipelineArtifact(filePath, cwd) {
  const normalized = filePath.replace(/\\/g, '/');
  const jwforgeDir = join(cwd, JWFORGE_DIR).replace(/\\/g, '/');
  return normalized.startsWith(jwforgeDir) || normalized.includes('.jwforge/');
}

// --- Architecture File Check ---

export function isFileInArchitecture(filePath, archContent, cwd) {
  const normalized = filePath.replace(/\\/g, '/');
  const relative = normalized.replace(cwd.replace(/\\/g, '/') + '/', '');
  // Word-boundary match: path must be surrounded by non-path characters
  const boundary = /[\s"'`\[\]()|,:\n]|^|$/;
  function matchesBoundary(path) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[\\s"'\`\\[\\]()|,:\\n])${escaped}(?=[\\s"'\`\\[\\]()|,:\\n]|$)`);
    return re.test(archContent);
  }
  return matchesBoundary(normalized) || matchesBoundary(relative);
}

// --- Lock Staleness Check ---

const DEFAULT_LOCK_TTL_MS = 3600000; // 1 hour

export function isLockStale(lockData, maxAgeMs = DEFAULT_LOCK_TTL_MS) {
  if (!lockData?.triggered_at) return false;
  return (Date.now() - new Date(lockData.triggered_at).getTime()) > maxAgeMs;
}

// --- Pipeline Lock Check ---

export function checkPipelineLock(cwd) {
  const lockFile = join(cwd, JWFORGE_DIR, 'current', 'pipeline-required.json');
  const stateFile = join(cwd, JWFORGE_DIR, 'current', 'state.json');
  if (existsSync(lockFile) && !existsSync(stateFile)) {
    let lockData = {};
    try { lockData = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { /* ignore */ }
    if (isLockStale(lockData)) {
      try { unlinkSync(lockFile); } catch { /* ignore */ }
      return null;
    }
    return lockData;
  }
  return null;
}

// --- Phase Advance Detection ---

/**
 * Returns true if newState represents a phase advancement over oldState.
 * Used by artifact-validator to skip full checks on non-phase-advancing writes.
 */
export function isPhaseAdvance(oldState, newState) {
  try {
    const oldPhase = typeof oldState?.phase === 'number' ? oldState.phase : 0;
    const newPhase = typeof newState?.phase === 'number' ? newState.phase : 0;
    return newPhase > oldPhase;
  } catch {
    return false;
  }
}

/**
 * Returns true if the pipeline is in a user-wait state (e.g. waiting for interview answers).
 * Used by persistent-mode to decide whether session stop is allowed.
 */
export function isUserWaitStep(state) {
  return state?.waiting_for_user === true;
}

// --- Phase Guard Evaluation ---

export function evaluatePhaseGuard(state, { filePath, command, cwd }) {
  // Determine effective phase
  let phase = state.phase;
  if (state.pipeline === 'surface' && state.step) {
    phase = SURFACE_PHASE_MAP[state.step] || state.phase;
  }

  // If no file target provided, allow
  if (!filePath && !command) {
    return { action: 'allow', reason: '' };
  }

  // Phase 1-2: block project files (unless S complexity)
  if (phase <= 2 && state.complexity !== 'S') {
    return {
      action: 'block',
      reason: `Cannot edit project files during Phase ${phase} (${phase === 1 ? 'Deep Interview' : 'Architecture'}). Complete the design first. No code before design approval.`
    };
  }

  // Phase 3: check file against architecture.md
  if (phase === 3) {
    const archFile = join(cwd, JWFORGE_DIR, 'current', 'architecture.md');
    if (existsSync(archFile)) {
      const archContent = readFileSync(archFile, 'utf8');

      if (filePath) {
        if (!isFileInArchitecture(filePath, archContent, cwd)) {
          const normalized = filePath.replace(/\\/g, '/');
          return {
            action: 'block',
            reason: `"${normalized}" is NOT in architecture.md. Only files listed in the architecture document can be modified during Phase 3 (Execute). Update architecture.md first if this file needs changes.`
          };
        }
      }

      if (command) {
        const rawMatches = [...command.matchAll(/(?:^|[\s"'=])([.\w][\w./-]*\.\w{1,5})(?=[\s"';)|]|$)/g)].map(m => m[1]);
        const commandFiles = rawMatches.filter(f => !/\.(tar\.\w+|min\.js|min\.css)$/i.test(f));
        const unauthorized = commandFiles.filter(f => !isFileInArchitecture(f, archContent, cwd));
        if (unauthorized.length > 0) {
          return {
            action: 'block',
            reason: `Bash command targets file(s) not in architecture.md: ${unauthorized.join(', ')}. Only files listed in the architecture can be modified during Phase 3.`
          };
        }
      }
    }
  }

  // Phase 4: warn only
  if (phase === 4) {
    const target = filePath ? `"${filePath.replace(/\\/g, '/')}"` : 'file operation';
    return {
      action: 'warn',
      reason: `Phase 4 (Verify): editing ${target}. Ensure this is part of the fix loop, not new feature work.`
    };
  }

  return { action: 'allow', reason: '' };
}
