## UPDATED Requirements

### Requirement: Changelog opens on first UI open after update
When the extension is updated, the background entrypoint MUST persist a pending changelog marker containing the updated version.

When a user opens an extension UI surface (popup/options/sidepanel), the UI MUST atomically consume and clear the pending marker. If `openChangelogOnUpdate` is enabled (default **enabled**), the UI MUST open the docs changelog page in a new active tab using the consumed version as the anchor.

The pending marker MUST be consumed at most once so the changelog is opened at most once per updated version, even if multiple UI contexts open concurrently.

#### Scenario: Update stores pending marker (no immediate tab)
- **GIVEN** the extension update lifecycle event fires (install reason `update`)
- **AND** the extension version is `2.39.0`
- **WHEN** the background update handler runs
- **THEN** the extension MUST persist a pending changelog marker for `2.39.0`
- **AND** the extension MUST NOT create any new tab for the docs changelog page at update time

#### Scenario: First UI open consumes and opens once
- **GIVEN** a pending changelog marker exists for version `2.39.0`
- **AND** `openChangelogOnUpdate = true`
- **WHEN** an extension UI surface mounts
- **THEN** the extension MUST open a new active tab to the docs changelog URL anchored to `2.39.0`
- **AND** the pending marker MUST be cleared
- **AND** subsequent UI opens MUST NOT open the changelog again for `2.39.0`

#### Scenario: Preference disabled clears without opening
- **GIVEN** a pending changelog marker exists for version `2.39.0`
- **AND** `openChangelogOnUpdate = false`
- **WHEN** an extension UI surface mounts
- **THEN** the extension MUST NOT open any changelog tab
- **AND** the pending marker MUST be cleared

## Verification

- Unit (background): `tests/entrypoints/background/changelogOnUpdate.test.ts`
- Unit (UI handler): `tests/components/ChangelogOnUpdateUiOpenHandler.test.tsx`
- E2E (Playwright): `e2e/changelogOnUpdate.spec.ts` (`pnpm -s e2e -- e2e/changelogOnUpdate.spec.ts`)

