// Gmail-style docked composer: new message, reply with quoting, rich text.

import { api } from './api.js';
import { state } from './state.js';
import { $, toast, escapeHtml, formatFullDate } from './utils.js';

export function openCompose({ to = '', subject = '', bodyHtml = '', inReplyTo = null } = {}) {
  if (!state.accountId) {
    toast('Add an account first', 'error');
    return;
  }
  state.replyContext = inReplyTo;
  $('composer-title').textContent = inReplyTo ? subject || 'Reply' : 'New Message';
  const form = $('compose-form');
  form.reset();
  form.elements.to.value = to;
  form.elements.subject.value = subject;
  $('cc-row').classList.add('hidden');
  $('bcc-row').classList.add('hidden');
  $('show-cc').classList.remove('hidden');
  $('show-bcc').classList.remove('hidden');
  const editor = $('composer-editor');
  editor.innerHTML = bodyHtml;
  $('composer').classList.remove('hidden', 'minimized');
  if (to) {
    // Replying: caret at the top, above the quoted message.
    editor.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    sel.addRange(range);
    editor.scrollTop = 0;
  } else {
    form.elements.to.focus();
  }
}

export function closeComposer() {
  $('composer').classList.add('hidden');
  $('composer-editor').innerHTML = '';
  $('compose-form').reset();
  state.replyContext = null;
}

$('compose-btn').addEventListener('click', () => openCompose());

$('reply-btn').addEventListener('click', () => {
  const msg = state.message;
  if (!msg || !msg.from) return; // still loading

  const quotedContent = msg.html || `<pre style="white-space:pre-wrap">${escapeHtml(msg.text || '')}</pre>`;
  const who = escapeHtml(msg.from.name || msg.from.address);
  openCompose({
    to: msg.from.address,
    subject: msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`,
    bodyHtml:
      `<br><br><div style="color:#888;font-size:12.5px">On ${formatFullDate(msg.date)}, ${who} wrote:</div>` +
      `<blockquote>${quotedContent}</blockquote>`,
    inReplyTo: msg.messageId || null,
  });
});

/* ---------- Composer chrome ---------- */

$('composer-min').addEventListener('click', (e) => {
  e.stopPropagation();
  $('composer').classList.toggle('minimized');
});

$('composer-header').addEventListener('click', () => {
  $('composer').classList.toggle('minimized');
});

$('composer-close').addEventListener('click', (e) => {
  e.stopPropagation();
  closeComposer();
});

$('compose-discard').addEventListener('click', closeComposer);

$('show-cc').addEventListener('click', (e) => {
  $('cc-row').classList.remove('hidden');
  e.currentTarget.classList.add('hidden');
  $('cc-row').querySelector('input').focus();
});

$('show-bcc').addEventListener('click', (e) => {
  $('bcc-row').classList.remove('hidden');
  e.currentTarget.classList.add('hidden');
  $('bcc-row').querySelector('input').focus();
});

// Formatting buttons: mousedown so the editor's selection is preserved.
document.querySelectorAll('.fmt-group button').forEach((btn) => {
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.execCommand(btn.dataset.cmd);
  });
});

// Cmd/Ctrl+Enter sends, like Gmail.
$('composer').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    $('compose-form').requestSubmit();
  }
});

$('compose-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('compose-send');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const f = new FormData($('compose-form'));
  const editor = $('composer-editor');
  try {
    await api.sendMessage(state.accountId, {
      to: f.get('to'),
      cc: f.get('cc') || '',
      bcc: f.get('bcc') || '',
      subject: f.get('subject'),
      text: editor.innerText,
      html: editor.innerHTML,
      inReplyTo: state.replyContext,
    });
    closeComposer();
    toast('Message sent', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
});
