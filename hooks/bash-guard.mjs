#!/usr/bin/env node

/**
 * JWForge Bash Guard (PreToolUse hook for Bash)
 *
 * Prevents AI from bypassing Edit/Write guards by using Bash to modify files.
 * Blocks: sed -i, echo >, cat <<, tee, cp, mv, and other file-writing commands
 * during pipeline phases where Edit/Write would also be blocked.
 *
 * Same phase logic as pre-tool-guard.mjs but applied to Bash commands.
 * NOTE: All phase rules check state.phase (pipeline-agnostic), so /deeptk is handled
 * identically to /deep. The only pipeline-specific check is RULE 3 (surface bug-fix),
 * which explicitly checks state.pipeline === 'surface' and does not affect deeptk.
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

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

// Patterns that indicate file-writing Bash commands
const FILE_WRITE_PATTERNS = [
  /\bsed\s+-i/i,                        // sed -i (in-place edit)
  /\bsed\s+.*-i/i,                      // sed with -i flag anywhere
  />\s*\S+/,                             // echo > file, command > file
  />>?\s*\S+/,                           // redirect to file
  /\bcat\s*<<\s*/,                       // cat << heredoc
  /\btee\s+/,                            // tee file
  /\bcp\s+/,                             // cp source dest
  /\bmv\s+/,                             // mv source dest
  /\bchmod\s+/,                          // chmod (modifying file permissions)
  /\bpatch\s+/,                          // patch files
  /\bprintf\s+.*>/,                      // printf > file
  /\bdd\s+/,                             // dd (disk duplicate)
  /\binstall\s+-.*\s+\S+/,              // install command
  /\bln\s+-/,                            // ln -s (symlinks)
  /\brm\s+/,                             // rm (file deletion)
  /\bmkdir\s+/,                          // mkdir (directory creation during wrong phase)
  /\btouch\s+/,                          // touch (file creation)
  /\bnpm\s+init/,                        // npm init (creates package.json)
  /\bnpx\s+/,                            // npx (can create/modify files)
  /\bpip\s+install/,                     // pip install
  /\bnpm\s+install/,                     // npm install (modifies node_modules, package.json)
  /\byarn\s+add/,                        // yarn add
  /\bpnpm\s+add/,                        // pnpm add
];

// Commands that are always safe (read-only operations)
const SAFE_PATTERNS = [
  /^\s*git\s+(status|log|diff|show|branch|tag|remote|rev-parse|describe)/,
  /^\s*ls\b/,
  /^\s*cat\s+(?!<<)/,                   // cat without heredoc (just reading)
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*wc\b/,
  /^\s*find\b/,
  /^\s*grep\b/,
  /^\s*rg\b/,
  /^\s*node\s+-e.*console/,             // node -e with console (evaluation)
  /^\s*echo\s+[^>]/,                    // echo without redirect (just printing)
  /^\s*echo$/,                           // bare echo
  /^\s*pwd\b/,
  /^\s*which\b/,
  /^\s*type\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
];

// Paths that are always writable (pipeline artifacts)
function isWritingToPipelineArtifact(command, cwd) {
  const jwforgePatterns = [
    /\.jwforge/,
    /state\.json/,
    /task-spec\.md/,
    /architecture\.md/,
    /compact-snapshot\.md/,
    /agent-log\.jsonl/,
    /\.gitignore/,
  ];
  return jwforgePatterns.some(p => p.test(command));
}

function readState(cwd) {
  const stateFile = join(cwd, '.jwforge', 'current', 'state.json');
  if (!existsSync(stateFile)) return null;
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; }
}

function isFileWriteCommand(command) {
  // Check if it matches any safe pattern first
  if (SAFE_PATTERNS.some(p => p.test(command))) return false;
  // Check if it matches any file write pattern
  return FILE_WRITE_PATTERNS.some(p => p.test(command));
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    let data;
    try { data = JSON.parse(raw); } catch { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    const command = data.command || data.input?.command || '';
    if (!command) { console.log(JSON.stringify({ continue: true, suppressOutput: true })); return; }

    const cwd = process.env.CLAUDE_CWD || process.cwd();

    // === Pipeline lock check ===
    // If pipeline-required.json exists but state.json doesn't, AI is skipping protocol
    const lockFile = join(cwd, '.jwforge', 'current', 'pipeline-required.json');
    const stateFile = join(cwd, '.jwforge', 'current', 'state.json');
    if (existsSync(lockFile) && !existsSync(stateFile)) {
      // Only block file-writing commands, not read-only ones
      if (isFileWriteCommand(command) && !isWritingToPipelineArtifact(command, cwd)) {
        let lockData = {};
        try { lockData = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { /* ignore */ }
        console.log(JSON.stringify({
          decision: 'block',
          reason: `[JWForge Bash Guard] BLOCKED: Pipeline /${lockData.pipeline || 'deep'} was triggered but state.json not initialized. Follow the pipeline protocol first. No file modifications until pipeline is properly started.`
        }));
        return;
      }
    }

    // No active pipeline and no lock — allow everything
    const state = readState(cwd);
    if (!state || state.status !== 'in_progress') {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Pipeline artifact writes are always allowed
    if (isWritingToPipelineArtifact(command, cwd)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Check if this is a file-writing command
    if (!isFileWriteCommand(command)) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // === RULE 1: Phase 1-2 → BLOCK all file-writing Bash commands ===
    if (state.phase <= 2 && state.complexity !== 'S') {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `[JWForge Bash Guard] BLOCKED: File-writing Bash command during Phase ${state.phase} (${state.phase === 1 ? 'Deep Interview' : 'Architecture'}). No code modifications before design is complete. Use Edit/Write tools after Phase 2.`
      }));
      return;
    }

    // === RULE 2: Phase 3 → BLOCK if target file not in architecture.md ===
    if (state.phase === 3) {
      const archFile = join(cwd, '.jwforge', 'current', 'architecture.md');
      if (existsSync(archFile)) {
        const archContent = readFileSync(archFile, 'utf8');
        // Extract potential file paths from the command
        // This is a heuristic — we check if any architecture file is mentioned in the command
        const commandFiles = command.match(/[\w./-]+\.\w{1,5}/g) || [];
        const unauthorized = commandFiles.filter(f => {
          const base = basename(f);
          return !archContent.includes(base) && !archContent.includes(f);
        });
        if (unauthorized.length > 0) {
          console.log(JSON.stringify({
            decision: 'block',
            reason: `[JWForge Bash Guard] BLOCKED: Bash command targets file(s) not in architecture.md: ${unauthorized.join(', ')}. Only files listed in the architecture can be modified during Phase 3.`
          }));
          return;
        }
      }
    }

    // === RULE 3: Surface bug-fix without root cause ===
    if (state.pipeline === 'surface' && state.type === 'bug-fix') {
      if (!state.root_cause || state.root_cause === '' || state.root_cause === 'unknown') {
        console.log(JSON.stringify({
          decision: 'block',
          reason: `[JWForge Bash Guard] BLOCKED: File-writing Bash command before root cause investigation. Iron Law: NO FIXES WITHOUT ROOT CAUSE.`
        }));
        return;
      }
    }

    // Phase 4 — warn but allow
    if (state.phase === 4) {
      console.log(JSON.stringify({
        continue: true,
        message: `[JWForge] Phase 4: Bash file operation detected. Ensure this is part of the fix loop.`
      }));
      return;
    }

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
