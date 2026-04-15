#!/usr/bin/env node

/**
 * JWForge Commit Guard (PreToolUse hook for Bash)
 *
 * Only triggers on git commands. Enforces:
 * 1. [forge] prefix on all commit messages during active pipeline
 * 2. Blocks commits during Phase 1-2 (design-only phases)
 * 3. Blocks --amend during pipeline (preserve commit history)
 * 4. Blocks dangerous git ops (force push, hard reset, checkout ., clean -f, branch -D)
 *
 * Commit prefix loaded from config/pipeline.json with [forge] as hardcoded fallback.
 * Import from './lib/core.mjs'.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  readStdin,
  getCwd,
  readState,
  checkPipelineLock,
  ALLOW,
  BLOCK,
  logHookError,
} from './lib/core.mjs';

// --- Commit Prefix ---

const DEFAULT_PREFIX = '[forge]';

function loadCommitPrefix(cwd) {
  try {
    const configPath = join(cwd, 'config', 'pipeline.json');
    if (!existsSync(configPath)) return DEFAULT_PREFIX;
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config?.git?.commit_prefix || DEFAULT_PREFIX;
  } catch {
    return DEFAULT_PREFIX;
  }
}

// --- Commit Message Extraction ---

/**
 * Extract commit message from a git commit command string.
 * Handles three patterns (priority order):
 *   1. -m "$(cat <<'EOF'\n...\nEOF\n)"   (cat heredoc)
 *   2. <<EOF\n...\nEOF                    (standalone heredoc)
 *   3. -m "message" or -m 'message'       (simple -m)
 * Returns empty string if no message can be extracted.
 */
function extractCommitMessage(command) {
  // Pattern 1: cat heredoc — -m "$(cat <<'EOF' ... EOF )"
  const catHeredocMatch = command.match(/\$\(cat\s+<<\s*['"]?EOF['"]?\s*\n([\s\S]*?)\nEOF\s*\)/);
  if (catHeredocMatch) return catHeredocMatch[1];

  // Pattern 2: standalone heredoc — <<EOF ... EOF
  const standaloneHeredocMatch = command.match(/<<\s*['"]?EOF['"]?\s*\n([\s\S]*?)\nEOF/);
  if (standaloneHeredocMatch) return standaloneHeredocMatch[1];

  // Pattern 3: simple -m "..." or -m '...'
  const simpleMsgMatch = command.match(/-m\s+["']([^"']*?)["']/);
  if (simpleMsgMatch) return simpleMsgMatch[1];

  return '';
}

// --- Dangerous Git Operations ---

const DANGEROUS_PATTERNS = [
  { pattern: /\bgit\s+push\s+.*--force\b/, reason: 'force push' },
  { pattern: /\bgit\s+push\s+-f\b/, reason: 'force push' },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: 'hard reset' },
  { pattern: /\bgit\s+checkout\s+\.\s*$/, reason: 'discard all changes' },
  { pattern: /\bgit\s+checkout\s+--\s+\./, reason: 'discard all changes' },
  { pattern: /\bgit\s+clean\s+-f/, reason: 'force clean' },
  { pattern: /\bgit\s+branch\s+-D\b/, reason: 'force delete branch' },
  { pattern: /\bgit\s+stash\s+drop\b/, reason: 'stash drop' },
];

// --- Main ---

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    // Extract command from Bash tool event
    const command = data.tool_input?.command || data.input?.command || data.command || '';
    if (!command) { console.log(ALLOW); return; }

    // Only check git commands — fast exit for non-git
    if (!/\bgit\b/.test(command)) {
      console.log(ALLOW);
      return;
    }

    const cwd = getCwd();

    // === Pipeline lock check ===
    const lockData = checkPipelineLock(cwd);
    if (lockData !== null) {
      if (/\bgit\s+commit\b/.test(command)) {
        console.log(BLOCK(`[JWForge Commit Guard] BLOCKED: Pipeline /forge was triggered but state.json not initialized. No commits allowed until pipeline protocol is followed.`));
        return;
      }
    }

    // Read pipeline state
    const state = readState(cwd);

    // No active pipeline and no lock — allow all git commands
    if (!state || state.status !== 'in_progress') {
      console.log(ALLOW);
      return;
    }

    // Load the commit prefix from config
    const prefix = loadCommitPrefix(cwd);

    // === Check for git commit ===
    if (/\bgit\s+commit\b/.test(command)) {
      // Block commits during Phase 1-2 (design-only phases, no code to commit)
      if (state.phase <= 2) {
        console.log(BLOCK(`[JWForge Commit Guard] BLOCKED: git commit during Phase ${state.phase} (${state.phase === 1 ? 'Discover' : 'Design'}). No commits allowed before implementation phase.`));
        return;
      }

      // Block --amend during active pipeline
      if (/--amend/.test(command)) {
        console.log(BLOCK('[JWForge Commit Guard] BLOCKED: git commit --amend during active pipeline. Create new commits instead to preserve history.'));
        return;
      }

      // Enforce commit prefix
      const message = extractCommitMessage(command);
      if (message) {
        if (!message.trimStart().startsWith(prefix)) {
          console.log(BLOCK(`[JWForge Commit Guard] BLOCKED: Commit message must start with "${prefix}". Got: "${message.substring(0, 60)}...". Add the pipeline prefix to your commit message.`));
          return;
        }
      } else {
        // Cannot extract message during active pipeline — block to be safe
        console.log(BLOCK(`[JWForge Commit Guard] BLOCKED: Could not extract commit message to verify "${prefix}" prefix. Use -m "message" or HEREDOC format.`));
        return;
      }
    }

    // === Block dangerous git operations during pipeline ===
    for (const { pattern, reason } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        console.log(BLOCK(`[JWForge Commit Guard] BLOCKED: ${reason} during active pipeline. This could destroy pipeline work. Stop the pipeline first if needed.`));
        return;
      }
    }

    // All checks passed
    console.log(ALLOW);
  } catch (e) {
    logHookError('commit-guard', e);
    console.log(ALLOW);
  }
}

main();
