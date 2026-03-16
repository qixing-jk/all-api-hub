## Context

`new-api` managed-site support currently assumes admin-token access is sufficient for channel search, duplicate detection, and import-time exact matching. That assumption breaks when channel keys are hidden until the operator first establishes a cookie-backed login session and then completes secure verification for sensitive actions.

The nearest existing pieces are already close to what this change needs:

- `src/features/BasicSettings/components/tabs/ManagedSite/NewApiSettings.tsx`: extend the current New API settings UI rather than creating a second New API settings surface.
- `src/features/BasicSettings/components/tabs/ManagedSite/OctopusSettings.tsx`: reuse the existing username/password masked-input pattern for additional New API login credentials.
- `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx` and `src/components/dialogs/ChannelDialog/**`: extend the existing managed-site channel edit flow so New API can reveal hidden channel keys on demand instead of introducing a second channel editor just for verified key reads.
- `src/types/newApiConfig.ts`, `src/services/preferences/userPreferences.ts`, and `src/contexts/UserPreferencesContext.tsx`: extend the existing managed-site config storage and update/reset flow rather than inventing a parallel secret store.
- `src/services/managedSites/providers/newApi.ts`, `src/services/managedSites/channelMatchResolver.ts`, and `src/services/managedSites/tokenChannelStatus.ts`: reuse the current New API search + exact/weak-match pipeline and extend it with session-assisted exact-key recovery instead of replacing the matching stack.
- `src/features/KeyManagement/hooks/useKeyManagement.ts` and `src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx`: extend the existing status rendering and refresh loop so verification assistance appears where `exact-verification-unavailable` is already surfaced.
- `src/services/apiService/common/utils.ts`: reuse the shared cookie-auth fetch path (`AuthTypeEnum.Cookie` with `credentials: include`) for browser-session requests instead of building a new transport.
- `src/utils/browser/tempWindowFetch.ts` and the Turnstile/temp-window flow: treat this as a fallback pattern for browser-origin/manual flows, not the default transport for New API TOTP-based verification.

The important upstream constraint is that New API has two distinct authenticated steps:

1. `POST /api/user/login` may create a pending session and require `POST /api/user/login/2fa`.
2. Sensitive channel-key reads still require secure verification through `POST /api/verify`, which sets a short-lived `secure_verified_at` session window used by `POST /api/channel/{id}/key`.

That means this change must model both login-session establishment and secure-action verification separately.

## Goals / Non-Goals

**Goals:**

- Allow users to store the New API login identity required to establish an authenticated admin browser session for managed-site workflows.
- Support a reusable interactive flow that can complete New API login 2FA manually or automatically via TOTP when the user has opted into storing a TOTP secret.
- Support a reusable interactive flow that can complete New API secure verification manually or automatically via TOTP before reading hidden channel keys.
- Reuse the existing managed-site status and exact-match pipeline so Key Management and other exact-match callers benefit from the same session-assisted recovery path.
- Preserve backward compatibility for existing admin-token-based managed-site operations and keep all new secrets masked/redacted in UI, logs, and diagnostics.

**Non-Goals:**

- Replace `adminToken + userId` as the primary credential model for ordinary New API managed-site CRUD/search operations.
- Automate passkey/WebAuthn verification inside the extension.
- Force passive background status checks to open dialogs or require user interaction.
- Persist verified-session state outside the browser's own cookie/session handling or outside the current extension runtime context.

## Decisions

### 1. Extend `NewApiConfig` with session-assist credentials, but keep the existing admin fields authoritative for standard managed-site operations

`src/types/newApiConfig.ts` should be extended with flat optional fields for the login-assisted flow, tentatively:

- `username`
- `password`
- `totpSecret`

`baseUrl`, `adminToken`, and `userId` remain unchanged and continue to drive the generic managed-site service contract (`searchChannel`, `createChannel`, `updateChannel`, `deleteChannel`).

Rationale:

- This preserves backward compatibility for users who only need the existing admin-token workflow.
- Flat fields match the current repo style (`OctopusConfig` is also flat) and minimize migration churn across preferences, context, reset logic, and form bindings.
- Presence of `totpSecret` can act as the opt-in switch for automatic verification, avoiding an extra settings toggle unless later UX shows it is needed.

Alternative considered:

- Replace New API managed-site config with a nested session-auth object or make username/password required for all New API managed-site operations.
- Rejected because it introduces broader churn, complicates existing helpers that expect flat config access, and would create a breaking change for users whose current admin-token flows already work.

### 2. Add a New API-only session helper on top of the existing cookie-auth fetch layer instead of expanding the generic managed-site interface

Create a dedicated New API session/verification helper under the managed-site New API provider area, for example `src/services/managedSites/providers/newApiSession.ts`. It should internally reuse `fetchApi` / `fetchApiData` with `AuthTypeEnum.Cookie` and `credentials: include`, not raw ad hoc `fetch` calls.

This helper owns the New API-specific authenticated endpoints:

- `POST /api/user/login`
- `POST /api/user/login/2fa`
- `GET /api/user/2fa/status`
- `GET /api/user/passkey` (availability check only)
- `POST /api/verify`
- `POST /api/channel/{id}/key`

It should maintain only short-lived in-memory state per normalized base URL:

- in-flight promise deduplication for login/verification operations
- best-effort `verifiedUntil` timestamp from `/api/verify`
- a minimal marker indicating whether the current context recently established a logged-in session

It should not persist these runtime markers to extension storage; the browser cookie jar remains the source of truth for the actual server session.

Rationale:

- Only New API needs this two-stage login + secure-verification protocol, so pushing it into `ManagedSiteService` would pollute providers that do not share the model.
- The shared API fetch layer already knows how to issue cookie-auth requests and how to reuse temp-window fallback behavior when necessary, so transport should be reused rather than rebuilt.
- Localized promise caching avoids repeated login/verify races when the same token or multiple tokens trigger the same recovery flow.

Alternative considered:

- Add generic `ensureLoginSession` / `ensureSecureVerification` hooks to `ManagedSiteService`.
- Rejected because the generic provider surface is currently admin-token-centric and only New API would meaningfully implement these methods.

### 3. Keep exact matching provider-specific by extending `providers/newApi.ts` with hidden-key recovery rather than replacing the shared matcher

The shared matching stack should stay intact:

- `tokenChannelStatus.ts` still prepares comparable inputs.
- `channelMatchResolver.ts` still drives URL/key/model evidence.
- `findMatchingChannel(...)` remains the provider-specific exact-match hook.

For New API specifically, `findMatchingChannel(...)` should be extended to:

1. Search channels with the admin token as it does today.
2. Narrow candidates with the existing `findManagedSiteChannelsByBaseUrlAndModels(...)` / `findManagedSiteChannelByComparableInputs(...)` helpers.
3. If the list payload already contains comparable keys, keep the current fast path.
4. If keys are hidden and a comparable token key exists, attempt session-assisted key reads only for the narrowed candidate set by calling the new session helper's `fetchChannelKey(channelId)` path.

This keeps the shared matcher reusable while making exact New API key comparison more capable.

Rationale:

- The repo already uses provider-specific exact-match fallback in `doneHubService.findMatchingChannel(...)`, where search results may require an additional detail fetch.
- Extending the New API provider along the same seam avoids rewriting `resolveManagedSiteChannelMatch(...)` into New API-specific logic.
- Candidate narrowing before secure key reads limits backend load and keeps the number of session-gated requests small.

Alternative considered:

- Introduce a second wrapper above `resolveManagedSiteChannelMatch(...)` that performs New API key recovery outside the provider.
- Rejected because provider-specific hidden-key logic belongs beside other provider quirks, not in the cross-provider resolver.

### 4. Separate passive classification from interactive recovery

Passive background checks must remain conservative and silent:

- If a verified New API session already exists, background checks may use it and return a stronger exact answer.
- If no usable verified session exists and hidden-key recovery would require login or secure verification, background checks MUST not auto-open UI. They should continue returning `unknown`, but now with structured recovery metadata indicating that the result is user-recoverable.

Interactive recovery should be explicit and reusable:

- Add a New API verification controller/hook, for example `useNewApiManagedVerification`, that wraps a retryable action.
- Add a small helper, for example `loadNewApiChannelKeyWithVerification`, so hidden-key surfaces can first attempt the direct key read and only open the verification dialog when the backend still blocks that specific request.
- Add a reusable dialog component that can render a step-driven flow:
  - credentials missing
  - logging in
  - login 2FA required
  - secure verification required
  - success / retry failed
- Manual mode accepts a user-entered code for either the login-2FA step or the secure-verification step.
- Automatic mode uses the configured TOTP secret to generate the code and advance without extra input.

This dialog/controller should be reusable from:

- `NewApiSettings` as a prewarm/test-session action
- Key Management when a token status is `exact-verification-unavailable`
- `ManagedSiteChannels` / `ChannelDialog` when an operator asks to reveal the real hidden key for an existing New API channel
- any later managed-site exact-match surface that wants to retry after verification

Rationale:

- Passive status checks and bulk refreshes cannot become intrusive; they need to stay deterministic and background-safe.
- A single retry controller avoids scattering `try -> prompt -> retry` state machines across settings, Key Management, and future managed-site actions.
- A shared hidden-key retry helper keeps the "load key first, then prompt only if needed" behavior consistent between Key Management candidate-channel retries and managed-site channel editing.
- A prewarm action in settings gives users a direct place to confirm that the stored username/password/TOTP inputs are usable before they rely on them in Key Management.

Alternative considered:

- Open the verification dialog automatically whenever a background status check hits New API hidden-key recovery.
- Rejected because bulk token loads would become noisy and unpredictable, especially on first page render.

### 5. Keep the Key Management status taxonomy stable and add a recovery CTA instead of introducing a fourth status

`added`, `not-added`, and `unknown` remain the only user-visible status categories.

For New API, `unknown` with `exact-verification-unavailable` should be enriched with recovery metadata such as:

- whether login credentials are missing
- whether manual verification can be attempted immediately
- whether automatic TOTP is configured
- the search base URL / candidate channel context needed for the eventual retry

`TokenHeader` should continue rendering the existing badge/description pattern, but add a small action such as `Verify now` when the unknown state is recoverable. After successful interactive recovery, `useKeyManagement.refreshManagedSiteTokenStatusForToken(...)` should rerun the one-token check instead of forcing a full-page refresh.

Rationale:

- The current status model is already baked into specs, UI copy, and tests; introducing a new visible status would create unnecessary product churn.
- The real change is not a new classification, but an actionable recovery path for one existing `unknown` reason.

Alternative considered:

- Add a distinct `verification-required` status.
- Rejected because it complicates the existing status contract without improving the final user decision: the token is still not yet confidently `added` or `not added`.

### 6. Prefer a lightweight TOTP library over handwritten crypto

Automatic verification needs RFC 6238 TOTP generation from a stored secret. The implementation should prefer a small dedicated library rather than custom Web Crypto code.

Rationale:

- TOTP generation is security-sensitive and easy to get subtly wrong around Base32 decoding, time steps, and clock drift.
- A small dedicated library keeps the implementation shorter and easier to test than custom cryptographic plumbing.

Alternative considered:

- Implement TOTP generation in-house with Web Crypto.
- Rejected because the maintenance and correctness burden outweigh the benefit of avoiding one small dependency.

## Risks / Trade-offs

- [New stored username/password/TOTP secrets increase sensitivity of the preferences payload] -> Mask fields in UI, redact them from diagnostics, avoid emitting them in toasts/logs, and keep runtime verification state ephemeral.
- [New API may require two separate code submissions in one recovery flow: login 2FA and then secure verification] -> Make the dialog step-driven and explicit about which stage the user is completing instead of pretending there is only one generic code step.
- [Automatic TOTP can fail because of clock drift or mismatched secrets] -> Keep manual code entry as a first-class fallback and do not treat TOTP automation as mandatory.
- [Passive status checks could become slower if they start fetching hidden keys for many candidates] -> Only attempt session-assisted key reads when a verified session already exists and only for narrowed candidate channels under the matched base URL/models bucket.
- [Browser session cookies can expire or be changed outside the extension] -> Treat backend auth failures as runtime cache invalidation and rerun login/verification only through explicit interactive recovery.
- [Passkey-only deployments remain only partially supported] -> Keep passkey automation out of scope for this change and surface clear guidance that manual site-side verification is still required when TOTP is unavailable.

## Migration Plan

1. Extend `NewApiConfig`, default preferences, preferences context, and `NewApiSettings` with optional `username`, `password`, and `totpSecret` fields.
2. Add the New API session helper for cookie-auth login, login-2FA completion, secure verification, and channel-key retrieval.
3. Extend `providers/newApi.ts` so exact matching can fetch hidden channel keys for narrowed candidates through the session helper.
4. Extend `tokenChannelStatus.ts` and related Key Management state so recoverable New API unknown states carry retry metadata without auto-prompting.
5. Add the reusable verification controller/dialog plus the shared hidden-key retry helper, then wire them to `NewApiSettings`, the Key Management recovery action, and the managed-site channel edit dialog's "load real key" action.
6. Add targeted tests for:
   - preference persistence and masking
   - login-required vs secure-verification-required branches
   - automatic TOTP success/fallback-to-manual behavior
   - one-token status refresh after successful verification
   - managed-site channel real-key reveal after verification
   - reusable verification-hook state transitions
   - redacted failure handling

This rollout is additive. Existing New API admin-token workflows continue working without a storage migration. Rollback is code-only; newly added config fields can simply be ignored by older builds.

## Open Questions

- Passkey availability can be detected after login, but the initial implementation should treat passkey as manual-site-side guidance rather than a first-class in-extension flow. If user feedback shows that passkey-only deployments are common, a follow-up change can define the exact browser-tab handoff and resume UX.
