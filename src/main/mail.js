const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

function imapClient(account) {
  return new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure,
    auth: { user: account.user, pass: account.password },
    logger: false,
  });
}

/* ---------- Connection pool ----------
 * One persistent IMAP connection per account, reused across operations.
 * Connecting to a server takes 1-3s (TCP + TLS + auth), so doing it per
 * operation makes every click feel slow. */

const pools = new Map(); // poolKey -> Promise<ImapFlow>

function poolKey(account) {
  return account.id || `${account.user}@${account.imap.host}`;
}

async function getClient(account) {
  const key = poolKey(account);
  const existing = pools.get(key);
  if (existing) {
    try {
      const client = await existing;
      if (client.usable) return client;
    } catch {
      // fall through and reconnect
    }
    pools.delete(key);
  }

  const promise = (async () => {
    const client = imapClient(account);
    client.on('error', () => {}); // prevent unhandled 'error' from crashing the app
    client.on('close', () => {
      if (pools.get(key) === promise) pools.delete(key);
    });
    await client.connect();
    return client;
  })();

  pools.set(key, promise);
  try {
    return await promise;
  } catch (err) {
    pools.delete(key);
    throw err;
  }
}

async function withImap(account, fn) {
  let client = await getClient(account);
  try {
    return await fn(client);
  } catch (err) {
    if (client.usable) throw err; // genuine error, connection is fine
    // Connection dropped mid-operation (idle timeout, network blip) — retry once.
    pools.delete(poolKey(account));
    client = await getClient(account);
    return fn(client);
  }
}

/* ---------- Caches ---------- */

const FOLDER_TTL = 5 * 60 * 1000;
const folderCache = new Map(); // poolKey -> { folders, boxes, at }

async function getBoxes(account) {
  const key = poolKey(account);
  const cached = folderCache.get(key);
  if (cached && Date.now() - cached.at < FOLDER_TTL) return cached.boxes;
  const boxes = await withImap(account, (client) => client.list());
  folderCache.set(key, { boxes, at: Date.now() });
  return boxes;
}

const MSG_CACHE_MAX = 50;
const msgCache = new Map(); // `${poolKey}:${folder}:${uid}` -> parsed message

function cacheMessage(key, value) {
  if (msgCache.size >= MSG_CACHE_MAX) {
    msgCache.delete(msgCache.keys().next().value); // evict oldest
  }
  msgCache.set(key, value);
}

/* ---------- Operations ---------- */

async function testConnection(account) {
  const client = imapClient(account);
  client.on('error', () => {});
  await client.connect();
  await client.logout().catch(() => client.close());
  await smtpTransport(account).verify();
}

async function listFolders(account) {
  const boxes = await getBoxes(account);
  return boxes
    .filter((b) => !(b.flags && b.flags.has('\\Noselect')))
    .map((b) => ({
      path: b.path,
      name: b.name,
      specialUse: b.specialUse || (b.path.toUpperCase() === 'INBOX' ? '\\Inbox' : null),
    }));
}

function addressToPlain(addr) {
  if (!addr) return [];
  const values = addr.value || [];
  return values.map((v) => ({ name: v.name || '', address: v.address || '' }));
}

const ENVELOPE_QUERY = { envelope: true, flags: true, uid: true, internalDate: true };

function mapEnvelope(msg) {
  const env = msg.envelope || {};
  const from = (env.from && env.from[0]) || {};
  const recipients = [...(env.to || []), ...(env.cc || [])]
    .map((a) => a.address || '')
    .filter(Boolean)
    .join(' ');
  return {
    uid: msg.uid,
    messageId: env.messageId || '',
    recipients,
    subject: env.subject || '(no subject)',
    from: { name: from.name || '', address: from.address || '' },
    date: (env.date || msg.internalDate || new Date(0)).toISOString(),
    seen: msg.flags ? msg.flags.has('\\Seen') : true,
    flagged: msg.flags ? msg.flags.has('\\Flagged') : false,
  };
}

async function fetchEnvelopesByUid(client, uids) {
  if (!uids.length) return [];
  const messages = [];
  for await (const msg of client.fetch(uids.join(','), ENVELOPE_QUERY, { uid: true })) {
    messages.push(mapEnvelope(msg));
  }
  messages.sort((a, b) => new Date(b.date) - new Date(a.date));
  return messages;
}

async function fetchParsed(client, uid) {
  const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
  if (!msg || !msg.source) throw new Error('Message not found');
  return simpleParser(msg.source);
}

async function getMessage(account, folderPath, uid) {
  const cacheKey = `${poolKey(account)}:${folderPath}:${uid}`;
  if (msgCache.has(cacheKey)) return msgCache.get(cacheKey);

  const message = await withImap(account, async (client) => {
    const lock = await client.getMailboxLock(folderPath);
    try {
      const parsed = await fetchParsed(client, uid);

      let html = parsed.html || parsed.textAsHtml || '';
      const attachments = parsed.attachments || [];

      // Inline cid: references (embedded images) as data URIs.
      for (const att of attachments) {
        if (!att.contentId) continue;
        const cid = att.contentId.replace(/[<>]/g, '');
        if (html.includes(`cid:${cid}`)) {
          const dataUri = `data:${att.contentType};base64,${att.content.toString('base64')}`;
          html = html.split(`cid:${cid}`).join(dataUri);
        }
      }

      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});

      return {
        uid,
        subject: parsed.subject || '(no subject)',
        from: addressToPlain(parsed.from)[0] || { name: '', address: '' },
        to: addressToPlain(parsed.to),
        cc: addressToPlain(parsed.cc),
        date: (parsed.date || new Date(0)).toISOString(),
        messageId: parsed.messageId || '',
        html,
        text: parsed.text || '',
        attachments: attachments
          .map((a, index) => ({
            index,
            filename: a.filename || 'attachment',
            size: a.size || 0,
            contentType: a.contentType || 'application/octet-stream',
            inline: !!a.contentId,
          }))
          .filter((a) => !a.inline),
      };
    } finally {
      lock.release();
    }
  });

  cacheMessage(cacheKey, message);
  return message;
}

async function getAttachment(account, folderPath, uid, index) {
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(folderPath);
    try {
      const parsed = await fetchParsed(client, uid);
      const att = (parsed.attachments || [])[index];
      if (!att) throw new Error('Attachment not found');
      return { filename: att.filename || 'attachment', content: att.content };
    } finally {
      lock.release();
    }
  });
}

async function deleteMessage(account, folderPath, uid) {
  msgCache.delete(`${poolKey(account)}:${folderPath}:${uid}`);
  const boxes = await getBoxes(account);
  const trash = boxes.find((b) => b.specialUse === '\\Trash');
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(folderPath);
    try {
      if (trash && trash.path !== folderPath) {
        await client.messageMove(String(uid), trash.path, { uid: true });
      } else {
        await client.messageDelete(String(uid), { uid: true });
      }
      return true;
    } finally {
      lock.release();
    }
  });
}

function smtpTransport(account) {
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.password },
  });
}

async function sendMessage(account, message) {
  const transport = smtpTransport(account);
  const info = await transport.sendMail({
    from: { name: account.name, address: account.email },
    to: message.to,
    cc: message.cc || undefined,
    bcc: message.bcc || undefined,
    subject: message.subject,
    text: message.text,
    html: message.html || undefined,
    inReplyTo: message.inReplyTo || undefined,
    references: message.inReplyTo || undefined,
  });

  // Best effort: append a copy to the Sent folder (Gmail does this itself;
  // most custom servers do not).
  try {
    const boxes = await getBoxes(account);
    const sent = boxes.find((b) => b.specialUse === '\\Sent');
    if (sent) {
      const raw = buildRawMessage(account, message);
      await withImap(account, (client) => client.append(sent.path, raw, ['\\Seen']));
    }
  } catch {
    // Sending succeeded; failing to file a copy is not an error.
  }

  return { messageId: info.messageId };
}

function buildRawMessage(account, message) {
  const lines = [
    `From: "${account.name}" <${account.email}>`,
    `To: ${message.to}`,
    message.cc ? `Cc: ${message.cc}` : null,
    `Subject: ${message.subject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    message.text,
  ].filter((l) => l !== null);
  return lines.join('\r\n');
}

module.exports = {
  testConnection,
  listFolders,
  getMessage,
  getAttachment,
  deleteMessage,
  sendMessage,
  // shared IMAP plumbing for the sync engine
  withImap,
  getBoxes,
  fetchEnvelopesByUid,
};
