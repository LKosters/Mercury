// Status bar now-playing widget — the "device" part of Lithium's media bar.
// Polls the system player (Spotify / Apple Music) via the main process and
// shows prev / play-pause / next, the track title, and a click-to-seek bar.
// The widget hides itself entirely when no player has a current track.

import { api } from './api.js';
import { $ } from './utils.js';

const POLL_MS = 3000;

const media = {
  playing: false,
  duration: 0,
  position: 0,
  lastPoll: 0,
  pollInFlight: false,
  emptyPolls: 0,
};

function setVisible(visible) {
  $('status-media').classList.toggle('hidden', !visible);
}

function updatePlayButton() {
  $('media-icon-play').classList.toggle('hidden', media.playing);
  $('media-icon-pause').classList.toggle('hidden', !media.playing);
  $('status-media').classList.toggle('playing', media.playing);
}

function renderProgress() {
  if (media.duration > 0) {
    let pos = media.position;
    // Extrapolate between polls so the bar moves smoothly while playing.
    if (media.playing && media.lastPoll) pos += (Date.now() - media.lastPoll) / 1000;
    const pct = Math.min(100, (pos / media.duration) * 100);
    $('media-progress').style.width = `${pct}%`;
  } else {
    $('media-progress').style.width = '0%';
  }
}

async function poll() {
  if (media.pollInFlight) return;
  media.pollInFlight = true;
  let info = null;
  try {
    info = await api.mediaNowPlaying();
  } catch {
    // media info is cosmetic; ignore transient failures
  }
  media.pollInFlight = false;

  if (!info) {
    // osascript occasionally times out and yields a one-off null; only hide
    // after two consecutive empty polls so the widget doesn't flicker.
    media.emptyPolls += 1;
    if (media.emptyPolls < 2) return;
    media.playing = false;
    media.duration = 0;
    media.position = 0;
    updatePlayButton();
    setVisible(false);
    return;
  }
  media.emptyPolls = 0;

  const title = $('media-title');
  title.textContent = info.title || 'Unknown';
  title.title = info.title || '';
  media.playing = info.playing;
  media.duration = info.duration;
  media.position = info.position;
  media.lastPoll = Date.now();
  updatePlayButton();
  renderProgress();
  setVisible(true);
}

$('media-play').addEventListener('click', () => {
  // Flip the icon immediately so the button feels instant; the next poll corrects it.
  media.playing = !media.playing;
  updatePlayButton();
  api.mediaControl('toggle').then(poll).catch(() => {});
});

$('media-prev').addEventListener('click', () => {
  api.mediaControl('prev').then(poll).catch(() => {});
});

$('media-next').addEventListener('click', () => {
  api.mediaControl('next').then(poll).catch(() => {});
});

$('media-bar').addEventListener('click', (e) => {
  if (media.duration <= 0) return;
  const rect = $('media-bar').getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  api.mediaControl('seek', pct * media.duration).then(poll).catch(() => {});
});

setInterval(renderProgress, 1000);
setInterval(poll, POLL_MS);
poll();
