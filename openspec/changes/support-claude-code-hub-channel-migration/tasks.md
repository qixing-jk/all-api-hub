## 1. Recon and Reuse

- [x] 1.1 Inspect `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`, `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx`, `src/services/managedSites/utils/managedSite.ts`, `src/services/managedSites/channelMigration.ts`, `src/services/managedSites/managedSiteService.ts`, and `src/services/managedSites/providers/claudeCodeHub.ts` before editing to confirm the current migration, target enumeration, service routing, and Claude Code Hub provider patterns.
- [x] 1.2 Inspect existing tests for managed-site target options, migration preview/execution, Claude Code Hub provider payload building, and ManagedSiteChannels migration gating to place new coverage beside the nearest relevant suites.
- [x] 1.3 Confirm whether Claude Code Hub provider normalization can expose usable unmasked `key` values from authenticated provider data; if not, implement only row-level blocked preview behavior for masked-key sources and document the limitation in code comments where the key-resolution rule is non-obvious.

## 2. Target Eligibility and UI Gating

- [x] 2.1 Update `getManagedSiteTargetOptions(...)` so configured Claude Code Hub appears as an eligible migration target and is excluded when passed in `excludeSiteTypes`.
- [x] 2.2 Keep incomplete Claude Code Hub configurations out of target options using the existing `getManagedSiteAdminConfigForType(...)` completeness behavior.
- [x] 2.3 Update `ManagedSiteChannels.tsx` so Claude Code Hub supports channel migration entry points when at least one other eligible target is configured.
- [x] 2.4 Keep unsupported Claude Code Hub managed-site actions separate from migration support so model sync, model redirect, base-URL lookup, full key reveal, and other unsupported controls remain hidden or disabled with local explanatory copy.

## 3. Migration Preview Mapping

- [x] 3.1 Add explicit Claude Code Hub provider-type to shared-channel-type mapping in `channelMigration.ts`, reusing `CLAUDE_CODE_HUB_PROVIDER_TYPE` and existing `ChannelType` constants.
- [x] 3.2 Add explicit shared-channel-type to Claude-Code-Hub-provider-type mapping for target drafts, defaulting unsupported types to `openai-compatible` with a type-remapping warning.
- [x] 3.3 Update target type resolution so Claude Code Hub targets receive Claude Code Hub string provider types instead of New API numeric channel types.
- [x] 3.4 Ensure Claude Code Hub target drafts use provider-safe form fields: name, mapped type, usable key, trimmed base URL, normalized models, group/default group, priority/default priority, weight/default weight, and enabled/disabled status.
- [x] 3.5 Ensure Claude Code Hub source providers convert to shared migration drafts for non-Claude-Code-Hub targets when usable source key material is available.
- [x] 3.6 Ensure preview blocks only affected Claude Code Hub source rows when provider key material is masked, missing, or cannot be resolved.
- [x] 3.7 Reuse existing warning codes for field loss, provider type remapping, defaulting, and status simplification; add narrow Claude Code Hub-specific warning codes only if existing copy cannot describe the preview behavior.
- [x] 3.8 Add brief clarifying comments around non-obvious Claude Code Hub provider type fallback behavior and masked-key migration constraints.

## 4. Migration Execution and Claude Code Hub Provider Compatibility

- [x] 4.1 Verify `executeManagedSiteChannelMigration(...)` can keep using `targetService.buildChannelPayload(...)` and `targetService.createChannel(...)` for Claude Code Hub without direct provider action calls from the migration service.
- [x] 4.2 Adjust `claudeCodeHub.buildChannelPayload(...)` only if needed so migrated drafts produce Claude Code Hub-compatible provider create data without accepting masked keys or unsupported payload semantics.
- [x] 4.3 Ensure Claude Code Hub target creation still uses existing provider validation for non-empty models, usable keys, provider type normalization, allowed model rules, group tag, priority, weight, and enabled status.
- [x] 4.4 Preserve per-channel failure handling so one Claude Code Hub create failure does not abort remaining ready migration rows.

## 5. Tests

- [x] 5.1 Add or update utility tests proving configured Claude Code Hub appears in migration target options, incomplete Claude Code Hub is excluded, and active-source Claude Code Hub is excluded from its own target list.
- [x] 5.2 Add migration preview tests for Claude Code Hub source to non-Claude-Code-Hub target mapping, including provider type remapping warnings and usable-key readiness.
- [x] 5.3 Add migration preview tests for non-Claude-Code-Hub source to Claude Code Hub target mapping, including Claude Code Hub string provider type output and remapping/default warnings.
- [x] 5.4 Add preview tests for Claude Code Hub source providers with masked or missing key material to ensure only affected rows are blocked.
- [x] 5.5 Add execution or provider tests proving Claude Code Hub target migration uses the managed-site service payload path and creates Claude Code Hub-compatible provider payloads.
- [x] 5.6 Add component coverage for Claude Code Hub migration entry-point visibility while unsupported Claude Code Hub managed-site actions remain hidden or disabled.
- [x] 5.7 Add regression coverage proving existing New API, Veloera, Done Hub, Octopus, and AxonHub migration target behavior remains unchanged.

## 6. Localization and Copy

- [x] 6.1 Reuse existing migration warning and blocker copy where it accurately describes Claude Code Hub field loss, remapping, missing key material, or create-only behavior.
- [x] 6.2 Add locale keys in all source locale files only if Claude Code Hub-specific warning or blocked-state copy is required.
- [x] 6.3 If translation keys or `t(...)` usages change, run the repo i18n extraction check and inspect the locale diff for unintended key removals.

## 7. Verification

- [x] 7.1 Run the smallest related Vitest command for touched migration, managed-site utility, Claude Code Hub provider, and component tests.
- [x] 7.2 Run `pnpm lint`.
- [x] 7.3 Run `pnpm run validate:staged` as the repo's pre-commit-equivalent validation flow after staging or otherwise preparing the task-scoped file set it validates.
- [x] 7.4 Run `pnpm compile` if changes touch shared service types, provider contracts, migration type definitions, or component props.
- [x] 7.5 Run `openspec validate 'support-claude-code-hub-channel-migration' --strict` after task updates and before implementation handoff.
- [x] 7.6 Document any validation command that cannot run, including whether the blocker is environment, sandbox, auth, network, or pre-existing unrelated failure.
