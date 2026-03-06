## Why

WebDAV selective sync needs a clear, flexible way for users to choose what data participates in sync, especially when moving between devices or avoiding overwriting sensitive data. A multi-select with sane defaults keeps current behavior while giving users control.

## What Changes

- Add a multi-select (checkboxes) in the WebDAV selective sync UI for choosing which data domains are included in sync:
  - Account
  - Bookmark
  - API credential
  - Preference
- Default all options to **checked** (preserves existing “sync everything” behavior for new and existing configs).
- Apply the selection consistently to both sync directions (upload/backup and download/restore), so only chosen domains are modified; when uploading over an existing WebDAV backup, preserve unselected remote domains instead of deleting them.
- Persist the selection alongside the WebDAV sync configuration so it is stable across sessions.

## Capabilities

### New Capabilities

- `webdav-selective-sync-data`

### Modified Capabilities

- (none)

## Impact

- UI: WebDAV selective sync settings screen (new multi-select control + i18n strings).
- Services: WebDAV sync pipeline must filter read/write by selected domains (accounts, bookmarks, api credentials, preferences) while preserving unselected remote domains during whole-file WebDAV uploads.
- Storage: schema update/migration so existing users default to “all checked”.
- Testing: add/adjust unit tests to verify selection defaults, filtering behavior for each domain, and whole-file upload preservation semantics for unselected remote domains.
