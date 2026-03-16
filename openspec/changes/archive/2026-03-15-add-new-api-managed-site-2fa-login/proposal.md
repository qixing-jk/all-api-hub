## Why

Upstream `new-api` protects channel-key reads behind a login-bound secure-verification flow and only keeps a successful verification valid in the server session for a short window. All API Hub currently stores only API-style New API admin credentials, so exact managed-site matching can degrade to `unknown` whenever hidden channel keys require a browser-backed login session and 2FA that the extension cannot initiate or complete.

## What Changes

- Extend New API managed-site configuration to capture login account and password in addition to the existing admin API fields, so the extension can create an authenticated admin session when a managed-site workflow needs one.
- Add a reusable New API login and secure-verification workflow that can guide the user through manual 2FA completion from the extension, and reuse the same dialog/controller from settings session tests, Key Management recovery, and managed-site channel key reveal actions.
- Support optional automatic secure verification for New API through TOTP-oriented inputs only; passkey-based verification remains manual because it is not a practical automation target for this extension workflow.
- Reuse the upstream short-lived verified-session window so follow-up hidden-key reads and exact-match checks can proceed without prompting again until the backend verification window expires.
- Preserve secret-handling guarantees for login credentials, TOTP material, session-derived state, and retry/error messaging.

## Capabilities

### New Capabilities

- `new-api-managed-login-session`: The extension can store the New API login account/password needed for managed-site workflows and establish a reusable authenticated admin session when API-token-only access is insufficient.
- `new-api-managed-secure-verification`: The extension can complete New API secure verification through user-facing manual 2FA flow and optional TOTP-based automatic verification, then reuse the verified session window for follow-up managed-site operations.

### Modified Capabilities

- `key-management-managed-site-channel-status`: New API hidden-key verification states now expose a verification-assisted recovery path instead of only passive guidance that exact verification is unavailable.

## Impact

- Updates New API managed-site settings, preference types, storage, and context wiring under `src/features/BasicSettings/**`, `src/contexts/**`, `src/services/preferences/**`, and `src/types/**`.
- Adds New API login/session and secure-verification orchestration under `src/services/managedSites/**` plus reusable retry helpers under `src/features/ManagedSiteVerification/**` and any New API-specific admin API helpers needed to create sessions, probe verification state, and retry blocked operations.
- Affects Key Management, managed-site channel editing, and other managed-site exact-match surfaces that currently stop at hidden-key or verification-required states, plus their localized copy under `src/locales/**` and `src/components/dialogs/ChannelDialog/**`.
- Requires targeted tests for credential persistence, session reuse/expiry behavior, manual verification prompting, optional TOTP automation, and secret-safe failure reporting.
