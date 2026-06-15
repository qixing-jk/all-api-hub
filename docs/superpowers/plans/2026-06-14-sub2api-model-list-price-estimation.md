# Sub2API Model List Price Estimation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show key-scoped Sub2API runtime models from `/v1/models`, represent unavailable prices truthfully, and add guarded estimated prices only when dashboard group-rate and price-table inputs are available.

**Architecture:** Keep `ApiServiceCapabilities.modelPricing` false for Sub2API until Model List has separate runtime-model-list and price-precision semantics. Add row-level catalog metadata so model-only rows can render without treating unknown prices as zero, then route Sub2API selected-key runtime models through the existing account-token fallback path. Add JWT-backed estimation as a second slice by joining the resolved key group, Sub2API group rates, and a synthetic-test-covered LiteLLM-style price table; keep channel pricing out of the first implementation path.

**Tech Stack:** TypeScript, React, WXT, TanStack Query, Vitest, Testing Library, existing `~/services/apiService`, `~/services/apiCredentialProfiles`, and `~/features/ModelList` modules.

---

### Task 1: Add Model List Source And Price Precision Contracts

**Files:**
- Modify: `src/services/apiService/common/type.ts`
- Modify: `src/features/ModelList/modelManagementSources.ts`
- Test: `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`
- Test: `tests/features/ModelList/components/ModelItemPricing.test.tsx`

- [ ] **Step 1: Write failing tests for unavailable-price rows**

  Add tests proving that a row marked as model-list-only is displayed but is not treated as a free model. In `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`, create a `PricingResponse` with one row whose pricing precision is unavailable and assert that price sort leaves that row out of priced comparisons while keeping it in the result set. In `tests/features/ModelList/components/ModelItemPricing.test.tsx`, render the pricing component with unavailable metadata and assert that it shows a localized unavailable-price state, not `$0`, `¥0`, or a ratio-derived price.

  Run: `pnpm vitest run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/features/ModelList/components/ModelItemPricing.test.tsx`

  Expected: FAIL because the type metadata and UI branch do not exist yet.

- [ ] **Step 2: Extend shared pricing metadata types**

  In `src/services/apiService/common/type.ts`, add constants and exported types for model-list and row-level pricing semantics:

  - `MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY = "sub2api-runtime-key"`
  - `MODEL_PRICE_SOURCE_KINDS.NONE = "none"`
  - `MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE = "official-rate-estimate"`
  - `MODEL_PRICE_SOURCE_KINDS.CHANNEL_PRICING = "channel-pricing"` for future use only
  - `MODEL_PRICE_PRECISION_KINDS.EXACT = "exact"`
  - `MODEL_PRICE_PRECISION_KINDS.ESTIMATED = "estimated"`
  - `MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE = "unavailable"`
  - `MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY = "model-list-only"`
  - `MODEL_UNAVAILABLE_PRICE_REASONS.KEY_GROUP_UNKNOWN = "key-group-unknown"`
  - `MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING = "official-price-missing"`
  - `MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE = "pricing-source-unavailable"`

  Add an optional `price_metadata` field to `ModelPricing` with source, precision, unavailable reason, optional source date, and optional unmatched model count fields. Extend `ModelListSourceInfo` with optional booleans `supportsRuntimeModelList` and `supportsPricing`. Keep existing fields optional for backward compatibility.

- [ ] **Step 3: Extend Model List source capabilities without changing Sub2API service pricing**

  In `src/features/ModelList/modelManagementSources.ts`, keep existing source capability defaults intact, and add a derived capability or helper that can read `PricingResponse.model_list_source.supportsRuntimeModelList` and `supportsPricing` for display behavior. This must not require changing `src/services/apiService/index.ts` Sub2API `modelPricing: false`.

- [ ] **Step 4: Run contract tests**

  Run: `pnpm vitest run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/features/ModelList/components/ModelItemPricing.test.tsx`

  Expected: PASS for the new unavailable-price contract tests and existing tests in those files.

- [ ] **Step 5: Commit**

  Commit message: `feat(model-list): add price precision metadata`

  Commit files: `src/services/apiService/common/type.ts`, `src/features/ModelList/modelManagementSources.ts`, `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`, `tests/features/ModelList/components/ModelItemPricing.test.tsx`

### Task 2: Make Model List Treat Unknown Prices As Missing, Never Zero

**Files:**
- Modify: `src/services/models/utils/modelPricing.ts`
- Modify: `src/features/ModelList/hooks/useFilteredModels.ts`
- Modify: `src/features/ModelList/components/ModelItem/ModelItemPricing.tsx`
- Modify: `src/features/ModelList/components/ModelItem/ModelItemDetails.tsx`
- Modify: `src/features/ModelList/components/ModelItem/index.tsx`
- Modify: `src/locales/zh-CN/modelList.json`
- Modify: sibling locale files under `src/locales/**/modelList.json` only through the repo i18n extraction/check workflow
- Test: `tests/utils/modelPricing.test.ts`
- Test: `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`
- Test: `tests/features/ModelList/components/ModelItemPricing.test.tsx`
- Test: `tests/features/ModelList/components/ModelItemDetails.test.tsx`

- [ ] **Step 1: Write failing tests for price-missing calculations and rendering**

  Add tests that cover:

  - `calculateModelPrice` returns an explicit missing-price result when `model.price_metadata.precision` is `unavailable`.
  - billing-mode filters do not hide model-list-only rows merely because the current UI filter is token-based or per-call.
  - price sorting compares priced rows and leaves unavailable rows stable instead of treating them as zero.
  - row UI renders a local unavailable-price explanation and no numeric zero price.

  Use synthetic names such as `example-runtime-model` and `example-priced-model`; do not encode real provider prices in tests.

  Run: `pnpm vitest run tests/utils/modelPricing.test.ts tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/features/ModelList/components/ModelItemPricing.test.tsx tests/features/ModelList/components/ModelItemDetails.test.tsx`

  Expected: FAIL because the current utilities always produce numeric prices from ratio defaults.

- [ ] **Step 2: Add missing-price calculation semantics**

  In `src/services/models/utils/modelPricing.ts`, extend `CalculatedPrice` with a discriminant or optional metadata that tells consumers whether pricing is available. When `ModelPricing.price_metadata.precision === "unavailable"`, return a result that has no comparable numeric price. Do not represent unknown prices as `0`; zero remains a valid price only when a provider explicitly supplies zero.

- [ ] **Step 3: Update filtering and sorting**

  In `src/features/ModelList/hooks/useFilteredModels.ts`, update `getComparablePriceKey`, billing-mode filtering, lowest-price detection, and count helpers so unavailable-price rows remain visible for model discovery but do not participate in cheapest/most-expensive comparisons or lowest-price badges. Preserve current behavior for exact and estimated priced rows.

- [ ] **Step 4: Update row UI and details**

  In the Model Item components, render unavailable-price metadata as a concise local status. Use copy under the `modelList` namespace such as:

  - model-list-only: "Models are available for this key. Prices are unavailable."
  - key-group-unknown: "Prices are unavailable because this key's Sub2API group could not be resolved."
  - official-price-missing: "This model is not in the price table."
  - pricing-source-unavailable: "Price data is unavailable for this source."

  If UI copy is added, run the repo i18n extraction/check flow and keep sibling locale shapes consistent. Do not manually drift one locale into a different key shape.

- [ ] **Step 5: Run focused tests and i18n check**

  Run: `pnpm vitest run tests/utils/modelPricing.test.ts tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/features/ModelList/components/ModelItemPricing.test.tsx tests/features/ModelList/components/ModelItemDetails.test.tsx`

  Expected: PASS, including tests that prove unknown prices are not rendered or sorted as zero.

  Run: `pnpm run i18n:extract:ci`

  Expected: PASS with no unexpected locale shape updates. If extraction updates locale JSON for the new copy, inspect the diff and keep the generated sibling locale changes.

- [ ] **Step 6: Commit**

  Commit message: `feat(model-list): support unavailable model prices`

  Commit files: model pricing utility, Model List hook/components, locale JSON generated by i18n extraction, and the focused tests changed in this task.

### Task 3: Add Sub2API Runtime `/v1/models` Helper Without Pricing

**Files:**
- Modify: `src/services/apiService/sub2api/index.ts`
- Optionally create: `src/services/apiService/sub2api/runtimeModels.ts` if keeping the helper out of the large adapter file improves readability
- Test: `tests/services/apiService/sub2api/index.test.ts`
- Test: `tests/services/apiService/sub2api/keyManagement.test.ts`

- [ ] **Step 1: Write failing Sub2API runtime model tests**

  Add tests for a new exported helper, named during implementation as `fetchSub2ApiRuntimeModels` or a nearby repo-consistent equivalent, that:

  - calls `GET {baseUrl}/v1/models`
  - sends `Authorization: Bearer <api key>`
  - accepts OpenAI-style `data[].id` responses with numeric `created`
  - accepts Sub2API-style `data[].id`, `display_name`, and `created_at`
  - returns normalized model IDs
  - returns an empty array for a valid empty `data` list
  - rejects malformed payloads with a validation error
  - treats 401/403 as an API-key runtime auth failure

  Also keep the existing `fetchAccountAvailableModels` tests intact and add an assertion that this key-creation helper still returns `[]` for Sub2API forms where it currently does so.

  Run: `pnpm vitest run tests/services/apiService/sub2api/index.test.ts tests/services/apiService/sub2api/keyManagement.test.ts`

  Expected: FAIL because the runtime helper is not implemented/exported yet.

- [ ] **Step 2: Implement the runtime helper**

  Add the helper in `src/services/apiService/sub2api/index.ts` or `src/services/apiService/sub2api/runtimeModels.ts`. Use the existing Sub2API request/error/redaction style. Add a concise upstream contract comment near the request:

  `Source: https://github.com/Wei-Shaw/sub2api - gateway /v1/models uses runtime API-key auth and returns models visible to that key's group/platform.`

  Do not use dashboard JWT as the `/v1/models` credential. Do not call `/api/v1/channels/available`. Do not fall back to common `/api/pricing`.

- [ ] **Step 3: Run focused adapter tests**

  Run: `pnpm vitest run tests/services/apiService/sub2api/index.test.ts tests/services/apiService/sub2api/keyManagement.test.ts`

  Expected: PASS with existing key-management behavior preserved.

- [ ] **Step 4: Commit**

  Commit message: `feat(sub2api): fetch runtime key models`

  Commit files: Sub2API runtime helper file(s) and Sub2API adapter tests.

### Task 4: Route Sub2API Runtime Models Through Selected-Key Fallback

**Files:**
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Modify: `src/features/ModelList/hooks/useModelData.ts`
- Modify: `src/features/ModelList/modelManagementSources.ts` if source capabilities need response metadata
- Test: `tests/services/apiCredentialProfiles/modelCatalog.test.ts`
- Test: `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`

- [ ] **Step 1: Write failing fallback integration tests**

  In `tests/services/apiCredentialProfiles/modelCatalog.test.ts`, add a Sub2API selected-token test proving that `loadAccountTokenFallbackPricingResponse` resolves the real token secret with `resolveDisplayAccountTokenForSecret`, calls the Sub2API runtime model helper with that secret, and returns a `PricingResponse` whose rows have:

  - `model_list_source.kind = "sub2api-runtime-key"`
  - `model_list_source.supportsRuntimeModelList = true`
  - `model_list_source.supportsPricing = false`
  - row `price_metadata.source = "none"`
  - row `price_metadata.precision = "unavailable"`
  - row unavailable reason `model-list-only`

  In `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`, add a test proving Sub2API still has `capabilities.modelPricing = false`, the direct account query does not call `fetchModelPricing`, and the selected-key fallback can load runtime models without enabling common pricing.

  Run: `pnpm vitest run tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`

  Expected: FAIL because Sub2API still uses the generic OpenAI-compatible fallback builder and zero-priced rows.

- [ ] **Step 2: Build Sub2API model-only pricing response**

  In `src/services/apiCredentialProfiles/modelCatalog.ts`, add a Sub2API branch before the generic OpenAI-compatible fallback. Resolve the token secret, call the new Sub2API runtime helper, and build model-only `PricingResponse` rows with unavailable-price metadata. Reuse the existing fallback error sanitization and make sure base URL, token key, and resolved secret are redacted from thrown messages.

- [ ] **Step 3: Keep generic profile fallback behavior compatible**

  Update `buildApiCredentialProfilePricingResponse` only as much as needed to avoid using zero for unknown prices when the response is a model-only catalog. Existing profile-backed OpenAI-compatible catalogs can remain marked as model-list-only unless they have a real price source. Do not silently reinterpret unknown profile prices as exact zero.

- [ ] **Step 4: Update Model List fallback state if needed**

  In `src/features/ModelList/hooks/useModelData.ts`, ensure the fallback load state, cache behavior, success toast, and analytics still work with a `PricingResponse` whose `model_list_source.supportsPricing` is false. Keep direct account Sub2API loading gated by `service.capabilities.modelPricing === false`.

- [ ] **Step 5: Run focused fallback tests**

  Run: `pnpm vitest run tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`

  Expected: PASS. Assertions must prove Sub2API does not call common `fetchModelPricing` and unknown prices are unavailable, not zero.

- [ ] **Step 6: Commit**

  Commit message: `feat(model-list): load sub2api key runtime models`

  Commit files: `src/services/apiCredentialProfiles/modelCatalog.ts`, `src/features/ModelList/hooks/useModelData.ts` if changed, `src/features/ModelList/modelManagementSources.ts` if changed, and focused fallback tests.

### Task 5: Add Optional JWT Group Resolution And Estimated Prices

**Files:**
- Modify: `src/services/apiService/sub2api/index.ts`
- Modify: `src/services/apiService/sub2api/parsing.ts`
- Modify: `src/services/apiService/sub2api/type.ts`
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Create: `src/services/apiCredentialProfiles/sub2apiPriceEstimation.ts`
- Create: `src/services/apiCredentialProfiles/modelPriceTable.ts`
- Test: `tests/services/apiService/sub2api/keyManagement.test.ts`
- Test: `tests/services/apiCredentialProfiles/modelCatalog.test.ts`
- Test: `tests/services/apiCredentialProfiles/sub2apiPriceEstimation.test.ts`

- [ ] **Step 1: Write failing key-group resolution tests**

  Cover conservative group resolution in `tests/services/apiService/sub2api/keyManagement.test.ts` and `tests/services/apiCredentialProfiles/sub2apiPriceEstimation.test.ts`:

  - exact unmasked key match resolves the backend key's stable group id when present
  - stored stable group id is preferred if the implementation extends normalized token/storage shape to preserve it
  - stored group name resolves only when exactly one available group has that exact name
  - masked key values, no match, no stored group, or multiple same-name matches disable estimation
  - current normalized `ApiToken.group` is treated as a name-like value, not a stable `group_id`

  Run: `pnpm vitest run tests/services/apiService/sub2api/keyManagement.test.ts tests/services/apiCredentialProfiles/sub2apiPriceEstimation.test.ts`

  Expected: FAIL because group resolution and estimation helpers do not exist yet.

- [ ] **Step 2: Preserve stable group id only if supported by backend DTOs**

  Inspect current Sub2API key DTO parsing in `src/services/apiService/sub2api/parsing.ts` before editing. If backend key list/detail DTOs expose a stable `group_id`, extend local normalization and types to preserve it with a narrow optional field. If only a group name is available, keep the type name-like and let the estimator use exact-name matching only. Do not guess a group from first, cheapest, or default available group.

- [ ] **Step 3: Add dashboard-JWT group and rate helpers**

  Add or expose helpers that use existing Sub2API dashboard auth mechanisms to call:

  - `GET /api/v1/groups/available`
  - `GET /api/v1/groups/rates`
  - key list lookup through the existing `fetchAccountTokens` path when an exact key match is needed

  These calls must use dashboard JWT/refresh-token auth, never the runtime API key. Reuse existing Sub2API auth refresh/error handling. If dashboard auth is unavailable or invalid, return the runtime model list without prices.

- [ ] **Step 4: Add synthetic official price table loader**

  In `src/services/apiCredentialProfiles/modelPriceTable.ts`, add a loader for a LiteLLM-style price table shape with source metadata. The first implementation can use a bundled static snapshot if product policy allows it; tests must inject a tiny synthetic table with `example-priced-model`, `example-cache-model`, and `example-unpriced-model`. Do not store real provider prices in tests, fixtures, comments, or snapshots.

- [ ] **Step 5: Implement estimation formula**

  In `src/services/apiCredentialProfiles/sub2apiPriceEstimation.ts`, join runtime model IDs to the price table and apply:

  - `effectiveRate = userGroupRate[groupId] ?? group.rate_multiplier ?? 1`
  - `estimatedInput = officialInput * effectiveRate`
  - `estimatedOutput = officialOutput * effectiveRate`
  - `estimatedCacheRead = officialCacheRead * effectiveRate`
  - `estimatedCacheWrite = officialCacheWrite * effectiveRate`

  Convert to the repository's existing display units through `ModelPricing.token_price_usd_per_million` where possible. Mark priced rows with `price_metadata.source = "official-rate-estimate"` and `precision = "estimated"`. Keep unmatched models in the response with unavailable reason `official-price-missing`.

- [ ] **Step 6: Integrate optional estimation into selected-key fallback**

  In `src/services/apiCredentialProfiles/modelCatalog.ts`, after Sub2API `/v1/models` succeeds, attempt the JWT/group/rate/price-table path only when dashboard auth data is available for the same account. If any estimation prerequisite fails, keep the model-only response and set a non-secret unavailable reason. Do not fail the model list because price estimation failed.

- [ ] **Step 7: Run estimation tests**

  Run: `pnpm vitest run tests/services/apiService/sub2api/keyManagement.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/services/apiCredentialProfiles/sub2apiPriceEstimation.test.ts tests/utils/modelPricing.test.ts`

  Expected: PASS. Tests must prove user-specific group rate overrides default group rate, unknown group disables estimation, unmatched official prices stay visible as unavailable, and estimated rows are labeled estimated.

- [ ] **Step 8: Commit**

  Commit message: `feat(sub2api): estimate key model prices`

  Commit files: Sub2API parsing/type changes, `modelCatalog.ts`, new estimation and price-table modules, and focused tests.

### Task 6: Final UI, Telemetry, And Validation

**Files:**
- Modify: `src/services/productAnalytics/events.ts` only if new telemetry fields are needed
- Modify: `src/services/productAnalytics/modelListDiagnostics.ts` only if new telemetry fields are needed
- Modify: `src/features/ModelList/components/StatusIndicator.tsx` if source state needs a visible status
- Modify: `src/features/ModelList/sourceLabels.ts` if source labels need Sub2API runtime wording
- Test: `tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx`
- Test: `tests/services/productAnalytics/modelListDiagnostics.test.ts` if telemetry changes

- [ ] **Step 1: Decide telemetry scope**

  If implementation already touches Model List refresh analytics, add sanitized result/summary fields only:

  - source site type: `sub2api`
  - runtime model list status: success/error/empty
  - estimated pricing status: success/unavailable/error
  - key group resolution status: matched/stored/missing
  - counts: model count, priced model count, unpriced model count

  Do not record base URL, model IDs, API keys, JWTs, group names, group IDs, raw backend messages, or stack traces. If analytics is not already touched, document telemetry decision as `none` in the final handoff because the feature is primarily represented by existing Model List refresh analytics.

- [ ] **Step 2: Add final visible source state tests if UI changed**

  If status/source UI changes, add tests proving:

  - model-only Sub2API rows show a key runtime model-list source and prices unavailable
  - estimated rows show estimated price source text
  - mixed priced/unpriced rows render without overflow-prone long technical text

  Run: `pnpm vitest run tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx tests/features/ModelList/components/ModelItemPricing.test.tsx`

  Expected: PASS when source state UI is changed. Skip this command only if no status/source UI file changed.

- [ ] **Step 3: Run focused validation**

  Run: `pnpm vitest run tests/services/apiService/sub2api/index.test.ts tests/services/apiService/sub2api/keyManagement.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/services/apiCredentialProfiles/sub2apiPriceEstimation.test.ts tests/utils/modelPricing.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/features/ModelList/components/ModelItemPricing.test.tsx tests/features/ModelList/components/ModelItemDetails.test.tsx`

  Expected: PASS for all focused service, hook, utility, and component coverage.

- [ ] **Step 4: Run i18n check if copy changed**

  Run: `pnpm run i18n:extract:ci`

  Expected: PASS with no unexpected extraction diff. If it reports locale updates, inspect the diff, keep intended sibling locale changes, and rerun until clean.

- [ ] **Step 5: Run commit gate**

  Stage only task-scoped files for the current implementation slice.

  Run: `pnpm run validate:staged`

  Expected: PASS on staged task-scoped files.

- [ ] **Step 6: Run push gate only if required by changed surface**

  Run `pnpm run validate:push` if the implementation touches shared exports, dependency graph wiring, build configuration, or cross-module type contracts. This plan likely touches shared exported types, so expect to run it before pushing or opening a PR.

  Expected: PASS. If it fails, classify the failure as code, tooling, environment, auth, network, or permission before changing code.

- [ ] **Step 7: Commit final integration**

  Commit message: `feat(model-list): label sub2api price precision`

  Commit files: telemetry/status/source-label changes, locale changes generated by i18n extraction, and final UI tests changed in this task.

### E2E Decision

- [ ] **Step 1: Keep E2E out of the first implementation unless browser runtime behavior changes**

  No Playwright E2E is required for the first implementation because the main risk is adapter normalization, selected-key data flow, price-source metadata, and rendering semantics covered by Vitest and Testing Library. Add or update Playwright only if implementation changes cross-entrypoint browser-session recovery, extension storage migration, route/deep-link behavior, or a new interactive setup flow.

### Channel Pricing Future Work Boundary

- [ ] **Step 1: Preserve the channel-free first path**

  Do not use `/api/v1/channels/available` in this implementation. Document channel pricing only as a future enhancement after runtime model list and estimated group-rate pricing are stable. A future channel-pricing slice must map channel rows to the saved key's resolved group, platform, and model before setting `price_metadata.source = "channel-pricing"`.
