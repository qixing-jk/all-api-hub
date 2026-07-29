# OpenRouter Management Key Account Foundation Design

Date: 2026-07-17
Finalized: 2026-07-27 after the accepted full-`src` audit
Status: approved final design; active implementation continuation

## Purpose

Add OpenRouter as a dedicated account-only site authenticated by a Management
Key. The account supports strict credential validation, credit-balance refresh,
best-effort page-assisted key creation, editable local metadata, and exact-key
duplicate detection without treating OpenRouter as a New API-family or managed
site.

This file is the single design authority for the foundation and its final scope
correction. The implementation plan is
`../plans/2026-07-21-openrouter-management-key-account-foundation.md`.

Deterministic tests prove extension wiring only. The current live OpenRouter DOM
flow has not been proven and remains separate evidence.

## Verified OpenRouter Contracts

### Account placement and storage

- `openrouter` is a dedicated account site type and adapter family.
- The canonical account origin is `https://openrouter.ai`; OpenRouter account
  API calls must not send the Management Key to a user-edited or inferred host.
- OpenRouter is account-only. It is not a New API-family compatibility bucket,
  a managed-site type, a check-in provider, or an account runtime-key provider.
- The saved credential remains `AuthTypeEnum.AccessToken` (serialized as
  `"access_token"`) in `account_info.access_token`. No storage migration or
  second credential field is introduced.
- OpenRouter transport omits editable `account_info.id`; user ID is local
  metadata, not an authentication header, billing scope, or organization ID.
- The existing generic plaintext export/WebDAV-backup warning remains in force.
  Deleting or deduplicating an account removes local extension data only.

### Management Key validation

`GET /api/v1/key` is the credential-validation boundary. Requests authenticate
with `Authorization: Bearer <management-key>`. A credential is accepted only
when the response is structurally valid and `is_management_key === true`.

A normal runtime key raises the typed Management-Key-required error. HTTP,
permission, transport, and malformed-payload failures retain their existing
classification where possible; control flow never depends on translated error
text. Validation may normalize a non-empty `creator_user_id`, but that value is
the key creator's user identifier, not a verified workspace, organization, or
billing subject.

Management Keys cannot be used for inference. Existing Management Key or
runtime-key inventories do not reveal saved plaintext, so this design never
promises to recover an existing secret.

Protocol sources:

- Management API Keys:
  <https://openrouter.ai/docs/guides/overview/auth/management-api-keys>
- OpenAPI, including `/api/v1/key` and the distinct PKCE `/auth/keys` flow:
  <https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml>

### Credits, quota, and today-statistics availability

`GET /api/v1/credits` is the account-credit source. Its response supplies
`total_credits` and `total_usage`, not a direct balance. The adapter derives:

```text
remaining credits = total_credits - total_usage
```

Both operands must be finite numbers. Missing, non-number, `NaN`, infinite, or
otherwise malformed values are rejected; the adapter must not fabricate a
balance. A valid negative difference is preserved and must not be clamped to
zero. Conversion to the product quota unit occurs once at the account-data
boundary.

OpenRouter does not provide the product's current-day request, token, spend,
or income metrics through this account contract. All today-stat groups remain
explicitly unavailable/unsupported rather than compatibility zeroes. Account
aggregates, history, sharing, and UI must not treat those unavailable values as
measurements.

The OpenRouter account-data and account-refresh adapter seams are real shipped
capabilities. Scope cleanup must not inline, delete, or bypass them.

Protocol and product-model sources:

- Credits API:
  <https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits>
- Negative-balance behavior:
  <https://openrouter.ai/docs/api_reference/limits>
- Today-stat availability contract:
  `2026-07-17-account-today-statistics-availability-design.md`

### Best-effort page and Clerk integration

The existing Account auto-detect action may best-effort create one Management
Key through the logged-in page at the exact canonical Management Keys route.
Passive hostname/site-type detection remains read-only. Page automation uses
the visible creation controls; it does not call undocumented private Server
Actions or pretend the public PKCE `/auth/keys` exchange creates Management
Keys.

The settings-page DOM is a private, unstable integration. Selectors, readiness,
and capture are bounded, failure returns actionable manual-paste guidance, and
an uncertain post-click result is never automatically retried. The page action
submits a caller-generated recognizable label and never replaces, searches by,
or deletes by that label.

The authenticated page's Clerk session is optional best-effort username
metadata. Only a bounded, normalized user ID and one selected display candidate
may cross the page bridge. Exact origin, exact path, request correlation, and
payload-size/shape validation remain required. The complete Clerk object,
session token, cookie, and unselected profile fields never cross the bridge.

An early Clerk read may be retried once after successful key creation when it
was empty. Missing, malformed, timed-out, or still-empty Clerk data never blocks
creation, Management Key validation, form population, save, or refresh.

## Goals

- Keep automatic Management Key creation best-effort, bounded, and
  OpenRouter-local.
- Preserve at-most-once mutation, a pre-click marker, cancellation semantics,
  one settlement, late-result isolation, and accurate mutation certainty.
- Keep generic auto-detect/completion detected-only with its current result
  requirements and fallback behavior.
- Keep username and user ID editable while validating the Management Key
  strictly before save.
- Preserve account data/refresh, ordinary CRUD, dedupe, logging, and shared
  temporary-window behavior outside the narrow OpenRouter special cases.
- Remove single-consumer abstractions, provider transport from generic modules,
  and behaviorless policy/adapter residue without collapsing real seams.

## Non-Goals

- Do not silently create a key during passive detection.
- Do not add a separate visible “Create and connect” workflow.
- Do not recover the plaintext of an existing Management Key.
- Do not automatically revoke/delete a remote Management Key or infer a remote
  record from its label or current DOM.
- Do not persist a created plaintext key beyond the current Account dialog.
- Do not add OAuth/PKCE, account activity, runtime-key CRUD, model catalogs,
  managed-site behavior, check-in, redemption, or announcements in this slice.
- Do not persist workspace, organization, account-scope, credential-ownership,
  or identity-provenance fields.
- Do not make Clerk, `creator_user_id`, username, or user ID a trusted billing,
  organization, workspace, authentication, or duplicate-detection identity.
- Do not change shared temporary-window close/retry semantics for OpenRouter.
- Do not introduce a generic provisioning framework before a second real
  consumer demonstrates the same lifecycle.

## Product Design

### Credential representation, validation, and copy

The Management Key uses the existing access-token account model:
`AuthTypeEnum.AccessToken` plus `account_info.access_token`. OpenRouter site
context selects Management Key-specific form labels and guidance. Remove the
UI-only `credentialKind: "openrouter_management_key"` and the single-consumer
generic `AccountCredentialCapability`; strict validation belongs in the
OpenRouter account/onboarding module.

An unchanged-key edit remains offline-capable. A new or changed key is
validated through `/api/v1/key` before persistence and must satisfy
`is_management_key === true`. User-facing errors provide a local actionable
fallback when upstream messages are empty or unsuitable.

The generic plaintext backup/export warning remains unchanged. Ordinary local
account deletion and duplicate cleanup do not add OpenRouter-only remote
revocation copy.

### Editable identity and fallback

Username and user ID remain editable local metadata. For manual paste and save
preparation, resolve user ID in this order:

1. a non-empty editable user ID;
2. a validated non-empty `creator_user_id`; then
3. the stable OpenRouter-local fallback required by the stored-account model.

The stable fallback is reused when already present and generated in the
reserved OpenRouter namespace only at the boundary that owns the required
stored-account shape. The key is never hashed into identity. Username may use
the optional Clerk display candidate but remains editable and may stay empty.

OpenRouter user ID never enters API transport, balance selection, scope,
billing, or dedupe. A future feature must introduce an explicit verified
identity design before trusting the editable field.

### Credits data and refresh

The account-data adapter calls `GET /api/v1/credits`, validates finite
`total_credits` and `total_usage`, preserves the signed difference, and exposes
today statistics as unavailable. The account-refresh adapter maps that data to
the ordinary refresh success/failure and health contract.

These adapters remain separate, registered capabilities because they have real
account consumers and distinct responsibilities. Shallow-module cleanup in the
OpenRouter onboarding work cannot remove, inline, or bypass them.

### OpenRouter-local onboarding coordinator

The canonical account workflow invokes an OpenRouter-local onboarding/
provisioning coordinator only for the canonical OpenRouter branch. That
coordinator owns create, cancel, mutation certainty, optional Clerk retry,
credential validation, editable defaults/save preparation, and dialog-local
recovery evidence.

Generic `AccountCompletionCapability` remains detected-only with its current
result requirements and fallback behavior. Generic `AccountBootstrapCapability`
remains limited to non-mutating facts used by its real adapters. Neither gains
OpenRouter create/cancel/recovery result unions, provisioning modes, cleanup,
Clerk, or temporary-window types.

Do not introduce a generic `AccountProvisioningCapability`. If another site
later needs the same at-most-once remote mutation, extract a shared contract
from both proven implementations.

### Mutation state and single settlement

Every page-assisted request uses one caller-generated request ID and
recognizable user-facing label. It has exactly one OpenRouter-local mutation
state:

- `not_dispatched`: no remote create click was sent;
- `dispatched_unconfirmed`: a click may have created a key, but no result proved
  it; or
- `created`: the page proved creation and exposed the one-time plaintext key.

A pre-click marker records dispatch before the DOM click. One guarded
settlement owns the result and release. Cancellation before dispatch prevents
the click and settles `not_dispatched`; cancellation after dispatch records the
request without settling early, then preserves the accurate uncertain/created
result. Duplicate cancel/page callbacks and late results cannot produce a
second settlement. An uncertain mutation is never automatically retried.

Hard extension-context termination cannot be transactional. The recognizable
label and manual inspection guidance are the residual recovery; no remote
deletion is claimed.

### Dialog-local created-key recovery

A created-but-unsaved plaintext key is held only in the current Account dialog.
Do not enqueue it in a global/cross-dialog FIFO, restore it into a later dialog,
or persist it in storage, diagnostics, analytics, or an error object.

Normal successful save of that created key is silent. If the dialog abandons
the key by closing, re-detecting, switching site/credential, or saving a
different key, show one reminder to inspect OpenRouter and manually check/delete
the recognizable label. The reminder never contains the key or implies an
existing secret can be revealed. The same transition cannot show it twice.

A created key whose validation fails remains available to the current dialog
for manual paste/recovery until that dialog abandons it. Failure, cancellation,
or close never triggers remote deletion.

### Provider-local page transport

OpenRouter create/cancel request, response, mutation, and page-action types plus
their client live in OpenRouter-local modules shared by the account,
background, and content boundaries. Generic `tempWindowFetch` types/utilities
retain only transport/context operations used by generic temporary-window
consumers.

Runtime action IDs may remain in the shared runtime-action registry because it
is the single extension message namespace, but their OpenRouter payload types
and client are provider-local. Background routing and the content handler
validate the provider-local contract before invoking the page module.

### Shared temporary-window lifecycle

OpenRouter uses the same one best-effort browser-handle removal as other
temporary contexts. Remove caller-selected `browserRemovalAttempts`, the
two-close design, and any OpenRouter-driven shared `tempWindowPool` lifecycle
change. Preserve existing generic ownership/index/timer cleanup, download-rule
cleanup, and unrelated logging behavior.

After the one-time secret is captured, do not click the page's DOM Close
control. Settle once and let ordinary temporary-context release attempt browser
removal once. Context release never retries the creation/page action.

### Duplicate handling

OpenRouter duplicate detection compares exact equality of two non-empty saved
Management Keys. Blank/missing keys are unscannable; different keys never fall
back to editable user ID, even when origin and ID match. Group reason/identifier
metadata is secret-free and credentials never enter logs or telemetry.

Every non-OpenRouter site retains baseline canonical-origin plus user-ID
grouping. Ordinary duplicate records continue to display their user IDs,
including a group whose reason is `same_credential`; OpenRouter secrecy must not
suppress ordinary-site identity display.

### Bounded cleanup of branch residue

Remove `AccountDialog` policy fields only when unused or derivable from site
context. Remove shallow adapters/forwarders only after proving they have no
independent behavior or real multi-adapter seam. Restore unrelated
non-OpenRouter logging changed by the branch.

The OpenRouter account-data and account-refresh seams are explicitly excluded
from shallow-adapter deletion. They preserve Credits API parsing, negative
balance, today-stat availability, and refresh health behavior.

## Error And Recovery Semantics

- Invalid ordinary runtime keys fail strict save validation with Management Key
  guidance.
- Malformed `/api/v1/key` and `/api/v1/credits` payloads fail safely; they do
  not produce fallback credentials, fabricated quota, or zero today stats.
- A pre-dispatch failure may be retried because no click was sent.
- A post-dispatch uncertain result is never automatically retried.
- A known created secret remains only in the current dialog until saved or
  abandoned.
- Validation failure and dialog abandonment never attempt remote deletion.
- User-facing recovery describes the next action using the recognizable label
  without exposing selectors, runtime actions, mutation enums, keys, or backend
  text.

## Security And Telemetry

OpenRouter-owned logs, telemetry, persistence, and error payloads never include
the Management Key, creator/Clerk user IDs, editable identity, cookies, labels,
URLs, paths, selectors, page text, backend messages, remote IDs, or stack
traces. Do not derive telemetry identifiers by hashing a credential. Inherited
generic temporary-window diagnostics retain their baseline behavior; broader
privacy hardening of those shared diagnostics is outside this feature's scope.

Telemetry is not required merely because a code path exists. Retain/add only a
privacy-safe event with a concrete product question, such as whether onboarding
settles as created, uncertain, cancelled, or failed. Payloads use controlled
booleans, enums, counts, durations, and result categories only. Remove
unreachable cleanup/recovery fields and duplicate events with no product use.

## Testing Strategy

Focused tests must prove:

- site registration is account-only, canonical-origin-bound, access-token auth,
  and not managed/New API-family behavior;
- `/api/v1/key` requires `is_management_key === true`, accepts a valid
  Management Key, and rejects runtime keys/malformed data with typed behavior;
- `/api/v1/credits` derives `total_credits - total_usage`, preserves a negative
  result, rejects missing/non-number/non-finite/malformed operands, converts
  quota once, and reports every today-stat group unavailable;
- account-data and account-refresh seams remain registered and preserve success,
  failure, and health behavior;
- manual identity resolution prefers edited user ID, then validated
  `creator_user_id`, then stable local fallback, while username and ID stay
  editable;
- Clerk bridge correlation/origin/path/payload bounds remain, an empty early
  read is retried at most once after successful creation, and Clerk never gates
  create/validate/save;
- one request dispatches at most one create click and settles once across
  cancellation, `not_dispatched`, `dispatched_unconfirmed`, and `created`;
- a created secret remains current-dialog-only, exact-key save is silent, and
  abandon/re-detect/switch/save-different-key emits one label reminder;
- generic completion/bootstrap and temp-window types contain no OpenRouter
  provisioning lifecycle;
- one best-effort browser removal occurs and no DOM Close click follows secret
  capture;
- OpenRouter exact-key dedupe is secret-free while ordinary origin-plus-user-ID
  grouping and identity display remain unchanged;
- generic plaintext backup/export warning and ordinary non-OpenRouter logging
  remain unchanged; and
- any retained telemetry is privacy-safe.

Run focused Vitest before and after every executable task. Stage only that
task's files, run `pnpm run validate:staged` against the staged task diff, then
commit. Tasks that move imports/contracts also run `pnpm compile` before their
commit. Run `validate:push`, the full branch diff inspection, deterministic
Chromium E2E, and Firefox MV2 build at the final integration gate.

## Browser Evidence

Keep one deterministic Chromium OpenRouter scenario because the risk crosses
Account Dialog, background, content, temporary context, MAIN-world Clerk bridge,
and persistence. Keep the Firefox MV2 production build because script injection
and extension output are browser/build sensitive.

These checks do not prove a live OpenRouter session, current DOM selectors, or
upstream response behavior. A real signed-in smoke test is separate evidence
and must be reported separately if performed.

## Maintainability Decision

Keep generic seams only where multiple adapters or site types use the same
contract: detected completion, non-mutating bootstrap, account data/refresh,
temporary context, and account dedupe. Provider transport, page action,
credential validation, Clerk reconciliation, dialog recovery, and copy remain
OpenRouter-local until another proven consumer justifies extraction.

## Acceptance Criteria

- A valid Management Key can be manually pasted, strictly validated, saved in
  `account_info.access_token`, and refreshed through the Credits API.
- A runtime key cannot be saved as the account Management Key.
- Remaining quota is the finite signed `total_credits - total_usage`; negative
  values remain negative, malformed values fail, and today stats are
  unavailable rather than zero.
- Username/user ID are editable and save with the approved fallback order.
- Explicit auto-detect can attempt one bounded page creation; passive detection
  never mutates remote state.
- Creation certainty, cancellation, late results, and single settlement remain
  accurate without automatic mutation retry.
- A created plaintext key never crosses Account dialogs; exact save is silent,
  while abandon/replace paths show one recognizable-label reminder.
- No code attempts or promises remote Management Key deletion.
- OpenRouter uses provider-local transport and the ordinary one-removal
  temporary-context lifecycle.
- OpenRouter exact-key dedupe does not change ordinary site grouping or displayed
  user IDs.
- Account-data/account-refresh capabilities and generic plaintext backup warning
  remain intact.
- Deterministic Chromium and Firefox build evidence are reported separately from
  the unproven live DOM flow.
