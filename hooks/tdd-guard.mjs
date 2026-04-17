#!/usr/bin/env node

/**
 * JWForge TDD Guard — PreToolUse Hook for Edit/Write
 *
 * Enforces test-before-implementation ordering during Phase 3 (Build).
 * Uses `decision: "block"` for violations — never soft warnings.
 *
 * Algorithm:
 *   1. Parse stdin for file_path
 *   2. Skip pipeline artifacts (.jwforge/**)
 *   3. Only activate during Phase 3
 *   4. Parse architecture.md for TDD unit definitions
 *   5. For current unit: require all test files written before impl files unlock
 *   6. Block future unit files, allow past unit fixes
 *   7. Update tdd-state.json after every allowed test/impl file write
 *
 * Fail open: any internal error or unparseable architecture → ALLOW.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  readStdin, getCwd, readState, parseTddUnits,
  isPipelineArtifact, shouldSkipHook, ALLOW, BLOCK, ALLOW_MSG, JWFORGE_DIR, logHookError
} from './lib/common.mjs';

// ---------------------------------------------------------------------------
// TDD State File Helpers
// ---------------------------------------------------------------------------

const TDD_STATE_FILE = 'tdd-state.json';

/**
 * Reads and parses tdd-state.json. Returns null if missing or corrupt.
 * @param {string} cwd - Project root directory.
 * @returns {object|null}
 */
function readTddState(cwd) {
  try {
    const filePath = join(cwd, JWFORGE_DIR, 'current', TDD_STATE_FILE);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Writes tdd-state.json atomically.
 * @param {string} cwd - Project root directory.
 * @param {object} tddState - The TDD state object to persist.
 */
function writeTddState(cwd, tddState) {
  try {
    const dir = join(cwd, JWFORGE_DIR, 'current');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, TDD_STATE_FILE), JSON.stringify(tddState, null, 2), 'utf8');
  } catch {
    // Non-fatal: if we can't write state, enforcement continues from memory
  }
}

/**
 * Initialize TDD state for a given unit from parsed architecture units.
 * @param {number} unitId - The unit number.
 * @param {object} units - Parsed units from parseTddUnits().
 * @returns {object} Unit TDD state entry.
 */
function initUnitState(unitId, units) {
  const key = String(unitId);
  const unit = units[key];
  if (!unit) {
    return {
      test_files: [],
      impl_files: [],
      tests_written: [],
      impl_unlocked: true, // Unknown unit — don't block
    };
  }
  const testFiles = unit.test_files || [];
  const implFiles = unit.impl_files || [];
  return {
    test_files: testFiles,
    impl_files: implFiles,
    tests_written: [],
    impl_unlocked: testFiles.length === 0, // Empty test_files → immediately unlocked
  };
}

/**
 * Normalize a file path to be relative to the project root.
 * Strips the cwd prefix (with trailing slash) if present.
 * @param {string} filePath - Absolute or relative file path.
 * @param {string} cwd - Project root directory (absolute path).
 * @returns {string} Relative path.
 */
function toRelative(filePath, cwd) {
  const normalized = filePath.replace(/\\/g, '/');
  const cwdNorm = cwd.replace(/\\/g, '/');
  if (normalized.startsWith(cwdNorm + '/')) {
    return normalized.slice(cwdNorm.length + 1);
  }
  // Already relative or different root
  return normalized;
}

/**
 * Get sorted numeric unit IDs from a units object.
 * @param {object} units - Units map with string keys.
 * @returns {number[]}
 */
function getSortedUnitIds(units) {
  return Object.keys(units).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    // Step 1: Read stdin, parse JSON to get file_path
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    // Fast-path: skip all pipeline logic when no .jwforge/ directory is present
    if (shouldSkipHook(process.cwd())) { process.stdout.write(ALLOW); process.exit(0); }

    const filePath = data.tool_input?.file_path || data.input?.file_path || data.file_path || data.filePath || '';

    // Step 2: If no file_path → ALLOW
    if (!filePath) { console.log(ALLOW); return; }

    const cwd = getCwd();

    // Step 3: If pipeline artifact → ALLOW
    if (isPipelineArtifact(filePath, cwd)) {
      console.log(ALLOW);
      return;
    }

    // Step 4: Read state.json — if not Phase 3 → ALLOW
    const state = readState(cwd);
    if (!state || state.status !== 'in_progress' || state.phase !== 3) {
      console.log(ALLOW);
      return;
    }

    // Step 5: Read architecture.md content, call parseTddUnits
    const archFile = join(cwd, JWFORGE_DIR, 'current', 'architecture.md');
    let archContent;
    try {
      if (!existsSync(archFile)) {
        console.log(ALLOW_MSG('[JWForge TDD] Could not read architecture.md — TDD enforcement skipped'));
        return;
      }
      archContent = readFileSync(archFile, 'utf8');
    } catch {
      console.log(ALLOW_MSG('[JWForge TDD] Could not read architecture.md — TDD enforcement skipped'));
      return;
    }

    // Step 6: Parse TDD units from architecture
    const parsed = parseTddUnits(archContent);
    if (!parsed || !parsed.units) {
      console.log(ALLOW_MSG('[JWForge TDD] Could not parse architecture.md for TDD enforcement'));
      return;
    }

    const { units } = parsed;
    const sortedIds = getSortedUnitIds(units);
    if (sortedIds.length === 0) {
      console.log(ALLOW_MSG('[JWForge TDD] No units found in architecture.md — TDD enforcement skipped'));
      return;
    }

    // Step 7: Read or initialize tdd-state.json
    let tddState = readTddState(cwd);
    if (!tddState || typeof tddState !== 'object' || !tddState.units) {
      tddState = { running_units: [sortedIds[0]], units: {} };
    }

    // Step 8: Get running units (supports parallel execution)
    // Prefer state.json's phase3.running_units, then tdd-state's running_units, then first unit
    let runningUnits;
    if (state.phase3 && Array.isArray(state.phase3.running_units) && state.phase3.running_units.length > 0) {
      runningUnits = state.phase3.running_units.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    } else if (Array.isArray(tddState.running_units) && tddState.running_units.length > 0) {
      runningUnits = tddState.running_units.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    } else {
      runningUnits = [sortedIds[0]];
    }

    const completedUnits = Array.isArray(state.phase3?.completed_units)
      ? state.phase3.completed_units.map(n => parseInt(n, 10))
      : [];

    // Sync tdd-state running_units
    tddState.running_units = runningUnits;

    // Ensure all running units have entries in tdd-state
    for (const unitId of runningUnits) {
      const unitKey = String(unitId);
      if (!tddState.units[unitKey]) {
        tddState.units[unitKey] = initUnitState(unitId, units);
      }
    }

    // Step 9: Normalize the target file path to relative
    const relPath = toRelative(filePath, cwd);

    // Step 10: Check which unit and role this file belongs to
    let matchedUnitId = null;
    let matchedRole = null; // 'test' | 'impl'

    for (const idStr of Object.keys(units)) {
      const id = parseInt(idStr, 10);
      if (isNaN(id)) continue;
      const unit = units[idStr];

      if ((unit.test_files || []).includes(relPath)) {
        matchedUnitId = id;
        matchedRole = 'test';
        break;
      }
      if ((unit.impl_files || []).includes(relPath)) {
        matchedUnitId = id;
        matchedRole = 'impl';
        break;
      }
    }

    // If file is NOT in any unit's test_files or impl_files → ALLOW (non-unit file)
    if (matchedUnitId === null) {
      console.log(ALLOW);
      return;
    }

    // Check past / running / future unit status
    if (completedUnits.includes(matchedUnitId)) {
      // Completed unit — ALLOW (fixes to completed units)
      console.log(ALLOW);
      return;
    }

    if (!runningUnits.includes(matchedUnitId)) {
      // Not in running units and not completed — future unit → BLOCK
      console.log(BLOCK(
        `[JWForge TDD] Unit ${matchedUnitId} is not active yet. ` +
        `Running units: [${runningUnits.join(', ')}]. ` +
        `Complete the current level before moving to the next.`
      ));
      return;
    }

    // matchedUnitId is in runningUnits — check TDD order
    const unitKey = String(matchedUnitId);
    const unitState = tddState.units[unitKey];

    if (matchedRole === 'test') {
      // ALLOW test file writes, record in tests_written
      if (!unitState.tests_written.includes(relPath)) {
        unitState.tests_written.push(relPath);
      }
      // Recalculate impl_unlocked
      const allTestsWritten = (unitState.test_files || []).every(
        tf => unitState.tests_written.includes(tf)
      );
      unitState.impl_unlocked = allTestsWritten || (unitState.test_files || []).length === 0;
      writeTddState(cwd, tddState);
      console.log(ALLOW);
      return;
    }

    if (matchedRole === 'impl') {
      if (unitState.impl_unlocked) {
        // ALLOW — tests are satisfied
        writeTddState(cwd, tddState);
        console.log(ALLOW);
        return;
      }

      // BLOCK — tests not yet written
      const writtenSet = new Set(unitState.tests_written || []);
      const missing = (unitState.test_files || []).filter(tf => !writtenSet.has(tf));
      console.log(BLOCK(
        `[JWForge TDD] Test files must be written before implementation. ` +
        `Missing: [${missing.join(', ')}]`
      ));
      return;
    }

    // Fallback — should not reach here
    console.log(ALLOW);
  } catch (e) {
    // Fail open — hook errors must never block the user.
    logHookError('tdd-guard', e);
    console.log(ALLOW);
  }
}

main();
