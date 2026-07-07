# Feature: Mail index & background sync

Per-feature AI doc for **Mercury** (email-app). Read this before touching db.js, sync.js, or anything that lists messages.

## What it is
A local SQLite database (`better-sqlite3`) holding the envelope of every message in every folder of every account (~50k rows in daily use). A background sync engine keeps it incrementally up to date. All list/search/reactive views read from this index (0–2ms); only message bodies and mutations (send/delete/flag) touch IMAP live.

## Key files
| File | Role |
|---|---|
| `src/main/db.js` | Schema, upserts, prune, list/search/reactive queries, folder sync-state |
| `src/main/sync.js` | Per-folder sync: full first run, incremental after; emits progress events |
| `src/main/main.js` | Sync scheduler: on launch (+2s), every 5 min, one in-flight sync per account |
| `src/main/mail.js` | IMAP plumbing shared with sync (`withImap`, `getBoxes`, `fetchEnvelopesByUid`); per-account persistent connection pool |
| `src/renderer/js/sync.js` | Renderer: progress text in list header, quiet view refresh on `folder-done` |

## How sync works
1. Per folder: read `UIDVALIDITY`. Changed/unknown → clear folder rows, full re-index. Unchanged → incremental.
2. `UID SEARCH 1:*` gives the live UID list → detect deletions (`pruneFolder`) and new mail (`uid > last_uid`).
3. Envelopes fetched in chunks of 500 (`CHUNK`); flags re-checked on the 500 newest (`FLAG_REFRESH`) each cycle so read/unread stays fresh.
4. Folder order: INBOX first (user-visible), `\All` second (feeds reactive folders), rest after.
5. Events (`sync:event` → renderer): `folder-progress`, `folder-done`, `folder-error`, `account-done`, `account-error`.

## Specifics (do NOT regress)
- **`better-sqlite3` is a native module** — after upgrading Electron run `npx electron-rebuild -f -w better-sqlite3` or the app won't boot.
- DB path: `userData/mail-index.db`, WAL mode. Primary key `(account_id, folder, uid)`; `from_address` stored lowercased.
- `folder_state.uidvalidity` is TEXT (imapflow returns BigInt).
- Dates stored as ISO strings; `ORDER BY date DESC` relies on that format.
- Reactive query dedupes by Message-ID in JS because Gmail indexes the same message in INBOX *and* All Mail.
- The renderer treats the index as source of truth: `mail:message` marks seen in both IMAP and DB; `mail:delete` deletes in both.
- One sync per account at a time (`syncing` Set in main.js) — don't remove the guard; parallel syncs deadlock on the shared connection's mailbox locks.

## Change log

### 2026-07-07 — db.searchAll + resetIndex; configurable sync interval
**Changes:** `db.searchAll(accountId, query)` — global search across all folders of an account, deduped by Message-ID (backs the new title-bar search via `mail:searchAll`). `db.resetIndex()` — drops all `messages` + `folder_state` rows so the next sync rebuilds from scratch (backs Settings → "Rebuild mail index"). The 5-min background-sync `setInterval` moved behind `main.js rescheduleSync()`, reading `syncIntervalMinutes` from the new `settings.json` prefs store so the interval is user-configurable. See [settings.md](settings.md).

### 2026-07-07 — Initial doc
**Goal:** replace live-IMAP listing (slow, capped at 50) with a local index after the user hit a 23k-message inbox.
**Changes:** added db.js/sync.js/scheduler; `mail:messages|search|reactive` handlers switched to DB; preload gained `syncNow`/`onSyncEvent`.
**Result:** folder loads went from ~500ms/page to ~0ms; ~48k messages indexed across two accounts; first full index takes a few minutes, thereafter seconds.
**Not done / out of scope:** body text is not indexed (see [search.md](search.md)); no IMAP IDLE push (5-min polling).
