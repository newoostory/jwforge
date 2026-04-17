import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const INSTALL_SH = '/home/newoostory/jwforge/install.sh';

/**
 * Spawn install.sh with the given args and env overrides.
 * Returns a Promise<{ code, stdout, stderr }>.
 */
function runInstall(args, { cwd, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'jw-scope-home-'));
    const mergedEnv = { ...process.env, HOME: fakeHome, ...env };
    const child = spawn('bash', [INSTALL_SH, ...args], {
      cwd: cwd ?? fakeHome,
      env: mergedEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`install.sh timed out. stdout=${stdout} stderr=${stderr}`));
    }, 10_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, fakeHome });
    });
    child.on('error', reject);
  });
}

describe('install.sh --dry-run scope (Unit-1 / SC1, SC2, SC3)', () => {

  it('explicit target: stdout names <tmp>/.claude/settings.json, not ~/.claude/', { timeout: 15_000 }, async () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'jw-target-'));
    const { code, stdout, fakeHome } = await runInstall([targetDir, '--dry-run']);

    // Must exit 0
    assert.equal(code, 0, `Non-zero exit. stdout=${stdout}`);

    // Must reference the target's .claude/settings.json
    const expectedPath = join(targetDir, '.claude', 'settings.json');
    assert.ok(
      stdout.includes(expectedPath),
      `Expected stdout to contain "${expectedPath}" but got:\n${stdout}`
    );

    // Must NOT contain ~/.claude/ or the expanded HOME/.claude/ path
    assert.ok(
      !stdout.includes('~/.claude/'),
      `stdout must not contain ~/.claude/: got:\n${stdout}`
    );
    const expandedGlobal = join(fakeHome, '.claude') + '/';
    assert.ok(
      !stdout.includes(expandedGlobal),
      `stdout must not contain expanded HOME path "${expandedGlobal}": got:\n${stdout}`
    );

    // dry-run must NOT create <tmp>/.claude/ inside the target
    assert.ok(
      !existsSync(join(targetDir, '.claude')),
      `dry-run must not create <targetDir>/.claude/ on the filesystem`
    );
  });

  it('no-args case: cwd=tmpdir, stdout names <cwd>/.claude/settings.json (SC2)', { timeout: 15_000 }, async () => {
    const cwdDir = mkdtempSync(join(tmpdir(), 'jw-noargs-'));
    const { code, stdout, fakeHome } = await runInstall(['--dry-run'], { cwd: cwdDir });

    assert.equal(code, 0, `Non-zero exit. stdout=${stdout}`);

    const expectedPath = join(cwdDir, '.claude', 'settings.json');
    assert.ok(
      stdout.includes(expectedPath),
      `Expected stdout to contain "${expectedPath}" but got:\n${stdout}`
    );

    assert.ok(
      !stdout.includes('~/.claude/'),
      `stdout must not contain ~/.claude/ in no-args mode: got:\n${stdout}`
    );
    const expandedGlobal = join(fakeHome, '.claude') + '/';
    assert.ok(
      !stdout.includes(expandedGlobal),
      `stdout must not contain expanded HOME path "${expandedGlobal}": got:\n${stdout}`
    );

    // dry-run must NOT create .claude/ inside cwd
    assert.ok(
      !existsSync(join(cwdDir, '.claude')),
      `dry-run must not create <cwd>/.claude/ on the filesystem`
    );
  });

  it('--global --dry-run: stdout contains side-effects list for ~/.claude/settings.json (SC3)', { timeout: 15_000 }, async () => {
    const cwdDir = mkdtempSync(join(tmpdir(), 'jw-global-dryrun-'));
    const { code, stdout } = await runInstall(['--global', '--dry-run'], { cwd: cwdDir });

    assert.equal(code, 0, `Non-zero exit for --global --dry-run. stdout=${stdout}`);

    // Must name the global settings path
    assert.ok(
      stdout.includes('.claude/settings.json'),
      `--global --dry-run stdout must mention .claude/settings.json: got:\n${stdout}`
    );

    // Must contain a side-effects list — at minimum the phrase describing what would be written
    // The architecture requires the side-effects list text to appear before the /dev/tty prompt.
    // We check for a few concrete pieces: the env vars and hook registration indication.
    const hasSideEffects = (
      stdout.includes('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS') ||
      stdout.includes('CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING') ||
      stdout.toLowerCase().includes('side-effect') ||
      stdout.includes('hooks') ||
      stdout.includes('[dry-run]')
    );
    assert.ok(
      hasSideEffects,
      `--global --dry-run stdout must list side-effects (env vars, hooks, or [dry-run] prefix): got:\n${stdout}`
    );
  });

});
