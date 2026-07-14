# Feature: Message list (pagination / infinite scroll)

Per-feature AI doc. Fuller doc: `docs/message-list.md` — keep both updated.

## What it is
Middle pane rows with infinite scroll over the local SQLite index; client-side inbox
filters (reactive-hidden senders + done) applied per page in `fetchPage`.

## Key files
| File | Role |
|---|---|
| `src/renderer/js/list.js` | rows, `fetchPage`, `loadMessages`, `loadMore`, `maybeFillViewport` |
| `src/renderer/js/state.js` | `PAGE_SIZE` 200, `listOffset` (RAW rows), `hasMore` |

## Specifics (do NOT regress)
- `state.listOffset` advances by RAW page length, not filtered length.
- `maybeFillViewport()` must run AFTER `loadingMore` is reset — inside `loadMore`'s try
  block the recursive call hits the re-entrancy guard and auto-fill stops at one extra
  page; a filtered inbox then never grows a scrollbar and pagination is unreachable.
- Only re-check viewport fill on success (`loaded` flag) — refilling after an error
  would retry-loop forever on a persistent failure.

## Change log

### 2026-07-10 - fix: auto-fill capped at one page → unscrollable filtered inbox
**Goal:** user saw ~14 rows in a 7.7k-message inbox with no scrollbar and no way to load
more (Spam reactive folder hides 6.4k senders; done filter removes more).
**Changes:** in `loadMore()` moved `maybeFillViewport()` out of the try block, behind a
`loaded` success flag, after `finally { loadingMore = false }`.
**Result:** pages keep loading until the list overflows the viewport or folder exhausts.
