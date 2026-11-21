import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { LEGACY_BALANCE_SUPERSEDED_REASON } from "~/services/accounts/refresh/balanceAcceptance"
import {
  balancePosition,
  observeAmount,
  type BalancePosition,
  type BalanceSnapshot,
} from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_OBSERVATION_REASONS,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { getFinancialSeriesKey } from "~/services/history/dailyBalanceHistory/identity"
import { buildFinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"
import { estimateTodayIncomeForAccount } from "~/services/history/dailyBalanceHistory/todayIncomeEstimate"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { DAILY_BALANCE_HISTORY_CAPTURE_SOURCES } from "~/types/dailyBalanceHistory"

const startAt = Date.UTC(2026, 4, 23)
const endAt = startAt + 36_000_000
const source = {
  adapter: "fixture",
  operation: "ledger",
  contractVersion: "2",
  kind: EVIDENCE_KINDS.Reported,
} as const
const scope = {
  subject: {
    kind: FINANCIAL_SUBJECT_KINDS.Account,
    accountId: "account",
  } as const,
  authority: "https://example.com",
  walletId: "main",
  projects: { kind: SCOPE_SELECTION_KINDS.All } as const,
  models: { kind: SCOPE_SELECTION_KINDS.All } as const,
  keys: { kind: SCOPE_SELECTION_KINDS.All } as const,
  groups: { kind: SCOPE_SELECTION_KINDS.All } as const,
}
const position = (value: string, observedAt: number) =>
  balancePosition({
    id: "ledger",
    scope,
    source: { ...source },
    role: BALANCE_ROLES.Ledger,
    value,
    observedAt,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
  })
function store(): DailyBalanceHistoryStore {
  return {
    schemaVersion: 4,
    referenceSnapshotsByAccountId: {},
    financialSnapshotsByAccountId: {
      account: [
        {
          source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Alarm,
          balance: {
            schemaVersion: 2,
            subject: scope.subject,
            capturedAt: startAt,
            positions: [position("100", startAt)],
            coverage: FINANCIAL_COVERAGE.Complete,
          },
        },
        {
          source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
          balance: {
            schemaVersion: 2,
            subject: scope.subject,
            capturedAt: endAt,
            positions: [position("65", endAt)],
            coverage: FINANCIAL_COVERAGE.Complete,
          },
          settledConsumption: [
            {
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
              scope,
              amount: observeAmount(
                "30",
                { ...source, operation: "settled-use" },
                endAt,
              ),
              settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
              coverage: FINANCIAL_COVERAGE.Complete,
              window: { start: startAt, end: endAt, timeZone: "UTC" },
            },
          ],
        },
      ],
    },
  }
}
const estimate = (
  history = store(),
  timeZone = "UTC",
  balance = history.financialSnapshotsByAccountId?.account?.at(-1)?.balance,
) =>
  estimateTodayIncomeForAccount({
    enabled: true,
    store: history,
    account: { id: "account", account_info: { balance } },
    currentDayKey: "2026-05-23",
    timeZone,
  })

describe("today net inflow", () => {
  it.each([
    "stale-wallet",
    "unavailable-wallet",
    "unsuperseded-legacy",
    "foreign-wallet",
    "foreign-collection",
    "foreign-source",
  ] as const)(
    "retired details do not hide a competing %s from account-wide charge matching",
    (scenario) => {
      const history = store()
      for (const snapshot of history.financialSnapshotsByAccountId!.account!) {
        const wallet = snapshot.balance!.positions[0]!
        wallet.role = BALANCE_ROLES.Available
        wallet.scope = {
          ...wallet.scope,
          models: { kind: SCOPE_SELECTION_KINDS.Unknown },
        }
        const root: BalancePosition = {
          ...position("99", startAt - 1),
          id: "legacy",
          collectionKey: "legacy",
          role: BALANCE_ROLES.Available,
          amount: {
            status: OBSERVATION_STATUSES.Stale,
            value: "99",
            observedAt: startAt - 1,
            reason: LEGACY_BALANCE_SUPERSEDED_REASON,
            source: {
              adapter: "legacy",
              operation: "stored-account",
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Legacy,
            },
          },
        }
        const child: BalancePosition = {
          ...root,
          id: "legacy-component",
          parentId: root.id,
          amount:
            root.amount.status === OBSERVATION_STATUSES.Stale
              ? {
                  ...root.amount,
                  reason: FINANCIAL_OBSERVATION_REASONS.LegacySemantics,
                }
              : root.amount,
        }
        snapshot.balance!.positions.push(root, child)
        const failedWallet =
          scenario === "stale-wallet" || scenario === "unavailable-wallet"
        const competitor = structuredClone(failedWallet ? wallet : root)
        if (failedWallet) {
          competitor.id = "second-wallet"
          competitor.amount =
            scenario === "stale-wallet"
              ? {
                  ...competitor.amount,
                  status: OBSERVATION_STATUSES.Stale,
                  value: "7",
                  observedAt: startAt,
                  reason: FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
                }
              : {
                  status: OBSERVATION_STATUSES.Unavailable,
                  source: competitor.amount.source,
                  reason: FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
                }
        } else {
          if (competitor.amount.status === OBSERVATION_STATUSES.Stale)
            competitor.amount.reason =
              FINANCIAL_OBSERVATION_REASONS.LegacySemantics
          if (scenario === "unsuperseded-legacy") competitor.id = "old-wallet"
          if (scenario === "foreign-wallet")
            competitor.scope.walletId = "another-wallet"
          if (scenario === "foreign-collection")
            competitor.collectionKey = "another-collection"
          if (scenario === "foreign-source")
            competitor.amount.source.operation = "another-source"
          // Same textual parent IDs belong to separate source-local trees.
          snapshot.balance!.positions.push({
            ...competitor,
            id: "other-component",
            parentId: competitor.id,
          })
        }
        snapshot.balance!.positions.push(competitor)
      }
      expect(estimate(history).status).not.toBe("available")
      const result = buildFinancialHistorySeries({
        store: history,
        accountIds: ["account"],
        startDayKey: "2026-05-23",
        endDayKey: "2026-05-23",
        asOf: endAt,
      })
      expect(
        result.series
          .find(({ position }) => position.id === "ledger")
          ?.observations.at(-1)?.netInflow,
      ).toMatchObject({
        status: "unavailable",
        reason: "observation-unavailable",
      })
    },
  )

  it("estimates from a single available balance captured by the previous day's alarm", () => {
    const history = store()
    const [baseline, latest] = history.financialSnapshotsByAccountId!.account!
    const beforeMidnight = startAt - 5 * 60_000
    baseline!.balance!.capturedAt = beforeMidnight
    baseline!.balance!.positions = [position("100", beforeMidnight)]
    for (const snapshot of [baseline!, latest!]) {
      const wallet = snapshot.balance!.positions[0]!
      wallet.role = BALANCE_ROLES.Available
      wallet.scope = {
        ...wallet.scope,
        walletId: undefined,
        models: { kind: SCOPE_SELECTION_KINDS.Unknown },
      }
    }
    latest!.settledConsumption![0]!.window.end = endAt - 30_000
    expect(estimate(history)).toMatchObject({
      status: "available",
      estimates: [{ netInflow: { amount: { value: "-5" } } }],
    })
  })

  it("keeps independently evidenced CNY and XNO ledgers in one account", () => {
    const history = store()
    const entries = history.financialSnapshotsByAccountId!.account!
    for (const entry of entries) {
      const other = structuredClone(entry.balance!.positions[0]!)
      other.id = "crypto"
      other.asset = { kind: ASSET_KINDS.Crypto, id: "XNO" }
      other.scope.walletId = "crypto"
      entry.balance!.positions.push(other)
    }
    const fact = structuredClone(entries[1]!.settledConsumption![0]!)
    fact.asset = { kind: ASSET_KINDS.Crypto, id: "XNO" }
    fact.scope.walletId = "crypto"
    entries[1]!.settledConsumption!.push(fact)
    expect(estimate(history).estimates).toMatchObject([
      {
        status: "available",
        netInflow: { amount: { asset: { code: "CNY" }, value: "-5" } },
      },
      {
        status: "available",
        netInflow: { amount: { asset: { id: "XNO" }, value: "-5" } },
      },
    ])
    const baseline = entries[0]!.balance!.positions.pop()!
    expect(estimate(history).estimates).toMatchObject([
      { status: "available", netInflow: { amount: { value: "-5" } } },
      { status: "missing_baseline", position: { asset: { id: "XNO" } } },
    ])
    entries[0]!.balance!.positions.push(baseline)
    entries[1]!.settledConsumption!.pop()
    expect(estimate(history).estimates).toMatchObject([
      { status: "available", netInflow: { amount: { value: "-5" } } },
      {
        netInflow: { status: "unavailable", reason: "consumption-unavailable" },
        position: { asset: { id: "XNO" } },
      },
    ])
  })

  it("does not bridge a removed and re-created wallet series", () => {
    const history = store()
    const entries = history.financialSnapshotsByAccountId!.account!
    const removedKey = getFinancialSeriesKey(entries[0]!.balance!.positions[0]!)
    entries[0]!.generation = 1
    entries[1]!.generation = 3
    entries.splice(1, 0, {
      generation: 2,
      source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
      balance: {
        ...entries[0]!.balance!,
        capturedAt: startAt + 1000,
        positions: [],
      },
      endedPositionKeys: [removedKey],
    })
    expect(estimate(history).estimates).toMatchObject([
      { status: "missing_baseline" },
    ])
  })

  it.each(["stale", "wallet", "source", "observedAt", "value"] as const)(
    "does not estimate from historical observations after current %s changes",
    (change) => {
      const history = store()
      const current: BalanceSnapshot = structuredClone(
        history.financialSnapshotsByAccountId!.account![1]!.balance!,
      )
      const end = current.positions[0]!
      if (
        change === "stale" &&
        end.amount.status === OBSERVATION_STATUSES.Known
      )
        end.amount = {
          ...end.amount,
          status: OBSERVATION_STATUSES.Stale,
          reason: FINANCIAL_OBSERVATION_REASONS.IdentityChanged,
        }
      if (change === "wallet") end.scope.walletId = "new-wallet"
      if (change === "source") end.amount.source.operation = "inference"
      if (
        change === "observedAt" &&
        end.amount.status === OBSERVATION_STATUSES.Known
      )
        end.amount.observedAt++
      if (
        change === "value" &&
        end.amount.status === OBSERVATION_STATUSES.Known
      )
        end.amount.value = "99"
      const result = estimate(history, "UTC", current)
      expect(result.status).not.toBe("available")
      expect(result.estimates).toMatchObject([
        { status: "missing_current_snapshot", position: { id: "ledger" } },
      ])
    },
  )

  it("preserves signed original currency and never compensates confirmed income", () => {
    expect(estimate()).toMatchObject({
      status: "available",
      reportedTodayIncome: null,
      estimatedTodayIncome: null,
      compensation: null,
      estimates: [
        {
          netInflow: {
            status: "available",
            amount: { asset: { kind: "currency", code: "CNY" }, value: "-5" },
          },
        },
      ],
    })
  })
  it("does not upgrade legacy quota snapshots into known money or income", () => {
    const history: DailyBalanceHistoryStore = {
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {
        account: {
          "2026-05-22": {
            balanceUsd: 0.0002,
            incomeUsd: 0.00002,
            consumptionUsd: 0.00004,
            capturedAt: startAt - 1,
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Alarm,
          },
          "2026-05-23": {
            balanceUsd: 0.0003,
            incomeUsd: 0.00004,
            consumptionUsd: 0.00004,
            capturedAt: endAt,
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
          },
        },
      },
    }
    expect(estimate(history)).toMatchObject({
      status: "legacy",
      reportedTodayIncome: null,
      estimatedTodayIncome: null,
      compensation: null,
    })
  })
  it("rejects yesterday afternoon plus today's consumption as a today estimate", () => {
    const history = store()
    history.financialSnapshotsByAccountId!.account![0]!.balance!.positions = [
      position("100", startAt - 9 * 3_600_000),
    ]
    expect(estimate(history).status).toBe("missing_baseline")
  })
  it("requires consumption timezone to match the selected day timezone", () => {
    expect(estimate(store(), "Asia/Shanghai").status).not.toBe("available")
  })
  it("rejects a console to inference source switch", () => {
    const history = structuredClone(store())
    history.financialSnapshotsByAccountId!.account![1]!.balance!.positions[0]!.amount.source.operation =
      "inference"
    expect(estimate(history).status).not.toBe("available")
  })
  it("requires consumption coverage and never reads today's old numeric counter", () => {
    const history = store()
    delete history.financialSnapshotsByAccountId!.account![1]!
      .settledConsumption
    expect(estimate(history).status).toBe("missing_cashflow")
  })
})
