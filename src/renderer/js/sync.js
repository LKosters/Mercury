// Background sync: status text in the list header, and quiet view refreshes
// when the index changes underneath the current view.

import { api } from './api.js';
import { state } from './state.js';
import { $ } from './utils.js';
import { loadMessages } from './list.js';
import { loadReactive } from './reactive.js';

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
