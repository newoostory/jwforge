# /wiki:sync — Wiki Synchronization (Tailscale + rsync)

One-way pull sync: this device **receives only** from a remote source via Tailscale.

`$ARGUMENTS`

---

## Argument Parsing

Parse `$ARGUMENTS`:
- `setup <tailscale-host> [--path <remote-path>] [--interval <minutes>]` — Configure auto-sync
- `status` — Show sync status and last sync time
- `pull` — Manual one-time pull
- `stop` — Disable auto-sync
- `log` — Show recent sync log
- No args → show status

Defaults:
- `--path`: `~/wiki/` (remote wiki path)
- `--interval`: `5` (minutes)

---

## Step 1: Wiki Resolution

Determine local wiki path:
1. `--local` flag → `.wiki/`
2. Otherwise → `~/wiki/`

---

## Step 2: Handle Subcommand

### `setup <tailscale-host>`

Configure one-way rsync pull from a Tailscale peer.

1. **Verify Tailscale is running:**
   ```bash
   tailscale status
   ```
   If not running, tell the user: "Tailscale is not active. Run `tailscale up` first."

2. **Verify the remote host is reachable:**
   ```bash
   tailscale ping <tailscale-host> --c 1 --timeout 5s
   ```
   If unreachable, tell the user the host is offline.

3. **Verify rsync is available:**
   ```bash
   which rsync
   ```
   If missing, suggest: `sudo apt install rsync` or `brew install rsync`.

4. **Test SSH access via Tailscale:**
   ```bash
   ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new <tailscale-host> "ls <remote-path>" 2>&1
   ```
   If fails, tell user to ensure SSH is enabled on the remote host (`tailscale up --ssh`).

5. **Create sync config file:**
   Write `~/wiki/.sync-config.json`:
   ```json
   {
     "remote_host": "<tailscale-host>",
     "remote_path": "<remote-path>/",
     "local_path": "<local-wiki-path>/",
     "interval_minutes": <interval>,
     "mode": "pull-only",
     "created": "<ISO date>",
     "enabled": true
   }
   ```

6. **Create the sync script:**
   Write `~/wiki/.sync-pull.sh`:
   ```bash
   #!/usr/bin/env bash
   # Wiki auto-sync: pull-only from Tailscale peer
   set -euo pipefail

   CONFIG="$HOME/wiki/.sync-config.json"
   LOGFILE="$HOME/wiki/.sync-log"

   if [ ! -f "$CONFIG" ]; then
     echo "$(date -Iseconds) [ERROR] No sync config found" >> "$LOGFILE"
     exit 1
   fi

   REMOTE_HOST=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).remote_host)")
   REMOTE_PATH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).remote_path)")
   LOCAL_PATH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG','utf8')).local_path)")

   # Check if Tailscale is up
   if ! tailscale status &>/dev/null; then
     echo "$(date -Iseconds) [SKIP] Tailscale not running" >> "$LOGFILE"
     exit 0
   fi

   # Pull via rsync (one-way, delete=no to preserve local-only files)
   rsync -avz --timeout=30 \
     --exclude='.sync-*' \
     --exclude='.obsidian/workspace.json' \
     --exclude='.obsidian/workspace-*.json' \
     -e "ssh -o ConnectTimeout=10 -o BatchMode=yes" \
     "${REMOTE_HOST}:${REMOTE_PATH}" "${LOCAL_PATH}" \
     >> "$LOGFILE" 2>&1

   echo "$(date -Iseconds) [OK] Sync complete" >> "$LOGFILE"

   # Trim log to last 500 lines
   tail -n 500 "$LOGFILE" > "$LOGFILE.tmp" && mv "$LOGFILE.tmp" "$LOGFILE"
   ```
   Then: `chmod +x ~/wiki/.sync-pull.sh`

7. **Register cron job:**
   ```bash
   # Remove any existing wiki sync cron
   crontab -l 2>/dev/null | grep -v 'wiki/.sync-pull.sh' | crontab -

   # Add new cron entry
   (crontab -l 2>/dev/null; echo "*/<interval> * * * * $HOME/wiki/.sync-pull.sh") | crontab -
   ```

8. **Run initial sync:**
   ```bash
   bash ~/wiki/.sync-pull.sh
   ```

9. **Report to user:**
   ```
   Wiki sync configured:
   - Source: <tailscale-host>:<remote-path>
   - Target: <local-path> (receive only)
   - Interval: every <interval> minutes
   - Mode: pull-only (local changes are NOT pushed)

   Commands:
   - /wiki:sync status  — check sync status
   - /wiki:sync pull    — manual sync now
   - /wiki:sync stop    — disable auto-sync
   ```

---

### `status`

1. Read `~/wiki/.sync-config.json`
2. If not found: "No sync configured. Use `/wiki:sync setup <host>` to set up."
3. If found, show:
   - Remote: `<host>:<path>`
   - Mode: pull-only
   - Interval: every N minutes
   - Enabled: yes/no
   - Last sync: read last `[OK]` line from `~/wiki/.sync-log`
   - Cron active: check `crontab -l | grep sync-pull`

---

### `pull`

Manual one-time pull:
1. Read config from `~/wiki/.sync-config.json`
2. Run: `bash ~/wiki/.sync-pull.sh`
3. Show last 10 lines of `~/wiki/.sync-log`

---

### `stop`

1. Remove cron entry:
   ```bash
   crontab -l 2>/dev/null | grep -v 'wiki/.sync-pull.sh' | crontab -
   ```
2. Update config: `"enabled": false`
3. Report: "Auto-sync disabled. Use `/wiki:sync setup` to re-enable."

---

### `log`

Show last 30 lines of `~/wiki/.sync-log`:
```bash
tail -n 30 ~/wiki/.sync-log
```

---

## Sync Design Principles

- **Pull-only**: local device never pushes. Remote is the source of truth.
- **Non-destructive**: rsync runs WITHOUT `--delete` — local-only files are preserved.
- **Obsidian-safe**: excludes `workspace.json` (Obsidian session state) to avoid conflicts.
- **Offline-resilient**: if Tailscale is down, sync silently skips (logged, no error).
- **No lock files**: rsync handles concurrent read/write safely for file-level operations.
