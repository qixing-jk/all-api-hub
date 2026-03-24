## 1. Recon And Reuse

- [x] 1.1 Inspect `src/utils/browser/tempWindowFetch.ts`, `src/entrypoints/background/tempWindowPool.ts`, `src/utils/browser/browserApi.ts`, and `src/services/apiService/common/utils.ts` to confirm the existing temp-context abstraction and choose the single extraction point for rollback-aware mode selection.
- [x] 1.2 Inspect `src/services/managedSites/providers/newApiSession.ts`, `src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts`, `src/features/ManagedSiteVerification/useNewApiManagedVerification.tsx`, `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx`, and `src/features/KeyManagement/KeyManagement.tsx` to confirm which user-visible flows need structured unsupported-window handling.

## 2. Shared Temp-Context Fallback

- [x] 2.1 Add a narrow helper in `src/utils/browser/browserApi.ts` or an adjacent browser helper module that classifies recoverable window-creation failures without duplicating browser-specific checks across features.
- [x] 2.2 Refactor `src/entrypoints/background/tempWindowPool.ts` so popup-window and composite-window acquisition share one fallback-aware creation path, retry once with a plain tab when rollback is allowed, and add brief clarifying comments around the non-obvious isolation constraint.
- [x] 2.3 Preserve structured failure reasons for incognito/private or other window-only temp-context requests that cannot safely degrade to a normal tab, while keeping existing cleanup and logging aligned with the final chosen mode.

## 3. Consumer Adoption And Messaging

- [x] 3.1 Ensure `src/services/apiService/common/utils.ts` and `src/services/managedSites/providers/newApiSession.ts` continue using the shared temp-context pipeline so New API hidden-key reads inherit the rollback behavior automatically.
- [x] 3.2 Update `src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts`, `src/features/ManagedSiteVerification/useNewApiManagedVerification.tsx`, and any affected managed-site UI call sites to surface localized guidance when rollback is impossible instead of raw browser window errors.
- [x] 3.3 Add or update only the necessary locale keys for unsupported-window guidance, keeping error copy secret-safe and scoped to the affected verification/temp-context flows.

## 4. Automated Coverage

- [x] 4.1 Extend background temp-context tests to cover popup-window rollback to a plain tab, composite-window rollback, and the structured failure path for incognito/private window-only requests.
- [x] 4.2 Extend managed-site verification tests to cover hidden channel-key retry behavior when popup-window creation is denied and the fallback-aware temp-context path must recover or report an unsupported-window condition.

## 5. Verification

- [x] 5.1 Run `pnpm lint`.
- [x] 5.2 Run `pnpm vitest related --run src/entrypoints/background/tempWindowPool.ts src/utils/browser/browserApi.ts src/services/apiService/common/utils.ts src/services/managedSites/providers/newApiSession.ts src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts src/features/ManagedSiteVerification/useNewApiManagedVerification.tsx`.
- [x] 5.3 Run `pnpm run validate:staged` for the affected changes, or document the blocker if the repo's staged-validation flow cannot be exercised locally.
