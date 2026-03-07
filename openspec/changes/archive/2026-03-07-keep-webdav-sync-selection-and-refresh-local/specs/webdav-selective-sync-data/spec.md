# webdav-selective-sync-data Specification

## MODIFIED Requirements

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
