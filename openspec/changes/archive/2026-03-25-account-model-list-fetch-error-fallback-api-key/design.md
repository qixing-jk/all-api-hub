## Context

Model Management currently treats a selected account as a pricing-backed source. In `src/features/ModelList/hooks/useModelData.ts`, the single-account path calls `getApiService(siteType).fetchModelPricing(...)` and surfaces either a generic load failure or an invalid-format warning through `src/features/ModelList/components/StatusIndicator.tsx`.

That path has no recovery option besides retrying the same request. This is a problem for relay deployments where account-level pricing/model endpoints are unavailable or unstable, even though the same account still exposes usable tokens/keys.

Nearest existing reuse points:

- Reuse `src/services/accounts/utils/apiServiceRequest.ts`
  - `createDisplayAccountApiContext` already builds the account-scoped service/request pair used to list tokens.
  - `resolveDisplayAccountTokenForSecret` already resolves masked or indirect token records into a usable secret without mutating shared state.
- Reuse `src/services/apiCredentialProfiles/modelCatalog.ts`
  - `normalizeApiCredentialModelIds` and `buildApiCredentialProfilePricingResponse` already convert raw model ids into the minimal pricing response shape used by profile-backed Model Management.
- Extend `src/features/ModelList/hooks/useModelData.ts`
  - It is already the single place that decides whether Model Management is running in account, all-accounts, or profile mode.
- Extend `src/features/ModelList/components/StatusIndicator.tsx`
  - It already owns the account/profile load error UI and is the narrowest place to surface fallback key loading, selection, and retry states without changing the selected source.
- Extract from `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts` only if needed
  - The hook already demonstrates on-demand token loading and secret-safe error handling, but it is model-compatibility-specific and should not be reused wholesale for a catalog fallback flow.
- Do not reuse `src/services/managedSites/providers/newApi.ts` directly
  - Its `fetchAvailableModels` logic is informative because it already merges token-declared models with key-based upstream lookup, but it is managed-site-specific and should be generalized only through a narrower shared helper if needed.

## Goals / Non-Goals

**Goals:**

- Allow a single selected account in Model Management to recover from direct account model-load failures by letting the user choose one of that account's keys.
- Load a fallback model catalog with the selected key using the same minimal model-list shape already used for API credential profiles.
- Keep fallback behavior explicit, retryable, and secret-safe.
- Hide pricing/group/account-summary affordances when the rendered data comes from a key-backed fallback catalog rather than account pricing data.

**Non-Goals:**

- Persist the chosen account key as a new API credential profile.
- Change the `all accounts` aggregate flow to request or manage per-account fallback keys.
- Redesign the existing per-model key compatibility dialog or token-management feature set.
- Reconstruct relay pricing, group ratios, or account summary metadata from a key-backed fallback catalog.

## Decisions

### 1. Keep the selected source as an account and add transient fallback state

The selected source should remain `kind: "account"` in `modelManagementSources.ts`, while `useModelListData` / `useModelData` carry a transient "fallback key catalog active" state for the current account.

Rationale:

- The user is still operating on the same account selection, not switching to a persisted profile.
- This avoids changing selector serialization, deep-link behavior, row-source ownership, and verification history identifiers for a temporary recovery path.
- Capability flags can be overlaid at runtime so the UI behaves like a profile-backed catalog only for the missing pricing/group/account-summary surfaces.

Alternative considered:

- Add a new `account-key-fallback` source kind. Rejected because it would force wider routing, rendering, and action-ownership changes for behavior that is intentionally temporary and account-scoped.

### 2. Make fallback key loading on-demand, while keeping fallback catalog loading explicit

When a single-account load fails with a non-format error, `StatusIndicator` should begin loading that account's token inventory for the recovery UI instead of waiting for a separate "start fallback" click. This still counts as on-demand loading because token inventory is fetched only after the retryable failure path is reached, not during normal Model Management rendering.

If only one usable token exists, the UI may preselect it and keep the chooser visible. If multiple usable tokens exist, the user must choose one explicitly. In both cases, loading the fallback catalog itself should remain an explicit user action via the "load with selected key" step.

Rationale:

- The user explicitly asked to revert to allowing key selection.
- Starting key loading immediately removes an unnecessary preparatory click while still preserving explicit consent before any fallback catalog request is made.
- Silent auto-fallback would hide why the primary account request failed and could surprise users by switching data sources without consent.
- On-demand loading preserves the current performance boundary used by `ModelKeyDialog` because token inventory is still fetched only inside the failure-recovery path.

Alternative considered:

- Require a separate "select key to load models" CTA before loading fallback keys. Rejected because it adds an extra click without protecting any additional high-value state; the user still needs an explicit confirmation before the fallback catalog request.
- Automatically fall back to the first available key after any account error. Rejected because it obscures failure diagnosis and risks choosing a narrower-scoped key than the user intended.

### 3. Build the fallback catalog from token-declared models first, then key-based upstream lookup

The fallback loader should use a narrow shared helper that:

1. inspects the selected token's declared `models` list when available
2. resolves the token secret with `resolveDisplayAccountTokenForSecret`
3. fetches upstream-compatible model ids with the resolved key when the token metadata is incomplete
4. normalizes the merged ids through `normalizeApiCredentialModelIds`
5. returns `buildApiCredentialProfilePricingResponse(...)`

Rationale:

- Token metadata can provide a useful local fallback even when the upstream model-list endpoint is unavailable.
- The helper stays aligned with the user's request to use the account key like an API credential rather than retrying the same failing account-pricing route.
- Reusing the existing profile-backed pricing shim keeps the model rendering path small and consistent.

Alternatives considered:

- Retry `fetchModelPricing` or `fetchAccountAvailableModels` with the same account auth. Rejected because it does not satisfy the requested fallback behavior and mostly repeats the failing path.
- Reuse the managed-site `fetchAvailableModels` helper directly. Rejected because it lives in a managed-site provider module and carries broader assumptions than this feature needs.

### 4. Capability handling should degrade to catalog-only while fallback is active

While a fallback key-backed catalog is active for an account, Model Management should treat the rendered data like a profile-style catalog for UI capability purposes:

- hide pricing notes
- hide price and ratio toggles
- hide group filtering and account-summary affordances
- hide row-level synthetic price, ratio, and group-availability states that would otherwise be inferred from placeholder catalog values

The owning account identity should still be retained for account-specific follow-up actions that remain valid outside pricing metadata.

Rationale:

- A key-backed catalog does not provide authoritative relay pricing or group data.
- Reusing the existing profile-backed minimal response shape avoids inventing placeholder values that look authoritative.
- Row components should follow runtime capabilities rather than only `source.kind` so account-owned fallback rows can render like catalog-only entries while preserving account-owned actions.

Alternative considered:

- Keep all account-only controls visible and fill missing values with zero or empty placeholders. Rejected because it would misrepresent what the system actually knows.

### 5. Error handling must redact the selected key and keep both recovery paths available

Fallback load errors should use the same secret-safe summary style already used for profile-backed model loading, with the selected key and base URL treated as redactable secrets. The user should be able to:

- retry the original account-backed load
- retry the currently selected key-backed load
- choose a different key

Rationale:

- The new flow introduces another secret-bearing request path and must preserve the repo's current credential safety expectations.
- Users need a stable way back to the original account load, because fallback catalogs may be narrower than account-wide visibility.

Alternative considered:

- Replace the original error state entirely once fallback is attempted. Rejected because it removes context and traps the user in the fallback path.

## Risks / Trade-offs

- [A selected key may expose fewer models than the account-wide backend view] -> Label the result as key-backed fallback data and keep the original account retry path available.
- [Some sites may not support upstream-compatible model listing with a selected key] -> Use token-declared models when present, surface a retryable redacted error when network lookup fails, and do not remove the existing account retry action.
- [Token-loading logic could be duplicated between fallback UI and `ModelKeyDialog`] -> Extract only the shared account-token loading/selection helper if duplication becomes non-trivial; keep model-compatibility filtering in the existing dialog.
- [Transient fallback state can become stale when the user changes source or tokens] -> Reset fallback state whenever the selected source/account changes or when a fresh account-backed load succeeds.

## Migration Plan

- No storage or data migration is required.
- Rollout is additive and scoped to the single-account Model Management error path.
- Rollback is straightforward: remove the fallback CTA/state and leave the existing retry-only account behavior in place.

## Open Questions

- Verification actions can remain unchanged for the first implementation, but if fallback-mode verification should use the selected key instead of account auth, that should be specified in a follow-up change rather than folded into this recovery scope.
