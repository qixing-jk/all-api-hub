# Requesty semantics audit

Status: ready-for-human

Investigated 2026-10-25 against task baseline `9fe67cee0` in temp4.
Scope: compare the existing Requesty balance, key management, pricing and account
integration with official contracts; repair confirmed semantic mismatches.
Existing Requesty account-only site type, dedicated adapter, organization identity
and console/management/inference origin boundaries are retained.

## Contract evidence and decisions

- [Get Organization](https://docs.requesty.ai/api-reference/endpoint/manage-org-get)
  exposes the organization's balance. The existing integration's retained contract
  records decimal USD, sometimes encoded as a string. It provides no separate
  permanent, timed or subscription allowance. Use canonical monetary quota and
  discard the old native allowance projection, including on stored-account reads.
  Do not change shared native-allowance eligibility for other providers.
- [Create API Key](https://docs.requesty.ai/api-reference/endpoint/manage-apikey/manage-api-key-create)
  documents name, monthly limit and permissions, and a one-time plaintext response.
  Expiry is a [separate update](https://docs.requesty.ai/api-reference/endpoint/manage-apikey/manage-api-key-update-expiry).
  The existing creation command exposed expiry but discarded it before dispatch.
  Offer expiry only in the implemented edit workflow, avoiding a hidden additional
  write after creating a credential whose secret is returned only once.
- [Get API Key](https://docs.requesty.ai/api-reference/endpoint/manage-apikey/manage-api-key-get)
  distinguishes monthly limit from monthly spend and management permission from
  completions permission. Present the limit as a monthly cap, require explicit
  completions write permission for inference eligibility, and retain the existing
  policy excluding management keys from inference export. Expiry determines status.
- Unavailable or malformed inventory is different from an empty inventory; an
  authentication/permission/service error is different from a missing key. Preserve
  those distinctions through the existing resource failure mapper.
- A successful mutation followed by a failed readback, or a later failed write in
  the same edit, cannot establish that the edit was unapplied. Preserve uncertainty
  through the existing editor mechanism that prevents blind replay.
- Public model prices remain provider-wide USD per token. Null, absent and blank
  prices are unavailable, while explicit numeric zero remains free. An absent or
  negative optional cache quote must not invent free caching or reject valid
  primary prices.

Official HTML references were retrieved in this task. Direct Markdown retrieval
returned 403 and was not treated as contract evidence. No authenticated Requesty
API or console operation was performed: `REQUESTY_MANAGE_KEY` was not configured.
The previous adaptation spec reports historical authenticated checks, but these
are not claimed as new live acceptance.

## Acceptance

| Outcome | Before | After / automated evidence |
| --- | --- | --- |
| Organization USD balance | Permanent allowance, excluded from totals/history | Standard monetary balance; API, refresh, normalization and aggregate tests |
| Existing stored Requesty account | Incorrect allowance projection persisted | Projection removed on normalization; quota retained without mutating input |
| Balance UI | Allowance details with unrelated scoped-credit warning | `$12.50` and no allowance-details action; Chromium fixture workflow |
| Monthly key cap | Shown as remaining quota | Explicit monthly limit (USD); adapter, presentation and browser assertions |
| Key expiry creation | Accepted then silently discarded | No create control; expiry editing retained and covered by existing API tests |
| Inference eligibility | Management permission alone determined eligibility | Explicit completions write required; unknown/missing permission is not a grant |
| Expired key | Enabled | Expired; adapter regression |
| Inventory/detail errors | Empty list or not-found | Invalid inventory rejected; 401/403/404/500 retain their failure categories |
| Partially applied edit | May be marked unapplied and retried | Readback failure/later rejection yields mutation-state-uncertain |
| Missing primary price | Free quote or whole catalog failure | Model retained with unavailable pricing; null/blank/absent regressions |

Validation executed:

- Related Vitest run: 13 files / 499 tests passed, including Requesty API/adapters,
  account normalization/storage/refresh, balance history, income estimates,
  key presentation and BalanceDisplay. Subsequently added monthly-window
  presentation assertion passed with all 33 presentation tests. The added
  aggregate assertion passed at the account-normalization boundary.
- `pnpm run compile`: passed before the final documentation-only handoff.
- `pnpm exec playwright test e2e/requestyAccountSemantics.spec.ts --project=chromium --workers=1`:
  build setup plus browser workflow passed against the final application changes.
- Failing behavior tests were run before each corresponding implementation repair.
- Final commit hooks provide staged lint, affected test and i18n extraction checks.

## Limits and retained artifacts

- Today's usage remains explicitly unsupported: organization usage day-boundary
  semantics have not been verified. No artificial zero-spend success was added.
- Group/access-list model restrictions, group-bound key creation and authenticated
  organization variants remain outside the verified contract of this repair.
  Do not advertise personalized model access from the public catalog. Revisit with
  authenticated samples for the relevant organization before extending support.
- No genuine pre-change screenshot was captured. Final screenshots establish
  after-only visual evidence, not a before/after comparison. Manually inspected
  final account row and create-key dialog; rendering was clear and aligned.
- Keep `artifacts/e2e.log`, `artifacts/requesty-balance.png` and
  `artifacts/requesty-create-key.png` locally for developer review. Fixtures contain
  no real credentials. Reusable browser coverage lives in
  `e2e/requestyAccountSemantics.spec.ts`.
- Public catalog support entries and names are unchanged, so no catalog or
  translated documentation updates are necessary. Existing locale keys are reused.
- No new durable agent instruction qualifies: existing integration guidance already
  requires preserving authoritative units, permissions and uncertainty semantics.

## Scout follow-ups (2026-10-25)

Branch-wide refactor review used main/merge-base `f1b7e79fb2107762e8f2f72c2dd860ce0e5f4781`
and pre-refactor head `34e9334ac`. These are behavior repairs, separate from the
behavior-preserving reuse changes:

- `scripts/suites/requesty/ui.mjs`, `runDetectionStage`: every detected key name
  is added to `autoCreatedKeyNames`, including a key reused from a saved account.
  The cleanup loop then deletes those names. Before running this live suite,
  establish test ownership independently of successful onboarding and restrict
  revocation to newly created, test-owned resources. Add a regression proving an
  existing account credential survives the entire suite.
- `src/entrypoints/content/messageHandlers/requesty/managementKeyBridge.ts`,
  `createRequestyManagementKeyInPage`: a failed or unreadable POST response returns
  `CreateRejected`; the content handler maps all negative bridge responses to
  `NotDispatched`. A POST may have reached the provider. Characterize a transport
  failure after dispatch and preserve uncertainty across the bridge before
  offering any retry. The current refactor preserves this behavior.
- `scripts/suites/requesty/ui.mjs`, `submitNativeEditor`: fixed waits and repeated
  submit clicks need a separate acceptance repair with observable readiness and
  readback, including a slow acknowledged mutation. Do not treat successful
  retries as proof of at-most-once creation.

No authenticated live suite ran during the refactor because its cleanup does not
yet establish credential ownership. Keep the ignored `artifacts/scout-report.md`
and `artifacts/scout-tests.log` locally for the refactor audit and validation;
pre-existing scratch evidence remains untouched.
