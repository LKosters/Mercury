const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');

// Local SQLite index of message envelopes across all accounts and folders.
// The sync engine (sync.js) keeps it up to date; every list/search/reactive
// view reads from here instead of the IMAP server.

let db;

function init() {
  if (db) return db;
  db = new Database(path.join(app.getPath('userData'), 'mail-index.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      uid INTEGER NOT NULL,
      message_id TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      from_name TEXT DEFAULT '',
      from_address TEXT DEFAULT '',
      recipients TEXT DEFAULT '',
      date TEXT DEFAULT '',
      seen INTEGER DEFAULT 1,
      flagged INTEGER DEFAULT 0,
      PRIMARY KEY (account_id, folder, uid)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_list ON messages(account_id, folder, date DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(account_id, from_address);
    CREATE TABLE IF NOT EXISTS folder_state (
      account_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      uidvalidity TEXT DEFAULT '',
      last_uid INTEGER DEFAULT 0,
      synced_at TEXT DEFAULT '',
      PRIMARY KEY (account_id, folder)
    );
  `);
  return db;
}

function toMessage(row) {
  return {
    uid: row.uid,
    messageId: row.message_id,
    subject: row.subject,
    from: { name: row.from_name, address: row.from_address },
    date: row.date,
    seen: !!row.seen,
    flagged: !!row.flagged,
    folder: row.folder,
  };
}

function upsertMessages(accountId, folder, rows) {
  const d = init();
  const stmt = d.prepare(`
    INSERT INTO messages (account_id, folder, uid, message_id, subject, from_name, from_address, recipients, date, seen, flagged)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, folder, uid) DO UPDATE SET
      seen = excluded.seen, flagged = excluded.flagged
  `);
  d.transaction(() => {
    for (const m of rows) {
      stmt.run(
        accountId,
        folder,
        m.uid,
        m.messageId || '',
        m.subject || '',
        m.from?.name || '',
        (m.from?.address || '').toLowerCase(),
        m.recipients || '',
        m.date || '',
        m.seen ? 1 : 0,
        m.flagged ? 1 : 0
      );
    }
  })();
}

function updateFlags(accountId, folder, flagRows) {
  const d = init();
  const stmt = d.prepare(
    'UPDATE messages SET seen = ?, flagged = ? WHERE account_id = ? AND folder = ? AND uid = ?'
  );
  d.transaction(() => {
    for (const r of flagRows) stmt.run(r.seen ? 1 : 0, r.flagged ? 1 : 0, accountId, folder, r.uid);
  })();
}

// Delete indexed messages that no longer exist on the server.
function pruneFolder(accountId, folder, presentUids) {
  const d = init();
  const present = new Set(presentUids);
  const existing = d
    .prepare('SELECT uid FROM messages WHERE account_id = ? AND folder = ?')
    .all(accountId, folder)
    .map((r) => r.uid);
  const missing = existing.filter((uid) => !present.has(uid));
  const stmt = d.prepare('DELETE FROM messages WHERE account_id = ? AND folder = ? AND uid = ?');
  d.transaction(() => {
    for (const uid of missing) stmt.run(accountId, folder, uid);
  })();
  return missing.length;
}

function clearFolder(accountId, folder) {
  init().prepare('DELETE FROM messages WHERE account_id = ? AND folder = ?').run(accountId, folder);
}

function deleteAccount(accountId) {
  const d = init();
  d.prepare('DELETE FROM messages WHERE account_id = ?').run(accountId);
  d.prepare('DELETE FROM folder_state WHERE account_id = ?').run(accountId);
}

function listMessages(accountId, folder, limit = 200, offset = 0) {
  const d = init();
  const total = d
    .prepare('SELECT COUNT(*) AS c FROM messages WHERE account_id = ? AND folder = ?')
    .get(accountId, folder).c;
  const rows = d
    .prepare(
      'SELECT * FROM messages WHERE account_id = ? AND folder = ? ORDER BY date DESC LIMIT ? OFFSET ?'
    )
    .all(accountId, folder, limit, offset);
  return { messages: rows.map(toMessage), total, hasMore: offset + rows.length < total };
}

function reactiveMessages(accountId, senders, limit = 1000) {
  if (!senders.length) return [];
  const d = init();
  const placeholders = senders.map(() => '?').join(',');
  const rows = d
    .prepare(
      `SELECT * FROM messages WHERE account_id = ? AND from_address IN (${placeholders})
       ORDER BY date DESC LIMIT ?`
    )
    .all(accountId, ...senders.map((s) => s.toLowerCase()), limit);
  // The same message can be indexed in several folders (e.g. Gmail INBOX and
  // All Mail) — dedupe by Message-ID, keeping the first (newest) hit.
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = row.message_id || `${row.folder}:${row.uid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(toMessage(row));
  }
  return result;
}

function searchMessages(accountId, folder, query, limit = 500) {
  const d = init();
  const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = d
    .prepare(
      `SELECT * FROM messages WHERE account_id = ? AND folder = ? AND (
         subject LIKE ? ESCAPE '\\' OR from_name LIKE ? ESCAPE '\\' OR
         from_address LIKE ? ESCAPE '\\' OR recipients LIKE ? ESCAPE '\\'
       ) ORDER BY date DESC LIMIT ?`
    )
    .all(accountId, folder, like, like, like, like, limit);
  return rows.map(toMessage);
}

function markSeen(accountId, folder, uid) {
  init()
    .prepare('UPDATE messages SET seen = 1 WHERE account_id = ? AND folder = ? AND uid = ?')
    .run(accountId, folder, uid);
}

function deleteMessage(accountId, folder, uid) {
  init()
    .prepare('DELETE FROM messages WHERE account_id = ? AND folder = ? AND uid = ?')
    .run(accountId, folder, uid);
}

function getFolderState(accountId, folder) {
  return init()
    .prepare('SELECT * FROM folder_state WHERE account_id = ? AND folder = ?')
    .get(accountId, folder);
}

function setFolderState(accountId, folder, uidvalidity, lastUid) {
  init()
    .prepare(
      `INSERT INTO folder_state (account_id, folder, uidvalidity, last_uid, synced_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id, folder) DO UPDATE SET
         uidvalidity = excluded.uidvalidity, last_uid = excluded.last_uid, synced_at = excluded.synced_at`
    )
    .run(accountId, folder, String(uidvalidity), lastUid, new Date().toISOString());
}

module.exports = {
  upsertMessages,
  updateFlags,
  pruneFolder,
  clearFolder,
  deleteAccount,
  listMessages,
  reactiveMessages,
  searchMessages,
  markSeen,
  deleteMessage,
  getFolderState,
  setFolderState,
};
