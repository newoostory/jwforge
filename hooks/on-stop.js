#!/usr/bin/env node
// JWForge Stop Hook
// Preserves pipeline state and cleans up team when session ends unexpectedly.
// Registered via ~/.claude/settings.json hooks.Stop

const fs = require('fs');
const path = require('path');

const cwd = process.env.CLAUDE_CWD || process.cwd();
const stateFile = path.join(cwd, '.jwforge', 'current', 'state.json');
const homeDir = process.env.HOME || process.env.USERPROFILE;

if (!fs.existsSync(stateFile)) process.exit(0);

try {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

  // Mark state as stopped
  if (state.status === 'in_progress') {
    state.status = 'stopped';
    state.stopped_at = new Date().toISOString();
    state.stop_reason = 'session_end';
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  }

  // Clean up pipeline lock file
  const lockFile = path.join(cwd, '.jwforge', 'current', 'pipeline-required.json');
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
  }

  // Clean up team directory if it exists
  if (state.team_name && homeDir) {
    const teamDir = path.join(homeDir, '.claude', 'teams', state.team_name);
    const taskDir = path.join(homeDir, '.claude', 'tasks', state.team_name);

    if (fs.existsSync(teamDir)) {
      fs.rmSync(teamDir, { recursive: true, force: true });
    }
    if (fs.existsSync(taskDir)) {
      fs.rmSync(taskDir, { recursive: true, force: true });
    }
  }
} catch {
  // state.json is corrupted or unreadable -- nothing we can do
}
