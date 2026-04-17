#!/usr/bin/env node

/**
 * JWForge State Validator (PreToolUse hook for Write)
 *
 * Validates state.json transitions are legal:
 * (a) No phase skipping (max +1 advance)
 * (b) No phase regression
 * (c) Artifact prerequisites (Phase 1→2 requires task-spec.md, Phase 2→3 requires architecture.md unless S complexity)
 * (d) Legal status transitions (in_progress → done/stopped/in_progress, stopped → in_progress, done is terminal)
 * (e) Complexity immutability after Phase 1
 * (f) Phase sub-status must be "done" before advancing
 * (g) Step whitelist validation against pipeline.json config
 *
 * Only triggers when writing to state.json. Other files pass through.
 * Import from './lib/common.mjs'.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  readStdin,
  getCwd,
  readState,
  shouldSkipHook,
  ALLOW,
  BLOCK,
  JWFORGE_DIR,
  logHookError,
} from './lib/common.mjs';

// --- Step Whitelist ---

const HARDCODED_VALID_STEPS = [
  '1-1', '1-2', '1-3',
  '2-1', '2-2', '2-3',
  '3-0', '3-N',
  '4-1', '4-2', '4-3', '4-4',
];

function loadValidSteps(cwd) {
  try {
    const configPath = join(cwd, 'config', 'pipeline.json');
    if (!existsSync(configPath)) return HARDCODED_VALID_STEPS;
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (Array.isArray(config?.valid_steps) && config.valid_steps.length > 0) {
      return config.valid_steps;
    }
    return HARDCODED_VALID_STEPS;
  } catch {
    return HARDCODED_VALID_STEPS;
  }
}

// --- Legal Status Transitions ---

const LEGAL_STATUS_TRANSITIONS = {
  'in_progress': ['done', 'stopped', 'in_progress'],
  'stopped': ['in_progress'],
  'done': [],          // terminal — no transitions out
};

// --- Main ---

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    // Fast-path: skip all pipeline logic when no .jwforge/ directory is present
    if (shouldSkipHook(process.cwd())) { process.stdout.write(ALLOW); process.exit(0); }

    // Extract file_path from Write tool event
    const filePath = data.tool_input?.file_path || data.input?.file_path || '';
    if (!filePath) { console.log(ALLOW); return; }

    // Only validate state.json writes
    const normalized = filePath.replace(/\\/g, '/');
    if (!normalized.endsWith('state.json') || !normalized.includes('.jwforge/current/')) {
      console.log(ALLOW);
      return;
    }

    const cwd = getCwd();
    const stateDir = join(cwd, JWFORGE_DIR, 'current');

    // If state.json doesn't exist yet, this is initial creation — allow
    const currentState = readState(cwd);
    if (!currentState) {
      console.log(ALLOW);
      return;
    }

    // Parse the new content being written
    const newContent = data.tool_input?.content || data.input?.content || data.content || '';
    if (!newContent) { console.log(ALLOW); return; }

    let newState;
    try { newState = JSON.parse(newContent); } catch {
      console.log(BLOCK('[JWForge State Validator] BLOCKED: Invalid JSON in state.json write. State file must be valid JSON.'));
      return;
    }

    // === RULE (0): Only state-recorder may write state.json during an active pipeline ===
    // state-recorder always includes _recorder: true in writes.
    // Writes lacking this marker are blocked to prevent Conductor from writing state directly.
    if (currentState.status === 'in_progress' && newState._recorder !== true) {
      console.log(BLOCK(
        '[JWForge State Validator] BLOCKED: state.json must only be written by the state-recorder agent. ' +
        'The Conductor MUST spawn state-recorder (haiku) with the diff payload instead of writing state.json directly. ' +
        'Rule: ALL state mutations go through state-recorder.'
      ));
      return;
    }

    const oldPhase = typeof currentState.phase === 'number' ? currentState.phase : 1;
    const newPhase = typeof newState.phase === 'number' ? newState.phase : 1;

    // === RULE (a): No phase skipping (max +1 advance) ===
    // Exception: S complexity can skip Phase 2 (1 → 3)
    if (newPhase > oldPhase + 1) {
      const complexity = newState.complexity || currentState.complexity;
      const isSkip = (complexity === 'S' && oldPhase === 1 && newPhase === 3);
      if (!isSkip) {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Illegal phase skip from Phase ${oldPhase} to Phase ${newPhase}. Phases must advance by at most 1. Complete Phase ${oldPhase} first.`));
        return;
      }
    }

    // === RULE (b): No phase regression ===
    if (newPhase < oldPhase && currentState.status === 'in_progress') {
      console.log(BLOCK(`[JWForge State Validator] BLOCKED: Illegal phase regression from Phase ${oldPhase} to Phase ${newPhase}. Phases cannot go backwards during active pipeline.`));
      return;
    }

    // === RULE (c): Artifact prerequisites on phase advance ===
    if (newPhase > oldPhase) {
      // Phase 1 → 2: task-spec.md must exist
      if (oldPhase === 1 && newPhase === 2) {
        const taskSpec = join(stateDir, 'task-spec.md');
        if (!existsSync(taskSpec)) {
          console.log(BLOCK('[JWForge State Validator] BLOCKED: Cannot advance to Phase 2 without task-spec.md. Complete Phase 1 (Discover) first.'));
          return;
        }
      }

      // Phase 2 → 3: architecture.md must exist (unless S complexity)
      if (oldPhase === 2 && newPhase === 3) {
        const complexity = newState.complexity || currentState.complexity;
        if (complexity !== 'S') {
          const arch = join(stateDir, 'architecture.md');
          if (!existsSync(arch)) {
            console.log(BLOCK(`[JWForge State Validator] BLOCKED: Cannot advance to Phase 3 without architecture.md (complexity: ${complexity}). Complete Phase 2 (Design) first.`));
            return;
          }
        }
      }

      // S complexity Phase 1 → 3 shortcut: task-spec.md must still exist
      if (oldPhase === 1 && newPhase === 3) {
        const complexity = newState.complexity || currentState.complexity;
        if (complexity !== 'S') {
          console.log(BLOCK(`[JWForge State Validator] BLOCKED: Only S complexity can skip Phase 2. Current complexity: ${complexity}. Go through Phase 2 (Design) first.`));
          return;
        }
        const taskSpec = join(stateDir, 'task-spec.md');
        if (!existsSync(taskSpec)) {
          console.log(BLOCK('[JWForge State Validator] BLOCKED: Cannot advance to Phase 3 without task-spec.md, even for S complexity.'));
          return;
        }
      }

      // Phase 3 → 4: architecture.md must exist (it was required to enter Phase 3 for non-S)
      if (oldPhase === 3 && newPhase === 4) {
        const taskSpec = join(stateDir, 'task-spec.md');
        if (!existsSync(taskSpec)) {
          console.log(BLOCK('[JWForge State Validator] BLOCKED: Cannot advance to Phase 4 without task-spec.md.'));
          return;
        }
      }
    }

    // === RULE (d): Legal status transitions ===
    const oldStatus = currentState.status;
    const newStatus = newState.status;
    if (oldStatus && newStatus) {
      const allowed = LEGAL_STATUS_TRANSITIONS[oldStatus];
      if (allowed && !allowed.includes(newStatus)) {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Illegal status transition from "${oldStatus}" to "${newStatus}". Pipeline status "${oldStatus}" cannot transition to "${newStatus}".`));
        return;
      }
      // Block transition OUT of "done" — it's terminal
      if (oldStatus === 'done' && newStatus !== 'done') {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Pipeline status "done" is terminal. Cannot transition to "${newStatus}". Start a new pipeline instead.`));
        return;
      }
    }

    // === RULE (e): Complexity immutability after Phase 1 ===
    if (currentState.complexity && newState.complexity && currentState.complexity !== newState.complexity) {
      if (oldPhase >= 2) {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Cannot change complexity from "${currentState.complexity}" to "${newState.complexity}" after Phase 1. Complexity is locked after classification.`));
        return;
      }
    }

    // === RULE (f): Phase sub-status must be "done" before advancing ===
    if (newPhase > oldPhase) {
      const phaseStatus = newState[`phase${oldPhase}`]?.status ?? currentState[`phase${oldPhase}`]?.status;
      if (phaseStatus && phaseStatus !== 'done' && phaseStatus !== 'skipped') {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Phase ${oldPhase} status is "${phaseStatus}", not "done". Complete the current phase before advancing.`));
        return;
      }
    }

    // === RULE (g): Step whitelist validation ===
    const newStep = newState.step;
    if (newStep && typeof newStep === 'string') {
      const validSteps = loadValidSteps(cwd);
      if (!validSteps.includes(newStep)) {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Unrecognized step "${newStep}" for forge pipeline. Valid steps: ${validSteps.join(', ')}.`));
        return;
      }
    }

    // === RULE (h): User gate enforcement for phase 2->3 and 3->4 ===
    // The Conductor must set waiting_for_user=true via state-recorder BEFORE advancing phase.
    // This proves the user gate was shown. We check currentState (disk), not newState.
    if (newPhase > oldPhase) {
      if ((oldPhase === 2 && newPhase === 3) || (oldPhase === 3 && newPhase === 4)) {
        const complexity = newState.complexity || currentState.complexity;
        if (complexity !== 'S') {
          if (currentState.waiting_for_user !== true) {
            console.log(BLOCK(
              `[JWForge State Validator] BLOCKED: Cannot advance from Phase ${oldPhase} to Phase ${newPhase} without completing user gate. ` +
              `Set waiting_for_user = true via state-recorder before this transition.`
            ));
            return;
          }
        }
      }
    }

    // All checks passed
    console.log(ALLOW);
  } catch (e) {
    // Validator failure should not block — fail open
    logHookError('state-validator', e);
    console.log(ALLOW);
  }
}

main();
