#!/usr/bin/env node

/**
 * JWForge Agent Background Guard (PreToolUse hook for Agent)
 *
 * Enforces CLAUDE.md Rule 7: ALL Agent() calls during active pipelines
 * MUST include run_in_background: true.
 *
 * Only active when pipeline state is in_progress.
 * Fail-open: any parse/read error results in ALLOW.
 */

import { readStdin, getCwd, readState, readLockFile, isLockStale, shouldSkipHook, ALLOW, BLOCK, logHookError } from './lib/common.mjs';

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    // Fast-path: skip all pipeline logic when no .jwforge/ directory is present
    if (shouldSkipHook(process.cwd())) { process.stdout.write(ALLOW); process.exit(0); }

    const cwd = getCwd();
    const state = readState(cwd);
    const pipelineActive = state?.status === 'in_progress';

    if (!pipelineActive) {
      // Pipeline not actively in_progress — but check if it's being initialized
      // or resumed (lock file present and not stale means /forge was triggered).
      // Without this check, agents spawned before state-recorder writes "in_progress"
      // bypass enforcement (race condition on pipeline start/resume).
      const lockData = readLockFile(cwd);
      if (!lockData || isLockStale(lockData)) {
        // No active pipeline lock — nothing to enforce
        console.log(ALLOW);
        return;
      }
      // Lock present and fresh: pipeline is initializing/resuming — enforce
    }

    const input = data.tool_input || data.input || {};

    if (input.run_in_background !== true) {
      console.log(BLOCK(
        '[JWForge Agent Guard] BLOCKED: Agent() calls during an active pipeline MUST include run_in_background: true (CLAUDE.md Rule 7).'
      ));
      return;
    }

    console.log(ALLOW);
  } catch (e) {
    logHookError('agent-bg-guard', e);
    console.log(ALLOW);
  }
}

main();
