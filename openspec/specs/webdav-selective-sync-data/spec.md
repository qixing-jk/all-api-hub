# webdav-selective-sync-data Specification

## Purpose
TBD - synced from change webdav-selective-sync-multi-select. Update Purpose after archive.

## Requirements

### Requirement: User can configure WebDAV sync data selection
The system MUST provide a multi-select (checkbox list) that allows the user to choose which data domains participate in WebDAV sync:

- Accounts
- Bookmarks
- API credential profiles
- Preferences

All options MUST default to **checked**.

The selection MUST be persisted in user preferences and reused by:
- Manual WebDAV upload/download+import actions
- Background WebDAV auto-sync

#### Scenario: Default selection is all-checked for existing users
- **GIVEN** a user has stored preferences that do not include a WebDAV sync data selection field
- **WHEN** the user opens the WebDAV sync settings UI
- **THEN** all data-domain checkboxes are shown as checked

#### Scenario: Selection persists across sessions
- **WHEN** the user changes the selected data domains and saves WebDAV settings
- **THEN** the system persists the selection
- **AND THEN** the next time the UI is opened the persisted selection is shown

### Requirement: Sync actions require at least one selected domain
The system MUST prevent WebDAV sync actions when the selection is empty (no domains selected).

Blocked actions MUST include:
- Manual WebDAV upload (backup)
- Manual WebDAV download+import (restore)
- Background “Sync now” action

#### Scenario: Upload is blocked when selection is empty
- **GIVEN** the user has unchecked all WebDAV sync data domains
- **WHEN** the user triggers the “Upload backup” action
- **THEN** the system does not upload any file to WebDAV
- **AND THEN** the UI displays an error indicating that at least one domain must be selected

### Requirement: WebDAV uploads update only selected domains and preserve unselected remote domains
When uploading a WebDAV backup, the system MUST update ONLY the selected domains.

Because WebDAV uploads replace the whole remote file, if an existing remote backup is present, any unselected domain that already exists remotely MUST be preserved in the uploaded payload rather than being deleted.

If no existing remote backup is present, unselected domains MAY be omitted from the uploaded payload.

#### Scenario: Preferences-only upload preserves remote accounts and bookmarks
- **GIVEN** the remote WebDAV backup already contains `accounts` data
- **AND GIVEN** the user has selected only “Preferences”
- **WHEN** the system uploads a WebDAV backup
- **THEN** the uploaded JSON payload keeps the existing remote `accounts` section unchanged
- **AND THEN** the uploaded JSON payload updates the `preferences` section from local data

#### Scenario: Accounts-only upload preserves remote bookmark ordering metadata
- **GIVEN** the remote WebDAV backup already contains `bookmarks`, `pinnedAccountIds`, and `orderedAccountIds`
- **AND GIVEN** the user has selected “Accounts” but unselected “Bookmarks”
- **WHEN** the system uploads a WebDAV backup
- **THEN** the uploaded JSON payload keeps the existing remote bookmark entries
- **AND THEN** bookmark-related ids in `pinnedAccountIds` and `orderedAccountIds` remain present

#### Scenario: Unselected domains may be omitted when remote backup does not exist
- **GIVEN** no remote WebDAV backup file exists yet
- **AND GIVEN** the user has unselected “API credential profiles”
- **WHEN** the system uploads a WebDAV backup
- **THEN** the uploaded JSON payload does not contain an `apiCredentialProfiles` section

### Requirement: WebDAV imports apply only selected domains
When downloading and importing from WebDAV, the system MUST apply changes ONLY for the selected domains.

Unselected domains MUST NOT be modified in local storage.

#### Scenario: Preferences unselected preserves local preferences
- **GIVEN** local preferences exist
- **AND GIVEN** the user has unselected “Preferences”
- **WHEN** the user performs WebDAV download+import
- **THEN** local preferences remain unchanged

#### Scenario: API credential profiles unselected preserves local credentials
- **GIVEN** local API credential profiles exist
- **AND GIVEN** the user has unselected “API credential profiles”
- **WHEN** the user performs WebDAV download+import
- **THEN** local API credential profiles remain unchanged

### Requirement: Accounts and bookmarks are independently synced
The system MUST treat “Accounts” and “Bookmarks” as separate sync domains.

When only one of these domains is selected:
- The selected domain MUST be imported/synced according to the chosen WebDAV strategy
- The unselected domain MUST remain unchanged locally

#### Scenario: Accounts-only import preserves local bookmarks
- **GIVEN** local bookmarks exist
- **AND GIVEN** the user selects “Accounts” but unselects “Bookmarks”
- **WHEN** the user performs WebDAV download+import
- **THEN** local bookmarks remain unchanged

#### Scenario: Bookmarks-only import preserves local accounts
- **GIVEN** local accounts exist
- **AND GIVEN** the user selects “Bookmarks” but unselects “Accounts”
- **WHEN** the user performs WebDAV download+import
- **THEN** local accounts remain unchanged

### Requirement: Auto-sync respects selection and does not wipe missing remote sections
During background WebDAV auto-sync, the system MUST apply the configured strategy (merge/upload-only/download-only) ONLY to selected domains.

If a selected domain is missing from the remote backup payload, the system MUST treat it as “not provided” and MUST NOT delete or clear the corresponding local data.

#### Scenario: Download-only does not wipe accounts when remote lacks accounts section
- **GIVEN** the user selects “Accounts”
- **AND GIVEN** the remote WebDAV backup payload does not contain an `accounts` section
- **WHEN** auto-sync runs with strategy `download_only`
- **THEN** local accounts remain unchanged
