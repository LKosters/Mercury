// Search bar: instant search against the local index for folder views,
// local filtering for reactive/done aggregates.

import { api } from './api.js';
import { state } from './state.js';
import { $, escapeHtml } from './utils.js';
import { renderMessages } from './list.js';

export function clearSearch() {
  $('search-input').value = '';
  $('search-clear').classList.add('hidden');
}

async function runSearch(query) {
  if (!query) {
    state.messages = state.baseMessages;
    renderMessages();
    return;
  }
  if (state.reactiveId) {
    // Reactive/Done folders are already an aggregate — filter them locally.
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
