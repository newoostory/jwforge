#!/usr/bin/env node

/**
 * JWForge Pre-Tool Guard (PreToolUse hook for Edit/Write)
 *
 * HARD ENFORCEMENT of pipeline phases:
 * 0. Pipeline lock check → if pipeline-required.json exists but state.json doesn't,
 *    BLOCK everything (AI is trying to skip the pipeline protocol)
 * 1. /deep Phase 1-2 active → BLOCK all Edit/Write to project files (design not done yet)
 * 2. /deep Phase 3 active → BLOCK edits to files NOT in architecture.md
 * 3. /surface active, type=bug-fix, no root_cause in state → BLOCK (investigate first)
 * 4. Always: BLOCK writes to sensitive files
 *
 * Allowed always: .jwforge/**, state.json, task-spec.md, architecture.md (pipeline artifacts)
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';

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

const SENSITIVE_PATTERNS = [
  /\.env$/i, /\.env\.\w+$/i, /credentials\.json$/i,
  /secrets?\.\w+$/i, /\.pem$/i, /\.key$/i, /id_rsa/i, /\.aws\/credentials/i,
];

// Files that are always writable (pipeline artifacts)
function isPipelineArtifact(filePath, cwd) {
  const normalized = filePath.replace(/\\/g, '/');
  const jwforgeDir = join(cwd, '.jwforge').replace(/\\/g, '/');
  return normalized.startsWith(jwforgeDir) ||
         normalized.includes('.jwforge/') ||
         basename(normalized) === 'state.json' ||
         basename(normalized) === 'task-spec.md' ||
         basename(normalized) === 'architecture.md' ||
         basename(normalized) === 'compact-snapshot.md' ||
         basename(normalized) === 'agent-log.jsonl';
}

function readState(cwd) {
  const stateFile = join(cwd, '.jwforge', 'current', 'state.json');
  if (!existsSync(stateFile)) return null;
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; }
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    const filePath = data.file_path || data.filePath || data.input?.file_path || '';
    if (!filePath) { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    const fileName = basename(filePath);
    const cwd = process.env.CLAUDE_CWD || process.cwd();

    // === RULE 0: Always block sensitive files ===
    if (SENSITIVE_PATTERNS.some(p => p.test(filePath) || p.test(fileName))) {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `[JWForge Guard] BLOCKED: write to sensitive file "${fileName}". Remove guard manually if intentional.`
      }));
      return;
    }

    // === Pipeline artifacts are always writable ===
    if (isPipelineArtifact(filePath, cwd)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // === RULE 0: Pipeline lock check ===
    // If pipeline-required.json exists but state.json doesn't, the AI is skipping the protocol
    const lockFile = join(cwd, '.jwforge', 'current', 'pipeline-required.json');
    const stateFile = join(cwd, '.jwforge', 'current', 'state.json');
    if (existsSync(lockFile) && !existsSync(stateFile)) {
      let lockData = {};
      try { lockData = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { /* ignore */ }
      console.log(JSON.stringify({
        decision: 'block',
        reason: `[JWForge Guard] BLOCKED: Pipeline /${lockData.pipeline || 'deep'} was triggered but state.json has not been initialized. You MUST follow the pipeline protocol: read skills/jwforge.md, create state.json, then proceed through phases. No file modifications allowed until the pipeline is properly started.`
      }));
      return;
    }

    // === Check pipeline state ===
    const state = readState(cwd);

    if (!state || state.status !== 'in_progress') {
      // No active pipeline and no lock — allow everything
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // === RULE 0b: /selfdeep pipeline guards ===
    // Selfdeep uses step/steps instead of phase. Block writes during analysis/research/plan steps.
    if (state.pipeline === 'selfdeep') {
      const readOnlySteps = ['sandbox', 'analyze', 'research', 'plan'];
      // 'loop-iterate' step (loop mode): same write model as 'improve' — sandbox-only writes.
      // Not in readOnlySteps, so it falls through to the allow-all below.
      // The iterator agent's own constraints enforce sandbox-only writes.
      if (readOnlySteps.includes(state.step)) {
        console.log(JSON.stringify({
          decision: 'block',
          reason: `[JWForge Guard] BLOCKED: Cannot edit project files during SelfDeep step "${state.step}". Only the "improve" step (in sandbox) and "apply" step (with user approval) allow file modifications.`
        }));
        return;
      }
      // During 'improve' step, only sandbox path is writable — but that's enforced by the
      // Improver agent's own constraints, not this hook (hook sees absolute paths).
      // During 'apply' step, writes to project files are allowed.
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // === RULE 1: /deep Phase 1-2 → BLOCK project file edits ===
    // Design must be complete before any code is written
    if (state.phase <= 2 && state.complexity !== 'S') {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `[JWForge Guard] BLOCKED: Cannot edit project files during Phase ${state.phase} (${state.phase === 1 ? 'Deep Interview' : 'Architecture'}). Complete the design first. No code before design approval.`
      }));
      return;
    }

    // === RULE 2: /deep Phase 3 → BLOCK files not in architecture.md ===
    if (state.phase === 3) {
      const archFile = join(cwd, '.jwforge', 'current', 'architecture.md');
      if (existsSync(archFile)) {
        const archContent = readFileSync(archFile, 'utf8');
        const normalizedPath = filePath.replace(/\\/g, '/');
        const fileBaseName = basename(normalizedPath);

        if (!archContent.includes(fileBaseName) && !archContent.includes(normalizedPath)) {
          console.log(JSON.stringify({
            decision: 'block',
            reason: `[JWForge Guard] BLOCKED: "${fileBaseName}" is NOT in architecture.md. Only files listed in the architecture document can be modified during Phase 3 (Execute). Update architecture.md first if this file needs changes.`
          }));
          return;
        }
      }
    }

    // === RULE 3: /surface bug-fix → BLOCK if no root cause established ===
    if (state.pipeline === 'surface' && state.type === 'bug-fix') {
      if (!state.root_cause || state.root_cause === '' || state.root_cause === 'unknown') {
        console.log(JSON.stringify({
          decision: 'block',
          reason: `[JWForge Guard] BLOCKED: Cannot fix code before root cause investigation is complete. Iron Law: NO FIXES WITHOUT ROOT CAUSE. Complete Step 1 (Investigate) first.`
        }));
        return;
      }
    }

    // === RULE 4: /deep Phase 4 → warn about editing (should be reviewers/fixers only) ===
    if (state.phase === 4) {
      console.log(JSON.stringify({
        continue: true,
        message: `[JWForge] Phase 4 (Verify): editing "${fileName}". Ensure this is part of the fix loop, not new feature work.`
      }));
      return;
    }

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch {
    // Hook failure should never block the user
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
