## 1. Recon and reuse

- [x] 1.1 Inspect and reuse the existing Model Management/navigation seams in `src/utils/navigation/index.ts`, `src/features/ModelList/modelManagementSources.ts`, `src/features/ModelList/ModelList.tsx`, `src/features/ModelList/hooks/useModelListData.ts`, and the API Credential Profiles controller/list-item flow before editing so the deep link extends current abstractions instead of duplicating them.
- [x] 1.2 Confirm the existing per-row icon/button pattern and locale namespaces used by API Credential Profiles and Model Management, then add only the minimal new localized copy needed for the profile deep-link action.

## 2. Routing and source selection

- [x] 2.1 Extend `openModelsPage` plus `tests/utils/navigation.test.ts` so Model Management URLs support no target, `accountId`, and `profileId` while keeping existing account deep links backward compatible.
- [x] 2.2 Update Model Management route initialization/source selection to resolve a valid `profileId` first, fall back to a valid `accountId`, and avoid keeping stale profile selections after profile storage finishes loading.
- [x] 2.3 Add brief clarifying comments where route precedence or async profile-loading behavior would otherwise be hard to infer from the code alone.

## 3. API Credential Profiles entry point

- [x] 3.1 Add a per-profile Model Management action through `useApiCredentialProfilesController`, `ApiCredentialProfilesList`, and `ApiCredentialProfileListItem`, reusing the existing controller-owned action wiring pattern.
- [x] 3.2 Wire the new action to the Model Management deep link using only the stored `profile.id`, keeping credentials out of the URL and out of any user-facing logging or toast paths.

## 4. Verification

- [x] 4.1 Extend the targeted tests in `tests/utils/navigation.test.ts`, `tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx`, and `tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx` to cover profile deep-link URLs, route precedence/fallback behavior, and the new per-profile action.
- [x] 4.2 Run `pnpm lint` and `pnpm -s vitest tests/utils/navigation.test.ts tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx`; if either command is blocked, document the blocker instead of broadening scope.
