# context-menu-entry-visibility Specification

## Purpose
TBD - created by archiving change per-site-context-menu-toggle. Update Purpose after archive.
## Requirements
### Requirement: Per-entry context menu visibility is configurable and persisted

The system MUST allow users to independently enable or disable each extension-owned browser context menu entry.

The system MUST persist each entry’s visibility setting in user preferences.

For backward compatibility, missing visibility settings MUST be treated as enabled.

The initial set of extension-owned entries covered by this capability MUST include at least:
- “AI API Check”
- “Redemption Assist”

#### Scenario: Legacy preferences default to showing entries
- **GIVEN** stored user preferences do not include any context menu visibility settings
- **WHEN** the background initializes the extension-owned context menu entries
- **THEN** the system creates the “AI API Check” and “Redemption Assist” context menu entries

#### Scenario: Disabled entry remains hidden after restart
- **GIVEN** the user has disabled the “AI API Check” context menu entry in settings
- **WHEN** the extension is restarted and the background initializes context menus
- **THEN** the system does not create the “AI API Check” context menu entry

### Requirement: Options UI exposes per-entry visibility toggles

The options UI MUST provide a toggle for each extension-owned context menu entry so users can control visibility per entry (not via a single global switch).

#### Scenario: User disables AI API Check context menu entry in options
- **WHEN** the user disables the “AI API Check” context menu entry toggle in the options UI
- **THEN** the system persists the disabled setting in user preferences

### Requirement: Visibility changes refresh context menus immediately

After a context menu visibility setting is changed successfully, the system MUST notify the background to refresh extension-owned context menu entries in the current session.

The refresh MUST take effect without requiring an extension reload.

#### Scenario: Disabling an entry removes it immediately
- **GIVEN** the “AI API Check” context menu entry is currently visible
- **WHEN** the user disables the “AI API Check” context menu entry toggle and the setting save succeeds
- **THEN** the background removes the “AI API Check” context menu entry in the current session

#### Scenario: Enabling an entry adds it immediately
- **GIVEN** the “AI API Check” context menu entry is currently hidden
- **WHEN** the user enables the “AI API Check” context menu entry toggle and the setting save succeeds
- **THEN** the background creates the “AI API Check” context menu entry in the current session

### Requirement: Refresh is idempotent and does not duplicate click handling

The background context menu refresh operation MUST be safe to invoke multiple times.

Repeated refreshes MUST NOT cause duplicate context-menu click handling (one user click MUST result in at most one forwarded trigger to the active tab).

#### Scenario: Multiple refreshes do not duplicate click triggers
- **GIVEN** the background context menu refresh operation is executed multiple times
- **WHEN** the user clicks the “AI API Check” context menu entry once
- **THEN** the system forwards exactly one “AI API Check” trigger to the active tab

### Requirement: Visibility toggles do not change underlying feature configuration

Changing a context menu visibility setting MUST NOT change other settings for the underlying feature beyond the visibility field itself.

#### Scenario: Disabling context menu entry preserves feature settings
- **GIVEN** the user has configured Web AI API Check auto-detect settings
- **WHEN** the user disables the “AI API Check” context menu entry toggle
- **THEN** the system preserves the previously configured Web AI API Check settings (other than the visibility field)

### Requirement: Context menus API unavailability is non-fatal

If the browser context menus API is unavailable, the system MUST treat context menu refresh as a no-op and MUST NOT crash.

#### Scenario: Missing contextMenus API does not throw
- **GIVEN** `browser.contextMenus` is unavailable in the current runtime
- **WHEN** the background attempts to initialize or refresh extension-owned context menu entries
- **THEN** the operation completes without throwing

