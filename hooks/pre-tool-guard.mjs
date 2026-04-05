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
 * 3. /surface active, type=bug-fix, no root_cause in state → BLOCK (investigate first)
 *    NOTE: This rule is surface-specific (checks pipeline === 'surface'), does not affect deeptk.
 * 4. Always: BLOCK writes to sensitive files
 *
 * Allowed always: .jwforge/**, state.json, task-spec.md, architecture.md (pipeline artifacts)
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { readStdin, readState, getCwd, isPipelineArtifact, checkPipelineLock, ALLOW, BLOCK, ALLOW_MSG } from './lib/common.mjs';

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
      console.log(BLOCK(`[JWForge Guard] BLOCKED: Pipeline /${lockData.pipeline || 'deep'} was triggered but state.json has not been initialized. You MUST follow the pipeline protocol: read skills/jwforge.md, create state.json, then proceed through phases. No file modifications allowed until the pipeline is properly started.`));
      return;
    }

    // === Check pipeline state ===
    const state = readState(cwd);

    if (!state || state.status !== 'in_progress') {
      // No active pipeline and no lock — allow everything
      console.log(ALLOW);
      return;
    }

    // === RULE 1: /deep Phase 1-2 → BLOCK project file edits ===
    // Design must be complete before any code is written
    if (state.phase <= 2 && state.complexity !== 'S') {
      console.log(BLOCK(`[JWForge Guard] BLOCKED: Cannot edit project files during Phase ${state.phase} (${state.phase === 1 ? 'Deep Interview' : 'Architecture'}). Complete the design first. No code before design approval.`));
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
          console.log(BLOCK(`[JWForge Guard] BLOCKED: "${fileBaseName}" is NOT in architecture.md. Only files listed in the architecture document can be modified during Phase 3 (Execute). Update architecture.md first if this file needs changes.`));
          return;
        }
      }
    }

    // === RULE 3: /surface bug-fix → BLOCK if no root cause established ===
    if (state.pipeline === 'surface' && state.type === 'bug-fix') {
      if (!state.root_cause || state.root_cause === '' || state.root_cause === 'unknown') {
        console.log(BLOCK(`[JWForge Guard] BLOCKED: Cannot fix code before root cause investigation is complete. Iron Law: NO FIXES WITHOUT ROOT CAUSE. Complete Step 1 (Investigate) first.`));
        return;
      }
    }

    // === RULE 4: /deep Phase 4 → warn about editing (should be reviewers/fixers only) ===
    if (state.phase === 4) {
      console.log(ALLOW_MSG(`[JWForge] Phase 4 (Verify): editing "${fileName}". Ensure this is part of the fix loop, not new feature work.`));
      return;
    }

    console.log(ALLOW);
  } catch {
    // Hook failure should never block the user
    console.log(ALLOW);
  }
}

main();
