## Why

AxonHub is now a managed-site backend with channel CRUD support, but users cannot use the existing create-only channel migration workflow with AxonHub as either the source or target. Supporting AxonHub migration removes a manual copy step while preserving the workflow's existing preview, warning, and per-channel result safeguards.

## What Changes

- Allow AxonHub to participate in managed-site channel migration when a complete AxonHub admin configuration is saved.
- Offer AxonHub as an eligible migration source and target alongside the existing configured managed-site backends, excluding the currently active source from the target list.
- Convert source channel data between AxonHub's GraphQL channel shape and the shared managed-site migration draft shape without requiring New API-only fields such as groups or priority.
- Preserve the existing create-only migration contract: migration creates new target channels, reports per-channel failures, does not mutate source channels, and does not sync or overwrite existing targets.
- Surface preview warnings when AxonHub migration remaps provider type, model, credential, status, or unsupported field semantics.
- Keep AxonHub-specific authentication, session refresh, and channel creation routed through the existing AxonHub admin GraphQL integration.
- Add focused coverage for AxonHub target eligibility, preview normalization, execution payloads, and UI gating.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `managed-sites-channel-migration`: Expand the create-only managed-site channel migration workflow so AxonHub can be an eligible configured source or target, with AxonHub-specific preview validation and field-mapping warnings.
- `axonhub-managed-site`: Replace the current migration exclusion for AxonHub with requirements for safe channel migration through the AxonHub managed-site service and admin GraphQL channel creation path.

## Impact

- `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx` and `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx`: migration entry-point gating, target selection, and AxonHub-aware UI copy or warnings.
- `src/services/managedSites/utils/managedSite.ts`: configured target enumeration must include AxonHub when credentials are complete and the source site type is different.
- `src/services/managedSites/channelMigration.ts`: AxonHub source/target normalization, preview warnings, and execution payload behavior.
- `src/services/managedSites/providers/axonHub.ts` and `src/services/apiService/axonHub/`: reuse or extend AxonHub channel creation and channel-shape conversion without exposing New API-only controls.
- `src/types/managedSite*`, `src/types/axonHub*`, and locale resources under `src/locales/`: any necessary type and user-facing copy updates.
- Tests under `tests/services`, `tests/utils`, and `tests/features` or component test areas covering the affected migration behavior.
