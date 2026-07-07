const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// "Done" is a per-message checkmark stored locally (keyed by Message-ID), with
// a snapshot of the envelope so the built-in Done folder can list messages
// without hitting the server. Nothing syncs to the mail server.

const storeFile = () => path.join(app.getPath('userData'), 'done.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  } catch {
    return [];
  }
}

function save(records) {
  fs.writeFileSync(storeFile(), JSON.stringify(records, null, 2));
}

function list(accountId) {
  return load()
    .filter((r) => r.accountId === accountId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function add(record) {
  if (!record || !record.accountId || !record.messageId) {
    throw new Error('Message has no Message-ID to track');
  }
  const records = load();
  const exists = records.some(
    (r) => r.accountId === record.accountId && r.messageId === record.messageId
  );
  if (!exists) {
    records.push({
      accountId: record.accountId,
      messageId: record.messageId,
      subject: record.subject || '(no subject)',
      from: record.from || { name: '', address: '' },
      date: record.date || new Date(0).toISOString(),
      folder: record.folder || 'INBOX',
      uid: record.uid,
      doneAt: new Date().toISOString(),
    });
    save(records);
  }
  return true;
}

function remove(accountId, messageId) {
  save(load().filter((r) => !(r.accountId === accountId && r.messageId === messageId)));
  return true;
}

module.exports = { list, add, remove };
