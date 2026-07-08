// Single shared UI state object. Modules mutate it directly and re-render the
// views they own.

export const PAGE_SIZE = 200; // reads come from the local index, so pages are cheap

export const state = {
  accounts: [],
  accountId: null,
  folders: [],
  folderPath: null,
  completeInbox: false, // Static "Complete Inbox" view: inbox with no reactive/done filtering
  reactive: [], // reactive folder definitions
  reactiveId: null, // selected reactive folder ('__done__' = built-in Done folder)
  done: [], // done records for the current account
  doneIds: new Set(), // messageIds marked done
  stats: { total: 0, inboxUnread: 0, inboxVisibleUnread: 0 }, // status bar + inbox badge (visible = minus reactive-hidden)
  reactiveCounts: {}, // reactive folder id -> message count
  messages: [],
  baseMessages: [], // unfiltered list backing the current view (for clearing search)
  globalSearch: false, // title-bar search is showing account-wide results
  listOffset: 0, // server-side offset of the next page
  hasMore: false, // more pages available in the current folder
  message: null, // currently open message
  openedFolder: null, // mailbox the open message lives in
  replyContext: null,
};
