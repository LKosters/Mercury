# Feature: Message list

Per-feature AI doc for **Mercury** (email-app). Read this before touching the middle pane.

## What it is
The middle pane: paginated message rows (avatar, sender, subject, date, done-check, reactive-folder tag chips) with infinite scroll over the local index, plus the client-side inbox filters (hidden senders, done messages).

## Key files
| File | Role |
|---|---|
| `src/renderer/js/list.js` | Everything: row building, pagination, filters, targeted DOM updates |
| `src/renderer/js/state.js` | `PAGE_SIZE` (200), `messages`, `baseMessages`, `listOffset`, `hasMore` |
| `src/main/db.js` | `listMessages(accountId, folder, limit, offset)` backing the pages |

## Specifics (do NOT regress)
- **Pagination offset counts RAW (unfiltered) rows.** `fetchPage` filters hidden/done messages *after* fetching; `state.listOffset` must advance by `page.raw`, not the filtered length, or pages skip/overlap.
- **Never rebuild the whole list on interaction.** With thousands of rows, `renderMessages()` is for view switches only. Row-level updates: `markRowActive(uid)`, `removeRowByUid(uid)`, done-check class toggles. Keep it that way.
- **`min-height: 0` CSS trap:** the grid panes and `.message-list` need `min-height: 0` or the layout grows past the viewport and *nothing scrolls* (this bug shipped once). See `styles.css` comments.
- `maybeFillViewport()` keeps loading pages when filters empty out a page — without it the scroll trigger never fires on a heavily-filtered inbox. It must be called **after** `loadingMore` is reset (outside `loadMore`'s try/finally) — calling it while the flag is still set makes the recursive `loadMore()` hit the re-entrancy guard and caps auto-fill at one extra page.
- Mid-flight guard: `loadMessages`/`loadMore` capture `accountId:folderPath` and discard stale responses after `await`.
- Inbox-only filtering: hidden senders and done messages are removed only when the *inbox* is selected (`isInboxSelected()`), never in other folders or search. The Static **Complete Inbox** view (`state.completeInbox`) selects the same inbox mailbox but sets the flag, so `fetchPage` skips both filters — it shows every inbox message including reactive-hidden and done mail.
- Tag chips (`senderTags`) cap at 2 per row and are hidden inside the reactive folder being viewed.
- `loadMessages(quiet=true)` refreshes without the loading flash — used by background sync; sync only refreshes when the list is scrolled near the top.

## Change log

### 2026-07-10 — fix: viewport auto-fill capped at one extra page
**Goal:** a heavily filtered inbox (many reactive-hidden senders + done mail) rendered ~14 rows, never grew a scrollbar, and stopped loading — pagination was unreachable. Root cause: `loadMore()` called `maybeFillViewport()` inside its `try` block while `loadingMore` was still `true`, so the recursive `loadMore()` bailed on the re-entrancy guard.
**Changes:** `loadMore()` sets a `loaded` flag, resets `loadingMore` in `finally`, and only then re-checks `maybeFillViewport()`; skipped on error/stale context so a persistent failure can't retry-loop.
**Result:** the auto-fill chain keeps fetching raw pages until the visible list overflows the viewport (or the folder is exhausted), so the scrollbar always appears.

### 2026-07-07 — Static sidebar section (Inbox + Complete Inbox)
**Changes:** new pinned **Static** section above Folders (`#static-list`, rendered by `renderStatic()` in `sidebar.js`, called from `renderFolders`). Two entries: **Inbox** (delegates to `selectFolder` on the inbox mailbox — same as the Folders inbox) and **Complete Inbox** (`selectCompleteInbox` sets `state.completeInbox`, selects the inbox mailbox, and `fetchPage` skips the hidden-sender/done filters). `state.completeInbox` is reset by `selectFolder`/`selectReactive`/`selectDone`/`resetPanes`; folder + static active states exclude it. `done.js` keeps done rows visible when marking done in Complete Inbox. Reuses existing `.folder-list`/`.nav-item` styling (no new CSS).

### 2026-07-07 — Removed the All/Unread/Reactive segmented filter
**Changes:** removed the segmented control and the title-bar cycle button per user preference. Deleted `#segmented`/`.seg` markup and CSS, `state.listFilter`, `setListFilter`, the filter branch in `fetchPage` (only the inbox hidden/done filters remain), the `.seg`/`filter-btn` handlers and `FILTER_CYCLE` in `app.js`, and the `$('segmented')` show/hide calls in `sidebar.js`/`reactive.js`/`done.js`.

### 2026-07-07 — Redesign: segmented filter, tags row, counts
**Changes:** segmented All/Unread/Reactive filter (`state.listFilter`, applied in `fetchPage` after the hidden/done filters — raw-offset rule still holds); tag chips moved to a third grid row (`grid-template-areas` gained "tags"); header shows "N messages" (`updateListCount` from the DB total); segmented hidden in reactive/done views; title-bar filter button cycles the filter.

### 2026-07-07 — Initial doc
**Goal:** capture the list as built: 50-message live fetch → paged infinite scroll → SQLite-backed pages.
**Changes:** PAGE_SIZE 200 from local index; targeted row updates replaced full re-renders; reactive tag chips on rows; done-check button per row.
**Result:** smooth scrolling through a 23k-message inbox.
**Not done / out of scope:** row virtualization (unnecessary below ~50k loaded rows); multi-select/bulk actions.
