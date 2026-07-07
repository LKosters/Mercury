# Mercury ☿

A fast, glassy desktop email client built with Electron. Works with Gmail and any custom IMAP/SMTP mail server. All mail is indexed into a local SQLite database and synced in the background, so browsing tens of thousands of messages stays instant.

## Run it

```bash
npm install
npm start
```

## Features

- Three-pane layout: accounts & folders, message list, reading pane
- Multiple accounts (any IMAP/SMTP server)
- Gmail preset — one click fills in the correct servers
- Read HTML email (rendered in a sandboxed frame, embedded images supported)
- Search the current folder (server-side IMAP search on subject/from/to)
- **Reactive folders**: tag senders and their mail is auto-collected into app-local
  virtual folders — stored only in this client, nothing syncs to the server

- Compose, reply (with quoting), delete (moves to Trash when the server has one)
- Download attachments
- Passwords encrypted with the OS keychain via Electron `safeStorage`
- Dark and light theme (follows the system)

## Connecting Gmail

Gmail no longer allows plain passwords over IMAP, so you need an **App Password**:

1. Enable 2-Step Verification on your Google account
2. Go to Google Account → Security → 2-Step Verification → App passwords
3. Create one for "Mail" and paste it into the app's password field

Also make sure IMAP is enabled in Gmail settings (Settings → Forwarding and POP/IMAP).

## Connecting a custom server

Fill in your IMAP host/port (usually 993 with SSL) and SMTP host/port (usually 465 with SSL, or 587 with STARTTLS — untick SSL for 587). Use **Test connection** in the add-account dialog to verify before saving.

## Project layout

```
src/
  main/                Main process
    main.js            Entry point: window, lifecycle, sync scheduler
    ipc.js             All IPC handlers (renderer <-> main)
    accounts.js        Account store (passwords encrypted via safeStorage)
    mail.js            IMAP (imapflow) + SMTP (nodemailer) + parsing (mailparser)
    db.js              SQLite message index (better-sqlite3)
    sync.js            Background sync engine (full + incremental)
    reactive.js        Reactive folder store (app-local virtual folders)
    done.js            Done-message store (app-local checkmarks)
  preload.js           Context-isolated bridge exposed as window.mailApi
  renderer/
    index.html         UI markup + modals
    styles.css         Liquid Glass theme (dark/light)
    js/                ES modules, one per component
      app.js           Entry point: init + global shortcuts
      state.js         Shared UI state
      api.js           Bridge re-export
      utils.js         Formatting, icons, toast
      sidebar.js       Accounts, folders, add-account modal
      list.js          Message list, pagination, inbox filters
      reader.js        Reading pane + sandboxed body frame
      composer.js      Gmail-style docked composer
      reactive.js      Reactive folders UI + tag menu + manage modal
      done.js          Done feature
      search.js        Search bar
      sync.js          Sync status + live refresh
assets/                App icon
```
