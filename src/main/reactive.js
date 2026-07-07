const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Reactive folders are app-local virtual folders: a set of tagged sender
// addresses whose mail is aggregated on the fly. Nothing is written to the
// mail server, so they never sync to other clients.

const storeFile = () => path.join(app.getPath('userData'), 'reactive-folders.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  } catch {
    return [];
  }
}

function save(folders) {
  fs.writeFileSync(storeFile(), JSON.stringify(folders, null, 2));
}

const COLORS = ['#6d7cff', '#e0679a', '#4ab8a0', '#d9924a', '#9a6de0', '#5aa8e0', '#c25a5a'];

function list(accountId) {
  const folders = load();
  // Migrate folders created before accounts were scoped: the first account
  // that lists folders claims any unowned ones.
  let changed = false;
  for (const folder of folders) {
    if (!folder.accountId && accountId) {
      folder.accountId = accountId;
      changed = true;
    }
  }
  if (changed) save(folders);
  return folders.filter((f) => f.accountId === accountId);
}

function get(id) {
  const folder = load().find((f) => f.id === id);
  if (!folder) throw new Error('Reactive folder not found');
  return folder;
}

function create(name, accountId) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Folder name is required');
  if (!accountId) throw new Error('No account selected');
  const folders = load();
  const folder = {
    id: crypto.randomUUID(),
    name: trimmed,
    accountId,
    color: COLORS[folders.length % COLORS.length],
    senders: [],
    hideFromInbox: false,
  };
  folders.push(folder);
  save(folders);
  return folder;
}

function remove(id) {
  save(load().filter((f) => f.id !== id));
  return true;
}

function addSender(id, address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) throw new Error('No sender address');
  const folders = load();
  const folder = folders.find((f) => f.id === id);
  if (!folder) throw new Error('Reactive folder not found');
  if (!folder.senders.includes(normalized)) folder.senders.push(normalized);
  save(folders);
  return folder;
}

function removeSender(id, address) {
  const folders = load();
  const folder = folders.find((f) => f.id === id);
  if (!folder) throw new Error('Reactive folder not found');
  folder.senders = folder.senders.filter((s) => s !== String(address).toLowerCase());
  save(folders);
  return folder;
}

function rename(id, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Folder name is required');
  const folders = load();
  const folder = folders.find((f) => f.id === id);
  if (!folder) throw new Error('Reactive folder not found');
  folder.name = trimmed;
  save(folders);
  return folder;
}

function setHidden(id, hidden) {
  const folders = load();
  const folder = folders.find((f) => f.id === id);
  if (!folder) throw new Error('Reactive folder not found');
  folder.hideFromInbox = !!hidden;
  save(folders);
  return folder;
}

// All reactive folders (every account) for the backup bundle.
function exportAll() {
  return load();
}

// Merge reactive folders from a backup, upserting by id.
function importAll(incoming) {
  if (!Array.isArray(incoming)) return 0;
  const byId = new Map(load().map((f) => [f.id, f]));
  let count = 0;
  for (const f of incoming) {
    if (!f || !f.id || !f.name) continue;
    byId.set(f.id, {
      id: f.id,
      name: f.name,
      accountId: f.accountId || null,
      color: f.color || COLORS[0],
      senders: Array.isArray(f.senders) ? f.senders.map((s) => String(s).toLowerCase()) : [],
      hideFromInbox: !!f.hideFromInbox,
    });
    count++;
  }
  save([...byId.values()]);
  return count;
}

module.exports = {
  list,
  get,
  create,
  remove,
  addSender,
  removeSender,
  setHidden,
  rename,
  exportAll,
  importAll,
};
