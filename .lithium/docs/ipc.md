# Feature: IPC layer

Per-feature AI doc. Read before touching `src/main/ipc.js` / `src/preload.js`.

## What it is
Single chokepoint for renderer↔main calls. Every handler is wrapped by `handle()`, which
returns `{ok, data|error}`; the preload unwraps to a throwing promise, so `error` strings
surface directly in toasts and empty-hints.

## Key files
| File | Role |
|---|---|
| `src/main/ipc.js` | `handle()` wrapper + all channel handlers |
| `src/preload.js` | `window.mailApi`, unwraps `{ok,...}` |

## Specifics (do NOT regress)
- `errorMessage()` flattens `AggregateError.errors` (Node net stack throws these with an
  EMPTY message when every server address fails). Without it the UI shows the bare string
  "AggregateError" instead of the real `ECONNREFUSED`/`ETIMEDOUT` cause. Keep any new
  error path going through `errorMessage()`.

## Change log

### 2026-07-10 - fix: unwrap AggregateError in IPC error responses
**Goal:** user saw a toast reading just "AggregateError" — Node's multi-address connect
failure has `message === ''`, so `err.message || String(err)` degraded to the class name.
**Changes:** added `errorMessage(err)` in ipc.js; `handle()` catch uses it.
**Result:** connection failures now show the underlying error message(s), deduped and
joined with "; ".
