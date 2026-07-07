// Entry point: wires up global shortcuts and boots the app. Feature modules
// register their own event listeners as a side effect of being imported.

import { api } from './api.js';
import { state } from './state.js';
import { $, toast } from './utils.js';
import { renderAccounts, selectAccount } from './sidebar.js';
import { loadMessages } from './list.js';
import { loadReactive, closeTagMenu } from './reactive.js';
import { renderDoneList } from './done.js';
import './reader.js';
import './search.js';
import './composer.js';
import './sync.js';
import './status.js';
import './titlebar.js';
import { applyUpdateResult } from './settings.js';
import { hidePreloader } from './preloader.js';

$('refresh-btn').addEventListener('click', () => {
  if (!state.accountId) return;
  api.syncNow(state.accountId).catch(() => {});
  if (state.reactiveId === '__done__') renderDoneList();
  else if (state.reactiveId) loadReactive();
  else if (state.folderPath) loadMessages();
});

/* Global shortcuts */

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault();
    $('global-search').focus();
    $('global-search').select();
    return;
  }
  if (e.key === 'Escape') {
    $('account-modal').classList.add('hidden');
    $('reactive-modal').classList.add('hidden');
    $('manage-modal').classList.add('hidden');
    $('settings-modal').classList.add('hidden');
    closeTagMenu();
    if (!$('composer').classList.contains('hidden')) $('composer').classList.add('minimized');
  }
});

(async function init() {
  try {
    state.accounts = await api.listAccounts();
    renderAccounts();
    if (state.accounts.length) await selectAccount(state.accounts[0].id);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hidePreloader();
  }
})();

// Automatic update check on launch: light up the Settings gear badge + a toast
// when a newer release exists. Installing stays a one-click action in Settings.
(async function checkForUpdates() {
  try {
    const result = await api.checkForUpdates();
    applyUpdateResult(result);
    if (result.updateAvailable) {
      toast(`Mercury ${result.latestVersion} is available — open Settings to update`, 'success');
    }
  } catch {
    // Offline or no releases yet — silent; the manual button reports errors.
  }
})();
