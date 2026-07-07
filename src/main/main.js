const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const accounts = require('./accounts');
const sync = require('./sync');
const { registerIpc, DEBUG } = require('./ipc');

// NOTE: the internal app name stays "email-app" — Electron's safeStorage
// derives its Keychain entry from it, so renaming would orphan every stored
// account password. The Mercury branding is applied to everything visible
// (title, wordmark, dock icon) instead.

// Data (accounts, index, tags) originally lived under "email-app"; migrate it
// to the Mercury directory once, then pin userData explicitly.
try {
  const appData = app.getPath('appData');
  const oldDir = path.join(appData, 'email-app');
  const newDir = path.join(appData, 'Mercury');
  if (!fs.existsSync(newDir) && fs.existsSync(oldDir)) fs.renameSync(oldDir, newDir);
  app.setPath('userData', newDir);
} catch {
  // fall back to the default userData location
}

let win;

function createWindow() {
  // Frameless title bar on macOS with traffic lights centered in the 64px
  // custom title bar; solid warm-dark background (2026-07 redesign — the
  // earlier vibrancy/glass look was replaced by this flat theme).
  const chromeOptions =
    process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 20, y: 24 },
          backgroundColor: '#1d1619',
        }
      : { backgroundColor: '#1d1619' };

  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 600,
    ...chromeOptions,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links (target="_blank" and links inside emails) in the
  // default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url);
    }
  });

  if (DEBUG) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`);
    });
  }

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

/* ---------- Background index sync ---------- */

const syncing = new Set();

function sendSyncEvent(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('sync:event', payload);
}

async function runSync(accountId) {
  if (syncing.has(accountId)) return;
  syncing.add(accountId);
  try {
    await sync.syncAccount(accounts.getAccount(accountId), sendSyncEvent);
  } catch (err) {
    sendSyncEvent({ type: 'account-error', accountId, error: err.message });
  } finally {
    syncing.delete(accountId);
  }
}

function syncAll() {
  for (const account of accounts.listAccounts()) runSync(account.id);
}

/* ---------- Lifecycle ---------- */

registerIpc({ getWindow: () => win, runSync });

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const icon = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    if (fs.existsSync(icon)) app.dock.setIcon(icon);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Background index sync: shortly after launch, then every 5 minutes.
  setTimeout(syncAll, 2000);
  setInterval(syncAll, 5 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
