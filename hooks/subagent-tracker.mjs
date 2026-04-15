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

    // PostToolUse receives: { tool_name, tool_use_id, input, output }
    // input: { prompt, model, name, description, ... } — the Agent tool's input parameters
    // output: { content, type } — the Agent's response text
    const input = data.input || {};
    const output = data.output || {};

    // Extract agent name: prefer input.name, fallback to scanning output for report header
    let agentName = input.name || 'unnamed';
    let agentModel = input.model || 'unknown';
    let agentDescription = input.description || '';

    // If input fields are missing, try to extract from output content
    if (agentName === 'unnamed' && output.content) {
      const contentText = Array.isArray(output.content)
        ? output.content.map(c => c.text || '').join(' ')
        : (typeof output.content === 'string' ? output.content : '');
      // Match report headers like "## Executor Report: Task-1 - feature name"
      const reportMatch = contentText.match(/##\s+(\w+)\s+Report/i);
      if (reportMatch) {
        agentName = reportMatch[1].toLowerCase();
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

    // Also detect team-related events in the data
    const toolName = data.tool_name || '';
    if (['TeamCreate', 'TeamDelete', 'SendMessage'].includes(toolName)) {
      const teamEntry = {
        timestamp: new Date().toISOString(),
        agent_name: 'team-event',
        model: 'system',
        description: `${toolName}: ${JSON.stringify(data.tool_input || {}).substring(0, 200)}`,
        status: data.status || 'completed',
        duration_ms: data.duration_ms || null,
        tool: toolName,
        team_mode: state?.team_mode || 'unknown'
      };
      appendFileSync(logFile, JSON.stringify(teamEntry) + '\n');
    }

    console.log(ALLOW);
  } catch (e) {
    logHookError('subagent-tracker', e);
    console.log(ALLOW);
  }
}

main();
