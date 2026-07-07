# Feature: First-run onboarding (welcome screen)

Per-feature AI doc for **Mercury** (email-app). Read this before touching the welcome overlay, the first-run flow, or how the app behaves with zero accounts.

## What it is
A full-window **`#welcome` overlay** shown whenever the app has **no accounts**. It carries the Mercury branding (floating planet + glow, wordmark) and two actions:
1. **Add an account** — hands off to the existing add-account modal (owned by `sidebar.js`).
2. **Import a backup…** — restores accounts + reactive folders + done-state from a Mercury backup file, reusing the Settings import flow.

The overlay appears on first launch, disappears the moment an account exists, and comes back if the last account is removed. It sits **above** the app UI (z-index 1900) but **below** the boot preloader (2000), so on a cold first start the user sees: preloader → fades → welcome screen.

## Key files
| File | Role |
|---|---|
| `src/renderer/index.html` | `#welcome` overlay markup (right before `<header class="titlebar">`) |
| `src/renderer/js/onboarding.js` | Shows/hides the overlay by account count; wires the two buttons + modal-dismiss/Escape re-show |
| `src/renderer/js/sidebar.js` | `renderAccounts()` dispatches the `accounts-changed` event that drives the overlay |
| `src/renderer/js/settings.js` | Exports `runImport()` — the shared backup-import routine (also used by the Settings "Import" button) |
| `src/renderer/js/app.js` | Side-effect imports `./onboarding.js` so its listeners register before boot |
| `src/renderer/styles.css` | `.welcome*` styles (just before the `prefers-reduced-motion` block) |

## How it wires together
- **Single chokepoint:** every account-list change (boot, add, remove, import) already goes through `sidebar.js` `renderAccounts()`. It dispatches a `window` `accounts-changed` event; `onboarding.js` listens and calls `refreshWelcome()`, which toggles `#welcome.hidden` on `state.accounts.length > 0`. This keeps onboarding **decoupled** from the account plumbing — no circular imports.
- **Add flow:** `#welcome-add` hides the overlay and clicks `#add-account-btn` (reuses the modal). On success, `renderAccounts()` fires → overlay stays hidden. On cancel/Escape, the modal-dismiss hooks in `onboarding.js` call `refreshWelcome()` → overlay returns (still 0 accounts).
- **Import flow:** `#welcome-import` awaits `runImport()` (from `settings.js`), which shows its own toast and reloads accounts on success; then `refreshWelcome()` reveals the app if anything was imported.

## Specifics (do NOT regress)
- **`renderAccounts()` must keep dispatching `accounts-changed`.** It's the only signal the welcome overlay listens to. If you add a new path that mutates `state.accounts`, route it through `renderAccounts()` (or dispatch the event yourself) or the overlay won't update.
- **`#welcome` z-index (1900) stays below the preloader (2000) and above the app.** The account modal (`.modal-backdrop`, z-index ~200) is *lower*, so the welcome screen deliberately **hides itself** before opening the modal rather than stacking under it.
- **`runImport()` in `settings.js` is shared** — keep it exported and returning a boolean (imported? vs cancelled). Both the Settings button and the welcome screen call it; don't inline it back.
- The overlay is `-webkit-app-region: drag` (window stays movable on first run) with `-webkit-app-region: no-drag` on `.welcome-actions` so the buttons are clickable. Preserve both if restyling.
- `#welcome` ships with the `hidden` class in the HTML so it never flashes before JS decides; don't remove that.
- Import still carries **plaintext passwords** in the backup file — same caveat as [settings.md](settings.md); the import re-encrypts on this machine.

## Change log

### 2026-07-07 — Initial first-run welcome screen
**Goal:** replace the bare "Add an account to get started" empty hint with a proper first-run experience, and surface backup-restore up front.
**Changes:** new `#welcome` overlay + `js/onboarding.js`; `renderAccounts()` now dispatches `accounts-changed`; extracted `runImport()` out of the Settings import click handler in `settings.js` and shared it; `app.js` imports the module; `.welcome*` styles matching the preloader's visual language. Shows on 0 accounts, hides once one exists, returns if the last is removed.
**Result:** launching with no accounts opens on a branded welcome screen offering "Add an account" or "Import a backup…". Verified: JS syntax checks pass and the app boots with no renderer errors. Visual layout not click-through-verified (only renders with zero accounts).
