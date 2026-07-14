# Feature: Media bar (status bar now-playing)

Per-feature AI doc. Read before touching the status bar now-playing widget.

## What it is
System now-playing widget (Spotify / Apple Music) in Mercury's status bar,
ported from the "device" source of Lithium's media bar
(`~/lithium-projects/Lithium/src/main/media.js` + `src/renderer/music.js`).
Only the device part was ported — no lofi player, volume slider, or source toggle.

## Key files
| File | Role |
|---|---|
| `src/main/media.js` | JXA/osascript bridge: `nowPlaying()`, `control(action, position)` |
| `src/main/ipc.js` | `media:nowPlaying`, `media:control` handlers (bottom of registerIpc) |
| `src/preload.js` | `mediaNowPlaying`, `mediaControl` |
| `src/renderer/js/media.js` | 3s poll loop, controls, click-to-seek, show/hide |
| `src/renderer/index.html` | `#status-media` inside `.status-group` in the footer |
| `src/renderer/styles.css` | `.status-media` block after `#status-left .unread` |

## Specifics (do NOT regress)
- Hide only after **2 consecutive null polls** — osascript intermittently
  exceeds its 3s execFile timeout (observed: one 3245ms call) and a single
  null must not blank the widget (flicker).
- Footer must keep exactly two flex children (`.status-group`, `#status-sync`)
  for `space-between` to hold; new status items go inside `.status-group`.
- macOS-only by design; null polls elsewhere just keep it hidden.
- Progress extrapolates between polls (1s interval) using `lastPoll` timestamp;
  playing-state icon flips optimistically on click, next poll corrects.

## Verification recipe (worked 2026-07-10)
- `node -e "require('.../src/main/media.js').nowPlaying().then(console.log)"`
  exercises the osascript bridge standalone.
- Launch `MAIL_DEBUG=1 npx electron . --remote-debugging-port=9223`, then drive
  the renderer over CDP (`Runtime.evaluate`, `Page.captureScreenshot`) — no
  window focus stealing. Note: `window.mailApi` is contextBridge-frozen, cannot
  be monkeypatched from CDP; drive real DOM events instead (a dispatched click
  on `#media-bar` really seeks Spotify).

## Change log

### 2026-07-10 - feat: port device media bar from Lithium into the status bar
**Goal:** User wanted Lithium's media bar (device part only) next to the unread
counts in Mercury's bottom bar.
**Changes:** New main-process `media.js` (Spotify/Music JXA), IPC + preload
plumbing, renderer `media.js`, footer markup restructured into `.status-group`,
status-bar CSS. Added flicker guard (2 empty polls before hiding) found during
live verification.
**Result:** Track title, prev/play-pause/next, accent progress bar with
click-to-seek in the status bar; verified end-to-end incl. a real seek.
**Out of scope:** Windows/Linux media sessions, album art, volume control.
