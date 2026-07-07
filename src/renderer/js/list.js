// Message list pane: rendering rows, pagination (infinite scroll), and the
// local inbox filters (hidden senders / done).

import { api } from './api.js';
import { state, PAGE_SIZE } from './state.js';
import { $, avatarColor, initials, formatDate, escapeHtml, CHECK_SVG } from './utils.js';
import { openMessage } from './reader.js';
import { toggleDone } from './done.js';

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

function buildMessageRow(msg) {
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

  btn.append(avatar, from, date, subject);

  const tags = senderTags(msg.from.address);
  if (tags.length) {
    const tagsRow = document.createElement('div');
    tagsRow.className = 'tags';
    for (const rf of tags) {
      const tag = document.createElement('span');
      tag.className = 'mail-tag';
      tag.textContent = rf.name;
      tag.style.color = rf.color;
      tagsRow.appendChild(tag);
    }
    btn.appendChild(tagsRow);
  }
  btn.addEventListener('click', () => openMessage(msg));
  return btn;
}

export function renderMessages() {
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

export function markRowActive(uid) {
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

export function removeRowByUid(uid) {
  const row = $('message-list').querySelector(`.message-item[data-uid="${uid}"]`);
  if (row) row.remove();
}

/* ---------- View helpers ---------- */

export function hiddenSenders() {
  const set = new Set();
  for (const rf of state.reactive) {
    if (rf.hideFromInbox) rf.senders.forEach((s) => set.add(s));
  }
  return set;
}

export function isInboxSelected() {
  const folder = state.folders.find((f) => f.path === state.folderPath);
  return folder ? folder.specialUse === '\\Inbox' : false;
}

// Shared loader for non-paginated views (reactive folders).
export async function withListLoading(fn, quiet = false) {
  const btn = $('refresh-btn');
  state.hasMore = false; // reactive/done views are not paginated
  if (!quiet) {
    btn.classList.add('spinning');
    $('message-list').innerHTML = '<div class="loading-hint">Loading messages…</div>';
  }
  try {
    state.messages = await fn();
    state.baseMessages = state.messages;
    $('list-count').textContent = `${state.messages.length.toLocaleString()} message${state.messages.length === 1 ? '' : 's'}`;
    renderMessages();
  } catch (err) {
    $('message-list').innerHTML = `<div class="empty-hint">${escapeHtml(err.message)}</div>`;
  } finally {
    btn.classList.remove('spinning');
  }
}

/* ---------- Pagination ---------- */

// Fetch one page and apply the local inbox filters: hidden senders / done
// (inbox only). `raw` is the unfiltered count — the offset for the next page.
async function fetchPage(offset) {
  const res = await api.listMessages(state.accountId, state.folderPath, PAGE_SIZE, offset);
  let messages = res.messages;
  const raw = messages.length;
  if (isInboxSelected() && !state.completeInbox) {
    const hidden = hiddenSenders();
    messages = messages.filter(
      (m) =>
        !hidden.has((m.from.address || '').toLowerCase()) &&
        !(m.messageId && state.doneIds.has(m.messageId))
    );
  }
  return { messages, raw, hasMore: res.hasMore, total: res.total };
}

function updateListCount(count) {
  $('list-count').textContent = `${count.toLocaleString()} message${count === 1 ? '' : 's'}`;
}

// quiet = refresh in place (used when a background sync finishes) without
// flashing a loading placeholder.
export async function loadMessages(quiet = false) {
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
    updateListCount(page.total || 0);
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
