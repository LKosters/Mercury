const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

contextBridge.exposeInMainWorld('mailApi', {
  listAccounts: () => invoke('accounts:list'),
  addAccount: (input) => invoke('accounts:add', input),
  removeAccount: (id) => invoke('accounts:remove', id),
  testAccount: (input) => invoke('accounts:test', input),
  listFolders: (accountId) => invoke('mail:folders', accountId),
  listMessages: (accountId, folderPath, limit, offset) =>
    invoke('mail:messages', accountId, folderPath, limit, offset),
  getMessage: (accountId, folderPath, uid) => invoke('mail:message', accountId, folderPath, uid),
  deleteMessage: (accountId, folderPath, uid) => invoke('mail:delete', accountId, folderPath, uid),
  sendMessage: (accountId, message) => invoke('mail:send', accountId, message),
  saveAttachment: (accountId, folderPath, uid, index) =>
    invoke('mail:saveAttachment', accountId, folderPath, uid, index),
  searchMessages: (accountId, folderPath, query) => invoke('mail:search', accountId, folderPath, query),
  searchAllMessages: (accountId, query) => invoke('mail:searchAll', accountId, query),
  reactiveMessages: (accountId, folderId) => invoke('mail:reactive', accountId, folderId),
  reactiveList: (accountId) => invoke('reactive:list', accountId),
  reactiveCreate: (name, accountId) => invoke('reactive:create', name, accountId),
  reactiveDelete: (id) => invoke('reactive:delete', id),
  reactiveAddSender: (id, address) => invoke('reactive:addSender', id, address),
  reactiveRemoveSender: (id, address) => invoke('reactive:removeSender', id, address),
  reactiveSetHidden: (id, hidden) => invoke('reactive:setHidden', id, hidden),
  reactiveRename: (id, name) => invoke('reactive:rename', id, name),
  doneList: (accountId) => invoke('done:list', accountId),
  doneAdd: (record) => invoke('done:add', record),
  doneRemove: (accountId, messageId) => invoke('done:remove', accountId, messageId),
  syncNow: (accountId) => invoke('sync:now', accountId),
  mailStats: (accountId) => invoke('mail:stats', accountId),
  reactiveCounts: (accountId) => invoke('reactive:counts', accountId),
  getPrefs: () => invoke('settings:getPrefs'),
  setPrefs: (patch) => invoke('settings:setPrefs', patch),
  settingsInfo: () => invoke('settings:info'),
  revealDataDir: () => invoke('settings:revealData'),
  rebuildIndex: () => invoke('settings:rebuildIndex'),
  exportBackup: () => invoke('settings:export'),
  importBackup: () => invoke('settings:import'),
  mediaNowPlaying: () => invoke('media:nowPlaying'),
  mediaControl: (action, position) => invoke('media:control', action, position),
  checkForUpdates: () => invoke('updater:check'),
  downloadUpdate: (payload) => invoke('updater:downloadAndInstall', payload),
  openRelease: (url) => invoke('updater:openRelease', url),
  onUpdateProgress: (callback) => {
    ipcRenderer.on('updater:progress', (_event, percent) => callback(percent));
  },
  onSyncEvent: (callback) => {
    ipcRenderer.on('sync:event', (_event, data) => callback(data));
  },
});
