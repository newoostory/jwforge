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
 * - Phase 2 → 3: architecture.md must exist with ## Task, ### Task-N, level/type/files metadata
 * - S complexity Phase 1 → 3: only task-spec.md checked (phase 2 skip allowed)
 *
 * Fail-open: any parse/read error results in ALLOW.
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { readStdin, getCwd, readState, ALLOW, BLOCK, JWFORGE_DIR, SURFACE_PHASE_MAP } from './lib/common.mjs';

// --- Required artifacts per phase ---

const REQUIRED_ARTIFACTS = {
  1: {
    files: ['task-spec.md'],
    validators: {
      'task-spec.md': (content) => {
        return content.includes('## Requirements') &&
               content.includes('## Success Criteria') &&
               content.length > 200;
      }
    }
  },
  2: {
    files: ['architecture.md'],
    validators: {
      'architecture.md': (content) => {
        return content.includes('## Task') &&
               /### Task-\d+/.test(content) &&
               content.includes('- level:') &&
               content.includes('- type:') &&
               content.includes('- files:');
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

    const filePath = data.file_path || data.filePath || data.input?.file_path || '';
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
    const newContent = data.content || data.input?.content || '';
    if (!newContent) { console.log(ALLOW); return; }

    let newState;
    try { newState = JSON.parse(newContent); } catch {
      console.log(ALLOW); // Let state-validator handle malformed JSON
      return;
    }

    // Resolve phases — support surface pipeline step-based state
    let oldPhase = oldState.phase || 0;
    let newPhase = newState.phase || 0;

    if (oldState.pipeline === 'surface' || newState.pipeline === 'surface') {
      if (oldState.step && !oldState.phase) oldPhase = SURFACE_PHASE_MAP[oldState.step] || 0;
      if (newState.step && !newState.phase) newPhase = SURFACE_PHASE_MAP[newState.step] || 0;
    }

    // Only validate when advancing phase
    if (newPhase <= oldPhase) {
      console.log(ALLOW);
      return;
    }

    // S complexity skips phase 2 artifact check (Phase 1 → 3 shortcut)
    // Still need to validate phase 1 artifacts
    const complexity = newState.complexity || oldState.complexity;
    if (complexity === 'S' && oldPhase === 1 && newPhase === 3) {
      // Only check phase 1 artifacts, skip phase 2 — fall through below
    }

    // Check required artifacts for the phase being completed
    const required = REQUIRED_ARTIFACTS[oldPhase];
    if (!required) {
      console.log(ALLOW);
      return;
    }

    const currentDir = join(cwd, JWFORGE_DIR, 'current');
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
  } catch {
    // Validator failure should not block — fail open
    console.log(ALLOW);
  }
}

main();
