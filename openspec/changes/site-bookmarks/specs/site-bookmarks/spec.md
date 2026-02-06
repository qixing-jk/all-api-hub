# site-bookmarks Specification

## Purpose
Allow users to save and manage lightweight “bookmark” entries for quick access to a site URL (console/docs/admin pages) without creating a full `SiteAccount`. Bookmarks must be available in both Options and Popup, support tags/notes/pin/reorder, sync via backups/WebDAV, and MUST NOT affect any account-only flows.

## Definitions
- **SiteBookmark**: A persisted bookmark-like entry containing only `name + url` with optional `tags + notes`.
- **Entry**: Either a `SiteAccount` or a `SiteBookmark`.
- **Entry id lists**: The existing `AccountStorageConfig.pinnedAccountIds` and `AccountStorageConfig.orderedAccountIds` arrays, treated as ordering metadata for all entries (accounts and bookmarks).

## ADDED Requirements

### Requirement: Persisted bookmark data model
The system MUST persist bookmarks as `SiteBookmark` records with the following fields:
- `id: string` (unique across all entries)
- `name: string`
- `url: string`
- `tagIds: string[]` (global tag ids)
- `notes: string` (always present; default `""`)
- `created_at: number` (timestamp)
- `updated_at: number` (timestamp)

Bookmarks MUST be stored in `AccountStorageConfig.bookmarks` under the existing `site_accounts` storage key. The persisted `AccountStorageConfig` MUST always include `bookmarks` as an array (default `[]`). Missing `bookmarks` in legacy payloads MUST be treated as an empty list.

#### Scenario: Backward compatible load with no bookmarks field
- **GIVEN** a stored `AccountStorageConfig` payload that has no `bookmarks` field
- **WHEN** the extension loads account storage
- **THEN** the system treats bookmarks as an empty list and does not throw

#### Scenario: Persisted config always includes bookmarks array
- **GIVEN** the extension writes `AccountStorageConfig` back to storage after any update
- **WHEN** the write completes
- **THEN** the persisted config contains `bookmarks` as an array (which MAY be empty)

#### Scenario: Persisted bookmark always includes notes
- **GIVEN** a bookmark is created or edited with an empty notes value
- **WHEN** the bookmark is persisted
- **THEN** the persisted bookmark contains `notes` as a string (defaulting to `""`)

### Requirement: Create bookmark
Users MUST be able to create a new `SiteBookmark` by providing a `name` and `url`.

#### Scenario: Successful create
- **WHEN** the user creates a bookmark with a valid `name` and `url`
- **THEN** the system persists a new `SiteBookmark` with a generated `id`, sets `created_at` and `updated_at`, and the bookmark appears in the Bookmarks list immediately

#### Scenario: Create persists default notes
- **WHEN** the user creates a bookmark without entering any notes
- **THEN** the system persists the bookmark with `notes` set to `""`

### Requirement: Edit bookmark
Users MUST be able to edit an existing bookmark’s `name`, `url`, `tagIds`, and `notes`.

#### Scenario: Edit updates updated_at and preserves identity
- **GIVEN** an existing bookmark with `id = X` and `created_at = C`
- **WHEN** the user edits the bookmark and saves changes
- **THEN** the persisted bookmark keeps `id = X` and `created_at = C`, and MUST update `updated_at` to a newer timestamp

### Requirement: Delete bookmark removes related ordering metadata
Users MUST be able to delete a bookmark. When a bookmark is deleted, its id MUST be removed from any entry-id metadata lists that reference it (`pinnedAccountIds` and `orderedAccountIds`).

#### Scenario: Delete cleans pinned and ordered lists
- **GIVEN** a bookmark id `B` exists in storage and `B` appears in `pinnedAccountIds` and `orderedAccountIds`
- **WHEN** the user deletes the bookmark `B`
- **THEN** the bookmark is removed from `AccountStorageConfig.bookmarks` and `B` no longer appears in `pinnedAccountIds` or `orderedAccountIds`

### Requirement: Bookmark list UI exists in Options and Popup
The system MUST provide a Bookmarks list UI in both Options and Popup:

- **Options:** Bookmarks MUST be accessible via a dedicated Options sidebar/menu page (route `#bookmark`).
- **Popup:** Users MUST be able to switch between Accounts and Bookmarks via an `Accounts | Bookmarks` control.

#### Scenario: Bookmarks view does not show account-only sections
- **WHEN** the user switches to the Bookmarks view in the Popup
- **THEN** the popup hides account-only content (e.g., balance aggregates and account action shortcuts) and shows bookmark actions instead

### Requirement: Bookmark row actions (open, copy, edit, delete)
Each bookmark row MUST support:
- Open the URL
- Copy the URL
- Edit
- Delete

#### Scenario: Copy URL action
- **GIVEN** a bookmark with `url = U` is visible in the Bookmarks list
- **WHEN** the user triggers “Copy URL”
- **THEN** the system copies `U` to the clipboard and does not modify account data

### Requirement: Bookmark search and tag filtering
The Bookmarks list MUST support searching bookmarks by:
- `name`
- `url`
- `notes`
- referenced tag names (via `tagIds`)

The Bookmarks list MUST also support filtering by one or more selected tags.

#### Scenario: Search matches URL
- **GIVEN** a bookmark with `url` containing `example.com/docs`
- **WHEN** the user searches for `docs`
- **THEN** the bookmark appears in the filtered results

### Requirement: Bookmarks use the global tag system
Bookmarks MUST store tag references via `tagIds` pointing to the global tag store. Tag assignment and tag-based filtering MUST operate on these ids (not duplicated tag names stored on the bookmark).

#### Scenario: Bookmark persists tag ids
- **GIVEN** a global tag with id `T` exists
- **WHEN** the user assigns tag `T` to a bookmark and saves
- **THEN** the persisted bookmark contains `tagIds` including `T`

### Requirement: Tag deletion removes references from bookmarks
When a global tag is deleted, the system MUST remove that tag id from every bookmark’s `tagIds`.

#### Scenario: Delete tag cleans bookmarks
- **GIVEN** a tag id `T` is referenced by at least one bookmark’s `tagIds`
- **WHEN** the user deletes tag `T`
- **THEN** all bookmarks are persisted with `T` removed from their `tagIds`

### Requirement: Pin/unpin bookmarks via shared pinned entry id list
Bookmarks MUST support pin/unpin. Pinned state MUST be represented by membership in `AccountStorageConfig.pinnedAccountIds` (shared across entries).

Pinned bookmarks MUST appear before non-pinned bookmarks in the Bookmarks list, ordered by the order of bookmark ids within `pinnedAccountIds`.

#### Scenario: Pin adds id to pinned list and surfaces at top
- **GIVEN** a bookmark id `B` is not pinned
- **WHEN** the user pins bookmark `B`
- **THEN** `B` is added to `pinnedAccountIds` and the bookmark appears in the pinned segment at the top of the Bookmarks list

### Requirement: Manual reordering of bookmarks via shared ordered entry id list
Bookmarks MUST support manual reordering. Manual order MUST be represented using `AccountStorageConfig.orderedAccountIds` (shared across entries).

When rendering the Bookmarks list, the system MUST order bookmarks deterministically as:
1. Pinned bookmarks first (filtered from `pinnedAccountIds`)
2. Then remaining bookmarks by their relative order in `orderedAccountIds` (filtered to bookmark ids)
3. Then any remaining bookmarks not present in `orderedAccountIds`, appended in a stable manner (case-insensitive name tie-breaker)

#### Scenario: Reorder bookmarks does not drop account ids from ordered list
- **GIVEN** `orderedAccountIds` contains a mix of account ids and bookmark ids
- **WHEN** the user reorders bookmarks in the Bookmarks list
- **THEN** the persisted `orderedAccountIds` preserves all account ids and updates only the relative order of the bookmark ids to match the user’s reorder action

### Requirement: Bookmarks do not participate in account-only flows
Bookmarks MUST NOT be treated as accounts. They MUST NOT appear in any UI or service flow that requires an account, including (but not limited to) key/model management selectors, balance/usage aggregates, refresh/check-in automation, or redemption flows.

#### Scenario: Account selector excludes bookmarks
- **GIVEN** at least one bookmark exists
- **WHEN** the user opens a UI that lists/selects `SiteAccount` entries (e.g., key/model management)
- **THEN** no bookmark is shown as a selectable account option

### Requirement: Backup import/export includes bookmarks and ordering metadata
Full backups MUST include bookmark data and entry ordering metadata:
- `bookmarks` (list of `SiteBookmark`)
- `pinnedAccountIds`
- `orderedAccountIds` (when present)

Backup import MUST tolerate backups that omit bookmark and/or order fields.

#### Scenario: V2 import defaults missing bookmark/order fields to empty
- **GIVEN** a V2 backup payload that contains accounts but omits `bookmarks` and `orderedAccountIds`
- **WHEN** the user imports the backup
- **THEN** the import completes successfully and bookmarks/order are treated as empty for that imported dataset

#### Scenario: Legacy import that only provides accounts preserves local bookmarks
- **GIVEN** a legacy (V1) backup payload that contains accounts but has no bookmark fields
- **WHEN** the user imports the backup
- **THEN** the account import completes successfully and existing local bookmarks remain unchanged

### Requirement: WebDAV sync merges bookmarks and preserves valid ordering metadata
When WebDAV sync runs in MERGE mode, the system MUST:
- Merge bookmarks by `id` using `updated_at` (newer wins)
- Merge `pinnedAccountIds` as a remote-first union (de-duped), then filter to ids that exist as either an account or a bookmark after the merge
- Choose `orderedAccountIds` by “latest config wins” using `accounts.last_updated`, normalize it (de-dupe + filter to existing entry ids), and append any missing entry ids deterministically

#### Scenario: Merge keeps latest bookmark by updated_at
- **GIVEN** the same bookmark id `B` exists locally and remotely with different `updated_at` values
- **WHEN** WebDAV sync runs in MERGE mode
- **THEN** the persisted bookmark `B` is the version with the newer `updated_at`
