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
- `maybeFillViewport()` keeps loading pages when filters empty out a page — without it the scroll trigger never fires on a heavily-filtered inbox.
- Mid-flight guard: `loadMessages`/`loadMore` capture `accountId:folderPath` and discard stale responses after `await`.
- Inbox-only filtering: hidden senders and done messages are removed only when the *inbox* is selected (`isInboxSelected()`), never in other folders or search.
- Tag chips (`senderTags`) cap at 2 per row and are hidden inside the reactive folder being viewed.
- `loadMessages(quiet=true)` refreshes without the loading flash — used by background sync; sync only refreshes when the list is scrolled near the top.

## Change log

### 2026-07-07 — Initial doc
**Goal:** capture the list as built: 50-message live fetch → paged infinite scroll → SQLite-backed pages.
**Changes:** PAGE_SIZE 200 from local index; targeted row updates replaced full re-renders; reactive tag chips on rows; done-check button per row.
**Result:** smooth scrolling through a 23k-message inbox.
**Not done / out of scope:** row virtualization (unnecessary below ~50k loaded rows); multi-select/bulk actions.
