const { ipcMain, dialog, shell, app } = require('electron');
const fs = require('fs');
const path = require('path');
const accounts = require('./accounts');
const mail = require('./mail');
const reactive = require('./reactive');
const done = require('./done');
const db = require('./db');
const settings = require('./settings');

const BACKUP_VERSION = 1;

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

// getWindow: () => BrowserWindow — for dialogs.
// runSync: (accountId) => void — kicks a background index sync of one account.
// syncAll: () => void — kicks a background sync of every account.
// rescheduleSync: () => void — re-reads the sync interval and reschedules.
function registerIpc({ getWindow, runSync, syncAll, rescheduleSync }) {
  /* Accounts */
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
  handle('accounts:test', async (input) => {
    await mail.testConnection(accounts.buildTransient(input));
    return true;
  });

  /* Sync */
  handle('sync:now', (accountId) => {
    runSync(accountId); // fire and forget; progress arrives via sync:event
    return true;
  });

  /* Mail — list/search/reactive read from the local index; bodies and
   * mutations go to the IMAP server. */
  handle('mail:folders', (accountId) => mail.listFolders(accounts.getAccount(accountId)));

  handle('mail:messages', (accountId, folderPath, limit, offset) =>
    db.listMessages(accountId, folderPath, limit, offset)
  );

  handle('mail:search', (accountId, folderPath, query) =>
    db.searchMessages(accountId, folderPath, query)
  );

  handle('mail:searchAll', (accountId, query) => db.searchAll(accountId, query));

  handle('mail:reactive', (accountId, folderId) =>
    db.reactiveMessages(accountId, reactive.get(folderId).senders)
  );

  handle('mail:message', async (accountId, folderPath, uid) => {
    const message = await mail.getMessage(accounts.getAccount(accountId), folderPath, uid);
    db.markSeen(accountId, folderPath, uid);
    return message;
  });

  handle('mail:delete', async (accountId, folderPath, uid) => {
    await mail.deleteMessage(accounts.getAccount(accountId), folderPath, uid);
    db.deleteMessage(accountId, folderPath, uid);
    return true;
  });

  handle('mail:send', (accountId, message) => mail.sendMessage(accounts.getAccount(accountId), message));

  handle('mail:stats', (accountId) => db.stats(accountId));

  handle('reactive:counts', (accountId) => {
    const counts = {};
    for (const rf of reactive.list(accountId)) counts[rf.id] = db.reactiveCount(accountId, rf.senders);
    return counts;
  });

  handle('mail:saveAttachment', async (accountId, folderPath, uid, index) => {
    const att = await mail.getAttachment(accounts.getAccount(accountId), folderPath, uid, index);
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      defaultPath: att.filename || 'attachment',
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, att.content);
    return filePath;
  });

  /* Reactive folders */
  handle('reactive:list', (accountId) => reactive.list(accountId));
  handle('reactive:create', (name, accountId) => reactive.create(name, accountId));
  handle('reactive:delete', (id) => reactive.remove(id));
  handle('reactive:addSender', (id, address) => reactive.addSender(id, address));
  handle('reactive:removeSender', (id, address) => reactive.removeSender(id, address));
  handle('reactive:setHidden', (id, hidden) => reactive.setHidden(id, hidden));
  handle('reactive:rename', (id, name) => reactive.rename(id, name));

  /* Done */
  handle('done:list', (accountId) => done.list(accountId));
  handle('done:add', (record) => done.add(record));
  handle('done:remove', (accountId, messageId) => done.remove(accountId, messageId));

  /* Settings & preferences */
  handle('settings:getPrefs', () => settings.get());
  handle('settings:setPrefs', (patch) => {
    const next = settings.set(patch);
    rescheduleSync(); // pick up a changed sync interval immediately
    return next;
  });

  handle('settings:info', () => ({
    version: app.getVersion(),
    dataDir: app.getPath('userData'),
    accounts: accounts.listAccounts().length,
  }));

  handle('settings:revealData', async () => {
    await shell.openPath(app.getPath('userData'));
    return true;
  });

  handle('settings:rebuildIndex', () => {
    db.resetIndex();
    syncAll(); // fire-and-forget; progress streams to the renderer as usual
    return true;
  });

  /* Backup: export/import accounts + reactive folders + done state. The bundle
   * contains DECRYPTED account passwords (safeStorage is machine-bound, so the
   * file has to be portable) — the renderer warns before writing it. */
  handle('settings:export', async () => {
    const bundle = {
      app: 'Mercury',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      accounts: accounts.exportAccounts(),
      reactiveFolders: reactive.exportAll(),
      done: done.exportAll(),
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Export Mercury backup',
      defaultPath: path.join(app.getPath('downloads'), `mercury-backup-${stamp}.json`),
      filters: [{ name: 'Mercury backup', extensions: ['json'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2));
    return {
      path: filePath,
      accounts: bundle.accounts.length,
      reactiveFolders: bundle.reactiveFolders.length,
      done: bundle.done.length,
    };
  });

  handle('settings:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      title: 'Import Mercury backup',
      properties: ['openFile'],
      filters: [{ name: 'Mercury backup', extensions: ['json'] }],
    });
    if (canceled || !filePaths.length) return null;
    let bundle;
    try {
      bundle = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    } catch {
      throw new Error('That file is not a valid Mercury backup.');
    }
    if (!bundle || (!bundle.accounts && !bundle.reactiveFolders && !bundle.done)) {
      throw new Error('That file does not look like a Mercury backup.');
    }
    const accountResult = accounts.importAccounts(bundle.accounts || []);
    const reactiveCount = reactive.importAll(bundle.reactiveFolders || []);
    const doneCount = done.importAll(bundle.done || []);
    syncAll(); // index any newly imported accounts
    return {
      accounts: accountResult,
      reactiveFolders: reactiveCount,
      done: doneCount,
    };
  });
}

module.exports = { registerIpc, DEBUG };
