/**
 * Tests for phase-guard.mjs — R6 (state.json protection) and R1 (artifact ownership)
 *
 * R6: During active pipeline, block Edit tool calls and Bash write operations
 *     targeting .jwforge/current/state.json. Write tool is permitted (goes through
 *     state-validator, not blocked here).
 *
 * R1: During active pipeline, Write tool calls to agent-owned artifact files must
 *     include a content marker `<!-- _agent: {role} -->` as the first line matching
 *     the ownership map. Edit to agent-owned artifacts is always blocked.
 *
 * All tests use a temp directory with state.json set to status=in_progress, phase=3
 * and a minimal architecture.md so phase-guard doesn't block on architecture checks.
 *
 * These tests are expected to FAIL before R1/R6 are implemented in phase-guard.mjs
 * (currently the hook allows all .jwforge/** paths at Step 3 unconditionally).
 *
 * Output formats from common.mjs:
 *   ALLOW = { continue: true, suppressOutput: true }
 *   BLOCK = { decision: 'block', reason: '...' }
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── constants ─────────────────────────────────────────────────────────────────

const HOOK_PATH = new URL('../hooks/phase-guard.mjs', import.meta.url).pathname;

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Invoke the hook with a given stdin payload and a temp CWD.
 */
function runHook(cwd, payload) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_CWD: cwd,
    },
    timeout: 10_000,
  });
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    status: result.status ?? -1,
  };
}

/**
 * Parse the last non-empty JSON line from hook stdout.
 */
function parseOutput(stdout) {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch { /* skip */ }
  }
  return null;
}

function isAllow(parsed) {
  return parsed !== null && parsed.continue === true;
}

function isBlock(parsed) {
  return parsed !== null && parsed.decision === 'block';
}

/**
 * Set up a temp directory with state.json (status=in_progress, phase=3) and a
 * minimal architecture.md that lists owned artifact files so phase 3 arch check
 * doesn't inadvertently block them.
 *
 * We also write bare entries for the owned artifact files themselves in
 * architecture.md so the file-in-architecture check passes for those paths.
 * (Owned artifacts live under .jwforge/ so they would normally be allowed as
 * pipeline artifacts — but after R1 they need content marker validation.)
 */
function setupEnv() {
  const cwd = join(tmpdir(), `jwforge-pg-r1r6-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const jwforgeDir = join(cwd, '.jwforge', 'current');
  mkdirSync(jwforgeDir, { recursive: true });

  // Active pipeline at phase 3
  const state = {
    status: 'in_progress',
    phase: 3,
    phase3: { status: 'in_progress' },
    complexity: 'M',
    _recorder: true,
  };
  writeFileSync(join(jwforgeDir, 'state.json'), JSON.stringify(state));

  // Minimal architecture.md — list the impl files so phase-3 arch check passes.
  // (Phase-guard checks project source files against arch; owned artifacts are
  //  pipeline artifacts and get their own R1 check after implementation.)
  const archContent = `# Architecture\n\n### Unit-7: Phase-guard artifact ownership\n- impl_files: [hooks/phase-guard.mjs, hooks/lib/common.mjs]\n`;
  writeFileSync(join(jwforgeDir, 'architecture.md'), archContent);

  return cwd;
}

/**
 * Build a Write tool payload (has `content` field).
 */
function writePayload(filePath, content) {
  return {
    tool_input: {
      file_path: filePath,
      content,
    },
  };
}

/**
 * Build an Edit tool payload (has `old_string`/`new_string`, no `content`).
 */
function editPayload(filePath, oldString, newString) {
  return {
    tool_input: {
      file_path: filePath,
      old_string: oldString,
      new_string: newString,
    },
  };
}

/**
 * Build a Bash tool payload.
 */
function bashPayload(command) {
  return {
    tool_input: {
      command,
    },
  };
}

// ── R6: state.json protection ─────────────────────────────────────────────────

describe('phase-guard R6 — state.json protection', () => {

  it('ALLOW: Write to state.json with content field (goes through state-validator)', () => {
    const cwd = setupEnv();
    try {
      const stateJsonPath = join(cwd, '.jwforge', 'current', 'state.json');
      const newState = {
        status: 'in_progress',
        phase: 3,
        phase3: { status: 'in_progress' },
        complexity: 'M',
        _recorder: true,
      };
      const payload = writePayload(stateJsonPath, JSON.stringify(newState));

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isAllow(parsed),
        `Expected ALLOW for Write to state.json (state-validator handles it). Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('BLOCK: Edit tool targeting state.json (has old_string/new_string, no content)', () => {
    const cwd = setupEnv();
    try {
      const stateJsonPath = join(cwd, '.jwforge', 'current', 'state.json');
      const payload = editPayload(stateJsonPath, '"phase": 3', '"phase": 4');

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isBlock(parsed),
        `Expected BLOCK for Edit to state.json (Edit is never allowed on state.json). Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('BLOCK: Bash command writing to state.json via redirect', () => {
    const cwd = setupEnv();
    try {
      const stateJsonPath = join(cwd, '.jwforge', 'current', 'state.json');
      // Uses redirect operator — matches FILE_WRITE_PATTERNS and targets state.json
      const payload = bashPayload(`echo '{}' > ${stateJsonPath}`);

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isBlock(parsed),
        `Expected BLOCK for Bash redirect to state.json. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

});

// ── R1: Artifact ownership ────────────────────────────────────────────────────

describe('phase-guard R1 — artifact ownership enforcement', () => {

  it('ALLOW: Write to task-spec.md WITH correct agent marker <!-- _agent: analyst -->', () => {
    const cwd = setupEnv();
    try {
      const filePath = join(cwd, '.jwforge', 'current', 'task-spec.md');
      const content = '<!-- _agent: analyst -->\n# Task Spec\n\nRequirements here.\n';
      const payload = writePayload(filePath, content);

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isAllow(parsed),
        `Expected ALLOW for Write to task-spec.md with correct agent marker. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('BLOCK: Write to task-spec.md WITHOUT any agent marker', () => {
    const cwd = setupEnv();
    try {
      const filePath = join(cwd, '.jwforge', 'current', 'task-spec.md');
      const content = '# Task Spec\n\nRequirements here.\n';
      const payload = writePayload(filePath, content);

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isBlock(parsed),
        `Expected BLOCK for Write to task-spec.md without marker. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('BLOCK: Write to task-spec.md with WRONG agent marker (researcher instead of analyst)', () => {
    const cwd = setupEnv();
    try {
      const filePath = join(cwd, '.jwforge', 'current', 'task-spec.md');
      const content = '<!-- _agent: researcher -->\n# Task Spec\n\nRequirements here.\n';
      const payload = writePayload(filePath, content);

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isBlock(parsed),
        `Expected BLOCK for Write to task-spec.md with wrong agent marker (researcher vs analyst). Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('BLOCK: Edit to task-spec.md (Edit to owned artifacts always blocked)', () => {
    const cwd = setupEnv();
    try {
      const filePath = join(cwd, '.jwforge', 'current', 'task-spec.md');
      const payload = editPayload(filePath, '# Task Spec', '# Updated Task Spec');

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isBlock(parsed),
        `Expected BLOCK for Edit to task-spec.md (Edit is always blocked for owned artifacts). Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ALLOW: Write to architecture.md WITH correct agent marker <!-- _agent: designer -->', () => {
    const cwd = setupEnv();
    try {
      const filePath = join(cwd, '.jwforge', 'current', 'architecture.md');
      const content = '<!-- _agent: designer -->\n# Architecture\n\nDesign here.\n';
      const payload = writePayload(filePath, content);

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isAllow(parsed),
        `Expected ALLOW for Write to architecture.md with correct agent marker. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ALLOW: Write to analysis-codebase.md WITH correct agent marker <!-- _agent: researcher -->', () => {
    const cwd = setupEnv();
    try {
      const filePath = join(cwd, '.jwforge', 'current', 'analysis-codebase.md');
      const content = '<!-- _agent: researcher -->\n# Codebase Analysis\n\nFindings here.\n';
      const payload = writePayload(filePath, content);

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isAllow(parsed),
        `Expected ALLOW for Write to analysis-codebase.md with correct agent marker. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ALLOW: Write to review-phase1.md WITH correct agent marker <!-- _agent: reviewer -->', () => {
    const cwd = setupEnv();
    try {
      const filePath = join(cwd, '.jwforge', 'current', 'review-phase1.md');
      const content = '<!-- _agent: reviewer -->\n# Phase 1 Review\n\nReview content.\n';
      const payload = writePayload(filePath, content);

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isAllow(parsed),
        `Expected ALLOW for Write to review-phase1.md with correct agent marker. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('BLOCK: Write to review-phase1.md WITHOUT any agent marker', () => {
    const cwd = setupEnv();
    try {
      const filePath = join(cwd, '.jwforge', 'current', 'review-phase1.md');
      const content = '# Phase 1 Review\n\nReview content.\n';
      const payload = writePayload(filePath, content);

      const result = runHook(cwd, payload);
      const parsed = parseOutput(result.stdout);

      assert.ok(
        parsed !== null,
        `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
      );
      assert.ok(
        isBlock(parsed),
        `Expected BLOCK for Write to review-phase1.md without marker. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

});
