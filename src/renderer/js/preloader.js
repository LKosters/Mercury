// Boot preloader control. The splash (#preloader) is in the initial HTML so it
// paints instantly; app.js calls hidePreloader() once the first load resolves.
// A minimum on-screen time keeps the fancy animation from flashing on fast
// boots, and the node is fully removed after its fade-out.

const MIN_ON_SCREEN_MS = 1100;
const FADE_MS = 600;
const startedAt = performance.now();

let hidden = false;

export function hidePreloader() {
  if (hidden) return;
  hidden = true;
  const el = document.getElementById('preloader');
  if (!el) return;
  const wait = Math.max(0, MIN_ON_SCREEN_MS - (performance.now() - startedAt));
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), FADE_MS);
  }, wait);
}
