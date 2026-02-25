## Context

Today the background entrypoint opens the docs changelog page immediately after every extension update:

- Implementation: `entrypoints/background/index.ts` `onInstalled` handler (`details.reason === "update"`).
- Behavior: when `(prefs.openChangelogOnUpdate ?? true)` it builds `getDocsChangelogUrl(getManifest().version)` and opens it via `createTab(..., true)`.

This ensures users see release notes, but it is disruptive because browser auto-updates can create an unexpected new active tab without any explicit user action. We want to keep changelog visibility while shifting the trigger to the first time the user opens the extension UI after the update.

Constraints:
- Must work for Chromium MV3 (service worker) and Firefox MV2 (background script) builds.
- Update-time code runs in the background; UI-open code runs in extension pages (popup/options/sidepanel) that can mount concurrently.
- Storage is `@plasmohq/storage`, and read-modify-write sequences should use `withExtensionStorageWriteLock()` when correctness depends on atomicity.

## Goals / Non-Goals

**Goals:**
- After an extension update, show/open the changelog only when the user first opens an extension UI surface (popup/options/sidepanel).
- Show the changelog at most once per updated version.
- Continue to respect `openChangelogOnUpdate` (default enabled).
- Keep changelog URL generation (including version anchors) unchanged.
- Make the behavior robust across multiple UI contexts opening at the same time.

**Non-Goals:**
- Change the changelog hosting, URL format, or anchor generation logic.
- Replace the changelog tab with a new in-extension changelog UI.
- Add additional policies (e.g., “only major versions”, “open in background”, “only once per day”).

## Decisions

1. **Persist a pending marker on update**
   - Decision: on update (`details.reason === "update"`), persist a “pending changelog version” value in storage.
   - Rationale: background can record the update even when no UI is open; UI entrypoints can later consume this marker.
   - Alternatives considered:
     - Open the tab in background with heuristics → rejected because it still creates tabs without user action.
     - Store “last seen version” only in-memory → rejected because it does not survive service worker restarts.

2. **Consume the pending marker on UI open (show once)**
   - Decision: on UI mount, attempt to atomically “claim” the pending marker, open the changelog tab, then clear the marker.
   - Rationale: ensures exactly-once behavior even if multiple UI surfaces open concurrently.
   - Implementation detail: wrap read+clear in `withExtensionStorageWriteLock()` using a dedicated lock name for changelog-on-update state.

3. **Preference evaluation time**
   - Decision: evaluate `openChangelogOnUpdate` at consumption time (UI open), not at update time.
   - Rationale: if a user disables the preference after updating but before opening the UI, we should not open the changelog; likewise enabling it should take effect immediately.
   - Behavior: if the preference is disabled, clear the pending marker without opening any tab.

4. **Trigger placement**
   - Decision: implement a small UI-open handler that runs early in extension UI entrypoints (popup/options/sidepanel) to perform the consumption logic.
   - Rationale: aligns the trigger with user-visible entrypoints and avoids duplicating logic across pages by reusing shared layout/provider boundaries where possible.

## Risks / Trade-offs

- **[User may never open the UI after updating]** → Mitigation: accept; this is the intended behavior shift (no background tab creation).
- **[Multiple UI contexts opening at once may race]** → Mitigation: use an exclusive storage write lock to ensure only one context consumes the pending marker.
- **[Update flows that already open UI automatically (e.g., optional-permission onboarding)]** → Mitigation: acceptable initially; if it becomes noisy, we can refine eligibility rules (e.g., skip when opened for onboarding and keep pending for a later “normal” open).

## Migration Plan

1. Add a dedicated storage key for the pending changelog version (and optionally a dedicated lock name).
2. On `runtime.onInstalled` with reason `update`, write the pending version.
3. Add a UI-open handler that attempts to consume the pending marker and opens `getDocsChangelogUrl(version)` in a new active tab when allowed by preferences.
4. Add tests to cover:
   - pending marker is written on update
   - pending marker is consumed once and cleared
   - preference disabled prevents opening and still clears pending
   - e2e: the first UI open after an update opens exactly one changelog tab (once per version) and consumes the pending marker

### E2E Validation (Playwright)

- Spec: `e2e/changelogOnUpdate.spec.ts`
- Run: `pnpm -s e2e -- e2e/changelogOnUpdate.spec.ts` (requires a built extension in `.output/chrome-mv3`)

Rollback:
- Leaving the pending marker key in storage is safe; older builds will ignore unknown keys.

## Open Questions

- Should “first open” include only popup/sidepanel, or also options pages opened manually? (This change proposes any UI surface, but we may want to exclude auto-opened onboarding flows.)
- Should we avoid opening a second tab if the changelog URL is already open in an existing tab? (Out of scope for now.)

