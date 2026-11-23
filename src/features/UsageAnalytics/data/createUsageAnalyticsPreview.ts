import { createReportPreviewAccounts } from "~/features/DevPanel/reportPreviewAccounts"
import { REPORT_PREVIEW_SCENARIOS } from "~/features/DevPanel/reportPreviewScenarios"
import type { ReportPreviewScenario } from "~/features/DevPanel/reportPreviewScenarios"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import {
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  createEmptyUsageHistoryAccountStore,
  ingestConsumeLogItems,
} from "~/services/history/usageHistory/core"
import {
  LogType,
  type LogItem,
} from "~/services/history/usageHistory/usageLogModel"
import {
  USAGE_HISTORY_STORE_SCHEMA_VERSION,
  type UsageHistoryStore,
} from "~/types/usageHistory"

/** Preview the regular filters, charts and latency views through normal log aggregation. */
export function createUsageAnalyticsPreview(scenario: ReportPreviewScenario) {
  const now = Date.now()
  const mixed = scenario === REPORT_PREVIEW_SCENARIOS.Mixed
  const sample = createReportPreviewAccounts(mixed, now).slice(0, mixed ? 4 : 1)
  const store: UsageHistoryStore = {
    schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
    accounts: {},
  }
  if (scenario !== REPORT_PREVIEW_SCENARIOS.Empty) {
    sample.forEach(({ account, asset }, index) => {
      const accountStore = createEmptyUsageHistoryAccountStore()
      const scope = accountBalanceScope({
        baseUrl: account.site_url,
        accountId: account.id,
      })
      const items = Array.from({ length: 14 }, (_, day): LogItem => {
        const at = Math.floor((now - day * 86_400_000) / 1000)
        const model = day % 3
        return {
          id: day + 1,
          user_id: index + 1,
          created_at: at,
          type: LogType.Consume,
          content: "",
          username: "",
          token_name: model === 0 ? "Production" : "Playground",
          model_name: ["gpt-4.1-mini", "claude-sonnet", "gemini-flash"][model]!,
          quota: 0,
          prompt_tokens: 1500 + (day % 5) * 550,
          completion_tokens: 250 + model * 150,
          use_time: 1 + (day % 7),
          is_stream: false,
          channel_id: 0,
          channel_name: "",
          token_id: model === 0 ? 1 : 2,
          group: "",
          ip: "",
          other: "",
          consumption:
            index === 3 && day % 2 === 1
              ? undefined
              : {
                  asset,
                  scope,
                  window: {
                    start: at * 1000,
                    end: at * 1000 + 1,
                    timeZone: "UTC",
                  },
                  settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
                  coverage: FINANCIAL_COVERAGE.Partial,
                  amount: {
                    status: OBSERVATION_STATUSES.Known,
                    value: ["6", "0.35", "180", "2"][index]!,
                    source: {
                      adapter: "preview",
                      operation: "usage",
                      kind: EVIDENCE_KINDS.Reported,
                      contractVersion: "1",
                    },
                    observedAt: at * 1000,
                  },
                },
        }
      })
      ingestConsumeLogItems({
        accountStore,
        items,
        startCursor: accountStore.cursor,
        cursorCandidate: accountStore.cursor,
      })
      store.accounts[account.id] = accountStore
    })
  }
  return { accounts: sample.map(({ account }) => account), store }
}
