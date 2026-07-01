# Browser Bookmark Account Import Design

Date: 2026-06-23

## Purpose

Implement issue #941 by letting users batch add account sites from their
browser's native bookmarks.

The feature should reduce repeated manual account setup while preserving the
current Account Management rules for site detection, account normalization,
duplicate handling, permissions, telemetry privacy, and validation.

## Current Context

The repository already has two related but distinct concepts:

- App-owned site bookmarks, stored with the account configuration and surfaced
  through Bookmark Management.
- Browser-native bookmarks, exposed by the WebExtension `bookmarks` API.

Issue #941 requests importing account sites from browser-native bookmark URLs,
not importing the app-owned site bookmarks.

Relevant current surfaces:

- `src/features/AccountManagement/AccountManagement.tsx` owns the Account
  Management header actions and already opens batch-like dialogs such as the
  duplicate-account scan.
- `src/features/AccountManagement/components/DedupeAccountsDialog/` is the
  closest existing review/confirm/result UI pattern.
- `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
  runs the single-account auto-detect and save flow.
- `src/services/accounts/accountOperations.ts` exposes `autoDetectAccount(...)`
  and `validateAndSaveAccount(...)`, which should remain the canonical
  detection and persistence path for imported accounts.
- `src/services/permissions/permissionManager.ts` reads optional permissions
  from the manifest and exposes request/status helpers.
- `src/utils/browser/browserApi.ts` wraps browser APIs and permission helpers.
- `wxt.config.ts` currently declares no `bookmarks` permission.

Official browser documentation for the native bookmarks API requires the
`bookmarks` permission:

- Chrome: https://developer.chrome.com/docs/extensions/reference/api/bookmarks
- MDN: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks

## Problem

Users with many API aggregator sites saved in browser bookmarks currently need
to add accounts one by one. This creates unnecessary repeated work when the
extension could discover candidate site URLs from bookmarks and run the
existing account detection flow.

The feature has several risks:

1. Native bookmark access is sensitive and should not become a baseline
   required permission.
2. Bookmark URLs identify sites, not authenticated users. Importing all matching
   origins blindly can create accidental duplicate accounts.
3. The importer must not create a parallel account format or bypass existing
   site-type detection and account normalization rules.
4. Bookmark data must not leak through telemetry, logs, tests, or stored
   metadata.
5. The existing app-owned Site Bookmarks feature must not be confused with the
   browser-native bookmark import.

## Goals

- Add an Account Management action to import accounts from browser-native
  bookmarks.
- Request the `bookmarks` permission only when the user starts the import flow.
- Scan native bookmarks after permission is granted.
- Build a reviewable candidate list from bookmark URLs.
- Select non-duplicate candidates by default.
- Skip existing-origin duplicates by default while exposing an explicit
  "include existing sites" override.
- Import selected candidates sequentially through existing
  `autoDetectAccount(...)` and `validateAndSaveAccount(...)` behavior.
- Show permission, scanning, review, importing, and result states.
- Keep failures recoverable by letting users retry or open a failed URL in the
  normal Add Account flow.
- Add privacy-safe telemetry using counts, statuses, and categories only.
- Cover the feature with focused unit/component tests and repo validation.

## Non-Goals

- Do not make `bookmarks` a required manifest permission.
- Do not read browser bookmarks before the user explicitly starts this import.
- Do not store browser bookmark data unless the user imports the resulting
  account.
- Do not store raw bookmark titles, hosts, URLs, paths, account identifiers, or
  backend messages in telemetry.
- Do not create disabled placeholder accounts for failed detections.
- Do not run the first version as a background-worker job.
- Do not change the existing app-owned Site Bookmarks feature.
- Do not redesign Account Dialog, account storage, site detection, or adapter
  contracts beyond what this feature needs.
- Do not add Playwright E2E coverage unless the implementation reveals a real
  browser-extension behavior gap that lower-level tests cannot cover.

## Design

### 1. Optional Bookmark Permission

Add `bookmarks` to the manifest optional permissions.

Update the optional-permission plumbing so the new permission has complete
support everywhere optional permissions are shown or searched:

- `OPTIONAL_PERMISSION_IDS`
- permission title and description copy
- Permission Settings list
- permission settings search definitions
- onboarding/update surfaces that render optional permission definitions
- focused permission tests

The import dialog should use the existing permission manager helpers. The
default flow is:

1. Check whether `bookmarks` is granted.
2. If not granted, show a permission-needed state inside the import dialog.
3. Request `bookmarks` only when the user clicks the dialog action to scan.
4. If denied or unavailable, keep the dialog open with a recoverable message.

### 2. Browser Bookmarks API Wrapper

Add a narrow wrapper in `src/utils/browser/browserApi.ts` instead of calling
`browser.bookmarks` directly from UI code.

The wrapper should support:

- checking whether the native bookmarks API exists
- reading the full bookmark tree through `bookmarks.getTree()`
- returning an empty or classified failure result when the API is unavailable
  or throws

The wrapper should not transform bookmarks into account candidates. It only
adapts the browser API boundary.

### 3. Candidate Builder

Create a service or utility under Account Management or accounts services that
turns native bookmark tree nodes into import candidates.

Responsibilities:

- Flatten bookmark tree nodes.
- Ignore folders.
- Keep only `http:` and `https:` URLs.
- Safely reject malformed URLs.
- Normalize candidate site URLs using the same account-site URL/origin helpers
  used for account duplicate checks.
- Collapse repeated bookmarks that normalize to the same site origin.
- Compare candidates with existing accounts by normalized site origin.
- Classify candidates as:
  - `ready`
  - `duplicate`
  - `invalid`
  - `unsupported` or `unknown` when the candidate cannot be imported yet

Use reserved example domains such as `example.invalid` in tests and examples.
Do not use real service names or real bookmark URLs in fixtures.

### 4. Account Management Import Dialog

Add a new dialog launched from a secondary Account Management header button,
for example "Import from bookmarks".

The dialog follows a DedupeAccountsDialog-style workflow:

- `permission-needed`: explain the permission and offer "Allow and scan".
- `scanning`: read and classify bookmarks.
- `review`: show selected candidates, duplicate-skipped candidates, and ignored
  counts.
- `importing`: disable close and controls while sequential imports run.
- `results`: show success, skipped, and failed counts with safe local failure
  summaries.

Default review behavior:

- Select non-duplicate candidates.
- Skip duplicate origins.
- Expose an "include existing sites" checkbox to make duplicate candidates
  selectable.
- Do not create partial accounts for failed rows.
- Offer failed rows a way to open the existing Add Account dialog with the URL
  prefilled.

The UI should reuse existing components, spacing, modal patterns, test IDs, and
translation conventions.

### 5. Sequential Import Pipeline

Run imports sequentially from the options page for v1.

For each selected candidate:

1. Call `autoDetectAccount(candidate.url, AuthTypeEnum.AccessToken)`.
2. If detection fails, record a failed row and continue.
3. If detection succeeds, call `validateAndSaveAccount(...)` with the detected
   values, default notes/tags/manual-balance fields, and
   `{ deferDataRefresh: true }`.
4. If saving succeeds, record the new account id and continue.
5. If saving fails, record a failed row and continue.

Sequential processing is intentional. It avoids surprising concurrent
authentication, browser-context, and rate-limit behavior while still providing
a batch user experience.

After import completes, reload Account Management data through the existing
context.

### 6. Duplicate Policy

Bookmark URLs only prove that a site is bookmarked; they do not prove which user
account should be saved for that site. Because this extension supports
multi-account use cases on the same origin, duplicates should not be hidden
permanently.

Default policy:

- Existing-origin candidates are skipped and grouped as duplicates.
- Users can enable "include existing sites" to select duplicate candidates.
- Batch import should not show the single-account duplicate warning dialog for
  each row. The review state is the batch duplicate confirmation.

### 7. Failure Handling

The dialog should keep failures local and recoverable.

Handle at least these cases:

- `bookmarks` permission denied
- native bookmarks API unavailable
- bookmark tree read failure
- empty bookmark tree
- no valid web URL candidates
- all candidates are duplicates
- malformed URL
- auto-detect failure
- save failure
- account data reload failure after import

Failure rows should show local error summaries. Backend messages should not be
used directly when they are empty, unstable, or unsuitable for user display.

### 8. Telemetry Decision

Telemetry decision: add action telemetry.

Add a privacy-safe Account Management action for the bookmark import flow. It
should record only controlled fields such as:

- scan candidate count
- selected count
- duplicate count
- ignored/invalid count
- success count
- failure count
- skipped count
- result status
- coarse failure stage/category

It must not record:

- bookmark URLs
- hosts or origins
- paths
- bookmark titles
- account ids
- usernames
- API keys or tokens
- cookies
- backend messages
- raw errors or stack traces

Update typed event payloads, sanitizer/allow-list behavior, and focused tests
with the telemetry change.

### 9. Settings Search Decision

Settings search decision: update permission search.

Adding optional `bookmarks` permission changes the Permissions settings UI, so
the permission search definitions should include a bookmarks permission control
with stable target id, localized title/description, and relevant keywords.

No Account Management deep link is required for the import dialog in v1 unless
the implementation adds a stable route or anchor for it.

### 10. E2E Decision

E2E decision: lower-level tests by default.

Use Vitest and React Testing Library for the core v1 risk:

- browser API wrapper behavior
- permission request outcomes
- candidate classification
- review and import UI states
- sequential success/failure handling
- telemetry sanitization

Add Playwright E2E only if the implementation can deterministically exercise
real extension bookmark permission/bookmark API behavior in the existing test
harness. If not, document that browser API mocks provide better deterministic
coverage for this slice.

## Testing Strategy

Focused tests should cover:

- Browser API wrapper:
  - bookmarks API available
  - bookmarks API unavailable
  - `getTree()` failure
- Permission manager/settings/search:
  - `bookmarks` appears as an optional permission
  - Permission Settings can request and revoke it
  - Permission search can find it
  - onboarding/update surfaces render without missing switch cases
- Candidate builder:
  - ignores folders
  - ignores non-web URLs
  - rejects malformed URLs
  - dedupes by normalized origin
  - classifies existing-origin duplicates
  - uses placeholder domains in tests
- Import dialog/controller:
  - permission denied
  - empty bookmark tree
  - no valid candidates
  - default candidate selection
  - duplicate override
  - sequential import progress
  - mixed success/failure result summary
  - failed row opens Add Account with prefilled URL
  - Account Management data reload after completion
- Analytics:
  - start/complete events use the new action id
  - only counts/status categories are emitted
  - URLs, titles, hosts, account ids, raw errors, and backend messages are not
    emitted

## Validation Plan

Focused validation should start with related tests for the implementation files.
At minimum, run the tests added or updated for these areas:

- browser bookmarks API wrapper
- optional permission settings/search/onboarding
- bookmark import candidate builder
- Account Management import dialog/controller
- bookmark import telemetry sanitization

Commit gate:

```powershell
pnpm run validate:staged
```

Pre-push / PR gate:

```powershell
pnpm run validate:push
```

Run `validate:push` before publishing because this slice changes manifest
permissions, optional-permission UI, browser API wrappers, telemetry contracts,
and account import behavior.

## Rollout

1. Add optional `bookmarks` permission plumbing and tests.
2. Add browser bookmarks API wrapper and tests.
3. Add candidate builder and tests.
4. Add import dialog/controller tests for permission, scan, review, duplicate,
   import, and result states.
5. Implement Account Management header button and dialog.
6. Add privacy-safe telemetry event definitions, sanitizer coverage, and tests.
7. Run focused tests, `validate:staged`, and `validate:push`.
8. Inspect the final diff for leaked bookmark data, unrelated app-owned
   bookmark changes, broad refactors, and placeholder-domain violations.

## Follow-Up, Not In Scope For This Spec

- Background-worker import that can continue if the options page closes.
- User-configurable bookmark folder selection.
- Site-type preclassification before auto-detect.
- Import history.
- E2E coverage for real browser bookmark trees if the test harness gains stable
  support for native bookmarks permission and fixture bookmarks.
