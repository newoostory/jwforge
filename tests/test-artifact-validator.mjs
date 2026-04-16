import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const HOOK_PATH = new URL('../hooks/artifact-validator.mjs', import.meta.url).pathname;

// --- Helpers ---

/**
 * Runs the artifact-validator hook with the given stdin payload and env.
 * Returns parsed JSON output from stdout.
 */
function runHook(stdinPayload, env = {}) {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(stdinPayload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`Hook output was not JSON: ${JSON.stringify(result.stdout)} stderr: ${result.stderr}`);
  }
}

/**
 * Creates a temporary project directory with:
 * - .jwforge/current/state.json  (oldState)
 * - any extra artifact files specified in artifactFiles map
 *
 * Returns the tmpDir path.
 */
function createTmpProject(oldState, artifactFiles = {}) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'jwforge-test-'));
  const currentDir = join(tmpDir, '.jwforge', 'current');
  mkdirSync(currentDir, { recursive: true });

  writeFileSync(join(currentDir, 'state.json'), JSON.stringify(oldState), 'utf8');

  for (const [filename, content] of Object.entries(artifactFiles)) {
    writeFileSync(join(currentDir, filename), content, 'utf8');
  }

  return tmpDir;
}

/** Minimum valid task-spec.md content (satisfies existing validator). */
const VALID_TASK_SPEC = [
  '## Requirements',
  '',
  'The system must do X, Y, and Z.',
  'All edge cases must be handled gracefully.',
  'Performance targets: < 100ms p99 response time.',
  '',
  '## Success Criteria',
  '',
  '- Feature A works end-to-end.',
  '- Tests pass with 100% coverage on critical paths.',
  '- No regressions in existing functionality.',
].join('\n');

/** Minimum valid architecture.md content (satisfies existing validator). */
const VALID_ARCHITECTURE = [
  '## Unit Plan',
  '',
  '### Unit-1: Core implementation',
  '- test_files: [tests/test-core.mjs]',
  '- impl_files: [src/core.mjs]',
  '- output: Core feature implementation',
].join('\n');

/** Minimum valid review artifact content (content.length > 50). */
const VALID_REVIEW = 'This is a valid review artifact with sufficient content length to pass the validator check. All good.';

/** Builds the stdin payload for a state.json write */
function makeStateWritePayload(newState, statePath, fieldStyle = 'top_level') {
  const newContent = JSON.stringify(newState);
  if (fieldStyle === 'top_level') {
    return { file_path: statePath, content: newContent };
  } else if (fieldStyle === 'tool_input') {
    return { tool_input: { file_path: statePath, content: newContent } };
  } else if (fieldStyle === 'input') {
    return { input: { file_path: statePath, content: newContent } };
  }
  throw new Error(`Unknown fieldStyle: ${fieldStyle}`);
}

// --- Tests ---

describe('artifact-validator — R3: review gate prerequisites', () => {
  let tmpDir;

  after(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TC1: Phase 1->2 advance WITHOUT review-phase1.md is BLOCKED', () => {
    tmpDir = createTmpProject(
      { status: 'in_progress', phase: 1 },
      {
        'task-spec.md': VALID_TASK_SPEC,
        // review-phase1.md intentionally absent
      }
    );
    const statePath = join(tmpDir, '.jwforge', 'current', 'state.json');
    const payload = makeStateWritePayload({ status: 'in_progress', phase: 2 }, statePath);

    const result = runHook(payload, { CLAUDE_CWD: tmpDir });

    assert.equal(result.decision, 'block',
      `Expected BLOCK when review-phase1.md is missing. Got: ${JSON.stringify(result)}`);
    assert.ok(result.reason.includes('review-phase1.md') || result.reason.includes('review'),
      `Block reason should mention review-phase1.md. Got: ${result.reason}`);

    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('TC2: Phase 1->2 advance WITH review-phase1.md (length > 50) and task-spec.md is ALLOWED', () => {
    tmpDir = createTmpProject(
      { status: 'in_progress', phase: 1 },
      {
        'task-spec.md': VALID_TASK_SPEC,
        'review-phase1.md': VALID_REVIEW,
      }
    );
    const statePath = join(tmpDir, '.jwforge', 'current', 'state.json');
    const payload = makeStateWritePayload({ status: 'in_progress', phase: 2 }, statePath);

    const result = runHook(payload, { CLAUDE_CWD: tmpDir });

    assert.equal(result.continue, true,
      `Expected ALLOW when both task-spec.md and review-phase1.md are present. Got: ${JSON.stringify(result)}`);
    assert.notEqual(result.decision, 'block',
      `Expected ALLOW but got BLOCK. Reason: ${result.reason}`);

    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('TC3: Phase 2->3 advance WITHOUT review-phase2.md is BLOCKED', () => {
    tmpDir = createTmpProject(
      { status: 'in_progress', phase: 2 },
      {
        'architecture.md': VALID_ARCHITECTURE,
        // review-phase2.md intentionally absent
      }
    );
    const statePath = join(tmpDir, '.jwforge', 'current', 'state.json');
    const payload = makeStateWritePayload({ status: 'in_progress', phase: 3 }, statePath);

    const result = runHook(payload, { CLAUDE_CWD: tmpDir });

    assert.equal(result.decision, 'block',
      `Expected BLOCK when review-phase2.md is missing. Got: ${JSON.stringify(result)}`);
    assert.ok(result.reason.includes('review-phase2.md') || result.reason.includes('review'),
      `Block reason should mention review-phase2.md. Got: ${result.reason}`);

    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('TC4: Phase 2->3 advance WITH review-phase2.md (length > 50) and architecture.md is ALLOWED', () => {
    tmpDir = createTmpProject(
      { status: 'in_progress', phase: 2 },
      {
        'architecture.md': VALID_ARCHITECTURE,
        'review-phase2.md': VALID_REVIEW,
      }
    );
    const statePath = join(tmpDir, '.jwforge', 'current', 'state.json');
    const payload = makeStateWritePayload({ status: 'in_progress', phase: 3 }, statePath);

    const result = runHook(payload, { CLAUDE_CWD: tmpDir });

    assert.equal(result.continue, true,
      `Expected ALLOW when both architecture.md and review-phase2.md are present. Got: ${JSON.stringify(result)}`);
    assert.notEqual(result.decision, 'block',
      `Expected ALLOW but got BLOCK. Reason: ${result.reason}`);

    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });
});

describe('artifact-validator — DD6: field extraction normalization (tool_input.file_path)', () => {
  let tmpDir;

  after(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TC5: Phase 1->2 advance with tool_input.file_path and tool_input.content is correctly detected as a phase advance and BLOCKED when review-phase1.md is missing', () => {
    // Before DD6 fix: `tool_input.file_path` is not in the field extraction chain on line 62,
    // so the hook would ALLOW early (filePath === '', not a state.json path).
    // After DD6 fix: field_path extracted from tool_input, BLOCK fires because review-phase1.md is absent.
    tmpDir = createTmpProject(
      { status: 'in_progress', phase: 1 },
      {
        'task-spec.md': VALID_TASK_SPEC,
        // review-phase1.md intentionally absent
      }
    );
    const statePath = join(tmpDir, '.jwforge', 'current', 'state.json');
    // Use tool_input field style — both file_path and content under tool_input
    const payload = makeStateWritePayload({ status: 'in_progress', phase: 2 }, statePath, 'tool_input');

    const result = runHook(payload, { CLAUDE_CWD: tmpDir });

    // Before DD6 fix: hook ALLOWs (file_path not found, returns early)
    // After DD6 fix: hook detects the phase advance and BLOCKs (review-phase1.md missing)
    assert.equal(result.decision, 'block',
      `Expected BLOCK when tool_input.file_path is used and review-phase1.md is absent. ` +
      `If ALLOW, the hook is not reading tool_input.file_path (DD6 not implemented). Got: ${JSON.stringify(result)}`);

    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });
});

describe('artifact-validator — Regression: existing behavior preserved', () => {
  let tmpDir;

  after(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TC6: Phase 1->2 with task-spec.md and review-phase1.md present is ALLOWED (no regression)', () => {
    tmpDir = createTmpProject(
      { status: 'in_progress', phase: 1 },
      {
        'task-spec.md': VALID_TASK_SPEC,
        'review-phase1.md': VALID_REVIEW,
      }
    );
    const statePath = join(tmpDir, '.jwforge', 'current', 'state.json');
    const payload = makeStateWritePayload({ status: 'in_progress', phase: 2 }, statePath);

    const result = runHook(payload, { CLAUDE_CWD: tmpDir });

    // Must still ALLOW — both required artifacts present
    assert.equal(result.continue, true,
      `Regression: Phase 1->2 should be ALLOWED when all artifacts present. Got: ${JSON.stringify(result)}`);
    assert.notEqual(result.decision, 'block',
      `Regression: should not BLOCK when review-phase1.md is present. Reason: ${result.reason}`);

    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it('TC6b: Phase 1->2 without task-spec.md is still BLOCKED (existing gate unchanged)', () => {
    tmpDir = createTmpProject(
      { status: 'in_progress', phase: 1 },
      {
        // task-spec.md absent — existing gate should still fire
        'review-phase1.md': VALID_REVIEW,
      }
    );
    const statePath = join(tmpDir, '.jwforge', 'current', 'state.json');
    const payload = makeStateWritePayload({ status: 'in_progress', phase: 2 }, statePath);

    const result = runHook(payload, { CLAUDE_CWD: tmpDir });

    assert.equal(result.decision, 'block',
      `Regression: Phase 1->2 without task-spec.md should still BLOCK. Got: ${JSON.stringify(result)}`);

    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });
});
