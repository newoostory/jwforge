You are a Wiki Sync agent. Your task is to manage Syncthing-based synchronization of the wiki hub.

The user has invoked `/wiki:sync` with:

$ARGUMENTS

## Step 1: Resolve Wiki

Determine which wiki to operate on using this resolution order (check in order, stop at first match):

1. `--local` flag in $ARGUMENTS → use `.wiki/` in the current working directory
2. `--wiki <name>` flag in $ARGUMENTS → look up named wiki from `~/wiki/wikis.json`, use `~/wiki/topics/<name>/`
3. Current directory contains `.wiki/` → use it
4. Otherwise → use `~/wiki/` hub

## Step 2: Parse Arguments

From $ARGUMENTS, extract the subcommand (one of):
- `--setup` — configure Syncthing for this wiki directory
- `--status` — show current Syncthing sync status
- `--check` — verify Syncthing is running and the wiki folder is shared
- `--ignore` — update Syncthing ignore patterns (.stignore)

If no subcommand is given, default to `--status`.

## Step 3: Handle Subcommand

---

### `--setup`

Guide the user through configuring Syncthing for the wiki directory.

1. **Check if Syncthing is running:**
   ```bash
   systemctl --user is-active syncthing 2>/dev/null || systemctl is-active syncthing 2>/dev/null || pgrep -x syncthing >/dev/null
   ```
   If not running, report:
   ```
   Syncthing is not running. Start it with:
     systemctl --user start syncthing
   Or install from: https://syncthing.net/downloads/
   ```
   Stop here if not running.

2. **Check Syncthing API access:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8384/rest/system/status
   ```
   If not reachable (not 200), report:
   ```
   Syncthing API not reachable at localhost:8384.
   Check your Syncthing configuration or GUI address.
   ```

3. **Create `.stignore` file** at `<wiki-path>/.stignore` (create if not exists, append missing entries):
   ```
   // Syncthing ignore patterns for wiki
   .obsidian/workspace.json
   .obsidian/workspace-*.json
   .obsidian/cache
   .DS_Store
   *.tmp
   .sync-log
   .sync-log.tmp
   ```

4. **Report to user with manual steps:**
   ```
   Wiki directory ready for Syncthing sync:
   - Wiki path:  <wiki-path>
   - .stignore:  <wiki-path>/.stignore (created/updated)

   Next steps (in Syncthing Web UI at http://localhost:8384):
   1. Add Folder → set path to: <wiki-path>
   2. Set Folder Label to: wiki (or wiki-<topic>)
   3. Share with your other devices
   4. Set Folder Type to "Send & Receive"

   Verify with: /wiki:sync --check
   ```

---

### `--status`

Show Syncthing sync status for the wiki directory.

1. **Check Syncthing is running:**
   ```bash
   pgrep -x syncthing >/dev/null && echo "running" || echo "not running"
   ```

2. **Check if wiki path is a Syncthing shared folder:**
   Try the Syncthing REST API:
   ```bash
   curl -s http://localhost:8384/rest/config/folders 2>/dev/null
   ```
   Parse the JSON response to find a folder with `path` matching `<wiki-path>`.

3. **If folder found**, get its status:
   ```bash
   curl -s "http://localhost:8384/rest/db/status?folder=<folder-id>" 2>/dev/null
   ```

4. **Report:**
   ```
   Wiki Sync Status (Syncthing) — <date>

   Wiki:        <wiki-path>
   Syncthing:   running | not running
   Shared:      yes (folder: <label>) | not configured

   Sync state:  idle | syncing | error
   Global:      <N> files, <size>
   Local:       <N> files, <size>
   Out of sync: <N> files | none

   Connected devices: <N>
   Last sync:   <timestamp> | never
   ```

   If Syncthing is not running or the folder is not configured:
   ```
   Syncthing is not configured for this wiki.
   Run /wiki:sync --setup to configure.
   ```

---

### `--check`

Quick health check for Syncthing + wiki integration.

1. Check Syncthing process is running
2. Check `.stignore` exists at `<wiki-path>`
3. Check the wiki folder is registered in Syncthing (via REST API)
4. Check connected devices count

Report:
```
Wiki Sync Health Check

[OK|FAIL] Syncthing process running
[OK|FAIL] .stignore file present
[OK|FAIL] Wiki folder registered in Syncthing
[OK|WARN] Connected devices: <N> (0 = no sync targets)

Overall: healthy | needs attention
```

---

### `--ignore`

Update the `.stignore` file with additional patterns.

1. Read current `<wiki-path>/.stignore`
2. If $ARGUMENTS contains patterns after `--ignore`, append them (skip duplicates)
3. If no patterns given, show current `.stignore` contents and suggest common patterns:
   ```
   Current .stignore:
   <contents>

   Suggested additions:
   - *.pdf        (exclude PDFs from sync)
   - raw/         (exclude raw sources, sync wiki/ only)
   - .git/        (exclude git metadata)
   ```

---

## Rules

- **Syncthing-based**: this command manages Syncthing configuration for wiki sync. No git-push, no rsync.
- **Non-destructive**: never delete or overwrite existing Syncthing configuration. Only add/update.
- **`.stignore` is append-only**: never remove existing entries from `.stignore`. Only add missing patterns.
- **Obsidian-safe**: always exclude workspace state files from sync.
- **API access**: use Syncthing REST API at `http://localhost:8384` for status checks. If API key is required, prompt the user to provide it or set `SYNCTHING_API_KEY` env variable.
- **Manual folder setup**: Syncthing folder registration is done through the Web UI (not automated via API) for safety. The `--setup` command prepares the directory and guides the user.
- **Bidirectional sync**: Syncthing syncs bidirectionally by default ("Send & Receive"). This is the recommended mode for wiki directories.
