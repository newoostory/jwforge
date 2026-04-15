#!/usr/bin/env node

/**
 * JWForge Hook Core Utilities
 *
 * Foundation module imported by every hook.
 * Pure utility module — no hook-specific business logic.
 * Pure Node.js (fs, path only). No npm packages.
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
//
// Handles the Claude Code hook stdin timing issue: stdin data may arrive late.
// Uses a 100ms fast-path check (resolve if stdin already ended) with a
// 1900ms fallback timeout. Total budget is under 3 seconds.

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

    // Short-circuit check: after 100ms, if stdin ended (data arrived and stream
    // closed), resolve. Otherwise fall back to the 1900ms timeout (2000ms total).
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
  try {
    const stateFile = join(cwd, JWFORGE_DIR, 'current', 'state.json');
    if (!existsSync(stateFile)) return null;
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

export function getCwd() {
  return process.env.CLAUDE_CWD || process.cwd();
}

// --- Pipeline Artifact Check ---

export function isPipelineArtifact(filePath, cwd) {
  try {
    const normalized = filePath.replace(/\\/g, '/');
    const jwforgeDir = join(cwd, JWFORGE_DIR).replace(/\\/g, '/');
    return normalized.startsWith(jwforgeDir) || normalized.includes('.jwforge/');
  } catch {
    return false;
  }
}

// --- Architecture File Check ---

export function isFileInArchitecture(filePath, archContent, cwd) {
  try {
    const normalized = filePath.replace(/\\/g, '/');
    const relative = normalized.replace(cwd.replace(/\\/g, '/') + '/', '');
    function matchesBoundary(path) {
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:^|[\\s"'\`\\[\\]()|,:\\n])${escaped}(?=[\\s"'\`\\[\\]()|,:\\n]|$)`);
      return re.test(archContent);
    }
    return matchesBoundary(normalized) || matchesBoundary(relative);
  } catch {
    return false;
  }
}

// --- Lock Staleness Check ---

const DEFAULT_LOCK_TTL_MS = 3600000; // 1 hour

export function isLockStale(lockData, maxAgeMs = DEFAULT_LOCK_TTL_MS) {
  try {
    if (!lockData?.triggered_at) return false;
    return (Date.now() - new Date(lockData.triggered_at).getTime()) > maxAgeMs;
  } catch {
    return false;
  }
}

// --- Pipeline Lock Check ---

export function checkPipelineLock(cwd) {
  try {
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
  } catch {
    return null;
  }
}

// --- Phase Advance Detection ---

/**
 * Returns true if newState represents a phase advancement over oldState.
 * Used by state-validator to skip full checks on non-phase-advancing writes.
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

// --- Phase Guard Evaluation ---

/**
 * Consolidates all phase-based access control logic.
 *
 * Phase 1-2: blocks project file edits (pipeline artifacts always allowed upstream)
 * Phase 3:   validates file against architecture.md
 * Phase 4:   warns only
 *
 * Handles both file paths (for Edit/Write) and bash commands (for Bash tool),
 * extracting file targets from commands via regex.
 *
 * Returns {action: "allow"|"block"|"warn", reason: string}
 * Never throws — returns {action: "allow", reason: ""} on any internal error.
 */
export function evaluatePhaseGuard(state, { filePath, command, cwd }) {
  try {
    const phase = state.phase;

    // If no file target provided, allow
    if (!filePath && !command) {
      return { action: 'allow', reason: '' };
    }

    // Phase 1-2: block all project file edits unconditionally
    // (S complexity pipeline shortcut is handled at conductor level — guard never sees it here)
    if (phase <= 2) {
      return {
        action: 'block',
        reason: `Cannot edit project files during Phase ${phase} (${phase === 1 ? 'Discover' : 'Design'}). Complete the design first. No code before design approval.`
      };
    }

    // Phase 3: check file against architecture.md
    if (phase === 3) {
      const archFile = join(cwd, JWFORGE_DIR, 'current', 'architecture.md');
      if (existsSync(archFile)) {
        let archContent;
        try {
          archContent = readFileSync(archFile, 'utf8');
        } catch {
          // Can't read architecture — fail open
          return { action: 'allow', reason: '' };
        }

        if (filePath) {
          if (!isFileInArchitecture(filePath, archContent, cwd)) {
            const normalized = filePath.replace(/\\/g, '/');
            return {
              action: 'block',
              reason: `"${normalized}" is NOT in architecture.md. Only files listed in the architecture document can be modified during Phase 3 (Build). Update architecture.md first if this file needs changes.`
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
  } catch {
    return { action: 'allow', reason: '' };
  }
}
