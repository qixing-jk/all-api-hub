## 1. Recon And Shared Abstractions

- [ ] 1.1 Review and confirm the reuse points in `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`, `src/features/ManagedSiteChannels/components/RowActions.tsx`, `src/services/managedSites/managedSiteService.ts`, `src/services/managedSites/utils/managedSite.ts`, `src/services/managedSites/providers/{newApi,doneHubService,veloera,octopus}.ts`, and `src/features/BasicSettings/components/dialogs/ClearModelRedirectMappingsDialog.tsx` before adding migration code.
- [ ] 1.2 Extend managed-site config/context/service helpers so code can resolve admin config, UI metadata, and `ManagedSiteService` for an explicit target `ManagedSiteType` without mutating the active `managedSiteType`.
- [ ] 1.3 Add or adjust shared migration DTOs/helpers for eligible targets, preview items, warnings, and blocked reasons, and add brief clarifying comments where provider-specific constraints are not obvious.

## 2. Migration Service

- [ ] 2.1 Implement a managed-site migration orchestrator that converts selected source channels into target-specific migration drafts through shared `ChannelFormData` rather than duplicating provider payload builders.
- [ ] 2.2 Add preview-time source-key hydration for providers that can hide keys, reusing the existing New API verification flow and Done Hub detail loading, while marking only the affected rows as blocked when hydration cannot complete.
- [ ] 2.3 Execute create-only migration for ready channels by reusing provider `buildChannelPayload(...)` and `createChannel(...)` logic, skipping blocked rows, preserving per-channel results, and leaving source channels unchanged.

## 3. Managed-Site Channels UI

- [ ] 3.1 Add migration entry points to row actions and batch actions in the managed-site channels page, including disabled or hidden states when no eligible target managed site is configured.
- [ ] 3.2 Build the migration dialog flow for target selection, ready/blocked preview, create-only warnings, confirmation, in-flight protection against accidental dismissal, and final result reporting.
- [ ] 3.3 Ensure the bulk flow supports single-row migration, explicit multi-selection, and filtered “migrate all” behavior using the existing table state instead of a parallel selection model.

## 4. Localization And Test Coverage

- [ ] 4.1 Add localized copy for target eligibility guidance, create-only limitations, preview warnings, blocked-state reasons, progress, and result summaries in the managed-site channel migration UI.
- [ ] 4.2 Add or update focused service tests for explicit managed-site target resolution, preview draft generation, provider-specific mapping warnings, key-hydration blockers, and create-only result handling.
- [ ] 4.3 Add or extend options-page/component tests for migration entry points, target picker gating, preview behavior, execution summaries, and filtered “migrate all” behavior.

## 5. Verification

- [ ] 5.1 Run `pnpm lint` and fix any migration-related lint issues.
- [ ] 5.2 Run the smallest related automated test command for the touched migration behavior, preferring `pnpm exec vitest related --run` or the repo-equivalent focused Vitest command for the updated UI/service/test files, and document blockers if the command cannot run.
- [ ] 5.3 Run the repo’s staged-validation equivalent for the touched files (`pnpm run validate:staged` with the migration files prepared appropriately, or document why it cannot be executed outside a staged context) and capture any remaining blockers.
