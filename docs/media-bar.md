# Media bar (status bar now-playing widget)

System now-playing widget in the status bar, ported from the "device" source of
Lithium's media bar (`~/lithium-projects/Lithium`). Shows the track currently
playing in Spotify or Apple Music with prev / play-pause / next controls, the
track title, and a click-to-seek progress bar. Sits in the status bar directly
right of the message/unread counts, separated by a border. Hides itself when no
player has a current track.

## Key files

| File | Role |
|---|---|
| `src/main/media.js` | osascript (JXA) bridge: `nowPlaying()` reads Spotify/Music state, `control(action, position)` sends toggle/next/prev/seek |
| `src/main/ipc.js` | `media:nowPlaying` and `media:control` handlers |
| `src/preload.js` | `mediaNowPlaying()`, `mediaControl(action, position)` |
| `src/renderer/js/media.js` | Poll loop, button/seek wiring, show/hide |
| `src/renderer/index.html` | `#status-media` markup inside `.status-group` in the footer |
| `src/renderer/styles.css` | `.status-media`, `.media-btn`, `.media-track`, `.media-bar` |

## How it works

- The renderer polls `media:nowPlaying` every 3s. The main process runs a JXA
  script through `osascript` (3s timeout, 800ms result cache) that checks
  Spotify first, then Apple Music, and returns
  `{title, duration, position, playing, app}` or `null`.
- Controls go through `media:control`; the target app is whichever player the
  last successful poll saw (cached in main). Seek maps a click's X-fraction on
  the bar to `playerPosition`.
- Progress extrapolates between polls with a 1s interval while playing, so the
  bar moves smoothly without polling faster.
- Play/pause flips the icon optimistically before the IPC round-trip, then the
  next poll corrects it.

## Specifics (do NOT regress)

- **macOS only** — it shells out to `osascript`. On other platforms every poll
  resolves `null` and the widget simply never shows; don't add platform errors.
- **Hide only after 2 consecutive empty polls.** `osascript` intermittently
  exceeds its 3s timeout (observed live), which yields a one-off `null`;
  hiding on the first one makes the widget flicker out every few minutes.
- The first poll ever triggers macOS automation-permission prompts
  ("Mercury/Electron wants to control Spotify / System Events"). Denying them
  just means the widget stays hidden — no error surface.
- Media info is cosmetic: all IPC failures are swallowed, same policy as
  `status.js` stats.
- The footer keeps `justify-content: space-between` with exactly two children:
  `.status-group` (counts + media) and `#status-sync`. Add status-bar items
  inside `.status-group`, not as new footer children, or the sync indicator
  drifts.

## Change log

### 2026-07-10 - feat: system now-playing widget in the status bar
**Goal:** Bring the "device" part of Lithium's media bar (Spotify/Apple Music
now-playing + controls) into Mercury's status bar next to the unread counts.
**Changes:** New `src/main/media.js` (JXA bridge, ported from Lithium's
`src/main/media.js`), `media:*` IPC handlers, preload methods, new renderer
module `src/renderer/js/media.js`, `#status-media` markup, status-bar CSS.
Only the device source was ported — no lofi player, no volume slider, no
source toggle.
**Result:** Track title, prev/play-pause/next, and a click-to-seek progress
bar (accent-colored while playing) appear in the status bar whenever Spotify
or Apple Music has a current track; verified live including a UI seek that
moved Spotify's real position.
**Out of scope:** Windows/Linux media session support, album art, volume.
