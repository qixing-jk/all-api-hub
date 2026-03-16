## 1. Recon And Config Reuse

- [x] 1.1 Inspect and confirm reuse points in `src/features/BasicSettings/components/tabs/ManagedSite/NewApiSettings.tsx`, `src/features/BasicSettings/components/tabs/ManagedSite/OctopusSettings.tsx`, `src/services/preferences/userPreferences.ts`, `src/contexts/UserPreferencesContext.tsx`, `src/services/managedSites/providers/newApi.ts`, `src/services/managedSites/tokenChannelStatus.ts`, and `src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx` before implementation.
- [x] 1.2 Extend `src/types/newApiConfig.ts`, default preferences, save/reset helpers, and preference-context update methods to persist optional `username`, `password`, and `totpSecret` fields without breaking existing `baseUrl`, `adminToken`, and `userId` behavior.
- [x] 1.3 Update the New API managed-site settings UI to reuse the existing masked credential-field pattern for the new login-assist fields and add the required helper text for optional automatic TOTP support.

## 2. New API Session And Verification Services

- [x] 2.1 Add a New API-only session helper under `src/services/managedSites/providers/**` that handles cookie-auth login, login-2FA completion, verification-method checks, secure verification, and hidden channel-key fetches through the shared API fetch layer.
- [x] 2.2 Add ephemeral per-base-url in-memory state for in-flight login/verification promise deduplication, verified-session expiry reuse, and cache invalidation when the backend session becomes invalid.
- [x] 2.3 Add the lightweight TOTP generation dependency/helper and use it for optional automatic login-2FA and secure-verification code generation.
- [x] 2.4 Add brief clarifying comments around the non-obvious two-step New API flow boundaries where login 2FA and secure verification are separate backend stages.

## 3. Managed-Site Matching Integration

- [x] 3.1 Extend `src/services/managedSites/providers/newApi.ts` to reuse existing base-url/model narrowing helpers and fetch hidden channel keys only for narrowed New API candidates that need exact comparison.
- [x] 3.2 Update `src/services/managedSites/tokenChannelStatus.ts` and any related managed-site resolution types so passive checks can surface recoverable `exact-verification-unavailable` metadata for `new-api` without auto-opening UI.
- [x] 3.3 Reuse the existing one-token refresh path in `src/features/KeyManagement/hooks/useKeyManagement.ts` so a successful verification-assisted retry reruns only the affected token status instead of forcing a full page refresh.

## 4. Recovery UI And Localization

- [x] 4.1 Add a reusable New API verification controller/dialog plus a shared hidden-key retry helper so settings, Key Management, and channel-edit flows all cover missing-credentials, logging-in, login-2FA, secure-verification, success, failure, and passkey-manual-guidance states.
- [x] 4.2 Add a New API settings action to prewarm or test the managed-site login/session flow using the new controller, and wire managed-site channel edit dialogs to reveal hidden keys through the same verification-assisted retry path.
- [x] 4.3 Update Key Management token status rendering to show New API verification-recovery guidance, gate the retry action on configured login-assist credentials, and retry the affected token after success.
- [x] 4.4 Update the affected locale files under `src/locales/**` for the new New API settings fields, verification dialog copy, recovery action labels, and exact-verification-unavailable guidance.

## 5. Tests And Validation

- [x] 5.1 Add or update settings-focused tests covering New API login-assist field rendering, masking, persistence, and reset behavior in `tests/entrypoints/options/BasicSettingsTabs.test.tsx` and `tests/entrypoints/options/ManagedSiteSelector.test.tsx`.
- [x] 5.2 Add service-level tests for the new New API session helper and hidden-key recovery path, including manual-code flow, automatic TOTP flow, verified-session reuse/expiry, and redacted failure handling.
- [x] 5.3 Update managed-site and Key Management tests for recoverable `exact-verification-unavailable` states, retry action gating, one-token refresh after successful verification, reusable verification-hook behavior, and managed-site channel real-key reveal in `tests/services/managedSites/tokenChannelStatus.test.ts`, `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`, `tests/entrypoints/options/pages/KeyManagement/TokenHeader.saveToApiProfiles.test.tsx`, `tests/entrypoints/options/pages/KeyManagement/KeyManagement.managedSiteStatusSupport.test.tsx`, `tests/features/ManagedSiteVerification/useNewApiManagedVerification.test.tsx`, and `tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx`.
- [x] 5.4 Run `pnpm lint`.
- [x] 5.5 Run `pnpm vitest --run tests/services/managedSites/tokenChannelStatus.test.ts tests/services/managedSites/providers/newApiSession.test.ts tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenHeader.saveToApiProfiles.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.managedSiteStatusSupport.test.tsx tests/features/ManagedSiteVerification/useNewApiManagedVerification.test.tsx tests/entrypoints/options/pages/ManagedSiteChannels/ManagedSiteChannels.test.tsx tests/entrypoints/options/BasicSettingsTabs.test.tsx tests/entrypoints/options/ManagedSiteSelector.test.tsx`, and document any blockers if validation cannot complete.
