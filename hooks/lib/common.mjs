#!/usr/bin/env node

/**
 * JWForge Hook Shared Utilities
 *
 * Common functions and constants used across all JWForge hooks.
 * Pure utility module — no hook-specific business logic.
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

// --- Path Constants ---

export const JWFORGE_DIR = '.jwforge';
export const STATE_FILE = join(JWFORGE_DIR, 'current', 'state.json');
export const LOCK_FILE = join(JWFORGE_DIR, 'current', 'pipeline-required.json');

// --- Response Helpers ---

export const ALLOW = JSON.stringify({ continue: true, suppressOutput: true });

export function BLOCK(reason) {
  return JSON.stringify({ decision: 'block', reason });
}

export function ALLOW_MSG(message) {
  return JSON.stringify({ continue: true, message });
}

// --- Stdin Reader ---

export function readStdin() {
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

// --- State Readers ---

export function readState(cwd) {
  const stateFile = join(cwd, JWFORGE_DIR, 'current', 'state.json');
  if (!existsSync(stateFile)) return null;
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; }
}

export function getCwd() {
  return process.env.CLAUDE_CWD || process.cwd();
}

export function readLockFile(cwd) {
  const lockFile = join(cwd, JWFORGE_DIR, 'current', 'pipeline-required.json');
  if (!existsSync(lockFile)) return null;
  try { return JSON.parse(readFileSync(lockFile, 'utf8')); } catch { return null; }
}

// --- Pipeline Artifact Check ---

export function isPipelineArtifact(filePath, cwd) {
  const normalized = filePath.replace(/\\/g, '/');
  const jwforgeDir = join(cwd, JWFORGE_DIR).replace(/\\/g, '/');
  return normalized.startsWith(jwforgeDir) ||
         normalized.includes('.jwforge/') ||
         basename(normalized) === 'state.json' ||
         basename(normalized) === 'task-spec.md' ||
         basename(normalized) === 'architecture.md' ||
         basename(normalized) === 'compact-snapshot.md' ||
         basename(normalized) === 'agent-log.jsonl';
}

// --- Pipeline Lock Check ---

export function checkPipelineLock(cwd) {
  const lockFile = join(cwd, JWFORGE_DIR, 'current', 'pipeline-required.json');
  const stateFile = join(cwd, JWFORGE_DIR, 'current', 'state.json');
  if (existsSync(lockFile) && !existsSync(stateFile)) {
    let lockData = {};
    try { lockData = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { /* ignore */ }
    return lockData;
  }
  return null;
}
