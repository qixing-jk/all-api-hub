# New API rc.22 Auto-Detect Compatibility Design

Date: 2026-07-27

## Purpose

Restore account auto-detection for upstream New API `v1.0.0-rc.22` while
preserving legacy New API and New API-family behavior.

The compatibility boundary is intentionally narrow: adapt the browser-login
session used during account onboarding, then reuse the existing
`getOrCreateAccessToken` completion contract. Existing saved PAT accounts and
ordinary account runtime requests remain unchanged.

## Upstream Contract Change

New API rc.22 replaced the legacy dashboard session contract:

- the browser no longer persists `localStorage.user`
- the legacy Gin session cookie no longer authenticates `/api/user/self`
- dashboard endpoints require a 15-minute Bearer access token
- the refresh token is an HttpOnly cookie and rotates through
  `POST /api/user/auth/refresh`
- login and refresh return an AuthBundle containing the short-lived Bearer,
  safe user DTO, and login-session metadata
- the safe user DTO intentionally excludes the management PAT
- `GET /api/user/token` generates and stores a new management PAT
- existing PAT authentication remains supported

Source:

- <https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/docs/authentication.md>
- <https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/controller/user.go>

The failed real-site E2E run exposed both obsolete assumptions. Its helper did
not recognize `data.user`, then retried through UI login and waited for
`localStorage.user`. Repeated attempts accumulated login sessions until the
upstream returned `AUTH_SESSION_LIMIT`.

## Goals

- Detect an authenticated rc.22 New API user from a same-origin page.
- Keep the rc.22 dashboard Bearer in memory only.
- Reuse the existing New API `getOrCreateAccessToken` behavior:
  - reuse a PAT when the upstream exposes one
  - otherwise generate a PAT through `/api/user/token`
- Save only the resulting long-lived PAT as the account access token.
- Normalize rc.22 auto-detected accounts to AccessToken authentication because
  the new dashboard session cookie is not an account API credential.
- Preserve legacy `localStorage.user`, cookie-auth, and PAT behavior.
- Preserve other New API-family site types unless their upstream contract is
  separately verified.
- Make real-site E2E login recognize AuthBundle responses and clean up sessions
  created by the test.

## Non-Goals

- Do not migrate or rewrite existing saved accounts.
- Do not change runtime requests for existing PAT accounts.
- Do not remove legacy cookie support globally.
- Do not apply the rc.22 refresh protocol to Veloera, AnyRouter, WONG, or other
  New API-family compatibility buckets.
- Do not persist or refresh the rc.22 dashboard Bearer after onboarding.
- Do not add a PAT-generation confirmation. Auto-detect already owns the
  get-or-create PAT contract; rc.22 preserves that product behavior even
  though hiding the existing PAT means the generation branch can replace it.
- Do not redesign generic API transport authentication.

## Approaches Considered

### A. Persist The Dashboard Bearer

This would make the smallest immediate change, but the token expires after 15
minutes and upstream explicitly requires it to stay in browser memory. It
would create accounts that fail shortly after onboarding and is rejected.

### B. Detect Identity And Require Manual PAT Entry

This avoids PAT replacement, but changes the established auto-detect contract
from get-or-create to a partial form fill. It also leaves the real-site account
save flow unable to complete without an additional credential. This is not the
chosen product behavior.

### C. Use Transient Dashboard Auth Then Reuse Get-Or-Create PAT

This is the selected approach. It adapts only the changed browser-session
boundary, structurally separates the short-lived Bearer from persisted account
credentials, and reuses the existing completion capability.

## Design

### 1. Add An Exact New API AuthBundle Extractor

Add a content-session extractor dedicated to `SITE_TYPES.NEW_API`.

It constructs the refresh URL from `location.origin`, not from an arbitrary
runtime-message URL, and calls:

```http
POST /api/user/auth/refresh
credentials: include
```

Cold-start refresh omits `X-Auth-Session`, as allowed by the upstream contract.
The extractor strictly validates:

- `success !== false`
- `data.token_type === "Bearer"`
- a non-empty `data.access_token`
- a future `data.access_expires_at`
- a valid user identity
- a non-empty current session SID

It returns `null` for legacy unsupported responses such as 404/405 or a
non-AuthBundle response so the existing compatible-user extractor can run.
Confirmed modern authentication errors such as 401, 409, and 429 must remain
actionable rather than falling through to another login attempt.

The exact New API extractor runs before the generic compatible-user extractor.
That avoids stale pre-upgrade `localStorage.user` selecting the obsolete cookie
path after a deployment upgrades to rc.22.

### 2. Introduce Completion-Only Transient Auth

Add a discriminated onboarding-only type similar to:

```ts
type NewApiDashboardTransientAuth = {
  kind: "new_api_dashboard_bearer"
  token: string
  expiresAt: number
  sessionId: string
  origin: string
}
```

Propagate it only through:

```text
ContentSessionExtractionResult
→ AccountBrowserSession
→ auto-detect detected identity
→ New API account completion
```

It must not appear in `AutoDetectCompletionData`, Account Dialog drafts,
`SiteAccount`, browser storage, logs, analytics, snapshots, or error messages.
The account-browser-session normalization boundary must whitelist the known
discriminant and fields instead of spreading an untrusted message object.

### 3. Consume The Bearer In New API Completion

When the detected site type is exactly `SITE_TYPES.NEW_API` and the validated
transient-auth kind is present, New API account completion builds a temporary
service request with:

```ts
{
  authType: AuthTypeEnum.AccessToken,
  accessToken: transientAuth.token,
}
```

It deliberately omits `userId`, so the rc.22 request sends
`Authorization: Bearer ...` without the obsolete `New-Api-User` header.

The existing account bootstrap then performs:

```text
GET /api/user/self
→ reuse access_token when returned
→ otherwise GET /api/user/token
→ return the resulting management PAT
```

For rc.22, the safe self DTO excludes the management PAT, so the existing
generation branch replaces the prior PAT. This is an accepted consequence of
preserving the current auto-detect get-or-create contract.

`GET /api/user/token` regenerates and overwrites the management PAT. The exact
New API transient-auth branch therefore injects an adapter-local token-creation
policy that disables current-tab transport and supplies an explicit empty
temporary-window fallback allowlist. This keeps the side effect at-most-once.
The policy defaults to absent, so legacy New API and other New API-family site
types retain their existing transport and fallback behavior.

The completion result contains only the management PAT and returns effective
authentication type `AccessToken`, including when the user initially selected
Cookie. The short-lived dashboard Bearer is discarded with the call stack.

When transient auth is absent, the current branches remain byte-for-byte in
behavior:

- requested Cookie uses cookie-auth user info
- requested AccessToken uses cookie-auth get-or-create PAT
- other New API-family site types keep their existing shared implementation

### 4. Preserve Transport And Runtime Behavior

The generic API transport already supports Bearer authentication for
`AuthTypeEnum.AccessToken`; no new auth mode is required.

An explicit temporary-window fallback allowlist is authoritative. In
particular, an explicit empty allowlist must suppress the default Cookie 401
fallback rather than allowing an implicit replay. Current-tab transport
diagnostics redact the exact request access token before logging any fallback
error text.

The rc.22 completion request must not include a user ID. The legacy compatible
user-header fan-out remains available for old deployments and other site types.

No saved-account request, persistence schema, migration, refresh capability,
token CRUD operation, check-in provider, or model-list behavior changes.

### 5. Repair Real-Site E2E Login State

The compatible real-site login helper gains an opt-in AuthBundle mode used only
by the New API wrapper.

It distinguishes:

- legacy top-level user response: preserve localStorage seeding
- rc.22 AuthBundle: use nested user and do not fabricate localStorage
- recoverable anonymous response: allow one UI fallback
- terminal 409/429 or unrecognized successful response: surface a controlled
  error and do not create another session

UI login completion accepts either legacy storage or an AuthBundle refresh
probe. A successful API login never falls through to UI login.

The helper tracks ownership only for sessions it creates. The account-scenario
finalizer calls `/api/user/auth/logout` with the captured Bearer, SID, Origin,
and refresh cookie after the account has been saved. Reused pre-existing
sessions are never logged out.

The cleanup proves that the saved account uses the management PAT: later
account operations must continue working after the dashboard session is
revoked.

## Error Handling

- 404/405 or non-AuthBundle refresh response: legacy extractor/API fallback.
- 401 from a recognized modern refresh endpoint: login required.
- 409 `AUTH_SESSION_MISMATCH`: actionable session mismatch, no login retry.
- 409 `AUTH_SESSION_LIMIT`: actionable session-limit guidance, no login retry.
- 429 `AUTH_SESSION_ISSUANCE_LIMIT`: actionable issuance-limit guidance, no
  login retry.
- malformed or expired AuthBundle: invalid-response failure without logging
  the body or token.
- cleanup failure: preserve the primary E2E failure and report cleanup failure
  through the existing finalizer aggregation.

## Security And Privacy

- Build the refresh endpoint from the actual page origin.
- Use an isolated content-script fetch; do not inject into MAIN world or
  intercept page requests.
- Do not persist the Bearer, refresh cookie, SID, or AuthBundle.
- Do not log or include them in telemetry and test diagnostics.
- Strictly normalize runtime-message data at the browser-session boundary.
- Verify the transient-auth origin matches the completion target origin.
- Add an upstream-contract comment near the extractor and completion logic.

## Telemetry Decision

Telemetry decision: reuse existing.

This preserves the existing account auto-detect action and success/failure
contract. Existing privacy-safe strategy, site-type, fetch-context, and failure
reason telemetry remains sufficient. No auth kind, token, SID, expiry, URL, or
backend message is added.

## Settings Search Decision

Settings search decision: none. No settings UI, route, anchor, or search target
changes.

## E2E Decision

E2E decision: update browser-level coverage.

This regression depends on HttpOnly cookies, content-script same-origin fetch,
runtime-message propagation, and the difference between dashboard Bearer and
persisted PAT. Focused Vitest tests are necessary but not sufficient.

Add or update one deterministic Chromium flow that proves:

- rc.22 has no `localStorage.user`
- refresh returns AuthBundle
- `/api/user/self` requires the dashboard Bearer
- `/api/user/token` returns a management PAT
- the saved account contains the PAT, not the dashboard Bearer
- saved-account operations still work after dashboard logout

Keep the existing legacy browser flow to prove old compatibility.

## Testing Strategy

Use TDD in these slices:

1. AuthBundle extractor parsing, exact-site gating, origin construction,
   expiry validation, legacy fallback, and modern errors.
2. Content extractor ordering and message-handler error propagation.
3. Browser-session transient-auth normalization and rejection of malformed
   message data.
4. Current-tab and background auto-detect propagation without analytics or
   completion-output leakage.
5. New API completion consumes Bearer without a user header, returns only the
   management PAT, and normalizes auth type to AccessToken.
6. Existing New API Cookie and AccessToken completion tests remain unchanged.
7. Real-site helper recognizes AuthBundle, avoids double login, surfaces
   409/429, and cleans up only owned sessions.
8. Deterministic browser E2E covers rc.22 and legacy flows.

## Validation

Run focused related Vitest tests first, then:

```powershell
pnpm run i18n:extract:ci
pnpm run validate:staged
pnpm run validate:push
```

Run the deterministic Chromium account-onboarding E2E locally. The live New
API matrix requires repository secrets and an account below its active-session
and issuance limits; report that boundary separately if it cannot be run.

## Rollout

1. Add transient-auth contracts and strict normalization.
2. Add the exact New API AuthBundle extractor and typed modern errors.
3. Propagate transient auth through current-tab and background detection.
4. Consume it in New API completion using existing get-or-create PAT behavior.
5. Repair real-site login parsing, terminal errors, and owned-session cleanup.
6. Add deterministic browser-level rc.22 coverage while retaining legacy
   coverage.
7. Run focused tests, local gates, and final diff review.
8. Run the live real-site New API job when credentials and session limits permit.
