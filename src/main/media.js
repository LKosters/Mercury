// System now-playing bridge (macOS): reads and controls Spotify / Apple Music
// via osascript, same approach as Lithium's "device" media source. The status
// bar polls media:nowPlaying; controls go through media:control.

const { execFile } = require('child_process');

const NOW_PLAYING_DEBOUNCE_MS = 800;

function runOsaAsync(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 3000 }, (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout.trim());
    });
  });
}

const NOW_PLAYING_SCRIPT = `
var apps = Application("System Events").processes().map(p => p.name());
var result = null;

if (apps.indexOf("Spotify") !== -1) {
  try {
    var sp = Application("Spotify");
    var st = sp.playerState();
    if (st === "playing" || st === "paused") {
      var t = sp.currentTrack;
      result = JSON.stringify({
        title: t.name() + (t.artist() ? " \\u2014 " + t.artist() : ""),
        duration: t.duration() / 1000,
        position: sp.playerPosition(),
        playing: st === "playing",
        app: "Spotify"
      });
    }
  } catch(e) {}
}

if (!result && apps.indexOf("Music") !== -1) {
  try {
    var mu = Application("Music");
    var st = mu.playerState();
    if (st === "playing" || st === "paused") {
      var t = mu.currentTrack;
      result = JSON.stringify({
        title: t.name() + (t.artist() ? " \\u2014 " + t.artist() : ""),
        duration: t.duration(),
        position: mu.playerPosition(),
        playing: st === "playing",
        app: "Music"
      });
    }
  } catch(e) {}
}

result || "null";
`;

let _cache = { data: null, ts: 0 };

async function nowPlaying() {
  const now = Date.now();
  if (now - _cache.ts < NOW_PLAYING_DEBOUNCE_MS) return _cache.data;

  const raw = await runOsaAsync(NOW_PLAYING_SCRIPT);
  let data = null;
  if (raw && raw !== 'null') {
    try { data = JSON.parse(raw); } catch { /* stale/garbled osascript output */ }
  }
  _cache = { data, ts: Date.now() };
  return data;
}

async function control(action, position) {
  const appName = _cache.data && _cache.data.app;
  if (!appName) return false;

  const safePosition = Number.isFinite(Number(position)) ? Number(position) : 0;

  const actionLine =
    action === 'toggle' ? 'a.playpause();' :
    action === 'next'   ? 'a.nextTrack();' :
    action === 'prev'   ? 'a.previousTrack();' :
    action === 'seek'   ? `a.playerPosition = ${safePosition};` : '';

  const script = `
    try {
      var a = Application("${appName}");
      ${actionLine}
      true;
    } catch(e) { false; }
  `;
  const result = await runOsaAsync(script);
  return result === 'true';
}

module.exports = { nowPlaying, control };
