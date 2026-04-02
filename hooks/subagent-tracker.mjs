#!/usr/bin/env node

/**
 * JWForge Subagent Tracker (PostToolUse hook for Agent)
 *
 * Tracks spawned agents for:
 * 1. Pipeline progress visibility (which agents ran, status)
 * 2. Cost awareness (model tier used per agent)
 * 3. Failure detection (log failed agents for retry logic)
 *
 * Writes tracking data to .jwforge/current/agent-log.jsonl
 * Inspired by OMC's subagent-tracker.mjs
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

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
    const raw = await readStdin();
    if (!raw.trim()) { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    const cwd = process.env.CLAUDE_CWD || process.cwd();
    const logDir = join(cwd, '.jwforge', 'current');
    const logFile = join(logDir, 'agent-log.jsonl');

    // Only track if pipeline is active
    const stateFile = join(logDir, 'state.json');
    if (!existsSync(stateFile)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Ensure directory exists
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const entry = {
      timestamp: new Date().toISOString(),
      agent_name: data.name || data.agent_name || 'unnamed',
      model: data.model || 'unknown',
      description: data.description || '',
      status: data.status || data.result?.status || 'completed',
      duration_ms: data.duration_ms || null,
      tool: 'Agent',
    };

    appendFileSync(logFile, JSON.stringify(entry) + '\n');

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
