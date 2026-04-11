#!/usr/bin/env node

/**
 * JWForge Keyword Detector (UserPromptSubmit hook)
 *
 * Two critical jobs:
 * 1. Detect pipeline-triggering keywords and inject mode messages
 * 2. CREATE PIPELINE LOCK FILE when /deep or /surface is detected
 *    → This is the enforcement anchor. Even if the AI skips state.json creation,
 *      all guard hooks see the lock file and BLOCK unauthorized actions.
 *
 * Lock file: .jwforge/current/pipeline-required.json
 * Created BEFORE the AI even starts processing the message.
 */

import { writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { readStdin, getCwd, ALLOW, ALLOW_MSG } from './lib/common.mjs';

const KEYWORDS = [
  // Cancel / stop
  { patterns: ['취소', 'cancel', 'stop jwforge', 'abort'], skill: 'cancel', priority: 1 },
  // DeepTK pipeline (must be before /deep to avoid word-boundary interference)
  { patterns: ['/deeptk'], skill: 'deeptk', priority: 2, pipeline: 'deeptk', wordBoundary: ['deeptk'] },
  // Deep pipeline
  { patterns: ['/deep'], skill: 'deep', priority: 3, pipeline: 'deep', wordBoundary: ['deep'] },
  // Surface pipeline
  { patterns: ['surface', '/surface', 'quick fix', '빠른 수정'], skill: 'surface', priority: 4, pipeline: 'surface' },
  // Resume pipeline
  { patterns: ['resume', '/resume', '재개'], skill: 'resume', priority: 5 },
  // TDD mode
  { patterns: ['tdd', 'test first', '테스트 먼저'], mode: 'tdd', priority: 10 },
  // Verify mode
  { patterns: ['verify', 'check', '검증'], mode: 'verify', priority: 11 },
];

const MODE_MESSAGES = {
  tdd: `<jwforge-tdd-mode>
[TDD MODE] Write or update tests first, confirm they fail for the right reason, then implement the fix.
</jwforge-tdd-mode>`,
  verify: `<jwforge-verify-mode>
[VERIFY MODE] Run all available checks (lint, typecheck, tests) before claiming completion. Report evidence.
</jwforge-verify-mode>`,
};


/**
 * Create pipeline lock file IMMEDIATELY when /deep or /surface is detected.
 * This happens BEFORE the AI processes the message, so even if the AI
 * tries to skip state.json creation, the lock file exists and guards trigger.
 */
function createPipelineLock(cwd, pipeline, userMessage) {
  const lockDir = join(cwd, '.jwforge', 'current');
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  const lockFile = join(lockDir, 'pipeline-required.json');
  const lockData = {
    pipeline,
    triggered_at: new Date().toISOString(),
    user_message: userMessage.substring(0, 200),
    state_initialized: false,
    note: 'This lock was created by keyword-detector hook. All Edit/Write/Bash guards check this file. The AI MUST create state.json to proceed with any code modifications.'
  };

  writeFileSync(lockFile, JSON.stringify(lockData, null, 2));
}

/**
 * Remove pipeline lock when cancel is detected.
 */
function removePipelineLock(cwd) {
  const lockFile = join(cwd, '.jwforge', 'current', 'pipeline-required.json');
  if (existsSync(lockFile)) {
    try { unlinkSync(lockFile); } catch { /* ignore */ }
  }
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      console.log(ALLOW);
      return;
    }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(ALLOW); return; }

    const userMessage = (data.message || data.content || data.prompt || '').toLowerCase().trim();
    if (!userMessage) {
      console.log(ALLOW);
      return;
    }

    const cwd = getCwd();

    // Check for keyword matches
    // Uses word-boundary regex for keywords that could be substrings of others
    const matches = KEYWORDS
      .filter(kw => {
        // First check exact/substring patterns
        const hasPatternMatch = kw.patterns.some(p => userMessage.includes(p.toLowerCase()));
        if (hasPatternMatch) return true;
        // Then check word-boundary patterns (e.g., 'deep' matches as whole word only)
        if (kw.wordBoundary) {
          return kw.wordBoundary.some(w => new RegExp(`(?:^|\\s|/)${w.toLowerCase()}(?:\\s|$)`, 'i').test(userMessage));
        }
        return false;
      })
      .sort((a, b) => a.priority - b.priority);

    if (matches.length === 0) {
      console.log(ALLOW);
      return;
    }

    const match = matches[0];

    // Cancel: remove lock
    if (match.skill === 'cancel') {
      removePipelineLock(cwd);
      console.log(ALLOW);
      return;
    }

    // Pipeline trigger: CREATE LOCK FILE
    if (match.pipeline) {
      createPipelineLock(cwd, match.pipeline, userMessage);
      console.log(ALLOW_MSG(`[JWForge] Pipeline lock created for /${match.pipeline}. All file modifications are blocked until state.json is properly initialized through the pipeline protocol.`));
      return;
    }

    // Mode injection
    if (match.mode && MODE_MESSAGES[match.mode]) {
      console.log(ALLOW_MSG(MODE_MESSAGES[match.mode]));
      return;
    }

    console.log(ALLOW);
  } catch {
    console.log(ALLOW);
  }
}

main();
