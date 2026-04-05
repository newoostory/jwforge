#!/usr/bin/env node

/**
 * JWForge Git Commit Guard (PreToolUse hook for Bash)
 *
 * Enforces git commit conventions during active pipelines:
 * 1. /deep pipeline commits MUST use [jwforge] prefix
 * 2. /surface pipeline commits MUST use [jwforge-surface] prefix
 * 3. Blocks dangerous git operations (force push, reset --hard, etc.) during pipeline
 * 4. Blocks git commit --amend during pipeline (prevents losing previous commits)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readStdin, readState, getCwd, checkPipelineLock, ALLOW, BLOCK, ALLOW_MSG } from './lib/common.mjs';

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    const command = data.command || data.input?.command || '';
    if (!command) { console.log(ALLOW); return; }

    // Only check git commands
    if (!/\bgit\b/.test(command)) {
      console.log(ALLOW);
      return;
    }

    const cwd = getCwd();

    // === Pipeline lock check ===
    const lockData = checkPipelineLock(cwd);
    if (lockData !== null) {
      if (/\bgit\s+commit\b/.test(command)) {
        console.log(BLOCK(`[JWForge Git Guard] BLOCKED: Pipeline /${lockData.pipeline || 'deep'} was triggered but state.json not initialized. No commits allowed until pipeline protocol is followed.`));
        return;
      }
    }

    const state = readState(cwd);

    // No active pipeline and no lock — allow all git commands
    if (!state || state.status !== 'in_progress') {
      console.log(ALLOW);
      return;
    }

    const prefix = state.pipeline === 'surface' ? '[jwforge-surface]' : state.pipeline === 'deeptk' ? '[jwforge-deeptk]' : '[jwforge]';

    // === Check for git commit ===
    if (/\bgit\s+commit\b/.test(command)) {
      // Block commits during Phase 1-2 (no code should exist to commit)
      if (state.phase <= 2 && state.complexity !== 'S') {
        console.log(BLOCK(`[JWForge Git Guard] BLOCKED: git commit during Phase ${state.phase}. No commits allowed before design is complete.`));
        return;
      }

      // Block --amend during pipeline
      if (/--amend/.test(command)) {
        console.log(BLOCK(`[JWForge Git Guard] BLOCKED: git commit --amend during active pipeline. Create new commits instead to preserve history.`));
        return;
      }

      // Enforce commit prefix
      // Extract -m message
      const msgMatch = command.match(/-m\s+["']([^"']*?)["']/);
      const heredocMatch = command.match(/<<\s*['"]?EOF['"]?\s*\n?([\s\S]*?)\nEOF/);
      const message = msgMatch?.[1] || heredocMatch?.[1] || '';

      if (message && !message.includes(prefix)) {
        console.log(BLOCK(`[JWForge Git Guard] BLOCKED: Commit message must start with "${prefix}". Got: "${message.substring(0, 60)}...". Add the pipeline prefix to your commit message.`));
        return;
      }

      // If we can't extract the message (complex command), warn but allow
      if (!message) {
        console.log(ALLOW_MSG(`[JWForge] Reminder: commit messages during this pipeline must use "${prefix}" prefix.`));
        return;
      }
    }

    // === Block dangerous git operations during pipeline ===
    const dangerousPatterns = [
      { pattern: /\bgit\s+push\s+.*--force\b/, reason: 'force push' },
      { pattern: /\bgit\s+push\s+-f\b/, reason: 'force push' },
      { pattern: /\bgit\s+reset\s+--hard\b/, reason: 'hard reset' },
      { pattern: /\bgit\s+checkout\s+\.\s*$/, reason: 'discard all changes' },
      { pattern: /\bgit\s+clean\s+-f/, reason: 'force clean' },
      { pattern: /\bgit\s+stash\s+drop\b/, reason: 'stash drop' },
      { pattern: /\bgit\s+branch\s+-D\b/, reason: 'force delete branch' },
    ];

    for (const { pattern, reason } of dangerousPatterns) {
      if (pattern.test(command)) {
        console.log(BLOCK(`[JWForge Git Guard] BLOCKED: ${reason} during active pipeline. This could destroy pipeline work. Stop the pipeline first with /cancel if needed.`));
        return;
      }
    }

    console.log(ALLOW);
  } catch {
    console.log(ALLOW);
  }
}

main();
