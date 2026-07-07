// Reading pane: opening a message, rendering headers/attachments, and the
// sandboxed body frame.

import { api } from './api.js';
import { state } from './state.js';
import { $, avatarColor, initials, formatFullDate, formatSize, escapeHtml, toast } from './utils.js';
import { markRowActive, removeRowByUid } from './list.js';
import { updateDoneButton } from './done.js';

export function showReaderStatus(text) {
  $('reader').classList.add('hidden');
  const empty = $('reader-empty');
  empty.classList.remove('hidden');
  empty.querySelector('p').textContent = text;
}

export function renderReader() {
  const msg = state.message;
  if (!msg) {
    $('reader').classList.add('hidden');
    const empty = $('reader-empty');
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = 'Select a message to read';
    return;
  }
  $('reader-empty').classList.add('hidden');
  $('reader').classList.remove('hidden');

  $('reader-subject').textContent = msg.subject;
  const avatar = $('reader-avatar');
  avatar.style.background = avatarColor(msg.from.address || '?');
  avatar.textContent = initials(msg.from.name, msg.from.address);

  const fromEl = $('reader-from');
  fromEl.textContent = '';
  fromEl.append(msg.from.name || msg.from.address);
  if (msg.from.name && msg.from.address) {
    const small = document.createElement('small');
    small.textContent = ` <${msg.from.address}>`;
    fromEl.appendChild(small);
  }

  const recipients = [...msg.to, ...msg.cc].map((r) => r.name || r.address).join(', ');
  $('reader-to').textContent = recipients ? `to ${recipients}` : '';
  $('reader-date').textContent = formatFullDate(msg.date);

  updateDoneButton();
  renderAttachments(msg);
  renderBody(msg);
}

function renderAttachments(msg) {
  const attWrap = $('reader-attachments');
  attWrap.innerHTML = '';
  attWrap.classList.toggle('hidden', !msg.attachments.length);
  for (const att of msg.attachments) {
    const chip = document.createElement('button');
    chip.className = 'attachment-chip';
    chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48"/></svg>';
    chip.appendChild(document.createTextNode(`${att.filename} (${formatSize(att.size)})`));
    chip.addEventListener('click', async () => {
      try {
        const saved = await api.saveAttachment(state.accountId, state.openedFolder, msg.uid, att.index);
        if (saved) toast(`Saved to ${saved}`, 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    attWrap.appendChild(chip);
  }
}

function renderBody(msg) {
  const body = msg.html || `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(msg.text)}</pre>`;

  // Recreate the frame per message: a fresh element gets a fresh compositor
  // surface, avoiding the macOS glitch where a reused frame turns permanently
  // white. `allow-same-origin` (without allow-scripts, so still inert) keeps
  // the frame in the main renderer process, dodging the buggy out-of-process
  // iframe compositing path entirely.
  const old = $('reader-frame');
  const frame = document.createElement('iframe');
  frame.id = 'reader-frame';
  frame.className = 'reader-frame';
  frame.setAttribute('sandbox', 'allow-same-origin allow-popups');
  // <base>: makes protocol-relative URLs (//cdn.example.com/x.png) resolve to
  // https instead of file://, and opens all email links out of the app.
  frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <base href="https://email.invalid/" target="_blank">
    <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.55;color:#1c1c22;margin:0;padding:22px 26px;word-wrap:break-word}img{max-width:100%;height:auto}a{color:#4d5cf0}</style>
    </head><body>${body}</body></html>`;
  old.replaceWith(frame);
}

let openSequence = 0;

export async function openMessage(item) {
  const seq = ++openSequence;
  const folder = item.folder || state.folderPath;
  item.seen = true;
  state.message = { uid: item.uid };
  state.openedFolder = folder;
  markRowActive(item.uid);
  showReaderStatus('Loading message…');
  try {
    const message = await api.getMessage(state.accountId, folder, item.uid);
    if (seq !== openSequence) return; // user already clicked another message
    state.message = message;
    renderReader();
  } catch (err) {
    if (seq !== openSequence) return;
    showReaderStatus(`Could not load message: ${err.message}`);
  }
}

$('delete-btn').addEventListener('click', async () => {
  const msg = state.message;
  if (!msg || !confirm('Delete this message?')) return;
  try {
    await api.deleteMessage(state.accountId, state.openedFolder, msg.uid);
    state.messages = state.messages.filter((m) => m.uid !== msg.uid);
    state.baseMessages = state.baseMessages.filter((m) => m.uid !== msg.uid);
    state.message = null;
    removeRowByUid(msg.uid);
    renderReader();
    toast('Message deleted', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});
