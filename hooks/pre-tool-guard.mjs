#!/usr/bin/env node

/**
 * JWForge Pre-Tool Guard (PreToolUse hook for Edit/Write)
 *
 * HARD ENFORCEMENT of pipeline phases:
 * 0. Pipeline lock check → if pipeline-required.json exists but state.json doesn't,
 *    BLOCK everything (AI is trying to skip the pipeline protocol)
 * 1. /deep Phase 1-2 active → BLOCK all Edit/Write to project files (design not done yet)
 *    NOTE: /deeptk is also handled here — phase logic is pipeline-agnostic (checks state.phase),
 *    so deeptk Phase 1 (Discover) and Phase 2 (Design) are blocked the same way as /deep.
 * 2. /deep Phase 3 active → BLOCK edits to files NOT in architecture.md
 *    NOTE: /deeptk Phase 3 (Build) uses the same architecture.md check.
 * 3. Always: BLOCK writes to sensitive files
 *
 * Allowed always: .jwforge/**, state.json, task-spec.md, architecture.md (pipeline artifacts)
 */

import { basename } from 'path';
import { readStdin, readState, getCwd, isPipelineArtifact, checkPipelineLock, evaluatePhaseGuard, ALLOW, BLOCK, ALLOW_MSG } from './lib/common.mjs';

const SENSITIVE_PATTERNS = [
  /\.env$/i, /\.env\.\w+$/i, /credentials\.json$/i,
  /secrets?\.\w+$/i, /\.pem$/i, /\.key$/i, /id_rsa/i, /\.aws\/credentials/i,
];

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(ALLOW); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    const filePath = data.file_path || data.filePath || data.input?.file_path || '';
    if (!filePath) { console.log(ALLOW); return; }

    const fileName = basename(filePath);
    const cwd = getCwd();

    // === RULE 0: Always block sensitive files ===
    if (SENSITIVE_PATTERNS.some(p => p.test(filePath) || p.test(fileName))) {
      console.log(BLOCK(`[JWForge Guard] BLOCKED: write to sensitive file "${fileName}". Remove guard manually if intentional.`));
      return;
    }

    // === Pipeline artifacts are always writable ===
    if (isPipelineArtifact(filePath, cwd)) {
      console.log(ALLOW);
      return;
    }

    // === RULE 0: Pipeline lock check ===
    // If pipeline-required.json exists but state.json doesn't, the AI is skipping the protocol
    const lockData = checkPipelineLock(cwd);
    if (lockData) {
      console.log(BLOCK(`[JWForge Guard] BLOCKED: Pipeline /${lockData.pipeline || 'deep'} was triggered but state.json has not been initialized. You MUST follow the pipeline protocol: create state.json, then proceed through phases. No file modifications allowed until the pipeline is properly started.`));
      return;
    }

    // === Check pipeline state ===
    const state = readState(cwd);

    if (!state || state.status !== 'in_progress') {
      // No active pipeline and no lock — allow everything
      console.log(ALLOW);
      return;
    }

    // === State.json Edit block: state.json must only be modified via Write tool ===
    if (filePath.endsWith('state.json') && filePath.includes('.jwforge/current/')) {
      console.log(BLOCK('[JWForge Guard] BLOCKED: state.json must only be modified via the Write tool during active pipeline.'));
      return;
    }

    // === Phase guard: evaluate using shared logic ===
    const guard = evaluatePhaseGuard(state, { filePath, cwd });
    if (guard.action === 'block') {
      console.log(BLOCK(`[JWForge Guard] BLOCKED: ${guard.reason}`));
      return;
    }
    if (guard.action === 'warn') {
      console.log(ALLOW_MSG(`[JWForge] ${guard.reason}`));
      return;
    }

    console.log(ALLOW);
  } catch {
    // Hook failure should never block the user
    console.log(ALLOW);
  }
}

main();
