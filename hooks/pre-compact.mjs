#!/usr/bin/env node

/**
 * JWForge Pre-Compact Hook
 *
 * When Claude's context window is about to be compacted, save critical
 * pipeline state so it survives the compression.
 *
 * Writes a summary of current progress to .jwforge/current/compact-snapshot.md
 * which can be re-read after compaction to restore context.
 *
 * Note: Claude Code v2.1.76+ also exposes a PostCompact event, but PreCompact
 * is the correct hook for this use case — the snapshot must be written BEFORE
 * compaction so the injected message can reference it. PostCompact could be
 * used for a complementary "re-read snapshot" injection if needed.
 *
 * Inspired by OMC's pre-compact.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { readStdin, getCwd, readState, ALLOW, ALLOW_MSG, JWFORGE_DIR, logHookError } from './lib/common.mjs';

async function main() {
  try {
    await readStdin(); // consume stdin

    const cwd = getCwd();
    const stateDir = join(cwd, JWFORGE_DIR, 'current');

    const state = readState(cwd);
    if (!state) {
      console.log(ALLOW);
      return;
    }

    // Build compact snapshot
    const pipeline = state.pipeline || 'forge';
    const lines = [
      '# JWForge Context Snapshot',
      `> Auto-saved at ${new Date().toISOString()} before context compaction`,
      '',
      `## Pipeline State`,
      `- Pipeline: ${pipeline}`,
      `- Task: ${state.task || 'unknown'}`,
      `- Phase: ${state.phase || '?'}`,
      `- Step: ${state.step || '?'}`,
      `- Complexity: ${state.complexity || '?'}`,
      `- Type: ${state.type || '?'}`,
      `- Status: ${state.status || '?'}`,
    ];

    if (state.team_name) {
      lines.push(`- Team: ${state.team_name}`);
    }
    lines.push(`- Team mode: ${state.team_mode || 'subagent_only'}`);

    // Add phase-specific info
    if (state.phase3) {
      lines.push(`- Running units: ${JSON.stringify(state.phase3.running_units || [])}`);
      lines.push(`- Total units: ${state.phase3.total_units || 0}`);
      lines.push(`- Completed units: ${JSON.stringify(state.phase3.completed_units || [])}`);
    }

    if (state.phase4) {
      lines.push(`- Fix loop count: ${state.phase4.fix_loop_count || 0}`);
      lines.push(`- Review count: ${state.phase4.review_count || 0}`);
    }

    // Check for key artifacts
    const artifacts = ['task-spec.md', 'architecture.md', 'agent-log.jsonl', 'interview-log.md'];
    const existing = artifacts.filter(f => existsSync(join(stateDir, f)));
    if (existing.length > 0) {
      lines.push('', '## Available Artifacts');
      existing.forEach(f => lines.push(`- .jwforge/current/${f}`));
    }

    lines.push('', '## Resume Instructions');
    lines.push('Read .jwforge/current/state.json and resume from the current phase/step.');
    lines.push('Key files: task-spec.md (requirements), architecture.md (design), agent-log.jsonl (history).');
    const snapshotFile = join(stateDir, 'compact-snapshot.md');
    writeFileSync(snapshotFile, lines.join('\n'));

    // Inject reminder into conversation
    console.log(ALLOW_MSG(`[JWForge] Context compaction detected. Pipeline state saved to .jwforge/current/compact-snapshot.md. After compaction, read this file to restore context.`));
  } catch (e) {
    logHookError('pre-compact', e);
    console.log(ALLOW);
  }
}

main();
