# New API rc.41 scoped access tokens — account credential adaptation

Status: ready-for-agent
Feature branch: `feat/new-api-scoped-access-tokens` (base `origin/main` @ 7aac6134e)

## Problem

New API `v1.0.0-rc.41` (released 2026-09-30) replaced the dashboard personal access
token with scoped access tokens and removed the endpoints All API Hub uses to obtain
an account credential. Account auto-detection fails on every deployment that took the
upgrade.

Observed: Real-Site E2E run 36788783850, main @ 7aac6134e, 7/18 jobs red, all with
`Auto-detection failed: New API dashboard authentication could not be exchanged`
(`e2e/utils/realSite/newApiAccountRecovery.ts:52`). The two commits between the last
green real-site run (`12bfc23e1`) and that head are a version bump and release notes
only, so no repository change caused it.

## Verified upstream behaviour

Verified 2026-10-01 against the CI target deployment `test-new-api.qixing1217.top`
(`/api/status` → `version: "v1.0.0-rc.41"`) and upstream source
`QuantumNous/new-api` @ `caca52f8` ("feat(auth): replace the dashboard access token
with scoped access tokens"):

- `POST /api/user/login` returns an AuthBundle whose `access_token` is a 15-minute
  JWT; `POST /api/user/auth/refresh` (cookie-authenticated) reissues it.
- Dashboard API requests are **Bearer-only**. Cookies authenticate login/refresh
  only: `GET /api/user/self` with cookies answers 401 `AUTH_UNAUTHORIZED`.
- `/api/user/self` no longer carries `access_token` (`model/user.go` marks the field
  `json:"-"`).
- `/api/user/token*` is gone: `/api/user/token/status` → 404, `/api/user/token` → 403
  `AUTH_INSUFFICIENT_PRIVILEGE` (matched by another `/api/user/*` route, **not** 404).
  Replaced by `/api/user/access_tokens` (list/create), `/catalog`, `/scopes`.
- `POST /api/user/access_tokens {name, scopes, expires_at}` requires a browser session
  **and** an `X-Security-Proof` step-up proof. Without one it answers
  403 `SECURITY_PROOF_REQUIRED`; `GET /api/verify/methods?scope=access_token.generate`
  returns password/2FA/passkey methods, so the proof cannot be produced headlessly.
- Legacy PATs in `users.access_token` keep working (and bypass scope checks) until
  `LegacyAccessTokenRetireAt`; the probe deployment reports `retire_at` ≈ 2026-10-30.
  They can no longer be generated or read.

## Decision

Auto-detection cannot mint a durable credential on rc.41+ without user interaction.
The account therefore falls back to the existing guided recovery: AAH tells the user
which failure occurred, points at the site's security page, and accepts the `nap_`
token they paste back. The legacy `/api/user/token` path stays byte-for-byte intact for
rc.22–rc.40.

Which path a deployment uses cannot be read from its version string (the same lesson
recorded for Rix API in `src/services/apiService/newApiFamily/variants/rixApiDialects.ts`),
and it cannot be discovered by trying the legacy call first: on rc.41 that call answers
403 from an unrelated route and it is the call that **rotates** the account PAT. So the
dialect is resolved by a read-only probe (`GET /api/user/access_tokens`) and remembered
per deployment for the session.

## General architecture

Four modules had grown their own per-deployment memory with their own base-URL
normalizer: `variants/rixApiDialects.ts`, `aiApi/authFallback.ts`
(`createAuthModeMemory`), `apiAdapters/newApi/accountRoutes.ts`
(`bootstrapRouteFactsCache`), and now the credential dialect. Consolidate the storage,
bounding, and write rules into one primitive under `src/services/core/`, and keep each
caller's resolution policy local.

The primitive owns the rule this incident produced: **a probe result is only remembered
when it is a definite answer.** A transport failure must never be stored, because a
remembered "this deployment is old" turns one network blip into a permanently wrong
endpoint choice.

## Work breakdown

1. Shared deployment probe memory + migration of the three existing memories.
2. New API credential dialect probe and memory, including the stale-memory and
   non-replay rules.
3. Scoped access token creation and dialect dispatch in `getOrCreateAccessToken`.
4. Completion failure classification so the dialog shows actionable guidance instead
   of one opaque banner.
5. Real-site recovery helper update for the new security page.
6. Record the verified rc.41 contract in `docs/agents/site-integrations.md`.

## Progress

- [x] 1 — `src/services/core/deploymentProbeMemory.ts`, migrated `rixApiDialects`,
      `authFallback.createAuthModeMemory`, and the `accountRoutes` route-facts cache.
- [x] 2 — `default/accessTokenDialect.ts` + tests.
- [x] 3 — `createScopedAccessToken` + dialect dispatch in `getOrCreateAccessToken`.
- [x] 4 — rc.41 security-check refusal now classifies as `AccessTokenVerificationRequired`.
- [x] 5 — real-site helper is generation-aware; live rc.41 run green.
- [x] 6 — rc.41 contract recorded; recovery copy names the permission/expiry step.

## Validation (2026-10-01)

- `pnpm exec tsc --noEmit` clean; `eslint` clean on changed files.
- `vitest run tests/services` — 577 files / 10986 tests.
- `playwright test e2e/newApiAccountRecoveryUserFlow.spec.ts e2e/newApiAccessTokenRecovery.spec.ts`
  — 7 passed (mocked site, both site generations).
- Against the live rc.41 deployment (`test-new-api.qixing1217.top`):
  - `e2e/realSite/newApiAccountAdd.spec.ts` — 5 passed (was the red `Account / New API` job).
  - `e2e/realSite/managedSiteChannels.spec.ts` — 4 passed including
    `New API covers token channel status when supported` (was the red job);
    `persists multi-key edits` fails only when run beside its siblings and passes
    alone, which is an ordering flake in the admin channel page, not this change.

## Follow-ups

- Repeated runs create one scoped access token each against a 20-token cap; the
  harness now deletes its own hour-old tokens before creating.
- The test account's legacy PAT was revoked during reconnaissance, before the
  revoke flow was understood. Nothing in the product or the CI flows read it.
