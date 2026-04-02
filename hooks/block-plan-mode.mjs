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

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; process.stdin.removeAllListeners(); resolve(Buffer.concat(chunks).toString('utf-8')); }
    }, 2000);
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); } });
    process.stdin.on('error', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(''); } });
    if (process.stdin.readableEnded) { if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); } }
  });
}

function readState(cwd) {
  const stateFile = join(cwd, '.jwforge', 'current', 'state.json');
  if (!existsSync(stateFile)) return null;
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; }
}

async function main() {
  try {
    await readStdin();

    const cwd = process.env.CLAUDE_CWD || process.cwd();
    const lockFile = join(cwd, '.jwforge', 'current', 'pipeline-required.json');
    const stateFile = join(cwd, '.jwforge', 'current', 'state.json');

    // No pipeline active — allow normal Plan Mode usage
    if (!existsSync(lockFile) && !existsSync(stateFile)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const state = readState(cwd);

    // Lock exists but no state yet (pipeline just triggered) — block
    if (!state) {
      console.log(JSON.stringify({
        decision: 'block',
        reason: '[JWForge Guard] BLOCKED: Plan Mode not allowed before pipeline initialization. Complete Phase 1 interview in conversation first.'
      }));
      return;
    }

    // Phase 2 done, about to start Phase 3 — ALLOW (show plan to user)
    // Also allow if phase2.status is "done" or "skipped" and phase is 2 or 3 with step "3-1"
    const phase2Done = state.phase2 && (state.phase2.status === 'done' || state.phase2.status === 'skipped');
    const preExecution = state.phase === 2 || (state.phase === 3 && state.step === '3-1');

    if (phase2Done && preExecution) {
      console.log(JSON.stringify({
        continue: true,
        message: '[JWForge] Plan Mode allowed — showing execution plan. Exit Plan Mode before starting execution.'
      }));
      return;
    }

    // Phase 1 — block (interview in conversation)
    if (state.phase === 1) {
      console.log(JSON.stringify({
        decision: 'block',
        reason: '[JWForge Guard] BLOCKED: Plan Mode not allowed during Phase 1 (Interview). Ask questions directly in conversation.'
      }));
      return;
    }

    // Phase 3+ active — block (keep bypass permission on)
    if (state.phase >= 3) {
      console.log(JSON.stringify({
        decision: 'block',
        reason: '[JWForge Guard] BLOCKED: Plan Mode not allowed during execution (Phase 3+). Bypass permission must stay on for uninterrupted pipeline.'
      }));
      return;
    }

    // Default: allow
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
