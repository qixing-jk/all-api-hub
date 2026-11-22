import { describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import * as usageAmounts from "~/services/amounts/usage"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"
import { computeUsageHistoryExport } from "~/services/history/usageHistory/analytics"
import { USAGE_HISTORY_STORAGE_KEYS } from "~/services/history/usageHistory/constants"
import {
  createEmptyUsageHistoryAccountStore,
  fingerprintLogItem,
  ingestConsumeLogItems,
} from "~/services/history/usageHistory/core"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import {
  LogType,
  type LogItem,
} from "~/services/history/usageHistory/usageLogModel"

const at = Date.UTC(2026, 0, 1, 12)
function consumption(value: string): FinancialConsumptionFact {
  return {
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
    amount: observeAmount(
      value,
      {
        adapter: "fixture",
        operation: "logs",
        contractVersion: "2",
        kind: EVIDENCE_KINDS.Reported,
      },
      at,
    ),
    scope: {
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "a" },
      authority: "https://example.com",
      projects: { kind: SCOPE_SELECTION_KINDS.All },
      keys: { kind: SCOPE_SELECTION_KINDS.All },
      groups: { kind: SCOPE_SELECTION_KINDS.All },
      models: { kind: SCOPE_SELECTION_KINDS.All },
    },
    window: { start: at - 1000, end: at, timeZone: "UTC" },
    settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
    coverage: FINANCIAL_COVERAGE.Partial,
  }
}

describe("native consumption in usage history", () => {
  it.each([
    [0, 0],
    ["0", 0],
    [undefined, undefined],
    ["", undefined],
  ])(
    "distinguishes recorded zero quota from missing quota (%s)",
    (quota, expected) => {
      const accountStore = createEmptyUsageHistoryAccountStore()
      ingestConsumeLogItems({
        accountStore,
        items: [
          {
            id: 1,
            type: LogType.Consume,
            created_at: at / 1000,
            model_name: "model",
            quota,
          } as unknown as LogItem,
        ],
        startCursor: accountStore.cursor,
        cursorCandidate: {
          lastSeenCreatedAt: 0,
          fingerprintsAtLastSeenCreatedAt: [],
        },
        timeZone: "UTC",
      })

      expect(accountStore.daily["2026-01-01"]?.referenceCostUsd).toBe(expected)
      expect(
        accountStore.dailyByModel.model?.["2026-01-01"]?.referenceCostUsd,
      ).toBe(expected)
    },
  )

  it("retains source, scope, signed exact asset values without deriving coverage from request counts", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const item = (id: number, value: string) =>
      ({
        id,
        type: LogType.Consume,
        created_at: at / 1000,
        model_name: "model",
        token_id: 1,
        prompt_tokens: 2,
        completion_tokens: 3,
        quota: 500_000,
        consumption: consumption(value),
      }) as LogItem
    const first = item(1, "0.1234567890123456789")
    const second = item(2, "-0.0234567890123456789")
    second.created_at += 1
    ingestConsumeLogItems({
      accountStore,
      items: [first, second],
      startCursor: accountStore.cursor,
      cursorCandidate: {
        lastSeenCreatedAt: 0,
        fingerprintsAtLastSeenCreatedAt: [],
      },
      timeZone: "UTC",
    })
    expect(accountStore.daily["2026-01-01"]).toMatchObject({
      requests: 2,
      totalTokens: 10,
      consumption: [
        {
          asset: { kind: "currency", code: "CNY" },
          amount: {
            value: "0.1",
            source: { kind: "derived", adapter: "fixture" },
          },
          scope: consumption("1").scope,
          coverage: "partial",
        },
      ],
    })
    const exported = computeUsageHistoryExport({
      store: { schemaVersion: 3, accounts: { a: accountStore } },
      selection: {
        accountIds: ["a"],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      },
    })
    expect(
      exported.fused.daily["2026-01-01"]?.consumption?.[0]?.amount,
    ).toMatchObject({ value: "0.1" })
  })
  it("folds each bucket once and retains every unavailable charge", () => {
    const merge = vi.spyOn(usageAmounts, "mergeRecordedConsumption")
    const accountStore = createEmptyUsageHistoryAccountStore()
    const known = consumption("2.5")
    const overflow = consumption("9".repeat(256))
    const unknown = {
      ...known,
      amount: observeAmount(undefined, known.amount.source, at),
    }
    const charges = [
      ...Array<FinancialConsumptionFact>(500).fill(unknown),
      known,
      known,
      {
        ...overflow,
        amount: {
          ...overflow.amount,
          source: { ...overflow.amount.source, operation: "overflow" },
        },
      },
      {
        ...overflow,
        amount: {
          ...overflow.amount,
          source: { ...overflow.amount.source, operation: "overflow" },
        },
      },
    ]
    try {
      ingestConsumeLogItems({
        accountStore,
        items: charges.map(
          (charge, index) =>
            ({
              type: LogType.Consume,
              created_at: at / 1000,
              model_name: "model",
              token_id: 1,
              prompt_tokens: index,
              quota: 0,
              consumption: charge,
            }) as LogItem,
        ),
        startCursor: accountStore.cursor,
        cursorCandidate: accountStore.cursor,
        timeZone: "UTC",
      })
      expect(merge).toHaveBeenCalledTimes(6)
      const day = accountStore.daily["2026-01-01"]
      expect(day).toMatchObject({
        requests: charges.length,
        consumptionIncomplete: true,
      })
      expect(day?.consumption?.[0]?.amount).toMatchObject({ value: "5" })
      expect(day?.consumption?.slice(1, -1)).toEqual(Array(500).fill(unknown))
      expect(day?.consumption?.at(-1)?.amount).toMatchObject({
        status: "unavailable",
        reason: "amount-out-of-range",
      })
    } finally {
      merge.mockRestore()
    }
  })

  it("keeps legacy quota unpriced even with successful complete request ingestion", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const item = {
      type: LogType.Consume,
      created_at: at / 1000,
      model_name: "model",
      token_id: 1,
      prompt_tokens: 2,
      completion_tokens: 3,
      quota: 500_000,
    } as LogItem
    ingestConsumeLogItems({
      accountStore,
      items: [item],
      startCursor: accountStore.cursor,
      cursorCandidate: {
        lastSeenCreatedAt: 0,
        fingerprintsAtLastSeenCreatedAt: [],
      },
      timeZone: "UTC",
    })
    expect(accountStore.daily["2026-01-01"]?.consumption).toBeUndefined()
    expect(accountStore.daily["2026-01-01"]?.consumptionIncomplete).toBe(true)
  })
})

it("keeps asset identity in incremental cursor deduplication while preserving old boundaries", () => {
  const accountStore = createEmptyUsageHistoryAccountStore()
  const first = {
    type: LogType.Consume,
    created_at: at / 1000,
    model_name: "model",
    token_id: 1,
    prompt_tokens: 2,
    completion_tokens: 3,
    quota: 0,
    consumption: consumption("1"),
  } as LogItem
  const initial = ingestConsumeLogItems({
    accountStore,
    items: [first],
    startCursor: accountStore.cursor,
    cursorCandidate: {
      lastSeenCreatedAt: 0,
      fingerprintsAtLastSeenCreatedAt: [],
    },
    timeZone: "UTC",
  })
  const storedCursor = {
    ...initial.cursorCandidate,
    fingerprintsAtLastSeenCreatedAt:
      initial.cursorCandidate.fingerprintsAtLastSeenCreatedAt.map((key) =>
        key.replace(',null,"logs"', ',"fixture","logs"'),
      ),
  }
  const reclassified = structuredClone(first)
  reclassified.consumption!.amount.source.adapter = "recognized-site-type"
  expect(
    ingestConsumeLogItems({
      accountStore,
      items: [reclassified],
      startCursor: storedCursor,
      cursorCandidate: initial.cursorCandidate,
      timeZone: "UTC",
    }).ingestedCount,
  ).toBe(0)

  const second = structuredClone(first)
  second.consumption!.asset = {
    kind: ASSET_KINDS.Currency,
    code: CURRENCIES.USD,
  }
  const added = ingestConsumeLogItems({
    accountStore,
    items: [second],
    startCursor: initial.cursorCandidate,
    cursorCandidate: initial.cursorCandidate,
    timeZone: "UTC",
  })
  expect(added.ingestedCount).toBe(1)
  expect(accountStore.daily["2026-01-01"]?.consumption).toHaveLength(2)
  const legacyCursor = {
    lastSeenCreatedAt: first.created_at,
    fingerprintsAtLastSeenCreatedAt: [
      fingerprintLogItem({ ...first, consumption: undefined }),
    ],
  }
  expect(
    ingestConsumeLogItems({
      accountStore,
      items: [first],
      startCursor: legacyCursor,
      cursorCandidate: legacyCursor,
      timeZone: "UTC",
    }).ingestedCount,
  ).toBe(0)
})

it("recognizes a refetched New API charge after identifying its site type", () => {
  const account = createEmptyUsageHistoryAccountStore()
  const scope = consumption("1").scope
  const makeItem = (
    siteType: typeof SITE_TYPES.UNKNOWN | typeof SITE_TYPES.NEW_API,
  ) => {
    const charge = newApiFinancialAmount(500_000, scope.authority, siteType)
    return {
      type: LogType.Consume,
      created_at: at / 1000,
      quota: 500_000,
      prompt_tokens: 4,
      completion_tokens: 8,
      consumption: usageAmounts.recordedLogCharge(
        charge.asset,
        charge.value,
        scope,
        {
          adapter: siteType,
          operation: "/api/log/self:quota",
          contractVersion: charge.contractVersion,
          kind: EVIDENCE_KINDS.Reported,
        },
        at,
      ),
    } as LogItem
  }
  const initial = ingestConsumeLogItems({
    accountStore: account,
    items: [makeItem(SITE_TYPES.UNKNOWN)],
    startCursor: account.cursor,
    cursorCandidate: account.cursor,
    timeZone: "UTC",
  })
  expect(initial.ingestedCount).toBe(1)
  const refreshed = ingestConsumeLogItems({
    accountStore: account,
    items: [makeItem(SITE_TYPES.NEW_API)],
    startCursor: initial.cursorCandidate,
    cursorCandidate: initial.cursorCandidate,
    timeZone: "UTC",
  })
  expect(refreshed.ingestedCount).toBe(0)
  expect(account.daily["2026-01-01"]).toMatchObject({
    requests: 1,
    totalTokens: 12,
  })
})

it("persists the v1 quota as a USD reference amount and keeps later native charges independently", async () => {
  const storage = new Storage({ area: "local" })
  const accountStore = createEmptyUsageHistoryAccountStore()
  await storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, {
    schemaVersion: 1,
    accounts: {
      a: {
        ...accountStore,
        daily: {
          "2026-01-01": {
            requests: 1,
            promptTokens: 2,
            completionTokens: 3,
            totalTokens: 5,
            quotaConsumed: 500_000,
          },
        },
      },
    },
  })
  const legacy = await usageHistoryStorage.getStore()
  expect(legacy.accounts.a?.daily["2026-01-01"]).toMatchObject({
    requests: 1,
    referenceCostUsd: 1,
  })
  expect(await storage.get(USAGE_HISTORY_STORAGE_KEYS.STORE)).toEqual(legacy)
  expect(legacy.accounts.a?.daily["2026-01-01"]?.consumption).toBeUndefined()
  await usageHistoryStorage.updateAccountStore("a", (account) => {
    account.daily["2026-01-02"] = {
      requests: 1,
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5,
      consumption: [consumption("-0.000000000000001")],
    }
  })
  const updated = await usageHistoryStorage.getStore()
  expect(updated.schemaVersion).toBe(3)
  expect(updated.accounts.a?.daily["2026-01-01"]).not.toHaveProperty(
    "quotaConsumed",
  )
  expect(updated.accounts.a?.daily["2026-01-02"]?.consumption).toEqual([
    consumption("-0.000000000000001"),
  ])
})
