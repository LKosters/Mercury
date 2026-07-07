const api = window.mailApi;

const state = {
  accounts: [],
  accountId: null,
  folders: [],
  folderPath: null,
  reactive: [], // reactive folder definitions
  reactiveId: null, // selected reactive folder ('__done__' = built-in Done folder)
  done: [], // done records for the current account
  doneIds: new Set(), // messageIds marked done
  messages: [],
  baseMessages: [], // unfiltered list backing the current view (for clearing search)
  listOffset: 0, // server-side offset of the next page
  hasMore: false, // more pages available in the current folder
  message: null, // currently open message
  openedFolder: null, // mailbox the open message lives in
  replyContext: null,
};

const $ = (id) => document.getElementById(id);

/* ---------- Utilities ---------- */

const AVATAR_COLORS = ['#6d7cff', '#e0679a', '#4ab8a0', '#d9924a', '#9a6de0', '#5aa8e0', '#c25a5a'];

function avatarColor(str) {
  let hash = 0;
  for (const ch of str) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name, address) {
  const source = (name || address || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatFullDate(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

let toastTimer;
function toast(message, kind = '') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

/* ---------- Folder icons ---------- */

const ICONS = {
  '\\Inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2" stroke-linejoin="round"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.5-7z" stroke-linejoin="round"/>',
  '\\Sent': '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" stroke-linejoin="round"/>',
  '\\Drafts': '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke-linejoin="round"/>',
  '\\Trash': '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke-linejoin="round"/>',
  '\\Junk': '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke-linejoin="round"/>',
  '\\Archive': '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" stroke-linejoin="round"/>',
  '\\All': '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" stroke-linejoin="round"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z" stroke-linejoin="round"/>',
};

function folderIcon(specialUse) {
  const paths = ICONS[specialUse] || ICONS.folder;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${paths}</svg>`;
}

const FOLDER_ORDER = ['\\Inbox', '\\Drafts', '\\Sent', '\\Archive', '\\All', '\\Junk', '\\Trash'];

function sortFolders(folders) {
  return [...folders].sort((a, b) => {
    const ai = a.specialUse ? FOLDER_ORDER.indexOf(a.specialUse) : 99;
    const bi = b.specialUse ? FOLDER_ORDER.indexOf(b.specialUse) : 99;
    if (ai !== bi) return ai - bi;
    return a.path.localeCompare(b.path);
  });
}

/* ---------- Rendering ---------- */

function renderAccounts() {
  const list = $('account-list');
  list.innerHTML = '';
  for (const account of state.accounts) {
    const btn = document.createElement('button');
    btn.className = `nav-item ${account.id === state.accountId ? 'active' : ''}`;

    const dot = document.createElement('span');
    dot.className = 'account-dot';
    dot.style.background = avatarColor(account.email);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = account.email;
    label.title = account.email;

    const remove = document.createElement('span');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.title = 'Remove account';
    remove.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove ${account.email}?`)) return;
      await api.removeAccount(account.id);
      state.accounts = state.accounts.filter((a) => a.id !== account.id);
      if (state.accountId === account.id) {
        state.accountId = state.accounts[0]?.id || null;
        state.accountId ? await selectAccount(state.accountId) : resetPanes();
      }
      renderAccounts();
    });

    btn.append(dot, label, remove);
    btn.addEventListener('click', () => selectAccount(account.id));
    list.appendChild(btn);
  }
}

function renderFolders() {
  const list = $('folder-list');
  list.innerHTML = '';
  for (const folder of sortFolders(state.folders)) {
    const btn = document.createElement('button');
    const active = folder.path === state.folderPath && !state.reactiveId;
    btn.className = `nav-item ${active ? 'active' : ''}`;
    btn.innerHTML = folderIcon(folder.specialUse);
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = folder.name;
    label.title = folder.path;
    btn.appendChild(label);
    btn.addEventListener('click', () => selectFolder(folder.path));
    list.appendChild(btn);
  }
}

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>';

function renderReactive() {
  const list = $('reactive-list');
  list.innerHTML = '';

  // Built-in "Done" folder, always first.
  const doneBtn = document.createElement('button');
  doneBtn.className = `nav-item ${state.reactiveId === '__done__' ? 'active' : ''}`;
  doneBtn.innerHTML = CHECK_SVG;
  const doneLabel = document.createElement('span');
  doneLabel.className = 'label';
  doneLabel.textContent = 'Done';
  doneBtn.appendChild(doneLabel);
  doneBtn.addEventListener('click', () => selectDone());
  list.appendChild(doneBtn);

  for (const rf of state.reactive) {
    const btn = document.createElement('button');
    btn.className = `nav-item ${rf.id === state.reactiveId ? 'active' : ''}`;

    const dot = document.createElement('span');
    dot.className = 'tag-dot';
    dot.style.background = rf.color;

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = rf.name;
    label.title = `${rf.senders.length} tagged sender${rf.senders.length === 1 ? '' : 's'}`;

    const gear = document.createElement('span');
    gear.className = 'gear';
    gear.title = 'Manage senders';
    gear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      openManageModal(rf.id);
    });

    btn.append(dot, label, gear);
    btn.addEventListener('click', () => selectReactive(rf.id));
    list.appendChild(btn);
  }
}

// Reactive folders that contain this sender — shown as chips on the row.
// Skipped for the reactive folder currently being viewed (every row would
// carry the same tag).
function senderTags(address) {
  const a = (address || '').toLowerCase();
  if (!a) return [];
  return state.reactive
    .filter((rf) => rf.id !== state.reactiveId && rf.senders.includes(a))
    .slice(0, 2);
}

function renderMessages() {
  const list = $('message-list');
  list.innerHTML = '';
  if (!state.messages.length) {
    if (!state.hasMore) list.innerHTML = '<div class="empty-hint">No messages in this folder</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const msg of state.messages) frag.appendChild(buildMessageRow(msg));
  list.appendChild(frag);
}

function appendMessageRows(messages) {
  const list = $('message-list');
  const empty = list.querySelector('.empty-hint');
  if (empty) empty.remove();
  const frag = document.createDocumentFragment();
  for (const msg of messages) frag.appendChild(buildMessageRow(msg));
  list.appendChild(frag);
}

function markRowActive(uid) {
  const list = $('message-list');
  const prev = list.querySelector('.message-item.active');
  if (prev) prev.classList.remove('active');
  const row = list.querySelector(`.message-item[data-uid="${uid}"]`);
  if (row) {
    row.classList.add('active');
    row.classList.remove('unread');
    const dot = row.querySelector('.unread-dot');
    if (dot) dot.remove();
  }
}

function removeRowByUid(uid) {
  const row = $('message-list').querySelector(`.message-item[data-uid="${uid}"]`);
  if (row) row.remove();
}

function buildMessageRow(msg) {
  {
    const btn = document.createElement('button');
    btn.className = `message-item ${msg.seen ? '' : 'unread'} ${state.message?.uid === msg.uid ? 'active' : ''}`;
    btn.dataset.uid = msg.uid;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.style.background = avatarColor(msg.from.address || msg.from.name || '?');
    avatar.textContent = initials(msg.from.name, msg.from.address);

    const from = document.createElement('div');
    from.className = 'from';
    from.textContent = msg.from.name || msg.from.address || 'Unknown';

    const date = document.createElement('div');
    date.className = 'date';
    const doneToggle = document.createElement('button');
    const isDone = !!msg.messageId && state.doneIds.has(msg.messageId);
    doneToggle.className = `done-btn ${isDone ? 'checked' : ''}`;
    doneToggle.title = isDone ? 'Mark as not done' : 'Mark done';
    doneToggle.innerHTML = CHECK_SVG;
    doneToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDone(msg);
    });
    const dateText = document.createElement('span');
    dateText.textContent = formatDate(msg.date);
    date.append(doneToggle, dateText);

    const subject = document.createElement('div');
    subject.className = 'subject';
    if (!msg.seen) {
      const dot = document.createElement('span');
      dot.className = 'unread-dot';
      subject.appendChild(dot);
    }
    const subjectText = document.createElement('span');
    subjectText.className = 'subject-text';
    subjectText.textContent = msg.subject;
    subject.appendChild(subjectText);
    for (const rf of senderTags(msg.from.address)) {
      const tag = document.createElement('span');
      tag.className = 'mail-tag';
      tag.textContent = rf.name;
      tag.style.color = rf.color;
      tag.style.background = `color-mix(in srgb, ${rf.color} 18%, transparent)`;
      subject.appendChild(tag);
    }

    btn.append(avatar, from, date, subject);
    btn.addEventListener('click', () => openMessage(msg));
    return btn;
  }
}

function renderReader() {
  const msg = state.message;
  if (!msg) {
    $('reader').classList.add('hidden');
    const empty = $('reader-empty');
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = 'Select a message to read';
    return;
  }
  $('reader-empty').classList.add('hidden');
  $('reader').classList.remove('hidden');

  $('reader-subject').textContent = msg.subject;
  const avatar = $('reader-avatar');
  avatar.style.background = avatarColor(msg.from.address || '?');
  avatar.textContent = initials(msg.from.name, msg.from.address);

  const fromEl = $('reader-from');
  fromEl.textContent = '';
  fromEl.append(msg.from.name || msg.from.address);
  if (msg.from.name && msg.from.address) {
    const small = document.createElement('small');
    small.textContent = ` <${msg.from.address}>`;
    fromEl.appendChild(small);
  }

  const recipients = [...msg.to, ...msg.cc].map((r) => r.name || r.address).join(', ');
  $('reader-to').textContent = recipients ? `to ${recipients}` : '';
  $('reader-date').textContent = formatFullDate(msg.date);

  updateDoneButton();

  const attWrap = $('reader-attachments');
  attWrap.innerHTML = '';
  attWrap.classList.toggle('hidden', !msg.attachments.length);
  for (const att of msg.attachments) {
    const chip = document.createElement('button');
    chip.className = 'attachment-chip';
    chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48"/></svg>';
    chip.appendChild(document.createTextNode(`${att.filename} (${formatSize(att.size)})`));
    chip.addEventListener('click', async () => {
      try {
        const saved = await api.saveAttachment(state.accountId, state.openedFolder, msg.uid, att.index);
        if (saved) toast(`Saved to ${saved}`, 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    attWrap.appendChild(chip);
  }

  const body = msg.html || `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(msg.text)}</pre>`;

  // Recreate the frame per message: a fresh element gets a fresh compositor
  // surface, avoiding the macOS glitch where a reused frame turns permanently
  // white. `allow-same-origin` (without allow-scripts, so still inert) keeps
  // the frame in the main renderer process, dodging the buggy out-of-process
  // iframe compositing path entirely.
  const old = $('reader-frame');
  const frame = document.createElement('iframe');
  frame.id = 'reader-frame';
  frame.className = 'reader-frame';
  frame.setAttribute('sandbox', 'allow-same-origin allow-popups');
  // <base>: makes protocol-relative URLs (//cdn.example.com/x.png) resolve to
  // https instead of file://, and opens all email links out of the app.
  frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <base href="https://email.invalid/" target="_blank">
    <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.55;color:#1c1c22;margin:0;padding:22px 26px;word-wrap:break-word}img{max-width:100%;height:auto}a{color:#4d5cf0}</style>
    </head><body>${body}</body></html>`;
  old.replaceWith(frame);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function resetPanes() {
  state.folders = [];
  state.folderPath = null;
  state.reactiveId = null;
  state.messages = [];
  state.baseMessages = [];
  state.message = null;
  renderFolders();
  $('folder-title').textContent = 'Inbox';
  $('message-list').innerHTML = '<div class="empty-hint">Add an account to get started</div>';
  renderReader();
}

/* ---------- Actions ---------- */

async function selectAccount(accountId) {
  state.accountId = accountId;
  state.reactiveId = null;
  state.message = null;
  renderAccounts();
  renderReader();
  $('folder-list').innerHTML = '<div class="loading-hint">Loading folders…</div>';
  $('message-list').innerHTML = '<div class="loading-hint">Loading…</div>';
  try {
    state.reactive = await api.reactiveList(accountId);
    state.done = await api.doneList(accountId);
    state.doneIds = new Set(state.done.map((d) => d.messageId));
    renderReactive();
    api.syncNow(accountId).catch(() => {}); // freshen the index in the background
    state.folders = await api.listFolders(accountId);
    renderFolders();
    const inbox = state.folders.find((f) => f.specialUse === '\\Inbox') || state.folders[0];
    if (inbox) await selectFolder(inbox.path);
  } catch (err) {
    $('folder-list').innerHTML = '';
    $('message-list').innerHTML = `<div class="empty-hint">${escapeHtml(err.message)}</div>`;
  }
}

function clearSearch() {
  $('search-input').value = '';
  $('search-clear').classList.add('hidden');
}

async function selectFolder(folderPath) {
  state.folderPath = folderPath;
  state.reactiveId = null;
  state.message = null;
  clearSearch();
  renderFolders();
  renderReactive();
  renderReader();
  const folder = state.folders.find((f) => f.path === folderPath);
  $('folder-title').textContent = folder ? folder.name : folderPath;
  await loadMessages();
}

function selectDone() {
  state.reactiveId = '__done__';
  state.folderPath = null;
  state.message = null;
  clearSearch();
  renderFolders();
  renderReactive();
  renderReader();
  $('folder-title').textContent = 'Done';
  renderDoneList();
}

function renderDoneList() {
  state.messages = state.done.map((d) => ({
    uid: d.uid,
    messageId: d.messageId,
    subject: d.subject,
    from: d.from,
    date: d.date,
    seen: true,
    folder: d.folder,
  }));
  state.baseMessages = state.messages;
  renderMessages();
  if (!state.messages.length) {
    $('message-list').innerHTML =
      '<div class="empty-hint">Nothing marked done yet. Hover an email and click the check, or use “Mark done” while reading.</div>';
  }
}

async function toggleDone(item) {
  if (!item.messageId) {
    toast('This message has no Message-ID header, so it cannot be tracked', 'error');
    return;
  }
  try {
    if (state.doneIds.has(item.messageId)) {
      await api.doneRemove(state.accountId, item.messageId);
      state.done = state.done.filter((d) => d.messageId !== item.messageId);
      state.doneIds.delete(item.messageId);
    } else {
      const record = {
        accountId: state.accountId,
        messageId: item.messageId,
        subject: item.subject,
        from: item.from,
        date: item.date,
        folder: item.folder || state.openedFolder || state.folderPath,
        uid: item.uid,
      };
      await api.doneAdd(record);
      state.done.unshift(record);
      state.doneIds.add(item.messageId);
      toast('Marked done', 'success');
    }

    if (state.reactiveId === '__done__') {
      renderDoneList();
      if (state.message && state.message.messageId === item.messageId && !state.doneIds.has(item.messageId)) {
        state.message = null;
        renderReader();
      }
    } else if (isInboxSelected() && state.doneIds.has(item.messageId)) {
      // Done mail leaves the inbox immediately.
      state.messages = state.messages.filter((m) => !m.messageId || !state.doneIds.has(m.messageId));
      state.baseMessages = state.baseMessages.filter((m) => !m.messageId || !state.doneIds.has(m.messageId));
      removeRowByUid(item.uid);
      if (state.message && state.message.messageId === item.messageId) {
        state.message = null;
        renderReader();
      }
    } else {
      // Toggle the check on the row in place — no full list rebuild.
      const row = $('message-list').querySelector(`.message-item[data-uid="${item.uid}"]`);
      const check = row && row.querySelector('.done-btn');
      if (check) check.classList.toggle('checked', state.doneIds.has(item.messageId));
      if (isInboxSelected()) loadMessages(); // un-done mail returns to the inbox
    }
    updateDoneButton();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function updateDoneButton() {
  const msg = state.message;
  if (!msg || !msg.from) return;
  const isDone = !!msg.messageId && state.doneIds.has(msg.messageId);
  $('done-btn').textContent = isDone ? '✓ Done' : 'Mark done';
}

async function selectReactive(id) {
  state.reactiveId = id;
  state.folderPath = null;
  state.message = null;
  clearSearch();
  renderFolders();
  renderReactive();
  renderReader();
  const rf = state.reactive.find((f) => f.id === id);
  $('folder-title').textContent = rf ? rf.name : 'Reactive';
  await loadReactive();
}

async function withListLoading(fn, quiet = false) {
  const btn = $('refresh-btn');
  state.hasMore = false; // reactive/done views are not paginated
  if (!quiet) {
    btn.classList.add('spinning');
    $('message-list').innerHTML = '<div class="loading-hint">Loading messages…</div>';
  }
  try {
    state.messages = await fn();
    state.baseMessages = state.messages;
    renderMessages();
  } catch (err) {
    $('message-list').innerHTML = `<div class="empty-hint">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.classList.remove('spinning');
  }
}

function hiddenSenders() {
  const set = new Set();
  for (const rf of state.reactive) {
    if (rf.hideFromInbox) rf.senders.forEach((s) => set.add(s));
  }
  return set;
}

function isInboxSelected() {
  const folder = state.folders.find((f) => f.path === state.folderPath);
  return folder ? folder.specialUse === '\\Inbox' : false;
}

const PAGE_SIZE = 200; // reads come from the local index, so pages are cheap

// Fetch one page and apply the local inbox filters (hidden senders / done).
// `raw` is the unfiltered count — the server-side offset for the next page.
async function fetchPage(offset) {
  const res = await api.listMessages(state.accountId, state.folderPath, PAGE_SIZE, offset);
  let messages = res.messages;
  const raw = messages.length;
  if (isInboxSelected()) {
    const hidden = hiddenSenders();
    messages = messages.filter(
      (m) =>
        !hidden.has((m.from.address || '').toLowerCase()) &&
        !(m.messageId && state.doneIds.has(m.messageId))
    );
  }
  return { messages, raw, hasMore: res.hasMore };
}

// quiet = refresh in place (used when a background sync finishes) without
// flashing a loading placeholder.
async function loadMessages(quiet = false) {
  const btn = $('refresh-btn');
  if (!quiet) {
    btn.classList.add('spinning');
    $('message-list').innerHTML = '<div class="loading-hint">Loading messages…</div>';
  }
  state.listOffset = 0;
  state.hasMore = false;
  const context = `${state.accountId}:${state.folderPath}`;
  try {
    const page = await fetchPage(0);
    if (context !== `${state.accountId}:${state.folderPath}`) return; // view changed mid-flight
    state.messages = page.messages;
    state.baseMessages = state.messages;
    state.listOffset = page.raw;
    state.hasMore = page.hasMore;
    renderMessages();
    maybeFillViewport();
  } catch (err) {
    $('message-list').innerHTML = `<div class="empty-hint">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.classList.remove('spinning');
  }
}

let loadingMore = false;

async function loadMore() {
  if (loadingMore || !state.hasMore) return;
  if (state.reactiveId || !state.folderPath) return;
  if ($('search-input').value.trim()) return; // search already spans the whole folder
  loadingMore = true;
  const context = `${state.accountId}:${state.folderPath}`;
  const marker = document.createElement('div');
  marker.className = 'loading-hint';
  marker.textContent = 'Loading more…';
  $('message-list').appendChild(marker);
  try {
    const page = await fetchPage(state.listOffset);
    marker.remove();
    if (context !== `${state.accountId}:${state.folderPath}`) return;
    state.listOffset += page.raw;
    state.hasMore = page.hasMore;
    state.messages = state.messages.concat(page.messages);
    state.baseMessages = state.messages;
    appendMessageRows(page.messages);
    maybeFillViewport();
  } catch (err) {
    marker.textContent = `Could not load more: ${err.message}`;
  } finally {
    loadingMore = false;
  }
}

// If filtering left the list shorter than the viewport, keep loading so the
// scroll trigger has something to grab onto.
function maybeFillViewport() {
  const list = $('message-list');
  if (state.hasMore && list.scrollHeight <= list.clientHeight + 60) loadMore();
}

$('message-list').addEventListener('scroll', () => {
  const list = $('message-list');
  if (list.scrollTop + list.clientHeight >= list.scrollHeight - 400) loadMore();
});

function loadReactive(quiet = false) {
  const rf = state.reactive.find((f) => f.id === state.reactiveId);
  if (rf && !rf.senders.length) {
    state.messages = [];
    state.baseMessages = [];
    $('message-list').innerHTML =
      '<div class="empty-hint">No senders tagged yet. Open an email and use “Tag sender” to add one.</div>';
    return Promise.resolve();
  }
  return withListLoading(() => api.reactiveMessages(state.accountId, state.reactiveId), quiet);
}

async function runSearch(query) {
  if (!query) {
    state.messages = state.baseMessages;
    renderMessages();
    return;
  }
  if (state.reactiveId) {
    // Reactive folders are already an aggregate — filter them locally.
    const q = query.toLowerCase();
    state.messages = state.baseMessages.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.from.name.toLowerCase().includes(q) ||
        m.from.address.toLowerCase().includes(q)
    );
    renderMessages();
    return;
  }
  const btn = $('refresh-btn');
  btn.classList.add('spinning');
  $('message-list').innerHTML = '<div class="loading-hint">Searching…</div>';
  try {
    state.messages = await api.searchMessages(state.accountId, state.folderPath, query);
    renderMessages();
    if (!state.messages.length) {
      $('message-list').innerHTML = `<div class="empty-hint">No results for “${escapeHtml(query)}”</div>`;
    }
  } catch (err) {
    $('message-list').innerHTML = `<div class="empty-hint">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.classList.remove('spinning');
  }
}

function showReaderStatus(text) {
  $('reader').classList.add('hidden');
  const empty = $('reader-empty');
  empty.classList.remove('hidden');
  empty.querySelector('p').textContent = text;
}

let openSequence = 0;

async function openMessage(item) {
  const seq = ++openSequence;
  const folder = item.folder || state.folderPath;
  item.seen = true;
  state.message = { uid: item.uid };
  state.openedFolder = folder;
  markRowActive(item.uid);
  showReaderStatus('Loading message…');
  try {
    const message = await api.getMessage(state.accountId, folder, item.uid);
    if (seq !== openSequence) return; // user already clicked another message
    state.message = message;
    renderReader();
  } catch (err) {
    if (seq !== openSequence) return;
    showReaderStatus(`Could not load message: ${err.message}`);
  }
}

/* ---------- Account modal ---------- */

const GMAIL_PRESET = {
  imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true,
  smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true,
};

function accountFormValues() {
  const f = new FormData($('account-form'));
  return {
    name: f.get('name').trim(),
    email: f.get('email').trim(),
    user: f.get('user').trim(),
    password: f.get('password'),
    imap: { host: f.get('imapHost').trim(), port: f.get('imapPort'), secure: f.get('imapSecure') === 'on' },
    smtp: { host: f.get('smtpHost').trim(), port: f.get('smtpPort'), secure: f.get('smtpSecure') === 'on' },
  };
}

function applyPreset(preset) {
  const form = $('account-form');
  for (const [key, value] of Object.entries(preset)) {
    const input = form.elements[key];
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value;
  }
}

$('add-account-btn').addEventListener('click', () => {
  $('account-form').reset();
  $('gmail-hint').classList.add('hidden');
  $('preset-gmail').classList.remove('selected');
  $('preset-custom').classList.remove('selected');
  $('account-modal').classList.remove('hidden');
});

$('preset-gmail').addEventListener('click', () => {
  applyPreset(GMAIL_PRESET);
  $('gmail-hint').classList.remove('hidden');
  $('preset-gmail').classList.add('selected');
  $('preset-custom').classList.remove('selected');
});

$('preset-custom').addEventListener('click', () => {
  applyPreset({ imapHost: '', imapPort: 993, imapSecure: true, smtpHost: '', smtpPort: 465, smtpSecure: true });
  $('gmail-hint').classList.add('hidden');
  $('preset-custom').classList.add('selected');
  $('preset-gmail').classList.remove('selected');
});

$('account-cancel').addEventListener('click', () => $('account-modal').classList.add('hidden'));

$('account-test').addEventListener('click', async () => {
  if (!$('account-form').reportValidity()) return;
  const btn = $('account-test');
  btn.disabled = true;
  btn.textContent = 'Testing…';
  try {
    await api.testAccount(accountFormValues());
    toast('Connection successful', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test connection';
  }
});

$('account-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('account-save');
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    const account = await api.addAccount(accountFormValues());
    state.accounts.push(account);
    $('account-modal').classList.add('hidden');
    renderAccounts();
    await selectAccount(account.id);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add account';
  }
});

/* ---------- Compose ---------- */

function openCompose({ to = '', subject = '', bodyHtml = '', inReplyTo = null } = {}) {
  if (!state.accountId) {
    toast('Add an account first', 'error');
    return;
  }
  state.replyContext = inReplyTo;
  $('composer-title').textContent = inReplyTo ? subject || 'Reply' : 'New Message';
  const form = $('compose-form');
  form.reset();
  form.elements.to.value = to;
  form.elements.subject.value = subject;
  $('cc-row').classList.add('hidden');
  $('bcc-row').classList.add('hidden');
  $('show-cc').classList.remove('hidden');
  $('show-bcc').classList.remove('hidden');
  const editor = $('composer-editor');
  editor.innerHTML = bodyHtml;
  $('composer').classList.remove('hidden', 'minimized');
  if (to) {
    // Replying: caret at the top, above the quoted message.
    editor.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    sel.addRange(range);
    editor.scrollTop = 0;
  } else {
    form.elements.to.focus();
  }
}

function closeComposer() {
  $('composer').classList.add('hidden');
  $('composer-editor').innerHTML = '';
  $('compose-form').reset();
  state.replyContext = null;
}

$('compose-btn').addEventListener('click', () => openCompose());

$('composer-min').addEventListener('click', (e) => {
  e.stopPropagation();
  $('composer').classList.toggle('minimized');
});

$('composer-header').addEventListener('click', () => {
  $('composer').classList.toggle('minimized');
});

$('composer-close').addEventListener('click', (e) => {
  e.stopPropagation();
  closeComposer();
});

$('compose-discard').addEventListener('click', closeComposer);

$('show-cc').addEventListener('click', (e) => {
  $('cc-row').classList.remove('hidden');
  e.currentTarget.classList.add('hidden');
  $('cc-row').querySelector('input').focus();
});

$('show-bcc').addEventListener('click', (e) => {
  $('bcc-row').classList.remove('hidden');
  e.currentTarget.classList.add('hidden');
  $('bcc-row').querySelector('input').focus();
});

// Formatting buttons: mousedown so the editor's selection is preserved.
document.querySelectorAll('.fmt-group button').forEach((btn) => {
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.execCommand(btn.dataset.cmd);
  });
});

// Cmd/Ctrl+Enter sends, like Gmail.
$('composer').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    $('compose-form').requestSubmit();
  }
});

$('done-btn').addEventListener('click', () => {
  const msg = state.message;
  if (!msg || !msg.from) return; // still loading
  toggleDone({
    messageId: msg.messageId,
    subject: msg.subject,
    from: msg.from,
    date: msg.date,
    uid: msg.uid,
    folder: state.openedFolder,
  });
});

$('reply-btn').addEventListener('click', () => {
  const msg = state.message;
  if (!msg || !msg.from) return; // still loading

  const quotedContent = msg.html || `<pre style="white-space:pre-wrap">${escapeHtml(msg.text || '')}</pre>`;
  const who = escapeHtml(msg.from.name || msg.from.address);
  openCompose({
    to: msg.from.address,
    subject: msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`,
    bodyHtml:
      `<br><br><div style="color:#888;font-size:12.5px">On ${formatFullDate(msg.date)}, ${who} wrote:</div>` +
      `<blockquote>${quotedContent}</blockquote>`,
    inReplyTo: msg.messageId || null,
  });
});

$('delete-btn').addEventListener('click', async () => {
  const msg = state.message;
  if (!msg || !confirm('Delete this message?')) return;
  try {
    await api.deleteMessage(state.accountId, state.openedFolder, msg.uid);
    state.messages = state.messages.filter((m) => m.uid !== msg.uid);
    state.baseMessages = state.baseMessages.filter((m) => m.uid !== msg.uid);
    state.message = null;
    removeRowByUid(msg.uid);
    renderReader();
    toast('Message deleted', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('compose-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('compose-send');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const f = new FormData($('compose-form'));
  const editor = $('composer-editor');
  try {
    await api.sendMessage(state.accountId, {
      to: f.get('to'),
      cc: f.get('cc') || '',
      bcc: f.get('bcc') || '',
      subject: f.get('subject'),
      text: editor.innerText,
      html: editor.innerHTML,
      inReplyTo: state.replyContext,
    });
    closeComposer();
    toast('Message sent', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
});

/* ---------- Search ---------- */

$('search-input').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const query = $('search-input').value.trim();
  $('search-clear').classList.toggle('hidden', !query);
  if (state.accountId && (state.folderPath || state.reactiveId)) runSearch(query);
});

$('search-clear').addEventListener('click', () => {
  clearSearch();
  state.messages = state.baseMessages;
  renderMessages();
});

/* ---------- Reactive folders ---------- */

let pendingTagSender = null; // sender to tag once a new folder is created

function tagSenderInto(folderId, address) {
  return api
    .reactiveAddSender(folderId, address)
    .then((updated) => {
      state.reactive = state.reactive.map((f) => (f.id === updated.id ? updated : f));
      renderReactive();
      toast(`${address} tagged into “${updated.name}”`, 'success');
      // Sender may now be hidden from the inbox — refresh the view if we're in it.
      if (updated.hideFromInbox && isInboxSelected()) loadMessages();
    })
    .catch((err) => toast(err.message, 'error'));
}

function closeTagMenu() {
  $('tag-menu').classList.add('hidden');
}

$('tag-btn').addEventListener('click', (e) => {
  const msg = state.message;
  if (!msg || !msg.from || !msg.from.address) return;
  e.stopPropagation();

  const menu = $('tag-menu');
  menu.innerHTML = '';

  for (const rf of state.reactive) {
    const item = document.createElement('button');
    item.className = 'menu-item';
    const dot = document.createElement('span');
    dot.className = 'tag-dot';
    dot.style.background = rf.color;
    const already = rf.senders.includes(msg.from.address.toLowerCase());
    item.append(dot, document.createTextNode(rf.name + (already ? ' ✓' : '')));
    item.addEventListener('click', () => {
      closeTagMenu();
      if (!already) tagSenderInto(rf.id, msg.from.address);
    });
    menu.appendChild(item);
  }

  if (state.reactive.length) {
    const sep = document.createElement('div');
    sep.className = 'menu-sep';
    menu.appendChild(sep);
  }

  const create = document.createElement('button');
  create.className = 'menu-item new';
  create.textContent = '＋ New reactive folder…';
  create.addEventListener('click', () => {
    closeTagMenu();
    pendingTagSender = msg.from.address;
    $('reactive-form').reset();
    $('reactive-modal').classList.remove('hidden');
    $('reactive-form').elements.name.focus();
  });
  menu.appendChild(create);

  const rect = e.currentTarget.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(10, rect.right - 210)}px`;
  menu.classList.remove('hidden');
});

document.addEventListener('click', (e) => {
  if (!$('tag-menu').contains(e.target)) closeTagMenu();
});

$('add-reactive-btn').addEventListener('click', () => {
  if (!state.accountId) {
    toast('Add an account first', 'error');
    return;
  }
  pendingTagSender = null;
  $('reactive-form').reset();
  $('reactive-modal').classList.remove('hidden');
  $('reactive-form').elements.name.focus();
});

$('reactive-cancel').addEventListener('click', () => $('reactive-modal').classList.add('hidden'));

$('reactive-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = new FormData($('reactive-form')).get('name').trim();
  try {
    const folder = await api.reactiveCreate(name, state.accountId);
    state.reactive.push(folder);
    $('reactive-modal').classList.add('hidden');
    renderReactive();
    if (pendingTagSender) {
      await tagSenderInto(folder.id, pendingTagSender);
      pendingTagSender = null;
    }
  } catch (err) {
    toast(err.message, 'error');
  }
});

/* Manage modal */

let manageId = null;

function renderManageSenders() {
  const rf = state.reactive.find((f) => f.id === manageId);
  const wrap = $('manage-senders');
  wrap.innerHTML = '';
  if (!rf) return;
  if (!rf.senders.length) {
    wrap.innerHTML = '<div class="sender-empty">No senders tagged yet. Open an email and click “Tag sender”.</div>';
    return;
  }
  for (const sender of rf.senders) {
    const row = document.createElement('div');
    row.className = 'sender-row';
    const label = document.createElement('span');
    label.textContent = sender;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = 'Untag sender';
    remove.addEventListener('click', async () => {
      try {
        const updated = await api.reactiveRemoveSender(rf.id, sender);
        state.reactive = state.reactive.map((f) => (f.id === updated.id ? updated : f));
        renderManageSenders();
        renderReactive();
        if (state.reactiveId === rf.id) loadReactive();
        else if (updated.hideFromInbox && isInboxSelected()) loadMessages(); // sender's mail reappears
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    row.append(label, remove);
    wrap.appendChild(row);
  }
}

function openManageModal(id) {
  manageId = id;
  const rf = state.reactive.find((f) => f.id === id);
  $('manage-title').textContent = rf ? rf.name : 'Reactive folder';
  $('manage-name').value = rf ? rf.name : '';
  $('manage-hide-toggle').checked = !!(rf && rf.hideFromInbox);
  renderManageSenders();
  $('manage-modal').classList.remove('hidden');
}

$('manage-name').addEventListener('change', async (e) => {
  const name = e.target.value.trim();
  const rf = state.reactive.find((f) => f.id === manageId);
  if (!rf || !name || name === rf.name) return;
  try {
    const updated = await api.reactiveRename(manageId, name);
    state.reactive = state.reactive.map((f) => (f.id === updated.id ? updated : f));
    $('manage-title').textContent = updated.name;
    renderReactive();
    if (state.reactiveId === updated.id) $('folder-title').textContent = updated.name;
  } catch (err) {
    toast(err.message, 'error');
    e.target.value = rf.name;
  }
});

$('manage-hide-toggle').addEventListener('change', async (e) => {
  try {
    const updated = await api.reactiveSetHidden(manageId, e.target.checked);
    state.reactive = state.reactive.map((f) => (f.id === updated.id ? updated : f));
    if (isInboxSelected()) loadMessages();
  } catch (err) {
    toast(err.message, 'error');
    e.target.checked = !e.target.checked;
  }
});

$('manage-close').addEventListener('click', () => $('manage-modal').classList.add('hidden'));

$('manage-delete').addEventListener('click', async () => {
  const rf = state.reactive.find((f) => f.id === manageId);
  if (!rf || !confirm(`Delete reactive folder “${rf.name}”? (Your emails are not affected)`)) return;
  try {
    await api.reactiveDelete(rf.id);
    state.reactive = state.reactive.filter((f) => f.id !== rf.id);
    $('manage-modal').classList.add('hidden');
    if (state.reactiveId === rf.id) {
      state.reactiveId = null;
      const inbox = state.folders.find((f) => f.specialUse === '\\Inbox') || state.folders[0];
      if (inbox) selectFolder(inbox.path);
    } else if (rf.hideFromInbox && isInboxSelected()) {
      loadMessages(); // previously hidden senders reappear
    }
    renderReactive();
  } catch (err) {
    toast(err.message, 'error');
  }
});

/* ---------- Global ---------- */

$('refresh-btn').addEventListener('click', () => {
  if (!state.accountId) return;
  api.syncNow(state.accountId).catch(() => {});
  if (state.reactiveId === '__done__') renderDoneList();
  else if (state.reactiveId) loadReactive();
  else if (state.folderPath) loadMessages();
});

/* ---------- Background sync events ---------- */

function folderDisplayName(path) {
  const folder = state.folders.find((f) => f.path === path);
  return folder ? folder.name : path;
}

function listIsNearTop() {
  return $('message-list').scrollTop < 100;
}

api.onSyncEvent((ev) => {
  if (ev.accountId !== state.accountId) return;

  if (ev.type === 'folder-progress') {
    $('sync-status').textContent = `Syncing ${folderDisplayName(ev.folder)} ${ev.done}/${ev.total}`;
    return;
  }
  if (ev.type === 'account-done' || ev.type === 'account-error') {
    $('sync-status').textContent = '';
    return;
  }
  if (ev.type === 'folder-error') return; // transient; next cycle retries

  if (ev.type === 'folder-done') {
    $('sync-status').textContent = '';
    if ($('search-input').value.trim()) return; // don't disturb search results
    // Refresh the visible list when its data just changed — but only if the
    // user is at the top, so we never yank the list out from under them.
    if (state.folderPath === ev.folder && listIsNearTop()) {
      loadMessages(true);
    } else if (state.reactiveId && state.reactiveId !== '__done__' && listIsNearTop()) {
      loadReactive(true);
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('account-modal').classList.add('hidden');
    $('reactive-modal').classList.add('hidden');
    $('manage-modal').classList.add('hidden');
    closeTagMenu();
    if (!$('composer').classList.contains('hidden')) $('composer').classList.add('minimized');
  }
});

/* ---------- Init ---------- */

(async function init() {
  try {
    state.accounts = await api.listAccounts();
    renderAccounts();
    if (state.accounts.length) await selectAccount(state.accounts[0].id);
  } catch (err) {
    toast(err.message, 'error');
  }
})();
