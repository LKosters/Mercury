# Feature: Done (checkmarks + Done pseudo-folder)

Per-feature AI doc. Read before touching the done workflow. The canonical, fuller doc is
`docs/done.md` in the repo — keep both updated.

## What it is
Per-message local "done" checkmark keyed by Message-ID (userData/done.json). Done mail is
filtered out of the Inbox view and count, and collects in a `__done__` pseudo-folder.

## Key files
| File | Role |
|---|---|
| `src/main/done.js` | JSON store, `list/add/remove/exportAll/importAll` |
| `src/main/db.js` | `stats()` — inbox badge counts, excludes hidden senders + done IDs |
| `src/main/ipc.js` | `mail:stats` handler assembles hidden senders + done IDs |
| `src/renderer/js/done.js` | `toggleDone`, Done view, calls `updateStats()` after toggles |
| `src/renderer/js/status.js` | `updateStats()` → `state.stats` → sidebar badges |

## Specifics (do NOT regress)
- `inboxVisibleUnread` (filtered Inbox badge) excludes done message IDs; `inboxUnread`
  (Complete Inbox badge) intentionally does NOT — that view shows done mail.
- Done identity is the Message-ID header; rows with `message_id = ''` in SQLite can never
  match a done record, which is correct.
- Renderer import cycle done.js ↔ status.js ↔ sidebar.js ↔ list.js is benign (all calls
  are inside functions) — don't "fix" it by moving imports around.

## Change log

### 2026-07-10 - fix: done mail not removed from inbox count
**Goal:** badge overcounted — done mail left the list but not `stats.inboxVisibleUnread`.
**Changes:** `db.stats(accountId, hiddenSenders, doneMessageIds)` new 3rd param with
`message_id NOT IN (...)`; `mail:stats` passes `done.list(accountId)` IDs; renderer
`toggleDone` now ends with `updateStats()`.
**Result:** badge matches the filtered Inbox immediately on check/uncheck.
**Out of scope:** Complete Inbox badge semantics unchanged.
