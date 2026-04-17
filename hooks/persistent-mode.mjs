#!/usr/bin/env node

/**
 * JWForge Persistent Mode Hook (Stop event)
 *
 * When the LLM stops during an active pipeline, this hook checks if work
 * is actually complete. If not, it injects a continuation message to keep
 * the pipeline running.
 *
 * Inspired by OMC's persistent-mode.cjs (ralph's "the boulder never stops")
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readStdin, getCwd, shouldSkipHook, ALLOW, BLOCK, logHookError } from './lib/common.mjs';

function isContextLimitStop(data) {
  const reasons = [data.stop_reason, data.stopReason, data.reason]
    .filter(v => typeof v === 'string')
    .map(v => v.toLowerCase().replace(/[\s-]+/g, '_'));
  const patterns = ['context_limit', 'context_window', 'max_tokens', 'token_limit'];
  return reasons.some(r => patterns.some(p => r.includes(p)));
}

function isUserAbort(data) {
  if (data.user_requested || data.userRequested) return true;
  const reason = (data.stop_reason || data.stopReason || '').toLowerCase();
  return ['aborted', 'abort', 'cancel', 'interrupt'].includes(reason);
}

async function main() {
  try {
    const raw = await readStdin();
    let data = {};
    try { data = JSON.parse(raw); } catch { /* empty */ }

    // Fast-path: skip all pipeline logic when no .jwforge/ directory is present
    if (shouldSkipHook(process.cwd())) { process.exit(0); }

    // Never block context limit or user abort stops
    if (isContextLimitStop(data) || isUserAbort(data)) {
      console.log(ALLOW);
      return;
    }

    const cwd = getCwd();
    const stateFile = join(cwd, '.jwforge', 'current', 'state.json');

    if (!existsSync(stateFile)) {
      console.log(ALLOW);
      return;
    }

    const state = JSON.parse(readFileSync(stateFile, 'utf8'));

    // Only persist if pipeline is actively running
    if (state.status !== 'in_progress') {
      console.log(ALLOW);
      return;
    }

    // If the pipeline is explicitly waiting for user input (e.g. interview answers),
    // allow session to end cleanly. The waiting_for_user flag is set by the pipeline
    // skill before presenting questions and cleared after receiving answers.
    if (state.waiting_for_user === true) {
      console.log(ALLOW);
      return;
    }

    // Pipeline is in progress but LLM stopped — inject continuation
    const phaseNames = {
      1: 'Discover',
      2: 'Design',
      3: 'Build',
      4: 'Validate'
    };
    const phaseName = phaseNames[state.phase] || `Phase ${state.phase}`;

    console.log(BLOCK(`[JWForge] Pipeline is active (${phaseName}, step ${state.step}). Work is not complete. Continue from where you left off. Read .jwforge/current/state.json for current state.`));
  } catch (e) {
    logHookError('persistent-mode', e);
    console.log(ALLOW);
  }
}

main();
