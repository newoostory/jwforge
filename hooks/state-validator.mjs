#!/usr/bin/env node

/**
 * JWForge State Validator (PreToolUse hook for Write)
 *
 * Validates that state.json transitions are legal:
 * 1. Phase can only advance by 1 (no skipping), except S complexity can skip Phase 2
 * 2. Phase N+1 requires Phase N's output artifact to exist
 * 3. Status can only go: in_progress → done | stopped (no reversals)
 * 4. Complexity/type cannot change after Phase 1 classification
 * 5. Phase sub-status must be "done" before advancing to next phase
 *
 * Only triggers when writing to state.json. Other files pass through.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { readStdin, getCwd, readState, ALLOW, ALLOW_MSG, BLOCK, JWFORGE_DIR, logHookError } from './lib/common.mjs';

const VALID_STEPS = {
  deep: ['1-1','1-2','1-3','1-3b','1-4','1-5','1-5b','1-6','1-6a','1-6b',
         '2-1','2-2','2-2b',
         '3-1','3-2','3-2b','3-3','3-4','3-5','3-6','3-7',
         '4-1','4-2','4-3','4-3a','4-4','4-5','4-6','4-7'],
  deeptk: ['1-1','1-2','1-2a','1-2b','1-2c','1-3','1-4','1-5','1-6','1-6a','1-6b',
           '2-1','2-2','2-3','2-4','2-5',
           '3-1','3-2','3-3','3-4','3-5',
           '4-1','4-1b','4-2','4-3','4-3a','4-3b','4-4','4-5','4-6','4-7'],
  surface: ['analyze','plan','implement','verify']
};

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    const filePath = data.file_path || data.filePath || data.input?.file_path || '';
    if (!filePath) { console.log(ALLOW); return; }

    // Only validate state.json writes — use full path for precision
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
    const newContent = data.content || data.input?.content || '';
    if (!newContent) { console.log(ALLOW); return; }

    let newState;
    try { newState = JSON.parse(newContent); } catch {
      console.log(BLOCK(`[JWForge State Validator] BLOCKED: Invalid JSON in state.json write. State file must be valid JSON.`));
      return;
    }

    const oldPhase = currentState.phase || 1;
    const newPhase = newState.phase || 1;

    // === RULE 1: No phase skipping (max +1 advance) ===
    if (newPhase > oldPhase + 1) {
      console.log(BLOCK(`[JWForge State Validator] BLOCKED: Illegal phase skip from Phase ${oldPhase} to Phase ${newPhase}. Phases must advance by 1. Complete Phase ${oldPhase} first.`));
      return;
    }

    // === RULE 2: No going backwards ===
    if (newPhase < oldPhase && currentState.status === 'in_progress') {
      console.log(BLOCK(`[JWForge State Validator] BLOCKED: Illegal phase regression from Phase ${oldPhase} to Phase ${newPhase}. Phases cannot go backwards during active pipeline.`));
      return;
    }

    // === RULE 3: Artifact prerequisite check ===
    if (newPhase > oldPhase) {
      // Phase 1 → 2: task-spec.md must exist
      if (oldPhase === 1 && newPhase === 2) {
        const taskSpec = join(stateDir, 'task-spec.md');
        if (!existsSync(taskSpec)) {
          console.log(BLOCK(`[JWForge State Validator] BLOCKED: Cannot advance to Phase 2 without task-spec.md. Complete Phase 1 (Deep Interview) first.`));
          return;
        }
      }

      // Phase 2 → 3: architecture.md must exist (unless S complexity)
      if (oldPhase === 2 && newPhase === 3) {
        const arch = join(stateDir, 'architecture.md');
        const complexity = newState.complexity || currentState.complexity;
        if (complexity !== 'S' && !existsSync(arch)) {
          console.log(BLOCK(`[JWForge State Validator] BLOCKED: Cannot advance to Phase 3 without architecture.md (complexity: ${complexity}). Complete Phase 2 (Architecture) first.`));
          return;
        }
      }

      // S complexity Phase 1 → 3 shortcut (skip Phase 2): task-spec.md must exist
      if (oldPhase === 1 && newPhase === 3) {
        const complexity = newState.complexity || currentState.complexity;
        if (complexity !== 'S') {
          console.log(BLOCK(`[JWForge State Validator] BLOCKED: Only S complexity can skip Phase 2. Current complexity: ${complexity}. Go through Phase 2 (Architecture) first.`));
          return;
        }
        const taskSpec = join(stateDir, 'task-spec.md');
        if (!existsSync(taskSpec)) {
          console.log(BLOCK(`[JWForge State Validator] BLOCKED: Cannot advance to Phase 3 without task-spec.md, even for S complexity.`));
          return;
        }
      }
    }

    // === RULE 4: Status transitions ===
    const oldStatus = currentState.status;
    const newStatus = newState.status;
    if (oldStatus && newStatus) {
      const legalTransitions = {
        'in_progress': ['done', 'stopped', 'error', 'in_progress'],
        'done': ['done'],           // done is terminal
        'stopped': ['in_progress'], // can resume from stopped
        'error': ['in_progress'],   // can retry from error
      };
      const allowed = legalTransitions[oldStatus] || [];
      if (!allowed.includes(newStatus)) {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Illegal status transition from "${oldStatus}" to "${newStatus}". Pipeline status "${oldStatus}" cannot transition to "${newStatus}".`));
        return;
      }
    }

    // === RULE 5a: deeptk does not support S complexity — block advancement beyond Phase 1 ===
    if (newPhase > 1) {
      const pipeline = newState.pipeline || currentState.pipeline;
      const complexity = newState.complexity || currentState.complexity;
      if (pipeline === 'deeptk' && complexity === 'S') {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: deeptk pipeline does not support S complexity. S tasks must use /deep instead. Cannot advance beyond Phase 1 with S complexity in deeptk.`));
        return;
      }
    }

    // === RULE 5: Complexity/type immutability after classification ===
    if (currentState.complexity && newState.complexity && currentState.complexity !== newState.complexity) {
      if (oldPhase >= 2) {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Cannot change complexity from "${currentState.complexity}" to "${newState.complexity}" after Phase 1. Complexity is locked after classification.`));
        return;
      }
    }

    // === RULE 6: Phase sub-status must be done before advancing ===
    if (newPhase > oldPhase) {
      const phaseKey = `phase${oldPhase}`;
      const phaseStatus = currentState[phaseKey]?.status;
      if (phaseStatus && phaseStatus !== 'done' && phaseStatus !== 'skipped') {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Phase ${oldPhase} status is "${phaseStatus}", not "done". Complete the current phase before advancing.`));
        return;
      }
    }

    // === RULE 7: Step whitelist validation ===
    const newStep = newState.step;
    if (newStep && typeof newStep === 'string') {
      const pipeline = newState.pipeline || currentState.pipeline;
      const allowedSteps = VALID_STEPS[pipeline];
      if (allowedSteps && !allowedSteps.includes(newStep)) {
        console.log(BLOCK(`[JWForge State Validator] BLOCKED: Unrecognized step "${newStep}" for pipeline "${pipeline}". Valid steps: ${allowedSteps.join(', ')}.`));
        return;
      }
    }

    // === RULE 8: Sub-step completion checks before phase advancement ===
    if (newPhase > oldPhase) {
      const pipeline = newState.pipeline || currentState.pipeline;

      // Phase 1 → 2 for deeptk: require researcher + reviewer completion
      if (oldPhase === 1 && newPhase === 2 && pipeline === 'deeptk') {
        if (!currentState.phase1?.researcher_validated) {
          console.log(BLOCK(`[JWForge State Validator] BLOCKED: Cannot advance to Phase 2 — researcher has not validated Phase 1 output (phase1.researcher_validated is not true).`));
          return;
        }
        if (!currentState.phase1?.reviewer_passed) {
          console.log(BLOCK(`[JWForge State Validator] BLOCKED: Cannot advance to Phase 2 — reviewer has not passed Phase 1 output (phase1.reviewer_passed is not true).`));
          return;
        }
      }

      // Phase 3 → 4: require at least one completed executor level
      if (oldPhase === 3 && newPhase === 4) {
        const completedLevels = currentState.phase3?.completed_levels;
        if (!Array.isArray(completedLevels) || completedLevels.length === 0) {
          console.log(BLOCK(`[JWForge State Validator] BLOCKED: Cannot advance to Phase 4 — no executor levels completed (phase3.completed_levels is empty).`));
          return;
        }
      }
    }

    console.log(ALLOW);
  } catch (e) {
    // Validator failure should not block — fail open
    logHookError('state-validator', e);
    console.log(ALLOW);
  }
}

main();
