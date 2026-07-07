// Title bar: global search (across every folder of the current account), the
// compose shortcut, and the live background-sync status pill.

import { api } from './api.js';
import { state } from './state.js';
import { $, escapeHtml } from './utils.js';
import { renderMessages } from './list.js';
import { loadMessages } from './list.js';
import { loadReactive } from './reactive.js';
import { renderDoneList } from './done.js';
import { openCompose } from './composer.js';

/* ---------- Global search ---------- */

// Re-run whatever view is currently selected (used to restore after clearing
// a global search).
function reloadCurrentView() {
  if (state.reactiveId === '__done__') renderDoneList();
  else if (state.reactiveId) loadReactive();
  else if (state.folderPath) loadMessages();
}

export function clearGlobalSearch({ reload = true } = {}) {
  $('global-search').value = '';
  $('global-search-clear').classList.add('hidden');
  if (state.globalSearch) {
    state.globalSearch = false;
    if (reload) reloadCurrentView();
  }
}

async function runGlobalSearch(query) {
  if (!state.accountId) return;
  state.globalSearch = true;
  state.hasMore = false;
  $('folder-title').textContent = 'Search all mail';
  $('message-list').innerHTML = '<div class="loading-hint">Searching all mail…</div>';
  try {
    const results = await api.searchAllMessages(state.accountId, query);
    state.messages = results;
    state.baseMessages = results;
    $('list-count').textContent = `${results.length.toLocaleString()} result${results.length === 1 ? '' : 's'}`;
    renderMessages();
    if (!results.length) {
      $('message-list').innerHTML = `<div class="empty-hint">No results for “${escapeHtml(query)}”</div>`;
    }
  } catch (err) {
    $('message-list').innerHTML = `<div class="empty-hint">${escapeHtml(err.message)}</div>`;
  }
}

$('global-search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    clearGlobalSearch();
    $('global-search').blur();
    return;
  }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const query = $('global-search').value.trim();
  $('global-search-clear').classList.toggle('hidden', !query);
  if (query) runGlobalSearch(query);
  else clearGlobalSearch();
});

$('global-search-clear').addEventListener('click', () => {
  clearGlobalSearch();
  $('global-search').focus();
});

/* ---------- Compose ---------- */

$('titlebar-compose').addEventListener('click', () => openCompose());

/* ---------- Sync status pill ---------- */

const activeAccounts = new Set();
let lastSyncAt = null;

function relativeTime(iso) {
  if (!iso) return null;
  const secs = Math.round((Date.now() - new Date(iso)) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function renderPill() {
  const pill = $('sync-pill');
  const text = $('sync-pill-text');
  if (activeAccounts.size) {
    pill.classList.add('syncing');
    text.textContent = 'Syncing…';
    return;
  }
  pill.classList.remove('syncing');
  const rel = relativeTime(lastSyncAt);
  text.textContent = rel ? `Synced ${rel}` : 'Idle';
}

api.onSyncEvent((ev) => {
  if (ev.type === 'folder-progress') {
    activeAccounts.add(ev.accountId);
    renderPill();
  } else if (ev.type === 'account-done' || ev.type === 'account-error') {
    activeAccounts.delete(ev.accountId);
    if (ev.type === 'account-done') lastSyncAt = new Date().toISOString();
    renderPill();
  }
});

// Keep the relative "Synced 3m ago" label fresh while idle.
setInterval(() => {
  if (!activeAccounts.size) renderPill();
}, 30000);

renderPill();
