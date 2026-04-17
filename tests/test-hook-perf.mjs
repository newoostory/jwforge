/**
 * Unit-3: hook-fastpath-integration — integration + performance test
 *
 * Verifies that hooks/phase-guard.mjs:
 *   (a) exits with code 0 when invoked with no .jwforge/ present
 *   (b) emits the ALLOW constant (imported from hooks/lib/common.mjs) on stdout
 *   (c) total spawned-hook time is under 150 ms
 *   (d) shouldSkipHook() in-process per-call latency is under 5 ms (100-iteration average)
 *
 * Pre-implementation (TDD red state):
 *   The 11 hook files have not yet been modified to call shouldSkipHook() as their
 *   first statement. However, phase-guard.mjs already reaches ALLOW via Step 6
 *   ("no active pipeline") when .jwforge/ is absent, so (a) and (b) may pass even
 *   now. Assertion (c) is the key red-state discriminator: without the fast-path
 *   the hook runs the full readStdin() which has a 100 ms internal fastCheck timer
 *   before it can settle, meaning total spawn time will typically exceed 150 ms.
 *   The in-process (d) check exercises shouldSkipHook directly and should pass
 *   once Unit-2 is committed (which it is per depends_on contract).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { ALLOW, shouldSkipHook } from '../hooks/lib/common.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHASE_GUARD = new URL('../hooks/phase-guard.mjs', import.meta.url).pathname;

/**
 * Spawn hooks/phase-guard.mjs with cwd=dir, feed payload on stdin, collect results.
 * Returns { exitCode, stdout, stderr, elapsedMs }.
 */
function spawnHook(dir, payload) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(process.execPath, [PHASE_GUARD], {
      cwd: dir,
      env: { ...process.env, CLAUDE_CWD: dir },
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (c) => stdoutChunks.push(c));
    child.stderr.on('data', (c) => stderrChunks.push(c));

    child.on('close', (code) => {
      const elapsedMs = performance.now() - t0;
      resolve({
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        elapsedMs,
      });
    });

    // Write the payload and close stdin so readStdin() can settle immediately.
    child.stdin.end(JSON.stringify(payload));
  });
}

// ---------------------------------------------------------------------------
// Minimal PreToolUse payload
// ---------------------------------------------------------------------------

const MINIMAL_PAYLOAD = {
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: '/tmp/test-hook-perf-dummy.txt' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Unit-3: hook-fastpath-integration', () => {
  // (a) + (b) + (c): spawn phase-guard in a no-.jwforge tmpdir
  it('phase-guard exits 0 and emits ALLOW within 150 ms when .jwforge is absent', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'jwforge-perf-'));
    t.after(() => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    const result = await spawnHook(dir, MINIMAL_PAYLOAD);

    // (a) exit code 0
    assert.equal(
      result.exitCode,
      0,
      `Expected exit code 0, got ${result.exitCode}. stderr: ${result.stderr}`
    );

    // (b) stdout equals ALLOW constant (imported from hooks/lib/common.mjs)
    assert.equal(
      result.stdout.trim(),
      ALLOW,
      `Expected stdout to equal ALLOW constant (${ALLOW}), got: ${JSON.stringify(result.stdout)}. stderr: ${result.stderr}`
    );

    // (c) total spawn-to-close time under 150 ms
    assert.ok(
      result.elapsedMs < 150,
      `Expected spawn-to-close time < 150 ms (fast-path should skip pipeline), got ${result.elapsedMs.toFixed(1)} ms`
    );
  });

  // (d): in-process shouldSkipHook latency under 5 ms per call (100-iteration average, warmup first)
  it('shouldSkipHook per-call latency is under 5 ms (100-iteration average)', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'jwforge-skip-'));
    t.after(() => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    // Warmup call before timing to avoid cold-start inflation
    shouldSkipHook(dir);

    const ITERATIONS = 100;
    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      shouldSkipHook(dir);
    }
    const elapsed = performance.now() - t0;
    const perCallMs = elapsed / ITERATIONS;

    assert.ok(
      perCallMs < 5,
      `shouldSkipHook per-call latency must be < 5 ms; got ${perCallMs.toFixed(3)} ms average over ${ITERATIONS} iterations`
    );
  });
});
