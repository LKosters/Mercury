# Feature: Done

Per-feature AI doc for **Mercury** (email-app).

## What it is
A per-message "done" checkmark: hovering a list row (or the reader's "Mark done" button) checks an email off. Done mail disappears from the inbox view and collects in a permanent built-in **Done** folder pinned at the top of the Reactive sidebar section. Purely local; orthogonal to reactive folders (a message can be in both).

## Key files
| File | Role |
|---|---|
| `src/main/done.js` | Store: `userData/done.json` — records keyed by (accountId, messageId) with an envelope snapshot |
| `src/renderer/js/done.js` | `toggleDone`, `selectDone`, `renderDoneList`, `updateDoneButton`, reader button |
| `src/renderer/js/list.js` | Row check button; done filter inside `fetchPage` (inbox only) |

## Specifics (do NOT regress)
- **Identity is the Message-ID header**, not folder+uid — it survives the message moving between folders. Messages without a Message-ID cannot be tracked; `toggleDone` surfaces that as an error toast instead of guessing.
- Done records store an **envelope snapshot** (subject/from/date/folder/uid) so the Done view renders without any server or index lookup. The stored folder+uid are used to open the body; a stale uid (message moved since) shows an in-pane error — acceptable, don't "fix" by re-searching on every render.
- The Done folder is a **pseudo-view**: `state.reactiveId === '__done__'`. It short-circuits everywhere — refresh handler, `loadReactive` guard, search (local filter). Check for the sentinel when adding view logic.
- Done filtering of the inbox applies **always** (independent of any reactive folder's hide toggle).
- `state.doneIds` (a Set) must stay in sync with `state.done` — update both on every mutation.
- Un-marking from the inbox context reloads the inbox so the message reappears.

## Change log

### 2026-07-07 — Initial doc
**Goal:** capture the done feature: inbox-zero workflow without touching the server.
**Changes:** done store + IPC; hover check on rows; reader button; pinned Done pseudo-folder; inbox filtering; per-account scoping.
**Result:** check an inbox mail → it vanishes from the inbox instantly and lives in Done; unchecking restores it.
**Not done / out of scope:** bulk mark-done; auto-done rules; syncing done-state across machines.
