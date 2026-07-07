# Feature: Search

Per-feature AI doc for **Mercury** (email-app).

## What it is
The pill search bar lives inside the message-list pane, directly above the All/Unread/Reactive segmented filter (below the folder title). Enter runs the search; the × (or Enter on empty) restores the normal list. Folder views query the SQLite index (instant, whole folder history); reactive/Done views filter their already-loaded aggregate in memory.

## Key files
| File | Role |
|---|---|
| `src/renderer/js/search.js` | Input handlers, `runSearch`, `clearSearch` |
| `src/main/db.js` | `searchMessages` — `LIKE` over subject / from_name / from_address / recipients, `ESCAPE '\'`, limit 500 |

## Specifics (do NOT regress)
- **Body text is NOT searched** — the index stores envelopes only. This was an accepted tradeoff when search moved from IMAP `SEARCH` to the local index. If body search is requested, add a server-side fallback rather than bloating the index.
- `%`/`_`/`\` in the query are escaped before the LIKE — keep the escaping or wildcards leak in.
- Search results carry a `folder` field per row; opening one uses `item.folder` (see `openMessage`), since results are folder-scoped views of index rows.
- While a search is active: infinite scroll is disabled (`loadMore` checks the input), and background sync must not refresh the view (`sync.js` checks the input too).
- `state.baseMessages` holds the pre-search list; clearing search restores it without refetching.
- Row tag chips (reactive folder membership) show in results — that behavior was explicitly requested.

## Change log

### 2026-07-07 — Added a title-bar global search (alongside the list search)
**Goal:** search across every folder of the account, not just the open one.
**Changes:** new `#global-search` field in the title bar (`titlebar.js`), backed by `db.searchAll(accountId, query)` (all folders, deduped by Message-ID like reactive) via `mail:searchAll` IPC + `searchAllMessages` preload. Enter runs it; results carry their `folder` so click-through opens correctly (reader uses `item.folder`). ⌘F now focuses this global field (was the list-pane `#search-input`); the list search stays for per-folder filtering ("Search this folder"). New `state.globalSearch` flag guards `sync.js` and is reset by `list.js` (`exitGlobalSearch` in `loadMessages`/`withListLoading`) so navigating to a folder supersedes the search and background refresh resumes. Removed the list search's now-wrong ⌘F hint.
**Result:** two search scopes — title bar = all mail, list = this folder.
**Not done:** search is per-account (current account only), not across all accounts at once.

### 2026-07-07 — Moved search into the list pane
**Goal:** search should read as belonging to the inbox list, not the app title bar.
**Changes:** relocated the `.search-bar` element out of `.titlebar` into `.message-list-pane`, above the `#segmented` filter; full-width via `.message-list-pane .search-bar` override (`width:auto; margin:0 20px 10px`). Placeholder now "Search this folder". IDs (`search-input`/`search-clear`) unchanged, so search.js, the ⌘F handler (app.js), and the loadMore/sync guards keep working untouched.
**Result:** search input sits directly above the list; ⌘F still focuses it.

### 2026-07-07 — Initial doc
**Goal:** capture search after its migration from live IMAP SEARCH to the local index.
**Changes:** pill UI in list pane; index-backed instant search; local filtering for aggregate views; recipients column added to the index for to/cc matching.
**Result:** instant search over ~50k messages.
**Not done / out of scope:** body search; cross-folder search; search operators (from:, has:attachment).
