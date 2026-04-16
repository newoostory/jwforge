#!/usr/bin/env node

/**
 * JWForge Stop Hook (ESM)
 *
 * Fires on session end. Handles:
 * 1. Archive pipeline artifacts to .jwforge/archive/{timestamp}-{slug}/
 * 2. Record commit hash range in archive metadata
 * 3. Remove pipeline lock file (pipeline-required.json)
 * 4. Clean up transient files from current/
 *
 * Always returns { continue: true } -- stop hooks must never block.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { readStdin, getCwd, readState, JWFORGE_DIR, logHookError } from './lib/common.mjs';

// Pipeline artifact files worth archiving (excludes transient caches)
const ARTIFACT_FILES = [
  'state.json',
  'task-spec.md',
  'architecture.md',
  'interview-log.md',
  'agent-log.jsonl',
  'compact-snapshot.md',
  'review-phase1.md',
  'review-phase2.md',
  'verify-report.md',
  'test-report.md',
  'review-phase4.md',
  'tdd-state.json',
];

const TRANSIENT_FILES = ['.notify-cache.json'];

/**
 * Copy pipeline artifacts to a timestamped archive directory
 * and write .archive-meta.json with commit hash range.
 */
function archivePipeline(cwd, state) {
  const currentDir = join(cwd, JWFORGE_DIR, 'current');
  const archiveBase = join(cwd, JWFORGE_DIR, 'archive');

  // Deduplication: if an archive already exists for this pipeline run (same started_at), skip.
  if (state.started_at && existsSync(archiveBase)) {
    const alreadyArchived = readdirSync(archiveBase).some(dir => {
      const metaPath = join(archiveBase, dir, '.archive-meta.json');
      if (!existsSync(metaPath)) return false;
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
        return meta.started_at === state.started_at;
      } catch { return false; }
    });
    if (alreadyArchived) return;
  }

  const timestamp = new Date().toISOString().replace(/[T:.]/g, '-').slice(0, 19);
  const slug = (state.task || 'unknown').replace(/[^a-zA-Z0-9가-힣]/g, '-').slice(0, 50);
  const archiveName = `${timestamp}-${slug}`;
  const archiveDir = join(archiveBase, archiveName);

  mkdirSync(archiveDir, { recursive: true });

  // Copy artifacts individually (not cpSync) for compatibility
  for (const file of ARTIFACT_FILES) {
    const src = join(currentDir, file);
    if (existsSync(src)) {
      copyFileSync(src, join(archiveDir, file));
    }
  }

  // Determine commit hash range for this pipeline
  let commitRange = 'none';
  try {
    const prefix = '[forge]';
    const result = execSync(
      `git log --all --oneline --grep="${prefix}" --format="%H" 2>/dev/null`,
      { cwd, encoding: 'utf8', timeout: 5000 },
    ).trim();
    const hashes = result.split('\n').filter(Boolean);
    if (hashes.length > 0) {
      commitRange = hashes.length === 1
        ? hashes[0]
        : `${hashes[hashes.length - 1]}..${hashes[0]}`;
    }
  } catch {
    // git may not be available or no matching commits -- graceful fallback
  }

  // Write archive metadata
  const meta = {
    pipeline: state.pipeline || 'deep',
    task: state.task,
    archived_at: new Date().toISOString(),
    status: state.status,
    phase: state.phase,
    step: state.step,
    complexity: state.complexity,
    commit_range: commitRange,
    started_at: state.started_at,
  };
  writeFileSync(join(archiveDir, '.archive-meta.json'), JSON.stringify(meta, null, 2));
}

async function main() {
  try {
    const input = await readStdin();
    const cwd = getCwd();
    const state = readState(cwd);

    if (!state) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // 1. Archive before any cleanup (captures current state)
    archivePipeline(cwd, state);

    // Remember original status before mutation
    const wasInProgress = state.status === 'in_progress';

    // 2. Update state to stopped (only if still in progress)
    if (wasInProgress) {
      state.status = 'stopped';
      state.stopped_at = new Date().toISOString();
      state.stop_reason = 'session_end';
      writeFileSync(
        join(cwd, JWFORGE_DIR, 'current', 'state.json'),
        JSON.stringify(state, null, 2),
      );
    }

    // 3. Remove pipeline lock — but ONLY if the pipeline was NOT actively running.
    // When in_progress, we preserve the lock so the pipeline can resume cleanly.
    if (!wasInProgress) {
      const lockPath = join(cwd, JWFORGE_DIR, 'current', 'pipeline-required.json');
      if (existsSync(lockPath)) unlinkSync(lockPath);
    }

    // 4. Remove transient files from current/
    for (const f of TRANSIENT_FILES) {
      const p = join(cwd, JWFORGE_DIR, 'current', f);
      if (existsSync(p)) unlinkSync(p);
    }

    // 5. Clean up team directory — but ONLY if pipeline was NOT in_progress.
    // When the pipeline is actively running, deleting team dirs causes TeamCreate/
    // Agent spawn failures on resume. Teams are cleaned up when the pipeline
    // completes (status = "done") or on next explicit stop after resume.
    if (!wasInProgress) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (state.team_name && homeDir && /^[a-zA-Z0-9_-]+$/.test(state.team_name)) {
        const teamDir = join(homeDir, '.claude', 'teams', state.team_name);
        const taskDir = join(homeDir, '.claude', 'tasks', state.team_name);
        if (existsSync(teamDir)) rmSync(teamDir, { recursive: true, force: true });
        if (existsSync(taskDir)) rmSync(taskDir, { recursive: true, force: true });
      }
    }

    console.log(JSON.stringify({ continue: true }));
  } catch (e) {
    logHookError('on-stop', e);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
