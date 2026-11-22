import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import type { BalanceSnapshot } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { maybeCaptureDailyBalanceSnapshot } from "~/services/history/dailyBalanceHistory/capture"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"

const { appendFinancialSnapshotMock } = vi.hoisted(() => ({
  appendFinancialSnapshotMock: vi.fn(),
}))
vi.mock("~/services/history/dailyBalanceHistory/storage", () => ({
  dailyBalanceHistoryStorage: {
    appendFinancialSnapshot: appendFinancialSnapshotMock,
  },
}))

const at = Date.UTC(2026, 4, 23, 12)
const scope = {
  subject: {
    kind: FINANCIAL_SUBJECT_KINDS.Account,
    accountId: "account-1",
  } as const,
  authority: "https://fixture.invalid",
  models: { kind: SCOPE_SELECTION_KINDS.All } as const,
  projects: { kind: SCOPE_SELECTION_KINDS.All } as const,
  keys: { kind: SCOPE_SELECTION_KINDS.All } as const,
  groups: { kind: SCOPE_SELECTION_KINDS.All } as const,
}
const balance: BalanceSnapshot = {
  schemaVersion: 2,
  subject: scope.subject,
  capturedAt: at,
  coverage: FINANCIAL_COVERAGE.Complete,
  positions: [
    balancePosition({
      id: "tokens",
      scope,
      value: "4500",
      asset: {
        kind: ASSET_KINDS.Quota,
        id: "fixture/token",
        label: "Token",
        displayScale: 1,
        displayLabel: "Token",
      },
      observedAt: at - 1000,
      source: {
        adapter: "fixture",
        contractVersion: "2",
        operation: "balance",
        kind: EVIDENCE_KINDS.Reported,
      },
    }),
  ],
}

describe("maybeCaptureDailyBalanceSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appendFinancialSnapshotMock.mockResolvedValue(true)
  })

  it("does not write new legacy quota history even when old numeric metrics are supplied", async () => {
    const legacyInput = {
      accountId: "account-1",
      quota: 1000000,
      today_income: 200000,
      today_quota_consumption: 300000,
      source: "refresh" as const,
    }
    expect(await maybeCaptureDailyBalanceSnapshot(legacyInput)).toBe(false)
    expect(appendFinancialSnapshotMock).not.toHaveBeenCalled()
  })

  it("captures native token observations and their own timestamps without inventing quota cashflow", async () => {
    expect(
      await maybeCaptureDailyBalanceSnapshot({
        accountId: "account-1",
        balance,
        source: "alarm",
        timeZone: "UTC",
      }),
    ).toBe(true)
    expect(appendFinancialSnapshotMock).toHaveBeenCalledWith({
      accountId: "account-1",
      snapshot: { balance, settledConsumption: undefined, source: "alarm" },
      retentionDays: DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays,
      timeZone: "UTC",
    })
  })

  it("does not capture when the user disabled history", async () => {
    expect(
      await maybeCaptureDailyBalanceSnapshot({
        config: { ...DEFAULT_BALANCE_HISTORY_PREFERENCES, enabled: false },
        accountId: "account-1",
        balance,
        source: "refresh",
      }),
    ).toBe(false)
    expect(appendFinancialSnapshotMock).not.toHaveBeenCalled()
  })

  it("archives a reported site-day cost without asserting settlement", async () => {
    const cost = {
      asset: { kind: "currency" as const, code: CURRENCIES.USD },
      amount: observeAmount(
        "3",
        {
          adapter: "fixture",
          operation: "stats",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
        at,
      ),
      scope,
    }
    expect(
      await maybeCaptureDailyBalanceSnapshot({
        accountId: "account-1",
        usage: [{ scope: ACCOUNT_USAGE_SCOPES.SiteToday, cost }],
        source: "refresh",
        timeZone: "UTC",
      }),
    ).toBe(true)
    expect(appendFinancialSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          reportedDayCosts: [cost],
        }),
      }),
    )
  })

  it("reports failed persistence without interrupting account refresh", async () => {
    appendFinancialSnapshotMock.mockRejectedValue(new Error("write failed"))
    expect(
      await maybeCaptureDailyBalanceSnapshot({
        accountId: "account-1",
        balance,
        source: "refresh",
      }),
    ).toBe(false)
  })
})
