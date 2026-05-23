# Estimated Today Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in runtime-derived estimated today-income view, shown beside the trusted log/API income in Popup and Balance History without overwriting stored `today_income`.

**Architecture:** Keep account storage and daily balance snapshots as raw observed data. Add a pure daily-balance-history estimate helper that derives trusted and estimated values from current-day and previous-day snapshots, then reuse it from Balance History selectors and Popup account data context. Persist only a default-off `balanceHistory.estimatedTodayIncome.enabled` preference.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, WXT extension storage services, existing i18next locale JSON files.

---

## File Structure

- Modify `src/types/dailyBalanceHistory.ts`
  - Add `BalanceHistoryEstimatedTodayIncomePreferences`.
  - Add `estimatedTodayIncome` to `BalanceHistoryPreferences`.
  - Add estimate status/result types shared by selectors and UI.
- Modify `src/services/preferences/migrations/preferencesMigration.ts`
  - Bump `CURRENT_PREFERENCES_VERSION`.
  - Add a migration that preserves existing balance-history settings and defaults estimated income to disabled.
  - Update the v11 -> v12 balance-history migration to include the new nested default for fresh migrations from older data.
- Modify `src/contexts/UserPreferencesContext.tsx`
  - No API shape change is required beyond the normalized preference snapshot already using `deepOverride`; tests should prove the new nested default is exposed.
- Create `src/services/history/dailyBalanceHistory/todayIncomeEstimate.ts`
  - Owns pure per-account estimate calculation in raw quota units.
  - Owns money conversion helpers for per-account and aggregate estimated income.
- Modify `src/services/history/dailyBalanceHistory/selectors.ts`
  - Add `estimatedIncome` to `DailyBalanceHistoryMetric`.
  - Return estimated-income series and range summary fields when data is available.
  - Keep trusted `income` behavior unchanged.
- Modify `src/features/BalanceHistory/BalanceHistory.tsx`
  - Add localized metric labels for trusted income and estimated income.
  - Include estimated-income metric options only when the new preference is enabled.
  - Wire charts, breakdowns, overview KPIs, and table rows to the new selector fields.
- Modify `src/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.tsx`
  - Add an optional estimated-income column controlled by a prop.
- Modify `src/features/AccountManagement/hooks/AccountDataContext.tsx`
  - Load daily balance history store with account data.
  - Expose Popup-ready estimated today-income totals derived by the shared helper.
- Modify `src/entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx`
  - When enabled, show trusted today income and estimated today income as separate fields.
  - When disabled, preserve current layout and labels.
- Modify `src/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistorySettings.tsx`
  - Add the default-off estimated-income switch to the existing balance-history card.
- Modify locale files:
  - `src/locales/en/balanceHistory.json`
  - `src/locales/zh-CN/balanceHistory.json`
  - `src/locales/zh-TW/balanceHistory.json`
  - `src/locales/ja/balanceHistory.json`
  - `src/locales/vi/balanceHistory.json`
  - `src/locales/en/account.json`
  - `src/locales/zh-CN/account.json`
  - `src/locales/zh-TW/account.json`
  - `src/locales/ja/account.json`
  - `src/locales/vi/account.json`
- Modify tests:
  - `tests/services/configMigration/preferences/preferencesMigration.test.ts`
  - `tests/contexts/UserPreferencesContext.test.tsx`
  - `tests/services/dailyBalanceHistory/selectors.test.ts`
  - Create `tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts`
  - `tests/entrypoints/options/BalanceHistorySettings.test.tsx`
  - `tests/entrypoints/popup/BalanceSection.test.tsx`
  - `tests/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.test.tsx`

---

### Task 1: Add Preference Model And Migration

**Files:**

- Modify: `src/types/dailyBalanceHistory.ts`
- Modify: `src/services/preferences/migrations/preferencesMigration.ts`
- Test: `tests/services/configMigration/preferences/preferencesMigration.test.ts`
- Test: `tests/contexts/UserPreferencesContext.test.tsx`

- [ ] **Step 1: Add failing migration coverage**

Add tests proving the nested preference defaults to disabled and existing settings are preserved:

```ts
it("defaults estimated today income to disabled when migrating balance history preferences", () => {
  const migrated = migratePreferences(
    createV0Preferences({
      balanceHistory: {
        enabled: true,
        endOfDayCapture: { enabled: true },
        retentionDays: 45,
      },
      preferencesVersion: 24,
    } as any),
  )

  expect(migrated.balanceHistory).toMatchObject({
    enabled: true,
    endOfDayCapture: { enabled: true },
    retentionDays: 45,
    estimatedTodayIncome: { enabled: false },
  })
  expect(migrated.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
})
```

In `tests/contexts/UserPreferencesContext.test.tsx`, add a normalization test:

```ts
it("normalizes missing estimated today income preferences to disabled", async () => {
  const preferences = buildUserPreferences()
  preferences.balanceHistory = {
    enabled: true,
    endOfDayCapture: { enabled: false },
    retentionDays: 30,
  } as any

  mockGetPreferences.mockResolvedValue(preferences)

  render(<UserPreferencesProvider><Probe /></UserPreferencesProvider>)

  await waitFor(() => {
    expect((latestContext as any)?.preferences.balanceHistory).toMatchObject({
      enabled: true,
      estimatedTodayIncome: { enabled: false },
    })
  })
})
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm vitest related --run tests/services/configMigration/preferences/preferencesMigration.test.ts tests/contexts/UserPreferencesContext.test.tsx
```

Expected: FAIL because `estimatedTodayIncome` and the new migration do not exist.

- [ ] **Step 3: Add the preference types and default**

Update `src/types/dailyBalanceHistory.ts`:

```ts
export interface BalanceHistoryEstimatedTodayIncomePreferences {
  enabled: boolean
}

export interface BalanceHistoryPreferences {
  enabled: boolean
  endOfDayCapture: BalanceHistoryEndOfDayCapturePreferences
  estimatedTodayIncome: BalanceHistoryEstimatedTodayIncomePreferences
  retentionDays: number
}

export const DEFAULT_BALANCE_HISTORY_PREFERENCES: BalanceHistoryPreferences = {
  enabled: false,
  endOfDayCapture: { enabled: false },
  estimatedTodayIncome: { enabled: false },
  retentionDays: 365,
}
```

- [ ] **Step 4: Add the migration**

In `src/services/preferences/migrations/preferencesMigration.ts`:

```ts
export const CURRENT_PREFERENCES_VERSION = 25
```

Update migration `12` so older migrations create the nested default:

```ts
balanceHistory: {
  enabled,
  endOfDayCapture: { enabled: endOfDayCaptureEnabled },
  estimatedTodayIncome: {
    enabled:
      typeof stored?.estimatedTodayIncome?.enabled === "boolean"
        ? stored.estimatedTodayIncome.enabled
        : DEFAULT_BALANCE_HISTORY_PREFERENCES.estimatedTodayIncome.enabled,
  },
  retentionDays,
},
```

Add migration `25` after migration `24`:

```ts
25: (prefs: UserPreferences): UserPreferences => {
  logger.debug(
    "Migrating preferences from v24 to v25 (estimated today income preference)",
  )

  const stored = (prefs as any).balanceHistory as
    | Partial<BalanceHistoryPreferences>
    | undefined

  return {
    ...prefs,
    balanceHistory: {
      enabled:
        typeof stored?.enabled === "boolean"
          ? stored.enabled
          : DEFAULT_BALANCE_HISTORY_PREFERENCES.enabled,
      endOfDayCapture: {
        enabled:
          typeof stored?.endOfDayCapture?.enabled === "boolean"
            ? stored.endOfDayCapture.enabled
            : DEFAULT_BALANCE_HISTORY_PREFERENCES.endOfDayCapture.enabled,
      },
      estimatedTodayIncome: {
        enabled:
          typeof stored?.estimatedTodayIncome?.enabled === "boolean"
            ? stored.estimatedTodayIncome.enabled
            : DEFAULT_BALANCE_HISTORY_PREFERENCES.estimatedTodayIncome.enabled,
      },
      retentionDays: clampBalanceHistoryRetentionDays(stored?.retentionDays),
    },
    preferencesVersion: 25,
  }
},
```

- [ ] **Step 5: Run the tests**

Run:

```bash
pnpm vitest related --run tests/services/configMigration/preferences/preferencesMigration.test.ts tests/contexts/UserPreferencesContext.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/dailyBalanceHistory.ts src/services/preferences/migrations/preferencesMigration.ts tests/services/configMigration/preferences/preferencesMigration.test.ts tests/contexts/UserPreferencesContext.test.tsx
git commit -m "feat(balance-history): add estimated income preference"
```

---

### Task 2: Add Pure Today-Income Estimate Helper

**Files:**

- Create: `src/services/history/dailyBalanceHistory/todayIncomeEstimate.ts`
- Test: `tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  estimateTodayIncomeForAccount,
  buildEstimatedTodayIncomeMoneyTotals,
} from "~/services/history/dailyBalanceHistory/todayIncomeEstimate"
import { DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/dailyBalanceHistory"

const store = {
  schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
  snapshotsByAccountId: {
    account: {
      "2026-05-22": {
        quota: 1_000_000,
        today_income: 0,
        today_quota_consumption: 0,
        capturedAt: 1,
        source: "alarm",
      },
      "2026-05-23": {
        quota: 1_600_000,
        today_income: 100_000,
        today_quota_consumption: 200_000,
        capturedAt: 2,
        source: "refresh",
      },
    },
  },
} as const

describe("today income estimate", () => {
  it("derives estimated income from balance movement and today consumption", () => {
    expect(
      estimateTodayIncomeForAccount({
        enabled: true,
        store,
        accountId: "account",
        currentDayKey: "2026-05-23",
        hasManualBalance: false,
      }),
    ).toEqual({
      reportedTodayIncome: 100_000,
      estimatedTodayIncome: 800_000,
      compensation: 700_000,
      status: "available",
    })
  })

  it.each([
    ["disabled", { enabled: false }, "disabled"],
    ["missing current snapshot", { accountId: "missing" }, "missing_current_snapshot"],
    ["missing baseline", { currentDayKey: "2026-05-22" }, "missing_baseline"],
    ["manual balance", { hasManualBalance: true }, "manual_balance"],
  ])("returns %s status", (_label, overrides, status) => {
    expect(
      estimateTodayIncomeForAccount({
        enabled: true,
        store,
        accountId: "account",
        currentDayKey: "2026-05-23",
        hasManualBalance: false,
        ...overrides,
      } as any).status,
    ).toBe(status)
  })

  it("returns missing_cashflow when current consumption is null", () => {
    expect(
      estimateTodayIncomeForAccount({
        enabled: true,
        store: {
          ...store,
          snapshotsByAccountId: {
            account: {
              ...store.snapshotsByAccountId.account,
              "2026-05-23": {
                ...store.snapshotsByAccountId.account["2026-05-23"],
                today_quota_consumption: null,
              },
            },
          },
        },
        accountId: "account",
        currentDayKey: "2026-05-23",
        hasManualBalance: false,
      }).status,
    ).toBe("missing_cashflow")
  })

  it("returns invalid_estimate for negative estimates", () => {
    expect(
      estimateTodayIncomeForAccount({
        enabled: true,
        store: {
          ...store,
          snapshotsByAccountId: {
            account: {
              ...store.snapshotsByAccountId.account,
              "2026-05-23": {
                ...store.snapshotsByAccountId.account["2026-05-23"],
                quota: 500_000,
                today_quota_consumption: 0,
              },
            },
          },
        },
        accountId: "account",
        currentDayKey: "2026-05-23",
        hasManualBalance: false,
      }).status,
    ).toBe("invalid_estimate")
  })
})
```

- [ ] **Step 2: Run the failing helper tests**

Run:

```bash
pnpm vitest related --run tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts
```

Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/services/history/dailyBalanceHistory/todayIncomeEstimate.ts`:

```ts
import { UI_CONSTANTS } from "~/constants/ui"
import type { CurrencyAmount, CurrencyType, SiteAccount } from "~/types"
import type {
  DailyBalanceHistoryStore,
  TodayIncomeEstimateResult,
} from "~/types/dailyBalanceHistory"

import { subtractDaysFromDayKey } from "./dayKeys"

type EstimateAccountInput = Pick<SiteAccount, "id" | "manualBalanceUsd" | "exchange_rate">

export function estimateTodayIncomeForAccount(params: {
  enabled: boolean
  store: DailyBalanceHistoryStore | null
  accountId: string
  currentDayKey: string
  hasManualBalance: boolean
}): TodayIncomeEstimateResult {
  if (!params.enabled) {
    return {
      reportedTodayIncome: null,
      estimatedTodayIncome: null,
      compensation: null,
      status: "disabled",
    }
  }

  if (params.hasManualBalance) {
    return {
      reportedTodayIncome: null,
      estimatedTodayIncome: null,
      compensation: null,
      status: "manual_balance",
    }
  }

  const current =
    params.store?.snapshotsByAccountId[params.accountId]?.[params.currentDayKey]
  if (!current) {
    return {
      reportedTodayIncome: null,
      estimatedTodayIncome: null,
      compensation: null,
      status: "missing_current_snapshot",
    }
  }

  const baselineDayKey = subtractDaysFromDayKey(params.currentDayKey, 1)
  const baseline =
    params.store?.snapshotsByAccountId[params.accountId]?.[baselineDayKey]
  if (!baseline) {
    return {
      reportedTodayIncome: current.today_income,
      estimatedTodayIncome: null,
      compensation: null,
      status: "missing_baseline",
    }
  }

  if (typeof current.today_quota_consumption !== "number") {
    return {
      reportedTodayIncome: current.today_income,
      estimatedTodayIncome: null,
      compensation: null,
      status: "missing_cashflow",
    }
  }

  const estimatedTodayIncome =
    current.quota - baseline.quota + current.today_quota_consumption
  const reportedTodayIncome =
    typeof current.today_income === "number" ? current.today_income : null

  if (!Number.isFinite(estimatedTodayIncome) || estimatedTodayIncome < 0) {
    return {
      reportedTodayIncome,
      estimatedTodayIncome: null,
      compensation: null,
      status: "invalid_estimate",
    }
  }

  return {
    reportedTodayIncome,
    estimatedTodayIncome,
    compensation:
      reportedTodayIncome === null
        ? null
        : estimatedTodayIncome - reportedTodayIncome,
    status: "available",
  }
}

export function hasManualBalance(account: Pick<SiteAccount, "manualBalanceUsd">) {
  return typeof account.manualBalanceUsd === "string" && account.manualBalanceUsd.trim().length > 0
}

export function convertQuotaToMoney(params: {
  quota: number
  currencyType: CurrencyType
  exchangeRate: number
}) {
  const usd = params.quota / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
  return params.currencyType === "CNY" ? usd * params.exchangeRate : usd
}

export function buildEstimatedTodayIncomeMoneyTotals(params: {
  enabled: boolean
  store: DailyBalanceHistoryStore | null
  accounts: EstimateAccountInput[]
  currentDayKey: string
}): {
  trusted: CurrencyAmount
  estimated: CurrencyAmount | null
  availableAccounts: number
  totalAccounts: number
} {
  let trustedUsd = 0
  let trustedCny = 0
  let estimatedUsd = 0
  let estimatedCny = 0
  let availableAccounts = 0

  for (const account of params.accounts) {
    const result = estimateTodayIncomeForAccount({
      enabled: params.enabled,
      store: params.store,
      accountId: account.id,
      currentDayKey: params.currentDayKey,
      hasManualBalance: hasManualBalance(account),
    })

    const trustedQuota = result.reportedTodayIncome ?? 0
    trustedUsd += convertQuotaToMoney({
      quota: trustedQuota,
      currencyType: "USD",
      exchangeRate: account.exchange_rate,
    })
    trustedCny += convertQuotaToMoney({
      quota: trustedQuota,
      currencyType: "CNY",
      exchangeRate: account.exchange_rate,
    })

    if (result.status !== "available" || result.estimatedTodayIncome === null) {
      continue
    }

    availableAccounts += 1
    estimatedUsd += convertQuotaToMoney({
      quota: result.estimatedTodayIncome,
      currencyType: "USD",
      exchangeRate: account.exchange_rate,
    })
    estimatedCny += convertQuotaToMoney({
      quota: result.estimatedTodayIncome,
      currencyType: "CNY",
      exchangeRate: account.exchange_rate,
    })
  }

  return {
    trusted: { USD: trustedUsd, CNY: trustedCny },
    estimated:
      availableAccounts > 0 ? { USD: estimatedUsd, CNY: estimatedCny } : null,
    availableAccounts,
    totalAccounts: params.accounts.length,
  }
}
```

Also add `TodayIncomeEstimateResult` and status types to `src/types/dailyBalanceHistory.ts`:

```ts
export type TodayIncomeEstimateStatus =
  | "available"
  | "disabled"
  | "missing_current_snapshot"
  | "missing_baseline"
  | "missing_cashflow"
  | "manual_balance"
  | "invalid_estimate"

export interface TodayIncomeEstimateResult {
  reportedTodayIncome: number | null
  estimatedTodayIncome: number | null
  compensation: number | null
  status: TodayIncomeEstimateStatus
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
pnpm vitest related --run tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/dailyBalanceHistory.ts src/services/history/dailyBalanceHistory/todayIncomeEstimate.ts tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts
git commit -m "feat(balance-history): derive estimated today income"
```

---

### Task 3: Extend Balance History Selectors

**Files:**

- Modify: `src/services/history/dailyBalanceHistory/selectors.ts`
- Test: `tests/services/dailyBalanceHistory/selectors.test.ts`

- [ ] **Step 1: Add failing selector tests**

In `tests/services/dailyBalanceHistory/selectors.test.ts`, add cases for `estimatedIncome`:

```ts
it("builds estimated income per-account series without changing trusted income", () => {
  const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
  const store = createStore({
    a1: {
      "2026-02-06": {
        quota: 10 * factor,
        today_income: 0,
        today_quota_consumption: 0,
        capturedAt: 0,
        source: "alarm",
      },
      "2026-02-07": {
        quota: 12 * factor,
        today_income: 0.5 * factor,
        today_quota_consumption: 1 * factor,
        capturedAt: 1,
        source: "refresh",
      },
    },
  })

  const result = buildPerAccountDailyBalanceMoneySeries({
    store,
    accountIds: ["a1"],
    startDayKey: "2026-02-07",
    endDayKey: "2026-02-07",
    currencyType: "USD",
    estimatedTodayIncomeEnabled: true,
  })

  expect(result.seriesByAccountId.a1.income).toEqual([0.5])
  expect(result.seriesByAccountId.a1.estimatedIncome).toEqual([3])
  expect(result.coverageByDay[0]).toMatchObject({
    cashflowAccounts: 1,
    estimatedIncomeAccounts: 1,
  })
})
```

Add a range summary test:

```ts
it("summarizes estimated income separately from trusted income", () => {
  const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
  const store = createStore({
    a1: {
      "2026-02-06": {
        quota: 10 * factor,
        today_income: 0,
        today_quota_consumption: 0,
        capturedAt: 0,
        source: "alarm",
      },
      "2026-02-07": {
        quota: 12 * factor,
        today_income: 0.5 * factor,
        today_quota_consumption: 1 * factor,
        capturedAt: 1,
        source: "refresh",
      },
    },
  })

  const result = buildAccountRangeSummaries({
    store,
    accountIds: ["a1"],
    startDayKey: "2026-02-07",
    endDayKey: "2026-02-07",
    currencyType: "USD",
    estimatedTodayIncomeEnabled: true,
  })

  expect(result.summaries[0].incomeTotal).toBe(0.5)
  expect(result.summaries[0].estimatedIncomeTotal).toBe(3)
  expect(result.summaries[0].estimatedIncomeDays).toBe(1)
})
```

- [ ] **Step 2: Run failing selector tests**

Run:

```bash
pnpm vitest related --run tests/services/dailyBalanceHistory/selectors.test.ts
```

Expected: FAIL because selector params and output fields do not exist.

- [ ] **Step 3: Extend selector types and implementation**

Update `src/services/history/dailyBalanceHistory/selectors.ts`:

```ts
export type DailyBalanceHistoryMetric =
  | "balance"
  | "income"
  | "estimatedIncome"
  | "outcome"
  | "net"

interface DailyBalanceHistoryCoverage {
  totalAccounts: number
  snapshotAccounts: number
  cashflowAccounts: number
  estimatedIncomeAccounts: number
}

interface PerAccountDailyBalanceMoneySeries {
  balance: Array<number | null>
  income: Array<number | null>
  estimatedIncome: Array<number | null>
  outcome: Array<number | null>
  net: Array<number | null>
}

interface AccountRangeSummary {
  accountId: string
  startBalance: number | null
  endBalance: number | null
  incomeTotal: number | null
  estimatedIncomeTotal: number | null
  outcomeTotal: number | null
  netTotal: number | null
  snapshotDays: number
  cashflowDays: number
  estimatedIncomeDays: number
  totalDays: number
}
```

Add optional selector params:

```ts
estimatedTodayIncomeEnabled?: boolean
manualBalanceAccountIds?: Set<string>
```

When building per-account series, initialize and fill `estimatedIncome`:

```ts
const estimatedIncome = dayKeys.map(() => null) as Array<number | null>

const estimate = estimateTodayIncomeForAccount({
  enabled: estimatedTodayIncomeEnabled === true,
  store,
  accountId,
  currentDayKey: dayKey,
  hasManualBalance: manualBalanceAccountIds?.has(accountId) === true,
})

if (estimate.status === "available" && estimate.estimatedTodayIncome !== null) {
  coverageByDay[index].estimatedIncomeAccounts += 1
  estimatedIncome[index] =
    (estimate.estimatedTodayIncome / conversionFactor) * exchangeRate
}
```

Return each series as `{ balance, income, estimatedIncome, outcome, net }`.

For aggregate series and summaries, keep existing `income` behavior unchanged. Add estimated totals only from available estimate values.

- [ ] **Step 4: Run selector tests**

Run:

```bash
pnpm vitest related --run tests/services/dailyBalanceHistory/selectors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/history/dailyBalanceHistory/selectors.ts tests/services/dailyBalanceHistory/selectors.test.ts
git commit -m "feat(balance-history): add estimated income selectors"
```

---

### Task 4: Add Balance History Settings And Locale Copy

**Files:**

- Modify: `src/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistorySettings.tsx`
- Modify locale files listed in File Structure.
- Test: `tests/entrypoints/options/BalanceHistorySettings.test.tsx`

- [ ] **Step 1: Add failing settings test**

In `tests/entrypoints/options/BalanceHistorySettings.test.tsx`, update the first test expected payload:

```ts
expect(updateBalanceHistory).toHaveBeenCalledWith({
  enabled: true,
  endOfDayCapture: { enabled: true },
  estimatedTodayIncome: { enabled: false },
  retentionDays: 14,
})
```

Add a toggle test:

```ts
it("saves estimated today income display preference", async () => {
  const updateBalanceHistory = vi.fn().mockResolvedValue(true)
  vi.mocked(useUserPreferencesContext).mockReturnValue({
    preferences: {
      balanceHistory: {
        enabled: true,
        endOfDayCapture: { enabled: false },
        estimatedTodayIncome: { enabled: false },
        retentionDays: 30,
      },
    },
    updateBalanceHistory,
  } as any)

  renderSubject()

  const switches = screen.getAllByRole("switch")
  fireEvent.click(switches[2])
  fireEvent.click(await screen.findByText("balanceHistory:actions.applySettings"))

  await waitFor(() => {
    expect(updateBalanceHistory).toHaveBeenCalledWith({
      enabled: true,
      endOfDayCapture: { enabled: false },
      estimatedTodayIncome: { enabled: true },
      retentionDays: 30,
    })
  })
})
```

- [ ] **Step 2: Run failing settings test**

Run:

```bash
pnpm vitest related --run tests/entrypoints/options/BalanceHistorySettings.test.tsx
```

Expected: FAIL because the third switch and payload field do not exist.

- [ ] **Step 3: Implement the setting**

In `BalanceHistorySettings.tsx`, add local state:

```ts
const [estimatedTodayIncomeEnabled, setEstimatedTodayIncomeEnabled] =
  useState<boolean>(
    preferences.balanceHistory?.estimatedTodayIncome?.enabled ?? false,
  )
```

Update the existing `useEffect`:

```ts
setEstimatedTodayIncomeEnabled(
  preferences.balanceHistory?.estimatedTodayIncome?.enabled ?? false,
)
```

Add the setting to `handleApplySettings()` payload:

```ts
estimatedTodayIncome: { enabled: estimatedTodayIncomeEnabled },
```

Add a `CardItem`-style row matching the current file's structure:

```tsx
<div
  id="balance-history-estimated-today-income"
  className="flex items-center justify-between gap-3"
>
  <div>
    <Label className="text-sm font-medium">
      {t("settings.estimatedTodayIncome")}
    </Label>
    <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
      {t("settings.estimatedTodayIncomeHint")}
    </div>
  </div>
  <Switch
    checked={estimatedTodayIncomeEnabled}
    onChange={setEstimatedTodayIncomeEnabled}
  />
</div>
```

- [ ] **Step 4: Add locale keys**

Add to `src/locales/en/balanceHistory.json` under `settings`:

```json
"estimatedTodayIncome": "Show estimated today income",
"estimatedTodayIncomeHint": "Uses balance history to estimate rewards that do not appear in site income logs. Unavailable when the previous-day baseline is missing."
```

Add matching keys to the other locale files:

```json
// src/locales/zh-CN/balanceHistory.json
"estimatedTodayIncome": "显示估算今日收入",
"estimatedTodayIncomeHint": "基于余额历史估算未进入站点收入日志的奖励；缺少前一日基准快照时不可用。"
```

```json
// src/locales/zh-TW/balanceHistory.json
"estimatedTodayIncome": "顯示估算今日收入",
"estimatedTodayIncomeHint": "基於餘額歷史估算未進入站點收入記錄的獎勵；缺少前一日基準快照時不可用。"
```

```json
// src/locales/ja/balanceHistory.json
"estimatedTodayIncome": "推定の本日収入を表示",
"estimatedTodayIncomeHint": "残高履歴を使って、サイトの収入ログに出ない報酬を推定します。前日の基準スナップショットがない場合は利用できません。"
```

```json
// src/locales/vi/balanceHistory.json
"estimatedTodayIncome": "Hiển thị thu nhập hôm nay ước tính",
"estimatedTodayIncomeHint": "Dùng lịch sử số dư để ước tính phần thưởng không xuất hiện trong nhật ký thu nhập của trang. Không khả dụng khi thiếu ảnh chụp số dư chuẩn của ngày trước."
```

Keep key shapes identical across all locales.

- [ ] **Step 5: Run settings test and i18n check**

Run:

```bash
pnpm vitest related --run tests/entrypoints/options/BalanceHistorySettings.test.tsx
pnpm run i18n:extract:ci
```

Expected: PASS and no unexpected locale extraction diff.

- [ ] **Step 6: Commit**

```bash
git add src/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistorySettings.tsx src/locales/en/balanceHistory.json src/locales/zh-CN/balanceHistory.json src/locales/zh-TW/balanceHistory.json src/locales/ja/balanceHistory.json src/locales/vi/balanceHistory.json tests/entrypoints/options/BalanceHistorySettings.test.tsx
git commit -m "feat(balance-history): add estimated income setting"
```

---

### Task 5: Wire Estimated Income Into Balance History UI

**Files:**

- Modify: `src/features/BalanceHistory/BalanceHistory.tsx`
- Modify: `src/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.tsx`
- Modify locale files listed in File Structure for `balanceHistory.json`
- Test: `tests/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.test.tsx`

- [ ] **Step 1: Add failing table test**

In `tests/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.test.tsx`, add:

```tsx
it("renders estimated income column only when enabled", () => {
  const rows = [
    buildRow({
      estimatedIncomeTotal: 3,
      estimatedIncomeDays: 1,
    } as any),
  ]

  const { rerender } = render(
    <BalanceHistoryAccountSummaryTable
      rows={rows as any}
      isLoading={false}
      currencySymbol="$"
      showEstimatedIncome={false}
    />,
  )

  expect(
    screen.queryByText("balanceHistory:table.columns.estimatedIncomeTotal"),
  ).not.toBeInTheDocument()

  rerender(
    <BalanceHistoryAccountSummaryTable
      rows={rows as any}
      isLoading={false}
      currencySymbol="$"
      showEstimatedIncome
    />,
  )

  expect(
    screen.getByText("balanceHistory:table.columns.estimatedIncomeTotal"),
  ).toBeInTheDocument()
  expect(screen.getByText("$3.00")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run failing table test**

Run:

```bash
pnpm vitest related --run tests/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.test.tsx
```

Expected: FAIL because the prop and columns do not exist.

- [ ] **Step 3: Update table row and prop types**

In `BalanceHistoryAccountSummaryTable.tsx`:

```ts
export type BalanceHistoryAccountSummaryRow = {
  id: string
  label: string
  startBalance: number | null
  endBalance: number | null
  netTotal: number | null
  incomeTotal: number | null
  estimatedIncomeTotal: number | null
  outcomeTotal: number | null
  snapshotDays: number
  cashflowDays: number
  estimatedIncomeDays: number
  totalDays: number
}

interface BalanceHistoryAccountSummaryTableProps {
  rows: BalanceHistoryAccountSummaryRow[]
  isLoading: boolean
  currencySymbol: string
  showEstimatedIncome?: boolean
}
```

Add the column after trusted income when `showEstimatedIncome` is true:

```ts
...(showEstimatedIncome
  ? [
      {
        accessorKey: "estimatedIncomeTotal",
        header: t("table.columns.estimatedIncomeTotal"),
        cell: ({ row }: { row: Row<BalanceHistoryAccountSummaryRow> }) => (
          <div className="text-sm">
            {formatMoney(row.original.estimatedIncomeTotal)}
          </div>
        ),
        sortingFn: sortNullableNumber,
      } satisfies ColumnDef<BalanceHistoryAccountSummaryRow, unknown>,
    ]
  : []),
```

- [ ] **Step 4: Wire Balance History page**

In `BalanceHistory.tsx`, compute:

```ts
const estimatedTodayIncomeEnabled =
  preferences.balanceHistory?.estimatedTodayIncome?.enabled === true
const manualBalanceAccountIds = useMemo(
  () =>
    new Set(
      accounts
        .filter(
          (account) =>
            typeof account.manualBalanceUsd === "string" &&
            account.manualBalanceUsd.trim().length > 0,
        )
        .map((account) => account.id),
    ),
  [accounts],
)
```

Pass to selectors:

```ts
estimatedTodayIncomeEnabled,
manualBalanceAccountIds,
```

Add `estimatedIncome` to `getBalanceHistoryMetricLabel()`:

```ts
case "estimatedIncome":
  return t("balanceHistory:metrics.estimatedIncome")
```

Include metric menu items only when enabled:

```tsx
{estimatedTodayIncomeEnabled && (
  <DropdownMenuRadioItem value="estimatedIncome">
    {t("metrics.estimatedIncome")}
  </DropdownMenuRadioItem>
)}
```

Pass table props:

```tsx
<BalanceHistoryAccountSummaryTable
  rows={tableRows}
  isLoading={isLoading}
  currencySymbol={currencySymbol}
  showEstimatedIncome={estimatedTodayIncomeEnabled}
/>
```

When building `tableRows`, include:

```ts
estimatedIncomeTotal: summary.estimatedIncomeTotal,
estimatedIncomeDays: summary.estimatedIncomeDays,
```

- [ ] **Step 5: Add Balance History locale keys**

Add to `src/locales/en/balanceHistory.json`:

```json
"metrics": {
  "estimatedIncome": "Estimated income"
},
"table": {
  "columns": {
    "estimatedIncomeTotal": "Estimated income total"
  }
}
```

Add matching keys to the other locale files:

```json
// src/locales/zh-CN/balanceHistory.json
"metrics": {
  "estimatedIncome": "估算收入"
},
"table": {
  "columns": {
    "estimatedIncomeTotal": "估算收入合计"
  }
}
```

```json
// src/locales/zh-TW/balanceHistory.json
"metrics": {
  "estimatedIncome": "估算收入"
},
"table": {
  "columns": {
    "estimatedIncomeTotal": "估算收入合計"
  }
}
```

```json
// src/locales/ja/balanceHistory.json
"metrics": {
  "estimatedIncome": "推定収入"
},
"table": {
  "columns": {
    "estimatedIncomeTotal": "推定収入合計"
  }
}
```

```json
// src/locales/vi/balanceHistory.json
"metrics": {
  "estimatedIncome": "Thu nhập ước tính"
},
"table": {
  "columns": {
    "estimatedIncomeTotal": "Tổng thu nhập ước tính"
  }
}
```

Preserve all existing keys and localized meaning.

- [ ] **Step 6: Run Balance History tests**

Run:

```bash
pnpm vitest related --run tests/services/dailyBalanceHistory/selectors.test.ts tests/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.test.tsx
pnpm run i18n:extract:ci
```

Expected: PASS and no unexpected locale extraction diff.

- [ ] **Step 7: Commit**

```bash
git add src/services/history/dailyBalanceHistory/selectors.ts src/features/BalanceHistory/BalanceHistory.tsx src/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.tsx src/locales/en/balanceHistory.json src/locales/zh-CN/balanceHistory.json src/locales/zh-TW/balanceHistory.json src/locales/ja/balanceHistory.json src/locales/vi/balanceHistory.json tests/services/dailyBalanceHistory/selectors.test.ts tests/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.test.tsx
git commit -m "feat(balance-history): show estimated income metric"
```

---

### Task 6: Wire Estimated Income Into Popup

**Files:**

- Modify: `src/features/AccountManagement/hooks/AccountDataContext.tsx`
- Modify: `src/entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx`
- Modify account locale files listed in File Structure
- Test: `tests/entrypoints/popup/BalanceSection.test.tsx`

- [ ] **Step 1: Add failing Popup tests**

In `tests/entrypoints/popup/BalanceSection.test.tsx`, extend `createAccountDataContextValue()` with:

```ts
todayIncomeEstimateTotals: {
  trusted: { USD: 1.25, CNY: 8.75 },
  estimated: null,
  availableAccounts: 0,
  totalAccounts: 1,
},
```

Add tests:

```tsx
it("keeps one income card when estimated income display is disabled", () => {
  mockUseUserPreferencesContext.mockReturnValue({
    currencyType: "USD",
    showTodayCashflow: true,
    updateCurrencyType: vi.fn(),
    preferences: {
      balanceHistory: {
        estimatedTodayIncome: { enabled: false },
      },
    },
  })

  render(<AccountBalanceSummary />)

  expect(screen.getByText("account:stats.todayIncome")).toBeInTheDocument()
  expect(
    screen.queryByText("account:stats.estimatedTodayIncome"),
  ).not.toBeInTheDocument()
})

it("shows trusted and estimated today income when enabled", () => {
  mockUseUserPreferencesContext.mockReturnValue({
    currencyType: "USD",
    showTodayCashflow: true,
    updateCurrencyType: vi.fn(),
    preferences: {
      balanceHistory: {
        estimatedTodayIncome: { enabled: true },
      },
    },
  })
  mockUseAccountDataContext.mockReturnValue(
    createAccountDataContextValue({
      todayIncomeEstimateTotals: {
        trusted: { USD: 1.25, CNY: 8.75 },
        estimated: { USD: 2.75, CNY: 19.25 },
        availableAccounts: 1,
        totalAccounts: 1,
      },
    }),
  )

  render(<AccountBalanceSummary />)

  expect(screen.getByText("account:stats.trustedTodayIncome")).toBeInTheDocument()
  expect(screen.getByText("account:stats.estimatedTodayIncome")).toBeInTheDocument()
  expect(screen.getAllByTestId("countup").at(-1)).toHaveAttribute("data-end", "2.75")
})
```

- [ ] **Step 2: Run failing Popup test**

Run:

```bash
pnpm vitest related --run tests/entrypoints/popup/BalanceSection.test.tsx
```

Expected: FAIL because context field and labels do not exist.

- [ ] **Step 3: Extend AccountDataContext**

In `AccountDataContext.tsx`, import:

```ts
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { getDayKeyFromUnixSeconds } from "~/services/history/dailyBalanceHistory/dayKeys"
import { buildEstimatedTodayIncomeMoneyTotals } from "~/services/history/dailyBalanceHistory/todayIncomeEstimate"
```

Add to `AccountDataContextType`:

```ts
todayIncomeEstimateTotals: {
  trusted: CurrencyAmount
  estimated: CurrencyAmount | null
  availableAccounts: number
  totalAccounts: number
}
```

Add state default:

```ts
const [todayIncomeEstimateTotals, setTodayIncomeEstimateTotals] = useState({
  trusted: { USD: 0, CNY: 0 },
  estimated: null,
  availableAccounts: 0,
  totalAccounts: 0,
})
```

In `loadAccountData()`, include the daily balance store:

```ts
const [
  allAccounts,
  allBookmarks,
  storedOrderedIds,
  accountStats,
  currentTagStore,
  pinnedIds,
  balanceHistoryStore,
] = await Promise.all([
  accountStorage.getAllAccounts(),
  accountStorage.getAllBookmarks(),
  accountStorage.getOrderedList(),
  accountStorage.getAccountStats(),
  tagStorage.getTagStore(),
  accountStorage.getPinnedList(),
  dailyBalanceHistoryStorage.getStore(),
])
```

Compute and set totals:

```ts
const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
const enabledAccounts = allAccounts.filter((account) => account.disabled !== true)
setTodayIncomeEstimateTotals(
  buildEstimatedTodayIncomeMoneyTotals({
    enabled:
      preferences.balanceHistory?.estimatedTodayIncome?.enabled === true,
    store: balanceHistoryStore,
    accounts: enabledAccounts,
    currentDayKey: todayKey,
  }),
)
```

Include `preferences` from `useUserPreferencesContext()` and add it to `loadAccountData` dependencies. Add `todayIncomeEstimateTotals` to the provider value and memo dependencies.

- [ ] **Step 4: Update Popup component**

In `AccountBalanceSummary.tsx`, read:

```ts
const {
  accounts,
  displayData,
  stats,
  isInitialLoad,
  prevTotalConsumption,
  todayIncomeEstimateTotals,
} = useAccountDataContext()
const { currencyType, showTodayCashflow, updateCurrencyType, preferences } =
  useUserPreferencesContext()
const estimatedTodayIncomeEnabled =
  preferences.balanceHistory?.estimatedTodayIncome?.enabled === true
```

When disabled, keep the current two-column layout. When enabled, use a three-column grid:

```tsx
<div
  className={
    estimatedTodayIncomeEnabled
      ? "grid grid-cols-1 gap-3 sm:grid-cols-3"
      : "grid grid-cols-2 gap-3"
  }
>
```

For trusted income label:

```tsx
{estimatedTodayIncomeEnabled
  ? t("account:stats.trustedTodayIncome")
  : t("account:stats.todayIncome")}
```

Add estimated card only when enabled:

```tsx
{estimatedTodayIncomeEnabled && (
  <div className="space-y-1">
    <Caption className="font-medium">
      {t("account:stats.estimatedTodayIncome")}
    </Caption>
    {todayIncomeEstimateTotals.estimated ? (
      <BalanceDisplay
        value={todayIncomeEstimateTotals.estimated[currencyType]}
        startValue={0}
        isInitialLoad={isInitialLoad}
        currencyType={currencyType}
        onCurrencyToggle={handleCurrencyToggle}
        prefix={
          todayIncomeEstimateTotals.estimated[currencyType] > 0 ? "+" : ""
        }
        size="md"
      />
    ) : (
      <div className="dark:text-dark-text-tertiary text-2xl font-bold text-gray-500">
        -
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Add account locale keys**

Add to `src/locales/en/account.json` under `stats`:

```json
"trustedTodayIncome": "Trusted income",
"estimatedTodayIncome": "Estimated income"
```

Add matching keys to the other locale files:

```json
// src/locales/zh-CN/account.json
"trustedTodayIncome": "可信收入",
"estimatedTodayIncome": "估算收入"
```

```json
// src/locales/zh-TW/account.json
"trustedTodayIncome": "可信收入",
"estimatedTodayIncome": "估算收入"
```

```json
// src/locales/ja/account.json
"trustedTodayIncome": "信頼済み収入",
"estimatedTodayIncome": "推定収入"
```

```json
// src/locales/vi/account.json
"trustedTodayIncome": "Thu nhập tin cậy",
"estimatedTodayIncome": "Thu nhập ước tính"
```

Keep key shape identical across locales.

- [ ] **Step 6: Run Popup tests and i18n check**

Run:

```bash
pnpm vitest related --run tests/entrypoints/popup/BalanceSection.test.tsx
pnpm run i18n:extract:ci
```

Expected: PASS and no unexpected locale extraction diff.

- [ ] **Step 7: Commit**

```bash
git add src/features/AccountManagement/hooks/AccountDataContext.tsx src/entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx src/locales/en/account.json src/locales/zh-CN/account.json src/locales/zh-TW/account.json src/locales/ja/account.json src/locales/vi/account.json tests/entrypoints/popup/BalanceSection.test.tsx
git commit -m "feat(popup): show estimated today income"
```

---

### Task 7: Final Validation

**Files:**

- No new implementation files. This task verifies the integrated change.

- [ ] **Step 1: Run focused related tests**

Run:

```bash
pnpm vitest related --run tests/services/configMigration/preferences/preferencesMigration.test.ts tests/contexts/UserPreferencesContext.test.tsx tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts tests/services/dailyBalanceHistory/selectors.test.ts tests/entrypoints/options/BalanceHistorySettings.test.tsx tests/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.test.tsx tests/entrypoints/popup/BalanceSection.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript compile**

Run:

```bash
pnpm compile
```

Expected: PASS.

- [ ] **Step 3: Run i18n extraction check**

Run:

```bash
pnpm run i18n:extract:ci
```

Expected: PASS with no unexpected locale file rewrites.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat
git diff --check
git status --porcelain=v1
```

Expected:

- `git diff --check` reports no whitespace errors.
- Only task-scoped files are modified or staged.
- Pre-existing unrelated untracked files such as `notify.py` and `store-description/` remain untracked and untouched.

- [ ] **Step 5: Stage task files and run staged validation**

Stage only task-scoped files:

```bash
git add src/types/dailyBalanceHistory.ts src/services/preferences/migrations/preferencesMigration.ts src/services/history/dailyBalanceHistory/todayIncomeEstimate.ts src/services/history/dailyBalanceHistory/selectors.ts src/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistorySettings.tsx src/features/BalanceHistory/BalanceHistory.tsx src/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.tsx src/features/AccountManagement/hooks/AccountDataContext.tsx src/entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx src/locales/en/balanceHistory.json src/locales/zh-CN/balanceHistory.json src/locales/zh-TW/balanceHistory.json src/locales/ja/balanceHistory.json src/locales/vi/balanceHistory.json src/locales/en/account.json src/locales/zh-CN/account.json src/locales/zh-TW/account.json src/locales/ja/account.json src/locales/vi/account.json tests/services/configMigration/preferences/preferencesMigration.test.ts tests/contexts/UserPreferencesContext.test.tsx tests/services/dailyBalanceHistory/todayIncomeEstimate.test.ts tests/services/dailyBalanceHistory/selectors.test.ts tests/entrypoints/options/BalanceHistorySettings.test.tsx tests/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable.test.tsx tests/entrypoints/popup/BalanceSection.test.tsx
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 6: Commit remaining integration changes**

If any task-scoped changes remain uncommitted after task commits and validation passes:

```bash
git commit -m "feat(balance-history): estimate today income from balance snapshots"
```

Expected: commit succeeds and hooks pass.
