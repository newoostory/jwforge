#!/usr/bin/env node

/**
 * JWForge Lifecycle Hook (PreCompact + Stop)
 *
 * Single file handling two lifecycle events via process.argv[2] mode selector:
 *   - "compact": PreCompact — writes compact-snapshot.md with state summary + resume instructions
 *   - "stop":    Stop — archives pipeline to .jwforge/archive/, sets status to "stopped"
 *
 * Registered in settings.json as two separate hook entries:
 *   ["node", "/path/to/lifecycle.mjs", "compact"]  (PreCompact)
 *   ["node", "/path/to/lifecycle.mjs", "stop"]      (Stop)
 *
 * Import from './lib/core.mjs'.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  readStdin,
  getCwd,
  readState,
  ALLOW,
  ALLOW_MSG,
  JWFORGE_DIR,
  logHookError,
} from './lib/core.mjs';

// --- Artifact files worth archiving ---

const ARCHIVE_ARTIFACTS = [
  'state.json',
  'task-spec.md',
  'architecture.md',
  'agent-log.jsonl',
  'compact-snapshot.md',
];

// --- Transient files to clean up ---

const TRANSIENT_FILES = [
  '.notify-cache.json',
];

// ============================================================
// COMPACT MODE — PreCompact hook
// ============================================================

async function handleCompact() {
  try {
    await readStdin(); // consume stdin to avoid pipe issues

    const cwd = getCwd();
    const stateDir = join(cwd, JWFORGE_DIR, 'current');
    const state = readState(cwd);

    if (!state) {
      console.log(ALLOW);
      return;
    }

    // Build snapshot content following templates/compact-snapshot.md structure
    const now = new Date().toISOString();
    const pipeline = state.pipeline || 'forge';
    const mode = state.mode || 'default';
    const task = state.task || 'unknown';
    const phase = state.phase || '?';
    const step = state.step || '?';
    const complexity = state.complexity || '?';

    // Gather progress info
    const completedLevels = [];
    const currentLevel = state.current_level ?? 0;
    const fixLoopCount = state.fix_loop_count ?? 0;

    // Check for existing artifacts
    const possibleArtifacts = [
      'state.json',
      'task-spec.md',
      'architecture.md',
      'agent-log.jsonl',
    ];
    const existingArtifacts = possibleArtifacts.filter(
      f => existsSync(join(stateDir, f))
    );

    // Build resume note based on current phase/step
    let resumeNote = `Resume from phase ${phase}, step ${step}.`;
    if (phase === 1 && step === '1-3') {
      resumeNote = 'Was in interview phase — treat new user message as interview answers.';
    } else if (phase === 3) {
      const lvl = currentLevel;
      resumeNote = `Level ${lvl} execution ${completedLevels.includes(lvl) ? 'completed' : 'in progress'}; resume Phase 3 build loop.`;
    } else if (phase === 4) {
      resumeNote = `Fix loop iteration ${fixLoopCount}; resume Phase 4 verification loop.`;
    }

    // Assemble snapshot markdown
    const lines = [
      `# Compact Snapshot: ${task}`,
      '',
      '<!-- Written by lifecycle.mjs PreCompact hook. Read by Conductor after context compaction. -->',
      '<!-- state.json is authoritative. This snapshot provides human-readable resume context. -->',
      '',
      '## Pipeline State',
      `- pipeline: ${pipeline}${mode !== 'default' ? ' (' + mode + ')' : ''}`,
      `- task: ${task}`,
      `- phase: ${phase}`,
      `- step: ${step}`,
      `- complexity: ${complexity}`,
      '- status: in_progress',
      '',
      '## Progress',
      `- completed_levels: [${completedLevels.join(', ')}]`,
      `- current_level: ${currentLevel}`,
      `- fix_loop_count: ${fixLoopCount}`,
      '',
      '## Available Artifacts',
    ];

    for (const f of existingArtifacts) {
      lines.push(`- .jwforge/current/${f}`);
    }

    lines.push(
      '',
      '## Resume Instructions',
      '',
      '1. Read `.jwforge/current/state.json` — confirm phase, step, and status.',
      '2. Read `.jwforge/current/task-spec.md` — restore task understanding.',
      '3. Read `.jwforge/current/architecture.md` — restore task list and contracts.',
      `4. Resume at phase **${phase}**, step **${step}**.`,
      `5. ${resumeNote}`,
    );

    const snapshotContent = lines.join('\n') + '\n';
    const snapshotFile = join(stateDir, 'compact-snapshot.md');

    mkdirSync(stateDir, { recursive: true });
    writeFileSync(snapshotFile, snapshotContent);

    console.log(ALLOW_MSG('[JWForge] Context compaction detected. Pipeline state saved to .jwforge/current/compact-snapshot.md. After compaction, read this file to restore context.'));
  } catch (e) {
    logHookError('lifecycle-compact', e);
    console.log(ALLOW);
  }
}

// ============================================================
// STOP MODE — Stop hook
// ============================================================

/**
 * Archive pipeline artifacts to .jwforge/archive/{timestamp}-{slug}/.
 * Writes .archive-meta.json with pipeline metadata.
 */
function archivePipeline(cwd, state) {
  const currentDir = join(cwd, JWFORGE_DIR, 'current');
  const archiveBase = join(cwd, JWFORGE_DIR, 'archive');
  const timestamp = new Date().toISOString().replace(/[T:.]/g, '-').slice(0, 19);
  const slug = (state.task || state.task_slug || 'unknown')
    .replace(/[^a-zA-Z0-9가-힣]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
  const archiveName = `${timestamp}-${slug}`;
  const archiveDir = join(archiveBase, archiveName);

  mkdirSync(archiveDir, { recursive: true });

  // Copy each artifact individually
  for (const file of ARCHIVE_ARTIFACTS) {
    const src = join(currentDir, file);
    if (existsSync(src)) {
      try {
        copyFileSync(src, join(archiveDir, file));
      } catch {
        // Non-critical — continue with other artifacts
      }
    }
  }

  // Write archive metadata
  const meta = {
    pipeline: state.pipeline || 'forge',
    task: state.task,
    archived_at: new Date().toISOString(),
    status: state.status,
    phase: state.phase,
    step: state.step,
    complexity: state.complexity,
    started_at: state.started_at,
  };
  try {
    writeFileSync(join(archiveDir, '.archive-meta.json'), JSON.stringify(meta, null, 2));
  } catch {
    // Non-critical
  }

  return archiveDir;
}

async function handleStop() {
  try {
    await readStdin(); // consume stdin

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

    // 2. Update state to stopped (only if still in_progress)
    if (wasInProgress) {
      state.status = 'stopped';
      state.stopped_at = new Date().toISOString();
      state.stop_reason = 'session_end';
      try {
        writeFileSync(
          join(cwd, JWFORGE_DIR, 'current', 'state.json'),
          JSON.stringify(state, null, 2),
        );
      } catch {
        // Non-critical — state will be stale but pipeline can recover
      }
    }

    // 3. Pipeline lock handling:
    //    - If was in_progress: PRESERVE lock so pipeline can resume cleanly
    //    - If was not in_progress (done/stopped/error): remove lock
    if (!wasInProgress) {
      const lockPath = join(cwd, JWFORGE_DIR, 'current', 'pipeline-required.json');
      if (existsSync(lockPath)) {
        try { unlinkSync(lockPath); } catch { /* ignore */ }
      }
    }

    // 4. Remove transient files from current/
    const currentDir = join(cwd, JWFORGE_DIR, 'current');
    for (const f of TRANSIENT_FILES) {
      const p = join(currentDir, f);
      if (existsSync(p)) {
        try { unlinkSync(p); } catch { /* ignore */ }
      }
    }

    console.log(JSON.stringify({ continue: true }));
  } catch (e) {
    logHookError('lifecycle-stop', e);
    console.log(JSON.stringify({ continue: true }));
  }
}

// ============================================================
// MODE SELECTOR
// ============================================================

const mode = process.argv[2];

if (mode === 'compact') {
  handleCompact();
} else if (mode === 'stop') {
  handleStop();
} else {
  // Unknown mode — fail open silently
  console.log(JSON.stringify({ continue: true }));
}
