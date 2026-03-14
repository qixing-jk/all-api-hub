## Context

Profile-backed Model Management already exists in the repository, but the navigation path into that state is incomplete:

- `src/utils/navigation/index.ts` exposes `openModelsPage(accountId?)`, which only serializes `accountId` into the `options.html#models` URL.
- `src/entrypoints/options/hooks/useHashNavigation.ts` already parses both query-string params and hash params into `routeParams`, so the options router can carry more source-selection data without a router rewrite.
- `src/features/ModelList/modelManagementSources.ts` already defines `toProfileSourceValue(...)`, `toAccountSourceValue(...)`, and `resolveModelManagementSource(...)`, so the model page already has a canonical way to represent profile-backed sources.
- `src/features/ModelList/ModelList.tsx` currently applies route-driven source selection only for `routeParams.accountId`.
- `src/features/ApiCredentialProfiles/hooks/useApiCredentialProfilesController.ts`, `src/features/ApiCredentialProfiles/components/ApiCredentialProfilesList.tsx`, and `src/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem.tsx` already own per-profile actions and are the nearest surfaces to reuse for a new “open in Model Management” entry.
- Existing targeted tests already cover the closest seams:
  - `tests/utils/navigation.test.ts`
  - `tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx`
  - `tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx`

This change is cross-cutting but narrow: it connects an existing profile capability to an existing model-management capability through a stable deep link, while preserving the current account-based behavior.

## Goals / Non-Goals

**Goals:**
- Allow Model Management to open directly with a stored API credential profile selected via a deep link.
- Add a profile-page action that launches that deep link without requiring the user to manually reselect the profile inside Model Management.
- Keep existing `accountId` deep links working exactly as they do today.
- Reuse existing source-resolution helpers instead of inventing a second model-source encoding.
- Keep the deep link secret-safe by targeting stored profile identity, not serialized credentials.

**Non-Goals:**
- Rework the general options router or replace hash/search-param navigation across the app.
- Change profile-backed model loading, verification, or capability gating beyond what is required to honor the new route target.
- Add storage migrations or persist Model Management selection outside the existing page state.
- Introduce a new standalone Model Management page for profiles.

## Decisions

### 1. Extend the existing Model Management navigation helper instead of adding a parallel profile-only helper

The nearest reusable abstraction is `openModelsPage(...)` in `src/utils/navigation/index.ts`. This change should extend that helper to accept a structured target that can represent either an account or a profile, then emit the existing `options.html#models` URL with the appropriate query param.

Recommended shape:

- no target -> `options.html#models`
- account target -> `options.html?accountId=<id>#models`
- profile target -> `options.html?profileId=<id>#models`

Rationale:
- URL construction and popup-closing behavior already live in this helper.
- Reusing one helper keeps future tests and call sites centered on a single Model Management entry point.
- A separate `openProfileModelsPage(...)` helper would duplicate URL-building logic and create another place to keep route precedence rules in sync.

Alternatives considered:
- Add a new dedicated profile-only navigation helper.
  Rejected because the resulting URLs still target the same page and would duplicate logic that already belongs to `openModelsPage(...)`.

### 2. Use `profileId` as the new deep-link parameter and resolve route targets deterministically

The new canonical profile deep link should use `profileId=<id>`, mirroring the existing `accountId=<id>` contract instead of serializing `profile:<id>` directly into the URL.

Route resolution order should be:

1. valid `profileId`
2. valid `accountId`
3. no preselected source

If both params are present and the `profileId` resolves to a live stored profile, Model Management should select that profile and ignore `accountId`. If `profileId` is present but stale, the page should ignore it and still honor a valid `accountId` fallback when available.

Rationale:
- `profileId` keeps URLs readable and consistent with the existing account deep-link pattern.
- Deterministic precedence avoids ambiguous or flaky initialization when users manually edit URLs or multiple callers accidentally provide both params.
- Falling back to a valid account target preserves backward compatibility even when a stale profile link is encountered.

Alternatives considered:
- Introduce a new `source=profile:<id>|account:<id>` query param.
  Rejected because the page already has a stable public `accountId` contract and the new need is incremental, not a routing redesign.
- Fail closed when both params are present.
  Rejected because a deterministic fallback is more resilient and easier to test than leaving the page in an indeterminate state.

### 3. Move route-driven source selection into the Model Management data/state layer

The route-target logic should be handled alongside existing source resolution and stale-selection cleanup, not as another ad hoc branch in the page component.

The nearest reusable logic is:

- `useModelListData()` for source loading and stale-selection cleanup
- `modelManagementSources.ts` for canonical serialized values and source resolution

This change should extend the data-layer flow so it can:

- read `routeParams.accountId` and `routeParams.profileId`
- wait for profile storage to finish loading before deciding whether a `profileId` target is valid or stale
- convert the winning route target into `selectedSourceValue` via `toAccountSourceValue(...)` or `toProfileSourceValue(...)`
- avoid leaving a stale `profile:<id>` selection active after the backing profile disappears

Rationale:
- The hook already owns selection clearing when profile-backed sources become stale.
- Keeping route resolution there avoids splitting source initialization between `ModelList.tsx` and the hook that actually knows when profile data is still loading.
- This keeps `ModelList.tsx` closer to a rendering component rather than a second source-state controller.

Alternatives considered:
- Keep extending the `useEffect` in `ModelList.tsx`.
  Rejected because profile-loading and source-clearing rules already live in `useModelListData()`, and duplicating that reasoning in the component would make regressions more likely.

### 4. Add the new entry point through the existing API Credential Profiles controller/list-item flow

The profile page already routes per-row actions through:

- `useApiCredentialProfilesController.ts`
- `ApiCredentialProfilesList.tsx`
- `ApiCredentialProfileListItem.tsx`

This change should add a first-class handler and button in that flow for “open in Model Management”, reusing the existing controller/action pattern rather than creating a sidecar navigation component.

Rationale:
- The profile card already hosts nearby actions such as API verification and CLI verification, so this is the closest surface where users expect profile-specific follow-up operations.
- Controller-owned navigation keeps the list item presentational and consistent with the rest of the feature.
- The action can target the deep link using only the stored `profile.id`, which preserves secret safety.

Alternatives considered:
- Place the new action inside the export dropdown.
  Rejected because opening Model Management is navigation, not export, and it should remain directly discoverable.
- Add a separate page-level selector or modal for choosing a profile before opening Model Management.
  Rejected because the user already selected a specific profile row.

### 5. Reuse the existing targeted test seams instead of adding broad integration coverage first

The closest existing tests already line up with this change:

- `tests/utils/navigation.test.ts` should cover new `profileId` URL generation while preserving the existing `accountId` cases.
- `tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx` should cover route-target precedence, async profile-loading resolution, and stale-profile fallback behavior.
- `tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx` should cover the new per-profile action wiring.

Rationale:
- These tests already isolate the three places where regressions are most likely.
- A smaller scoped test set fits the repo guidance to validate the smallest affected surface first.

Alternatives considered:
- Add only end-to-end UI coverage.
  Rejected because the new behavior is mostly state wiring and URL construction, which is faster and more reliable to cover with existing unit/component tests first.

## Risks / Trade-offs

- [Conflicting route params] -> Use deterministic precedence (`profileId`, then `accountId`) so the page never has to guess.
- [Async profile loading can clear a valid deep link too early] -> Resolve route targets only after the profile store has either loaded the matching profile or definitively reported that it is absent.
- [API Credential Profiles action density increases] -> Reuse the existing compact per-row action pattern and keep the new action narrowly scoped to navigation.
- [Regression risk to legacy account deep links] -> Preserve the current `accountId` contract and keep the existing account navigation test cases alongside the new profile cases.
- [Secret leakage through URLs or logs] -> Deep links must carry only `profileId`; they must not serialize `apiKey` or other secret credential fields.

## Migration Plan

- No persisted-data migration is required.
- Existing `accountId` deep links remain supported without changes.
- New profile entry points should emit `profileId` URLs immediately once implemented.
- If the change needs rollback, the profile-page action can be removed and `profileId` can be ignored without affecting stored profiles or existing account deep links.

## Open Questions

- No open questions are required for the scoped change. The route contract, precedence order, and reuse points are all present in the existing codebase.
