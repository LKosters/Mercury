const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const storeFile = () => path.join(app.getPath('userData'), 'accounts.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  } catch {
    return [];
  }
}

function save(list) {
  fs.writeFileSync(storeFile(), JSON.stringify(list, null, 2));
}

function encryptPassword(password) {
  if (safeStorage.isEncryptionAvailable()) {
    return { passwordEnc: safeStorage.encryptString(password).toString('base64'), encrypted: true };
  }
  return { passwordEnc: Buffer.from(password, 'utf8').toString('base64'), encrypted: false };
}

function decryptPassword(entry) {
  const buf = Buffer.from(entry.passwordEnc, 'base64');
  return entry.encrypted ? safeStorage.decryptString(buf) : buf.toString('utf8');
}

// Public shape without secrets, for the renderer.
function toPublic(entry) {
  const { passwordEnc, encrypted, ...rest } = entry;
  return rest;
}

function listAccounts() {
  return load().map(toPublic);
}

function addAccount(input) {
  const list = load();
  const entry = {
    id: crypto.randomUUID(),
    name: input.name || input.email,
    email: input.email,
    user: input.user || input.email,
    imap: { host: input.imap.host, port: Number(input.imap.port), secure: !!input.imap.secure },
    smtp: { host: input.smtp.host, port: Number(input.smtp.port), secure: !!input.smtp.secure },
    ...encryptPassword(input.password),
  };
  list.push(entry);
  save(list);
  return toPublic(entry);
}

function removeAccount(id) {
  save(load().filter((a) => a.id !== id));
  return true;
}

// Full account including decrypted password, for main-process use only.
function getAccount(id) {
  const entry = load().find((a) => a.id === id);
  if (!entry) throw new Error('Account not found');
  return { ...toPublic(entry), password: decryptPassword(entry) };
}

// Build an account object from raw form input without persisting (for connection tests).
function buildTransient(input) {
  return {
    name: input.name || input.email,
    email: input.email,
    user: input.user || input.email,
    imap: { host: input.imap.host, port: Number(input.imap.port), secure: !!input.imap.secure },
    smtp: { host: input.smtp.host, port: Number(input.smtp.port), secure: !!input.smtp.secure },
    password: input.password,
  };
}

module.exports = { listAccounts, addAccount, removeAccount, getAccount, buildTransient };
