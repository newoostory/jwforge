/**
 * Tests for Unit-8: Settings.json agent-bg-guard & state-validator registration verification
 *
 * Covers:
 *  R7 — agent-bg-guard.mjs is correctly registered in hooks.json under PreToolUse → Agent matcher
 *  R6 — state-validator.mjs is correctly registered in hooks.json under PreToolUse → Write matcher
 *
 * Structural checks parse hooks.json and read hook source files.
 * Behavioural checks spawn hooks as child processes with crafted stdin payloads.
 *
 * Output formats from common.mjs:
 *   ALLOW = { continue: true, suppressOutput: true }
 *   BLOCK = { decision: 'block', reason: '...' }
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── paths ─────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = new URL('..', import.meta.url).pathname;
const HOOKS_JSON_PATH = join(PROJECT_ROOT, 'hooks', 'hooks.json');
const AGENT_BG_GUARD_PATH = join(PROJECT_ROOT, 'hooks', 'agent-bg-guard.mjs');
const STATE_VALIDATOR_PATH = join(PROJECT_ROOT, 'hooks', 'state-validator.mjs');

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Invoke a hook with a given stdin payload and a temp CWD.
 *
 * @param {string} hookPath  - Absolute path to the hook script.
 * @param {string} cwd       - Temp directory to use as CLAUDE_CWD (project root).
 * @param {object} payload   - The JSON object to feed via stdin.
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runHook(hookPath, cwd, payload) {
  const result = spawnSync(process.execPath, [hookPath], {
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

// ── test suite ────────────────────────────────────────────────────────────────

describe('Unit-8: hooks.json registration verification', () => {

  // ── Test 1: hooks.json has PreToolUse entry for Agent → agent-bg-guard.mjs ──

  it('hooks.json has a PreToolUse entry with matcher "Agent" referencing agent-bg-guard.mjs', () => {
    const raw = readFileSync(HOOKS_JSON_PATH, 'utf8');
    const config = JSON.parse(raw);

    const preToolUseEntries = config?.hooks?.PreToolUse;
    assert.ok(Array.isArray(preToolUseEntries), 'hooks.json must have a PreToolUse array');

    const agentEntry = preToolUseEntries.find(entry => entry.matcher === 'Agent');
    assert.ok(agentEntry, 'PreToolUse must have an entry with matcher "Agent"');
    assert.ok(Array.isArray(agentEntry.hooks), 'Agent matcher entry must have a hooks array');

    const hasAgentBgGuard = agentEntry.hooks.some(
      h => typeof h.command === 'string' && h.command.includes('agent-bg-guard.mjs')
    );
    assert.ok(
      hasAgentBgGuard,
      'Agent PreToolUse hooks must include a command referencing agent-bg-guard.mjs'
    );
  });

  // ── Test 2: agent-bg-guard.mjs file exists ────────────────────────────────

  it('agent-bg-guard.mjs exists at hooks/agent-bg-guard.mjs', () => {
    assert.ok(
      existsSync(AGENT_BG_GUARD_PATH),
      `agent-bg-guard.mjs must exist at ${AGENT_BG_GUARD_PATH}`
    );
  });

  // ── Test 3: agent-bg-guard.mjs source checks run_in_background ───────────

  it('agent-bg-guard.mjs source contains a check for the run_in_background field', () => {
    const source = readFileSync(AGENT_BG_GUARD_PATH, 'utf8');
    assert.ok(
      source.includes('run_in_background'),
      'agent-bg-guard.mjs must reference the run_in_background field'
    );
  });

  // ── Test 4: agent-bg-guard.mjs BLOCKs when run_in_background is false ────

  describe('agent-bg-guard.mjs behavioral tests', () => {
    let tmpDir;

    before(() => {
      // Create a temp project dir with an active pipeline state
      tmpDir = join(tmpdir(), `jwforge-test-unit8-${Date.now()}`);
      const jwforgeCurrentDir = join(tmpDir, '.jwforge', 'current');
      mkdirSync(jwforgeCurrentDir, { recursive: true });

      // Write an in_progress state.json so the guard enforces the rule
      const state = {
        status: 'in_progress',
        phase: 3,
        complexity: 'M',
      };
      writeFileSync(join(jwforgeCurrentDir, 'state.json'), JSON.stringify(state), 'utf8');
    });

    after(() => {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('BLOCKs an Agent call without run_in_background during an active pipeline', () => {
      const payload = {
        tool_name: 'Agent',
        tool_input: {
          prompt: 'do something',
          // run_in_background intentionally absent
        },
      };

      const { stdout } = runHook(AGENT_BG_GUARD_PATH, tmpDir, payload);
      const output = parseOutput(stdout);

      assert.ok(output, 'Hook must produce valid JSON output');
      assert.equal(
        output.decision,
        'block',
        `Expected decision "block" but got: ${JSON.stringify(output)}`
      );
      assert.ok(
        typeof output.reason === 'string' && output.reason.length > 0,
        'BLOCK response must include a reason string'
      );
    });

    it('BLOCKs an Agent call with run_in_background=false during an active pipeline', () => {
      const payload = {
        tool_name: 'Agent',
        tool_input: {
          prompt: 'do something',
          run_in_background: false,
        },
      };

      const { stdout } = runHook(AGENT_BG_GUARD_PATH, tmpDir, payload);
      const output = parseOutput(stdout);

      assert.ok(output, 'Hook must produce valid JSON output');
      assert.equal(
        output.decision,
        'block',
        `Expected decision "block" but got: ${JSON.stringify(output)}`
      );
    });

    // ── Test 5: agent-bg-guard.mjs ALLOWs when run_in_background is true ────

    it('ALLOWs an Agent call with run_in_background=true during an active pipeline', () => {
      const payload = {
        tool_name: 'Agent',
        tool_input: {
          prompt: 'do something',
          run_in_background: true,
        },
      };

      const { stdout } = runHook(AGENT_BG_GUARD_PATH, tmpDir, payload);
      const output = parseOutput(stdout);

      assert.ok(output, 'Hook must produce valid JSON output');
      assert.ok(
        output.continue === true,
        `Expected continue=true (ALLOW) but got: ${JSON.stringify(output)}`
      );
      assert.equal(
        output.decision,
        undefined,
        'ALLOW response must not have a "decision" field'
      );
    });
  });

  // ── Test 6: hooks.json has PreToolUse entry for Write → state-validator.mjs

  it('hooks.json has a PreToolUse entry for Write tool referencing state-validator.mjs', () => {
    const raw = readFileSync(HOOKS_JSON_PATH, 'utf8');
    const config = JSON.parse(raw);

    const preToolUseEntries = config?.hooks?.PreToolUse;
    assert.ok(Array.isArray(preToolUseEntries), 'hooks.json must have a PreToolUse array');

    const writeEntry = preToolUseEntries.find(entry => entry.matcher === 'Write');
    assert.ok(writeEntry, 'PreToolUse must have an entry with matcher "Write"');
    assert.ok(Array.isArray(writeEntry.hooks), 'Write matcher entry must have a hooks array');

    const hasStateValidator = writeEntry.hooks.some(
      h => typeof h.command === 'string' && h.command.includes('state-validator.mjs')
    );
    assert.ok(
      hasStateValidator,
      'Write PreToolUse hooks must include a command referencing state-validator.mjs'
    );
  });

  // ── Test 7: state-validator.mjs source contains _recorder check (Rule 0) ──

  it('state-validator.mjs source contains the _recorder check (Rule 0)', () => {
    const source = readFileSync(STATE_VALIDATOR_PATH, 'utf8');
    assert.ok(
      source.includes('_recorder'),
      'state-validator.mjs must reference _recorder for Rule 0 enforcement'
    );
    // More specific: check the guard condition checks newState._recorder !== true
    assert.ok(
      source.includes('newState._recorder !== true'),
      'state-validator.mjs must contain the guard: newState._recorder !== true'
    );
  });
});
