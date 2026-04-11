#!/usr/bin/env node

/**
 * JWForge Plan Mode Guard (PreToolUse hook for EnterPlanMode)
 *
 * Controls when Plan Mode is allowed during JWForge pipelines:
 * - Phase 1 (Interview): BLOCK — questions happen in conversation
 * - Phase 2 done → Phase 3 start: ALLOW — show the plan to user
 * - Phase 3+ (Execution): BLOCK — bypass permission must stay on
 * - No pipeline active: ALLOW (normal usage)
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { readStdin, readState, getCwd, JWFORGE_DIR, ALLOW, BLOCK, ALLOW_MSG, logHookError } from './lib/common.mjs';

async function main() {
  try {
    await readStdin();

    const cwd = getCwd();
    const lockFile = join(cwd, JWFORGE_DIR, 'current', 'pipeline-required.json');
    const stateFile = join(cwd, JWFORGE_DIR, 'current', 'state.json');

    // No pipeline active — allow normal Plan Mode usage
    if (!existsSync(lockFile) && !existsSync(stateFile)) {
      console.log(ALLOW);
      return;
    }

    const state = readState(cwd);

    // Lock exists but no state yet (pipeline just triggered) — block
    if (!state) {
      console.log(BLOCK('[JWForge Guard] BLOCKED: Plan Mode not allowed before pipeline initialization. Complete Phase 1 interview in conversation first.'));
      return;
    }

    // Phase 2 done, about to start Phase 3 — ALLOW (show plan to user)
    // Also allow if phase2.status is "done" or "skipped" and phase is 2 or 3 with step "3-1"
    const phase2Done = state.phase2 && (state.phase2.status === 'done' || state.phase2.status === 'skipped');
    const preExecution = state.phase === 2 || (state.phase === 3 && state.step === '3-1');

    if (phase2Done && preExecution) {
      console.log(ALLOW_MSG('[JWForge] Plan Mode allowed — showing execution plan. Exit Plan Mode before starting execution.'));
      return;
    }

    // Phase 1 — block (interview in conversation)
    if (state.phase === 1) {
      console.log(BLOCK('[JWForge Guard] BLOCKED: Plan Mode not allowed during Phase 1 (Interview). Ask questions directly in conversation.'));
      return;
    }

    // Phase 3+ active — block (keep bypass permission on)
    if (state.phase >= 3) {
      console.log(BLOCK('[JWForge Guard] BLOCKED: Plan Mode not allowed during execution (Phase 3+). Bypass permission must stay on for uninterrupted pipeline.'));
      return;
    }

    // Default: allow
    console.log(ALLOW);
  } catch (e) {
    logHookError('block-plan-mode', e);
    console.log(ALLOW);
  }
}

main();
