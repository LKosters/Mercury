// Settings modal: account management, backup import/export, sync preferences,
// and app/data info. Opened from the title-bar gear button.

import { api } from './api.js';
import { state } from './state.js';
import { $, avatarColor, escapeHtml, toast } from './utils.js';
import { renderAccounts, selectAccount, resetPanes } from './sidebar.js';
import { updateStats } from './status.js';

/* ---------- Open / close ---------- */

async function openSettings() {
  $('settings-modal').classList.remove('hidden');
  renderAccountList();
  loadPrefs();
  loadInfo();
}

function closeSettings() {
  $('settings-modal').classList.add('hidden');
}

$('settings-btn').addEventListener('click', openSettings);
$('settings-close').addEventListener('click', closeSettings);
$('settings-modal').addEventListener('click', (e) => {
  if (e.target === $('settings-modal')) closeSettings();
});

/* ---------- Accounts ---------- */

function renderAccountList() {
  const list = $('settings-account-list');
  list.innerHTML = '';
  if (!state.accounts.length) {
    list.innerHTML = '<div class="settings-empty">No accounts yet.</div>';
    return;
  }
  for (const account of state.accounts) {
    const row = document.createElement('div');
    row.className = 'settings-account';

    const dot = document.createElement('span');
    dot.className = 'account-dot';
    dot.style.background = avatarColor(account.email);

    const meta = document.createElement('div');
    meta.className = 'settings-account-meta';
    const name = document.createElement('div');
    name.className = 'settings-account-name';
    name.textContent = account.name || account.email;
    const addr = document.createElement('div');
    addr.className = 'settings-account-addr';
    addr.textContent = account.email;
    meta.append(name, addr);

    const remove = document.createElement('button');
    remove.className = 'ghost-btn small danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => removeAccount(account));

    row.append(dot, meta, remove);
    list.appendChild(row);
  }
}

async function removeAccount(account) {
  if (!confirm(`Remove ${account.email}? Its local index is cleared; the mailbox itself is untouched.`)) return;
  try {
    await api.removeAccount(account.id);
    state.accounts = state.accounts.filter((a) => a.id !== account.id);
    if (state.accountId === account.id) {
      state.accountId = state.accounts[0]?.id || null;
      if (state.accountId) await selectAccount(state.accountId);
      else resetPanes();
    }
    renderAccounts();
    renderAccountList();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Reuse the existing add-account modal (owned by sidebar.js).
$('settings-add-account').addEventListener('click', () => {
  closeSettings();
  $('add-account-btn').click();
});

/* ---------- Backup: export / import ---------- */

$('settings-export').addEventListener('click', async () => {
  try {
    const res = await api.exportBackup();
    if (!res) return; // cancelled
    toast(`Exported ${res.accounts} account${res.accounts === 1 ? '' : 's'} to ${res.path}`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// Shared by the Settings "Import" button and the first-run welcome screen.
// Returns true if a backup was actually imported (false if the user cancelled).
export async function runImport() {
  try {
    const res = await api.importBackup();
    if (!res) return false; // cancelled
    const { added, updated } = res.accounts;
    toast(
      `Imported ${added} new + ${updated} updated account${added + updated === 1 ? '' : 's'}, ` +
        `${res.reactiveFolders} reactive folder${res.reactiveFolders === 1 ? '' : 's'}, ${res.done} done`,
      'success'
    );
    await reloadAfterImport();
    return true;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
}

$('settings-import').addEventListener('click', runImport);

async function reloadAfterImport() {
  state.accounts = await api.listAccounts();
  renderAccounts();
  renderAccountList();
  if (state.accountId && state.accounts.some((a) => a.id === state.accountId)) {
    await selectAccount(state.accountId); // refresh reactive/done for the open account
  } else if (state.accounts.length) {
    await selectAccount(state.accounts[0].id);
  } else {
    resetPanes();
  }
}

/* ---------- Sync preferences ---------- */

async function loadPrefs() {
  try {
    const prefs = await api.getPrefs();
    $('settings-interval').value = prefs.syncIntervalMinutes;
  } catch {
    // non-fatal
  }
}

$('settings-interval-save').addEventListener('click', async () => {
  const minutes = Number($('settings-interval').value);
  try {
    const prefs = await api.setPrefs({ syncIntervalMinutes: minutes });
    $('settings-interval').value = prefs.syncIntervalMinutes; // reflect clamping
    toast(`Syncing every ${prefs.syncIntervalMinutes} min`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('settings-sync-all').addEventListener('click', async () => {
  try {
    await Promise.all(state.accounts.map((a) => api.syncNow(a.id)));
    toast('Syncing all accounts…', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

/* ---------- About / data ---------- */

async function loadInfo() {
  try {
    const info = await api.settingsInfo();
    $('settings-version').textContent = info.version;
    $('settings-datadir').textContent = info.dataDir;
    $('settings-datadir').title = info.dataDir;
  } catch {
    // non-fatal
  }
}

$('settings-reveal').addEventListener('click', () => api.revealDataDir().catch(() => {}));

/* ---------- Updates ---------- */

let pendingUpdate = null;

// Reflect a check result in the Settings UI + gear badge. Shared by the manual
// "Check for updates" button and the automatic check on startup (app.js).
export function applyUpdateResult(result) {
  const status = $('settings-update-status');
  const download = $('settings-download-update');
  const badge = $('settings-update-badge');
  if (result.updateAvailable && result.downloadUrl !== undefined) {
    pendingUpdate = result;
    status.textContent = `Mercury ${result.latestVersion} is available (you have ${result.currentVersion}).`;
    download.textContent = result.downloadUrl ? 'Download & install' : 'View release';
    download.disabled = false;
    download.classList.remove('hidden');
    badge.classList.remove('hidden');
  } else {
    status.textContent = `You're on the latest version (${result.currentVersion}).`;
    download.classList.add('hidden');
    badge.classList.add('hidden');
  }
}

$('settings-check-update').addEventListener('click', async () => {
  const btn = $('settings-check-update');
  const status = $('settings-update-status');
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Checking…';
  status.textContent = 'Checking for updates…';
  try {
    applyUpdateResult(await api.checkForUpdates());
  } catch (err) {
    status.textContent = `Couldn't check for updates: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

// Progress streams from the main process during the download.
api.onUpdateProgress((percent) => {
  const download = $('settings-download-update');
  if (!download.classList.contains('hidden')) download.textContent = `Downloading ${percent}%`;
});

$('settings-download-update').addEventListener('click', async () => {
  if (!pendingUpdate) return;
  const download = $('settings-download-update');
  const status = $('settings-update-status');
  // No installer asset for this platform — open the release page instead.
  if (!pendingUpdate.downloadUrl) {
    api.openRelease(pendingUpdate.releaseUrl).catch(() => {});
    return;
  }
  download.disabled = true;
  download.textContent = 'Downloading…';
  status.textContent = 'Downloading update — Mercury will restart to install.';
  try {
    await api.downloadUpdate({ downloadUrl: pendingUpdate.downloadUrl, assetName: pendingUpdate.assetName });
    status.textContent = 'Installing update…';
    download.textContent = 'Installing…';
  } catch (err) {
    status.textContent = `Download failed: ${err.message}`;
    download.textContent = 'Retry';
    download.disabled = false;
  }
});

$('settings-rebuild').addEventListener('click', async () => {
  if (!confirm('Rebuild the local mail index? This clears the search index and re-downloads it. Your accounts and reactive folders are kept.')) return;
  try {
    await api.rebuildIndex();
    toast('Rebuilding index — syncing from your servers…', 'success');
    updateStats();
  } catch (err) {
    toast(err.message, 'error');
  }
});
