## 1. Preferences + Types

- [x] 1.1 Extend `ModelRedirectPreferences` with a prune flag (default `false`)
- [x] 1.2 Update `DEFAULT_MODEL_REDIRECT_PREFERENCES` to include the prune flag
- [x] 1.3 Ensure preferences merge behavior treats missing prune flag as disabled (no migration required)

## 2. Core Pruning Logic

- [x] 2.1 Add a helper to prune mappings with site-aware target validity rules (strict trim + exact match by default; DoneHub strips leading `+`; New API allows chain-resolvable targets and prunes cycles/unresolvable targets)
- [x] 2.2 Extend `ModelRedirectService.applyModelMappingToChannel` to optionally prune existing mapping before merge (including accepting an optional `siteType` hint)
- [x] 2.3 Ensure pruning is best-effort: invalid `model_mapping` JSON skips pruning (no deletion) but still applies new mappings
- [x] 2.4 Ensure pruning can trigger a persisted update even when `newMapping` is empty (if entries were removed)

## 3. Sync Pipeline Integration

- [x] 3.1 In `services/modelSync/scheduler.ts`, detect `modelsChanged` using `oldModels` vs `newModels` set equality
- [x] 3.2 When model redirect is enabled and prune flag is enabled and `modelsChanged`, call the updated apply method with `availableModels = newModels` and the current managed `siteType`
- [x] 3.3 Skip pruning when `newModels` is empty to reduce risk from transient upstream failures
- [x] 3.4 Add per-channel logs for pruning outcomes (removed count)

## 4. UI + i18n

- [x] 4.1 Add a switch in `ModelRedirectSettings` to toggle the prune flag with a destructive warning description
- [x] 4.2 Add i18n keys under `locales/*/modelRedirect.json` for the new setting label/description

## 5. Tests

- [x] 5.1 Add unit tests for prune behavior (missing target removed, existing target preserved, invalid JSON does not prune)
- [x] 5.2 Add unit test for “prune triggers update even when new mapping is empty”
- [x] 5.3 Add/adjust tests for scheduler integration to ensure pruning runs only when model list changes and flag is enabled
- [x] 5.4 Add unit tests for site-aware pruning (New API chained targets preserved; DoneHub `+target` preserved)

## 6. Verification

- [x] 6.1 Run `pnpm -s test` and ensure new tests pass
- [x] 6.2 Run `pnpm -s lint` for regression safety
- [ ] 6.3 Run `pnpm -s format:check` (currently fails due to pre-existing formatting issues in `tests/services/ldohSiteLookup.background.test.ts`)
- [x] 6.4 Run `pnpm -s compile` for regression safety
