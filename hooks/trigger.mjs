#!/usr/bin/env node

/**
 * JWForge Trigger Hook (UserPromptSubmit)
 *
 * Detects /forge and /fix triggers in user messages and creates the pipeline
 * lock file BEFORE the AI processes the message. This lock enforces state.json
 * initialization before any file modifications can proceed.
 *
 * Lock file: .jwforge/current/pipeline-required.json
 *
 * Triggers:
 *   /forge       → full pipeline (Discover -> Design -> Build -> Verify)
 *   /fix         → fix-only mode (Phase 4 steps only)
 *   cancel words → remove lock file
 *   tdd/test first → inject TDD mode message
 *
 * Word-boundary matching prevents false positives (/forger should NOT match /forge).
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { readStdin, getCwd, ALLOW, ALLOW_MSG, isLockStale, logHookError } from './lib/core.mjs';

// --- Cancel keyword patterns (checked first, highest priority) ---
const CANCEL_PATTERNS = ['취소', 'cancel', 'stop forge', 'abort'];

// --- TDD mode injection message ---
const TDD_MESSAGE = `<jwforge-tdd-mode>
[TDD MODE] Write or update tests first, confirm they fail for the right reason, then implement the fix.
</jwforge-tdd-mode>`;

/**
 * Test whether the message contains a word-boundary-matched trigger.
 * Handles slash-prefixed triggers like /forge and /fix.
 * - /forger must NOT match /forge
 * - /fixing must NOT match /fix
 * Uses (?:^|\s) before and (?:\s|$) after to enforce boundaries.
 */
function hasTrigger(message, trigger) {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i').test(message);
}

/**
 * Test whether the message contains a cancel keyword.
 * Uses simple case-insensitive substring match (cancel words are unambiguous).
 */
function hasCancel(message) {
  const lower = message.toLowerCase();
  return CANCEL_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

/**
 * Test whether the message contains TDD-related keywords.
 */
function hasTddKeyword(message) {
  const lower = message.toLowerCase();
  return lower.includes('tdd') || lower.includes('test first') || lower.includes('테스트 먼저');
}

/**
 * Create the pipeline lock file immediately on trigger detection.
 * This runs BEFORE the AI processes the message, so even if the AI
 * skips state.json creation, guards will block unauthorized file edits.
 *
 * @param {string} cwd - project root directory
 * @param {string} pipeline - always "forge" for this hook
 * @param {string} userMessage - original user message (truncated for storage)
 * @param {string|undefined} mode - optional mode override (e.g. "fix")
 */
function createPipelineLock(cwd, pipeline, userMessage, mode) {
  const lockDir = join(cwd, '.jwforge', 'current');
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  const lockFile = join(lockDir, 'pipeline-required.json');

  // Stale lock handling: remove existing stale lock before creating a new one
  if (existsSync(lockFile)) {
    try {
      const existingLock = JSON.parse(readFileSync(lockFile, 'utf8'));
      if (isLockStale(existingLock)) {
        unlinkSync(lockFile);
      }
    } catch {
      // Corrupted lock — overwrite silently
    }
  }

  const lockData = {
    pipeline,
    triggered_at: new Date().toISOString(),
    user_message: userMessage.substring(0, 200),
    state_initialized: false,
    ...(mode ? { mode } : {}),
    note: 'Created by trigger hook. All Edit/Write/Bash guards check this file. The AI MUST initialize state.json through the pipeline protocol before any code modifications.'
  };

  writeFileSync(lockFile, JSON.stringify(lockData, null, 2));
}

/**
 * Remove pipeline lock on cancel keyword detection.
 */
function removePipelineLock(cwd) {
  const lockFile = join(cwd, '.jwforge', 'current', 'pipeline-required.json');
  if (existsSync(lockFile)) {
    try { unlinkSync(lockFile); } catch { /* ignore */ }
  }
}

async function main() {
  try {
    // Fast early-return: most messages have no trigger keywords
    const raw = await readStdin();
    if (!raw.trim()) {
      console.log(ALLOW);
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.log(ALLOW);
      return;
    }

    const userMessage = (data.message || data.content || data.prompt || '').trim();
    if (!userMessage) {
      console.log(ALLOW);
      return;
    }

    const cwd = getCwd();

    // Priority 1: Cancel keywords — remove any existing lock
    if (hasCancel(userMessage)) {
      removePipelineLock(cwd);
      console.log(ALLOW);
      return;
    }

    // Priority 2: /forge trigger — full pipeline
    if (hasTrigger(userMessage, '/forge')) {
      createPipelineLock(cwd, 'forge', userMessage, undefined);
      console.log(ALLOW_MSG(
        '[JWForge] Pipeline lock created for /forge. All file modifications are blocked until state.json is properly initialized through the pipeline protocol.'
      ));
      return;
    }

    // Priority 3: /fix trigger — fix-only mode (Phase 4 only)
    if (hasTrigger(userMessage, '/fix')) {
      createPipelineLock(cwd, 'forge', userMessage, 'fix');
      console.log(ALLOW_MSG(
        '[JWForge] Pipeline lock created for /fix (fix mode). Running Phase 4 verification + fix loop only.'
      ));
      return;
    }

    // Priority 4: TDD mode keyword injection (no lock)
    if (hasTddKeyword(userMessage)) {
      console.log(ALLOW_MSG(TDD_MESSAGE));
      return;
    }

    // No match — allow without any injection
    console.log(ALLOW);
  } catch (e) {
    logHookError('trigger', e);
    console.log(ALLOW);
  }
}

main();
