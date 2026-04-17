#!/usr/bin/env node

/**
 * JWForge Hook Shared Utilities
 *
 * Single merged shared library used by ALL hooks.
 * Combines the best of core.mjs (full try/catch, robust error handling)
 * with additions from the previous common.mjs (readLockFile, parseTddUnits).
 *
 * Pure utility module — no hook-specific business logic.
 * Pure Node.js (fs, path only). No npm packages.
 */

import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// --- Path Constants ---

/** Base directory for all JWForge pipeline artifacts */
export const JWFORGE_DIR = '.jwforge';

/** Relative path to the pipeline state file */
export const STATE_FILE = join(JWFORGE_DIR, 'current', 'state.json');

/** Relative path to the pipeline lock file (created by /forge trigger) */
export const LOCK_FILE = join(JWFORGE_DIR, 'current', 'pipeline-required.json');

// --- Response Helpers ---

/** Allow response with suppressed output — use when silently passing through */
export const ALLOW = JSON.stringify({ continue: true, suppressOutput: true });

/**
 * Block response — hard-stops the tool call with a reason message.
 * @param {string} reason - Human-readable explanation of why the action was blocked.
 * @returns {string} JSON-serialized hook decision.
 */
export function BLOCK(reason) {
  return JSON.stringify({ decision: 'block', reason });
}

/**
 * Allow response with a visible message — use when passing through but need to inform.
 * @param {string} message - Message to display to the user.
 * @returns {string} JSON-serialized hook decision.
 */
export function ALLOW_MSG(message) {
  return JSON.stringify({ continue: true, message });
}

// --- Error Logger ---

/**
 * Writes a hook error to stderr in a consistent format.
 * @param {string} hookName - Name of the hook reporting the error.
 * @param {unknown} error - The error value (converted to string).
 */
export function logHookError(hookName, error) {
  process.stderr.write('[jwforge-hook-error] ' + hookName + ': ' + String(error) + '\n');
}

// --- Stdin Reader ---
//
// Handles the Claude Code hook stdin timing issue: stdin data may arrive late.
// Uses a 100ms fast-path check (resolve if stdin already ended) with a
// 1900ms fallback timeout. Total budget is under 3 seconds.

/**
 * Reads all of stdin as a UTF-8 string.
 *
 * Uses a 100ms fast-path: if stdin has already ended by the time the hook
 * runs, resolve immediately. Otherwise waits up to 2000ms total (1900ms
 * remaining after the fast-path check). Never rejects.
 *
 * @returns {Promise<string>} The full stdin content.
 */
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

/**
 * Reads and parses the pipeline state.json for the given working directory.
 * Returns null if the file does not exist or cannot be parsed.
 *
 * @param {string} cwd - Project root directory (absolute path).
 * @returns {object|null} Parsed state object, or null.
 */
export function readState(cwd) {
  try {
    const stateFile = join(cwd, JWFORGE_DIR, 'current', 'state.json');
    if (!existsSync(stateFile)) return null;
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Returns the effective working directory for the current hook invocation.
 * Prefers CLAUDE_CWD env var (set by Claude Code) over process.cwd().
 *
 * @returns {string} Absolute path to the project root.
 */
export function getCwd() {
  return process.env.CLAUDE_CWD || process.cwd();
}

/**
 * Reads and parses the pipeline lock file for the given working directory.
 * Returns null if the file does not exist or cannot be parsed.
 *
 * Unlike checkPipelineLock, this reads the lock unconditionally (does not
 * check for the presence/absence of state.json).
 *
 * @param {string} cwd - Project root directory (absolute path).
 * @returns {object|null} Parsed lock data, or null.
 */
export function readLockFile(cwd) {
  try {
    const lockFile = join(cwd, JWFORGE_DIR, 'current', 'pipeline-required.json');
    if (!existsSync(lockFile)) return null;
    return JSON.parse(readFileSync(lockFile, 'utf8'));
  } catch {
    return null;
  }
}

// --- Pipeline Artifact Check ---

/**
 * Returns true if the given file path is a JWForge pipeline artifact
 * (i.e., lives under the .jwforge/ directory).
 *
 * Pipeline artifacts are always allowed regardless of phase.
 *
 * @param {string} filePath - Absolute or relative file path to test.
 * @param {string} cwd - Project root directory (absolute path).
 * @returns {boolean}
 */
export function isPipelineArtifact(filePath, cwd) {
  try {
    const normalized = filePath.replace(/\\/g, '/');
    const jwforgeDir = join(cwd, JWFORGE_DIR).replace(/\\/g, '/');
    return normalized.startsWith(jwforgeDir) || normalized.includes('.jwforge/');
  } catch {
    return false;
  }
}

// --- Artifact Ownership Map ---

/**
 * Returns the owning agent role for a given pipeline artifact filename,
 * or null if the file is not an agent-owned artifact.
 *
 * @param {string} filename - Basename of the file (e.g. 'task-spec.md').
 * @returns {string|null} Agent role name, or null.
 */
export function getArtifactOwner(filename) {
  const OWNERSHIP_MAP = {
    'interview-log.md': 'interviewer',
    'task-spec.md': 'analyst',
    'architecture.md': 'designer',
  };
  if (OWNERSHIP_MAP[filename]) return OWNERSHIP_MAP[filename];
  if (/^analysis-.*\.md$/.test(filename)) return 'researcher';
  if (/^review-phase\d+\.md$/.test(filename)) return 'reviewer';
  return null; // not an agent-owned artifact
}

// --- Architecture File Check ---

/**
 * Returns true if the given file path appears in the architecture.md content
 * using word-boundary matching (path must be surrounded by non-path characters).
 *
 * Checks both the absolute/full path and the cwd-relative path.
 *
 * @param {string} filePath - Absolute or relative file path to test.
 * @param {string} archContent - Full text content of architecture.md.
 * @param {string} cwd - Project root directory (absolute path).
 * @returns {boolean}
 */
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

/**
 * Returns true if the lock data indicates a stale lock (older than maxAgeMs).
 * A lock with no triggered_at timestamp is never considered stale.
 *
 * @param {object|null} lockData - Parsed lock file data.
 * @param {number} [maxAgeMs=3600000] - Maximum lock age in milliseconds (default: 1 hour).
 * @returns {boolean}
 */
export function isLockStale(lockData, maxAgeMs = DEFAULT_LOCK_TTL_MS) {
  try {
    if (!lockData?.triggered_at) return false;
    return (Date.now() - new Date(lockData.triggered_at).getTime()) > maxAgeMs;
  } catch {
    return false;
  }
}

// --- Pipeline Lock Check ---

/**
 * Returns lock data if a pipeline lock exists without a corresponding state.json.
 * This signals that /forge was triggered but the pipeline was never initialized.
 *
 * Stale locks (older than 1 hour) are automatically removed and null is returned.
 *
 * @param {string} cwd - Project root directory (absolute path).
 * @returns {object|null} Lock data if an active uninitialized lock exists, otherwise null.
 */
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
 *
 * @param {object|null} oldState - Previous state object.
 * @param {object|null} newState - New state object being written.
 * @returns {boolean}
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
 * Phase 1-2: blocks ALL project file edits unconditionally.
 *   S-complexity phase skip (1→3) is handled at state transition level by
 *   state-validator, not at file-access level here.
 * Phase 3:   validates file against architecture.md
 * Phase 4:   warns only
 *
 * Handles both file paths (for Edit/Write) and bash commands (for Bash tool),
 * extracting file targets from commands via regex.
 *
 * @param {object} state - Current pipeline state object.
 * @param {object} options
 * @param {string} [options.filePath] - Path of the file being written/edited.
 * @param {string} [options.command] - Bash command being executed.
 * @param {string} options.cwd - Project root directory (absolute path).
 * @returns {{ action: "allow"|"block"|"warn", reason: string }}
 *   Never throws — returns {action: "allow", reason: ""} on any internal error.
 */
export function evaluatePhaseGuard(state, { filePath, command, cwd }) {
  try {
    const phase = state.phase;

    // If no file target provided, allow
    if (!filePath && !command) {
      return { action: 'allow', reason: '' };
    }

    // Phase 1-2: block all project file edits unconditionally.
    // S-complexity phase skip (1→3) is handled at state transition level by
    // state-validator, not at file-access level here.
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

// --- Hook Fast-Path Helper ---

/**
 * Returns true when this cwd does NOT contain a .jwforge/ directory,
 * meaning no active pipeline exists and the hook can be skipped entirely.
 *
 * Fail-closed: returns false when cwd is invalid, does not exist,
 * or any FS error occurs — so the real hook runs instead of being skipped
 * on ambiguous state.
 *
 * @param {string} cwd - Project root directory (absolute path).
 * @returns {boolean} true = skip hook; false = run hook.
 */
export function shouldSkipHook(cwd) {
  try {
    if (typeof cwd !== 'string' || cwd.length === 0) return false;
    if (!existsSync(cwd)) return false;
    return !existsSync(join(cwd, '.jwforge'));
  } catch {
    return false;
  }
}

// --- TDD Unit Parser ---

/**
 * Parses Unit/Task definitions from architecture.md content.
 *
 * Supports two header formats:
 *   ### Unit-N: {feature name}   (preferred)
 *   ### Task-N: {feature name}   (backward compat)
 *
 * Each unit block may contain:
 *   - test_files: [path1, path2, ...]
 *   - impl_files: [path1, path2, ...]
 *   - files: [path1, path2, ...]   (legacy — treated as impl_files)
 *
 * File paths may be bare, backtick-wrapped, or comma-separated inside brackets.
 *
 * @param {string} architectureMd - Full text content of architecture.md.
 * @returns {{ units: { [id: string]: { test_files: string[], impl_files: string[] } } }|null}
 *   Structured unit data, or null on parse failure or if no units found.
 */
export function parseTddUnits(architectureMd) {
  try {
    if (!architectureMd || typeof architectureMd !== 'string') return null;

    /**
     * Parses a file list value string (e.g. "[hooks/lib/common.mjs, `config/pipeline.json`]")
     * into an array of clean path strings.
     * @param {string} raw
     * @returns {string[]}
     */
    function parseFileList(raw) {
      // Strip surrounding brackets if present
      const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
      return inner
        .split(',')
        .map(s => s.trim().replace(/^`|`$/g, '').trim())
        .filter(s => s.length > 0);
    }

    // Find all ### Unit-N: or ### Task-N: headers
    const headerRe = /^###\s+(?:Unit|Task)-(\d+):\s*(.*)$/gm;
    const units = {};
    let match;

    while ((match = headerRe.exec(architectureMd)) !== null) {
      const id = match[1];
      const headerIndex = match.index;

      // Grab the text block from this header until the next ### header or EOF
      const nextHeaderMatch = /^###\s+/m.exec(architectureMd.slice(headerIndex + match[0].length));
      const blockEnd = nextHeaderMatch
        ? headerIndex + match[0].length + nextHeaderMatch.index
        : architectureMd.length;
      const block = architectureMd.slice(headerIndex, blockEnd);

      // Extract field values
      const testFilesMatch = /^-\s*test_files:\s*(.+)$/m.exec(block);
      const implFilesMatch = /^-\s*impl_files:\s*(.+)$/m.exec(block);
      const filesMatch = /^-\s*files:\s*(.+)$/m.exec(block);

      let test_files = [];
      let impl_files = [];

      if (testFilesMatch || implFilesMatch) {
        // Preferred format: separate test_files and impl_files
        if (testFilesMatch) test_files = parseFileList(testFilesMatch[1]);
        if (implFilesMatch) impl_files = parseFileList(implFilesMatch[1]);
      } else if (filesMatch) {
        // Legacy format: only files — treat all as impl_files
        impl_files = parseFileList(filesMatch[1]);
        test_files = [];
      }

      units[id] = { test_files, impl_files };
    }

    if (Object.keys(units).length === 0) return null;
    return { units };
  } catch {
    return null;
  }
}
