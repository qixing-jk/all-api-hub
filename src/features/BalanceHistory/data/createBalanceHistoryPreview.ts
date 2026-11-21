import { createReportPreviewAccounts } from "~/features/DevPanel/reportPreviewAccounts"
import { REPORT_PREVIEW_SCENARIOS } from "~/features/DevPanel/reportPreviewScenarios"
import type { ReportPreviewScenario } from "~/features/DevPanel/reportPreviewScenarios"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_FUNDING,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import {
  DAILY_BALANCE_HISTORY_CAPTURE_SOURCES,
  DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
  type DailyBalanceHistoryStore,
  type FinancialHistorySnapshot,
} from "~/types/dailyBalanceHistory"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

/** Build history with the same native observations the runtime report consumes. */
export function createBalanceHistoryPreview(scenario: ReportPreviewScenario) {
  const now = Date.now()
  const mixed = scenario === REPORT_PREVIEW_SCENARIOS.Mixed
  const sample = createReportPreviewAccounts(mixed, now)
  const financialSnapshotsByAccountId: Record<
    string,
    FinancialHistorySnapshot[]
  > = {}
  const store: DailyBalanceHistoryStore = {
    schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
    referenceSnapshotsByAccountId: {},
    financialSnapshotsByAccountId,
  }
  const source = DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh
  if (scenario !== REPORT_PREVIEW_SCENARIOS.Empty) {
    sample.forEach(({ account, asset }, index) => {
      const scope = accountBalanceScope({
        baseUrl: account.site_url,
        accountId: account.id,
      })
      const snapshots: FinancialHistorySnapshot[] = []
      for (let day = 29; day >= 0; day--) {
        const at = now - day * 86_400_000
        const change = (day % 7) * 5 - (day % 3) * 10
        const value =
          (index === 2 ? 5200 : index === 3 ? -12 : 146 + index * 25) + change
        if (day >= 24) {
          if (index < 2) {
            const archive = (store.referenceSnapshotsByAccountId[account.id] ??=
              {})
            archive[getDayKeyFromUnixSeconds(Math.floor(at / 1000))] = {
              balanceUsd: value,
              incomeUsd: day % 3 === 0 ? 20 : 0,
              consumptionUsd: 3,
              capturedAt: at,
              source,
            }
          }
          continue
        }
        if (mixed && day > 0 && day % 5 === 0) continue
        const position = balancePosition({
          id: "balance",
          role: asset.kind === ASSET_KINDS.Quota ? "allowance" : "ledger",
          scope,
          asset,
          value: String(value),
          observedAt: at,
          source: {
            adapter: "preview",
            operation: "balance",
            kind: EVIDENCE_KINDS.Reported,
            contractVersion: "1",
          },
        })
        const positions = [position]
        if (mixed && index === 0) {
          positions.push(
            balancePosition({
              id: "bonus-credits",
              label: "Bonus credits",
              role: BALANCE_ROLES.Allowance,
              funding: BALANCE_FUNDING.Granted,
              scope,
              asset,
              value: String(24 + (day % 7)),
              observedAt: at,
              source: position.amount.source,
            }),
          )
        }
        snapshots.push({
          source,
          balance: accountBalanceSnapshot(
            scope,
            positions,
            at,
            FINANCIAL_COVERAGE.Complete,
          ),
          ...(mixed &&
            day <= 1 &&
            at > new Date(at).setHours(0, 0, 0, 0) &&
            index < 2 && {
              ...(index === 0
                ? {
                    reportedIncome: [
                      {
                        asset,
                        scope,
                        coverage: FINANCIAL_COVERAGE.Complete,
                        classification: "unclassified" as const,
                        amount: observeAmount(
                          day === 0 ? "2.5" : "0",
                          {
                            adapter: "preview",
                            operation: "credits",
                            contractVersion: "1",
                            kind: EVIDENCE_KINDS.Reported,
                          },
                          at,
                        ),
                        window: {
                          start: new Date(at).setHours(0, 0, 0, 0),
                          end: at,
                          timeZone:
                            Intl.DateTimeFormat().resolvedOptions().timeZone,
                        },
                      },
                    ],
                  }
                : {
                    settledConsumption: [
                      {
                        asset,
                        scope,
                        coverage: FINANCIAL_COVERAGE.Complete,
                        settlement: "settled" as const,
                        amount: observeAmount(
                          "0.42",
                          {
                            adapter: "preview",
                            operation: "spending",
                            contractVersion: "1",
                            kind: EVIDENCE_KINDS.Reported,
                          },
                          at,
                        ),
                        window: {
                          start: new Date(at).setHours(0, 0, 0, 0),
                          end: at,
                          timeZone:
                            Intl.DateTimeFormat().resolvedOptions().timeZone,
                        },
                      },
                    ],
                  }),
            }),
        })
      }
      financialSnapshotsByAccountId[account.id] = snapshots
    })
  }
  return { accounts: sample.map(({ account }) => account), store }
}
