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

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; process.stdin.removeAllListeners(); resolve(Buffer.concat(chunks).toString('utf-8')); }
    }, 2000);
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); } });
    process.stdin.on('error', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(''); } });
    if (process.stdin.readableEnded) { if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); } }
  });
}

async function main() {
  try {
    await readStdin(); // consume stdin

    const cwd = process.env.CLAUDE_CWD || process.cwd();
    const stateDir = join(cwd, '.jwforge', 'current');
    const stateFile = join(stateDir, 'state.json');

    if (!existsSync(stateFile)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const state = JSON.parse(readFileSync(stateFile, 'utf8'));

    // Build compact snapshot
    const pipeline = state.pipeline || 'deep';
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

    // Add phase-specific info
    if (state.phase3 && state.phase3.completed_levels) {
      lines.push(`- Completed levels: ${JSON.stringify(state.phase3.completed_levels)}`);
      lines.push(`- Current level: ${state.phase3.current_level || 0}`);
    }

    if (state.phase4) {
      lines.push(`- Fix loop count: ${state.phase4.fix_loop_count || 0}`);
      lines.push(`- Review count: ${state.phase4.review_count || 0}`);
    }

    // Add deeptk-specific state info
    if (state.pipeline === 'deeptk' && state.phase1 && state.phase1.interview_round) {
      lines.push(`- Interview rounds: ${state.phase1.interview_round}`);
      lines.push(`- Researcher validated: ${state.phase1.researcher_validated || false}`);
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
    if (state.pipeline === 'deeptk') {
      lines.push('deeptk: interview-log.md (Q&A history for Phase 1 resume).');
    }
    const snapshotFile = join(stateDir, 'compact-snapshot.md');
    writeFileSync(snapshotFile, lines.join('\n'));

    // Inject reminder into conversation
    console.log(JSON.stringify({
      continue: true,
      message: `[JWForge] Context compaction detected. Pipeline state saved to .jwforge/current/compact-snapshot.md. After compaction, read this file to restore context.`
    }));
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
