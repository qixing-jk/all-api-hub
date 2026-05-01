## Why

Claude Code Hub is now supported as a managed site for provider management, but users still cannot use the existing managed-site channel migration workflow with it. Supporting Claude Code Hub migration removes a manual copy step while keeping the existing create-only, preview-first migration safety model.

## What Changes

- Allow Claude Code Hub to participate in managed-site channel migration as an eligible source and target when its admin configuration is complete.
- Convert supported Claude Code Hub provider fields into migration drafts that can be reviewed before execution.
- Convert supported non-Claude-Code-Hub source channel fields into Claude Code Hub provider create payloads.
- Keep the migration flow create-only: do not mutate source providers, sync existing targets, overwrite conflicts, or provide rollback.
- Add preview warnings or blockers for Claude Code Hub-specific field loss, provider type remapping, missing key material, unsupported provider options, and masked secrets.
- Replace the current Claude Code Hub managed-site limitation that hides migration with behavior that exposes migration only when the new adapter path can safely participate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `managed-sites-channel-migration`: Add Claude Code Hub as an eligible source and target managed-site type, including preview normalization, target draft creation, and execution through the managed-site service contract.
- `claude-code-hub-managed-site`: Change the unsupported-action requirement so Claude Code Hub no longer categorically hides channel migration once the migration adapter is implemented, while preserving restrictions for unsupported actions such as model sync, model redirect, and full key reveal.

## Impact

- Affected managed-site UI: `src/features/ManagedSiteChannels/` migration entry-point gating, target selection, preview warnings, and localized feedback.
- Affected migration service: `src/services/managedSites/channelMigration.ts` field normalization, type mapping, key resolution, blockers, warnings, and execution payload handling.
- Affected Claude Code Hub provider integration: `src/services/managedSites/providers/claudeCodeHub.ts` create payload behavior, source-channel normalization, secret-safe handling, and capability flags.
- Affected shared helpers and constants: managed-site target option resolution, supported managed-site type lists, channel/provider type mappings, and i18n resources.
- Tests should cover Claude Code Hub as both source and target, incomplete configuration exclusion, masked or missing key blockers, provider type remapping warnings, create-only execution, per-channel failure reporting, and unchanged behavior for existing migration-capable managed sites.
