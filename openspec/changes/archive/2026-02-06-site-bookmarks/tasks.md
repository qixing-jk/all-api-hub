## 1. Types and storage schema

- [x] 1.1 Add `SiteBookmark` type to `types/index.ts` (fields per spec) and ensure ids are strings.
- [x] 1.2 Extend `AccountStorageConfig` with `bookmarks: SiteBookmark[]` (default `[]`) and ensure missing `bookmarks` is treated as `[]` on reads.
- [x] 1.3 Update any services that read/write `AccountStorageConfig` (e.g. `services/accountTags/tagStorage.ts`) to preserve `bookmarks` and always persist `bookmarks` as an array.

## 2. Account storage: bookmark CRUD

- [x] 2.1 Add bookmark CRUD APIs on `services/accountStorage.ts` (list/get/create/update/delete) implemented via the existing storage write lock.
- [x] 2.2 Generate bookmark ids via `safeRandomUUID('bookmark')` (or equivalent) and set `created_at` / `updated_at` timestamps.
- [x] 2.3 Validate and normalize bookmark inputs (trim `name`/`url`; enforce non-empty; normalize `tagIds` to a string array; persist `notes` as a string, default `""`).
- [x] 2.4 Ensure deleting a bookmark removes its id from `pinnedAccountIds` and `orderedAccountIds`.

## 3. Shared pinned/manual order metadata for entries

- [x] 3.1 Update pruning/filtering logic in `services/accountStorage.ts` (`setPinnedList`, `setOrderedList`, `saveAccounts`, `importData`) so entry id lists are validated against **accounts + bookmarks** (do not drop bookmark ids).
- [x] 3.2 Add a helper to update only a subset (accounts vs bookmarks) inside the global id lists while preserving the other entity type’s ids and order (needed for per-view reorder and pinned-order updates).
- [x] 3.3 Update `features/AccountManagement/hooks/AccountDataContext.tsx` reorder logic so:
  - reordering accounts updates only the account subset inside the shared lists
  - pinned-order updates do not overwrite pinned bookmark ids

## 4. Global tags integration

- [x] 4.1 Extend `services/accountTags/tagStorage.ts` to read/write `AccountStorageConfig.bookmarks` without data loss.
- [x] 4.2 Extend `tagStorage.deleteTag()` to remove the deleted tag id from both `SiteAccount.tagIds` and `SiteBookmark.tagIds`.
- [x] 4.3 Add/extend tests to verify tag deletion removes references from bookmarks (and preserves bookmarks on unrelated tag operations).

## 5. Import/Export backups

- [x] 5.1 Update V2 backup normalization/import in `entrypoints/options/pages/ImportExport/utils.ts` so `bookmarks` and `orderedAccountIds` are imported when present and default safely when missing.
- [x] 5.2 Update exports so full backups include `bookmarks` and `orderedAccountIds` (and always include `bookmarks` as an array).
- [x] 5.3 Add/extend tests for import/export covering bookmarks + pinned/ordered id lists.

## 6. WebDAV auto-sync

- [x] 6.1 Extend `services/webdav/webdavAutoSyncService.ts` to include `bookmarks` and `orderedAccountIds` in uploads.
- [x] 6.2 Implement merge rules:
  - bookmarks merged by id using `updated_at` (newer wins)
  - pinned ids union (remote-first) filtered to ids that exist as an account or bookmark after merge
  - ordered ids “latest wins” using `accounts.last_updated`, then append missing entry ids stably
- [x] 6.3 Add/extend WebDAV sync tests to cover bookmark merge + ordered list syncing/filtering.

## 7. Options UI: Bookmarks view

- [x] 7.1 Add a dedicated Bookmarks page in Options (`#bookmark`) wired into the sidebar menu (`entrypoints/options/constants.ts`) and rendered by `entrypoints/options/pages/BookmarkManagement/index.tsx`.
- [x] 7.2 Implement a Bookmarks list UI with search + tag filter, pin/unpin, and drag reorder (reusing existing styling patterns and `TagPicker`).
- [x] 7.3 Implement Add/Edit Bookmark dialog and row actions: open, copy URL, edit, delete.
- [x] 7.4 Ensure bookmark UI does not invoke account-only actions/services (refresh/check-in/redeem/stats).

## 8. Popup UI: Bookmarks view

- [x] 8.1 Add the same `Accounts | Bookmarks` switch to the popup (`entrypoints/popup/App.tsx` + related components).
- [x] 8.2 When Bookmarks is selected, switch to a bookmark-focused UI (bookmark stats + bookmark list) while keeping shared navigation actions consistent; hide account-only refresh controls.
- [x] 8.3 Verify popup/side-panel/mobile layouts remain usable with the new view.
- [x] 8.4 Combine daily cashflow (income/consumption) and total balance into a single account stats display.
- [x] 8.5 Add a dedicated statistics section for bookmarks for visual consistency with the Accounts view.
- [x] 8.6 Use one shared popup action button group; only the primary CTA changes between `Add Account` and `Add Bookmark` based on the active view.

## 9. i18n and copy

- [x] 9.1 Add i18n keys for bookmark labels, actions, validation, and toasts across supported locales (`locales/*`).
- [x] 9.2 Keep copy consistent and ensure all new user-facing strings are translated.

## 10. Tests and validation

- [x] 10.1 Add unit tests for bookmark CRUD + shared pinned/ordered list behavior (including “subset merge” semantics).
- [x] 10.2 Add component tests for the Bookmarks UI (Options + Popup) covering key flows (create/edit/delete, pin/unpin, reorder, search/filter).
- [x] 10.3 Run `pnpm lint && pnpm format:check && pnpm compile && pnpm test:ci`; if blocked by environment, record the blocker and the next step.
