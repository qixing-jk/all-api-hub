## 1. Recon and Reuse

- [x] 1.1 Inspect `src/services/managedSites/channelMigration.ts`, `src/services/managedSites/utils/managedSite.ts`, `src/services/managedSites/providers/axonHub.ts`, `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`, and `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx` before editing to confirm the current migration, target enumeration, AxonHub provider, and UI gating patterns.
- [x] 1.2 Inspect existing tests for managed-site target options, migration preview/execution, AxonHub provider payload building, and ManagedSiteChannels migration gating to place new coverage beside the nearest relevant suites.
- [x] 1.3 Confirm whether current AxonHub list normalization exposes usable `credentials.apiKeys` for migration; if not, document the blocker and add only the row-level blocked-state behavior unless an existing AxonHub detail/secret API can be reused safely.

## 2. Target Eligibility and UI Gating

- [x] 2.1 Update `getManagedSiteTargetOptions(...)` so configured AxonHub appears as an eligible migration target and is excluded when passed in `excludeSiteTypes`.
- [x] 2.2 Keep incomplete AxonHub configurations out of target options using the existing `getManagedSiteAdminConfigForType(...)` completeness behavior.
- [x] 2.3 Update `ManagedSiteChannels.tsx` so AxonHub supports channel migration entry points while Claude Code Hub remains disabled.
- [x] 2.4 Keep New API-only channel actions separate from migration support so AxonHub still hides unsupported groups, priority, model sync, model redirect, and related controls.

## 3. Migration Preview Mapping

- [x] 3.1 Add an explicit shared-channel-type to AxonHub-channel-type mapping in `channelMigration.ts`, reusing `AXON_HUB_CHANNEL_TYPE` and existing `ChannelType` constants.
- [x] 3.2 Update target type resolution so AxonHub targets receive AxonHub string channel types instead of New API numeric channel types.
- [x] 3.3 Preserve the existing AxonHub-source to shared-channel-type mapping for non-AxonHub targets and keep type-remapping warnings when source or target mapping is lossy.
- [x] 3.4 Ensure AxonHub target drafts use shared form fields that the AxonHub provider already understands: name, type, key, base URL, models, weight, and status.
- [x] 3.5 Ensure preview blocks only affected AxonHub source rows when usable source key material is missing or cannot be resolved.
- [x] 3.6 Add brief clarifying comments around non-obvious AxonHub type fallback behavior and key-resolution constraints.

## 4. Migration Execution and AxonHub Provider Compatibility

- [x] 4.1 Verify `executeManagedSiteChannelMigration(...)` can keep using `targetService.buildChannelPayload(...)` and `targetService.createChannel(...)` for AxonHub without direct GraphQL calls.
- [x] 4.2 Adjust `axonHub.buildChannelPayload(...)` only if needed so migrated drafts produce AxonHub-compatible create data without accepting New API-only payload semantics.
- [x] 4.3 Ensure AxonHub target creation still uses existing provider validation for non-empty models, credentials, default test model, and enabled-status follow-up behavior.
- [x] 4.4 Preserve per-channel failure handling so one AxonHub create failure does not abort remaining ready migration rows.

## 5. Tests

- [x] 5.1 Add or update utility tests proving configured AxonHub appears in migration target options, incomplete AxonHub is excluded, and active-source AxonHub is excluded from its own target list.
- [x] 5.2 Add migration preview tests for AxonHub source to non-AxonHub target mapping, including provider type remapping warnings.
- [x] 5.3 Add migration preview tests for non-AxonHub source to AxonHub target mapping, including AxonHub string provider type output and remapping/default warnings.
- [x] 5.4 Add preview tests for AxonHub source channels with missing or masked key material to ensure only affected rows are blocked.
- [x] 5.5 Add execution or provider tests proving AxonHub target migration uses the managed-site service payload path and creates AxonHub-compatible credentials, models, default test model, and status behavior.
- [x] 5.6 Add component coverage for AxonHub migration entry-point visibility while New API-only AxonHub actions remain hidden or disabled.

## 6. Localization and Copy

- [x] 6.1 Reuse existing migration warning copy where it accurately describes AxonHub field loss or remapping.
- [x] 6.2 Add locale keys in all source locale files only if AxonHub-specific warning or blocked-state copy is required.
- [x] 6.3 If translation keys or `t(...)` usages change, run the repo i18n extraction check and inspect the locale diff for unintended key removals.

## 7. Verification

- [x] 7.1 Run the smallest related Vitest command for touched migration, managed-site utility, AxonHub provider, and component tests.
- [x] 7.2 Run `pnpm lint`.
- [x] 7.3 Run `pnpm run validate:staged` as the repo's pre-commit-equivalent validation flow after staging or otherwise preparing the task-scoped file set it validates.
- [x] 7.4 Run `pnpm compile` if changes touch shared service types, provider contracts, or migration type definitions.
- [x] 7.5 Document any validation command that cannot run, including whether the blocker is environment, sandbox, auth, network, or pre-existing unrelated failure.
