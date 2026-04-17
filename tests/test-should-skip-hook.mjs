/**
 * Tests for shouldSkipHook() — Unit-2 (hook-fastpath-helper)
 *
 * Interface contract (hooks/lib/common.mjs):
 *   export function shouldSkipHook(cwd: string): boolean
 *   - returns true  when .jwforge/ does NOT exist under cwd
 *   - returns false when .jwforge/ exists under cwd
 *   - returns false on any FS error (fail-closed)
 *   - never throws; no console output; no process.exit
 *   - must complete under 5 ms per call on a warm filesystem
 *
 * These tests are expected to FAIL with TypeError "shouldSkipHook is not a
 * function" until Unit-2 adds the export to hooks/lib/common.mjs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

import { shouldSkipHook } from '../hooks/lib/common.mjs';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a fresh temporary directory and registers cleanup via t.after().
 * @param {import('node:test').TestContext} t
 * @returns {string} Absolute path to the new tmpdir.
 */
function makeTmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jwforge-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('shouldSkipHook', () => {

  // (a) Returns true when .jwforge/ does NOT exist
  it('returns true for a tmpdir with no .jwforge/ directory', (t) => {
    const dir = makeTmpDir(t);
    const result = shouldSkipHook(dir);
    assert.strictEqual(result, true,
      'should return true (skip hook) when .jwforge/ is absent');
  });

  // (b) Returns false when .jwforge/ exists
  it('returns false for a tmpdir that contains .jwforge/ directory', (t) => {
    const dir = makeTmpDir(t);
    mkdirSync(join(dir, '.jwforge'), { recursive: true });
    const result = shouldSkipHook(dir);
    assert.strictEqual(result, false,
      'should return false (run hook) when .jwforge/ exists');
  });

  // (c) Fail-closed: returns false for a bogus/unreadable path
  it('returns false (fail-closed) for a nonexistent path', () => {
    const result = shouldSkipHook('/nonexistent/path/that/does/not/exist');
    assert.strictEqual(result, false,
      'should return false (fail-closed) when given an invalid/unreadable path');
  });

  // (d) Does not throw on invalid input
  it('never throws even with invalid input', () => {
    assert.doesNotThrow(() => shouldSkipHook('/nonexistent/path/that/does/not/exist'));
    assert.doesNotThrow(() => shouldSkipHook(''));
    assert.doesNotThrow(() => shouldSkipHook(null));
    assert.doesNotThrow(() => shouldSkipHook(undefined));
  });

  // (e) Per-call latency under 5 ms (averaged over 100 calls against a non-JWForge cwd)
  it('completes under 5 ms per call on a warm filesystem (100-call average)', (t) => {
    const dir = makeTmpDir(t);

    // Warmup call — excluded from measurement to avoid first-iteration cold-start
    shouldSkipHook(dir);

    const ITERATIONS = 100;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      shouldSkipHook(dir);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / ITERATIONS;

    assert.ok(
      avgMs < 5,
      `Per-call average ${avgMs.toFixed(3)} ms exceeds 5 ms budget (total ${elapsed.toFixed(1)} ms over ${ITERATIONS} calls)`
    );
  });

});
