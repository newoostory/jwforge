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

    // SelfDeep-specific state: show step progress
    if (pipeline === 'selfdeep' && state.steps) {
      lines.push(`- Run ID: ${state.run_id || '?'}`);
      lines.push(`- Sandbox: ${state.sandbox_path || '?'}`);
      lines.push(`- Step progress:`);
      for (const [stepName, stepStatus] of Object.entries(state.steps)) {
        lines.push(`  - ${stepName}: ${stepStatus}`);
      }
      // SelfDeep Loop mode state preservation
      if (state.loop && state.loop.enabled) {
        lines.push(`- Loop Mode: ACTIVE`);
        lines.push(`  - Termination: ${state.loop.termination_type} (${state.loop.termination_value || 'auto'})`);
        lines.push(`  - Current iteration: ${state.loop.current_iteration}`);
        lines.push(`  - Total improvements: ${state.loop.total_improvements}`);
        lines.push(`  - Zero-improvement streak: ${state.loop.zero_improvement_streak}`);
        lines.push(`  - Resume after: ${state.loop.resume_after || 'none'}`);
        lines.push(`  - Stopped reason: ${state.loop.stopped_reason || 'none'}`);
      }
    }

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

    // Check for key artifacts
    const artifacts = ['task-spec.md', 'architecture.md', 'agent-log.jsonl'];
    const existing = artifacts.filter(f => existsSync(join(stateDir, f)));
    if (existing.length > 0) {
      lines.push('', '## Available Artifacts');
      existing.forEach(f => lines.push(`- .jwforge/current/${f}`));
    }

    lines.push('', '## Resume Instructions');
    lines.push('Read .jwforge/current/state.json and resume from the current phase/step.');
    lines.push('Key files: task-spec.md (requirements), architecture.md (design), agent-log.jsonl (history).');
    if (state.loop && state.loop.enabled) {
      lines.push('Loop mode active. Resume from iteration ' + (state.loop.current_iteration || 0) + '. Check resume_after for cooldown timing.');
      lines.push('Iteration results stored in .jwforge/current/selfdeep-loops/');
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
