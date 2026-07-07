// Background sync: progress in the status bar, count refreshes, and quiet
// view refreshes when the index changes underneath the current view.

import { api } from './api.js';
import { state } from './state.js';
import { $ } from './utils.js';
import { loadMessages } from './list.js';
import { loadReactive } from './reactive.js';
import { updateStats } from './status.js';

function listIsNearTop() {
  return $('message-list').scrollTop < 100;
}

function showSyncProgress(done, total) {
  $('status-sync').classList.remove('hidden');
  $('status-sync-text').textContent = `Syncing ${done.toLocaleString()} / ${total.toLocaleString()}`;
  $('sync-progress').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
}

function hideSyncProgress() {
  $('status-sync').classList.add('hidden');
  $('sync-progress').style.width = '0%';
}

api.onSyncEvent((ev) => {
  if (ev.accountId !== state.accountId) return;

  if (ev.type === 'folder-progress') {
    showSyncProgress(ev.done, ev.total);
    return;
  }
  if (ev.type === 'account-done' || ev.type === 'account-error') {
    hideSyncProgress();
    updateStats();
    return;
  }
  if (ev.type === 'folder-error') return; // transient; next cycle retries

  if (ev.type === 'folder-done') {
    updateStats();
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
