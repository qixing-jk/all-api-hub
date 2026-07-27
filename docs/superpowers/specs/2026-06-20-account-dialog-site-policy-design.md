# Account Dialog Site Policy Design

## Purpose

Make new account site types faster to add by moving Account Dialog
site-specific UI and workflow rules into a dedicated policy Module.

Recent adapter work moved account data, account refresh, account bootstrap,
account completion, key management, model pricing, redemption, and onboarding
facts behind explicit seams. The remaining high-friction path is the Account
Dialog itself: it still decides several site-specific rules inline while users
manually add, auto-detect, edit, save, and post-configure accounts.

This spec covers only the Account Dialog policy substrate. It does not add a
new site type and does not implement the registration consolidation slice.

## Current Context

Current `main` has the prerequisite adapter and onboarding work:

- `src/services/accountSiteOnboarding/` owns account-site detection metadata,
  route metadata, and content-session extractors.
- `src/services/apiAdapters/` owns post-detection backend capabilities through
  `getSiteAdapter(siteType)`.
- `src/services/accounts/utils/apiServiceRequest.ts` now returns an adapter,
  adapter-backed `keyManagement`, and an account-scoped request. It no longer
  exposes the legacy root `apiService` facade to account-mainline callers.
- Account-mainline ESLint guardrails block new direct imports of the legacy
  root `apiService` facade in Account Management, Key Management, Model List,
  verification dialogs, Kilo export, and account services.

The Account Dialog still contains policy decisions that vary by account site
type:

- `applySub2ApiDraftConstraints(...)` forces Sub2API to access-token auth,
  clears cookie-auth session data, and disables built-in check-in detection.
- `clearSub2ApiRefreshTokenState(...)` clears Sub2API refresh-token fields when
  the selected site type changes away from Sub2API.
- `buildDraftFromAutoDetectResult(...)` forces Sub2API and AIHubMix detected
  accounts to access-token auth and clears saved cookie-auth session data.
- Cookie auto-import after auto-detect skips Sub2API and AIHubMix.
- Save payload construction only persists `sub2apiAuth` for Sub2API.
- Post-save flows have inline Sub2API token-creation dialog behavior and
  AIHubMix one-time key behavior.
- Existing stored-account hydration only restores Sub2API refresh-token state
  for Sub2API accounts.

The scattered branches are individually small, but they increase the number of
places a future account site type must touch. They also make it hard to tell
which rules are UI policy, which rules are persistence payload rules, and which
rules belong in backend adapters.

## Problem

The Account Dialog is still a shallow site-policy Module. Callers and tests
must know many individual site-type conditions instead of asking one local
Interface for dialog behavior.

Current friction:

1. Site-specific draft normalization is split across effects, auto-detect
   merge helpers, edit-mode hydration, and setter handlers.
2. Auth mode policy is implicit. Sub2API and AIHubMix both force saved
   access-token accounts in some paths, but the reason is embedded in UI
   branching.
3. Cookie-auth policy is implicit. Cookie import is available broadly, then
   disabled or skipped by inline exceptions.
4. Sub2API refresh-token support is both a form policy and a persistence
   policy, but the relevant checks are spread across draft state, import,
   validation, save payload construction, and cleanup.
5. Post-save behavior is site-specific but not expressed as policy. Sub2API
   may open a token creation dialog; AIHubMix may defer success until the user
   handles a one-time key prompt.
6. The next special site type would likely add another set of `SITE_TYPES.X`
   branches inside `useAccountDialog.ts`.

Deletion test: if the inline Sub2API and AIHubMix checks were deleted from
`useAccountDialog.ts`, the logic should not reappear as new raw branches in the
same hook. It should reappear behind a small Account Dialog policy Interface
that the hook can call at draft normalization, auto-detect merge, save payload,
and post-save decision points.

## Goals

- Add a dedicated Account Dialog site policy Module that owns dialog-scoped
  site-type rules.
- Keep the policy Module local to Account Management. It should describe UI and
  workflow policy, not backend protocol behavior.
- Preserve current behavior for:
  - Sub2API access-token-only Account Dialog state.
  - Sub2API built-in check-in disabled state.
  - Sub2API refresh-token import, persistence, validation, and cleanup.
  - Sub2API post-save token creation dialog.
  - AIHubMix access-token saved-account state after browser-session
    auto-detect.
  - AIHubMix saved cookie-auth session clearing.
  - AIHubMix one-time key post-save prompt and deferred success behavior.
  - Cookie auto-import for compatible non-Sub2API, non-AIHubMix cookie-auth
    accounts.
  - Existing edit-mode stored-account hydration.
- Make adding a new Account Dialog policy variation a matter of extending one
  policy table/helper instead of adding branches across the hook.
- Keep tests focused on the policy Interface and the hook integration points
  that consume it.

## Non-Goals

- Do not add a new account site type.
- Do not change user-facing Account Dialog behavior.
- Do not redesign Account Dialog layout, copy, locale keys, or visual states.
- Do not move detection metadata, route metadata, or content-session
  extractors out of `src/services/accountSiteOnboarding/`.
- Do not move backend capabilities out of `src/services/apiAdapters/`.
- Do not change `SiteAdapter` in this slice.
- Do not migrate managed-site providers, managed-site model sync, channel CRUD,
  or hosted-site settings.
- Do not consolidate account-site registration metadata. That is a separate
  follow-up slice.
- Do not change telemetry schema. Existing Account Dialog analytics actions
  should continue to fire from the same user actions.
- Do not add Playwright E2E coverage unless implementation reveals a real
  browser-only risk.

## Approaches Considered

### Approach A: Keep Inline Branches In `useAccountDialog`

This is the smallest immediate change, but it preserves the current tax for
new site types. Every special account site has to be understood across draft
normalization, auto-detect, save, and post-save paths.

This should not be the next step.

### Approach B: Put Dialog Policy On `SiteAdapter`

`SiteAdapter` already describes backend capabilities after the site type is
known, so it is tempting to add Account Dialog flags there.

This blurs the seam. Account Dialog policy includes UI state, form visibility,
post-save prompts, and browser cookie import decisions. Those are not backend
protocol facts, and putting them on `SiteAdapter` would make backend adapters
know about Account Management UI.

This should not be the next step.

### Approach C: Add A Local Account Dialog Site Policy Module

Create a feature-local policy Module that maps `AccountSiteType` to the rules
the Account Dialog needs. `useAccountDialog.ts` continues to own React state,
side effects, analytics, toasts, and orchestration, but it asks the policy
Module for site-specific decisions.

This is the recommended path. It deepens the Account Dialog policy Interface
without moving UI concerns into backend adapters or reopening the legacy
`apiService` facade.

## Design

### 1. Add A Feature-Local Policy Module

Create:

```text
src/features/AccountManagement/components/AccountDialog/sitePolicy.ts
```

The Module should export a small Interface centered on Account Dialog behavior:

```ts
export type AccountDialogSitePolicy = {
  siteType: AccountSiteType
  forceAccessTokenAuth: boolean
  allowCookieAuthSession: boolean
  allowCookieAutoImport: boolean
  allowBuiltInCheckInDetection: boolean
  sub2apiRefreshToken: {
    enabled: boolean
    clearWhenInactive: boolean
  }
  postSave: {
    openSub2ApiTokenDialog: boolean
    deferSuccessForAihubmixOneTimeKey: boolean
  }
}
```

The exact property names can be refined during implementation, but the
Interface must stay dialog-focused. It should answer questions the Account
Dialog currently answers with raw `SITE_TYPES.SUB2API` and
`SITE_TYPES.AIHUBMIX` checks.

Suggested exported helpers:

```ts
export function getAccountDialogSitePolicy(
  siteType: AccountSiteType,
): AccountDialogSitePolicy

export function applyAccountDialogSitePolicyToDraft(params: {
  draft: AccountDialogDraft
  policy: AccountDialogSitePolicy
}): AccountDialogDraft

export function clearInactiveSitePolicyState(params: {
  draft: AccountDialogDraft
  policy: AccountDialogSitePolicy
}): AccountDialogDraft
```

Default policy should represent New API-family compatible behavior:

- access-token and cookie-auth modes may remain user-selected;
- cookie auto-import remains allowed for cookie-auth flows;
- built-in check-in detection remains allowed;
- Sub2API refresh-token fields are inactive;
- post-save does not require a site-specific prompt.

Sub2API policy:

- force access-token auth;
- disallow saved cookie-auth session data;
- disallow cookie auto-import;
- disallow built-in check-in detection;
- enable refresh-token draft state and persistence;
- open the Sub2API token creation flow after successful add when not skipped.

AIHubMix policy:

- force saved access-token auth after auto-detect/import because browser
  session data is only used to obtain an access token;
- disallow saved cookie-auth session data;
- disallow cookie auto-import after detection;
- keep Sub2API refresh-token state inactive;
- defer normal add success when one-time key auto-provisioning needs foreground
  user acknowledgement.

### 2. Replace Draft Normalization Branches

`useAccountDialog.ts` should stop owning the specific Sub2API normalization
rules directly.

Replace:

- `applySub2ApiDraftConstraints(...)`
- `clearSub2ApiRefreshTokenState(...)`
- inline Sub2API check-in overrides in auto-detect merge
- inline Sub2API/AIHubMix saved cookie clearing in auto-detect merge

With policy helpers that apply the same state transitions.

The hook should still own when normalization runs:

- when selected `siteType` changes;
- when edit-mode account data is loaded;
- when auto-detect returns a site type;
- when the user toggles Sub2API refresh-token mode.

### 3. Keep Save Payload Assembly In The Hook, But Ask Policy

The hook can keep constructing the `validateAndSaveAccount(...)` and
`validateAndUpdateAccount(...)` arguments. This slice should not move the whole
save workflow.

The Sub2API payload decision should become policy-driven:

- if policy enables refresh-token persistence and the toggle/token are valid,
  include `sub2apiAuth`;
- otherwise omit `sub2apiAuth`.

This preserves the existing account operations contract while removing the raw
site-type branch from the hook.

### 4. Keep Browser/Permission Side Effects In The Hook, But Ask Policy

Cookie permission requests, cookie import messaging, tab inspection, runtime
messages, toasts, and telemetry should remain in `useAccountDialog.ts`.

The policy should only answer whether the current site type allows cookie
auto-import or saved cookie-auth session data. The hook continues to perform
the actual browser work.

### 5. Keep Post-Save Effects In The Hook, But Route Decisions Through Policy

Post-save workflows remain orchestrated by the hook because they touch React
state, dialogs, toasts, and callbacks.

Policy should decide:

- whether a successful add should defer `onSuccess` for AIHubMix one-time key
  flow;
- whether a successful add should open the Sub2API token creation dialog;
- whether Sub2API-specific skip options apply to the current site type.

This keeps site-specific post-save behavior visible without requiring the hook
to branch on concrete site type values.

### 6. Test The Policy Interface Directly

Add focused unit coverage for the policy Module:

- default compatible policy allows existing cookie-auth and check-in behavior;
- Sub2API policy forces access-token auth, clears cookies, disables built-in
  check-in, and keeps refresh-token state only while active;
- AIHubMix policy forces saved access-token auth, clears saved cookies, and
  disables cookie auto-import;
- unknown site type follows default compatible policy unless implementation
  needs a stricter unsupported policy.

The policy tests should use placeholder account names and example domains only.

### 7. Preserve Hook-Level Regression Tests

Update existing hook tests only where their assertions currently depend on
inline helper names or exact branch placement.

Relevant existing suites include:

- `tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx`
- `tests/features/AccountManagement/hooks/useAccountDialog.authDefaults.test.tsx`
- `tests/features/AccountManagement/hooks/useAccountDialog.importCookies.test.tsx`
- `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`

The implementation plan should prefer existing tests plus targeted policy unit
tests over broad new E2E coverage.

## Error Handling

The policy Module should be pure and should not throw for ordinary unsupported
or unknown site types. It should return a default policy for any
`AccountSiteType` that does not need special Account Dialog behavior.

Existing runtime error handling remains with the hook and called services:

- cookie permission failures continue to produce existing permission feedback;
- auto-detect failures continue through the current detailed error handling;
- save failures continue through `validateAndSaveAccount(...)` /
  `validateAndUpdateAccount(...)`;
- post-save workflow failures continue to use existing toast and logger paths.

## Telemetry Decision

Telemetry decision: reuse existing.

This is a refactor-only slice. It should not introduce new user actions or new
analytics fields. Existing Account Dialog telemetry should continue to be
emitted from the hook at the same user action points.

## Settings Search Decision

No settings search changes.

The slice does not add, rename, move, or remove settings UI.

## E2E Decision

Do not add Playwright E2E by default.

The primary risk is policy mapping and hook state transitions, which can be
covered by focused unit and hook tests. Add E2E only if implementation changes
browser-level cookie import behavior, extension permission behavior, or
cross-entrypoint post-save dialog behavior beyond the current wiring.

## Validation Plan

Focused validation should include:

```text
pnpm vitest run tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx
pnpm vitest run tests/features/AccountManagement/hooks/useAccountDialog.authDefaults.test.tsx
pnpm vitest run tests/features/AccountManagement/hooks/useAccountDialog.importCookies.test.tsx
pnpm vitest run tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
```

Add the new policy test file to the focused command once implementation names
are known.

Because this touches Account Management hook behavior and shared TypeScript
types, final implementation validation should include:

```text
pnpm compile
pnpm run validate:staged
```

If the implementation also touches exports, ESLint guardrails, or shared
service contracts, broaden to:

```text
pnpm run validate:push
```

## Rollout

1. Add the policy Module and direct unit tests.
2. Replace draft normalization branches in `useAccountDialog.ts` with policy
   helper calls.
3. Replace cookie auto-import, save-payload, and post-save decision branches
   with policy checks.
4. Keep the hook as the orchestrator for React state, browser work, analytics,
   toasts, and dialogs.
5. Run focused hook and policy tests.
6. Run compile and staged validation.
7. Inspect the diff for scope drift.

## Follow-Up, Not In Scope For This Spec

- Consolidate account-site registration metadata across onboarding,
  `apiAdapters/registry.ts`, and site-type constants.
- Revisit managed-site provider/model-sync seams if the next new site type
  needs admin-managed support.
- Revisit Model List catalog/pricing assembly if the next new site type needs
  non-standard runtime model discovery or estimated pricing.
- Consider a lint guard or search check for new raw `SITE_TYPES.SUB2API` /
  `SITE_TYPES.AIHUBMIX` branches in Account Dialog once the policy Module is
  established.
