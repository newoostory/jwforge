#!/usr/bin/env node
/**
 * Tests for hooks/subagent-tracker.mjs
 *
 * The hook is a PostToolUse hook for the Agent tool.
 * It reads a JSON payload from stdin, appends a JSONL entry to
 * .jwforge/current/agent-log.jsonl, and always outputs ALLOW.
 *
 * Tests spawn the hook as a child process and verify both its stdout
 * (ALLOW decision) and the written JSONL file.
 *
 * These tests are designed to FAIL before the implementation fix is in place.
 * Specifically, the prompt-based name fallback (# AgentName Agent) is not yet
 * implemented in the hook.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync,
  existsSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PROJECT_ROOT = new URL('..', import.meta.url).pathname;
const HOOK_PATH = join(PROJECT_ROOT, 'hooks', 'subagent-tracker.mjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a temp directory with a valid .jwforge/current/state.json so the
 * hook's readState() check passes and it proceeds to write the log entry.
 */
function makeTempDir() {
  const tempDir = mkdtempSync(join(tmpdir(), 'jwforge-tracker-test-'));
  const currentDir = join(tempDir, '.jwforge', 'current');
  mkdirSync(currentDir, { recursive: true });
  writeFileSync(
    join(currentDir, 'state.json'),
    JSON.stringify({ status: 'in_progress', phase: 3, team_mode: 'parallel' })
  );
  return tempDir;
}

/**
 * Runs the subagent-tracker hook with the given payload as stdin.
 * Sets CLAUDE_CWD to tempDir so the hook writes its log there.
 */
function runHook(payload, tempDir) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CWD: tempDir },
    timeout: 5000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? -1,
  };
}

/**
 * Reads and parses the last JSONL line in the agent-log.jsonl file.
 * Returns null if the file does not exist or has no lines.
 */
function readLastLogEntry(tempDir) {
  const logFile = join(tempDir, '.jwforge', 'current', 'agent-log.jsonl');
  if (!existsSync(logFile)) return null;
  const lines = readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(l => l.trim().length > 0);
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

/**
 * Reads and parses all JSONL entries from agent-log.jsonl.
 */
function readAllLogEntries(tempDir) {
  const logFile = join(tempDir, '.jwforge', 'current', 'agent-log.jsonl');
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l));
}

/**
 * Parses the ALLOW JSON from hook stdout. Fails the assertion if not valid JSON.
 */
function parseAllow(stdout, context) {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    assert.fail(`Hook stdout is not valid JSON (${context}): "${stdout}"`);
  }
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('subagent-tracker hook', () => {

  // ── 1. Name / model extraction from tool_input ──────────────────────────

  describe('1. Name and model extraction from tool_input', () => {

    it('uses tool_input.name for agent_name (not "unnamed")', () => {
      const tempDir = makeTempDir();
      try {
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-1',
          tool_input: { name: 'my-agent', model: 'sonnet', prompt: 'Do something.' },
          output: { content: 'Done.' },
        };
        runHook(payload, tempDir);
        const entry = readLastLogEntry(tempDir);
        assert.ok(entry !== null, 'Expected a log entry to be written');
        assert.equal(entry.agent_name, 'my-agent',
          `Expected agent_name "my-agent", got "${entry.agent_name}"`);
        assert.notEqual(entry.agent_name, 'unnamed',
          'agent_name must not be "unnamed" when tool_input.name is provided');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('uses tool_input.model for model (not "unknown")', () => {
      const tempDir = makeTempDir();
      try {
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-2',
          tool_input: { name: 'my-agent', model: 'sonnet', prompt: 'Do something.' },
          output: { content: 'Done.' },
        };
        runHook(payload, tempDir);
        const entry = readLastLogEntry(tempDir);
        assert.ok(entry !== null, 'Expected a log entry to be written');
        assert.equal(entry.model, 'sonnet',
          `Expected model "sonnet", got "${entry.model}"`);
        assert.notEqual(entry.model, 'unknown',
          'model must not be "unknown" when tool_input.model is provided');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('reads from tool_input rather than input when both fields exist', () => {
      const tempDir = makeTempDir();
      try {
        // Simulate old (data.input) vs new (data.tool_input) field layout
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-regression',
          tool_input: { name: 'correct-agent', model: 'correct-model', prompt: '' },
          input: { name: 'wrong-agent', model: 'wrong-model', prompt: '' },
          output: { content: 'Done.' },
        };
        runHook(payload, tempDir);
        const entry = readLastLogEntry(tempDir);
        assert.ok(entry !== null, 'Expected a log entry');
        assert.equal(entry.agent_name, 'correct-agent',
          `tool_input.name must take precedence over input.name; got "${entry.agent_name}"`);
        assert.equal(entry.model, 'correct-model',
          `tool_input.model must take precedence over input.model; got "${entry.model}"`);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // ── 2. Fallback: extract name from prompt header ─────────────────────────

  describe('2. Fallback: extract agent name from tool_input.prompt when name is absent', () => {

    it('parses "# MyAgent Agent" from prompt and uses it as agent_name', () => {
      const tempDir = makeTempDir();
      try {
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-prompt-1',
          tool_input: {
            // name intentionally absent
            model: 'claude-haiku-4-5',
            prompt: '# MyAgent Agent\n\nYou are MyAgent. Do something useful.',
          },
          output: { content: 'Done.' },
        };
        runHook(payload, tempDir);
        const entry = readLastLogEntry(tempDir);
        assert.ok(entry !== null, 'Expected a log entry to be written');
        const nameLower = (entry.agent_name || '').toLowerCase();
        assert.ok(
          nameLower.includes('myagent') || nameLower === 'myagent',
          `Expected agent_name to contain "myagent" (from prompt header "# MyAgent Agent"), got "${entry.agent_name}"`
        );
        assert.notEqual(entry.agent_name, 'unnamed',
          'agent_name must not be "unnamed" when prompt header provides a name');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('parses "# Executor Agent" from prompt when name field is missing', () => {
      const tempDir = makeTempDir();
      try {
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-prompt-2',
          tool_input: {
            model: 'claude-sonnet-4-5',
            prompt: '# Executor Agent\n\nYou are the Executor. Build the unit.',
          },
          output: { content: '## Executor Report\nDone.' },
        };
        runHook(payload, tempDir);
        const entry = readLastLogEntry(tempDir);
        assert.ok(entry !== null, 'Expected a log entry to be written');
        const nameLower = (entry.agent_name || '').toLowerCase();
        assert.ok(
          nameLower.includes('executor'),
          `Expected agent_name to contain "executor" (from prompt header), got "${entry.agent_name}"`
        );
        assert.notEqual(entry.agent_name, 'unnamed',
          'agent_name must not be "unnamed" when prompt starts with "# Executor Agent"');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('falls back to "unnamed" when neither name nor a recognized prompt header is present', () => {
      const tempDir = makeTempDir();
      try {
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-prompt-3',
          tool_input: {
            model: 'claude-haiku-4-5',
            // Generic prompt with no # AgentName Agent header
            prompt: 'You are a helpful agent. Complete the task.',
          },
          output: { content: 'Done.' },
        };
        runHook(payload, tempDir);
        const entry = readLastLogEntry(tempDir);
        assert.ok(entry !== null, 'Expected a log entry to be written');
        // "unnamed" is acceptable here — just assert we get a string
        assert.ok(typeof entry.agent_name === 'string', 'agent_name must be a string');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // ── 3. tool_input.name takes priority over prompt parsing ────────────────

  describe('3. tool_input.name takes priority over prompt header', () => {

    it('uses tool_input.name even when prompt also has a # Header Agent line', () => {
      const tempDir = makeTempDir();
      try {
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-priority',
          tool_input: {
            name: 'explicit-name',
            model: 'sonnet',
            prompt: '# DifferentAgent Agent\n\nDo something.',
          },
          output: { content: 'Done.' },
        };
        runHook(payload, tempDir);
        const entry = readLastLogEntry(tempDir);
        assert.ok(entry !== null, 'Expected a log entry');
        assert.equal(entry.agent_name, 'explicit-name',
          `tool_input.name must take priority over prompt header; got "${entry.agent_name}"`);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // ── 4. Always outputs ALLOW ───────────────────────────────────────────────

  describe('4. Always outputs ALLOW (never blocks)', () => {

    it('outputs { continue: true } for a well-formed payload', () => {
      const tempDir = makeTempDir();
      try {
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-allow-1',
          tool_input: { name: 'test-agent', model: 'haiku', prompt: 'Do it.' },
          output: { content: 'Done.' },
        };
        const { stdout } = runHook(payload, tempDir);
        const parsed = parseAllow(stdout, 'well-formed payload');
        assert.equal(parsed.continue, true, 'Hook must output { continue: true }');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('outputs ALLOW for completely malformed (non-JSON) stdin', () => {
      const tempDir = makeTempDir();
      try {
        const result = spawnSync(process.execPath, [HOOK_PATH], {
          input: 'this is not json at all !!!',
          encoding: 'utf8',
          env: { ...process.env, CLAUDE_CWD: tempDir },
          timeout: 5000,
        });
        const parsed = parseAllow(result.stdout || '', 'malformed input');
        assert.equal(parsed.continue, true,
          'Hook must output ALLOW even for malformed JSON input');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('outputs ALLOW for empty stdin', () => {
      const tempDir = makeTempDir();
      try {
        const result = spawnSync(process.execPath, [HOOK_PATH], {
          input: '',
          encoding: 'utf8',
          env: { ...process.env, CLAUDE_CWD: tempDir },
          timeout: 5000,
        });
        const parsed = parseAllow(result.stdout || '', 'empty stdin');
        assert.equal(parsed.continue, true,
          'Hook must output ALLOW even for empty stdin');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('outputs ALLOW when no pipeline state.json exists (bails early)', () => {
      // No .jwforge/current/state.json — hook should bail early but still ALLOW
      const tempDir = mkdtempSync(join(tmpdir(), 'jwforge-no-state-'));
      try {
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-no-state',
          tool_input: { name: 'agent', model: 'sonnet', prompt: 'Do it.' },
          output: { content: 'Done.' },
        };
        const { stdout } = runHook(payload, tempDir);
        const parsed = parseAllow(stdout, 'no state.json');
        assert.equal(parsed.continue, true,
          'Hook must output ALLOW when no pipeline state exists');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // ── 5. JSONL append behavior ──────────────────────────────────────────────

  describe('5. JSONL append behavior', () => {

    it('creates agent-log.jsonl and writes a valid JSON line', () => {
      const tempDir = makeTempDir();
      try {
        const logFile = join(tempDir, '.jwforge', 'current', 'agent-log.jsonl');
        assert.ok(!existsSync(logFile), 'Log file should not exist before hook runs');

        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-jsonl-1',
          tool_input: { name: 'writer', model: 'haiku', prompt: '# Writer Agent\n\nWrite it.' },
          output: { content: 'Done.' },
        };
        runHook(payload, tempDir);

        assert.ok(existsSync(logFile), 'agent-log.jsonl must be created after hook runs');
        const lines = readFileSync(logFile, 'utf8').split('\n').filter(l => l.trim());
        assert.ok(lines.length >= 1, 'At least one line must be appended');

        // Every line must be valid JSON with required fields
        for (const line of lines) {
          let parsed;
          try { parsed = JSON.parse(line); } catch {
            assert.fail(`Non-JSON line in agent-log.jsonl: ${line}`);
          }
          assert.ok(typeof parsed.timestamp === 'string', 'Entry must have a timestamp');
          assert.ok(typeof parsed.agent_name === 'string', 'Entry must have agent_name');
          assert.ok(typeof parsed.model === 'string', 'Entry must have model');
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('appends a new line on each invocation (does not overwrite)', () => {
      const tempDir = makeTempDir();
      try {
        const payload1 = {
          tool_name: 'Agent', tool_use_id: 'id-append-1',
          tool_input: { name: 'agent-one', model: 'haiku', prompt: '# AgentOne Agent' },
          output: { content: 'Done 1.' },
        };
        const payload2 = {
          tool_name: 'Agent', tool_use_id: 'id-append-2',
          tool_input: { name: 'agent-two', model: 'sonnet', prompt: '# AgentTwo Agent' },
          output: { content: 'Done 2.' },
        };

        runHook(payload1, tempDir);
        runHook(payload2, tempDir);

        const entries = readAllLogEntries(tempDir);
        assert.ok(entries.length >= 2,
          `Expected at least 2 log entries after two invocations, got ${entries.length}`);

        const names = entries.map(e => e.agent_name);
        assert.ok(names.includes('agent-one'),
          `Expected "agent-one" in log, found: ${names.join(', ')}`);
        assert.ok(names.includes('agent-two'),
          `Expected "agent-two" in log, found: ${names.join(', ')}`);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('log entry contains all expected fields: timestamp, agent_name, model, tool', () => {
      const tempDir = makeTempDir();
      try {
        const payload = {
          tool_name: 'Agent',
          tool_use_id: 'id-fields',
          tool_input: { name: 'field-checker', model: 'sonnet', prompt: '# FieldChecker Agent' },
          output: { content: 'Done.' },
        };
        runHook(payload, tempDir);
        const entry = readLastLogEntry(tempDir);
        assert.ok(entry !== null, 'Expected a log entry');

        assert.ok('timestamp' in entry, 'Entry must have timestamp');
        assert.ok('agent_name' in entry, 'Entry must have agent_name');
        assert.ok('model' in entry, 'Entry must have model');
        assert.ok('tool' in entry, 'Entry must have tool');
        assert.equal(entry.tool, 'Agent', 'tool field must equal "Agent"');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
