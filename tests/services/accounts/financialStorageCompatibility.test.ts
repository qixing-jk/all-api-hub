import { beforeEach, expect, it, onTestFinished, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { DATA_TYPE_BALANCE } from "~/constants"
import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { BACKUP_VERSION } from "~/constants/importExport"
import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
} from "~/services/accounts/allowances"
import {
  accountBalanceObservation,
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { AccountUpdateUserTimestampMode } from "~/services/accounts/editing/accountDefaults"
import { getDisplayBalancePortfolio } from "~/services/accounts/metrics/balanceProjection"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
  getReferenceCashflowTotal,
} from "~/services/accounts/metrics/consumptionProjection"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import { balancePosition } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  INCOME_CLASSIFICATIONS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  ACCOUNT_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { importV2AccountsWithReplace } from "~/services/importExport/accountImport"
import {
  normalizeBackupForMerge,
  parseBackupSummary,
} from "~/services/importExport/backupCodec"
import { importV1Backup } from "~/services/importExport/legacyImport"
import { createDynamicSortComparator } from "~/services/preferences/utils/sortingPriority"
import { publicConsumptionSummary } from "~/services/sharing/shareSnapshots/consumptionSummary"
import { tagStorage } from "~/services/tags/tagStorage"
import { SiteHealthStatus, type AccountUsageSummary } from "~/types"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"
import {
  buildPeriodConsumption,
  buildPeriodIncome,
} from "~~/tests/test-utils/financialPeriod"

const storage = new Storage({ area: "local" })
beforeEach(async () => {
  await accountDataTransfer.clearAllData()
})

it.each(["site URL", "upstream user ID", "cashflow-only site URL"] as const)(
  "keeps previous-account reference cashflow last-known after changing %s and subsequent refreshes",
  async (identityChange) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 10, 20, 12))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const observedAt = Date.now()
    const raw = buildSiteAccount({
      site_type: SITE_TYPES.NEW_API,
      site_url: "https://before.example",
      last_sync_time: observedAt,
    })
    raw.account_info.today_quota_consumption = 1_000_000
    raw.account_info.today_income = 1_500_000
    if (identityChange === "cashflow-only site URL") {
      delete raw.account_info.quota
      raw.account_info.legacyFinancial = {
        schemaVersion: 1,
        capturedAt: observedAt,
        cashflow: { consumption: 1_000_000, income: 1_500_000 },
      }
    }
    const id = await accountMutations.addAccount(raw)
    const original = (await accountQueries.getAccountById(id))!
    const originalEvidence = original.account_info.legacyFinancial!
    const originalDisplay = accountPresentation.convertToDisplayData(original)
    expect(originalDisplay.referenceConsumption).toMatchObject({
      amount: { USD: 2 },
      observedAt,
      lastKnown: false,
    })
    expect(
      await accountMutations.updateAccount(
        id,
        identityChange === "upstream user ID"
          ? { account_info: { id: "different-upstream-user" } }
          : { site_url: "https://after.example" },
        { userTimestampMode: AccountUpdateUserTimestampMode.Touch },
      ),
    ).toBe(true)

    const assertLastKnownReferences = async () => {
      const saved = (await accountQueries.getAccountById(id))!
      expect(saved.account_info.legacyFinancial).toMatchObject({
        capturedAt: originalEvidence.capturedAt,
        cashflow: originalEvidence.cashflow,
      })
      const display = accountPresentation.convertToDisplayData(saved)
      expect(display.referenceConsumption).toMatchObject({
        amount: { USD: 2 },
        observedAt,
        lastKnown: true,
      })
      expect(display.referenceIncome).toMatchObject({
        amount: { USD: 3 },
        observedAt,
        lastKnown: true,
      })
      const consumption = getDisplayConsumptionProjection([display])
      const income = getDisplayIncomeProjection([display])
      expect(getReferenceCashflowTotal(consumption, "USD")).toBeUndefined()
      expect(getReferenceCashflowTotal(income, "USD")).toBeUndefined()
      expect(publicConsumptionSummary(consumption).references).toMatchObject([
        { amount: { USD: 2 }, observedAt, lastKnown: true },
      ])
      expect(publicConsumptionSummary(income).references).toMatchObject([
        { amount: { USD: 3 }, observedAt, lastKnown: true },
      ])
      return saved
    }
    let request = await assertLastKnownReferences()

    vi.setSystemTime(new Date(observedAt + 60_000))
    const unknownCost = buildPeriodConsumption(id, "0")
    unknownCost.amount = {
      status: OBSERVATION_STATUSES.Unknown,
      reason: "request-failed",
      source: unknownCost.amount.source,
    }
    const unknownIncome = buildPeriodIncome(id, "0")
    unknownIncome.amount = { ...unknownCost.amount }
    let generation = (await accountMutations.beginBalanceRefresh(id, request))!
    await accountMutations.updateAccountFromRefresh(
      id,
      {
        health: { status: SiteHealthStatus.Healthy },
        last_sync_time: Date.now(),
        account_info: {
          settledConsumption: [unknownCost],
          reportedIncome: [unknownIncome],
          todayStatsAvailability: {
            consumption: { status: "complete" },
            income: { status: "complete" },
          },
        },
      },
      undefined,
      request,
      undefined,
      generation,
    )
    request = await assertLastKnownReferences()

    // A verified reading for the new account replaces the reference display;
    // a later failure retains the new reading rather than reviving the old one.
    const cost = buildPeriodConsumption(id, "4")
    const income = buildPeriodIncome(id, "5")
    generation = (await accountMutations.beginBalanceRefresh(id, request))!
    await accountMutations.updateAccountFromRefresh(
      id,
      {
        account_info: { settledConsumption: [cost], reportedIncome: [income] },
      },
      undefined,
      request,
      undefined,
      generation,
    )
    request = (await accountQueries.getAccountById(id))!
    let display = accountPresentation.convertToDisplayData(request)
    expect(display.referenceConsumption).toBeUndefined()
    expect(display.referenceIncome).toBeUndefined()
    expect(
      getDisplayConsumptionProjection([display]).groups[0]?.amount.value,
    ).toBe("4")
    expect(getDisplayIncomeProjection([display]).groups[0]?.amount.value).toBe(
      "5",
    )
    generation = (await accountMutations.beginBalanceRefresh(id, request))!
    await accountMutations.updateAccountFromRefresh(
      id,
      {},
      undefined,
      request,
      undefined,
      generation,
    )
    display = accountPresentation.convertToDisplayData(
      (await accountQueries.getAccountById(id))!,
    )
    expect(display.referenceConsumption).toBeUndefined()
    expect(display.referenceIncome).toBeUndefined()
    expect(display.settledConsumption?.[0]?.amount).toMatchObject({
      status: "stale",
      value: "4",
    })
    expect(display.reportedIncome?.[0]?.amount).toMatchObject({
      status: "stale",
      value: "5",
    })
  },
)

function allowanceFixture(account: ReturnType<typeof buildSiteAccount>) {
  const scope = accountBalanceScope({
    baseUrl: account.site_url,
    accountId: account.id,
  })
  const source = {
    adapter: "fixture",
    operation: "plans",
    contractVersion: "1",
    kind: EVIDENCE_KINDS.Reported,
  }
  return accountAllowanceObservation(
    scope,
    [
      {
        source,
        collectionKey: "plans",
        enumeration: FINANCIAL_ENUMERATION.Complete,
        entries: [
          {
            id: "plan",
            identityKind: ALLOWANCE_IDENTITY_KINDS.Upstream,
            collectionKey: "plans",
            validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
            constraint: budgetConstraint({
              source,
              scope,
              observedAt: 100,
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              limitState: BUDGET_LIMIT_STATES.Finite,
              remaining: 20,
            }),
          },
        ],
      },
    ],
    100,
  )
}

it("writes the native snapshot without legacy amount fields and preserves their original evidence", async () => {
  const account = buildSiteAccount({ last_sync_time: 100 })
  const scope = accountBalanceScope({
    baseUrl: account.site_url,
    accountId: account.id,
  })
  account.account_info.balance = accountBalanceSnapshot(
    scope,
    [
      balancePosition({
        id: "wallet",
        scope,
        value: "7.123456789",
        observedAt: 100,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        source: {
          adapter: "fixture",
          operation: "balance",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
      }),
    ],
    100,
    FINANCIAL_COVERAGE.Complete,
  )
  account.account_info.quota = 123456
  const id = await accountMutations.addAccount(account)
  const read = (await accountQueries.getAccountById(id))!
  expect(read.account_info.balance?.positions[0]?.amount).toMatchObject({
    value: "7.123456789",
  })
  const exported = await accountDataTransfer.exportData()
  const stored = exported.accounts.find((item) => item.id === id)!.account_info
  expect(stored).not.toHaveProperty("quota")
  expect(stored).not.toHaveProperty("nativeBalance")
  expect(stored).toMatchObject({
    legacyFinancial: { quota: 123456, capturedAt: 100 },
  })
  expect(await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)).toMatchObject({
    accounts: [
      expect.objectContaining({
        account_info: expect.not.objectContaining({ quota: 123456 }),
      }),
    ],
  })
})

it.each([
  { schemaVersion: 99, accounts: [buildSiteAccount()], bookmarks: [] },
  { schemaVersion: 1, accounts: "damaged", bookmarks: [] },
  { accounts: [buildSiteAccount({ configVersion: 999 })] },
])(
  "rejects unknown or damaged stored envelopes without rewriting or exporting empty data: %j",
  async (raw) => {
    await withExtensionStorageWriteLock(STORAGE_LOCKS.ACCOUNT_STORAGE, () =>
      storage.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, raw),
    )
    await expect(accountDataTransfer.exportData()).rejects.toThrow()
    await expect(
      accountDataTransfer.importData({ accounts: [] }),
    ).rejects.toThrow()
    expect(await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)).toEqual(raw)
  },
)

it("invalidates an in-flight financial refresh when an older backup restores the same account", async () => {
  const id = await accountMutations.addAccount(buildSiteAccount())
  const backup = await accountDataTransfer.exportData()
  const request = (await accountQueries.getAccountById(id))!
  const generation = (await accountMutations.beginBalanceRefresh(id, request))!
  await accountDataTransfer.importData(backup)
  const late = await accountMutations.updateAccountFromRefresh(
    id,
    { notes: "late result" },
    undefined,
    request,
    undefined,
    generation,
  )
  expect(late).toBeNull()
  expect((await accountQueries.getAccountById(id))?.notes).not.toBe(
    "late result",
  )
  const restored = (await accountQueries.getAccountById(id))!
  expect(
    await accountMutations.beginBalanceRefresh(id, restored),
  ).toBeGreaterThan(generation)
})

it("persists both native allowance windows and binds them to the saved account", async () => {
  const account = buildSiteAccount()
  const scope = accountBalanceScope({
    baseUrl: account.site_url,
    accountId: account.id,
  })
  const source = {
    adapter: "fixture",
    operation: "plans",
    contractVersion: "1",
    kind: EVIDENCE_KINDS.Reported,
  }
  account.account_info.allowances = accountAllowanceObservation(
    scope,
    [
      {
        collectionKey: "plans",
        source,
        enumeration: FINANCIAL_ENUMERATION.Complete,
        entries: ["day", "week"].map((period, index) => ({
          id: `plan:${period}`,
          identityKind: "upstream" as const,
          collectionKey: "plans",
          validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
          constraint: budgetConstraint({
            source,
            scope,
            observedAt: 100,
            asset: {
              kind: ASSET_KINDS.Quota,
              id: "fixture:tokens",
              label: "Token",
              displayScale: 1,
              displayLabel: "Token",
            },
            limitState: BUDGET_LIMIT_STATES.Finite,
            remaining: index === 0 ? 20 : 90,
            window: {
              kind: BUDGET_WINDOW_KINDS.Unknown,
              period: period as (typeof BUDGET_PERIODS)["Day" | "Week"],
            },
          }),
        })),
      },
    ],
    100,
  ).allowances
  const id = await accountMutations.addAccount(account)
  const stored = (await accountQueries.getAccountById(id))!.account_info
    .allowances
  expect(stored?.entries.map((entry) => entry.constraint.remaining)).toEqual([
    expect.objectContaining({ value: "20", observedAt: 100 }),
    expect.objectContaining({ value: "90", observedAt: 100 }),
  ])
  expect(
    stored?.entries.every(
      (entry) =>
        entry.constraint.scope.subject.kind === "account" &&
        entry.constraint.scope.subject.accountId === id,
    ),
  ).toBe(true)
})

it("retains failed allowance observations as stale and removes only a complete empty collection", async () => {
  const account = buildSiteAccount()
  account.account_info.allowances = allowanceFixture(account).allowances
  const id = await accountMutations.addAccount(account)
  const request = (await accountQueries.getAccountById(id))!
  const generation = (await accountMutations.beginBalanceRefresh(id, request))!
  await accountMutations.updateAccountFromRefresh(
    id,
    {},
    undefined,
    request,
    undefined,
    generation,
  )
  const stale = (await accountQueries.getAccountById(id))!
  expect(
    stale.account_info.allowances?.entries[0]?.constraint.remaining,
  ).toMatchObject({ status: "stale", value: "20", observedAt: 100 })
  expect(
    stale.account_info.allowances?.entries[0]?.constraint.stateObservation,
  ).toMatchObject({ status: "stale", observedAt: 100 })
  const nextGeneration = (await accountMutations.beginBalanceRefresh(
    id,
    stale,
  ))!
  const part = allowanceFixture(stale).allowanceRefreshParts[0]!
  await accountMutations.updateAccountFromRefresh(
    id,
    {},
    undefined,
    stale,
    { allowanceRefreshParts: [{ ...part, entries: [] }] },
    nextGeneration,
  )
  expect(
    (await accountQueries.getAccountById(id))?.account_info.allowances?.entries,
  ).toEqual([])
})

it("keeps independent native usage windows and allowance facts through refresh, backup, and display", async () => {
  const id = await accountMutations.addAccount(buildSiteAccount())
  const request = (await accountQueries.getAccountById(id))!
  const source = {
    adapter: "fixture",
    operation: "usage",
    contractVersion: "1",
    kind: EVIDENCE_KINDS.Reported,
  }
  const scope = accountBalanceScope({
    baseUrl: request.site_url,
    accountId: id,
  })
  const usageObservations: AccountUsageSummary[] = [
    "0.000000000000017",
    "7.123456789",
  ].map((value, index) => ({
    scope: index === 0 ? "rolling_window" : "lifetime",
    cost: {
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      scope,
      amount: {
        status: OBSERVATION_STATUSES.Known,
        value,
        source,
        observedAt: 100 + index,
      },
    },
  }))
  const data = {
    ...request.account_info,
    ...allowanceFixture(request),
    usageObservations,
    checkIn: request.checkIn,
  }
  const generation = (await accountMutations.beginBalanceRefresh(id, request))!
  const patch = buildAccountRefreshUpdate(
    request,
    {
      success: true,
      data,
      healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
    },
    false,
  )
  const accepted = await accountMutations.updateAccountFromRefresh(
    id,
    patch,
    undefined,
    request,
    data,
    generation,
  )
  expect(accepted?.account_info.usageObservations).toMatchObject(
    usageObservations,
  )
  for (const usage of accepted?.account_info.usageObservations ?? []) {
    expect(usage.observedAt).toEqual(expect.any(Number))
    expect(usage.lastKnown).toBe(false)
  }
  const exported = await accountDataTransfer.exportData()
  const saved = exported.accounts.find((item) => item.id === id)!
  expect(saved.account_info.usageObservations).toEqual(
    accepted?.account_info.usageObservations,
  )
  const display = accountPresentation.convertToDisplayData(saved)
  expect(display).toMatchObject({
    usageObservations,
    allowances: { entries: data.allowances.entries },
  })
})

it("keeps a manual selection separate from the reported snapshot without producing legacy refresh or display amounts", async () => {
  const account = buildSiteAccount({ manualBalanceUsd: "12" })
  const data = { ...account.account_info, checkIn: account.checkIn }
  const update = buildAccountRefreshUpdate(
    account,
    {
      success: true,
      data,
      healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
    },
    false,
  )
  expect(update.account_info).not.toHaveProperty("quota")
  expect(update.account_info).not.toHaveProperty("nativeBalance")
  expect(update.account_info).not.toHaveProperty("balanceUnavailable")
  const id = await accountMutations.addAccount(account)
  const saved = (await accountQueries.getAccountById(id))!
  const display = accountPresentation.convertToDisplayData(saved)
  expect(display).not.toHaveProperty("balance")
  expect(display).not.toHaveProperty("nativeBalance")
  expect(display.manualBalanceSnapshot?.positions[0]?.amount).toMatchObject({
    value: "12",
  })
})

it("removes a manual selection without inventing legacy zero evidence or changing the reported funds", async () => {
  const account = buildSiteAccount({ manualBalanceUsd: "12" })
  delete account.account_info.quota
  const scope = accountBalanceScope({
    baseUrl: account.site_url,
    accountId: account.id,
  })
  account.account_info.balance = accountBalanceSnapshot(
    scope,
    [
      balancePosition({
        id: "funds",
        scope,
        value: "7",
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        observedAt: 100,
        source: {
          kind: EVIDENCE_KINDS.Reported,
          adapter: "fixture",
          operation: "balance",
          contractVersion: "1",
        },
      }),
    ],
    100,
    FINANCIAL_COVERAGE.Complete,
  )
  const id = await accountMutations.addAccount(account)
  await accountMutations.updateAccount(
    id,
    { manualBalanceUsd: "" },
    { userTimestampMode: AccountUpdateUserTimestampMode.Touch },
  )
  const stored = (await accountQueries.getAccountById(id))!
  expect(stored.account_info).not.toHaveProperty("legacyFinancial")
  expect(stored.account_info.balance?.positions[0]?.amount).toMatchObject({
    status: "known",
    value: "7",
    observedAt: 100,
  })
  expect(
    accountPresentation.convertToDisplayData(stored).manualBalanceSnapshot,
  ).toBeUndefined()
})

it.each([
  { schemaVersion: 99, accounts: [] },
  { schemaVersion: 1, accounts: null },
  { accounts: [buildSiteAccount({ configVersion: 999 })] },
])(
  "rejects an unsupported incoming backup without writing over the existing envelope: %j",
  async (incoming) => {
    await accountMutations.addAccount(buildSiteAccount())
    const before = await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
    await expect(
      accountDataTransfer.importData(incoming as never),
    ).rejects.toThrow()
    expect(await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)).toEqual(before)
  },
)

it("does not reuse an old allowance number after its reported asset changes", async () => {
  const account = buildSiteAccount()
  account.account_info.allowances = allowanceFixture(account).allowances
  const id = await accountMutations.addAccount(account)
  const request = (await accountQueries.getAccountById(id))!
  const part = allowanceFixture(request).allowanceRefreshParts[0]!
  const oldEntry = part.entries[0]!
  const next = {
    ...oldEntry,
    constraint: budgetConstraint({
      source: part.source,
      scope: oldEntry.constraint.scope,
      observedAt: 200,
      asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
      limitState: BUDGET_LIMIT_STATES.Finite,
    }),
  }
  const generation = (await accountMutations.beginBalanceRefresh(id, request))!
  await accountMutations.updateAccountFromRefresh(
    id,
    {},
    undefined,
    request,
    { allowanceRefreshParts: [{ ...part, entries: [next] }] },
    generation,
  )
  const read = (await accountQueries.getAccountById(id))!
  expect(read.account_info.allowances?.entries).toHaveLength(1)
  expect(read.account_info.allowances?.entries[0]?.constraint.asset).toEqual({
    kind: "crypto",
    id: "XNO",
  })
  expect(
    read.account_info.allowances?.entries[0]?.constraint.remaining,
  ).not.toHaveProperty("value")
})

it("rejects future account envelopes at backup preview, merge, and replace boundaries", async () => {
  const future = {
    version: BACKUP_VERSION,
    timestamp: 100,
    accounts: { schemaVersion: 99, accounts: [] },
  }
  expect(parseBackupSummary(JSON.stringify(future), "unknown")).toEqual({
    valid: false,
  })
  expect(() => normalizeBackupForMerge(future, null)).toThrow()
  await accountMutations.addAccount(buildSiteAccount())
  const before = await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
  await expect(importV2AccountsWithReplace(future as never)).rejects.toThrow()
  expect(await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)).toEqual(before)
})

it.each([
  FINANCIAL_ENUMERATION.Unavailable,
  FINANCIAL_ENUMERATION.NotRequested,
] as const)(
  "ignores allowance entries from a %s collection",
  async (enumeration) => {
    const account = buildSiteAccount()
    account.account_info.allowances = allowanceFixture(account).allowances
    const id = await accountMutations.addAccount(account)
    const request = (await accountQueries.getAccountById(id))!
    const part = allowanceFixture(request).allowanceRefreshParts[0]!
    part.entries[0]!.constraint.remaining = {
      ...part.entries[0]!.constraint.remaining,
      status: OBSERVATION_STATUSES.Known,
      value: "999",
      observedAt: 200,
    }
    const generation = (await accountMutations.beginBalanceRefresh(
      id,
      request,
    ))!
    await accountMutations.updateAccountFromRefresh(
      id,
      {},
      undefined,
      request,
      { allowanceRefreshParts: [{ ...part, enumeration }] },
      generation,
    )
    expect(
      (await accountQueries.getAccountById(id))?.account_info.allowances
        ?.entries[0]?.constraint.remaining,
    ).toMatchObject({
      status: "stale",
      value: "20",
      observedAt: 100,
    })
  },
)

it("rejects an allowance collection with a mismatched evidence source", async () => {
  const id = await accountMutations.addAccount(buildSiteAccount())
  const request = (await accountQueries.getAccountById(id))!
  const part = allowanceFixture(request).allowanceRefreshParts[0]!
  const generation = (await accountMutations.beginBalanceRefresh(id, request))!
  const before = await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
  expect(
    await accountMutations.updateAccountFromRefresh(
      id,
      {},
      undefined,
      request,
      {
        allowanceRefreshParts: [
          { ...part, source: { ...part.source, operation: "another-source" } },
        ],
      },
      generation,
    ),
  ).toBeNull()
  expect(await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)).toEqual(before)
})

function usageFixture(
  account: ReturnType<typeof buildSiteAccount>,
): AccountUsageSummary {
  return {
    scope: ACCOUNT_USAGE_SCOPES.Lifetime,
    cost: {
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      scope: accountBalanceScope({
        baseUrl: account.site_url,
        accountId: account.id,
      }),
      amount: {
        status: OBSERVATION_STATUSES.Known,
        value: "1.00000000000001",
        observedAt: 100,
        source: {
          adapter: "fixture",
          operation: "usage",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
      },
    },
  }
}

it.each(["identity", "failure"])(
  "preserves original allowance and usage evidence as stale after %s",
  async (mode) => {
    const account = buildSiteAccount()
    account.account_info.allowances = allowanceFixture(account).allowances
    account.account_info.usage = usageFixture(account)
    account.account_info.usageObservations = [usageFixture(account)]
    const id = await accountMutations.addAccount(account)
    const request = (await accountQueries.getAccountById(id))!
    if (mode === "identity")
      await accountMutations.updateAccount(
        id,
        { site_url: "https://new-identity.example" },
        { userTimestampMode: AccountUpdateUserTimestampMode.Touch },
      )
    else {
      const generation = (await accountMutations.beginBalanceRefresh(
        id,
        request,
      ))!
      await accountMutations.updateAccountFromRefresh(
        id,
        {},
        undefined,
        request,
        undefined,
        generation,
      )
    }
    const stored = (await accountQueries.getAccountById(id))!.account_info
    expect(stored.allowances?.entries[0]?.constraint.remaining).toMatchObject({
      status: "stale",
      value: "20",
      observedAt: 100,
    })
    for (const usage of [stored.usage, ...(stored.usageObservations ?? [])])
      expect(usage?.cost?.amount).toMatchObject({
        status: "stale",
        value: "1.00000000000001",
        observedAt: 100,
      })
  },
)

it("reserves generations above existing accounts when migrating the local counter", async () => {
  const id = await accountMutations.addAccount(
    buildSiteAccount({ balanceRefreshGeneration: 9000 }),
  )
  await withExtensionStorageWriteLock(STORAGE_LOCKS.ACCOUNT_STORAGE, () =>
    storage.remove(ACCOUNT_STORAGE_KEYS.BALANCE_GENERATION),
  )
  const request = (await accountQueries.getAccountById(id))!
  expect(
    await accountMutations.beginBalanceRefresh(id, request),
  ).toBeGreaterThan(9000)
})

it("preserves malformed legacy asset evidence without making it a current financial fact", async () => {
  const account = buildSiteAccount()
  delete account.account_info.quota
  account.account_info.nativeBalance = {
    unit: "quota",
    total: 123,
    asset: { id: "broken" },
  } as never
  const id = await accountMutations.addAccount(account)
  const stored = (await accountQueries.getAccountById(id))!.account_info
  expect(stored.legacyFinancial?.nativeBalance).toEqual(
    account.account_info.nativeBalance,
  )
  expect(
    stored.balance?.positions.every(
      (position) => position.amount.status !== "known",
    ),
  ).toBe(true)
})

it("migrates v4.10.1 Novita cash and credit limit as last-known details", async () => {
  const account = buildSiteAccount({ site_type: "novita", configVersion: 8 })
  delete account.account_info.balance
  account.account_info.nativeBalance = {
    unit: CURRENCIES.USD,
    total: 25,
    permanent: 5,
    daily: 0,
    components: [
      { kind: "permanent", amount: 5 },
      { kind: "permanent", name: "Credit limit", amount: 20 },
    ],
  }
  await accountDataTransfer.importData({ accounts: [account] })
  const saved = (await accountQueries.getAccountById(account.id))!
  expect(
    accountPresentation.convertToDisplayData(saved).balanceSnapshot?.positions,
  ).toEqual([
    expect.objectContaining({
      role: "available",
      amount: expect.objectContaining({ value: "25" }),
    }),
    expect.objectContaining({
      role: "ledger",
      amount: expect.objectContaining({ status: "stale", value: "5" }),
    }),
    expect.objectContaining({
      role: "credit-limit",
      amount: expect.objectContaining({ status: "stale", value: "20" }),
    }),
  ])
})

it.each([false, true])(
  "keeps migrated USD root amounts in reference subtotals and sorting with restored components=%s",
  async (withComponents) => {
    const now = Date.now()
    const accounts = [
      { id: "high", site_name: "Alpha", value: 9 },
      { id: "low", site_name: "Zulu", value: 1 },
    ].map(({ value, ...identity }) => {
      const account = buildSiteAccount({
        ...identity,
        configVersion: 8,
        site_type: SITE_TYPES.AIMLAPI,
        last_sync_time: now,
      })
      delete account.account_info.quota
      account.account_info.nativeBalance = {
        unit: CURRENCIES.USD,
        total: value,
        permanent: value,
        daily: 0,
        ...(withComponents
          ? { components: [{ kind: "permanent", amount: value }] }
          : {}),
      }
      return account
    })
    await withExtensionStorageWriteLock(STORAGE_LOCKS.ACCOUNT_STORAGE, () =>
      storage.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
        schemaVersion: 1,
        accounts,
        bookmarks: [],
        pinnedAccountIds: [],
        orderedAccountIds: [],
        last_updated: now,
      }),
    )
    const snapshot = await accountReadModels.getAccountManagementSnapshot()
    expect(snapshot.stats.balancePortfolio).toMatchObject({
      amounts: [],
      referenceUsd: { USD: "10", CNY: "70" },
    })
    expect(
      getDisplayBalancePortfolio(snapshot.displayAccounts, "prepaid"),
    ).not.toHaveProperty("referenceUsd")
    for (const currency of [CURRENCIES.USD, CURRENCIES.CNY] as const) {
      const compare = createDynamicSortComparator(
        { criteria: [], lastModified: now },
        null,
        DATA_TYPE_BALANCE,
        currency,
        "asc",
      )
      expect(
        [...snapshot.displayAccounts].sort(compare).map(({ id }) => id),
      ).toEqual(["low", "high"])
    }
    expect(
      snapshot.displayAccounts[0]?.balanceSnapshot?.positions,
    ).toHaveLength(withComponents ? 2 : 3)
  },
)

it("rejects future nested account envelopes through the legacy import route", async () => {
  await accountMutations.addAccount(buildSiteAccount())
  const before = await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
  await expect(
    importV1Backup({
      type: "accounts",
      accounts: { schemaVersion: 99, accounts: [] },
    } as never),
  ).rejects.toThrow()
  expect(await storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)).toEqual(before)
})

it.each(["legacy", "current"])(
  "validates nested financial schemas before tag writes in %s backups",
  async (mode) => {
    const account = buildSiteAccount({ configVersion: 9 })
    account.account_info.balance = { schemaVersion: 999 } as never
    const data = {
      version: BACKUP_VERSION,
      accounts: { accounts: [account] },
      tagStore: { tagsById: {}, version: 1 },
    }
    const importedTags = vi.spyOn(tagStorage, "importTagStore")
    onTestFinished(() => {
      importedTags.mockRestore()
    })
    await expect(
      mode === "legacy"
        ? importV1Backup(data as never)
        : importV2AccountsWithReplace(data as never),
    ).rejects.toThrow()
    expect(importedTags).not.toHaveBeenCalled()
  },
)

it("binds every new account financial scope before its first refresh", async () => {
  const account = buildSiteAccount()
  const usage = usageFixture(account)
  usage.cost!.scope!.subject = { kind: FINANCIAL_SUBJECT_KINDS.Account }
  account.account_info.usage = usage
  account.account_info.usageObservations = [usage]
  account.account_info.settledConsumption = [
    {
      ...usage.cost!,
      scope: usage.cost!.scope!,
      window: { start: 0, end: 100, timeZone: "UTC" },
      coverage: FINANCIAL_COVERAGE.Complete,
      settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
    },
  ]
  account.account_info.reportedIncome = [
    {
      ...usage.cost!,
      scope: usage.cost!.scope!,
      window: { start: 0, end: 100, timeZone: "UTC" },
      coverage: FINANCIAL_COVERAGE.Complete,
      classification: INCOME_CLASSIFICATIONS.Grant,
    },
  ]
  const id = await accountMutations.addAccount(account)
  const request = (await accountQueries.getAccountById(id))!
  for (const scope of [
    request.account_info.usage?.cost?.scope,
    request.account_info.usageObservations?.[0]?.cost?.scope,
    request.account_info.settledConsumption?.[0]?.scope,
    request.account_info.reportedIncome?.[0]?.scope,
  ])
    expect(scope?.subject).toEqual({ kind: "account", accountId: id })
  const next = {
    ...usage,
    cost: {
      ...usage.cost!,
      scope: {
        ...usage.cost!.scope!,
        subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: id },
      },
    },
  }
  const generation = (await accountMutations.beginBalanceRefresh(id, request))!
  await accountMutations.updateAccountFromRefresh(
    id,
    { account_info: { usage: next, usageObservations: [next] } },
    undefined,
    request,
    undefined,
    generation,
  )
  expect(
    (await accountQueries.getAccountById(id))?.account_info.usageObservations,
  ).toMatchObject([next])
})

it("persists reported native income separately and preserves failed observations as stale", async () => {
  const id = await accountMutations.addAccount(buildSiteAccount())
  const request = (await accountQueries.getAccountById(id))!
  const cost = usageFixture(request).cost!
  const reportedIncome = [
    {
      ...cost,
      scope: cost.scope!,
      window: { start: 0, end: 100, timeZone: "UTC" },
      coverage: "complete" as const,
      classification: "grant" as const,
    },
  ]
  const generation = (await accountMutations.beginBalanceRefresh(id, request))!
  const update = buildAccountRefreshUpdate(
    request,
    {
      success: true,
      data: {
        ...request.account_info,
        reportedIncome,
        checkIn: request.checkIn,
      },
      healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
    },
    false,
  )
  await accountMutations.updateAccountFromRefresh(
    id,
    update,
    undefined,
    request,
    undefined,
    generation,
  )
  expect(
    (await accountDataTransfer.exportData()).accounts[0]?.account_info
      .reportedIncome,
  ).toEqual(reportedIncome)
  const next = (await accountQueries.getAccountById(id))!
  const nextGeneration = (await accountMutations.beginBalanceRefresh(id, next))!
  await accountMutations.updateAccountFromRefresh(
    id,
    {},
    undefined,
    next,
    undefined,
    nextGeneration,
  )
  const failed = (await accountQueries.getAccountById(id))!
  expect(failed.account_info.reportedIncome?.[0]?.amount).toMatchObject({
    status: "stale",
    value: "1.00000000000001",
    observedAt: 100,
  })
  expect(failed.account_info.settledConsumption).toBeUndefined()
})

it("keeps a migrated wallet when an allowance-only refresh does not establish its replacement", async () => {
  const id = await accountMutations.addAccount(
    buildSiteAccount({ site_type: "sharedchat" }),
  )
  const request = (await accountQueries.getAccountById(id))!
  expect(request.account_info.balance?.positions[0]?.amount.source.kind).toBe(
    "legacy",
  )
  const generation = (await accountMutations.beginBalanceRefresh(id, request))!
  const data = allowanceFixture(request)
  await accountMutations.updateAccountFromRefresh(
    id,
    { account_info: { allowances: data.allowances } },
    undefined,
    request,
    data,
    generation,
  )
  const saved = (await accountQueries.getAccountById(id))!
  expect(saved.account_info.balance?.positions).toEqual(
    request.account_info.balance?.positions,
  )
  expect(saved.account_info.legacyFinancial).toEqual(
    request.account_info.legacyFinancial,
  )
  expect(
    saved.account_info.allowances?.entries[0]?.constraint.remaining,
  ).toMatchObject({ value: "20" })
})

it.each(
  (["ordinary", "editor"] as const).flatMap((mode) =>
    (["expiry", "reset"] as const).map((timing) => ({ mode, timing })),
  ),
)(
  "$mode keeps retired legacy component trees out of reference totals and sorting after $timing",
  async ({ mode, timing }) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(1000))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const raw = buildSiteAccount({
      site_name: "B retired",
      last_sync_time: 1000,
    })
    raw.account_info.nativeBalance = {
      unit: CURRENCIES.USD,
      total: 10,
      permanent: 2,
      daily: 8,
      components: [
        { kind: "permanent", amount: 2 },
        { kind: "subscription", name: "Old plan", amount: 8 },
      ],
    }
    const id = await accountMutations.addAccount(raw)
    const account = (await accountQueries.getAccountById(id))!
    const scope = accountBalanceScope({
      baseUrl: account.site_url,
      accountId: id,
    })
    const data = {
      ...account.account_info,
      ...accountBalanceObservation(
        scope,
        [
          balancePosition({
            id: "available",
            scope,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            value: "0",
            observedAt: 1000,
            source: {
              adapter: "fixture",
              operation: "wallet",
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Reported,
            },
            ...(timing === "expiry"
              ? { validity: { kind: "expires" as const, at: 2000 } }
              : {
                  window: {
                    start: 1000,
                    end: 3000,
                    resetsAt: 2000,
                    timeZone: "UTC",
                  },
                }),
          }),
        ],
        1000,
        "complete",
      ),
      checkIn: account.checkIn,
    }
    const generation = (await accountMutations.beginBalanceRefresh(
      id,
      account,
    ))!
    if (mode === "ordinary") {
      expect(
        await accountMutations.updateAccountFromRefresh(
          id,
          buildAccountRefreshUpdate(
            account,
            {
              success: true,
              data,
              healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
            },
            false,
          ),
          undefined,
          account,
          data,
          generation,
        ),
      ).not.toBeNull()
    } else {
      expect(
        await accountMutations.updateAccountWithCheckInDraft(
          id,
          {},
          account.checkIn,
          {
            userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
            balanceRefresh: { generation, requestSnapshot: account, data },
          },
        ),
      ).toBe(true)
    }
    const display = accountPresentation.resolveDisplayData(
      (await accountQueries.getAccountById(id))!,
    )
    expect(display.balanceSnapshot?.positions).toContainEqual(
      expect.objectContaining({
        id: "legacy",
        amount: expect.objectContaining({ value: "10", observedAt: 1000 }),
      }),
    )
    expect(display.balanceSnapshot?.positions).toContainEqual(
      expect.objectContaining({
        label: "Old plan",
        parentId: "legacy",
        amount: expect.objectContaining({ value: "8", observedAt: 1000 }),
      }),
    )
    expect(
      getDisplayBalancePortfolio([display], "available", 1500),
    ).toMatchObject({ amounts: [{ value: "0" }] })
    expect(
      getDisplayBalancePortfolio([display], "available", 1500).referenceUsd,
    ).toBeUndefined()
    vi.setSystemTime(new Date(2000))
    expect(
      getDisplayBalancePortfolio([display], "available", 2000).amounts,
    ).toEqual([])
    expect(
      getDisplayBalancePortfolio([display], "available", 2000).referenceUsd,
    ).toBeUndefined()
    const empty = buildDisplaySiteData({
      id: "empty",
      name: "A empty",
      balanceSnapshot: undefined,
    })
    const compare = createDynamicSortComparator(
      { criteria: [], lastModified: 2000 },
      null,
      DATA_TYPE_BALANCE,
      CURRENCIES.USD,
      "asc",
    )
    const current = buildDisplaySiteData({
      id: "current",
      name: "C current",
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "current",
            scope,
            value: "1",
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            observedAt: 2000,
            source: {
              kind: EVIDENCE_KINDS.Reported,
              adapter: "fixture",
              operation: "wallet",
              contractVersion: "1",
            },
          }),
        ],
        2000,
        FINANCIAL_COVERAGE.Complete,
      ),
    })
    expect(
      [display, empty, current].sort(compare).map((site) => site.name),
    ).toEqual(["B retired", "C current", "A empty"])
  },
)

it("does not relabel a previous allowance amount into the next reset window", async () => {
  const account = buildSiteAccount()
  const fixture = allowanceFixture(account)
  fixture.allowances.entries[0]!.constraint.window = {
    kind: BUDGET_WINDOW_KINDS.Periodic,
    period: BUDGET_PERIODS.Day,
    resetsAt: 200,
  }
  account.account_info.allowances = fixture.allowances
  const id = await accountMutations.addAccount(account)
  const request = (await accountQueries.getAccountById(id))!
  const part = allowanceFixture(request).allowanceRefreshParts[0]!
  const constraint = part.entries[0]!.constraint
  constraint.window = {
    kind: BUDGET_WINDOW_KINDS.Periodic,
    period: BUDGET_PERIODS.Day,
    resetsAt: 300,
  }
  constraint.limit = {
    status: OBSERVATION_STATUSES.Known,
    value: "100",
    source: part.source,
    observedAt: 200,
  }
  constraint.remaining = {
    status: OBSERVATION_STATUSES.Unavailable,
    reason: "missing",
    source: part.source,
  }
  const generation = (await accountMutations.beginBalanceRefresh(id, request))!
  await accountMutations.updateAccountFromRefresh(
    id,
    {},
    undefined,
    request,
    { allowanceRefreshParts: [part] },
    generation,
  )
  const saved = (await accountQueries.getAccountById(id))!.account_info
    .allowances!.entries[0]!
  expect(saved.constraint.window).toMatchObject({ resetsAt: 300 })
  expect(saved.constraint.remaining).not.toHaveProperty("value")
})

it("saves editor user fields without accepting usage from a superseded request", async () => {
  const id = await accountMutations.addAccount(buildSiteAccount())
  const request = (await accountQueries.getAccountById(id))!
  const editorGeneration = (await accountMutations.beginBalanceRefresh(
    id,
    request,
  ))!
  const latestGeneration = (await accountMutations.beginBalanceRefresh(
    id,
    request,
  ))!
  const latest = usageFixture(request)
  await accountMutations.updateAccountFromRefresh(
    id,
    {
      account_info: {
        usage: latest,
        usageObservations: [latest],
        today_requests_count: 20,
      },
    },
    undefined,
    request,
    undefined,
    latestGeneration,
  )
  const old = {
    ...latest,
    totalRequests: 1,
    cost: {
      ...latest.cost!,
      amount: {
        ...latest.cost!.amount,
        status: OBSERVATION_STATUSES.Known,
        value: "999",
        observedAt: 50,
      },
    },
  }
  await accountMutations.updateAccountWithCheckInDraft(
    id,
    {
      notes: "save user edit",
      account_info: {
        usage: old,
        usageObservations: [old],
        today_requests_count: 1,
      },
    },
    request.checkIn,
    {
      userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      balanceRefresh: {
        generation: editorGeneration,
        requestSnapshot: request,
        data: {
          ...request.account_info,
          usage: old,
          usageObservations: [old],
          checkIn: request.checkIn,
        },
      },
    },
  )
  const saved = (await accountQueries.getAccountById(id))!
  expect(saved.notes).toBe("save user edit")
  expect(saved.account_info.usageObservations).toMatchObject([latest])
  expect(saved.account_info.usage).toMatchObject(latest)
  expect(saved.account_info.today_requests_count).toBe(20)
})
