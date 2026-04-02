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
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const cwd = process.env.CLAUDE_CWD || process.cwd();
    const stateFile = join(cwd, '.jwforge', 'current', 'state.json');

    if (!existsSync(stateFile)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const state = JSON.parse(readFileSync(stateFile, 'utf8'));

    // Only persist if pipeline is actively running
    if (state.status !== 'in_progress') {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Pipeline is in progress but LLM stopped — inject continuation
    const phaseNames = {
      1: 'Deep Interview',
      2: 'Architecture',
      3: 'Execute',
      4: 'Verify'
    };
    const phaseName = phaseNames[state.phase] || `Phase ${state.phase}`;

    console.log(JSON.stringify({
      decision: 'block',
      reason: `[JWForge] Pipeline is active (${phaseName}, step ${state.step}). Work is not complete. Continue from where you left off. Read .jwforge/current/state.json for current state.`
    }));
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
