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

import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

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

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    const filePath = data.file_path || data.filePath || data.input?.file_path || '';
    if (!filePath) { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    // Only validate state.json writes
    if (basename(filePath) !== 'state.json' || !filePath.includes('.jwforge')) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const cwd = process.env.CLAUDE_CWD || process.cwd();
    const stateDir = join(cwd, '.jwforge', 'current');
    const currentStateFile = join(stateDir, 'state.json');

    // If state.json doesn't exist yet, this is initial creation — allow
    if (!existsSync(currentStateFile)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Read current state
    let currentState;
    try { currentState = JSON.parse(readFileSync(currentStateFile, 'utf8')); } catch {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Parse the new content being written
    const newContent = data.content || data.input?.content || '';
    if (!newContent) { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    let newState;
    try { newState = JSON.parse(newContent); } catch {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `[JWForge State Validator] BLOCKED: Invalid JSON in state.json write. State file must be valid JSON.`
      }));
      return;
    }

    const oldPhase = currentState.phase || 1;
    const newPhase = newState.phase || 1;

    // === RULE 1: No phase skipping (max +1 advance) ===
    if (newPhase > oldPhase + 1) {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `[JWForge State Validator] BLOCKED: Illegal phase skip from Phase ${oldPhase} to Phase ${newPhase}. Phases must advance by 1. Complete Phase ${oldPhase} first.`
      }));
      return;
    }

    // === RULE 2: No going backwards ===
    if (newPhase < oldPhase && currentState.status === 'in_progress') {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `[JWForge State Validator] BLOCKED: Illegal phase regression from Phase ${oldPhase} to Phase ${newPhase}. Phases cannot go backwards during active pipeline.`
      }));
      return;
    }

    // === RULE 3: Artifact prerequisite check ===
    if (newPhase > oldPhase) {
      // Phase 1 → 2: task-spec.md must exist
      if (oldPhase === 1 && newPhase === 2) {
        const taskSpec = join(stateDir, 'task-spec.md');
        if (!existsSync(taskSpec)) {
          console.log(JSON.stringify({
            decision: 'block',
            reason: `[JWForge State Validator] BLOCKED: Cannot advance to Phase 2 without task-spec.md. Complete Phase 1 (Deep Interview) first.`
          }));
          return;
        }
      }

      // Phase 2 → 3: architecture.md must exist (unless S complexity)
      if (oldPhase === 2 && newPhase === 3) {
        const arch = join(stateDir, 'architecture.md');
        const complexity = newState.complexity || currentState.complexity;
        if (complexity !== 'S' && !existsSync(arch)) {
          console.log(JSON.stringify({
            decision: 'block',
            reason: `[JWForge State Validator] BLOCKED: Cannot advance to Phase 3 without architecture.md (complexity: ${complexity}). Complete Phase 2 (Architecture) first.`
          }));
          return;
        }
      }

      // S complexity Phase 1 → 3 shortcut (skip Phase 2): task-spec.md must exist
      if (oldPhase === 1 && newPhase === 3) {
        const complexity = newState.complexity || currentState.complexity;
        if (complexity !== 'S') {
          console.log(JSON.stringify({
            decision: 'block',
            reason: `[JWForge State Validator] BLOCKED: Only S complexity can skip Phase 2. Current complexity: ${complexity}. Go through Phase 2 (Architecture) first.`
          }));
          return;
        }
        const taskSpec = join(stateDir, 'task-spec.md');
        if (!existsSync(taskSpec)) {
          console.log(JSON.stringify({
            decision: 'block',
            reason: `[JWForge State Validator] BLOCKED: Cannot advance to Phase 3 without task-spec.md, even for S complexity.`
          }));
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
        console.log(JSON.stringify({
          decision: 'block',
          reason: `[JWForge State Validator] BLOCKED: Illegal status transition from "${oldStatus}" to "${newStatus}". Pipeline status "${oldStatus}" cannot transition to "${newStatus}".`
        }));
        return;
      }
    }

    // === RULE 5a: deeptk does not support S complexity — block advancement beyond Phase 1 ===
    if (newPhase > 1) {
      const pipeline = newState.pipeline || currentState.pipeline;
      const complexity = newState.complexity || currentState.complexity;
      if (pipeline === 'deeptk' && complexity === 'S') {
        console.log(JSON.stringify({
          decision: 'block',
          reason: `[JWForge State Validator] BLOCKED: deeptk pipeline does not support S complexity. S tasks must use /deep instead. Cannot advance beyond Phase 1 with S complexity in deeptk.`
        }));
        return;
      }
    }

    // === RULE 5: Complexity/type immutability after classification ===
    if (currentState.complexity && newState.complexity && currentState.complexity !== newState.complexity) {
      if (oldPhase >= 2) {
        console.log(JSON.stringify({
          decision: 'block',
          reason: `[JWForge State Validator] BLOCKED: Cannot change complexity from "${currentState.complexity}" to "${newState.complexity}" after Phase 1. Complexity is locked after classification.`
        }));
        return;
      }
    }

    // === RULE 6: Phase sub-status must be done before advancing ===
    if (newPhase > oldPhase) {
      const phaseKey = `phase${oldPhase}`;
      const phaseStatus = currentState[phaseKey]?.status;
      if (phaseStatus && phaseStatus !== 'done' && phaseStatus !== 'skipped') {
        console.log(JSON.stringify({
          decision: 'block',
          reason: `[JWForge State Validator] BLOCKED: Phase ${oldPhase} status is "${phaseStatus}", not "done". Complete the current phase before advancing.`
        }));
        return;
      }
    }

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch {
    // Validator failure should not block — fail open
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
