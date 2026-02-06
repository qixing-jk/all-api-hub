## Why

Users often need quick access to site consoles/docs/admin pages without managing full “site account” records (which require username/userId/token and participate in stats, key/model pages, etc.). Today the closest workaround is creating disabled accounts as pseudo-bookmarks, which is noisy and error-prone.

## What Changes

- Add a first-class **Bookmark** entry type (separate from `SiteAccount`) for saving a `name + url` with optional `tags + notes`.
- Bookmarks support **pin/unpin** and **manual reordering**, consistent with existing account list behaviors.
- Expose bookmarks in **both Options and Popup** UIs:
  - **Options:** a dedicated sidebar/menu page (`#bookmark`) for bookmark management
  - **Popup:** an `Accounts | Bookmarks` switch (tabs) that swaps stats + list content
  - Shared bookmark list behaviors: open, copy URL, pin/unpin, reorder, search, tag filtering (global tag ids)
- Extend backup/sync flows so bookmarks are included in:
  - Import/Export JSON backups
  - WebDAV auto-sync merge/upload/download flows (including pinned + ordered metadata)
- Keep existing account flows unchanged; bookmarks MUST NOT appear in key/model management selectors or affect balance/usage aggregates.

## Capabilities

### New Capabilities

- `site-bookmarks`: Manage standalone bookmarks (CRUD, open/copy, tags/notes, pin/reorder) in Options + Popup, and persist/sync them via backups/WebDAV.

### Modified Capabilities

None.

## Impact

- Storage/services: add bookmark storage + migrations/locking; integrate tag deletion cleanup; extend import/export + WebDAV sync payloads/merging.
- UI: Options adds a dedicated Bookmarks page (sidebar route) and Popup adds an Accounts/Bookmarks switch; dialogs and list actions follow existing styling/interaction patterns.
- i18n: add new strings for bookmark UI/actions.
- Tests: add unit tests for bookmark storage and update import/export + WebDAV + tag deletion tests to cover bookmarks.
