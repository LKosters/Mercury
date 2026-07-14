// The built-in "Done" feature: per-message checkmarks stored locally, a
// pinned Done folder, and removal of done mail from the inbox view.

import { api } from './api.js';
import { state } from './state.js';
import { $, toast } from './utils.js';
import { renderMessages, removeRowByUid, loadMessages, isInboxSelected } from './list.js';
import { renderReader } from './reader.js';
import { renderFolders } from './sidebar.js';
import { renderReactive } from './reactive.js';
import { clearSearch } from './search.js';
import { updateStats } from './status.js';

export function selectDone() {
  state.reactiveId = '__done__';
  state.folderPath = null;
  state.completeInbox = false;
  state.message = null;
  clearSearch();
  renderFolders();
  renderReactive();
  renderReader();
  $('folder-title').textContent = 'Done';
  renderDoneList();
}

export function renderDoneList() {
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

export async function toggleDone(item) {
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
    } else if (isInboxSelected() && !state.completeInbox && state.doneIds.has(item.messageId)) {
      // Done mail leaves the inbox immediately (but stays visible in Complete Inbox).
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
    updateStats(); // done set changed — refresh the Inbox badge
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function updateDoneButton() {
  const msg = state.message;
  if (!msg || !msg.from) return;
  const isDone = !!msg.messageId && state.doneIds.has(msg.messageId);
  const btn = $('done-btn');
  btn.classList.toggle('checked', isDone);
  btn.title = isDone ? 'Mark as not done' : 'Mark done';
}

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
