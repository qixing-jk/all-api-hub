## Context

The current Model Management page is implemented as an account-only surface:

- selector state is `selectedAccount`
- data loading is keyed by `DisplaySiteData`
- account-backed queries call `getApiService(siteType).fetchModelPricing(...)`
- aggregated mode (`all`) assumes account summaries and account-specific query states
- per-model actions assume account-scoped verification, CLI support checks, and token-compatibility dialogs

Stored API credential profiles already exist as a separate capability with persisted `apiType`, `baseUrl`, and `apiKey`. They already support direct model discovery and credential-driven flows such as verification and export, but they do not expose relay-style account data such as `/api/pricing`, group ratios, balances, or account token inventories.

That mismatch matters: this change is not just "add profiles to a dropdown". The page must distinguish between a pricing-capable account source and a credential-only model-catalog source so the UI does not fabricate pricing or token-management affordances that do not exist for profiles.

## Goals / Non-Goals

**Goals:**
- Allow Model Management to select a stored API credential profile as a first-class source alongside existing site accounts.
- Keep existing account and `all accounts` behavior backward-compatible.
- Reuse existing profile-side model-discovery and verification primitives instead of creating duplicate credential storage or duplicated pages.
- Make source capabilities explicit so profile-backed views remain usable without pretending they have account pricing, balances, or token inventories.
- Preserve current secret-handling rules for API keys in logs, toasts, and UI states.

**Non-Goals:**
- Add an `all profiles` or `all sources` aggregate mode in this change.
- Auto-create or mirror `SiteAccount` records for stored API credential profiles.
- Add account-token workflows (token inventory, token creation, model-key compatibility) to standalone API credential profiles.
- Invent relay pricing, group-ratio, or balance data for profile-backed sources when the upstream query does not provide it.

## Decisions

### 1. Introduce a source abstraction instead of overloading `DisplaySiteData`

Model Management should move from "selected account" to a narrow source abstraction with two concrete kinds:

- account source
- API credential profile source

This abstraction should own the selector identity, display label, and capability flags that downstream hooks/components need.

Rationale:
- `DisplaySiteData` represents stored site accounts and implies account-specific fields (`siteType`, `userId`, token/cookie auth, balances).
- API credential profiles have different auth semantics (`apiType`, direct `apiKey`) and different available actions.
- Hiding that distinction inside shims would spread conditionals throughout the page and make future source types harder to reason about.

Alternatives considered:
- Reuse existing "export shim" `DisplaySiteData` objects for profiles everywhere.
  Rejected because that pattern is acceptable for isolated integrations, but it hides missing pricing/token capabilities in a page that depends heavily on them.
- Create a separate profile-only model page.
  Rejected because the user request is to extend the existing model management interface, and a duplicate page would fragment controls, filtering, and future maintenance.

### 2. Keep account pricing loading unchanged; add a separate profile model-catalog loader

Account-backed sources should continue using the existing `fetchModelPricing` path and cached `PricingResponse` flow.

Profile-backed sources should use the existing direct model-list helpers that already back profile verification:

- OpenAI / OpenAI-compatible -> `fetchOpenAICompatibleModelIds`
- Anthropic -> `fetchAnthropicModelIds`
- Google/Gemini -> `fetchGoogleModelIds`

The result should be normalized into a model-management-specific view model with explicit capability metadata such as:

- `supportsPricing`
- `supportsGroupFiltering`
- `supportsAccountSummary`
- `supportsTokenCompatibility`
- `supportsCredentialVerification`
- `supportsCliVerification`

Profile-backed model loading should normalize and de-duplicate returned model ids into the minimal `PricingResponse` shape already consumed by Model Management. That compatibility shim should intentionally leave price- and account-specific fields empty or zeroed so the existing list pipeline can render model names without implying relay pricing or token metadata that does not exist.

Rationale:
- The profile capability already proves model discovery works without a `SiteAccount`.
- The page still needs one rendering pipeline, but it must know when pricing/group/token metadata is authoritative and when it is absent.

Alternatives considered:
- Synthesize a full `PricingResponse` with fake ratios/default groups for profiles.
  Rejected because it would present guessed pricing/group data as real model-management metadata.
- Restrict profile sources only to relay deployments that also expose `/api/pricing`.
  Rejected because stored API credential profiles are keyed by API family, not by relay `siteType`, and the user request is specifically about reusing the existing credential capability.

### 3. Make the UI capability-aware instead of forcing full account parity

When the selected source is an API credential profile:

- the selector and row badges should clearly identify the source as a profile-backed API credential
- the account summary bar and pricing note footer should not render
- pricing-format warnings that assume `/pricing` pages should not render
- group filters plus real-price/ratio toggles must be hidden when the backing source has no authoritative pricing/group metadata
- per-model rows should stay usable for source-compatible actions, but account-token actions and account-oriented detail expansion must not appear

Rationale:
- The current page is not just a list of model IDs; it includes pricing-specific controls and account-specific dialogs.
- Capability-aware rendering preserves a single page while avoiding misleading actions.

Alternatives considered:
- Keep the full UI visible and fill unsupported values with placeholders like `0` or `default`.
  Rejected because users would not be able to distinguish real pricing metadata from synthetic placeholders.

### 4. Route actions by row source type

Per-model actions should be resolved from each rendered row's concrete source type.

That means `all accounts` mode still renders account-backed rows, so those rows keep their per-account verification, CLI support, and token-compatibility actions even though the page-level source is aggregate.

- account source:
  - keep existing verify API flow
  - keep existing verify CLI flow
  - keep existing model-key compatibility flow
- profile source:
  - open the profile verification dialog with the stored profile and current `modelId`
  - open the CLI support dialog directly from the stored profile and current `modelId`
  - allow temporary verification `apiType` overrides inside the profile verification dialog without rewriting the stored profile
  - hide/disable token/key compatibility actions because profiles have no token inventory

Implementation can either adapt the existing dialogs to accept a common credential-source contract or keep account/profile dialogs separate behind a small adapter layer. The important design choice is that the page owns source-aware dispatch, not the row component.

Rationale:
- Existing dialogs are tightly coupled to account token loading.
- Profile verification already exists and should be reused rather than reimplemented from scratch.
- Profile-backed CLI checks should reuse the same dialog surface while skipping account-token loading entirely.

### 5. Keep selector state derived from live storage and preserve backward compatibility

Model Management should derive source options from current enabled accounts plus current API credential profiles on each render/load cycle, rather than persisting a duplicated source registry.

Behavioral rules:
- selector state is serialized as `all`, `account:<id>`, or `profile:<id>`
- existing `accountId` route params remain valid for account sources
- this change does not add a `profileId` route param
- if a selected profile is edited, the same profile id remains selected and labels update
- if a selected profile is deleted, the selection is cleared instead of pointing at stale data

Rationale:
- No storage migration is needed for this change.
- The selector should follow existing account/profile storage truth, not a third registry.

## Risks / Trade-offs

- [Reduced data fidelity for profiles] -> Use capability flags to hide unsupported pricing/group/account controls and label the source clearly as credential-backed.
- [More conditional UI paths] -> Centralize source normalization and capability checks in the model-management hooks instead of scattering `if profile/account` branches in every component.
- [Dialog duplication or adapter complexity] -> Keep the common boundary narrow: source-aware row actions decide which dialog/service path to open; dialog internals stay focused on one credential style.
- [Regression risk to existing account flows] -> Preserve the current account loader and `all accounts` aggregation path, and add targeted tests around both account-only and profile-backed states.
- [Credential leakage in new error paths] -> Reuse existing sanitization helpers and avoid logging raw `apiKey` values when profile-backed fetches or actions fail.

## Migration Plan

- No persisted data migration is required.
- Existing account route params and default account behavior remain unchanged.
- Implementation should land behind the selector expansion only; if follow-up regressions occur, profile options can be temporarily removed from the selector without altering stored profile data.

## Open Questions

- No additional open questions for the shipped scope. Profile deep-linking remains out of scope; only `accountId` route params are supported today.
