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
import { join } from 'path';
import { readStdin, getCwd, readState, ALLOW, JWFORGE_DIR, logHookError } from './lib/common.mjs';

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    const cwd = getCwd();
    const logDir = join(cwd, JWFORGE_DIR, 'current');
    const logFile = join(logDir, 'agent-log.jsonl');

    // Only track if pipeline is active
    const state = readState(cwd);
    if (!state) {
      console.log(ALLOW);
      return;
    }

    // Ensure directory exists
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // PostToolUse receives: { tool_name, tool_use_id, tool_input, output }
    // tool_input: { prompt, model, name, description, ... } — the Agent tool's input parameters
    // output: { content, type } — the Agent's response text
    // tool_input takes priority over the legacy input field
    const toolInput = data.tool_input || data.input || {};
    const output = data.output || {};

    // Extract agent name: prefer tool_input.name, fallback to parsing prompt header
    let agentName = (toolInput.name && toolInput.name.trim()) ? toolInput.name.trim() : null;
    let agentModel = (toolInput.model && toolInput.model.trim()) ? toolInput.model.trim() : 'unknown';
    let agentDescription = toolInput.description || '';

    // If name is absent/empty, try extracting from prompt: look for "# AgentName Agent" at start
    if (!agentName) {
      const prompt = typeof toolInput.prompt === 'string' ? toolInput.prompt : '';
      const headerMatch = prompt.match(/^#\s+(\S+.*?)\s+Agent\b/im);
      if (headerMatch) {
        agentName = headerMatch[1].trim();
      } else {
        agentName = 'unnamed';
      }
    }

    const entry = {
      timestamp: new Date().toISOString(),
      agent_name: agentName,
      model: agentModel,
      description: agentDescription,
      status: data.status || 'completed',
      duration_ms: data.duration_ms || null,
      tool: data.tool_name || 'Agent',
      team_mode: state?.team_mode || 'unknown',
    };

    appendFileSync(logFile, JSON.stringify(entry) + '\n');

    console.log(ALLOW);
  } catch (e) {
    logHookError('subagent-tracker', e);
    console.log(ALLOW);
  }
}

main();
