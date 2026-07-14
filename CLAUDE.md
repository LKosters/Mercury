# Mercury (email-app) — AI agent guide

Mercury is an Electron desktop email client (Gmail + any IMAP/SMTP) with a local SQLite mail index, app-local "reactive folders", a done-workflow, and a macOS Liquid Glass UI. No build step, no framework — plain ES modules in the renderer, CommonJS in the main process.

## Commands

```bash
npm start                                  # run the app
MAIL_DEBUG=1 npx electron .                # run with IPC timing + renderer error logging
npx electron-rebuild -f -w better-sqlite3  # REQUIRED after upgrading Electron (native module)
```

There are no tests and no linter. Verify changes by running the app.

## Docs — read before touching a feature

`docs/` contains one markdown file per feature: what it is, key files, **"Specifics (do NOT regress)"** (hard-won constraints — treat as rules), and a dated change log.

| Doc | Read before touching |
|---|---|
| [docs/accounts.md](docs/accounts.md) | Account add/remove, passwords, safeStorage, Gmail preset |
| [docs/mail-index.md](docs/mail-index.md) | db.js, sync.js, anything listing messages, Electron upgrades |
| [docs/message-list.md](docs/message-list.md) | Middle pane, pagination, scrolling, row rendering, filters |
| [docs/reader.md](docs/reader.md) | Reading pane, email body iframe, CSP, attachments |
| [docs/composer.md](docs/composer.md) | Compose, reply, sending |
| [docs/reactive-folders.md](docs/reactive-folders.md) | Reactive folders, tagging, hide-from-inbox |
| [docs/done.md](docs/done.md) | Done checkmarks, Done pseudo-folder |
| [docs/search.md](docs/search.md) | Search bar and index queries |
| [docs/design.md](docs/design.md) | styles.css, window options, theming, branding, title bar |
| [docs/settings.md](docs/settings.md) | Settings modal, backup import/export, sync interval, rebuild index |
| [docs/onboarding.md](docs/onboarding.md) | First-run welcome screen, zero-account state, import-from-welcome |
| [docs/release.md](docs/release.md) | Packaging, installers, electron-builder, GitHub release workflow |
| [docs/media-bar.md](docs/media-bar.md) | Status bar now-playing widget (Spotify/Apple Music via osascript) |

**After changing a feature, append a dated entry to its doc's Change log** (newest first; keep prior entries) and update the top sections only if now stale. New feature → new `docs/<feature>.md` following the same skeleton + a row in the table above.

## Architecture in one minute

- **Main process** (`src/main/`, CommonJS): `main.js` (window, lifecycle, sync scheduler) → `ipc.js` (all handlers) → `mail.js` (IMAP/SMTP, connection pool per account), `db.js` (SQLite index), `sync.js` (background indexer), `accounts.js` / `reactive.js` / `done.js` (JSON stores in userData).
- **Preload** (`src/preload.js`): exposes `window.mailApi`; every handler returns `{ok, data|error}` and the preload unwraps it to a throwing promise.
- **Renderer** (`src/renderer/js/`, ES modules): `app.js` entry; feature modules own their DOM listeners; shared mutable `state` object in `state.js`.
- **Data flow:** lists/search/reactive read the local SQLite index (instant); bodies and mutations go to IMAP live; a background sync reconciles the index every 5 minutes and streams progress events to the renderer.

## Hard rules (the expensive lessons)

1. **Never rename the internal Electron app name** (`email-app`) — no `productName`, no `app.setName()`. It keys the macOS Keychain entry for password decryption. Branding is visual-only.
2. **Never change the reader iframe's sandbox** (`allow-same-origin allow-popups`, no scripts) or stop recreating it per message — that config dodges a macOS white-frame compositing bug. Details in docs/reader.md.
3. **Keep `min-height: 0`** on the grid panes and message list — removing it silently kills all scrolling.
4. Pagination offsets count **raw** rows, not filtered ones (docs/message-list.md).
5. `better-sqlite3` must be rebuilt against Electron after any Electron version bump, or the app won't start.
6. Don't rebuild the whole message list on row interactions — use the targeted row-update helpers.
7. User data lives in `~/Library/Application Support/Mercury/` (pinned in main.js). The SQLite index is disposable (resyncs); `accounts.json`, `reactive-folders.json`, `done.json` are not.
