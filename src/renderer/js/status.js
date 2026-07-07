// Status bar (totals + unread) and sidebar count badges, fed by the index.

import { api } from './api.js';
import { state } from './state.js';
import { $ } from './utils.js';
import { renderFolders } from './sidebar.js';
import { renderReactive } from './reactive.js';

export async function updateStats() {
  if (!state.accountId) {
    $('status-left').textContent = '';
    return;
  }
  try {
    const [stats, counts] = await Promise.all([
      api.mailStats(state.accountId),
      api.reactiveCounts(state.accountId),
    ]);
    state.stats = stats;
    state.reactiveCounts = counts;

    const left = $('status-left');
    left.innerHTML = '';
    left.append(`${stats.total.toLocaleString()} messages · `);
    const unread = document.createElement('span');
    unread.className = 'unread';
    unread.textContent = `${stats.inboxUnread.toLocaleString()} unread`;
    left.appendChild(unread);

    renderFolders(); // refresh inbox badge
    renderReactive(); // refresh reactive counts
  } catch {
    // stats are cosmetic; ignore transient failures
  }
}
