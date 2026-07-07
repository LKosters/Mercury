const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

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
const accounts = require('./accounts');
const mail = require('./mail');
const reactive = require('./reactive');
const done = require('./done');
const db = require('./db');
const sync = require('./sync');

let win;

function createWindow() {
  // On macOS the window is transparent with native vibrancy (Liquid Glass);
  // elsewhere fall back to a solid background.
  const glassOptions =
    process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          vibrancy: 'under-window',
          visualEffectState: 'active',
          backgroundColor: '#00000000',
        }
      : { backgroundColor: '#101014' };

  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 600,
    ...glassOptions,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links (target="_blank" and links inside emails) in the default browser.
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

  // Surface renderer console errors in the terminal for debugging.
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`);
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

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

// ---- Index sync orchestration ----

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC ----

const DEBUG = process.env.MAIL_DEBUG === '1';

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    const started = Date.now();
    try {
      const data = await fn(...args);
      if (DEBUG) console.log(`[ipc] ${channel} ok in ${Date.now() - started}ms`);
      return { ok: true, data };
    } catch (err) {
      console.error(`[ipc] ${channel} failed in ${Date.now() - started}ms:`, err.stack || String(err));
      return { ok: false, error: err.message || String(err) };
    }
  });
}

handle('accounts:list', () => accounts.listAccounts());
handle('accounts:add', (input) => {
  const account = accounts.addAccount(input);
  runSync(account.id); // start indexing the new account right away
  return account;
});
handle('accounts:remove', (id) => {
  db.deleteAccount(id);
  return accounts.removeAccount(id);
});

handle('sync:now', (accountId) => {
  runSync(accountId); // fire and forget; progress arrives via sync:event
  return true;
});

handle('accounts:test', async (input) => {
  const account = accounts.buildTransient(input);
  await mail.testConnection(account);
  return true;
});

handle('mail:folders', (accountId) => mail.listFolders(accounts.getAccount(accountId)));

handle('mail:messages', (accountId, folderPath, limit, offset) =>
  db.listMessages(accountId, folderPath, limit, offset)
);

handle('mail:message', async (accountId, folderPath, uid) => {
  const message = await mail.getMessage(accounts.getAccount(accountId), folderPath, uid);
  db.markSeen(accountId, folderPath, uid);
  if (DEBUG) {
    // Dump rendered HTML locally so rendering issues can be reproduced outside the app.
    const dir = process.env.MAIL_DEBUG_DIR || path.join(app.getPath('userData'), 'debug-emails');
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${uid}.html`), message.html || `<pre>${message.text}</pre>`);
    } catch {}
  }
  return message;
});

handle('mail:delete', async (accountId, folderPath, uid) => {
  await mail.deleteMessage(accounts.getAccount(accountId), folderPath, uid);
  db.deleteMessage(accountId, folderPath, uid);
  return true;
});

handle('mail:send', (accountId, message) => mail.sendMessage(accounts.getAccount(accountId), message));

handle('mail:search', (accountId, folderPath, query) =>
  db.searchMessages(accountId, folderPath, query)
);

handle('mail:reactive', (accountId, folderId) =>
  db.reactiveMessages(accountId, reactive.get(folderId).senders)
);

handle('reactive:list', (accountId) => reactive.list(accountId));
handle('reactive:create', (name, accountId) => reactive.create(name, accountId));
handle('reactive:delete', (id) => reactive.remove(id));
handle('reactive:addSender', (id, address) => reactive.addSender(id, address));
handle('reactive:removeSender', (id, address) => reactive.removeSender(id, address));
handle('reactive:setHidden', (id, hidden) => reactive.setHidden(id, hidden));
handle('reactive:rename', (id, name) => reactive.rename(id, name));

handle('done:list', (accountId) => done.list(accountId));
handle('done:add', (record) => done.add(record));
handle('done:remove', (accountId, messageId) => done.remove(accountId, messageId));

handle('mail:saveAttachment', async (accountId, folderPath, uid, index) => {
  const att = await mail.getAttachment(accounts.getAccount(accountId), folderPath, uid, index);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: att.filename || 'attachment',
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, att.content);
  return filePath;
});
