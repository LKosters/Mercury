# Feature: Accounts

Per-feature AI doc for **Mercury** (email-app). Read this before touching account management.

## What it is
Multi-account support for any IMAP/SMTP server, with a Gmail preset. Accounts are stored locally with passwords encrypted through the OS keychain (`safeStorage`). Each account gets its own IMAP connection pool, SQLite index partition, reactive folders, and done-list.

## Key files
| File | Role |
|---|---|
| `src/main/accounts.js` | Store (`userData/accounts.json`), encrypt/decrypt passwords, `getAccount(id)` returns decrypted account for main-process use only |
| `src/main/ipc.js` | `accounts:*` handlers; `accounts:add` kicks an index sync; `accounts:remove` also wipes the account's DB rows |
| `src/renderer/js/sidebar.js` | Account list UI, add-account modal, Gmail/custom presets, test-connection button |
| `src/main/mail.js` | `testConnection()` used by the modal's Test button |

## Specifics (do NOT regress)
- **CRITICAL: never rename the internal app name.** `safeStorage` derives its macOS Keychain entry from Electron's app name (`email-app`, from package.json `name`). Setting `productName` or calling `app.setName()` breaks decryption of ALL stored passwords (this happened during the Mercury rebrand and was reverted). Branding is visual-only; `userData` is pinned explicitly to `~/Library/Application Support/Mercury` in `main.js`.
- Passwords never cross the IPC boundary: `listAccounts()` strips secrets; only `getAccount()` (main-side) decrypts.
- Gmail requires an **app password** (the modal shows a hint + link to https://myaccount.google.com/apppasswords). Preset: imap.gmail.com:993 SSL / smtp.gmail.com:465 SSL.
- `username` defaults to the email address when left empty.
- Fallback when keychain encryption is unavailable: base64 with `encrypted: false` flag — keep the flag logic when touching the store.

## Change log

### 2026-07-07 — Initial doc
**Goal:** capture the feature as built during the initial development sessions.
**Changes:** account store with safeStorage; add/remove/test IPC; Gmail preset + app-password hint/link; per-account scoping of reactive folders and done-list; account removal wipes index rows; new accounts start indexing immediately.
**Result:** two Gmail accounts in daily use.
**Not done / out of scope:** OAuth "Sign in with Google" (app passwords only); password re-encryption migration for a future packaged app whose name differs.
