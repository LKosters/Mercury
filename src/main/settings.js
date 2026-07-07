const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// App preferences (JSON store in userData). Currently just the background sync
// interval; the scheduler in main.js reads this and reschedules when it changes.

const storeFile = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  syncIntervalMinutes: 5,
};

function get() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(storeFile(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function set(patch) {
  const next = { ...get(), ...patch };
  // Clamp the interval to something sane (1 min .. 24 h).
  const mins = Number(next.syncIntervalMinutes);
  next.syncIntervalMinutes = Number.isFinite(mins) ? Math.min(1440, Math.max(1, mins)) : 5;
  fs.writeFileSync(storeFile(), JSON.stringify(next, null, 2));
  return next;
}

module.exports = { get, set };
