// Sidebar: account list, folder list, and the add-account modal.

import { api } from './api.js';
import { state } from './state.js';
import { $, avatarColor, folderIcon, sortFolders, escapeHtml, toast } from './utils.js';
import { loadMessages } from './list.js';
import { renderReader } from './reader.js';
import { renderReactive } from './reactive.js';
import { clearSearch } from './search.js';

export function renderAccounts() {
  const list = $('account-list');
  list.innerHTML = '';
  for (const account of state.accounts) {
    const btn = document.createElement('button');
    btn.className = `nav-item ${account.id === state.accountId ? 'active' : ''}`;

    const dot = document.createElement('span');
    dot.className = 'account-dot';
    dot.style.background = avatarColor(account.email);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = account.email;
    label.title = account.email;

    const remove = document.createElement('span');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.title = 'Remove account';
    remove.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove ${account.email}?`)) return;
      await api.removeAccount(account.id);
      state.accounts = state.accounts.filter((a) => a.id !== account.id);
      if (state.accountId === account.id) {
        state.accountId = state.accounts[0]?.id || null;
        state.accountId ? await selectAccount(state.accountId) : resetPanes();
      }
      renderAccounts();
    });

    btn.append(dot, label, remove);
    btn.addEventListener('click', () => selectAccount(account.id));
    list.appendChild(btn);
  }
}

export function renderFolders() {
  const list = $('folder-list');
  list.innerHTML = '';
  for (const folder of sortFolders(state.folders)) {
    const btn = document.createElement('button');
    const active = folder.path === state.folderPath && !state.reactiveId;
    btn.className = `nav-item ${active ? 'active' : ''}`;
    btn.innerHTML = folderIcon(folder.specialUse);
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = folder.name;
    label.title = folder.path;
    btn.appendChild(label);
    btn.addEventListener('click', () => selectFolder(folder.path));
    list.appendChild(btn);
  }
}

export function resetPanes() {
  state.folders = [];
  state.folderPath = null;
  state.reactiveId = null;
  state.messages = [];
  state.baseMessages = [];
  state.message = null;
  renderFolders();
  $('folder-title').textContent = 'Inbox';
  $('message-list').innerHTML = '<div class="empty-hint">Add an account to get started</div>';
  renderReader();
}

export async function selectAccount(accountId) {
  state.accountId = accountId;
  state.reactiveId = null;
  state.message = null;
  renderAccounts();
  renderReader();
  $('folder-list').innerHTML = '<div class="loading-hint">Loading folders…</div>';
  $('message-list').innerHTML = '<div class="loading-hint">Loading…</div>';
  try {
    state.reactive = await api.reactiveList(accountId);
    state.done = await api.doneList(accountId);
    state.doneIds = new Set(state.done.map((d) => d.messageId));
    renderReactive();
    api.syncNow(accountId).catch(() => {}); // freshen the index in the background
    state.folders = await api.listFolders(accountId);
    renderFolders();
    const inbox = state.folders.find((f) => f.specialUse === '\\Inbox') || state.folders[0];
    if (inbox) await selectFolder(inbox.path);
  } catch (err) {
    $('folder-list').innerHTML = '';
    $('message-list').innerHTML = `<div class="empty-hint">${escapeHtml(err.message)}</div>`;
  }
}

export async function selectFolder(folderPath) {
  state.folderPath = folderPath;
  state.reactiveId = null;
  state.message = null;
  clearSearch();
  renderFolders();
  renderReactive();
  renderReader();
  const folder = state.folders.find((f) => f.path === folderPath);
  $('folder-title').textContent = folder ? folder.name : folderPath;
  await loadMessages();
}

/* ---------- Add-account modal ---------- */

const GMAIL_PRESET = {
  imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true,
  smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true,
};

function accountFormValues() {
  const f = new FormData($('account-form'));
  return {
    name: f.get('name').trim(),
    email: f.get('email').trim(),
    user: f.get('user').trim(),
    password: f.get('password'),
    imap: { host: f.get('imapHost').trim(), port: f.get('imapPort'), secure: f.get('imapSecure') === 'on' },
    smtp: { host: f.get('smtpHost').trim(), port: f.get('smtpPort'), secure: f.get('smtpSecure') === 'on' },
  };
}

function applyPreset(preset) {
  const form = $('account-form');
  for (const [key, value] of Object.entries(preset)) {
    const input = form.elements[key];
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value;
  }
}

$('add-account-btn').addEventListener('click', () => {
  $('account-form').reset();
  $('gmail-hint').classList.add('hidden');
  $('preset-gmail').classList.remove('selected');
  $('preset-custom').classList.remove('selected');
  $('account-modal').classList.remove('hidden');
});

$('preset-gmail').addEventListener('click', () => {
  applyPreset(GMAIL_PRESET);
  $('gmail-hint').classList.remove('hidden');
  $('preset-gmail').classList.add('selected');
  $('preset-custom').classList.remove('selected');
});

$('preset-custom').addEventListener('click', () => {
  applyPreset({ imapHost: '', imapPort: 993, imapSecure: true, smtpHost: '', smtpPort: 465, smtpSecure: true });
  $('gmail-hint').classList.add('hidden');
  $('preset-custom').classList.add('selected');
  $('preset-gmail').classList.remove('selected');
});

$('account-cancel').addEventListener('click', () => $('account-modal').classList.add('hidden'));

$('account-test').addEventListener('click', async () => {
  if (!$('account-form').reportValidity()) return;
  const btn = $('account-test');
  btn.disabled = true;
  btn.textContent = 'Testing…';
  try {
    await api.testAccount(accountFormValues());
    toast('Connection successful', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test connection';
  }
});

$('account-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('account-save');
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    const account = await api.addAccount(accountFormValues());
    state.accounts.push(account);
    $('account-modal').classList.add('hidden');
    renderAccounts();
    await selectAccount(account.id);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add account';
  }
});
