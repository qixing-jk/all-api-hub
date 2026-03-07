# device-local-preferences Specification

## ADDED Requirements

### Requirement: Account data refresh preferences remain device-local during WebDAV sync
The system MUST treat account data refresh preferences as device-local for WebDAV-originated preference flows.

The local-only refresh preference set MUST include:

- `accountAutoRefresh.enabled`
- `accountAutoRefresh.interval`
- `accountAutoRefresh.minInterval`
- `accountAutoRefresh.refreshOnOpen`

When WebDAV upload, WebDAV download+import, or WebDAV background auto-sync handles preferences, those flows MUST preserve the current device's account data refresh preferences instead of synchronizing remote values into them.

#### Scenario: WebDAV upload omits local refresh preferences from the shared preference payload
- **GIVEN** the current device has account data refresh preferences configured
- **WHEN** the user uploads a backup to WebDAV or background WebDAV auto-sync uploads preferences
- **THEN** the remote WebDAV preference payload MUST NOT serialize the current device's account data refresh preferences as shared preference data

#### Scenario: WebDAV restore preserves local refresh preferences
- **GIVEN** the current device has account data refresh preferences configured
- **AND GIVEN** the remote WebDAV backup contains different account data refresh preference values
- **WHEN** the user performs WebDAV download+import with `Preferences` selected
- **THEN** the imported shared preferences are applied locally
- **AND THEN** the current device's account data refresh preferences remain unchanged

#### Scenario: Manual backup import can still restore refresh preferences explicitly
- **GIVEN** a manually imported backup file contains account data refresh preferences
- **WHEN** the user performs a file-based backup import
- **THEN** the system MUST restore the imported account data refresh preferences because the user explicitly requested a full backup restore

### Requirement: WebDAV shared preference merge recency ignores device-local preference edits
The system MUST determine WebDAV preference merge recency from shared-preference updates only.

Changes limited to device-local preference fields MUST NOT make one device's older shared preference snapshot win over a newer remote shared preference snapshot.

#### Scenario: Local refresh-only edit does not override newer remote shared preferences
- **GIVEN** the local device changes only account data refresh preferences after its last shared preference sync
- **AND GIVEN** the remote WebDAV backup contains a newer shared preference change from another device
- **WHEN** WebDAV auto-sync merges local and remote preferences with `Preferences` selected
- **THEN** the merge result applies the newer remote shared preference values
- **AND THEN** the local device keeps its own account data refresh preferences unchanged

#### Scenario: Newer local shared preference edit still wins merge arbitration
- **GIVEN** the local device changes a shared preference after the most recent remote shared preference update
- **AND GIVEN** the local and remote devices have different account data refresh preferences
- **WHEN** WebDAV auto-sync merges local and remote preferences with `Preferences` selected
- **THEN** the merge result keeps the newer local shared preference values
- **AND THEN** the local device's account data refresh preferences remain unchanged
