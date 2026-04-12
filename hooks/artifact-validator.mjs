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
 * Optimization: if the state.json write is NOT a phase advance, skip full validation immediately.
 * This avoids expensive artifact reads during Phase 4 fix loops (30+ state.json writes).
 *
 * Config-driven artifacts: if /home/newoostory/jwforge/config/phase-config.json exists,
 * required_artifacts for the TARGET phase is used (file existence only, no content validators).
 * If config is missing, falls back to hardcoded checks with full content validation.
 *
 * Fail-open: any parse/read error results in ALLOW.
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { readStdin, getCwd, readState, isPhaseAdvance, ALLOW, BLOCK, JWFORGE_DIR, SURFACE_PHASE_MAP, logHookError } from './lib/common.mjs';

// --- Hardcoded fallback: required artifacts per COMPLETING phase (oldPhase) ---
// Used when phase-config.json is not available.

const REQUIRED_ARTIFACTS_FALLBACK = {
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

// --- Load phase-config.json (cached per process) ---

const PHASE_CONFIG_PATH = '/home/newoostory/jwforge/config/phase-config.json';
let phaseConfig = null;
let phaseConfigLoaded = false;

function loadPhaseConfig() {
  if (phaseConfigLoaded) return phaseConfig;
  phaseConfigLoaded = true;
  try {
    if (existsSync(PHASE_CONFIG_PATH)) {
      phaseConfig = JSON.parse(readFileSync(PHASE_CONFIG_PATH, 'utf8'));
    }
  } catch {
    phaseConfig = null;
  }
  return phaseConfig;
}

/**
 * Look up required_artifacts from phase-config for the target (new) phase.
 * Returns an array of filenames, or null if config/pipeline/phase not found.
 *
 * Note: config has no content validators — only file existence is checked.
 */
function getConfigArtifacts(pipeline, newPhase) {
  const config = loadPhaseConfig();
  if (!config) return null;
  const pipelineConfig = config.pipelines?.[pipeline];
  if (!pipelineConfig) return null;
  const phaseEntry = pipelineConfig.phases?.find(p => p.phase === newPhase);
  if (!phaseEntry) return null;
  return Array.isArray(phaseEntry.required_artifacts) ? phaseEntry.required_artifacts : null;
}

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

    // Fast path: skip full validation if this is not a phase advance.
    // isPhaseAdvance checks .phase directly; surface pipelines use step-based state
    // but have required_artifacts: [] in config anyway, so they also pass through correctly.
    if (!isPhaseAdvance(oldState, newState)) {
      console.log(ALLOW);
      return;
    }

    // Resolve phases — support surface pipeline step-based state
    let oldPhase = oldState.phase || 0;
    let newPhase = newState.phase || 0;

    if (oldState.pipeline === 'surface' || newState.pipeline === 'surface') {
      if (oldState.step && !oldState.phase) oldPhase = SURFACE_PHASE_MAP[oldState.step] || 0;
      if (newState.step && !newState.phase) newPhase = SURFACE_PHASE_MAP[newState.step] || 0;
    }

    // S complexity skips phase 2 artifact check (Phase 1 → 3 shortcut)
    // Still need to validate phase 1 artifacts
    const complexity = newState.complexity || oldState.complexity;
    if (complexity === 'S' && oldPhase === 1 && newPhase === 3) {
      // Only check phase 1 artifacts, skip phase 2 — fall through below with oldPhase=1
    }

    const currentDir = join(cwd, JWFORGE_DIR, 'current');
    const pipeline = oldState.pipeline || newState.pipeline || 'deep';

    // Attempt config-driven artifact check (file existence only, no content validators).
    const configArtifacts = getConfigArtifacts(pipeline, newPhase);

    if (configArtifacts !== null) {
      // Config path: check file existence for required_artifacts of the target phase.
      // Note: config lists artifacts required to ENTER the target phase, which is equivalent
      // to what must exist after completing the previous phase.
      if (configArtifacts.length === 0) {
        console.log(ALLOW);
        return;
      }

      const missing = configArtifacts.filter(file => !existsSync(join(currentDir, file)));

      if (missing.length > 0) {
        console.log(BLOCK(`[JWForge Artifact Validator] Cannot advance from Phase ${oldPhase} to Phase ${newPhase}. Missing: ${missing.join(', ')}. Write required artifacts before advancing phase.`));
        return;
      }

      console.log(ALLOW);
      return;
    }

    // Fallback path: hardcoded checks with full content validation.
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
