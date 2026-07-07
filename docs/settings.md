# Feature: Settings & backup

Per-feature AI doc for **Mercury** (email-app). Read this before touching the Settings modal, the backup/import-export tool, sync preferences, or the app-info panel.

## What it is
A Settings modal opened from the **gear button in the title bar**. It hosts four sections:
1. **Accounts** — list every account with a Remove button; "Add account" reuses the existing add-account modal.
2. **Backup & restore** — export a single JSON bundle (accounts + reactive folders + done-state) and import it back. The bundle carries **decrypted account passwords in plain text** (safeStorage is machine-bound, so a portable backup can't stay encrypted); the UI warns about this.
3. **Sync** — a user-configurable background-sync interval (minutes) and a "Sync all accounts now" button.
4. **About** — app version, data-folder path, "Reveal data folder", and "Rebuild mail index".

## Key files
| File | Role |
|---|---|
| `src/renderer/index.html` | `#settings-modal` markup + title-bar gear `#settings-btn` |
| `src/renderer/js/settings.js` | Renderer: opens the modal, renders accounts, wires export/import/prefs/about |
| `src/renderer/styles.css` | `.settings-*` styles (after the Modals section) |
| `src/main/settings.js` | `settings.json` prefs store (`syncIntervalMinutes`), with clamping |
| `src/main/ipc.js` | `settings:*` handlers (getPrefs/setPrefs/info/revealData/rebuildIndex/export/import) |
| `src/main/accounts.js` | `exportAccounts()` (decrypts), `importAccounts()` (re-encrypts, upserts by id) |
| `src/main/reactive.js` / `done.js` | `exportAll()` / `importAll()` merge helpers |
| `src/main/db.js` | `resetIndex()` for "Rebuild mail index" |
| `src/main/main.js` | `rescheduleSync()` re-reads the interval and resets the `setInterval` |

## Specifics (do NOT regress)
- **The export bundle contains plaintext passwords.** This is intentional and required for portability (safeStorage keys to the local Keychain). Keep the plain-text warning next to the Export button. On import, `accounts.importAccounts` re-encrypts on the current machine.
- **Import upserts accounts by `id`**, not by email — so reactive folders / done records (keyed by `accountId`) keep matching after a round-trip. Preserve ids in the bundle.
- Reactive folders import upserts by `id`; done records dedupe by `(accountId, messageId)`.
- Changing the sync interval calls `settings:setPrefs`, which calls `rescheduleSync()` in main — the running `setInterval` must be replaced, not just the stored value. Interval is clamped 1–1440 min in `settings.set`.
- "Rebuild mail index" only drops the SQLite index (`db.resetIndex`) then triggers `syncAll()`. It must never touch `accounts.json`, `reactive-folders.json`, or `done.json` (see hard rule 7 in CLAUDE.md).
- "Add account" from Settings closes the Settings modal then clicks the sidebar's `#add-account-btn` — it reuses that flow rather than duplicating the form.
- After an import, `settings.js` reloads `state.accounts` and re-selects the current account so reactive/done refresh.

## Change log

### 2026-07-07 — Initial Settings modal + backup tool
**Goal:** fill the empty title bar and add a settings + accounts import/export tool.
**Changes:** new `#settings-modal` (gear button in the title bar) with Accounts / Backup / Sync / About sections; `src/main/settings.js` prefs store; `settings:*` IPC handlers; export/import bundle (accounts+reactive+done) via save/open dialogs; account export decrypts + import re-encrypts (upsert by id); configurable sync interval with live reschedule (`main.js rescheduleSync`); "Sync all now"; "Reveal data folder" (`shell.openPath`); "Rebuild mail index" (`db.resetIndex` + resync). Also added the title-bar global search and sync-status pill — see [design.md](design.md) and [search.md](search.md).
**Result:** boots clean; all handlers registered. (Live UI click-through not verifiable in the dev sandbox — no Electron screen capture — verified via clean startup + IPC round-trips.)
