# Feature: Reading pane

Per-feature AI doc for **Mercury** (email-app). Read this before touching message display — the iframe setup encodes hard-won bug fixes.

## What it is
The right pane: message headers (subject, sender avatar, recipients, date), action buttons (Done / Tag sender / Reply / Delete), attachment chips, and the email body rendered in a sandboxed iframe. Bodies are fetched live from IMAP (with an in-memory LRU cache in mail.js) and parsed with mailparser.

## Key files
| File | Role |
|---|---|
| `src/renderer/js/reader.js` | `openMessage`, header/attachment rendering, body iframe |
| `src/main/mail.js` | `getMessage` (fetch + parse + cid-image inlining + mark seen), `getAttachment`, message cache |
| `src/renderer/index.html` | CSP meta tag that governs what email content may load |

## Specifics (do NOT regress) — the iframe rules
The body iframe configuration is the product of a long white-screen debugging saga. Each attribute matters:

- **Recreate the iframe element per message** (`old.replaceWith(frame)`). Reusing one iframe eventually produced a permanently white frame.
- **`sandbox="allow-same-origin allow-popups"` — keep `allow-same-origin`, never add `allow-scripts`.** Without `allow-same-origin` the frame gets an opaque origin, Chromium isolates it into a separate process (OOPIF), and macOS compositing intermittently paints it white (`SharedImageManager: Invalid mailbox` GPU errors). Same-origin keeps it in-process. It stays safe because scripts are still blocked; enabling both `allow-scripts` + `allow-same-origin` would be a sandbox escape.
- **`<base href="https://email.invalid/" target="_blank">`** in the srcdoc: protocol-relative URLs (`//cdn.x.com/img.png`) would otherwise resolve to `file://` and be blocked; `target="_blank"` routes link clicks through `setWindowOpenHandler` → default browser.
- **CSP in index.html is inherited by the srcdoc.** `img-src`/`font-src`/`style-src` deliberately allow `https:`/`http:` so real-world marketing mail renders. Tightening these will silently break email display.
- The iframe background stays **solid white** by design — HTML email assumes white; don't theme it.
- `openMessage` uses an `openSequence` counter to discard slow responses when the user clicks another message first.
- Embedded `cid:` images are inlined as data URIs in `mail.js#getMessage` before the HTML reaches the renderer.

## Change log

### 2026-07-07 — Initial doc
**Goal:** capture the display pipeline and the white-frame fixes (verified with isolated Electron repro harnesses).
**Changes:** per-message iframe recreation; same-origin sandbox; base-tag URL fixing; loading/error states shown in-pane instead of vanishing toasts.
**Result:** all email types render, including heavy marketing mail; a run of one-line system emails ("Error:260 Order already exists") that looked like blank pages turned out to be their real content.
**Not done / out of scope:** remote-image blocking toggle (privacy); print view.
