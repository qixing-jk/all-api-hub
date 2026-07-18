# Account Today Statistics Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make every refreshed account describe whether its current daily-window consumption, requests, tokens, and income are complete, partial, or unavailable, then prevent compatibility zeros and wrong-period values from being presented as measured today data.

**Architecture:** Add one canonical availability contract and one pure account-statistics helper layer. Persist optional producer-owned availability on AccountInfo, resolve legacy/deferred policy through the account-site profile, and require DisplaySiteData plus AccountStats to carry normalized per-group state and aggregate coverage. Migrate every registered AccountData producer before changing UI, history, estimates, and sharing consumers; balance remains independent throughout.

**Tech Stack:** TypeScript, React 19, WXT, Vitest, Testing Library, MSW, i18next.

---

## Scope And Dependency Order

This is one coordinated migration rather than four independent features:

1. canonical contracts, normalization, profile policy, persistence, projection, and aggregate coverage;
2. all 17 registered Account Site Type producer paths;
3. Account List, popup, sorting, and Options Overview presentation;
4. daily history, today-income estimates, sharing, and final gates.

AccountData.todayStatsAvailability remains optional so the commits are reviewable. AccountInfo.todayStatsAvailability also remains optional for old backups. DisplaySiteData.todayStatsAvailability and AccountStats.todayStatsCoverage are required normalized contracts. The producer-conformance gate is what makes the migration complete.

This plan does not add OpenRouter itself. It supplies the generic prerequisite required by the separate OpenRouter foundation design.

## File Structure

### New files

- src/types/accountTodayStats.ts: runtime constants and shared availability/coverage types.
- src/services/accounts/accountTodayStats.ts: normalization, predicates, profile-aware legacy resolution, contributor collection, and empty-state factories.
- tests/services/accounts/accountTodayStats.test.ts: strict state/reason and aggregation behavior.
- tests/services/apiAdapters/accountDataAvailabilityConformance.test.ts: registry-driven real producer conformance.
- tests/services/apiService/newApiFamily/accountDataVariants.test.ts: table-driven variant query/coverage checks.
- tests/services/dailyBalanceHistory/capture.test.ts: independent consumption/income history capture.

### Canonical account files

- src/services/accounts/accountDataModel.ts: optional adapter availability.
- src/types/index.ts: optional persisted availability, required display availability, and aggregate coverage.
- src/services/accounts/accountDefaults.ts: preserve legacy field absence and normalize explicit states.
- src/services/accounts/accountSiteProfile/contracts.ts: metric policy contract.
- src/services/accounts/accountSiteProfile/profiles.ts: generic deferred and legacy defaults.
- src/services/accounts/accountSiteProfile/registry.ts: deep merge and defensive clone.
- src/services/accountSiteDefinitions/definitions.ts: AIHubMix known wrong-period policy.
- src/services/accountSiteDefinitions/registry.ts: defensive clone of metric policy.
- src/services/accounts/accountOperations.ts: deferred save and successful fetch persistence.
- src/services/accounts/accountStorage.ts: successful refresh persistence, profile-aware projection, aggregate coverage, and history handoff.
- src/hooks/useAccountData.ts and src/features/AccountManagement/hooks/AccountDataContext.tsx: unavailable empty stats and coverage propagation.
- tests/test-utils/factories.ts: complete-by-default DisplaySiteData and AccountStats fixtures.
- src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts: unsupported availability for synthetic credential rows.

### Producer files

- src/services/apiService/newApiFamily/default/accountData.ts
- src/services/apiService/newApiFamily/default/accountDataUtils.ts
- src/services/apiService/newApiFamily/variants/anyrouter.ts
- src/services/apiService/newApiFamily/variants/veloera.ts
- src/services/apiService/newApiFamily/variants/doneHub.ts
- src/services/apiService/newApiFamily/variants/wong.ts
- src/services/apiService/sub2api/index.ts
- src/services/apiService/sub2api/parsing.ts
- src/services/apiService/aihubmix/index.ts
- src/services/apiService/sharedchat/index.ts
- src/services/apiService/voapiV2/index.ts
- src/services/apiService/voapiV2/type.ts only if its response-field types need widening to numeric strings

### Consumer files

- src/utils/core/formatters.ts
- src/services/preferences/utils/sortingPriority.ts
- src/features/AccountManagement/components/AccountList/BalanceDisplay.tsx
- src/features/AccountManagement/components/AccountList/index.tsx
- src/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard.tsx
- src/entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx
- src/entrypoints/popup/components/BalanceSection/TokenStats.tsx
- src/features/OptionsOverview/types.ts
- src/features/OptionsOverview/usageSnapshot.ts
- src/features/OptionsOverview/statusCards.ts
- src/features/OptionsOverview/overviewSelectors.ts
- src/features/OptionsOverview/components/OverviewUsageSnapshot.tsx
- src/features/OptionsOverview/components/OverviewStatusCard.tsx
- src/services/history/dailyBalanceHistory/capture.ts
- src/services/history/dailyBalanceHistory/scheduler.ts
- src/services/history/dailyBalanceHistory/todayIncomeEstimate.ts: regression tests first; production changes only if tests expose a gap
- src/services/sharing/shareSnapshots/index.ts
- src/features/AccountManagement/components/AccountActionButtons/index.tsx
- src/entrypoints/popup/components/ShareOverviewSnapshotButton.tsx
- src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/account.json
- src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/optionsOverview.json

---

### Task 1: Model, Persist, Project, And Aggregate Availability

**Files:**

- Create: src/types/accountTodayStats.ts
- Create: src/services/accounts/accountTodayStats.ts
- Create: tests/services/accounts/accountTodayStats.test.ts
- Modify: src/services/accounts/accountDataModel.ts
- Modify: src/types/index.ts
- Modify: src/services/accounts/accountDefaults.ts
- Modify: src/services/accounts/accountSiteProfile/contracts.ts
- Modify: src/services/accounts/accountSiteProfile/profiles.ts
- Modify: src/services/accounts/accountSiteProfile/registry.ts
- Modify: src/services/accountSiteDefinitions/definitions.ts
- Modify: src/services/accountSiteDefinitions/registry.ts
- Modify: src/services/accounts/accountOperations.ts
- Modify: src/services/accounts/accountStorage.ts
- Modify: src/utils/core/formatters.ts
- Modify: src/hooks/useAccountData.ts
- Modify: src/features/AccountManagement/hooks/AccountDataContext.tsx
- Modify: src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts
- Modify: tests/test-utils/factories.ts
- Modify direct DisplaySiteData fixtures:
  - tests/components/dialogs/ChannelDialog/ChannelDialogContainer.test.tsx
  - tests/components/KiloCodeExportDialog.test.tsx
  - tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
  - tests/entrypoints/content/RedemptionAccountSelectToast.test.tsx
  - tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
  - tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts
  - tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts
  - tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
  - tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx
  - tests/features/OptionsOverview/overviewSelectors.test.ts
  - tests/hooks/useAccountData.test.tsx
  - tests/utils/cherryStudio.test.ts
  - tests/utils/sortingPriority.test.ts
- Modify: tests/services/accounts/accountDefaults.test.ts
- Modify: tests/services/accounts/accountSiteProfile.test.ts
- Modify: tests/services/accountSiteDefinitions/registry.test.ts
- Modify: tests/services/accountOperations.validateAndSaveAccount.test.ts
- Modify: tests/services/accountStorage.test.ts
- Modify: tests/utils/formatters.test.ts
- Modify: tests/hooks/useAccountData.test.tsx
- Modify: tests/features/AccountManagement/hooks/AccountDataContext.test.tsx

- [ ] **Step 1: Write strict contract and coverage tests**

Create tests/services/accounts/accountTodayStats.test.ts with the complete matrix:

~~~ts
describe("accountTodayStats", () => {
  it("normalizes complete without a reason", () => {
    expect(
      normalizeAccountTodayMetricAvailability({
        status: "complete",
        reason: "request_failed",
      }),
    ).toEqual({ status: "complete" })
  })

  it.each([
    ["source_partial"],
    ["page_limit"],
    ["request_failed"],
  ] as const)("accepts %s for partial", (reason) => {
    expect(
      normalizeAccountTodayMetricAvailability({
        status: "partial",
        reason,
      }),
    ).toEqual({ status: "partial", reason })
  })

  it("fails malformed and invalid combinations closed", () => {
    expect(
      normalizeAccountTodayMetricAvailability({
        status: "partial",
        reason: "unsupported",
      }),
    ).toEqual({
      status: "unavailable",
      reason: "legacy_unclassified",
    })
  })

  it("counts complete and partial contributors without counting unavailable values", () => {
    const result = collectAccountMetricContributors(
      [
        { value: 10, availability: { status: "complete" } },
        {
          value: 20,
          availability: { status: "partial", reason: "source_partial" },
        },
        {
          value: 999,
          availability: {
            status: "unavailable",
            reason: "wrong_period",
          },
        },
      ],
      (item) => item.value,
      (item) => item.availability,
    )

    expect(result).toEqual({
      value: 30,
      coverage: {
        status: "partial",
        completeCount: 1,
        partialCount: 1,
        eligibleCount: 3,
      },
    })
  })

  it("classifies an empty eligible set as unavailable", () => {
    expect(collectAccountMetricContributors([], (item) => item, () => ({
      status: "complete",
    }))).toEqual({
      value: 0,
      coverage: {
        status: "unavailable",
        completeCount: 0,
        partialCount: 0,
        eligibleCount: 0,
      },
    })
  })
})
~~~

- [ ] **Step 2: Run the new tests and verify RED**

Run:

~~~powershell
pnpm exec vitest run tests/services/accounts/accountTodayStats.test.ts
~~~

Expected: FAIL because the type and helper modules do not exist.

- [ ] **Step 3: Add the canonical runtime constants and types**

Create src/types/accountTodayStats.ts:

~~~ts
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

export type AccountMetricCoverage = {
  status: "complete" | "partial" | "unavailable"
  completeCount: number
  partialCount: number
  eligibleCount: number
}

export type AccountTodayStatsCoverage = {
  consumption: AccountMetricCoverage
  requests: AccountMetricCoverage
  tokens: AccountMetricCoverage
  income: AccountMetricCoverage
}
~~~

Export these contracts from src/types/index.ts. Add optional todayStatsAvailability to AccountData and AccountInfo, required todayStatsAvailability to DisplaySiteData, and required todayStatsCoverage to AccountStats.

- [ ] **Step 4: Implement the pure normalizer, predicates, and contributor collector**

Create src/services/accounts/accountTodayStats.ts. Use reason allowlists, normalize every nested group independently, always clone returned objects, and expose:

~~~ts
export const createLegacyTodayStatsAvailability = () =>
  createUnavailableTodayStatsAvailability(
    ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
  )

export const createUnsupportedTodayStatsAvailability = () =>
  createUnavailableTodayStatsAvailability(
    ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
  )

export const isAccountTodayMetricAvailable = (
  availability: AccountTodayMetricAvailability,
) => availability.status !== ACCOUNT_TODAY_METRIC_STATUSES.Unavailable

export const isAccountTodayMetricComplete = (
  availability: AccountTodayMetricAvailability,
) => availability.status === ACCOUNT_TODAY_METRIC_STATUSES.Complete

export function collectAccountMetricContributors<T>(
  eligible: readonly T[],
  getValue: (item: T) => number,
  getAvailability: (item: T) => AccountTodayMetricAvailability,
): { value: number; coverage: AccountMetricCoverage } {
  let value = 0
  let completeCount = 0
  let partialCount = 0

  for (const item of eligible) {
    const availability = getAvailability(item)
    if (!isAccountTodayMetricAvailable(availability)) continue
    value += getValue(item)
    if (isAccountTodayMetricComplete(availability)) completeCount += 1
    else partialCount += 1
  }

  const eligibleCount = eligible.length
  const contributorCount = completeCount + partialCount
  const status =
    eligibleCount > 0 && completeCount === eligibleCount
      ? "complete"
      : contributorCount > 0
        ? "partial"
        : "unavailable"

  return {
    value,
    coverage: { status, completeCount, partialCount, eligibleCount },
  }
}
~~~

Also export createEmptyAccountTodayStatsCoverage and createEmptyAccountStats so hooks, contexts, storage fallbacks, and tests do not duplicate unavailable zero-count objects.

- [ ] **Step 5: Run pure tests and verify GREEN**

Run the Step 2 command.

Expected: PASS with the complete normalization matrix and coverage cases.

- [ ] **Step 6: Write profile, legacy-projection, persistence, and refresh tests**

Add failing tests that prove:

- a legacy account retains its numeric fields but lacks persisted availability;
- display projection resolves missing generic availability to unavailable/legacy-unclassified;
- missing AIHubMix availability resolves consumption/requests to wrong-period and tokens/income to unsupported;
- malformed explicit availability fails closed;
- valid explicit availability survives normalize, save, export, and import;
- the generic profile returns independent deferred and legacy objects;
- mutating a returned profile/definition does not affect a later read;
- deferred add saves profile metrics;
- successful add/update/refresh saves producer availability;
- failed update/refresh preserves the old availability;
- total quota still includes valid negative balances;
- today aggregation excludes unavailable nonzero compatibility values;
- partial values contribute and make coverage partial;
- income eligibility excludes disabled and excludeFromTodayIncome accounts;
- the empty aggregate is unavailable rather than measured complete zero.

Use explicit availability fixtures rather than inferring validity from numeric zero.

- [ ] **Step 7: Run the persistence tests and verify RED**

Run:

~~~powershell
pnpm exec vitest run tests/services/accounts/accountDefaults.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountStorage.test.ts
~~~

Expected: FAIL because profiles, save paths, refresh persistence, projection, and aggregate coverage do not exist.

- [ ] **Step 8: Add profile metric defaults and AIHubMix legacy policy**

Add AccountSiteMetricProfile to accountSiteProfile/contracts.ts:

~~~ts
export type AccountSiteMetricProfile = {
  deferredTodayStatsAvailability: AccountTodayStatsAvailability
  legacyTodayStatsAvailability: AccountTodayStatsAvailability
}
~~~

Add metrics to AccountSiteProductProfile. The default profile uses independent legacy-unclassified objects for both fields. Extend both profile registries to deep-merge and deep-clone all four nested metric groups.

In the AIHubMix account-site definition, set legacyTodayStatsAvailability to:

~~~ts
{
  consumption: { status: "unavailable", reason: "wrong_period" },
  requests: { status: "unavailable", reason: "wrong_period" },
  tokens: { status: "unavailable", reason: "unsupported" },
  income: { status: "unavailable", reason: "unsupported" },
}
~~~

Do not add an OpenRouter definition in this prerequisite.

- [ ] **Step 9: Preserve missing-vs-explicit state through defaults and projection**

In normalizeAccountInfo:

- keep todayStatsAvailability undefined when the raw field is absent;
- normalize it only when the raw field is present;
- never infer status from numeric values.

In accountStorage, add a single profile-aware resolver:

~~~ts
export function resolveAccountTodayStatsAvailability(
  account: Pick<SiteAccount, "site_type" | "account_info">,
): AccountTodayStatsAvailability {
  const profile = getAccountSiteProductProfile(account.site_type)
  return normalizeAccountTodayStatsAvailability(
    account.account_info.todayStatsAvailability,
    profile.metrics.legacyTodayStatsAvailability,
  )
}
~~~

Use it for DisplaySiteData projection and any raw-account consumer such as Dedupe. Do not run a destructive migration or increment configVersion.

- [ ] **Step 10: Persist deferred and refreshed states**

In accountOperations:

- deferred/new failed saves copy profile.metrics.deferredTodayStatsAvailability;
- successful fresh AccountData copies its explicit todayStatsAvailability;
- failed update paths omit the field so the prior value remains.

In accountStorage.refreshAccount:

- successful result copies result.data.todayStatsAvailability;
- failed or thrown refresh leaves account_info unchanged;
- export/import naturally preserves the optional field.

- [ ] **Step 11: Implement aggregate coverage and normalized initial state**

In accountStorage.getAccountStats:

- filter disabled accounts before all today metrics;
- use all enabled accounts for consumption, requests, and tokens;
- use enabled accounts not excluded from today income for income;
- sum complete and partial values only;
- use one tokens coverage for prompt and completion totals;
- preserve existing total-quota eligibility and negative values;
- return createEmptyAccountStats on errors.

Update formatters so subset aggregations return:

~~~ts
type CurrencyMetricTotal = {
  amount: CurrencyAmount
  coverage: AccountMetricCoverage
}
~~~

Both USD and CNY must iterate the same contributing DisplaySiteData items. Remove the raw accounts: any[] split calculation from calculateTotalConsumption or make it a narrow wrapper around the DisplaySiteData helper.

Use createEmptyAccountStats in useAccountData and AccountDataContext. Set synthetic credential DisplaySiteData rows to all unavailable/unsupported. Update buildDisplaySiteData and shared AccountStats fixtures to default to complete availability so unrelated existing UI tests continue to describe valid data.

- [ ] **Step 12: Run the complete canonical slice and verify GREEN**

Run:

~~~powershell
pnpm exec vitest run tests/services/accounts/accountTodayStats.test.ts tests/services/accounts/accountDefaults.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountStorage.test.ts tests/utils/formatters.test.ts tests/hooks/useAccountData.test.tsx tests/features/AccountManagement/hooks/AccountDataContext.test.tsx
~~~

Expected: PASS. Run pnpm compile once here. Update every direct constructor listed in this task to import the shared complete or empty fixture builder. For any additional compiler-reported direct constructor, add the same explicit builder rather than weakening the required DisplaySiteData or AccountStats contract.

- [ ] **Step 13: Commit the canonical slice**

~~~powershell
git add src/types/accountTodayStats.ts src/services/accounts/accountTodayStats.ts src/services/accounts/accountDataModel.ts src/types/index.ts src/services/accounts/accountDefaults.ts src/services/accounts/accountSiteProfile src/services/accountSiteDefinitions src/services/accounts/accountOperations.ts src/services/accounts/accountStorage.ts src/utils/core/formatters.ts src/hooks/useAccountData.ts src/features/AccountManagement/hooks/AccountDataContext.tsx src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts tests/test-utils/factories.ts tests/services/accounts/accountTodayStats.test.ts tests/services/accounts/accountDefaults.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountStorage.test.ts tests/utils/formatters.test.ts tests/hooks/useAccountData.test.tsx tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/components/dialogs/ChannelDialog/ChannelDialogContainer.test.tsx tests/components/KiloCodeExportDialog.test.tsx tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx tests/entrypoints/content/RedemptionAccountSelectToast.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx tests/features/OptionsOverview/overviewSelectors.test.ts tests/utils/cherryStudio.test.ts
git commit -m "refactor(accounts): model today statistics availability"
~~~

---

### Task 2: Classify Every AccountData Producer

**Files:**

- Modify all producer files listed in File Structure
- Create: tests/services/apiService/newApiFamily/accountDataVariants.test.ts
- Create: tests/services/apiAdapters/accountDataAvailabilityConformance.test.ts
- Modify: tests/services/apiService/newApiFamily/accountData.test.ts
- Modify: tests/services/apiService/newApiFamily/accountDataUtils.test.ts
- Modify: tests/services/apiService/sub2api/index.test.ts
- Modify: tests/services/apiService/aihubmix/index.test.ts
- Modify: tests/services/apiService/sharedchat/index.test.ts
- Modify: tests/services/apiService/voapiV2/index.test.ts
- Modify: tests/services/apiAdapters/registry.test.ts

- [ ] **Step 1: Write New API-family coverage tests**

Cover these exact outcomes:

- finite stat quota: consumption complete; requests/tokens unsupported;
- missing, NaN, or infinite stat quota throws into full-log fallback;
- successful empty full-log usage: consumption/requests/tokens complete zero;
- failure before any page: unavailable/request-failed;
- failure after a covered page: partial/source-partial;
- page cap: partial/page-limit;
- Topup and System both complete, including empty: income complete;
- one income source covered and the other fails: partial/source-partial;
- neither income source covered: unavailable/request-failed;
- includeTodayCashflow false: all four groups not-collected and no today requests;
- one frozen range reaches stat, fallback pages, Topup, and System even when fake time crosses midnight;
- consume-log row count remains today_requests_count;
- AnyRouter, Veloera, DoneHub, and WONG keep their existing query dialects.

- [ ] **Step 2: Run New API tests and verify RED**

~~~powershell
pnpm exec vitest run tests/services/apiService/newApiFamily/accountData.test.ts tests/services/apiService/newApiFamily/accountDataUtils.test.ts tests/services/apiService/newApiFamily/accountDataVariants.test.ts
~~~

Expected: FAIL because pagination only returns numbers, malformed stat becomes zero, and ranges are read repeatedly.

- [ ] **Step 3: Return value plus source coverage from New API collection**

Define private result contracts in default/accountData.ts:

~~~ts
type TodayUsageResult = TodayUsageData & {
  availability: Pick<
    AccountTodayStatsAvailability,
    "consumption" | "requests" | "tokens"
  >
}

type TodayIncomeResult = TodayIncomeData & {
  availability: Pick<AccountTodayStatsAvailability, "income">
}

type PaginatedCollectionResult<T> = {
  value: T
  successfulSourceCount: number
  failedSourceCount: number
  contributedPageCount: number
  pageLimitReached: boolean
}
~~~

Make buildTodayLogQueryParams consume a passed TodayTimestampRange. Freeze one range in each public fetchTodayUsage/fetchTodayIncome call, and freeze one shared range at fetchAccountData/variant orchestration so all requests in the same snapshot use identical seconds.

For stat success, require Number.isFinite(statData.quota); otherwise throw and use the full-log path. Map PaginatedCollectionResult to the exact complete/partial/unavailable reasons from Step 1. Successful empty pages count as covered sources.

Keep a concise code comment that request count is consume-log row count, not a stronger backend request-total contract.

- [ ] **Step 4: Update all four New API variants**

Use the same frozen range and result contract in AnyRouter, Veloera, DoneHub, and WONG fetchAccountData. DoneHub must preserve page, size, log_type, data, total_count, and the omitted group parameter. Do not classify a site type statically; classify the path that actually completed.

- [ ] **Step 5: Run New API tests and verify GREEN**

Run the Step 2 command.

Expected: PASS, including the fake-midnight and DoneHub dialect cases.

- [ ] **Step 6: Write dedicated-adapter tests**

Add the following cases:

- Sub2API validates consumption, requests, input tokens, and output tokens independently; one valid token side is partial; request failure preserves healthy balance with unavailable/request-failed; skip is not-collected; income is always unsupported.
- AIHubMix no longer copies cumulative used_quota; consumption/requests are wrong-period; tokens/income are unsupported.
- SharedChat finite totalCost and totalRequests are complete; finite aggregate totalTokens is partial/source-partial and remains in the compatibility total; missing/nonfinite fields are invalid-payload; usage.scope stays rolling_window; income is unsupported.
- VoAPI v2 derives one date range from one frozen instant; requests are independent; both used-balance fields valid makes consumption complete; one valid field makes consumption partial/source-partial; neither valid makes consumption unavailable/invalid-payload; statistics request failure is request-failed without failing balance; skip does not request statistics; tokens/income are unsupported.

- [ ] **Step 7: Run dedicated tests and verify RED**

~~~powershell
pnpm exec vitest run tests/services/apiService/sub2api/index.test.ts tests/services/apiService/aihubmix/index.test.ts tests/services/apiService/sharedchat/index.test.ts tests/services/apiService/voapiV2/index.test.ts
~~~

Expected: FAIL because current parsers coerce missing values to zero and failures are swallowed without availability.

- [ ] **Step 8: Implement dedicated producer classification**

Sub2API:

- change parsing to return per-field validity before nonnegative/truncation normalization;
- create AccountData even when usage request fails, using compatibility zeros plus request-failed;
- keep the existing official source comment and state that period=today uses the server-configured day;
- unsupported income remains unsupported even when collection is skipped.

AIHubMix:

- remove userInfo.used_quota from today_quota_consumption;
- add the official AIHubMix client/docs reference beside the deliberate non-mapping;
- return fixed wrong-period/unsupported availability.

SharedChat:

- use optional finite parsing for each currentUsage field;
- preserve the production-dashboard 24-hour reference and rolling_window summary;
- when includeTodayCashflow is false, zero compatibility today fields and mark collectable groups not-collected while retaining the independent rich rolling summary.

VoAPI v2:

- replace catch-to-null with an explicit result carrying request-failed;
- validate requests separately from the two consumption fields;
- derive start/end from one Date instance;
- add a concise upstream-contract comment for the endpoint fields and keep mixed-field consumption partial rather than fabricating complete zero.

- [ ] **Step 9: Run dedicated tests and verify GREEN**

Run the Step 7 command.

Expected: PASS with healthy-balance plus unavailable-metrics failure cases.

- [ ] **Step 10: Add the registry-driven conformance gate**

Create tests/services/apiAdapters/accountDataAvailabilityConformance.test.ts. Iterate ACCOUNT_SITE_TYPES and drive both:

~~~ts
capabilities.account?.data?.fetchData(request)
capabilities.account?.refresh?.refreshAccount(request)
~~~

Use family-specific MSW success fixtures to exercise the real producers. Assert each successful AccountData contains all four explicit normalized groups and does not equal the legacy-unclassified fallback. Cover the 13 New API-family site types plus Sub2API, AIHubMix, SharedChat, and VoAPI v2. Do not mock producer return values.

- [ ] **Step 11: Run producer conformance and the merged producer gate**

~~~powershell
pnpm exec vitest run tests/services/apiService/newApiFamily/accountData.test.ts tests/services/apiService/newApiFamily/accountDataUtils.test.ts tests/services/apiService/newApiFamily/accountDataVariants.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/aihubmix/index.test.ts tests/services/apiService/sharedchat/index.test.ts tests/services/apiService/voapiV2/index.test.ts tests/services/apiAdapters/accountDataAvailabilityConformance.test.ts tests/services/apiAdapters/registry.test.ts tests/services/apiAdapters/accountData.test.ts tests/services/apiAdapters/newApi/accountData.test.ts
~~~

Expected: PASS for all 17 registered account site types and both fetch/refresh delegation paths.

- [ ] **Step 12: Commit the producer slice**

~~~powershell
git add src/services/apiService/newApiFamily src/services/apiService/sub2api src/services/apiService/aihubmix src/services/apiService/sharedchat src/services/apiService/voapiV2 tests/services/apiService/newApiFamily tests/services/apiService/sub2api/index.test.ts tests/services/apiService/aihubmix/index.test.ts tests/services/apiService/sharedchat/index.test.ts tests/services/apiService/voapiV2/index.test.ts tests/services/apiAdapters/accountDataAvailabilityConformance.test.ts tests/services/apiAdapters/registry.test.ts
git commit -m "fix(account-data): classify existing today statistics"
~~~

---

### Task 3: Render Coverage In Sorting, Account UI, Popup, And Options Overview

**Files:**

- Modify all consumer UI files listed in File Structure through OverviewStatusCard
- Modify: tests/utils/sortingPriority.test.ts
- Modify: tests/features/AccountManagement/components/BalanceDisplay.test.tsx
- Modify: tests/features/AccountManagement/components/AccountList.test.tsx
- Modify: tests/features/AccountManagement/components/DedupeAccountsDialog.test.tsx
- Modify: tests/entrypoints/popup/BalanceSection.test.tsx
- Modify: tests/features/OptionsOverview/usageSnapshot.test.ts
- Modify: tests/features/OptionsOverview/statusCards.test.ts
- Modify: tests/features/OptionsOverview/overviewSelectors.test.ts
- Modify: tests/features/OptionsOverview/usageSnapshotMath.test.ts
- Modify: tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx
- Modify all six account.json and optionsOverview.json locale siblings

- [ ] **Step 1: Write sorting and subset-aggregate tests**

For consumption and income, assert unavailable is last in ascending and descending order, complete/partial sort numerically, complete wins equal numeric ties, and equal state/value returns zero for stable later criteria.

For filtered subsets, assert complete and partial contribute, unavailable nonzero values do not, eligibility/counts are recalculated for the subset, and empty coverage is unavailable.

- [ ] **Step 2: Run sorting and formatter tests and verify RED**

~~~powershell
pnpm exec vitest run tests/utils/formatters.test.ts tests/utils/sortingPriority.test.ts
~~~

Expected: FAIL because current sort and totals only compare/sum numbers.

- [ ] **Step 3: Implement availability-aware sorting and one subset aggregator**

Use isAccountTodayMetricAvailable and isAccountTodayMetricComplete. Do not reverse the unavailable-last comparison for descending order. Make Account List filtered totals, popup overview share calculations, and other subsets call the same formatters result rather than reconstructing counts.

- [ ] **Step 4: Write Account List, Dedupe, and popup rendering tests**

Cover:

- complete renders the existing numeric value and refresh action;
- partial renders best-effort numeric value with an accessible localized qualifier;
- unavailable renders an em dash and never renders the compatibility number;
- balance remains visible and refreshable;
- filtered summaries render number plus coverage, or an em dash with no contributors;
- Dedupe resolves availability through the profile-aware resolver;
- popup consumption/income cover complete, partial, unavailable;
- popup tokens show prompt/completion only when complete, combined best-effort total when partial, and an em dash when unavailable.

- [ ] **Step 5: Run Account UI tests and verify RED**

~~~powershell
pnpm exec vitest run tests/features/AccountManagement/components/BalanceDisplay.test.tsx tests/features/AccountManagement/components/AccountList.test.tsx tests/features/AccountManagement/components/DedupeAccountsDialog.test.tsx tests/entrypoints/popup/BalanceSection.test.tsx
~~~

Expected: FAIL because every surface currently renders numeric zero and TokenStats always claims a verified split.

- [ ] **Step 6: Implement shared presentation semantics**

Reuse Tooltip and existing typography primitives. Keep presentation logic shared as data helpers rather than forcing Account List, popup, and Options Overview into one DOM component.

Use these user-facing states:

- complete: normal number;
- partial account: number plus localized “partial daily statistic” qualifier;
- partial aggregate: number plus complete/partial/eligible contributor counts;
- unavailable: em dash.

Never expose internal reason names. For SharedChat partial tokens, display prompt + completion as a combined best-effort total and do not label the compatibility bucket as completion.

- [ ] **Step 7: Write Options Overview model and component tests**

Cover:

- all-complete rendering remains unchanged;
- unavailable today requests with valid seven-day history keeps the history section visible;
- partial today cost/requests/tokens show values plus qualification;
- unavailable today metrics never produce 0 percent shares;
- measured complete zero differs from unavailable;
- only both today and seven-day absence triggers the true empty state;
- the status card preserves request coverage instead of formatting unavailable as “0”.

- [ ] **Step 8: Run Options Overview tests and verify RED**

~~~powershell
pnpm exec vitest run tests/features/OptionsOverview/usageSnapshot.test.ts tests/features/OptionsOverview/statusCards.test.ts tests/features/OptionsOverview/overviewSelectors.test.ts tests/features/OptionsOverview/usageSnapshotMath.test.ts tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx
~~~

Expected: FAIL because today and seven-day availability are currently collapsed into one hasUsageData boolean.

- [ ] **Step 9: Separate today coverage from seven-day history**

Extend OptionsOverviewUsageSnapshot with:

~~~ts
todayRequests: number
todayTokens: number
todayCostText: string
todayRequestsCoverage: AccountMetricCoverage
todayTokensCoverage: AccountMetricCoverage
todayCostCoverage: AccountMetricCoverage
hasTodayUsageData: boolean
hasSevenDayUsageData: boolean
hasUsageData: boolean
~~~

Today metrics use AccountStats coverage. Seven-day requests/tokens continue to use Usage History independently. UsageShare returns unavailable presentation when its today numerator has no contributors.

- [ ] **Step 10: Add synchronized locale copy and verify extraction**

Add the same key shape to every account.json and optionsOverview.json sibling. Use short composable labels rather than count-sensitive sentences:

~~~json
{
  "todayMetricAvailability": {
    "unavailable": "Unavailable",
    "partial": "Partial daily statistic",
    "coverage": "Complete {{complete}} · partial {{partial}} · eligible {{eligible}}"
  }
}
~~~

Use this exact key shape and locale copy in both namespaces:

| Locale | unavailable | partial | coverage |
| --- | --- | --- | --- |
| en | Unavailable | Partial daily statistic | Complete {{complete}} · partial {{partial}} · eligible {{eligible}} |
| es-419 | No disponible | Estadística diaria parcial | Completos {{complete}} · parciales {{partial}} · aptos {{eligible}} |
| ja | 利用不可 | 一部の日次統計 | 完全 {{complete}}・一部 {{partial}}・対象 {{eligible}} |
| vi | Không khả dụng | Thống kê ngày một phần | Đầy đủ {{complete}} · một phần {{partial}} · đủ điều kiện {{eligible}} |
| zh-CN | 不可用 | 部分日级统计 | 完整 {{complete}} · 部分 {{partial}} · 符合条件 {{eligible}} |
| zh-TW | 不可用 | 部分日級統計 | 完整 {{complete}} · 部分 {{partial}} · 符合條件 {{eligible}} |

Do not add fallback defaultValue calls for ordinary app copy.

Run:

~~~powershell
pnpm run i18n:extract:ci
~~~

Expected: PASS with no generated locale diff.

- [ ] **Step 11: Run the complete UI slice and verify GREEN**

Run the commands from Steps 2, 5, 8, and 10.

Expected: all focused suites and i18n extraction PASS.

- [ ] **Step 12: Commit the UI slice**

~~~powershell
git add src/utils/core/formatters.ts src/services/preferences/utils/sortingPriority.ts src/features/AccountManagement/components/AccountList src/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard.tsx src/entrypoints/popup/components/BalanceSection src/features/OptionsOverview src/locales tests/utils/formatters.test.ts tests/utils/sortingPriority.test.ts tests/features/AccountManagement tests/entrypoints/popup/BalanceSection.test.tsx tests/features/OptionsOverview tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx
git commit -m "refactor(account-ui): render partial today statistics"
~~~

---

### Task 4: Preserve Coverage In History, Estimates, Sharing, And Telemetry

**Files:**

- Create: tests/services/dailyBalanceHistory/capture.test.ts
- Modify: src/services/history/dailyBalanceHistory/capture.ts
- Modify: src/services/history/dailyBalanceHistory/scheduler.ts
- Verify/modify only if required: src/services/history/dailyBalanceHistory/todayIncomeEstimate.ts
- Modify: src/services/accounts/accountStorage.ts
- Modify: src/services/sharing/shareSnapshots/index.ts
- Modify: src/features/AccountManagement/components/AccountActionButtons/index.tsx
- Modify: src/entrypoints/popup/components/ShareOverviewSnapshotButton.tsx
- Modify: tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts
- Modify: tests/services/dailyBalanceHistory/scheduler.test.ts
- Modify: tests/services/accountStorage.test.ts
- Modify: tests/services/shareSnapshots.test.ts
- Modify: tests/features/AccountManagement/components/AccountActionButtons.test.tsx
- Modify: tests/entrypoints/popup/ShareOverviewSnapshotButton.test.tsx

- [ ] **Step 1: Write independent history-capture tests**

Cover:

- quota is always stored;
- complete consumption plus unavailable income stores consumption and null income;
- partial consumption plus complete income stores null consumption and income;
- both unavailable stores two nulls;
- not-collected stores quota only;
- accountStorage passes the just-refreshed availability, not the previous persisted state;
- refresh failure does not write a new snapshot.

- [ ] **Step 2: Run history tests and verify RED**

~~~powershell
pnpm exec vitest run tests/services/dailyBalanceHistory/capture.test.ts tests/services/accountStorage.test.ts tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts tests/services/dailyBalanceHistory/scheduler.test.ts
~~~

Expected: FAIL because capture has one includeTodayCashflow boolean and debug seeding trusts numbers.

- [ ] **Step 3: Capture consumption and income independently**

Change maybeCaptureDailyBalanceSnapshot to accept todayStatsAvailability and write:

~~~ts
today_income: isAccountTodayMetricComplete(
  params.todayStatsAvailability.income,
)
  ? params.today_income
  : null,
today_quota_consumption: isAccountTodayMetricComplete(
  params.todayStatsAvailability.consumption,
)
  ? params.today_quota_consumption
  : null,
~~~

Pass result.data.todayStatsAvailability from accountStorage refresh. Update debugSeedEstimateSnapshots to resolve account availability once and apply the same complete predicate independently.

Keep the existing todayIncomeEstimate implementation unless regression tests fail: it already permits estimation when income is null and blocks it when consumption is null. Add tests that lock in reportedTodayIncome and compensation behavior.

- [ ] **Step 4: Run history tests and verify GREEN**

Run the Step 2 command.

Expected: PASS with nullable history fields and no new history schema.

- [ ] **Step 5: Write fail-closed sharing and analytics tests**

Cover:

- account preference enabled plus complete consumption/income includes the full cashflow bundle;
- either group partial/unavailable produces balance-only output;
- overview requires complete consumption and income aggregate coverage;
- payload builders omit the entire bundle when either value is missing or nonfinite, even when includeTodayCashflow is true;
- usageDataPresent is true only when the final payload contains todayIncome, todayOutcome, and todayNet;
- preference enabled with incomplete coverage reports false;
- no availability status, reason, URL, host, ID, or numeric metric is added to analytics.

- [ ] **Step 6: Run sharing tests and verify RED**

~~~powershell
pnpm exec vitest run tests/services/shareSnapshots.test.ts tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/entrypoints/popup/ShareOverviewSnapshotButton.test.tsx
~~~

Expected: FAIL because callers currently equate preference with inclusion and applyCashflow converts missing members to zero.

- [ ] **Step 7: Make payload construction and callers fail closed**

In shareSnapshots/index.ts, add the cashflow bundle only when both income and outcome are finite; otherwise return the base payload unchanged.

In AccountActionButtons, require:

~~~ts
showTodayCashflow !== false &&
isAccountTodayMetricComplete(site.todayStatsAvailability.consumption) &&
isAccountTodayMetricComplete(site.todayStatsAvailability.income)
~~~

In ShareOverviewSnapshotButton, require the preference plus complete aggregate consumption and income coverage. Derive usageDataPresent from the built payload:

~~~ts
const usageDataPresent =
  typeof payload.todayIncome === "number" &&
  typeof payload.todayOutcome === "number" &&
  typeof payload.todayNet === "number"
~~~

Keep the existing controlled telemetry boolean; add no per-account availability telemetry.

- [ ] **Step 8: Run sharing tests and verify GREEN**

Run the Step 6 command.

Expected: PASS with balance-only fallback and truthful usageDataPresent.

- [ ] **Step 9: Commit the history and sharing slice**

~~~powershell
git add src/services/history/dailyBalanceHistory src/services/accounts/accountStorage.ts src/services/sharing/shareSnapshots/index.ts src/features/AccountManagement/components/AccountActionButtons/index.tsx src/entrypoints/popup/components/ShareOverviewSnapshotButton.tsx tests/services/dailyBalanceHistory tests/services/accountStorage.test.ts tests/services/shareSnapshots.test.ts tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/entrypoints/popup/ShareOverviewSnapshotButton.test.tsx
git commit -m "refactor(account-history): preserve incomplete cashflow"
~~~

---

### Task 5: Track Legacy Refresh Coverage And Presentation

**Files:**

- Modify: `src/types/accountTodayStats.ts`
- Modify: `src/services/accounts/accountTodayStats.ts`
- Modify: `src/utils/core/formatters.ts`
- Modify: `tests/services/accounts/accountTodayStats.test.ts`
- Modify: `tests/utils/formatters.test.ts`
- Modify: `tests/test-utils/accountTodayStats.ts`
- Modify coverage literals in:
  - `tests/services/accountStorage.test.ts`
  - `tests/features/OptionsOverview/overviewSelectors.test.ts`
  - `tests/features/OptionsOverview/statusCards.test.ts`
  - `tests/features/OptionsOverview/usageSnapshot.test.ts`
  - `tests/features/OptionsOverview/usageSnapshotMath.test.ts`
  - `tests/features/OptionsOverview/components/OverviewStatusCard.test.tsx`
  - `tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx`
  - `tests/entrypoints/popup/BalanceSection.test.tsx`

- [ ] **Step 1: Write the failing legacy coverage test**

Add a behavior test to `tests/services/accounts/accountTodayStats.test.ts` that
keeps the numeric sum and coverage status unchanged while counting legacy
eligible metrics:

~~~ts
it("counts legacy-unclassified eligible metrics without contributing their values", () => {
  const result = collectAccountMetricContributors(
    [
      {
        value: 10,
        availability: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
        },
      },
      {
        value: 999,
        availability: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
        },
      },
      {
        value: 999,
        availability: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
    ],
    (item) => item.value,
    (item) => item.availability,
  )

  expect(result).toEqual({
    value: 10,
    coverage: {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
      completeCount: 1,
      partialCount: 0,
      legacyUnclassifiedCount: 1,
      eligibleCount: 3,
    },
  })
})
~~~

Update the empty-coverage expectation in the same test file to require
`legacyUnclassifiedCount: 0`.

- [ ] **Step 2: Run the coverage test and verify RED**

~~~powershell
pnpm exec vitest run tests/services/accounts/accountTodayStats.test.ts
~~~

Expected: FAIL because `AccountMetricCoverage` and contributor collection do
not expose `legacyUnclassifiedCount`.

- [ ] **Step 3: Add the factual legacy coverage count**

In `src/types/accountTodayStats.ts`, extend the normalized aggregate contract:

~~~ts
export interface AccountMetricCoverage {
  status: AccountTodayMetricStatus
  completeCount: number
  partialCount: number
  legacyUnclassifiedCount: number
  eligibleCount: number
}
~~~

In `collectAccountMetricContributors`, initialize and increment only for the
exact unavailable legacy reason:

~~~ts
export const isAccountTodayMetricLegacyUnclassified = (
  availability: AccountTodayMetricAvailability,
): boolean =>
  availability.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable &&
  availability.reason ===
    ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified

let legacyUnclassifiedCount = 0

for (const item of items) {
  const availability = getAvailability(item)
  if (isAccountTodayMetricComplete(availability)) {
    value += getValue(item)
    completeCount += 1
  } else if (isAccountTodayMetricAvailable(availability)) {
    value += getValue(item)
    partialCount += 1
  } else if (isAccountTodayMetricLegacyUnclassified(availability)) {
    legacyUnclassifiedCount += 1
  }
}
~~~

Return the count with coverage and initialize it to zero in
`createEmptyMetricCoverage`. Update `buildCompleteAccountTodayStatsCoverage`
in `tests/test-utils/accountTodayStats.ts` and every explicit coverage literal
found by this audit command:

~~~powershell
rg -n "eligibleCount" src tests
~~~

Every ordinary complete/partial/unavailable fixture receives
`legacyUnclassifiedCount: 0`; only fixtures intentionally modeling upgrade
recovery receive a positive count.

- [ ] **Step 4: Run contract tests and TypeScript verification**

~~~powershell
pnpm exec vitest run tests/services/accounts/accountTodayStats.test.ts tests/services/accountStorage.test.ts tests/features/OptionsOverview/overviewSelectors.test.ts tests/features/OptionsOverview/statusCards.test.ts tests/features/OptionsOverview/usageSnapshot.test.ts tests/features/OptionsOverview/usageSnapshotMath.test.ts tests/features/OptionsOverview/components/OverviewStatusCard.test.tsx tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx tests/entrypoints/popup/BalanceSection.test.tsx
pnpm compile
~~~

Expected: PASS with every normalized coverage constructor carrying the new
required count.

- [ ] **Step 5: Write failing presentation tests**

Add focused tests for `getTodayMetricPresentation` in
`tests/utils/formatters.test.ts`:

~~~ts
it("marks only legacy unavailable account values as requiring refresh", () => {
  expect(
    getTodayMetricPresentation(999, {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
    }),
  ).toEqual({
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    value: null,
    requiresRefresh: true,
  })

  expect(
    getTodayMetricPresentation(999, {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    }),
  ).toEqual({
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    value: null,
    requiresRefresh: false,
  })
})

it("marks partial aggregate coverage as requiring refresh when legacy accounts remain", () => {
  expect(
    getTodayMetricPresentation(10, {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
      completeCount: 1,
      partialCount: 0,
      legacyUnclassifiedCount: 1,
      eligibleCount: 2,
    }),
  ).toEqual({
    status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
    value: 10,
    requiresRefresh: true,
  })
})
~~~

- [ ] **Step 6: Run formatter tests and verify RED**

~~~powershell
pnpm exec vitest run tests/utils/formatters.test.ts
~~~

Expected: FAIL because presentation does not expose `requiresRefresh`.

- [ ] **Step 7: Derive refresh recovery from domain facts**

Extend the formatter result without importing translations:

~~~ts
interface TodayMetricPresentation {
  status: AccountTodayMetricStatus
  value: number | null
  requiresRefresh: boolean
}

export const getTodayMetricPresentation = (
  value: number,
  availability: AccountTodayMetricAvailability | AccountMetricCoverage,
): TodayMetricPresentation => ({
  status: availability.status,
  value: isAccountTodayMetricAvailable(availability) ? value : null,
  requiresRefresh:
    "legacyUnclassifiedCount" in availability
      ? availability.legacyUnclassifiedCount > 0
      : isAccountTodayMetricLegacyUnclassified(availability),
})
~~~

Import the predicate from the account-statistics helper. Do not put reason
comparisons, i18n keys, or copy decisions in the formatter.

- [ ] **Step 8: Run the domain and formatter tests and verify GREEN**

~~~powershell
pnpm exec vitest run tests/services/accounts/accountTodayStats.test.ts tests/utils/formatters.test.ts
pnpm compile
~~~

Expected: PASS with no change to sums, availability status, or numeric value
presentation.

- [ ] **Step 9: Commit the domain slice**

~~~powershell
git add src/types/accountTodayStats.ts src/services/accounts/accountTodayStats.ts src/utils/core/formatters.ts tests/services/accounts/accountTodayStats.test.ts tests/utils/formatters.test.ts tests/test-utils/accountTodayStats.ts tests/services/accountStorage.test.ts tests/features/OptionsOverview/overviewSelectors.test.ts tests/features/OptionsOverview/statusCards.test.ts tests/features/OptionsOverview/usageSnapshot.test.ts tests/features/OptionsOverview/usageSnapshotMath.test.ts tests/features/OptionsOverview/components/OverviewStatusCard.test.tsx tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx tests/entrypoints/popup/BalanceSection.test.tsx
git commit -m "refactor(accounts): expose legacy refresh coverage"
~~~

---

### Task 6: Make Legacy Recovery Visible Without Repeating Unavailable Copy

**Files:**

- Modify: `src/features/AccountManagement/components/AccountList/BalanceDisplay.tsx`
- Modify: `src/features/AccountManagement/components/AccountList/index.tsx`
- Modify: `src/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard.tsx`
- Modify: `src/entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx`
- Modify: `src/entrypoints/popup/components/BalanceSection/TokenStats.tsx`
- Modify: `src/features/OptionsOverview/components/OverviewStatusCard.tsx`
- Modify: `src/features/OptionsOverview/components/OverviewUsageSnapshot.tsx`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/account.json`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/optionsOverview.json`
- Test: `tests/features/AccountManagement/components/BalanceDisplay.test.tsx`
- Test: `tests/features/AccountManagement/components/DedupeAccountCard.test.tsx`
- Test: `tests/features/AccountManagement/components/DedupeAccountsDialog.test.tsx`
- Test: `tests/features/AccountManagement/components/AccountList.test.tsx`
- Test: `tests/entrypoints/popup/BalanceSection.test.tsx`
- Test: `tests/features/OptionsOverview/components/OverviewStatusCard.test.tsx`
- Test: `tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx`

- [ ] **Step 1: Write failing per-account visibility tests**

In `BalanceDisplay.test.tsx`, render a legacy-unclassified account and assert
that the existing refresh button visibly contains
`account:todayMetricAvailability.clickToRefresh`, exposes
`account:todayMetricAvailability.refreshActionHelp`, and still calls the
existing forced refresh handler. Render an unsupported account separately and
assert that it retains the visible `—` plus the existing localized unavailable
description. Render a disabled legacy account and assert that it visibly uses
`pendingRefresh` plus `pendingRefreshHelp`, exposes no refresh button, and never
uses the action-only copy.

In `DedupeAccountCard.test.tsx`, assert that legacy consumption, request, and
token fields visibly render `account:todayMetricAvailability.pendingRefresh`
and expose `account:todayMetricAvailability.pendingRefreshHelp`. Unsupported
fields continue to render `—` with the existing unavailable description. Keep
the dialog-level integration assertion in `DedupeAccountsDialog.test.tsx`.

Use visible-text and accessible-name assertions. Do not locate these states by
CSS classes or DOM position.

- [ ] **Step 2: Run per-account tests and verify RED**

~~~powershell
pnpm exec vitest run tests/features/AccountManagement/components/BalanceDisplay.test.tsx tests/features/AccountManagement/components/DedupeAccountCard.test.tsx tests/features/AccountManagement/components/DedupeAccountsDialog.test.tsx
~~~

Expected: FAIL because legacy-unclassified values still render `—` and expose
only the shared `needsRefresh` tooltip key.

- [ ] **Step 3: Add synchronized action, status, and helper copy**

Add `clickToRefresh` only to each locale's `account.json`. Add
`pendingRefresh` and `includesPendingRefresh` to both `account.json` and
`optionsOverview.json`. Keep `coverageWithRefresh` as the detailed tooltip with
exact counts. Do not add unused action-only keys to Options Overview or preserve
them through extractor configuration.

| Locale | `clickToRefresh` | `pendingRefresh` | `includesPendingRefresh` |
| --- | --- | --- | --- |
| `zh-CN` | `点击刷新` | `待刷新` | `含待刷新` |
| `zh-TW` | `點擊重新整理` | `待重新整理` | `含待重新整理` |
| `en` | `Click to refresh` | `Refresh pending` | `Includes pending refresh` |
| `es-419` | `Actualizar` | `Actualización pendiente` | `Incluye actualizaciones pendientes` |
| `ja` | `クリックして更新` | `更新待ち` | `更新待ちを含む` |
| `vi` | `Nhấp để làm mới` | `Chờ làm mới` | `Có mục chờ làm mới` |

Add `refreshActionHelp` only to `account.json` and add `pendingRefreshHelp` to
both namespaces, with these exact meanings:

| Locale | `refreshActionHelp` | `pendingRefreshHelp` |
| --- | --- | --- |
| `zh-CN` | `今日统计状态尚未确认。点击刷新账号后即可更新。` | `今日统计状态尚未确认。请前往账号列表刷新相关账号。` |
| `zh-TW` | `今日統計狀態尚未確認。點擊重新整理帳號後即可更新。` | `今日統計狀態尚未確認。請前往帳號清單重新整理相關帳號。` |
| `en` | `Today's statistics have not been confirmed. Click to refresh this account.` | `Today's statistics have not been confirmed. Refresh the relevant account from the Accounts list.` |
| `es-419` | `Las estadísticas de hoy aún no se han confirmado. Actualiza esta cuenta.` | `Las estadísticas de hoy aún no se han confirmado. Actualiza la cuenta correspondiente desde la lista de cuentas.` |
| `ja` | `今日の統計はまだ確認されていません。クリックしてアカウントを更新してください。` | `今日の統計はまだ確認されていません。アカウント一覧で対象のアカウントを更新してください。` |
| `vi` | `Số liệu thống kê hôm nay chưa được xác nhận. Nhấp để làm mới tài khoản.` | `Số liệu thống kê hôm nay chưa được xác nhận. Hãy làm mới tài khoản liên quan trong danh sách tài khoản.` |

Keep the old `needsRefresh` key until the executable references are removed and
`pnpm run i18n:extract:ci` confirms it is unused; let the extractor remove it
rather than deleting locale entries before source migration.

- [ ] **Step 4: Render visible per-account recovery states**

In `BalanceDisplay.tsx`, extend `AnimatedValue` with separate visible empty
content and tooltip copy. Use the existing presentation and refresh callback:

~~~ts
const recoveryCopy = presentation.requiresRefresh
  ? {
      visible: t("todayMetricAvailability.clickToRefresh"),
      help: t("todayMetricAvailability.refreshActionHelp"),
    }
  : undefined
~~~

Build action recovery copy only when the account metric has an enabled refresh
callback. When `presentation.value === null` and actionable recovery copy
exists, render the visible action text inside the existing button instead of
`—`. A disabled legacy account uses visible `pendingRefresh` plus
`pendingRefreshHelp` in the static value path. Preserve
`handleRefreshAccount(site, true)`, loading behavior, button semantics, and all
numeric-value refresh interactions. Non-legacy unavailable reasons keep the
muted dash and existing unavailable tooltip; do not relabel them as unsupported
because `getTodayMetricPresentation` intentionally does not expose a reason for
aggregate coverage.

In `DedupeAccountCard.tsx`, replace the legacy dash with visible
`pendingRefresh` text and use `pendingRefreshHelp` for its tooltip/accessibility
description. Preserve the generic unavailable dash for all other unavailable
reasons. Apply the same rule to the combined token presentation.

- [ ] **Step 5: Run per-account tests and verify GREEN**

Run the Step 2 command.

Expected: PASS. Legacy recovery is visible, unsupported/unavailable rendering
remains compact, and existing refresh callbacks are unchanged.

- [ ] **Step 6: Write failing aggregate visibility tests**

Add representative aggregate cases:

- Account List filtered total with unavailable coverage and
  `legacyUnclassifiedCount: 1` visibly renders `pendingRefresh`;
- partial Account List coverage retains its USD/CNY value, visibly renders
  `includesPendingRefresh`, and exposes `coverageWithRefresh` with exact counts;
- Popup consumption/token unavailable coverage visibly renders
  `pendingRefresh` rather than `—`;
- partial Popup coverage retains its value, visibly renders
  `includesPendingRefresh`, and keeps the detailed coverage tooltip;
- Options Overview status and usage cards visibly render `pendingRefresh` for
  unavailable legacy coverage;
- partial Options Overview values visibly render `includesPendingRefresh` and
  expose `coverageWithRefresh`; and
- partial today-share percentages retain the numeric percentage, visibly render
  `includesPendingRefresh`, and expose the detailed coverage description; and
- the same surfaces with `legacyUnclassifiedCount: 0` retain a muted `—` or the
  existing non-legacy partial presentation.

Also assert that a complete measured zero renders `0`, not `—` or a recovery
label.

- [ ] **Step 7: Run aggregate UI tests and verify RED**

~~~powershell
pnpm exec vitest run tests/features/AccountManagement/components/AccountList.test.tsx tests/entrypoints/popup/BalanceSection.test.tsx tests/features/OptionsOverview/components/OverviewStatusCard.test.tsx tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx
~~~

Expected: FAIL because aggregate legacy recovery is still available only through
tooltip/accessibility copy and partial aggregates do not show a compact visible
qualifier.

- [ ] **Step 8: Render visible aggregate recovery without new controls**

For unavailable aggregate presentation with legacy contributors, replace the
visible dash with `pendingRefresh` and use `pendingRefreshHelp` for the tooltip
or accessible description. This is status text, not a new button: existing
currency toggles and navigation targets keep their current behavior and must
not be described as refresh actions.

For partial aggregate coverage, keep the formatted numeric value, render a
small adjacent `includesPendingRefresh` qualifier, and wrap the combined value
and qualifier in the existing tooltip containing `coverageWithRefresh`:

~~~tsx
<Tooltip content={coverageLabel}>
  <span aria-label={`${accessibleValue}. ${qualifier}. ${coverageLabel}`}>
    <span>{value}</span>
    <span>{t("todayMetricAvailability.includesPendingRefresh")}</span>
  </span>
</Tooltip>
~~~

Apply the rule in `FilteredTodayMetric`, `AccountBalanceSummary`, `TokenStats`,
`OverviewStatusCard`, `AvailabilityAwareValue`, and `UsageShare`. Keep the detailed
`coverageWithRefresh` count parameters unchanged:

~~~ts
{
  complete: coverage.completeCount,
  partial: coverage.partialCount,
  refresh: coverage.legacyUnclassifiedCount,
  eligible: coverage.eligibleCount,
}
~~~

Do not create a second statistics model or shared component that forces these
surfaces into identical DOM. Reuse `getTodayMetricPresentation` for semantic
state and keep the small rendering differences local because buttons, currency
toggles, navigation cards, and static values have different interaction
contracts.

Remove single-line truncation from today-cost content when it can contain a
visible recovery qualifier. Allow long localized qualifiers to wrap or occupy a
secondary compact line. For tooltip triggers that receive the detailed text via
`aria-describedby`, keep `aria-label` to the visible value/status and qualifier
so assistive technology does not announce the same coverage explanation twice.

Do not add banners, effects, storage markers, automatic refresh calls, passive
impression analytics, or a new Playwright scenario. The existing refresh action
remains the telemetry and behavior boundary.

- [ ] **Step 9: Run focused UI, locale, and extraction validation**

~~~powershell
pnpm exec vitest run tests/features/AccountManagement/components/BalanceDisplay.test.tsx tests/features/AccountManagement/components/DedupeAccountCard.test.tsx tests/features/AccountManagement/components/DedupeAccountsDialog.test.tsx tests/features/AccountManagement/components/AccountList.test.tsx tests/entrypoints/popup/BalanceSection.test.tsx tests/features/OptionsOverview/components/OverviewStatusCard.test.tsx tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx
pnpm run i18n:extract:ci
~~~

Expected: PASS with each namespace synchronized across all six locales, no
stale `needsRefresh` source references, and no extractor drift. Inspect the
locale diff to confirm that action-only keys remain absent from Options
Overview and that removals are limited to superseded unused keys.

- [ ] **Step 10: Run the branch commit gate**

Stage only the Task 6 files plus the revised spec and plan, then run:

~~~powershell
pnpm run validate:staged
~~~

Expected: PASS for formatting, linting, related tests, and i18n checks selected
by the staged-file workflow.

- [ ] **Step 11: Commit the revised recovery UX slice**

~~~powershell
git add docs/superpowers/specs/2026-07-17-account-today-statistics-availability-design.md docs/superpowers/plans/2026-07-17-account-today-statistics-availability.md src/features/AccountManagement/components/AccountList/BalanceDisplay.tsx src/features/AccountManagement/components/AccountList/index.tsx src/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard.tsx src/entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx src/entrypoints/popup/components/BalanceSection/TokenStats.tsx src/features/OptionsOverview/components/OverviewStatusCard.tsx src/features/OptionsOverview/components/OverviewUsageSnapshot.tsx src/locales/*/account.json src/locales/*/optionsOverview.json tests/features/AccountManagement/components/BalanceDisplay.test.tsx tests/features/AccountManagement/components/DedupeAccountCard.test.tsx tests/features/AccountManagement/components/DedupeAccountsDialog.test.tsx tests/features/AccountManagement/components/AccountList.test.tsx tests/entrypoints/popup/BalanceSection.test.tsx tests/features/OptionsOverview/components/OverviewStatusCard.test.tsx tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx
git commit -m "fix(account-ui): make legacy refresh state visible"
~~~

---

### Task 7: Integration, Maintainability, And Release Gates

**Files:**

- Verify all files touched in Tasks 1-6.
- Do not add settings-search definitions, migrations, analytics schemas, or Playwright tests unless a newly observed browser-entrypoint defect requires them.

- [ ] **Step 1: Run the complete focused regression set**

~~~powershell
pnpm exec vitest run tests/services/accounts/accountTodayStats.test.ts tests/services/accounts/accountDefaults.test.ts tests/services/accounts/accountSiteProfile.test.ts tests/services/accountSiteDefinitions/registry.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountStorage.test.ts tests/services/apiService/newApiFamily/accountData.test.ts tests/services/apiService/newApiFamily/accountDataUtils.test.ts tests/services/apiService/newApiFamily/accountDataVariants.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/aihubmix/index.test.ts tests/services/apiService/sharedchat/index.test.ts tests/services/apiService/voapiV2/index.test.ts tests/services/apiAdapters/accountDataAvailabilityConformance.test.ts tests/services/apiAdapters/registry.test.ts tests/utils/formatters.test.ts tests/utils/sortingPriority.test.ts tests/hooks/useAccountData.test.tsx tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/features/AccountManagement/components/BalanceDisplay.test.tsx tests/features/AccountManagement/components/AccountList.test.tsx tests/features/AccountManagement/components/DedupeAccountsDialog.test.tsx tests/entrypoints/popup/BalanceSection.test.tsx tests/features/OptionsOverview/components/OverviewStatusCard.test.tsx tests/features/OptionsOverview/usageSnapshot.test.ts tests/features/OptionsOverview/statusCards.test.ts tests/features/OptionsOverview/overviewSelectors.test.ts tests/features/OptionsOverview/usageSnapshotMath.test.ts tests/entrypoints/options/pages/OptionsOverview/OptionsOverview.test.tsx tests/services/dailyBalanceHistory/capture.test.ts tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts tests/services/dailyBalanceHistory/scheduler.test.ts tests/services/shareSnapshots.test.ts tests/features/AccountManagement/components/AccountActionButtons.test.tsx tests/entrypoints/popup/ShareOverviewSnapshotButton.test.tsx
~~~

Expected: PASS with no unhandled rejection, act warning, or stale mock shape.

- [ ] **Step 2: Audit completeness and duplicated policy**

Run:

~~~powershell
rg -n "todayStatsAvailability|todayStatsCoverage" src tests
rg -n "status === .complete.|status !== .unavailable." src
rg -n "today_(quota_consumption|prompt_tokens|completion_tokens|requests_count|income): 0" src/services/apiService
~~~

Expected:

- every successful AccountData producer returns an explicit state;
- consumers use shared predicates rather than duplicating status comparisons;
- remaining numeric zeros are compatibility values paired with explicit states;
- no consumer infers availability from numeric zero/nonzero;
- no second coverage calculator exists outside accountTodayStats.ts.

- [ ] **Step 3: Re-run i18n and TypeScript gates**

~~~powershell
pnpm run i18n:extract:ci
pnpm compile
~~~

Expected: PASS with no locale drift or missing required constructors.

- [ ] **Step 4: Run the staged commit-equivalent gate**

Stage only task-scoped files that remain after any final cleanup:

~~~powershell
pnpm run validate:staged
~~~

Expected: PASS. Inspect hook changes before retrying if lint-staged rewrites files.

- [ ] **Step 5: Run the push-equivalent gate**

~~~powershell
pnpm run validate:push
~~~

Expected: PASS; compile and knip both complete successfully.

- [ ] **Step 6: Inspect final history and worktree**

~~~powershell
git status --short
git log --oneline -10
git diff 9fa8b25d6..HEAD --stat
~~~

Expected: clean worktree with no fixup-only commits; the original four feature
commits plus the legacy coverage and recovery UX commits remain independently
reviewable before final branch polishing.

- [ ] **Step 7: Record release-readiness decisions in the handoff**

State explicitly:

- telemetry: none for availability; the existing share usageDataPresent boolean is corrected to actual payload inclusion;
- settings search/deep links: unchanged because no setting is added, renamed, moved, or removed;
- E2E: no Playwright test because canonical projection, aggregation, persistence, and component rendering are covered more precisely by Vitest/Testing Library; add E2E only if implementation discovers a real popup/options runtime synchronization defect;
- maintainability: one type module plus one pure helper centralize normalization, predicates, coverage, and contributor collection; existing nullable history and share omission contracts are reused;
- known boundary: provider-defined calendar days and documented recent 24-hour windows count as daily usage, while lifetime, subscription-period, longer rolling, and unbounded totals do not.
