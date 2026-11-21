import { beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
} from "~/services/amounts/financialConstants"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { maybeCaptureDailyBalanceSnapshot } from "~/services/history/dailyBalanceHistory/capture"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { AuthTypeEnum } from "~/types"
import {
  DAILY_BALANCE_HISTORY_CAPTURE_SOURCES,
  DEFAULT_BALANCE_HISTORY_PREFERENCES,
} from "~/types/dailyBalanceHistory"

const { values, failures } = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  failures: { write: false },
}))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      return values.get(key)
    }
    async set(key: string, value: unknown) {
      if (failures.write) throw new Error("storage unavailable")
      values.set(key, value)
    }
  },
}))

describe("accepted financial history", () => {
  beforeEach(() => {
    values.clear()
    failures.write = false
  })

  it("persists a partial provider-day cost together with its healthy balance", async () => {
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://fixture.invalid",
      accountId: "account",
    })
    const source = {
      adapter: "fixture",
      operation: "balance",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const balance = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "wallet",
          scope,
          value: "12",
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          source,
          observedAt: now,
        }),
      ],
      now,
      FINANCIAL_COVERAGE.Complete,
    )
    const cost = {
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      scope,
      amount: observeAmount("3", { ...source, operation: "stats" }, now),
      coverage: FINANCIAL_COVERAGE.Partial,
    }
    expect(
      await maybeCaptureDailyBalanceSnapshot({
        accountId: "account",
        config: { ...DEFAULT_BALANCE_HISTORY_PREFERENCES, enabled: true },
        balance,
        usage: [{ scope: "site_today", cost }],
        source: "refresh",
      }),
    ).toBe(true)
    expect(
      (await dailyBalanceHistoryStorage.getStore())
        .financialSnapshotsByAccountId?.account,
    ).toEqual([expect.objectContaining({ balance, reportedDayCosts: [cost] })])
  })

  it("reports a failed history write without claiming it was persisted", async () => {
    const previous = { schemaVersion: 1, snapshotsByAccountId: {} }
    values.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, previous)
    failures.write = true
    expect(
      await dailyBalanceHistoryStorage.pruneAll({ retentionDays: 30 }),
    ).toBe(false)
    expect(values.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)).toEqual(
      previous,
    )
  })

  it("retains provider-reported credits when a refresh has income but no wallet observation", async () => {
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://fixture.invalid",
      accountId: "account",
    })
    const reportedIncome = [
      {
        scope,
        asset: { kind: "currency" as const, code: CURRENCIES.USD },
        amount: {
          status: "known" as const,
          value: "1.21",
          observedAt: now,
          source: {
            adapter: "fixture",
            operation: "credits",
            contractVersion: "1",
            kind: "reported" as const,
          },
        },
        window: { start: now - 3600_000, end: now, timeZone: "UTC" },
        coverage: "complete" as const,
        classification: "unclassified" as const,
      },
    ]
    expect(
      await maybeCaptureDailyBalanceSnapshot({
        accountId: "account",
        config: {
          ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
          enabled: true,
          retentionDays: 30,
        },
        source: "refresh",
        reportedIncome,
      }),
    ).toBe(true)
    expect(
      (await dailyBalanceHistoryStorage.getStore())
        .financialSnapshotsByAccountId?.account,
    ).toEqual([expect.objectContaining({ reportedIncome })])
  })

  it("refuses unknown store versions without overwriting the saved payload", async () => {
    const future = {
      schemaVersion: 999,
      snapshotsByAccountId: { privateFutureShape: {} },
      futureField: "preserve",
    }
    values.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, future)
    await expect(dailyBalanceHistoryStorage.getStore()).rejects.toThrow(
      "unsupported_balance_history_version",
    )
    expect(
      await dailyBalanceHistoryStorage.pruneAll({ retentionDays: 30 }),
    ).toBe(false)
    expect(values.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)).toEqual(future)
  })

  it("deduplicates the same accepted observation across triggers and records an explicit end on removal", async () => {
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://fixture.invalid",
      accountId: "account",
      auth: { authType: AuthTypeEnum.AccessToken },
    })
    const position = balancePosition({
      id: "plan",
      scope,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      value: "5",
      observedAt: now,
      role: BALANCE_ROLES.Allowance,
      nature: BALANCE_NATURES.Subscription,
      source: {
        adapter: "fixture",
        operation: "plans",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      },
    })
    const balance = accountBalanceSnapshot(
      scope,
      [position],
      now,
      FINANCIAL_COVERAGE.Complete,
    )
    for (const source of ["refresh", "alarm"] as const) {
      expect(
        await dailyBalanceHistoryStorage.appendFinancialSnapshot({
          accountId: "account",
          snapshot: { balance, source },
          retentionDays: 30,
        }),
      ).toBe(true)
    }
    expect(
      (await dailyBalanceHistoryStorage.getStore())
        .financialSnapshotsByAccountId?.account,
    ).toHaveLength(1)
    await dailyBalanceHistoryStorage.appendFinancialSnapshot({
      accountId: "account",
      snapshot: {
        balance: accountBalanceSnapshot(
          scope,
          [],
          now + 1000,
          FINANCIAL_COVERAGE.Complete,
        ),
        source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
      },
      retentionDays: 30,
    })
    const history = (await dailyBalanceHistoryStorage.getStore())
      .financialSnapshotsByAccountId!.account!
    expect(history).toHaveLength(2)
    expect(history[1]?.endedPositionKeys).toHaveLength(1)
    expect(history[0]?.balance!.positions[0]?.amount).toMatchObject({
      value: "5",
      observedAt: now,
    })
  })

  it("orders delayed capture by accepted observation time before deriving membership endings", async () => {
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://fixture.invalid",
      accountId: "account",
      auth: { authType: AuthTypeEnum.AccessToken },
    })
    const position = balancePosition({
      id: "plan",
      scope,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      value: "5",
      observedAt: now - 1000,
      source: {
        adapter: "fixture",
        operation: "plans",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      },
    })
    const earlier = accountBalanceSnapshot(
      scope,
      [position],
      now - 1000,
      FINANCIAL_COVERAGE.Complete,
    )
    const later = accountBalanceSnapshot(
      scope,
      [],
      now,
      FINANCIAL_COVERAGE.Complete,
    )
    for (const balance of [later, earlier])
      await dailyBalanceHistoryStorage.appendFinancialSnapshot({
        accountId: "account",
        snapshot: {
          balance,
          source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
        },
        retentionDays: 30,
      })
    const entries = (await dailyBalanceHistoryStorage.getStore())
      .financialSnapshotsByAccountId!.account!
    expect(entries.map((entry) => entry.balance!.capturedAt)).toEqual([
      now - 1000,
      now,
    ])
    expect(entries[0]?.endedPositionKeys).toBeUndefined()
    expect(entries[1]?.endedPositionKeys).toHaveLength(1)
  })

  it.each([0, -1000])(
    "uses accepted generations when captures arrive in reverse order with clock offset %s",
    async (clockOffset) => {
      const now = Date.now()
      const scope = accountBalanceScope({
        baseUrl: "https://fixture.invalid",
        accountId: "account",
        auth: { authType: AuthTypeEnum.AccessToken },
      })
      const position = balancePosition({
        id: "plan",
        scope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        value: "5",
        observedAt: now,
        source: {
          adapter: "fixture",
          operation: "plans",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
      })
      for (const generation of [3, 2, 1]) {
        const balance = accountBalanceSnapshot(
          scope,
          generation === 2 ? [] : [position],
          now + (generation === 3 ? clockOffset : 0),
          FINANCIAL_COVERAGE.Complete,
        )
        expect(
          await dailyBalanceHistoryStorage.appendFinancialSnapshot({
            accountId: "account",
            snapshot: { balance, source: "refresh", generation },
            retentionDays: 30,
          }),
        ).toBe(true)
      }
      const entries = (await dailyBalanceHistoryStorage.getStore())
        .financialSnapshotsByAccountId!.account!
      expect(entries.map((entry) => entry.generation)).toEqual([1, 2, 3])
      expect(entries[1]?.endedPositionKeys).toHaveLength(1)
    },
  )

  it("applies retention to native history", async () => {
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://fixture.invalid",
      accountId: "account",
      auth: { authType: AuthTypeEnum.AccessToken },
    })
    for (const at of [now - 40 * 86400000, now]) {
      const balance = accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "wallet",
            scope,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            value: "10",
            observedAt: at,
            source: {
              adapter: "fixture",
              operation: "wallet",
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Reported,
            },
          }),
        ],
        at,
        FINANCIAL_COVERAGE.Complete,
      )
      await dailyBalanceHistoryStorage.appendFinancialSnapshot({
        accountId: "account",
        snapshot: {
          balance,
          source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
        },
        retentionDays: 30,
      })
    }
    const entries = (await dailyBalanceHistoryStorage.getStore())
      .financialSnapshotsByAccountId!.account!
    expect(entries.map((entry) => entry.balance!.capturedAt)).toEqual([now])
  })

  it("rejects malformed or mismatched canonical history without discarding stored facts", async () => {
    const scope = accountBalanceScope({
      baseUrl: "https://fixture.invalid",
      accountId: "account",
      auth: { authType: AuthTypeEnum.AccessToken },
    })
    const balance = accountBalanceSnapshot(
      scope,
      [],
      Date.now(),
      FINANCIAL_COVERAGE.Complete,
    )
    for (const snapshot of [
      { balance, source: "invalid" },
      { balance, source: "refresh", settledConsumption: [{ amount: 0 }] },
      {
        balance: {
          ...balance,
          subject: {
            kind: FINANCIAL_SUBJECT_KINDS.Account,
            accountId: "someone-else",
          },
        },
        source: "refresh",
      },
    ]) {
      const payload = {
        schemaVersion: 2,
        snapshotsByAccountId: {},
        financialSnapshotsByAccountId: { account: [snapshot] },
      }
      values.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, payload)
      await expect(dailyBalanceHistoryStorage.getStore()).rejects.toThrow()
      expect(
        await dailyBalanceHistoryStorage.pruneAll({ retentionDays: 30 }),
      ).toBe(false)
      expect(values.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)).toEqual(
        payload,
      )
    }
  })

  it("captures native Token observations with source scope and time without creating a zero USD legacy row", async () => {
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://fixture.invalid",
      accountId: "account",
      auth: { authType: AuthTypeEnum.AccessToken },
    })
    const balance = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "wallet",
          scope,
          asset: {
            kind: ASSET_KINDS.Quota,
            id: "fixture:tokens",
            label: "Token",
            displayScale: 1,
            displayLabel: "Token",
          },
          value: "4500",
          observedAt: now - 1000,
          source: {
            adapter: "fixture",
            operation: "account",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
        }),
      ],
      now,
      FINANCIAL_COVERAGE.Complete,
    )
    const ok = await maybeCaptureDailyBalanceSnapshot({
      accountId: "account",
      balance,
      source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
    } as Parameters<typeof maybeCaptureDailyBalanceSnapshot>[0] & {
      balance: typeof balance
    })
    expect(ok).toBe(true)
    const stored = await dailyBalanceHistoryStorage.getStore()
    expect(stored).toMatchObject({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        account: [
          {
            source: "refresh",
            balance: {
              positions: [
                {
                  amount: {
                    status: "known",
                    value: "4500",
                    observedAt: now - 1000,
                  },
                  asset: { kind: "quota", id: "fixture:tokens" },
                },
              ],
            },
          },
        ],
      },
    })
    expect(values.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)).toEqual(stored)
  })
})
