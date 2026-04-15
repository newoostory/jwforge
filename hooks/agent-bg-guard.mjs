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

import { readStdin, getCwd, readState, ALLOW, BLOCK, logHookError } from './lib/common.mjs';

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    const cwd = getCwd();
    const state = readState(cwd);

    // Only enforce during active pipeline
    if (!state || state.status !== 'in_progress') {
      console.log(ALLOW);
      return;
    }

    const input = data.input || {};

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
