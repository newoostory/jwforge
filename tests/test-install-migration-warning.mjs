import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const INSTALL_SH = '/home/newoostory/jwforge/install.sh';
const MIGRATION_WARNING = 'WARNING: JWForge previously installed globally';

/**
 * Create a fake HOME directory structure with ~/.claude/settings.json
 * containing the given hooks array.
 */
function createFakeHome(hooks) {
  const fakeHome = mkdtempSync(join(tmpdir(), 'jw-migration-home-'));
  const claudeDir = join(fakeHome, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const settings = { hooks };
  writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2));
  return fakeHome;
}

/**
 * Spawn install.sh --dry-run against a fresh target tmpdir, with HOME overridden
 * to fakeHome. Returns Promise<{ code, stdout, stderr }>.
 */
function runInstallWithFakeHome(fakeHome) {
  return new Promise((resolve, reject) => {
    const targetDir = mkdtempSync(join(tmpdir(), 'jw-migration-target-'));
    const child = spawn('bash', [INSTALL_SH, targetDir, '--dry-run'], {
      cwd: targetDir,
      env: { ...process.env, HOME: fakeHome },
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
      resolve({ code, stdout, stderr });
    });
    child.on('error', reject);
  });
}

describe('install.sh migration warning (Unit-1 / SC8 / DD3)', () => {

  it('prints migration warning when fake HOME has a jwforge hook entry', { timeout: 15_000 }, async () => {
    // Seed the fake HOME with a settings.json that has a JWForge hook entry.
    // The architecture defines a JWForge hook entry as: command string containing 'jwforge/hooks/'.
    const fakeHome = createFakeHome([
      {
        // JWForge hook — command contains 'jwforge/hooks/'
        matcher: { type: 'always' },
        hooks: [
          {
            type: 'exec',
            command: '/home/user/.claude/jwforge/hooks/phase-guard.mjs',
          },
        ],
      },
      {
        // Unrelated hook (must remain after uninstall — but for install detection, just present)
        matcher: { type: 'always' },
        hooks: [
          {
            type: 'exec',
            command: '/usr/local/bin/some-other-hook.mjs',
          },
        ],
      },
    ]);

    const { code, stdout, stderr } = await runInstallWithFakeHome(fakeHome);

    // install.sh should still exit 0 (warning is non-fatal)
    assert.equal(code, 0, `Expected exit 0. stdout=${stdout} stderr=${stderr}`);

    // Must contain the exact warning substring defined in architecture DD3
    assert.ok(
      stdout.includes(MIGRATION_WARNING),
      `Expected stdout to contain exact warning:\n  "${MIGRATION_WARNING}"\nGot:\n${stdout}`
    );
  });

  it('does NOT print migration warning when fake HOME has no jwforge hook entries', { timeout: 15_000 }, async () => {
    // Seed the fake HOME with a settings.json that has ONLY unrelated hook entries.
    const fakeHome = createFakeHome([
      {
        matcher: { type: 'always' },
        hooks: [
          {
            type: 'exec',
            command: '/usr/local/bin/some-other-hook.mjs',
          },
        ],
      },
    ]);

    const { code, stdout, stderr } = await runInstallWithFakeHome(fakeHome);

    assert.equal(code, 0, `Expected exit 0. stdout=${stdout} stderr=${stderr}`);

    assert.ok(
      !stdout.includes(MIGRATION_WARNING),
      `stdout must NOT contain the migration warning when no jwforge hooks are installed globally.\nGot:\n${stdout}`
    );
  });

  it('does NOT print migration warning when fake HOME has no .claude/settings.json at all', { timeout: 15_000 }, async () => {
    // Fake HOME with no .claude directory — a completely fresh environment.
    const fakeHome = mkdtempSync(join(tmpdir(), 'jw-migration-fresh-'));

    const { code, stdout, stderr } = await runInstallWithFakeHome(fakeHome);

    assert.equal(code, 0, `Expected exit 0. stdout=${stdout} stderr=${stderr}`);

    assert.ok(
      !stdout.includes(MIGRATION_WARNING),
      `stdout must NOT contain the migration warning on a fresh system.\nGot:\n${stdout}`
    );
  });

});
