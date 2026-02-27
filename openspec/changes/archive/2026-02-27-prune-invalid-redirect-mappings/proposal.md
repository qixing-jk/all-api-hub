## Why

Managed-site model sync refreshes per-channel model lists, but existing model redirect mappings (`model_mapping`) can become stale when upstream models are removed or renamed. These stale redirect targets can cause requests to fail until users manually clean up mappings; an optional pruning step keeps mappings consistent with the latest model list.

## What Changes

- Add an opt-in configuration flag for the sync + model-redirect pipeline to prune redirect mapping entries whose **target** (right-hand) model is no longer valid for the refreshed model list.
- When enabled and a channel sync produces a **new** model list, remove any `model_mapping` entries whose target model is missing from that new model list (site-aware; see below) before applying newly generated mappings.
- When disabled, preserve current behavior (no automatic deletion of existing mappings).

### Site-aware pruning semantics

- **New API (`new-api`)**: preserve mappings whose targets can be resolved via chained `model_mapping` (A→B→C) to an available model; prune cycles and unresolvable targets.
- **DoneHub (`done-hub`)**: treat a leading `+` in mapping values as billing-original-model metadata; strip `+` when checking target existence (while preserving the stored value).
- **Other managed sites**: strict trim + exact-match existence check.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `model-redirect-mapping-guardrails`: When a channel’s model list is refreshed, optionally prune `model_mapping` entries whose targets are invalid under the refreshed model list, using site-aware semantics (configurable; disabled by default).

## Impact

- Services: managed-site model sync orchestration (`services/modelSync/scheduler.ts`) and model redirect mapping merge/apply (`services/modelRedirect/ModelRedirectService.ts`).
- Preferences/types: introduce a persisted config flag (default off) to control whether pruning occurs.
- UX/observability: surface pruning outcomes in logs and/or sync results so users understand when mappings were removed.
