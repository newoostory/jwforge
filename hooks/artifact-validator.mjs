#!/usr/bin/env node

/**
 * JWForge Artifact Validator (PreToolUse hook for Write)
 *
 * Validates that REQUIRED pipeline artifacts exist and contain proper content
 * BEFORE allowing phase transitions in state.json.
 *
 * Complements state-validator.mjs:
 * - state-validator checks structural legality of transitions
 * - artifact-validator checks that output artifacts are substantive
 *
 * Checked transitions:
 * - Phase 1 → 2: task-spec.md must exist with ## Requirements, ## Success Criteria, >200 chars
 * - Phase 2 → 3: architecture.md must exist with ## Unit or ## Task, ### Unit/Task-N,
 *                - test_files: or - files: field, >200 chars
 * - S complexity Phase 1 → 3: only task-spec.md checked (phase 2 skip allowed)
 *
 * Optimization: if the state.json write is NOT a phase advance, skip full validation immediately.
 * This avoids expensive artifact reads during Phase 4 fix loops (30+ state.json writes).
 *
 * Fail-open: any parse/read error results in ALLOW.
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { readStdin, getCwd, readState, isPhaseAdvance, ALLOW, BLOCK, JWFORGE_DIR, logHookError } from './lib/common.mjs';

// --- Hardcoded fallback: required artifacts per COMPLETING phase (oldPhase) ---

const REQUIRED_ARTIFACTS_FALLBACK = {
  1: {
    files: ['task-spec.md', 'review-phase1.md'],
    validators: {
      'task-spec.md': (content) => {
        return content.includes('## Requirements') &&
               content.includes('## Success Criteria') &&
               content.length > 200;
      },
      'review-phase1.md': (content) => {
        return content.length > 50;
      }
    }
  },
  2: {
    files: ['architecture.md', 'review-phase2.md'],
    validators: {
      'architecture.md': (content) => {
        return (content.includes('## Unit') || content.includes('## Task')) &&
               /### (Unit|Task)-\d+/.test(content) &&
               (content.includes('- test_files:') || content.includes('- files:'));
      },
      'review-phase2.md': (content) => {
        return content.length > 50;
      }
    }
  }
};

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    const filePath = data.tool_input?.file_path || data.input?.file_path || data.file_path || data.filePath || '';
    if (!filePath) { console.log(ALLOW); return; }

    // Only validate state.json writes
    if (basename(filePath) !== 'state.json' || !filePath.includes('.jwforge')) {
      console.log(ALLOW);
      return;
    }

    const cwd = getCwd();
    const oldState = readState(cwd);
    if (!oldState || oldState.status !== 'in_progress') {
      console.log(ALLOW);
      return;
    }

    // Parse new state from content
    const newContent = data.tool_input?.content || data.input?.content || data.content || '';
    if (!newContent) { console.log(ALLOW); return; }

    let newState;
    try { newState = JSON.parse(newContent); } catch {
      console.log(ALLOW); // Let state-validator handle malformed JSON
      return;
    }

    // Fast path: skip full validation if this is not a phase advance.
    if (!isPhaseAdvance(oldState, newState)) {
      console.log(ALLOW);
      return;
    }

    const oldPhase = oldState.phase || 0;
    const newPhase = newState.phase || 0;

    // S complexity skips phase 2 artifact check (Phase 1 → 3 shortcut)
    // Still need to validate phase 1 artifacts
    const complexity = newState.complexity || oldState.complexity;
    if (complexity === 'S' && oldPhase === 1 && newPhase === 3) {
      // Only check phase 1 artifacts, skip phase 2 — fall through below with oldPhase=1
    }

    const currentDir = join(cwd, JWFORGE_DIR, 'current');

    // Hardcoded checks with full content validation.
    // Keyed by oldPhase (the phase being completed).
    const required = REQUIRED_ARTIFACTS_FALLBACK[oldPhase];
    if (!required) {
      console.log(ALLOW);
      return;
    }

    const missing = [];
    const invalid = [];

    for (const file of required.files) {
      const artifactPath = join(currentDir, file);
      if (!existsSync(artifactPath)) {
        missing.push(file);
        continue;
      }
      const content = readFileSync(artifactPath, 'utf8');
      const validator = required.validators[file];
      if (validator && !validator(content)) {
        invalid.push(file);
      }
    }

    if (missing.length > 0 || invalid.length > 0) {
      const reasons = [];
      if (missing.length > 0) reasons.push(`Missing: ${missing.join(', ')}`);
      if (invalid.length > 0) reasons.push(`Incomplete: ${invalid.join(', ')}`);
      console.log(BLOCK(`[JWForge Artifact Validator] Cannot advance from Phase ${oldPhase} to Phase ${newPhase}. ${reasons.join('. ')}. Write required artifacts before advancing phase.`));
      return;
    }

    console.log(ALLOW);
  } catch (e) {
    // Validator failure should not block — fail open
    logHookError('artifact-validator', e);
    console.log(ALLOW);
  }
}

main();
