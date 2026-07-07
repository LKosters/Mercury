const db = require('./db');
const { withImap, getBoxes, fetchEnvelopesByUid } = require('./mail');

// Keeps the local SQLite index (db.js) in sync with the IMAP server.
// - First run of a folder: full envelope download in chunks.
// - After that: only new messages, deletions, and flag changes on recent mail.
// UIDVALIDITY changes force a full resync of that folder (per the IMAP spec,
// all cached UIDs become meaningless when it changes).

const CHUNK = 500;
const FLAG_REFRESH = 500; // how many recent messages get their flags rechecked

async function syncFolder(account, folderPath, emit) {
  await withImap(account, async (client) => {
    const lock = await client.getMailboxLock(folderPath);
    try {
      const accountId = account.id;
      const uidValidity = String(client.mailbox.uidValidity || '');
      const state = db.getFolderState(accountId, folderPath);

      if (!client.mailbox.exists) {
        db.clearFolder(accountId, folderPath);
        db.setFolderState(accountId, folderPath, uidValidity, 0);
        return;
      }

      const uids = (await client.search({ uid: '1:*' }, { uid: true })) || [];
      const maxUid = uids.reduce((a, b) => (b > a ? b : a), 0);
      const newestFirst = [...uids].sort((a, b) => b - a);
      const fresh = !state || state.uidvalidity !== uidValidity;

      if (fresh) db.clearFolder(accountId, folderPath);

      // Which UIDs do we still need envelopes for?
      const toFetch = fresh
        ? newestFirst
        : newestFirst.filter((uid) => uid > (state.last_uid || 0));

      for (let i = 0; i < toFetch.length; i += CHUNK) {
        const chunk = toFetch.slice(i, i + CHUNK);
        const rows = await fetchEnvelopesByUid(client, chunk);
        db.upsertMessages(accountId, folderPath, rows);
        emit({
          type: 'folder-progress',
          accountId,
          folder: folderPath,
          done: Math.min(i + CHUNK, toFetch.length),
          total: toFetch.length,
        });
      }

      if (!fresh) {
        // Remove messages deleted on the server, refresh flags on recent mail.
        db.pruneFolder(accountId, folderPath, uids);
        const recent = newestFirst.slice(0, FLAG_REFRESH);
        if (recent.length) {
          const flagRows = [];
          for await (const msg of client.fetch(
            recent.join(','),
            { flags: true, uid: true },
            { uid: true }
          )) {
            flagRows.push({
              uid: msg.uid,
              seen: msg.flags ? msg.flags.has('\\Seen') : true,
              flagged: msg.flags ? msg.flags.has('\\Flagged') : false,
            });
          }
          db.updateFlags(accountId, folderPath, flagRows);
        }
      }

      db.setFolderState(accountId, folderPath, uidValidity, maxUid);
    } finally {
      lock.release();
    }
  });
}

async function syncAccount(account, emit) {
  const boxes = await getBoxes(account);
  const folders = boxes
    .filter((b) => !(b.flags && b.flags.has('\\Noselect')))
    .map((b) => ({ path: b.path, specialUse: b.specialUse }));

  // Inbox first (what the user is looking at), then all-mail (feeds reactive
  // folders), then the rest.
  const rank = (f) =>
    f.path.toUpperCase() === 'INBOX' ? 0 : f.specialUse === '\\All' ? 1 : 2;
  folders.sort((a, b) => rank(a) - rank(b));

  for (const folder of folders) {
    try {
      await syncFolder(account, folder.path, emit);
      emit({ type: 'folder-done', accountId: account.id, folder: folder.path });
    } catch (err) {
      emit({
        type: 'folder-error',
        accountId: account.id,
        folder: folder.path,
        error: err.message,
      });
    }
  }
  emit({ type: 'account-done', accountId: account.id });
}

module.exports = { syncAccount, syncFolder };
