# Native Page Auto Check-In Design

Date: 2026-06-23

## Purpose

Support New API-family deployments whose check-in endpoint requires a
page-generated dynamic signature header. These deployments can reject the
extension's existing replay request even when the request is sent from a
temporary content-script context, because the missing value is computed by the
site page JavaScript at click time rather than being a stable protocol header.

The design adds a narrow native-page check-in strategy for those deployments:
open the site check-in page, verify the temporary page is logged in as the
target account when that matters, trigger the page's own check-in action, then
confirm the target account's check-in status through the existing account API.

## Current Context

New API auto check-in currently has two main paths:

- Direct API check-in calls `POST /api/user/checkin` through the account-site
  transport.
- Turnstile-assisted check-in opens a temporary browser context, uses the
  content script to click the check-in entry when needed, waits for a
  Turnstile token, then replays `POST /api/user/checkin` with extension-built
  request options.

The current content-script fetch handler is not a page-native request
executor. It runs extension code in the content-script world and calls
`fetch(fetchUrl, fetchOptions)` with headers prepared by the extension. It can
carry cookies and extension-provided headers, but it does not automatically
reuse the site's own JavaScript request wrapper, axios interceptors, closure
state, nonce generation, or dynamic signature headers.

Existing reusable pieces:

- `src/entrypoints/content/messageHandlers/utils/turnstileGuard.ts` owns the
  page button pre-trigger behavior used before waiting for Turnstile tokens.
- `ContentGetUserFromLocalStorage` uses content-session extractors, including
  the compatible `localStorage.user` extractor, to identify the current page
  login user.
- `normalizeAccountIdentity(...)` and
  `resolveStoredAccountUserIdentity(...)` normalize account identities across
  account-site variants.
- `fetchCheckedInTodayStatus(...)` in the New API auto-checkin provider already
  verifies whether the target account is checked in today after ambiguous
  Turnstile-assisted attempts.

## Problem

Some New API-family deployments require a dynamic check-in signature header
that is produced by the page application during the native check-in action.
For those deployments, extension replay can fail with a missing-signature
message even from the temporary page because the replay request is still
constructed by the extension.

The obvious workaround, "click the page button," is only safe if the clicked
page is operating as the target saved account. In multi-account setups,
especially access-token accounts, the page may be logged in as a different web
user from the account currently being processed by the auto-checkin scheduler.
Native page clicking without identity checks can sign in the wrong account and
misreport success.

## Goals

- Reuse the existing page pre-trigger click behavior instead of adding a second
  button-finding implementation.
- Add a native-page check-in strategy that lets the site page's own JavaScript
  send the signed check-in request.
- Keep the existing Turnstile replay strategy behavior-compatible.
- Apply page-login identity matching as a hard gate only for native-page
  check-in, not for Turnstile replay.
- Confirm success through the target account's server-side check-in status, not
  by trusting page toasts or button text alone.
- Keep dynamic-signature handling narrow and opt-in by failure classification,
  account/site configuration, or a site-specific rule.

## Non-Goals

- Do not reverse-engineer Huainova or any other deployment's JavaScript
  signature algorithm in this slice.
- Do not make all New API auto check-ins click the page before trying the
  direct API path.
- Do not require page-login identity matching for existing Turnstile replay
  attempts.
- Do not infer success solely from page-visible text.
- Do not manually edit locale files until user-facing copy is actually added
  during implementation.

## Proposed Design

### 1. Extract Shared Page Action Trigger

Move the existing Turnstile pre-trigger button selection and click behavior
behind a neutral content-script helper, for example:

```ts
triggerCheckinPageAction(params: {
  trigger?: TurnstilePreTrigger
  requestId?: string
}): Promise<CheckinPageActionTriggerResult>
```

The helper should preserve the current semantics:

- `kind: "checkinButton"`
- `kind: "clickSelector"`
- `kind: "clickText"`
- `kind: "none"`
- throttling and max-attempt behavior
- positive/negative label filtering
- conservative "target not found" results

`ContentWaitForTurnstileToken` should call this helper before continuing to
wait for the Turnstile token. That keeps existing Turnstile behavior intact
while allowing native-page check-in to reuse the same click path.

### 2. Add a Content Action for Page-Native Triggering

Add a runtime action such as `ContentTriggerCheckinPageAction`.

It should:

- run only in the content script for the temporary check-in page;
- call the shared page action trigger;
- return a structured result:
  - `clicked`
  - `target_not_found`
  - `throttled`
  - `error`
- avoid deciding whether check-in succeeded.

The content action is deliberately not a fetch replay action. Its job is to let
the site page's own event handler run.

### 3. Add Temporary Page Identity Resolution

Add a small helper in the temporary-window/background flow, for example:

```ts
resolveTempPageAccountIdentity(params: {
  tabId: number
  url: string
  siteType: AccountSiteType
}): Promise<{ userId: string; user: unknown } | null>
```

It should use the existing `ContentGetUserFromLocalStorage` message and content
session extractors. It should not call the full `autoDetectSmart(...)` flow,
because native-page check-in needs the identity of the page currently being
clicked, not a broader API fallback that might hide page-login mismatch.

The native-page strategy should compare this `userId` with
`account.account_info.id` using `normalizeAccountIdentity(...)`.

### 4. Add Native-Page Check-In Strategy

Add a New API provider branch for dynamic-signature failures:

1. Direct API check-in fails.
2. The failure message matches a narrow dynamic-signature classifier, such as
   missing check-in signature header.
3. The provider opens the check-in page in a temporary browser context.
4. Before clicking, the temporary page identity is resolved.
5. If the page identity does not match the target account, the provider returns
   a manual-required result with mismatch diagnostics.
6. If the identity matches, the provider calls
   `ContentTriggerCheckinPageAction`.
7. After a click, the provider polls the target account's
   `checked_in_today` status with bounded timeout/backoff.
8. If confirmed, return success or already-checked using the existing result
   shape. If not confirmed, return manual-required.

This strategy should not replay `POST /api/user/checkin`; the point is to let
the page produce and send its own dynamic signature request.

### 5. Scope Identity Gate to Native Strategy Only

The page identity match is mandatory for native-page check-in because the page
request signs in whichever web account is logged into the temporary page.

The existing Turnstile replay strategy should not gain this hard gate. In that
flow, the page click is mainly used to obtain a Turnstile token, while the final
check-in request is still built with the target account's auth context. Adding
a page-login match requirement there would regress access-token multi-account
cases that currently work.

Turnstile replay may optionally log identity diagnostics later, but that is not
part of the behavior gate.

## Failure Handling

- **Identity missing**: do not click; return a manual-required result explaining
  that the temporary page login identity could not be confirmed.
- **Identity mismatch**: do not click; return a manual-required result
  explaining that the temporary page is logged into a different account.
- **Trigger target not found**: return manual-required with the check-in page
  URL.
- **Trigger clicked but status not confirmed**: return manual-required after
  bounded polling.
- **Status check reports already checked**: return the existing
  already-checked result.
- **Status check reports checked in after click**: return success or
  already-checked, depending on the existing provider result convention chosen
  during implementation.

## Testing Plan

Focused tests should cover:

- The shared page action trigger preserves current Turnstile pre-trigger
  behavior.
- `ContentTriggerCheckinPageAction` returns clicked, target-not-found,
  throttled, and error outcomes.
- Native-page check-in refuses to click when the temporary page identity is
  missing.
- Native-page check-in refuses to click when the temporary page identity does
  not match the target account.
- Native-page check-in clicks when the identity matches and confirms success
  through `checked_in_today`.
- Dynamic-signature failures trigger native-page strategy.
- Existing Turnstile replay tests remain unchanged and do not require page
  identity matching.

Validation should start with related Vitest coverage for the content message
handler, temp-window background flow, and New API auto-checkin provider. A full
`pnpm run validate:staged` should be run before committing. `validate:push` is
only required before remote handoff because the eventual implementation will
touch runtime action wiring and shared TypeScript contracts.

## Open Implementation Notes

- The dynamic-signature classifier should start narrow. A site-specific rule
  for the reported Huainova deployment is safer than broadly matching every
  "header" error.
- Any user-facing native-page failure copy must update all app locale siblings
  and pass `pnpm run i18n:extract:ci`.
- Telemetry decision for implementation: reuse existing auto-checkin result
  events if they already capture provider failure category; otherwise add a
  privacy-safe result category for native-page identity mismatch and trigger
  failure. Do not record URLs, user ids, headers, tokens, or backend messages.

