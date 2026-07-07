// Single shared UI state object. Modules mutate it directly and re-render the
// views they own.

export const PAGE_SIZE = 200; // reads come from the local index, so pages are cheap

export const state = {
  accounts: [],
  accountId: null,
  folders: [],
  folderPath: null,
  reactive: [], // reactive folder definitions
  reactiveId: null, // selected reactive folder ('__done__' = built-in Done folder)
  done: [], // done records for the current account
  doneIds: new Set(), // messageIds marked done
  messages: [],
  baseMessages: [], // unfiltered list backing the current view (for clearing search)
  listOffset: 0, // server-side offset of the next page
  hasMore: false, // more pages available in the current folder
  message: null, // currently open message
  openedFolder: null, // mailbox the open message lives in
  replyContext: null,
};
