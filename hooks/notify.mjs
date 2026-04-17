#!/usr/bin/env node

/**
 * JWForge Desktop Notification Hook (PostToolUse Write + Stop)
 *
 * Fires OS desktop notifications on pipeline state transitions:
 * 1. Phase transition (1→2, 2→3, 3→4)
 * 2. User input waiting (phase 1 interview steps, question-containing steps)
 * 3. Pipeline complete (status: "done")
 * 4. Pipeline failure (status: "error" or "stopped")
 *
 * Always returns { continue: true } — notifications are non-blocking.
 * All errors are caught silently to never slow down the pipeline.
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { readStdin, getCwd, shouldSkipHook } from './lib/common.mjs';

function sendNotification(title, body) {
  try {
    if (process.platform === 'darwin') {
      const script = `display notification "${body.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" with title "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      execFileSync('osascript', ['-e', script], { timeout: 3000 });
    } else {
      execFileSync('notify-send', [title, body], { timeout: 3000 });
    }
  } catch {
    // Fire-and-forget — silently ignore errors
  }
}

const PHASE_NAMES = {
  1: 'Discover',
  2: 'Design',
  3: 'Build',
  4: 'Validate'
};

function getPhaseName(phase) {
  return PHASE_NAMES[phase] || `Phase ${phase}`;
}

const CACHE_FILE_NAME = '.notify-cache.json';

function readCachedState(cwd) {
  try {
    const cachePath = join(cwd, '.jwforge', 'current', CACHE_FILE_NAME);
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf8'));
    }
  } catch { /* ignore */ }
  return null;
}

function writeCachedState(cwd, state) {
  try {
    const cacheDir = join(cwd, '.jwforge', 'current');
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, CACHE_FILE_NAME), JSON.stringify({ phase: state.phase, step: state.step, status: state.status }));
  } catch { /* ignore */ }
}

function detectNotification(oldState, newState) {
  const step = (newState.step || '').toLowerCase();
  const status = newState.status;
  const phase = newState.phase;

  // Pipeline complete
  if (status === 'done') {
    return { title: 'JWForge: Pipeline Complete', body: 'Task finished successfully.' };
  }

  // Pipeline failure
  if (status === 'error' || status === 'stopped') {
    const reason = status === 'stopped' ? 'Pipeline stopped.' : 'Pipeline encountered an error.';
    return { title: `JWForge: Pipeline ${status === 'error' ? 'Error' : 'Stopped'}`, body: reason };
  }

  // Phase transition: detected by comparing old phase to new phase
  const oldPhase = oldState ? oldState.phase : null;
  if (typeof phase === 'number' && typeof oldPhase === 'number' && phase !== oldPhase) {
    const phaseName = getPhaseName(phase);
    return { title: `JWForge: Phase ${phase}`, body: `Now in ${phaseName}.` };
  }

  // User input waiting: step explicitly signals a question or interview interaction
  if (step.includes('question') || step.includes('interview') || step.includes('waiting')) {
    const phaseName = getPhaseName(newState.phase);
    return { title: 'JWForge: Input Needed', body: `${phaseName} — awaiting your response.` };
  }

  // Phase 1 just started for the first time (no prior state)
  if (phase === 1 && oldState === null) {
    const phase1Name = getPhaseName(1);
    return { title: `JWForge: ${phase1Name}`, body: 'Phase 1 started — your input is needed.' };
  }

  return null;
}

async function handleStop(data) {
  const cwd = getCwd();
  const stateFile = join(cwd, '.jwforge', 'current', 'state.json');

  if (!existsSync(stateFile)) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    if (state.status === 'done') {
      sendNotification('JWForge: Pipeline Complete', 'Session ended. Task finished successfully.');
    } else if (state.status === 'in_progress') {
      sendNotification('JWForge: Session Ended', `Pipeline stopped mid-execution (Phase ${state.phase}).`);
    }
  } catch { /* ignore */ }

  console.log(JSON.stringify({ continue: true }));
}

async function handlePostToolUse(data) {
  // Accept both Write and Edit tool calls on state.json
  const toolName = data?.tool_name || '';
  const filePath = data?.tool_input?.file_path || data?.tool_input?.path || '';

  if ((toolName !== 'Write' && toolName !== 'Edit') || !filePath.endsWith('state.json') || !filePath.includes('.jwforge')) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const cwd = getCwd();

  // Validate filePath is within the expected .jwforge directory
  const resolvedPath = resolve(filePath);
  const expectedBase = resolve(join(cwd, '.jwforge'));
  if (!resolvedPath.startsWith(expectedBase + '/')) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Read old state from cache (written on previous invocation)
  const oldState = readCachedState(cwd);

  // Read the current (post-write) state from the file
  let state;
  try {
    if (!existsSync(filePath)) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }
    state = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Cache current state for next comparison
  writeCachedState(cwd, state);

  const notification = detectNotification(oldState, state);
  if (notification) {
    sendNotification(notification.title, notification.body);
  }

  console.log(JSON.stringify({ continue: true }));
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    let data;
    try { data = JSON.parse(raw); } catch {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Fast-path: skip all pipeline logic when no .jwforge/ directory is present
    if (shouldSkipHook(process.cwd())) { process.exit(0); }

    // Distinguish Stop vs PostToolUse by hook_type or presence of tool_name
    const hookType = data?.hook_event_name || data?.hook_type || '';

    if (hookType === 'Stop' || (!data.tool_name && !data.tool_input)) {
      await handleStop(data);
    } else {
      await handlePostToolUse(data);
    }
  } catch {
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
