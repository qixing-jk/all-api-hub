## Context

The existing managed-site channel migration flow is a create-only workflow implemented around `prepareManagedSiteChannelMigrationPreview(...)` and `executeManagedSiteChannelMigration(...)` in `src/services/managedSites/channelMigration.ts`. It already handles target selection, per-channel preview status, warning codes, key hydration, and per-channel execution results through the shared `ManagedSiteService` contract.

AxonHub is already a managed-site type with channel list/search/create/update/delete support behind `src/services/managedSites/providers/axonHub.ts` and `src/services/apiService/axonHub/`. AxonHub differs from New API-family targets because channels use GraphQL IDs, string provider types, string statuses, credentials objects, model arrays, and admin GraphQL authentication instead of New API REST payloads.

Nearest existing reuse points:

- `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`: extend the current migration entry-point gating so AxonHub can open migration mode, while keeping Claude Code Hub disabled until it has an adapter.
- `src/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog.tsx`: reuse the current target picker, preview, confirmation, in-flight dismissal guard, and result report.
- `src/services/managedSites/utils/managedSite.ts`: extend `getManagedSiteTargetOptions(...)` to include configured AxonHub targets instead of creating a separate target source.
- `src/services/managedSites/channelMigration.ts`: extend the existing type mapping, draft building, warning collection, and source-key resolution logic.
- `src/services/managedSites/managedSiteService.ts`: keep execution routed through `getManagedSiteServiceForType(target).buildChannelPayload(...)` and `createChannel(...)`.
- `src/services/managedSites/providers/axonHub.ts`: reuse the AxonHub provider's `buildChannelPayload(...)` and `createChannel(...)` so final creation still uses admin GraphQL and AxonHub-specific validation.
- `src/types/managedSiteMigration.ts` and `src/locales/*/managedSiteChannels.json`: extend warning/blocking codes and localized copy only when the current code set cannot describe AxonHub-specific loss or remapping.

## Goals / Non-Goals

**Goals:**

- Allow AxonHub to be selected as a migration source when the active managed-site type is AxonHub.
- Allow AxonHub to be selected as a migration target when complete AxonHub admin credentials are configured and AxonHub is not the active source.
- Convert AxonHub source channel types to the shared migration type space for non-AxonHub targets.
- Convert shared source channel types to AxonHub provider types for AxonHub targets before calling the AxonHub provider.
- Keep the existing create-only migration behavior: no source mutation, no target dedupe/sync, no rollback, and per-channel result reporting.
- Block only rows that cannot provide usable key material or a valid target draft.
- Add focused tests for target eligibility, AxonHub source/target preview drafts, warning codes, and execution payloads.

**Non-Goals:**

- Syncing, updating, merging, or deduplicating existing target channels.
- Migrating AxonHub-only advanced settings that do not exist in the shared channel form contract.
- Adding model sync, model redirect, groups, or priority parity for AxonHub channel management.
- Supporting Claude Code Hub channel migration in this change.
- Adding a background or resumable batch job system for large migrations.

## Decisions

### 1. Reuse the existing create-only migration service

**Decision:** Extend `channelMigration.ts` rather than adding an AxonHub-specific migration service.

**Rationale:** The current service already owns preview construction, warning collection, key resolution, and execution ordering. AxonHub needs backend-specific mapping, not a different workflow contract.

**Alternative considered:** Add an `axonHubChannelMigration.ts` path. Rejected because it would duplicate preview/execution behavior and increase the chance that future migration safeguards diverge.

### 2. Treat target eligibility as configured managed-site capability

**Decision:** Include `AXON_HUB` in `getManagedSiteTargetOptions(...)` when `getManagedSiteAdminConfigForType(preferences, AXON_HUB)` returns a complete config and the caller has not excluded AxonHub as the active source.

**Rationale:** Target selection already depends on stored admin contexts. AxonHub has a complete managed-site config shape and service implementation, so it should participate through the same enumeration path.

**Alternative considered:** Add a special AxonHub target list in the migration dialog. Rejected because target eligibility would be split between UI and service utility code.

### 3. Enable AxonHub as a migration source through existing UI gating

**Decision:** Change `supportsChannelMigration` in `ManagedSiteChannels.tsx` so AxonHub is no longer disabled solely because it is AxonHub. Keep `supportsNewApiOnlyChannelActions` separate and still disabled for AxonHub.

**Rationale:** Migration and New API-only channel controls are separate capabilities. AxonHub can support create-only migration without exposing groups, priority, model sync, or model redirect controls.

**Alternative considered:** Expose only target migration to AxonHub while keeping AxonHub source disabled. Rejected because AxonHub channels already normalize into `ManagedSiteChannel` rows, and the migration service has enough context to map AxonHub source types into shared types.

### 4. Keep provider-specific type mapping in the migration boundary

**Decision:** Add an explicit shared-to-AxonHub target map beside the existing AxonHub-to-shared source map in `channelMigration.ts`.

Expected baseline mappings:

- `ChannelType.OpenAI`, `Azure`, `OpenAIMax`, and other OpenAI-compatible or unknown New API types -> `AXON_HUB_CHANNEL_TYPE.OPENAI`
- `ChannelType.Anthropic` -> `AXON_HUB_CHANNEL_TYPE.ANTHROPIC`
- `ChannelType.Gemini` and `VertexAi` -> `AXON_HUB_CHANNEL_TYPE.GEMINI`
- `ChannelType.DeepSeek` -> `AXON_HUB_CHANNEL_TYPE.DEEPSEEK`
- `ChannelType.OpenRouter` -> `AXON_HUB_CHANNEL_TYPE.OPENROUTER`
- `ChannelType.Xai` -> `AXON_HUB_CHANNEL_TYPE.XAI`
- `ChannelType.SiliconFlow` -> `AXON_HUB_CHANNEL_TYPE.SILICONFLOW`
- `ChannelType.VolcEngine` -> `AXON_HUB_CHANNEL_TYPE.VOLCENGINE`
- `ChannelType.Ollama` -> `AXON_HUB_CHANNEL_TYPE.OLLAMA`

Any unmapped numeric type should fall back to `openai` with a type-remapping warning rather than failing the whole migration.

**Rationale:** Migration draft data is the boundary where a source channel becomes a target channel form. Keeping type conversion here lets the AxonHub provider remain focused on validating and sending AxonHub create inputs.

**Alternative considered:** Let `axonHub.buildChannelPayload(...)` accept numeric New API types and map them internally. Rejected because provider payload building does not know the source backend and cannot emit preview warnings.

### 5. Preserve AxonHub key handling through existing source-key resolution

**Decision:** Use the normalized `ManagedSiteChannel.key` when AxonHub list data includes a usable key. If AxonHub returns hidden or masked credentials and no `fetchChannelSecretKey` implementation exists, block only that row with the existing source-key missing reason.

**Rationale:** The create-only migration must not create channels with masked credentials. The current key-resolution path already provides the right row-level blocker behavior.

**Alternative considered:** Add an AxonHub `fetchChannelSecretKey(...)` immediately. Deferred because AxonHub list normalization may already include usable `credentials.apiKeys[0]`, and detail/secret fetch support should be added only if upstream requires a separate query.

### 6. Reuse existing warning codes where they fit, add narrow AxonHub warnings only if needed

**Decision:** Continue using `TARGET_REMAPS_CHANNEL_TYPE`, `DROPS_MODEL_MAPPING`, `DROPS_STATUS_CODE_MAPPING`, `DROPS_ADVANCED_SETTINGS`, `DROPS_MULTI_KEY_STATE`, and `TARGET_SIMPLIFIES_STATUS` for AxonHub migrations. Add a new warning code only if implementation uncovers an AxonHub-specific loss that cannot be described by the current copy.

**Rationale:** The current warning model is intentionally backend-neutral. Reusing it keeps the dialog simple and avoids new translation churn for equivalent concepts.

**Alternative considered:** Add a full set of AxonHub-specific warning codes up front. Rejected because most expected losses already match existing warning semantics.

### 7. Execute through the target managed-site service contract

**Decision:** Leave `executeManagedSiteChannelMigration(...)` unchanged in shape: it builds a target payload from the ready draft through `targetService.buildChannelPayload(...)` and creates through `targetService.createChannel(...)`.

**Rationale:** This guarantees AxonHub target creation uses the existing admin GraphQL provider, session refresh, model validation, and enabled-status follow-up behavior.

**Alternative considered:** Call `createAxonHubChannel(...)` directly from migration execution. Rejected because it bypasses the managed-site abstraction and duplicates provider validation.

## Risks / Trade-offs

- [Risk] Numeric source types may map imperfectly to AxonHub string provider types -> Mitigation: keep the map explicit, warn on remapping, and fall back conservatively to `openai` for unsupported types.
- [Risk] AxonHub credentials may be masked or absent in list responses -> Mitigation: require a usable key before enabling a row, block only affected rows, and leave room for a later `fetchChannelSecretKey(...)` implementation if upstream supports it.
- [Risk] AxonHub advanced settings and model mappings may not round-trip through the shared migration draft -> Mitigation: preserve the create-only shared fields only and surface existing field-loss warnings in preview.
- [Risk] Target AxonHub create may reject empty model lists or invalid provider/base URL combinations -> Mitigation: use the AxonHub provider's existing payload validation and report failures per channel without aborting the whole run.
- [Risk] Enabling AxonHub as a source could accidentally expose New API-only actions -> Mitigation: keep `supportsChannelMigration` separate from `supportsNewApiOnlyChannelActions` and retain existing field/action hiding for AxonHub.
- [Risk] Large migrations still run in the foreground dialog -> Mitigation: preserve the current in-flight dismissal guard and per-row result reporting; background migration remains out of scope.

## Migration Plan

- Update docs/specs first to replace the old AxonHub migration exclusion.
- Implement target eligibility and UI gating changes behind the existing managed-site configuration checks.
- Extend preview mapping and warnings with focused unit tests before changing execution behavior.
- Reuse the existing execution path and add AxonHub target payload tests to verify GraphQL-compatible create inputs.
- Rollback is code-only for the extension. Remote channels created during a migration remain in the target AxonHub instance and are not automatically removed.

## Open Questions

- Does the current AxonHub channel list query always return usable `credentials.apiKeys` for admins, or is a separate detail/secret query needed for migrations from AxonHub?
- Should all unmapped New API channel types fall back to AxonHub `openai`, or should some be blocked until a more precise provider mapping is confirmed?
- Do we need an AxonHub-specific warning for dropped `settings.modelMappings`, or is the existing model-mapping warning sufficient after normalization?
