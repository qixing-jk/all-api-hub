# webdav-selective-sync-data Specification

## Purpose
Selective WebDAV sync lets users choose which backup domains participate in manual WebDAV upload/download actions and automatic background sync. It benefits users who want to reduce bandwidth and remote storage churn, sync only part of their data across devices or folders, or combine multiple selected domains in a single backup flow without forcing an all-or-nothing restore. The design keeps the existing single-backup-file WebDAV workflow, reuses the current account/bookmark/preferences/API-credential backup structures, and does not introduce separate user-facing selectors for `tagStore` or `channelConfigs`. Non-goals include per-record conflict-free replication and transparent resolution of simultaneous multi-device uploads without explicit WebDAV conflict detection.

## Requirements

### Requirement: User can configure WebDAV sync data selection
The system MUST provide a multi-select checkbox list that allows the user to choose which data domains participate in WebDAV sync:

- Accounts
- Bookmarks
- API credential profiles
- Preferences

All options MUST default to checked.

The selection MUST be persisted locally in device preferences and reused by:
- Manual WebDAV upload/download+import actions on that device
- Background WebDAV auto-sync on that device

The selection MUST NOT be synchronized through the shared WebDAV preference payload and MUST NOT be overwritten by WebDAV restore or merge flows that apply `Preferences`.

#### Scenario: Default selection is all-checked for existing users
- **GIVEN** a user has stored preferences that do not include a WebDAV sync data selection field
- **WHEN** the user opens the WebDAV sync settings UI
- **THEN** all data-domain checkboxes are shown as checked

#### Scenario: Selection persists across sessions on the same device
- **WHEN** the user changes the selected data domains and saves WebDAV settings
- **THEN** the system persists the selection locally for that device
- **AND THEN** the next time the UI is opened on the same device the persisted selection is shown

#### Scenario: WebDAV restore preserves the current device's selection
- **GIVEN** device A and device B have different local WebDAV sync data selections
- **AND GIVEN** device A uploads a WebDAV backup that includes `Preferences`
- **WHEN** device B performs WebDAV download+import or WebDAV auto-sync that applies remote preferences
- **THEN** device B keeps its own local WebDAV sync data selection unchanged
- **AND THEN** subsequent WebDAV actions on device B use that unchanged local selection

### Requirement: Sync actions require at least one selected domain
The system MUST prevent WebDAV sync actions when the selection is empty.

Blocked actions MUST include:
- Manual WebDAV upload (backup)
- Manual WebDAV download+import (restore)
- Background `Sync now` and scheduled background sync

#### Scenario: Upload is blocked when selection is empty
- **GIVEN** the user has unchecked all WebDAV sync data domains
- **AND GIVEN** the WebDAV configuration is otherwise valid
- **WHEN** the user triggers the `Upload backup` action
- **THEN** the system does not upload any file to WebDAV
- **AND THEN** the UI displays an error indicating that at least one domain must be selected

#### Scenario: Download + Import (selection empty)
- **GIVEN** the user has unchecked all WebDAV sync data domains
- **AND GIVEN** the WebDAV configuration is otherwise valid
- **WHEN** the user triggers the `Download + Import` action from the UI or command flow
- **THEN** the action is blocked before any remote payload is imported
- **AND THEN** local data remains unchanged
- **AND THEN** the UI displays a disabled-state hint or error indicating that at least one domain must be selected

#### Scenario: Sync now / Background sync (selection empty)
- **GIVEN** the user has unchecked all WebDAV sync data domains
- **AND GIVEN** the WebDAV configuration is otherwise valid
- **WHEN** the user clicks `Sync now` or a scheduled background sync fires
- **THEN** the sync run is rejected before any upload or import is performed
- **AND THEN** the user sees an error or status message indicating that at least one domain must be selected

### Requirement: WebDAV uploads update only selected domains and preserve unselected remote domains
When uploading a WebDAV backup, the system MUST update only the selected domains.

Because WebDAV uploads replace the whole remote file, if an existing remote backup is present, any unselected domain that already exists remotely MUST be preserved in the uploaded payload rather than being deleted.

If no existing remote backup is present, unselected domains MAY be omitted from the uploaded payload.

This preserving-unselected-remote-domains behavior MUST use a read-then-write pattern: read the current remote backup, merge the selected local sections into that snapshot, and then upload the full replacement payload.

#### Scenario: Preferences-only upload preserves remote accounts and bookmarks
- **GIVEN** the remote WebDAV backup already contains an `accounts` section
- **AND GIVEN** the user has selected only `Preferences`
- **WHEN** the system uploads a WebDAV backup
- **THEN** the uploaded JSON payload keeps the existing remote `accounts` section unchanged
- **AND THEN** the uploaded JSON payload updates the `preferences` section from local data

#### Scenario: Accounts-only upload preserves remote bookmark ordering metadata
- **GIVEN** the remote WebDAV backup already contains `bookmarks`, `pinnedAccountIds`, and `orderedAccountIds`
- **AND GIVEN** the user has selected `Accounts` but unselected `Bookmarks`
- **WHEN** the system uploads a WebDAV backup
- **THEN** the uploaded JSON payload keeps the existing remote bookmark entries
- **AND THEN** bookmark-related ids in `pinnedAccountIds` and `orderedAccountIds` remain present

#### Scenario: Unselected domains may be omitted when remote backup does not exist
- **GIVEN** no remote WebDAV backup file exists yet
- **AND GIVEN** the user has unselected `API credential profiles`
- **WHEN** the system uploads a WebDAV backup
- **THEN** the uploaded JSON payload does not contain an `apiCredentialProfiles` section

### Requirement: Concurrent uploads must acknowledge lost-update risk
The preserving-unselected-remote-domains merge behavior reuses the same read-then-write pattern described above, so it does not prevent lost updates when multiple devices upload to the same WebDAV backup at the same time.

Until WebDAV `ETag` / `If-Match` conflict detection is implemented, the system MUST document or surface guidance telling users to avoid simultaneous uploads from multiple devices to the same backup path.

#### Scenario: Concurrent uploads can overwrite another device's selected-domain update
- **GIVEN** Device A selects `Accounts` and Device B selects `Preferences`
- **AND GIVEN** both devices read the same remote backup snapshot before uploading
- **WHEN** Device A uploads its merged payload and Device B uploads its own merged payload afterward
- **THEN** Device B preserves the stale remote `accounts` state from the snapshot it read earlier
- **AND THEN** Device A's newer `accounts` update is overwritten by the later full-file write
- **AND THEN** the recommended mitigation is to avoid simultaneous uploads or add `ETag` / `If-Match` conflict detection with retry handling

### Requirement: WebDAV imports apply only selected domains
When downloading and importing from WebDAV, the system MUST apply changes only for the selected domains.

Unselected domains MUST NOT be modified in local storage.

#### Scenario: Preferences unselected preserves local preferences
- **GIVEN** local preferences exist
- **AND GIVEN** the user has unselected `Preferences`
- **WHEN** the user performs WebDAV download+import
- **THEN** local preferences remain unchanged

#### Scenario: API credential profiles unselected preserves local credentials
- **GIVEN** local API credential profiles exist
- **AND GIVEN** the user has unselected `API credential profiles`
- **WHEN** the user performs WebDAV download+import
- **THEN** local API credential profiles remain unchanged

### Requirement: Accounts and bookmarks are independently synced
The system MUST treat `Accounts` and `Bookmarks` as separate sync domains.

When only one of these domains is selected:
- The selected domain MUST be imported or synced according to the chosen WebDAV strategy
- The unselected domain MUST remain unchanged locally

#### Scenario: Accounts-only import preserves local bookmarks
- **GIVEN** local bookmarks exist
- **AND GIVEN** the user selects `Accounts` but unselects `Bookmarks`
- **WHEN** the user performs WebDAV download+import
- **THEN** local bookmarks remain unchanged

#### Scenario: Bookmarks-only import preserves local accounts
- **GIVEN** local accounts exist
- **AND GIVEN** the user selects `Bookmarks` but unselects `Accounts`
- **WHEN** the user performs WebDAV download+import
- **THEN** local accounts remain unchanged

### Requirement: Auto-sync respects selection and does not wipe missing remote sections
During background WebDAV auto-sync, the system MUST apply the configured strategy (`merge`, `upload_only`, `download_only`) only to selected domains.

For `upload_only`, only local-to-remote changes for selected domains MUST be pushed. Unselected domains MUST NOT be uploaded from local data and MUST instead be preserved from the remote backup when present.

For `merge`, selected domains MUST be reconciled between local and remote data, while missing remote sections are treated as not provided rather than as deletion instructions.

If a selected domain is missing from the remote backup payload, the system MUST NOT delete or clear the corresponding local data. The test suite MUST cover this missing-section safety rule for `merge`, `upload_only`, and `download_only`.

`tagStore` MUST participate only when `Accounts`, `Bookmarks`, or `API credential profiles` participate in sync. A preferences-only selective sync MUST NOT create or overwrite `tagStore`.

`channelConfigs` MUST remain part of the backup import/export flow regardless of selective domain choices. `channelConfigs` are not user-selectable in this feature; when the remote payload omits `channelConfigs`, the local snapshot MUST be retained.

#### Scenario: Download-only does not wipe accounts when remote lacks accounts section
- **GIVEN** the user selects `Accounts`
- **AND GIVEN** the remote WebDAV backup payload does not contain an `accounts` section
- **WHEN** auto-sync runs with strategy `download_only`
- **THEN** local accounts remain unchanged
- **AND THEN** the follow-up uploaded payload keeps the local `accounts` data

#### Scenario: Upload-only pushes only selected local domains
- **GIVEN** the user selects `Accounts` and unselects `Preferences`
- **AND GIVEN** the remote WebDAV backup already contains a `preferences` section
- **WHEN** auto-sync runs with strategy `upload_only`
- **THEN** the uploaded payload contains local `accounts` data
- **AND THEN** the remote `preferences` section is preserved unchanged
- **AND THEN** local `preferences` data is not uploaded because `Preferences` is unselected

#### Scenario: Merge reconciles selected domains without deleting local data when remote sections are missing
- **GIVEN** the user selects `Accounts` and `Preferences`
- **AND GIVEN** the remote WebDAV backup contains a newer `preferences` section but omits the `accounts` section
- **WHEN** auto-sync runs with strategy `merge`
- **THEN** local `accounts` remain unchanged because the selected remote accounts section is missing
- **AND THEN** `preferences` are reconciled using the merge rules for the selected domain
- **AND THEN** the uploaded payload contains the local `accounts` data plus the merged `preferences` result

#### Scenario: Preferences-only selective sync excludes tagStore but still carries channelConfigs
- **GIVEN** the user selects only `Preferences`
- **WHEN** manual selective sync or background auto-sync runs
- **THEN** `tagStore` is not created or overwritten by the preferences-only selection
- **AND THEN** `channelConfigs` remain included through the backup flow
- **AND THEN** strategy `merge` reconciles local and remote `channelConfigs` entries by `updatedAt`
- **AND THEN** the local `channelConfigs` snapshot is retained only when the remote payload omits `channelConfigs` entirely

### Requirement: Selective sync fails safely on malformed remote backups
The system MUST fail safely when the remote backup is invalid JSON, and it MUST preserve local data when remote sections are malformed or partially corrupted.

Schema mismatches inside a remote section MUST be treated as invalid or missing for that section during normalization rather than deleting unrelated local data.

The test suite MUST include explicit cases for invalid JSON in remote backups, schema mismatches in remote sections, and partially corrupted remote backups.

#### Scenario: Invalid JSON remote backup aborts the sync safely
- **GIVEN** the remote WebDAV backup content is not valid JSON
- **WHEN** a manual import or background sync attempts to parse it
- **THEN** the action fails with an error
- **AND THEN** local data remains unchanged
- **AND THEN** the run does not upload a replacement payload for that failed attempt

#### Scenario: Schema mismatch in a remote section does not delete local data
- **GIVEN** the remote payload contains an `accounts` section whose `accounts` field is not an array
- **AND GIVEN** `Accounts` is selected for selective sync
- **WHEN** the system normalizes and processes the remote payload
- **THEN** the malformed remote accounts section is treated as invalid or missing for that section
- **AND THEN** local accounts remain preserved instead of being deleted

#### Scenario: Partially corrupted remote backup preserves unaffected local sections
- **GIVEN** the remote payload contains a valid `preferences` section and a corrupted `accounts` section
- **AND GIVEN** `Accounts` and `Preferences` are selected
- **WHEN** selective sync runs
- **THEN** the valid `preferences` section may still participate in the selected-domain workflow
- **AND THEN** the corrupted `accounts` section does not delete the existing local accounts data
