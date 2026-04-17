import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const UNINSTALL_SH = '/home/newoostory/jwforge/uninstall.sh';

/**
 * Seed a project tmpdir:
 *   <dir>/.claude/settings.json  — one JWForge hook entry + one unrelated hook entry
 *                                 + two JWForge env vars + one unrelated env var
 *   <dir>/.claude/jwforge/       — directory with a dummy file
 * Returns the path to the seeded settings.json.
 */
function seedProjectDir(dir) {
  const claudeDir = join(dir, '.claude');
  const jwforgeDir = join(claudeDir, 'jwforge');
  mkdirSync(jwforgeDir, { recursive: true });
  writeFileSync(join(jwforgeDir, 'dummy.txt'), 'runtime artifact');

  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Edit',
          command: '/home/newoostory/jwforge/hooks/phase-guard.mjs',
        },
        {
          matcher: 'Bash',
          command: '/usr/local/bin/my-other-hook.sh',
        },
      ],
    },
    env: {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING: '1',
      MY_UNRELATED_VAR: 'keep-me',
    },
  };

  const settingsPath = join(claudeDir, 'settings.json');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return settingsPath;
}

/**
 * Seed a fake HOME directory with a ~/.claude/settings.json that itself
 * contains JWForge hook entries and env vars.  This ensures that the
 * current (un-rewritten) uninstall.sh — which defaults to global mode and
 * operates on $HOME/.claude/ — will visibly mutate the fake home and cause
 * SC6 to fail.
 */
function seedFakeHome(dir) {
  const claudeDir = join(dir, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Edit',
          command: '/home/newoostory/jwforge/hooks/phase-guard.mjs',
        },
      ],
    },
    env: {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING: '1',
      MY_HOME_UNRELATED_VAR: 'keep-me-too',
    },
  };

  const settingsPath = join(claudeDir, 'settings.json');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return settingsPath;
}

/**
 * Run uninstall.sh with the given positional args and HOME override.
 * Returns Promise<{ code, stdout, stderr }>.
 */
function runUninstall(args, { homeDir } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (homeDir != null) env.HOME = homeDir;

    const child = spawn('bash', [UNINSTALL_SH, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`uninstall.sh timed out.\nstdout=${stdout}\nstderr=${stderr}`));
    }, 12_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', reject);
  });
}

describe('uninstall.sh scope-aware removal (Unit-4 / R6, SC6)', () => {

  it('surgical removal: JWForge hook gone, unrelated hook intact; JWForge env vars gone, unrelated var intact', { timeout: 20_000 }, async (t) => {
    const projectDir = mkdtempSync(join(tmpdir(), 'jw-uninstall-proj-'));
    const fakeHome = mkdtempSync(join(tmpdir(), 'jw-uninstall-home-'));

    t.after(() => {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(fakeHome, { recursive: true, force: true });
    });

    const settingsPath = seedProjectDir(projectDir);
    seedFakeHome(fakeHome);

    const { code, stdout, stderr } = await runUninstall([projectDir], { homeDir: fakeHome });

    assert.equal(
      code,
      0,
      `uninstall.sh exited ${code}.\nstdout=${stdout}\nstderr=${stderr}`
    );

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const hooks = settings.hooks ?? {};
    const allHooks = Object.values(hooks).flat();

    // JWForge hook entry must be gone
    const jwforgeHook = allHooks.find(
      (h) => h.command && h.command.includes('jwforge/hooks/')
    );
    assert.equal(
      jwforgeHook,
      undefined,
      `JWForge hook entry must be removed; found: ${JSON.stringify(jwforgeHook)}`
    );

    // Unrelated hook entry must remain
    const unrelatedHook = allHooks.find(
      (h) => h.command && h.command.includes('my-other-hook.sh')
    );
    assert.ok(
      unrelatedHook != null,
      `Unrelated hook entry must remain in settings.json`
    );

    // Two JWForge env vars must be removed
    const env = settings.env ?? {};
    assert.equal(
      env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS,
      undefined,
      'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS must be removed from env block'
    );
    assert.equal(
      env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING,
      undefined,
      'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING must be removed from env block'
    );

    // Unrelated env var must remain
    assert.equal(
      env.MY_UNRELATED_VAR,
      'keep-me',
      'MY_UNRELATED_VAR must remain in env block'
    );
  });

  it('removes <target>/.claude/jwforge/ directory', { timeout: 20_000 }, async (t) => {
    const projectDir = mkdtempSync(join(tmpdir(), 'jw-uninstall-dir-'));
    const fakeHome = mkdtempSync(join(tmpdir(), 'jw-uninstall-home2-'));

    t.after(() => {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(fakeHome, { recursive: true, force: true });
    });

    seedProjectDir(projectDir);
    seedFakeHome(fakeHome);

    const jwforgeDirPath = join(projectDir, '.claude', 'jwforge');
    // Confirm it was seeded
    assert.ok(existsSync(jwforgeDirPath), 'Precondition: jwforge dir must exist before uninstall');

    const { code, stdout, stderr } = await runUninstall([projectDir], { homeDir: fakeHome });
    assert.equal(code, 0, `uninstall.sh exited ${code}.\nstdout=${stdout}\nstderr=${stderr}`);

    assert.ok(
      !existsSync(jwforgeDirPath),
      `<target>/.claude/jwforge/ must be removed after uninstall`
    );
  });

  it('SC6: fake HOME ~/.claude/settings.json is byte-identical before and after project uninstall', { timeout: 20_000 }, async (t) => {
    const projectDir = mkdtempSync(join(tmpdir(), 'jw-uninstall-sc6-'));
    const fakeHome = mkdtempSync(join(tmpdir(), 'jw-uninstall-sc6-home-'));

    t.after(() => {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(fakeHome, { recursive: true, force: true });
    });

    seedProjectDir(projectDir);
    const homeSettingsPath = seedFakeHome(fakeHome);

    // Capture byte-exact content before
    const before = readFileSync(homeSettingsPath);

    const { code, stdout, stderr } = await runUninstall([projectDir], { homeDir: fakeHome });
    assert.equal(code, 0, `uninstall.sh exited ${code}.\nstdout=${stdout}\nstderr=${stderr}`);

    // Capture byte-exact content after
    const after = readFileSync(homeSettingsPath);

    assert.deepEqual(
      after,
      before,
      `HOME ~/.claude/settings.json must be byte-identical after project-scoped uninstall.\nBefore: ${before.toString()}\nAfter:  ${after.toString()}`
    );
  });

  it('idempotency: second run exits 0 and leaves filesystem unchanged', { timeout: 30_000 }, async (t) => {
    const projectDir = mkdtempSync(join(tmpdir(), 'jw-uninstall-idem-'));
    const fakeHome = mkdtempSync(join(tmpdir(), 'jw-uninstall-idem-home-'));

    t.after(() => {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(fakeHome, { recursive: true, force: true });
    });

    const settingsPath = seedProjectDir(projectDir);
    seedFakeHome(fakeHome);

    // Run 1
    const run1 = await runUninstall([projectDir], { homeDir: fakeHome });
    assert.equal(run1.code, 0, `Run 1 failed.\nstdout=${run1.stdout}\nstderr=${run1.stderr}`);

    // Snapshot state after run 1
    const settingsAfterRun1 = readFileSync(settingsPath, 'utf8');
    const jwforgeDirGone = !existsSync(join(projectDir, '.claude', 'jwforge'));

    // Run 2
    const run2 = await runUninstall([projectDir], { homeDir: fakeHome });
    assert.equal(run2.code, 0, `Run 2 (idempotency) failed.\nstdout=${run2.stdout}\nstderr=${run2.stderr}`);

    // settings.json must be identical to post-run-1 state
    const settingsAfterRun2 = readFileSync(settingsPath, 'utf8');
    assert.equal(
      settingsAfterRun2,
      settingsAfterRun1,
      'settings.json must be unchanged between run 1 and run 2'
    );

    // jwforge dir must still be absent after run 2
    assert.ok(
      !existsSync(join(projectDir, '.claude', 'jwforge')),
      '<target>/.claude/jwforge/ must remain absent after second run'
    );

    // Confirm what was already asserted for run1 also holds after run2
    assert.equal(jwforgeDirGone, true, 'Precondition: jwforge dir was removed by run 1');
  });

});
