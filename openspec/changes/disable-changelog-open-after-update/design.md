## Context

Today the background entrypoint opens the docs changelog page after every extension update:

- Implementation: `entrypoints/background/index.ts` `onInstalled` handler (`details.reason === "update"`).
- URL: built via `getDocsChangelogUrl(getManifest().version)` and opened via `createTab(..., true)`.

This is useful for communicating changes but can be disruptive (unexpected new tab) and is not always desired (e.g., frequent updates, work profiles, kiosk/managed environments).

Constraints:
- Must work for Chromium MV3 (service worker) and Firefox MV2 (background script) builds.
- User-facing text must be i18n’d.
- Preferences are stored in `@plasmohq/storage` via `services/userPreferences.ts` and merged with defaults via `deepOverride`.

## Goals / Non-Goals

**Goals:**
- Add a user preference to enable/disable auto-opening the changelog tab on extension update.
- Default to the current behavior (enabled) to avoid surprising existing users.
- Ensure background update handling respects the preference across browsers.
- Provide a settings UI toggle (with i18n) so users can change the behavior without reloading the page.
- Add tests to cover both enabled and disabled behaviors.

**Non-Goals:**
- Change the changelog URL structure, anchor generation, or docs hosting.
- Remove or alter existing manual changelog access (e.g., version badges/links).
- Add more complex policies (e.g., “only for major releases”, “open in background instead of focusing”, per-profile rules).

## Decisions

1. **Preference shape and naming**
   - Decision: add a top-level boolean field in `UserPreferences`, e.g. `openChangelogOnUpdate: boolean`.
   - Rationale: update handling lives in the background entrypoint and already reads `UserPreferences`; a simple top-level field keeps access ergonomic and avoids introducing a new nested object shape just for a single toggle.
   - Alternatives considered:
     - Nested object such as `updates: { openChangelogOnUpdate: boolean }` → rejected for unnecessary schema churn and more UI plumbing.
     - A one-off storage key separate from `UserPreferences` → rejected to avoid splitting configuration across multiple stores.

2. **Defaults and migration**
   - Decision: default to `true` (enabled).
   - Rationale: preserves existing behavior for all users after upgrading.
   - Migration approach:
     - Rely on `userPreferences.getPreferences()` default merging (`deepOverride(DEFAULT_PREFERENCES, migratedPreferences)`).
     - Because `getPreferences()` saves back when the merged result differs from stored preferences, existing installs will automatically persist the new field on the next preferences read (already triggered on install/update).

3. **Background update behavior**
   - Decision: gate the existing `createTab(changelogUrl, true)` call behind the new preference.
   - Rationale: minimal behavioral change with clear user control; avoids unexpected new tabs when disabled.
   - Implementation detail: reuse the `userPreferences.getPreferences()` call already executed during install/update migration in `entrypoints/background/index.ts` to avoid redundant storage reads.

4. **Settings UI placement**
   - Decision: add the toggle to Options → Basic Settings (alongside other general behaviors such as action click behavior and logging).
   - Rationale: this is a global UX behavior, not tied to a specific feature module (accounts, WebDAV, auto check-in, etc.), and should be discoverable.
   - Alternatives considered:
     - Put the toggle on an “About” page only → rejected because users typically look for this kind of behavior under settings rather than version/about info.

5. **Testing strategy**
   - Decision: add a unit test around the background `onInstalled` update flow to validate:
     - When `openChangelogOnUpdate` is `true`, a tab is created for the expected changelog URL.
     - When `false`, no tab is created.
   - Rationale: this is the core behavior change and should be protected against regressions (especially as background initialization evolves for MV3/MV2 differences).

## Risks / Trade-offs

- **[Users may miss release notes]** → Mitigation: keep manual changelog access unchanged (e.g., version badge links); default remains enabled.
- **[MV3 service worker lifecycle differences]** (background may start/stop frequently) → Mitigation: change only `runtime.onInstalled` update path; that event triggers once per update rather than per startup.
- **[Preference read timing]** (preference not loaded yet) → Mitigation: update flow already calls `userPreferences.getPreferences()` during migration; use that resolved value to decide.

## Migration Plan

1. Add the new preference field to `UserPreferences` and set the default to `true` in `DEFAULT_PREFERENCES`.
2. Expose an update helper in `UserPreferencesContext` and add a settings UI toggle wired to persistence.
3. Update `entrypoints/background/index.ts` to check the preference before opening the changelog tab.
4. Add tests for background update behavior.

Rollback:
- If the change needs to be reverted, the preference field can remain in storage without harm; older builds will ignore unknown fields.

## Open Questions

- Should the toggle label explicitly mention “opens a new tab” vs “opens changelog” (UX wording / localization nuance)?
- Should the preference also apply to any future “What’s New” surfaces beyond the docs changelog (out of scope for this change, but impacts naming)?
