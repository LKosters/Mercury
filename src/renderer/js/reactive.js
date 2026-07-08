// Reactive folders: sidebar section, tag-sender menu, create modal, and the
// manage (rename / hide-from-inbox / senders) modal.

import { api } from './api.js';
import { state } from './state.js';
import { $, toast, CHECK_SVG } from './utils.js';
import { withListLoading, loadMessages, isInboxSelected } from './list.js';
import { renderReader } from './reader.js';
import { renderFolders, selectFolder } from './sidebar.js';
import { selectDone } from './done.js';
import { clearSearch } from './search.js';
import { updateStats } from './status.js';

const GEAR_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

export function renderReactive() {
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

    const count = document.createElement('span');
    count.className = 'count';
    const n = state.reactiveCounts[rf.id];
    if (n) count.textContent = n.toLocaleString();

    const gear = document.createElement('span');
    gear.className = 'gear';
    gear.title = 'Manage senders';
    gear.innerHTML = GEAR_SVG;
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      openManageModal(rf.id);
    });

    btn.append(dot, label, count, gear);
    btn.addEventListener('click', () => selectReactive(rf.id));
    list.appendChild(btn);
  }
}

export async function selectReactive(id) {
  state.reactiveId = id;
  state.folderPath = null;
  state.completeInbox = false;
  state.message = null;
  clearSearch();
  renderFolders();
  renderReactive();
  renderReader();
  const rf = state.reactive.find((f) => f.id === id);
  $('folder-title').textContent = rf ? rf.name : 'Reactive';
  await loadReactive();
}

export function loadReactive(quiet = false) {
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

/* ---------- Tag-sender menu ---------- */

let pendingTagSender = null; // sender to tag once a new folder is created

function tagSenderInto(folderId, address) {
  return api
    .reactiveAddSender(folderId, address)
    .then((updated) => {
      state.reactive = state.reactive.map((f) => (f.id === updated.id ? updated : f));
      renderReactive();
      toast(`${address} tagged into “${updated.name}”`, 'success');
      // Sender may now be hidden from the inbox — refresh the view + badge counts.
      if (updated.hideFromInbox) {
        updateStats();
        if (isInboxSelected()) loadMessages();
      }
    })
    .catch((err) => toast(err.message, 'error'));
}

export function closeTagMenu() {
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

/* ---------- Create modal ---------- */

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

/* ---------- Manage modal ---------- */

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
        if (updated.hideFromInbox) updateStats(); // sender no longer hidden — refresh badges
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
    updateStats(); // hidden-sender set changed — refresh Inbox / Complete Inbox badges
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
    if (rf.hideFromInbox) updateStats(); // hidden-sender set shrank — refresh badges
    renderReactive();
  } catch (err) {
    toast(err.message, 'error');
  }
});
