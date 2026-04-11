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
import { readStdin, getCwd, ALLOW, BLOCK } from './lib/common.mjs';

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

    // Pipeline is in progress but LLM stopped — inject continuation
    const phaseNames = state.pipeline === 'deeptk' ? {
      1: 'Discover',
      2: 'Design',
      3: 'Build',
      4: 'Validate'
    } : {
      1: 'Deep Interview',
      2: 'Architecture',
      3: 'Execute',
      4: 'Verify'
    };
    const phaseName = phaseNames[state.phase] || `Phase ${state.phase}`;

    if (state.step === '1-3') {
      console.log(BLOCK(`[JWForge] Waiting for user interview answers (step 1-3). Read .jwforge/current/interview-log.md — find the most recent Round's questions and re-display them exactly. Do NOT generate new questions. Just wait for user to answer.`));
    } else {
      console.log(BLOCK(`[JWForge] Pipeline is active (${phaseName}, step ${state.step}). Work is not complete. Continue from where you left off. Read .jwforge/current/state.json for current state.`));
    }
  } catch {
    console.log(ALLOW);
  }
}

main();
