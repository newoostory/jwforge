/**
 * Tests for state-validator.mjs
 *
 * Covers:
 *  R9 — Atomic phase advance fix (Rule f: use newState phase sub-status first)
 *  R4 — User gate enforcement (Rule h: waiting_for_user must be true before phase 2→3 or 3→4)
 *
 * The hook is spawned as a child process and fed JSON via stdin, matching the
 * real Claude Code hook invocation pattern.
 *
 * Output formats from common.mjs:
 *   ALLOW = { continue: true, suppressOutput: true }
 *   BLOCK = { decision: 'block', reason: '...' }
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── helpers ──────────────────────────────────────────────────────────────────

const HOOK_PATH = new URL('../hooks/state-validator.mjs', import.meta.url).pathname;

/**
 * Invoke the hook with a given stdin payload and a temp CWD.
 *
 * @param {string} cwd    - Temp directory to use as CLAUDE_CWD (project root).
 * @param {object} payload - The JSON object to feed via stdin.
 * @returns {{ stdout: string, stderr: string, status: number }}
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
 * The hook may emit multiple lines; we want the last valid JSON object.
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
 * Write the current state.json and any required artifact files into the temp
 * directory's .jwforge/current/ folder.
 *
 * @param {string} cwd        - Project root (temp dir).
 * @param {object} state      - State object to write to state.json.
 * @param {string[]} artifacts - Artifact filenames to touch (e.g. ['task-spec.md']).
 */
function setupState(cwd, state, artifacts = []) {
  const dir = join(cwd, '.jwforge', 'current');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state));
  for (const name of artifacts) {
    writeFileSync(join(dir, name), `# ${name} placeholder\n`);
  }
}

/**
 * Build a Write tool hook payload targeting state.json.
 *
 * @param {string} cwd      - Project root (used to construct the file_path).
 * @param {object} newState - The new state content being written.
 */
function stateWritePayload(cwd, newState) {
  return {
    tool_input: {
      file_path: join(cwd, '.jwforge', 'current', 'state.json'),
      content: JSON.stringify(newState),
    },
  };
}

// ── test suite ────────────────────────────────────────────────────────────────

describe('state-validator hook', () => {

  // ── R9: Atomic phase advance ───────────────────────────────────────────────

  describe('R9 — Atomic phase advance (Rule f fix)', () => {

    it('ALLOW: atomic write sets phase1.status=done AND phase=2 in one payload', () => {
      const cwd = join(tmpdir(), `jwforge-sv-r9-${Date.now()}`);
      try {
        // Current state: phase 1, phase1.status in_progress
        setupState(cwd, {
          status: 'in_progress',
          phase: 1,
          phase1: { status: 'in_progress' },
          complexity: 'M',
          _recorder: true,
        }, ['task-spec.md']);

        // New state: atomically sets phase1.status=done AND phase=2
        const newState = {
          status: 'in_progress',
          phase: 2,
          phase1: { status: 'done' },
          complexity: 'M',
          _recorder: true,
        };

        const result = runHook(cwd, stateWritePayload(cwd, newState));
        const parsed = parseOutput(result.stdout);

        assert.ok(
          parsed !== null,
          `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
        );
        assert.ok(
          isAllow(parsed),
          `Expected ALLOW for atomic phase advance. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
        );
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

  });

  // ── R4: User gate enforcement ──────────────────────────────────────────────

  describe('R4 — User gate enforcement (Rule h)', () => {

    it('BLOCK: phase 2→3 advance WITHOUT waiting_for_user=true on disk', () => {
      const cwd = join(tmpdir(), `jwforge-sv-r4-a-${Date.now()}`);
      try {
        // Current state: phase 2 complete, but waiting_for_user is false
        setupState(cwd, {
          status: 'in_progress',
          phase: 2,
          phase2: { status: 'done' },
          complexity: 'M',
          waiting_for_user: false,
          _recorder: true,
        }, ['task-spec.md', 'architecture.md']);

        const newState = {
          status: 'in_progress',
          phase: 3,
          phase2: { status: 'done' },
          complexity: 'M',
          waiting_for_user: false,
          _recorder: true,
        };

        const result = runHook(cwd, stateWritePayload(cwd, newState));
        const parsed = parseOutput(result.stdout);

        assert.ok(
          parsed !== null,
          `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
        );
        assert.ok(
          isBlock(parsed),
          `Expected BLOCK for phase 2→3 without user gate. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
        );
        assert.ok(
          typeof parsed.reason === 'string' && parsed.reason.toLowerCase().includes('user gate'),
          `Expected block reason to mention "user gate". Got reason: ${parsed.reason}`
        );
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('ALLOW: phase 2→3 advance WITH waiting_for_user=true on disk', () => {
      const cwd = join(tmpdir(), `jwforge-sv-r4-b-${Date.now()}`);
      try {
        // Current state: phase 2 complete, waiting_for_user is true
        setupState(cwd, {
          status: 'in_progress',
          phase: 2,
          phase2: { status: 'done' },
          complexity: 'M',
          waiting_for_user: true,
          _recorder: true,
        }, ['task-spec.md', 'architecture.md']);

        const newState = {
          status: 'in_progress',
          phase: 3,
          phase2: { status: 'done' },
          complexity: 'M',
          waiting_for_user: true,
          _recorder: true,
        };

        const result = runHook(cwd, stateWritePayload(cwd, newState));
        const parsed = parseOutput(result.stdout);

        assert.ok(
          parsed !== null,
          `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
        );
        assert.ok(
          isAllow(parsed),
          `Expected ALLOW for phase 2→3 with user gate satisfied. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
        );
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('BLOCK: phase 3→4 advance WITHOUT waiting_for_user=true on disk', () => {
      const cwd = join(tmpdir(), `jwforge-sv-r4-c-${Date.now()}`);
      try {
        // Current state: phase 3 complete, waiting_for_user is false (or absent)
        setupState(cwd, {
          status: 'in_progress',
          phase: 3,
          phase3: { status: 'done' },
          complexity: 'M',
          waiting_for_user: false,
          _recorder: true,
        }, ['task-spec.md', 'architecture.md']);

        const newState = {
          status: 'in_progress',
          phase: 4,
          phase3: { status: 'done' },
          complexity: 'M',
          waiting_for_user: false,
          _recorder: true,
        };

        const result = runHook(cwd, stateWritePayload(cwd, newState));
        const parsed = parseOutput(result.stdout);

        assert.ok(
          parsed !== null,
          `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
        );
        assert.ok(
          isBlock(parsed),
          `Expected BLOCK for phase 3→4 without user gate. Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
        );
        assert.ok(
          typeof parsed.reason === 'string' && parsed.reason.toLowerCase().includes('user gate'),
          `Expected block reason to mention "user gate". Got reason: ${parsed.reason}`
        );
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

    it('ALLOW: S-complexity Phase 1→3 skip does NOT require user gate', () => {
      const cwd = join(tmpdir(), `jwforge-sv-r4-d-${Date.now()}`);
      try {
        // Current state: phase 1 done, S complexity — no waiting_for_user required
        setupState(cwd, {
          status: 'in_progress',
          phase: 1,
          phase1: { status: 'done' },
          complexity: 'S',
          waiting_for_user: false,
          _recorder: true,
        }, ['task-spec.md']);

        const newState = {
          status: 'in_progress',
          phase: 3,
          phase1: { status: 'done' },
          complexity: 'S',
          waiting_for_user: false,
          _recorder: true,
        };

        const result = runHook(cwd, stateWritePayload(cwd, newState));
        const parsed = parseOutput(result.stdout);

        assert.ok(
          parsed !== null,
          `Hook produced no parseable output. stdout: ${result.stdout}, stderr: ${result.stderr}`
        );
        assert.ok(
          isAllow(parsed),
          `Expected ALLOW for S-complexity 1→3 skip (no user gate needed). Got: ${JSON.stringify(parsed)}\nstderr: ${result.stderr}`
        );
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });

  });

});
