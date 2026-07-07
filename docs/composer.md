# Feature: Composer

Per-feature AI doc for **Mercury** (email-app). Read this before touching compose/reply/send.

## What it is
A Gmail-style composer: a card docked bottom-right (not a modal), with a dark clickable header (minimize/close), To/Cc/Bcc rows (Cc/Bcc revealed via links), subject row, a `contenteditable` rich-text body with a small formatting toolbar, pill Send button, and Cmd/Ctrl+Enter to send. Replies quote the original message as an HTML blockquote with the caret placed above it.

## Key files
| File | Role |
|---|---|
| `src/renderer/js/composer.js` | All composer UI + submit |
| `src/main/mail.js` | `sendMessage` (nodemailer), best-effort append to the Sent folder |
| `src/renderer/index.html` | `#composer` markup |
| `src/renderer/styles.css` | `.composer*` styles |

## Specifics (do NOT regress)
- Sends **both** `html` (`editor.innerHTML`) and `text` (`editor.innerText`) — nodemailer builds the multipart. Don't drop the text part.
- Formatting buttons use `document.execCommand` on **`mousedown` with `preventDefault()`** — a `click` handler would steal the editor selection and format nothing. execCommand is deprecated but is the only no-dependency option; if it ever breaks, replace with a Selection/Range implementation.
- Reply quoting embeds the original message's full HTML in a `<blockquote>`; caret is collapsed to the start of the editor so typing lands above the quote (Gmail behavior).
- Threading: `inReplyTo`/`references` are set from the original Message-ID (`state.replyContext`).
- Escape **minimizes** the composer (doesn't close/discard) — drafts survive until Close/Discard/Send. There is no draft persistence beyond that.
- Sent-folder copy: Gmail files sent mail itself; for custom servers `sendMessage` appends a plain-text copy to the `\Sent` folder best-effort (failure is swallowed deliberately).
- Only one composer instance exists; opening a new compose resets it.

## Change log

### 2026-07-07 — Initial doc
**Goal:** capture the composer after its rebuild from a centered modal to the Gmail-style docked card.
**Changes:** docked card + minimize; Cc/Bcc reveal links; contenteditable body + B/I/U/list/clear toolbar; HTML sending; blockquote reply quoting; Cmd+Enter send.
**Result:** compose/reply UX comparable to Gmail's.
**Not done / out of scope:** attachments on outgoing mail; link insertion UI; draft autosave; the appended Sent copy is text-only.
