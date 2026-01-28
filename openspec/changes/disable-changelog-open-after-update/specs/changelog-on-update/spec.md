## ADDED Requirements

### Requirement: Automatic changelog opening on update is configurable
The extension MUST support a user preference `openChangelogOnUpdate` (default **enabled**) that controls whether the extension automatically opens the docs changelog page after an extension update.

#### Scenario: Default is enabled
- **GIVEN** a user has no stored `openChangelogOnUpdate` preference
- **WHEN** the extension loads user preferences
- **THEN** `openChangelogOnUpdate` MUST be treated as `true`

### Requirement: When enabled, updates open the version-anchored changelog page
When the extension is updated and `openChangelogOnUpdate = true`, the extension MUST open the docs changelog page in a new active tab.

When the extension version is available, the opened changelog URL MUST include an anchor that navigates to the corresponding version entry (e.g., `changelog.html#_2-39-0` for version `2.39.0`).

#### Scenario: Update opens version-anchored changelog
- **GIVEN** `openChangelogOnUpdate = true`
- **AND** the extension version is `2.39.0`
- **WHEN** the extension update lifecycle event fires (install reason `update`)
- **THEN** the extension MUST open a new active tab to the docs changelog URL anchored to `2.39.0`

#### Scenario: Missing version opens base changelog page
- **GIVEN** `openChangelogOnUpdate = true`
- **AND** the extension version is unavailable
- **WHEN** the extension update lifecycle event fires (install reason `update`)
- **THEN** the extension MUST open a new active tab to the docs changelog page without a version anchor

### Requirement: When disabled, updates do not open the changelog page
When the extension is updated and `openChangelogOnUpdate = false`, the extension MUST NOT open the docs changelog page automatically.

This preference MUST only control automatic changelog opening. It MUST NOT suppress other update-time flows (e.g., prompting for newly introduced optional permissions).

#### Scenario: Disabled preference suppresses changelog tab
- **GIVEN** `openChangelogOnUpdate = false`
- **WHEN** the extension update lifecycle event fires (install reason `update`)
- **THEN** the extension MUST NOT create any new tab for the docs changelog page

### Requirement: Users can change the preference and it persists
The extension MUST provide a user-facing control to enable or disable `openChangelogOnUpdate`. The chosen value MUST be persisted and applied on subsequent extension updates.

#### Scenario: Setting persists across reload
- **GIVEN** a user disables `openChangelogOnUpdate`
- **WHEN** the extension reloads user preferences at a later time
- **THEN** `openChangelogOnUpdate` MUST remain `false` until the user changes it
