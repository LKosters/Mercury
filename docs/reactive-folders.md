# Feature: Reactive folders

Per-feature AI doc for **Mercury** (email-app). This is the app's signature custom feature.

## What it is
App-local virtual folders driven by tagged **senders**: tag a sender into a reactive folder and all their mail (across the whole mailbox, any folder) aggregates there automatically. Optionally a folder can hide its senders' mail from the inbox view (Gmail-tabs-like). Nothing is written to the mail server — invisible to other clients. Folders are per-account, have a color, and can be renamed.

## Key files
| File | Role |
|---|---|
| `src/main/reactive.js` | Store: `userData/reactive-folders.json` — id, name, accountId, color, senders[], hideFromInbox |
| `src/main/db.js` | `reactiveMessages(accountId, senders)` — single indexed SQL query, deduped by Message-ID |
| `src/renderer/js/reactive.js` | Sidebar section, tag-sender menu, create modal, manage modal (rename/hide/senders) |
| `src/renderer/js/list.js` | `hiddenSenders()` filter in `fetchPage`; tag chips on rows |

## Specifics (do NOT regress)
- Sender addresses are stored and compared **lowercased** everywhere.
- `hideFromInbox` filtering happens renderer-side in `fetchPage` and applies **only when the inbox is selected** — other folders, search, the reactive folders themselves, and the Static **Complete Inbox** view (`state.completeInbox`) always show everything.
- Every mutation that can change inbox visibility (tag, untag, toggle hide, delete folder) refreshes the inbox if it's the current view — keep those `loadMessages()` calls.
- The reactive list in the sidebar always renders the built-in **Done** entry first (`state.reactiveId === '__done__'`, see [done.md](done.md)); it is not a real reactive folder and must stay non-deletable.
- Per-account: `reactive.list(accountId)` also migrates legacy unowned folders by assigning them to the first account that lists — leave the migration in place.
- Data flows through the local index, so a brand-new sender appears in the folder only after the next sync cycle (≤5 min or manual refresh).
- Folder color comes from a fixed palette by creation order; row chips derive their tint via `color-mix(... 18%, transparent)`.

## Change log

### 2026-07-08 — Inbox badge excludes reactive-hidden mail; Complete Inbox shows full count
**Goal:** the Static/Folders **Inbox** unread badge should match what the filtered inbox actually shows, and the full unread count moves to **Complete Inbox**.
**Changes:** `db.stats(accountId, hiddenSenders)` now also returns `inboxVisibleUnread` (unread INBOX minus `from_address IN (hidden senders)`); `mail:stats` IPC gathers the union of `hideFromInbox` senders from `reactive.list()` and passes them in. Sidebar: Static Inbox + Folders Inbox badges use `inboxVisibleUnread`; Complete Inbox now shows `inboxUnread` (full). Every reactive mutation that changes the hidden-sender set (tag/untag/hide-toggle/delete) now calls `updateStats()` so the badges refresh immediately instead of waiting for the next sync.
**Result:** Inbox count reflects the filtered view; Complete Inbox carries the total.
**Out of scope:** the badge stays an *unread* count and does not subtract Done mail (only reactive-hidden senders).

### 2026-07-07 — Complete Inbox bypasses hide-from-inbox
**Changes:** new Static-section "Complete Inbox" view (`state.completeInbox`, see [message-list.md](message-list.md)) selects the inbox mailbox but tells `fetchPage` to skip the hidden-sender and done filters, so reactive-hidden mail still appears there. Regular Inbox behavior is unchanged.

### 2026-07-07 — Initial doc
**Goal:** capture the feature: user-invented "reactive folders" concept.
**Changes (accumulated):** sender tagging via reader menu; create/manage modals; hide-from-inbox toggle; per-account scoping with legacy migration; rename; row tag chips; aggregation moved from live IMAP searches to one SQL query over the index.
**Result:** instant reactive folders spanning the entire mail history.
**Not done / out of scope:** rules beyond sender (subject/domain matching); drag-and-drop tagging; cross-account folders (deliberately removed — user wanted per-account).
