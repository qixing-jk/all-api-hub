# Account Today Statistics Availability Design

Date: 2026-07-17

## Purpose

Represent whether an account actually provides current daily-window requests,
tokens, consumption, and income, instead of forcing unsupported data into
numeric zero placeholders that downstream consumers present as real
measurements.

“Today” is a product-level daily-usage concept, not a requirement that every
backend use the browser's midnight boundary. A producer-defined calendar day,
server-timezone day, or explicitly documented recent 24-hour window qualifies
when users would reasonably understand it as current daily usage. Lifetime,
subscription-period, longer rolling-window, and unbounded totals do not.

This is a generic prerequisite for the OpenRouter account adapter. OpenRouter
Credits exposes account balance, while Activity excludes the current UTC day.
The same contract also protects future site types whose dashboard metrics are
rolling-window, lifetime, delayed, or partially unavailable.

## Problem

The canonical account model currently requires numeric today fields:

```ts
today_quota_consumption: number
today_prompt_tokens: number
today_completion_tokens: number
today_requests_count: number
today_income: number
```

Missing values normalize to zero. That zero flows through:

- saved account data and display projections;
- account sorting;
- account list and popup totals;
- Options Overview status cards;
- daily balance-history snapshots;
- today-income estimates; and
- per-account and overview sharing.

For a site that cannot supply current-day data, zero means “unknown” in
storage but “measured zero” in the UI. Fixing only the account card would leave
aggregate totals, history, estimates, and shared snapshots incorrect.

## Goals

- Add backward-compatible per-account completeness metadata for current
  daily-window consumption, requests, tokens, and income.
- Require every existing account-data producer to classify the values it
  returns after refresh.
- Preserve legacy numeric values in storage while treating them as
  unavailable/unclassified until a successful producer refresh.
- Keep balance/quota independent from today-statistics availability.
- Never add unavailable compatibility zeros or wrong-period values to
  aggregate totals.
- Make mixed aggregates explicitly partial rather than silently complete.
- Keep accounts without the selected metric last when sorting.
- Preserve valid quota history while storing unavailable cashflow as null.
- Prevent income estimation from treating unavailable cashflow as zero.
- Exclude unavailable today data from shared snapshots.
- Keep raw availability and metrics out of product analytics.

## Non-Goals

- Do not redesign lifetime, rolling-window, subscription, or recent-usage
  models.
- Do not make the five numeric fields optional; completeness metadata is the
  authoritative interpretation boundary.
- Do not split prompt-token and completion-token completeness unless a real
  producer later proves they can differ.
- Do not infer availability from numeric values.
- Do not change balance aggregation or clamp negative balances.
- Do not migrate Usage History, which is log-derived and independent.
- Do not change API Credential Profile telemetry or export.
- Do not add a new user setting.

## Approaches Considered

### Approach A: Let Each Adapter Use Zero

This preserves current types but makes unsupported data indistinguishable from
a real zero. It is rejected.

### Approach B: Make Every Today Field Optional

This permits partial payloads, but it spreads optional checks through every
consumer and still cannot distinguish unsupported, deliberately not collected,
failed, wrong-period, partial, and measured zero. Existing producers already
have those distinct states. It is rejected.

### Approach C: Add Metric-Group Completeness And Aggregate Coverage

Keep numeric compatibility fields while adding explicit state for consumption,
requests, tokens, and income. Aggregate helpers consume those states and return
coverage alongside sums. This is recommended because it represents existing
partial producers without creating undefined optional-field combinations.

## Canonical Contracts

Add shared constants and types:

```ts
export const ACCOUNT_TODAY_METRIC_STATUSES = {
  Complete: "complete",
  Partial: "partial",
  Unavailable: "unavailable",
} as const

export const ACCOUNT_TODAY_METRIC_REASONS = {
  LegacyUnclassified: "legacy_unclassified",
  NotCollected: "not_collected",
  Unsupported: "unsupported",
  WrongPeriod: "wrong_period",
  RequestFailed: "request_failed",
  InvalidPayload: "invalid_payload",
  SourcePartial: "source_partial",
  PageLimit: "page_limit",
} as const

export type AccountTodayMetricStatus =
  (typeof ACCOUNT_TODAY_METRIC_STATUSES)[keyof typeof ACCOUNT_TODAY_METRIC_STATUSES]

export type AccountTodayMetricReason =
  (typeof ACCOUNT_TODAY_METRIC_REASONS)[keyof typeof ACCOUNT_TODAY_METRIC_REASONS]

export type AccountTodayMetricAvailability = {
  status: AccountTodayMetricStatus
  reason?: AccountTodayMetricReason
}

export type AccountTodayStatsAvailability = {
  consumption: AccountTodayMetricAvailability
  requests: AccountTodayMetricAvailability
  tokens: AccountTodayMetricAvailability
  income: AccountTodayMetricAvailability
}
```

The validity matrix is strict:

- complete has no reason;
- partial requires `source_partial`, `page_limit`, or `request_failed`, and only
  when some valid current daily-window source/page contributed;
- unavailable uses `not_collected`, `unsupported`, `wrong_period`,
  `request_failed` before contribution, `invalid_payload`, or
  `legacy_unclassified`.

Normalization drops an unexpected reason from complete state. Invalid or
unknown state/reason combinations fail closed to
unavailable/legacy-unclassified.

Add optional `todayStatsAvailability` to adapter `AccountData` and persisted
`AccountInfo` so existing adapters and backups remain valid. Add required
normalized availability to `DisplaySiteData`.

Legacy missing values normalize to unavailable with reason
`legacy_unclassified`. Numeric values remain stored for compatibility but do
not render, sort, aggregate, enter history, or enter sharing until the first
successful refresh. Every current producer must return explicit per-group
state. A successful refresh therefore corrects existing accounts; a failed
refresh preserves the previous state.

Add a product-profile metric default used only before the first successful
refresh:

```ts
metrics: {
  deferredTodayStatsAvailability: AccountTodayStatsAvailability
  legacyTodayStatsAvailability: AccountTodayStatsAvailability
}
```

Existing profiles default both values to unavailable/legacy-unclassified.
Profiles with known wrong-period legacy mappings override the legacy value so
those persisted numbers stop contributing immediately; AIHubMix must do so.
Profiles with known unsupported metrics, including OpenRouter, override the
deferred value. Refreshed `AccountData` remains the runtime source of truth.

Extend aggregate account stats with coverage metadata:

```ts
type AccountMetricCoverage = {
  status: "complete" | "partial" | "unavailable"
  completeCount: number
  partialCount: number
  eligibleCount: number
}
```

Return separate coverage for consumption, requests, tokens, and income. Income
keeps its separate eligibility rule through `excludeFromTodayIncome`.

## Deterministic Semantics

### Per-Account Values

Interpret each metric group independently:

- `complete`: render the numeric value normally;
- `partial`: render the numeric best-effort value with a localized partial
  indicator; and
- `unavailable`: keep the compatibility number storage-only, then render a
  visible refresh action/status for `legacy_unclassified` or a muted `—` with
  an accessible explanation for non-actionable reasons.

The `tokens` state applies to both prompt and completion counts. Balance/quota
remains valid regardless of every today metric state.

Sorting by consumption or income places unavailable values last in both
directions. Partial and complete values sort numerically, with complete before
partial on equal values.

### Aggregate Values

Usage eligibility is every enabled account. Income eligibility is every
enabled account not excluded from today income.

For each metric group:

- sum complete and partial account values;
- exclude unavailable compatibility values;
- if every eligible value is complete, coverage is `complete`;
- if at least one value contributes but any contributor is partial or any
  eligible account is unavailable, coverage is `partial`; and
- if no eligible value contributes, coverage is `unavailable`.

Complete coverage renders the normal number. Partial coverage renders the
best-effort numeric total plus localized
`complete + partial contributors / eligible` coverage. No coverage renders
`—`.

An empty eligible set is `unavailable`, not a measured zero.

Balance totals do not use today-statistics coverage and continue to include
valid negative balances.

### History And Estimates

Daily history always captures quota. Persist consumption and income only when
their group is complete. Persist null for partial or unavailable groups so
history consumers never mistake a best-effort snapshot for a complete value.

Today-income estimation requires complete consumption because the formula uses
balance movement plus today consumption. Unsupported income does not block the
estimate: income completeness controls only `reportedTodayIncome` and
compensation/comparison output. Partial/unavailable reported income is omitted.

Debug snapshot seeding follows the same independent rules: quota is always
eligible, consumption is present only when complete, and income is present only
when complete.

### Sharing

The current share payload treats consumption, income, and net as one cashflow
bundle and converts missing members to zero. Therefore per-account sharing
includes today cashflow only when both consumption and income are complete.
Otherwise it omits the entire cashflow bundle.

Overview sharing includes today fields only when coverage is complete. Partial
totals are not silently published without coverage metadata; the conservative
first slice exports balance-only instead.

`usageDataPresent` describes actual today-data inclusion, not merely the user
preference to include it.

### Import And Export

Full account backup/import preserves the optional availability object
naturally. Old backups normalize each group to unavailable with reason
`legacy_unclassified`; one successful refresh replaces it with producer-owned
states. No destructive rewrite is required.

This availability field contains no secret and requires no special backup
redaction.

## Existing Producer Audit And Required Migration

The audit covers all 17 registered Account Site Types. The three managed-only
types have no `AccountDataCapability` and are outside this migration.

| Producer | Registered site types | Verified current behavior | Required refreshed state |
| --- | --- | --- | --- |
| New API-family default | `one-api`, `new-api`, `one-hub`, `v-api`, old `VoAPI`, `Super-API`, `Rix-Api`, `neo-Api`, `unknown` | The normal `/api/log/self/stat` path returns only local-day consumption; requests and tokens are literal zero. Full-log fallback can populate consumption, requests, and tokens. Income is a separate Topup + System log aggregation. | Emit group state from the path actually used. Never mark request/token zeros complete after stat success. |
| New API-family overrides | `anyrouter`, `Veloera`, `done-hub`, `wong-gongyi` | They inherit the same semantics; DoneHub changes query and response field names. Some compatible deployment contracts remain unverified. | Use the same dynamic state and retain backend-specific query dialects. |
| Sub2API | `sub2api` | `/api/v1/usage/stats?period=today` provides consumption, requests, and both token totals for the server-configured calendar day. Income is unsupported. Usage-request failure currently becomes healthy zero data. | Successful usage groups are complete; income is unavailable/unsupported. Skip and failure states are explicit. |
| AIHubMix | `AIHubMix` | The official client defines `/api/user/self.used_quota` as account-cumulative usage and `request_count` as a total request count. The current adapter mislabels cumulative `used_quota` as today consumption; its other today values are literal zero. | All today groups are unavailable. Stop copying cumulative `used_quota` into today consumption. |
| SharedChat | `sharedchat` | The production dashboard renders `currentUsage` as “24-Hour Statistics”, separately from subscription-period accounting. Its `totalCost`, `totalRequests`, and aggregate `totalTokens` are copied into today fields; aggregate tokens are currently placed entirely in the completion-token field, while prompt tokens and income are literal zero. | Finite consumption and requests are complete. Finite aggregate tokens are partial/source-partial because the source does not split prompt and completion tokens. Income is unavailable/unsupported. Preserve `AccountUsageSummary.scope` as `rolling_window`. |
| VoAPI v2 | `voapi-v2` | `/api/dash/statistics` is requested for a browser-local day and provides consumption plus requests. Tokens and income are literal zero. Statistics failure is swallowed. | Consumption and requests are complete on success; tokens/income are unavailable. Skip/failure states are explicit. |

Verification references:

- AIHubMix documents `request_count` as the total request count and defines
  account `used_quota` as cumulative in its official client:
  <https://docs.aihubmix.com/en/api/CliEndpoints/get-self#param-request-count>
  and
  <https://github.com/AIhubmix/platfrom-cli/blob/6cab071384acc7fd83710bb44166a8d2ca58a4f6/internal/models/types.go#L12-L24>.
- SharedChat's production dashboard binds `currentUsage` to the section whose
  locale key renders as “24-Hour Statistics”:
  <https://new.sharedchat.cc/list/assets/VnJ-h0ud.js> and
  <https://new.sharedchat.cc/list/assets/NHzk7--6.js>.

### New API-Family Migration Rules

- Freeze one browser-local start/end range once per refresh and pass it to all
  stat and log queries. A refresh crossing midnight must not mix two days.
- A finite stat response marks consumption complete and requests/tokens
  unavailable/unsupported because that endpoint does not return those totals.
- A malformed or non-finite stat payload is an invalid-payload failure and
  triggers the full-log fallback instead of producing a complete zero.
- A full-log fallback may mark consumption, requests, and tokens complete only
  if all requested pages succeed within the page cap.
- A failed page after at least one successfully covered page yields
  partial/source-partial. Failure before any page is covered yields
  unavailable/request-failed. The maximum-page cap yields partial/page-limit.
- Income is complete only when both Topup and System log queries complete.
  One successfully covered type with another failure is
  partial/source-partial; neither type covered is unavailable/request-failed.
- Coverage is determined by successful source/page completion, never by row
  count or numeric value. A successful empty usage query is complete zero; two
  successful empty income queries are complete zero; one successful empty
  income query plus one failure is partial zero.
- `includeTodayCashflow === false` marks otherwise collectable groups
  unavailable/not-collected and performs no today queries. Permanently
  unsupported or wrong-period groups retain their more specific reason.
- `today_requests_count` remains a consume-log-row count. Code comments and UI
  must not call it a stronger upstream request-total contract.

### Dedicated Adapter Migration Rules

- Sub2API preserves the upstream server-timezone `period=today` semantics in a
  code comment. On a complete payload, consumption, requests, and tokens are
  complete while income is unavailable/unsupported. Request failure makes the
  three usage groups unavailable/request-failed. With an HTTP-success partial
  payload, validate each group independently: a missing/invalid single-field
  group is unavailable/invalid-payload; one valid and one invalid token field
  yields partial/source-partial. Its usage failure no longer becomes a trusted
  measured zero.
- AIHubMix removes cumulative `used_quota` from today consumption. Consumption
  and requests are unavailable/wrong-period because `/api/user/self` exposes
  cumulative rather than daily counters; tokens and income are
  unavailable/unsupported. Do not fabricate a complete lifetime summary when
  request/token totals are absent.
- SharedChat treats its documented 24-hour `currentUsage` as current daily
  usage. Finite consumption and request totals are complete. A finite
  `totalTokens` value contributes as partial/source-partial because the source
  provides only an aggregate token count; the compatibility fields may retain
  that aggregate without claiming a verified prompt/completion split. Missing
  or invalid source fields are unavailable/invalid-payload, and income is
  unavailable/unsupported. Preserve the richer summary as
  `scope: "rolling_window"` so consumers can still distinguish its boundary
  from a calendar day.
- VoAPI v2 freezes one browser-local range, validates finite statistics, and
  records statistics failure separately from healthy balance retrieval.
- Every producer handles `includeTodayCashflow === false` as
  unavailable/not-collected only for groups it could otherwise collect;
  unsupported/wrong-period groups retain those reasons.

### Registry And Conformance Gate

Add a registry-driven test that enumerates every Account Site Type and proves
that every successful AccountData-producing path returns a normalized
availability object: both manual `account.data.fetchData` and saved-account
`account.refresh.refreshAccount`. Add focused producer tests for the exact
state/value combinations above. The migration is incomplete if any successful
producer path relies on the legacy normalizer after refresh.

## Production Surface

### Contract, Defaults, Persistence, And Projection

Update:

- `src/services/accounts/accountDataModel.ts`
  - add optional adapter availability to `AccountData`;
- `src/types/index.ts`
  - add optional persisted availability to `AccountInfo`;
  - add required availability to `DisplaySiteData`;
  - add aggregate coverage to `AccountStats`;
- `src/services/accounts/accountDefaults.ts`
  - normalize malformed explicit values and provide the generic
    unavailable/legacy-unclassified fallback;
- `src/services/accounts/accountOperations.ts`
  - copy availability from fetched data;
  - use the product-profile deferred-save availability so a known unsupported
    site does not temporarily appear as zero before its first refresh;
- `src/services/accounts/accountSiteProfile/contracts.ts` and the account-site
  definition registry
  - add the backward-compatible deferred metric default;
- `src/services/accounts/accountStorage.ts`
  - persist refreshed availability;
  - when the persisted field is absent, project the site profile’s legacy
    override (or generic fallback) into display data;
  - aggregate complete/partial values, exclude unavailable placeholders, and
    return per-group coverage;
  - preserve it through existing export/import; and
- `src/hooks/useAccountData.ts` and
  `src/features/AccountManagement/hooks/AccountDataContext.tsx`
  - initialize and propagate coverage-aware account stats.

Do not make storage infer availability from site type. Account product policy
provides the deferred-save value, while refreshed `AccountData` remains the
runtime source of truth.

### Aggregation And Sorting

Update `src/utils/core/formatters.ts` so today consumption and income helpers
return or consume a shared sum-plus-coverage result instead of a bare number.

Update `src/services/preferences/utils/sortingPriority.ts` so unavailable
accounts sort last for consumption and income while preserving the existing
stable tie-breaker.

There are no current numeric today-stat filters, so filtering predicates do not
change.

### Account List And Popup

Update:

- `src/features/AccountManagement/components/AccountList/BalanceDisplay.tsx`;
- `src/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard.tsx`;
- `src/features/AccountManagement/components/AccountList/index.tsx`;
- `src/entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx`;
  and
- `src/entrypoints/popup/components/BalanceSection/TokenStats.tsx`.

Per-account surfaces use status-aware values rather than one placeholder for
every unavailable reason. Aggregate surfaces use complete, partial, or
unavailable coverage semantics. Reuse existing design-system text and tooltip
components for recovery and partial-coverage explanation.

### Options Overview

Update:

- `src/features/OptionsOverview/types.ts`;
- `src/features/OptionsOverview/usageSnapshot.ts`;
- `src/features/OptionsOverview/statusCards.ts`;
- `src/features/OptionsOverview/overviewSelectors.ts`; and
- `src/features/OptionsOverview/components/OverviewUsageSnapshot.tsx`.

Today coverage is independent from seven-day history availability. A valid
seven-day chart must remain visible when current-day metrics are unavailable.

### Daily History And Sharing

Update:

- `src/services/history/dailyBalanceHistory/capture.ts`;
- `src/services/history/dailyBalanceHistory/todayIncomeEstimate.ts`;
- `src/services/history/dailyBalanceHistory/scheduler.ts`;
- `src/features/AccountManagement/components/AccountActionButtons/index.tsx`;
  and
- `src/entrypoints/popup/components/ShareOverviewSnapshotButton.tsx`.

Existing daily-history storage/selectors already support nullable cashflow, but
capture must receive independent consumption/income completeness. The current
share helper converts missing cashflow members to zero and accepts one include
boolean, so sharing uses the conservative rule: include today cashflow only
when both consumption and income are complete. Do not widen the share schema in
this prerequisite.

### User-Facing Copy And Locales

Reuse existing unavailable and coverage copy where its meaning matches. Add
new keys only where Account List, popup, or Options Overview needs a distinct
interactive recovery action, read-only recovery state, partial-coverage
qualifier, or unavailable explanation.

Any new or changed keys under `src/locales/*/account.json` or
`src/locales/*/optionsOverview.json` must be synchronized across every
supported app locale in the same change. Copy should explain complete and
best-effort contributors out of the eligible account count; it must not expose
internal enum or reason names.

Legacy accounts need distinct, directly visible recovery copy. An unavailable
metric with reason `legacy_unclassified` means the saved value predates the
availability contract and needs a refresh before it can be trusted. Do not
render the same bare `—` used for non-actionable unavailable states:

- when the metric has an enabled existing click target that refreshes the
  account, render localized action copy equivalent to `点击刷新`;
- when the current surface cannot initiate the refresh, render localized status
  copy equivalent to `待刷新`; disabled accounts belong to this read-only state
  even when the enabled version of the same metric normally refreshes on click;
  and
- when a valid partial aggregate includes legacy-unclassified contributors,
  retain the numeric value and add a compact visible qualifier equivalent to
  `含待刷新`. This includes derived today-share percentages whose numerator has
  partial legacy coverage.

Tooltips provide the longer recovery explanation. Interactive metrics explain
that clicking refreshes the account and confirms today's statistics. Read-only
surfaces direct the user to the existing account-list refresh action. Reuse the
existing Popup, Account Management, and account-row force-refresh actions; do
not add another button, banner, setting, or automatic network request, and do
not override the user's auto-refresh preferences.

Unsupported and other non-actionable unavailable metrics may continue to use a
muted `—` in dense rows, popup summaries, and repeated metric groups. The dash
must be hidden from assistive technology and accompanied by a localized
tooltip or accessible description that explains the reason. A spacious
standalone card may add one muted visible unavailable label when it improves
clarity, but must not repeat `不支持` beside every adjacent metric. A successful
measured zero always renders `0`, never `—`.

Visible recovery qualifiers must remain readable in compact popup and overview
layouts. Allow the qualifier to wrap or occupy a secondary line rather than
clipping it with single-line truncation. Detailed tooltip text must be exposed
once through the accessible description; do not duplicate the same explanation
inside both `aria-label` and `aria-describedby`.

Clickable recovery, read-only recovery, and partial-aggregate qualification use
separate locale keys; one shared `needsRefresh` key must not serve both action
and status contexts. Action-only keys belong to the `account` namespace because
Options Overview cannot initiate account refresh. Read-only status and aggregate
keys belong to each namespace that renders them. Keep each namespace's key
shape synchronized across `zh-CN`, `zh-TW`, `en`, `ja`, `vi`, and `es-419`;
do not preserve unused cross-namespace keys through extractor configuration or
dummy translation calls.

Aggregate coverage records how many eligible metrics are
`legacy_unclassified`. When no value contributes, that fact selects the visible
read-only recovery state instead of the generic unavailable placeholder. When
coverage is partial, keep the valid numeric value, add the compact visible
recovery qualifier, and include the refresh-needed count in the detailed
complete/partial/eligible tooltip. The count is a domain fact; presentation owns
the recovery wording. Unverified legacy numeric values remain excluded from
aggregates, history, estimates, and sharing.

This presentation refinement adds no telemetry event: it introduces no new
workflow or background action, and the existing refresh interaction remains the
behavioral boundary. Do not add passive status-impression telemetry. Component
and unit tests are the correct coverage layer because the change is localized
rendering and translation selection; no new Playwright scenario is required
unless implementation reveals a browser-only tooltip, focus, or navigation
regression.

## Error And Fallback Behavior

Metric completeness is snapshot state, not necessarily a health error. An
account may be healthy with valid balance and partial or unavailable today
metrics.

A refresh failure preserves the last successfully stored availability together
with the existing stale account data; it must not upgrade partial/unavailable
groups or convert stale values into trusted complete zeros.

Missing, unknown, or malformed persisted availability normalizes each group to
unavailable/legacy-unclassified and should be covered by import tests.

## Testing Strategy

Implementation follows TDD. Required behavior-level coverage includes:

### Contracts And Persistence

- legacy accounts keep stored numeric values but normalize every group to
  unavailable/legacy-unclassified;
- explicit per-group states survive save, refresh, export, and import;
- deferred save can persist known unsupported groups before first refresh;
- display projection carries availability; and
- refresh failure preserves the previous state.

### Producer Conformance

- every one of the 17 Account Site Types resolves an account-data producer with
  normalized group states after refresh;
- New API stat and full-log paths emit different truthful request/token states;
- New API page caps and per-log failures emit partial rather than complete;
- malformed stat data triggers fallback instead of a trusted zero;
- successful empty usage/income sources preserve complete or partial measured
  zero according to source coverage;
- a fake-timer midnight-crossing test proves one frozen range reaches the stat
  call, every fallback page, and both income log types;
- `includeTodayCashflow: false` emits not-collected for collectable groups while
  unsupported/wrong-period groups retain their reasons;
- Sub2API separates complete usage from unsupported income and marks usage
  request failure unavailable;
- AIHubMix no longer maps cumulative `used_quota` into today consumption;
- SharedChat marks finite 24-hour consumption and requests complete, aggregate
  tokens partial, unsupported income unavailable, and retains the
  rolling-window usage summary; and
- VoAPI v2 separates successful consumption/request data from unsupported
  tokens/income and failed statistics.

### Aggregates And Sorting

- complete, partial, unavailable, and empty eligible sets;
- legacy-unclassified eligible counts without changing sums or coverage status;
- income eligibility respects `excludeFromTodayIncome`;
- unavailable compatibility zeros never change totals, while partial values
  contribute with partial coverage;
- negative balances remain in balance totals; and
- accounts without the selected metric sort last in both directions.

### UI

- unsupported and other non-actionable unavailable metrics render a muted `—`
  with localized tooltip and accessible explanation in dense surfaces;
- legacy-unclassified metrics render visible `点击刷新` action copy on existing
  enabled refresh targets and visible `待刷新` status copy on disabled or
  otherwise read-only surfaces;
- partial account and aggregate metrics retain their valid value and show a
  visible `含待刷新` qualifier when legacy contributors remain;
- derived today-share percentages inherit the same visible partial qualifier;
- long localized qualifiers wrap without being truncated in compact overview
  layouts;
- partial aggregate coverage reports how many eligible accounts need refresh;
- measured zero remains visibly distinct from unavailable and renders `0`;
- no-coverage request/token/consumption/income totals render `待刷新` when
  legacy contributors exist and otherwise render unavailable;
- Options Overview separates today coverage from seven-day history; and
- existing all-complete rendering remains unchanged.

### History, Estimate, And Sharing

- quota history is captured while each incomplete cashflow field is null;
- today-income estimation requires complete consumption but not complete
  reported income;
- debug seeding applies independent quota/consumption/income completeness;
- per-account share includes cashflow only when consumption and income are both
  complete;
- overview share becomes balance-only unless coverage is complete; and
- `usageDataPresent` reflects the actual payload.

Likely focused suites include:

- `tests/services/accountStorage.test.ts`;
- `tests/hooks/useAccountData.test.tsx`;
- `tests/features/AccountManagement/hooks/AccountDataContext.test.tsx`;
- `tests/utils/formatters.test.ts`;
- `tests/utils/sortingPriority.test.ts`;
- Account List, Dedupe, popup Balance Section, and Options Overview component
  suites;
- `tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts`;
- `tests/services/shareSnapshots.test.ts`; and
- `tests/entrypoints/popup/ShareOverviewSnapshotButton.test.tsx`.

Also update the existing New API-family, Sub2API, AIHubMix, SharedChat, VoAPI
v2, adapter-registry, and account-data delegation suites. The registry test is
the completeness gate; a hand-picked producer list is insufficient.

## Telemetry Decision

Do not add per-account availability telemetry. Existing share telemetry may
continue to report the controlled `usageDataPresent` boolean, but it must be
derived from actual payload inclusion.

## Validation Plan

Run progressive gates:

1. focused Vitest and Testing Library suites for each TDD slice;
2. `pnpm run i18n:extract:ci` after locale or translation-call changes;
3. `pnpm run validate:staged` with only task-scoped files staged;
4. `pnpm run validate:push` because the migration changes shared account
   contracts, exports, persistence, and cross-entrypoint projections.

## Settings Search And E2E Decisions

No setting, navigation target, or deep link changes, so settings search is
unchanged.

This is canonical-model and rendering behavior that can be covered precisely
with Vitest and Testing Library. Do not add Playwright E2E unless implementation
uncovers a browser-entrypoint integration risk that lower-level tests cannot
represent.

## Maintainability Decision

Centralize state predicates and coverage calculation. Consumers must not
reimplement complete/partial contributor counts, eligible counts, or reason
handling.

Reuse existing nullable daily-history fields, sharing omission support,
placeholders, tooltips, and account default normalization. Do not introduce a
second statistics model or duplicate fallback checks across UI leaves.

## Rollout And Commit Boundaries

Implement in six reviewable feature commits:

1. `refactor(accounts): model and persist today statistics availability`
   - contracts, defaults, persistence, projection, aggregates, strict
     normalization, and legacy coverage;
2. `fix(account-data): classify and validate today statistics`
   - every registered producer, frozen time ranges, invalid-row handling, and
     conformance tests;
3. `fix(ui): support keyboard-accessible tooltips`
   - focus transitions, Escape closure, and rich-tooltip interaction;
4. `fix(account-ui): render today statistics by availability`
   - sorting, Account List, popup, Options Overview, and refresh guidance;
5. `fix(account-history): preserve independent daily cashflow`
   - capture, estimates, selectors, and Balance History rendering;
6. `fix(sharing): omit incomplete today cashflow`
   - per-account and overview payload omission plus analytics semantics.

Each commit follows focused red-green-refactor cycles. Because the work changes
shared contracts and exported types, final validation includes
`pnpm run validate:push`.

## Acceptance Criteria

- Existing accounts with no availability field retain their numeric values in
  storage but do not render or aggregate them until one successful refresh
  persists the producer’s explicit states.
- Legacy-unclassified values expose a visible refresh action or pending-refresh
  status according to whether the current surface can initiate the existing
  refresh flow.
- Partial aggregates retain their numeric value and visibly disclose that some
  eligible accounts still need refresh; the tooltip provides exact coverage
  counts.
- Unsupported and other non-actionable unavailable reasons use a muted `—` in
  dense surfaces with localized tooltip and accessible explanation, without
  repeating an unavailable label beside every metric.
- A measured zero renders `0` and is never represented by the unavailable dash.
- A healthy account can expose valid balance while current-day metrics are
  partial or unavailable.
- No per-account surface renders an unavailable today value as zero, and
  partial values are visibly qualified.
- Mixed aggregates identify partial coverage, sum complete/partial values, and
  exclude unavailable placeholders.
- No-coverage aggregates render unavailable.
- Accounts without the selected metric sort last for today consumption and
  income.
- Balance totals and negative balances remain unaffected.
- Daily history preserves quota and records partial/unavailable cashflow as
  null.
- Today-income estimates ignore partial/unavailable cashflow.
- Shared snapshots never publish unavailable or partial today metrics as
  complete data.
- Backup/import round-trips the new optional field, and old backups remain
  compatible.
- Product analytics records no new per-account availability data.
- Every registered account-data producer emits explicit correct states after a
  successful refresh.
- Source/page completion, not zero/nonzero values, determines completeness.
- Each refresh freezes one time range for every request that contributes to the
  same current-day snapshot.
