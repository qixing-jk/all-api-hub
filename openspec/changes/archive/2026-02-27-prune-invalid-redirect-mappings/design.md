# Design: Prune invalid redirect mapping targets during model sync

## Context

Managed-site model sync (`services/modelSync/scheduler.ts`) refreshes each channel’s `models` list and (when enabled) immediately applies model redirect mappings (`model_mapping`) via:

- `ModelRedirectService.generateModelMappingForChannel(...)` to build new mappings from the refreshed model list, and
- `ModelRedirectService.applyModelMappingToChannel(...)` to merge new mappings into the channel’s existing `model_mapping` and persist via `ModelSyncService.updateChannelModelMapping(...)`.

Today, the merge behavior preserves existing mapping entries for standard models that are not regenerated (or not overridden), even if their **target model** (mapping value) no longer exists in the refreshed channel model list. These stale targets can cause requests to fail until the user manually cleans up mappings.

This change adds an opt-in prune step in the sync + mapping pipeline to remove mapping entries whose target models are missing from the newly refreshed model list. The prune behavior is **site-aware** to match upstream semantics (notably: New API supports chained `model_mapping`, and DoneHub supports a leading `+` prefix on mapping values for billing-original-model behavior).

## Goals / Non-Goals

**Goals:**
- Add a persisted, opt-in preference (default: disabled) to control whether pruning occurs.
- When enabled and a channel sync produces a **changed** model list, prune `model_mapping` entries whose **target** (right-hand) model is not present in the refreshed model list, using site-aware semantics (see below).
- Pruning MUST be safe against invalid `model_mapping` JSON (best-effort; do not delete on parse failure).
- Keep behavior unchanged when the preference is disabled.
- Provide clear logging for pruning (per-channel removed-count) to support troubleshooting.

**Non-Goals:**
- Do not change the model redirect generation algorithm or guardrails (version safety remains enforced by existing logic).
- Do not modify Octopus sync behavior (Octopus path already does not apply model redirect).
- Do not attempt to “repair” missing targets by guessing replacements; the behavior is strictly delete-when-invalid/unresolvable.
- Do not require any UI workflow changes beyond exposing the preference (no confirmations during background runs).

## Decisions

### 1) Preference placement and default

- Add a boolean to `ModelRedirectPreferences` (in `types/managedSiteModelRedirect.ts`), e.g. `pruneMissingTargetsOnModelSync: boolean`.
- Default to `false` in `DEFAULT_MODEL_REDIRECT_PREFERENCES`.
- Persist under `UserPreferences.modelRedirect` (already managed by `UserPreferencesContext.updateModelRedirect` and the Basic Settings model redirect panel).

Rationale: the behavior is specifically about managing `model_mapping` correctness, so it belongs with model redirect settings and should remain opt-in because it is destructive.

### 2) When pruning runs

Pruning runs only when all conditions hold:

- model redirect is enabled (`prefs.modelRedirect.enabled`),
- the new preference is enabled (`prefs.modelRedirect.pruneMissingTargetsOnModelSync === true`),
- the channel sync succeeded, and
- the model list **changed** for that channel (`oldModels` vs `newModels` differ).

Rationale: the request explicitly scopes pruning to the “new model list obtained” case, and limiting to changed sets reduces unnecessary processing and avoids deleting based on “no new information”.

### 3) What “exists in the new model list” means

- Build a `Set` from the refreshed canonical model list used for mapping generation (`ExecutionItemResult.newModels`).
- A mapping entry is considered valid based on the selected **managed site type**:
  - **Default behavior (e.g. Veloera / other strict sites):** `availableModelsSet.has(targetModel.trim())` must be true (exact match after trim).
  - **DoneHub:** treat a single leading `+` in `targetModel` as metadata for billing; strip `+` before checking existence.
  - **New API:** if `targetModel.trim()` is not present, consider it valid when it can be resolved via the channel’s existing `model_mapping` chain (A→B→C) to an available model. Cycles and non-string links are treated as invalid (prunable).

Rationale: using the post-filter canonical list aligns pruning with the models that are actually persisted and used for redirect generation, while site-aware rules avoid deleting mappings that remain valid under upstream resolution semantics.

### 4) Implementation integration point

Integrate the prune step in `services/modelSync/scheduler.ts` in the per-channel success path (inside the `runBatch` `onProgress` callback) *before* persisting mapping updates.

Proposed flow for a synced channel:
1. Determine `modelsChanged` from `payload.lastResult.oldModels` / `payload.lastResult.newModels`.
2. If pruning is enabled and `modelsChanged`, parse the channel’s existing `model_mapping` JSON (best-effort).
3. Remove entries with missing target models.
4. Generate `newMapping` from `standardModels` and the refreshed model list.
5. Merge: `merged = prunedExisting + newMapping` (new keys override).
6. Persist the merged mapping using `ModelSyncService.updateChannelModelMapping(...)`.

To avoid duplication and to handle the “newMapping is empty but pruning removed entries” case, extend `ModelRedirectService.applyModelMappingToChannel(...)` to support optional pruning:

- Add an optional `options` parameter, e.g.:
  - `availableModels?: string[]`
  - `pruneMissingTargets?: boolean`
  - `siteType?: ManagedSiteType`
- When `pruneMissingTargets` is enabled and `availableModels` is provided, prune existing mapping before merge.
- Only call `service.updateChannelModelMapping(...)` when the merged mapping is meaningfully different (or when pruning removed entries), to minimize unnecessary writes.
- If existing mapping JSON is invalid, skip pruning and keep current behavior (only apply `newMapping` when non-empty).

Integration note: pass `siteType` from `getManagedSiteContext(prefs)` in the sync scheduler so pruning can apply the correct site semantics.

Rationale: keeps all model-mapping manipulation in one place, ensures pruning can occur even if the generated mapping is empty, and avoids cross-site behavior drift.

### 5) UI exposure

Expose the preference in `entrypoints/options/pages/BasicSettings/components/ModelRedirectSettings.tsx` as a switch with a destructive-warning description (e.g., “Deletes redirect entries whose target models disappeared after a model sync”).

Add i18n keys under the existing `modelRedirect` namespace.

## Risks / Trade-offs

- **[Risk] Transient/partial upstream model lists could trigger unintended pruning** → Mitigation: default disabled; only run on detected model-set changes; skip pruning when `newModels` is empty; log removed counts per channel.
- **[Risk] Invalid `model_mapping` JSON could cause accidental deletion** → Mitigation: on parse failure, do not prune; preserve existing behavior (only apply non-empty `newMapping`).
- **[Risk] New API chained mappings rely on existing intermediate aliases** → Mitigation: treat chain-resolvable targets as valid to avoid deleting working alias chains; treat cycles as invalid and prune.
- **[Trade-off] Pruning may remove user-maintained mappings** → Mitigation: opt-in preference with clear warning; removed only when the target model is provably absent from the refreshed model list.

## Migration Plan

- No data migration required.
- Missing preference value should be treated as `false` via defaults (`DEFAULT_MODEL_REDIRECT_PREFERENCES`).

## Open Questions

- Should “models changed” be computed purely as set equality (recommended) or by “fetch succeeded even if same list”? This design uses set equality to match the request.
- Should the prune option also apply to the manual “Regenerate mapping” action (`ModelRedirectService.applyModelRedirect`)? This design scopes it to the sync pipeline only.
