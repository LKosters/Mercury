// First-run onboarding. The #welcome overlay is shown whenever the app has no
// accounts and hidden once one exists. renderAccounts() (sidebar.js) dispatches
// an 'accounts-changed' event on every account-list change — that's what drives
// the overlay, so this module stays decoupled from the account plumbing.

import { state } from './state.js';
import { $ } from './utils.js';
import { runImport } from './settings.js';

export function refreshWelcome() {
  $('welcome').classList.toggle('hidden', state.accounts.length > 0);
}

// "Add an account" → hand off to the existing add-account modal (owned by
// sidebar.js). Hide the overlay while the modal is up; if the user cancels with
// still no accounts, the modal-dismiss hooks below bring it back.
$('welcome-add').addEventListener('click', () => {
  $('welcome').classList.add('hidden');
  $('add-account-btn').click();
});

$('welcome-import').addEventListener('click', async () => {
  const btn = $('welcome-import');
  btn.disabled = true;
  try {
    await runImport(); // shows its own toast; reloads accounts on success
  } finally {
    btn.disabled = false;
    refreshWelcome(); // reveal the app if an account was imported, else stay
  }
});

// Bring the welcome screen back if the add-account modal is dismissed and we
// still have no accounts (cancel button or Escape).
$('account-cancel').addEventListener('click', () => refreshWelcome());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') refreshWelcome();
});

// Re-evaluate whenever the account list changes (add / remove / import / boot).
window.addEventListener('accounts-changed', refreshWelcome);
