import { expect, it } from "vitest"

import {
  getAccountTotalsRows,
  getModelTotalsRows,
  getSlowTokenRows,
  resolveLatencyAggregateForSelection,
} from "~/features/UsageAnalytics/usageSelection"
import { computeUsageHistoryExport } from "~/services/history/usageHistory/analytics"
import {
  createEmptyUsageHistoryAccountStore,
  createEmptyUsageHistoryAggregate,
  createEmptyUsageHistoryLatencyAggregate,
} from "~/services/history/usageHistory/core"

const emptyExport = () =>
  computeUsageHistoryExport({
    store: { schemaVersion: 1, accounts: {} },
    selection: { accountIds: [], startDay: "2026-01-01", endDay: "2026-01-01" },
  })

it("aggregates models only from selected tokens and tolerates missing token data", () => {
  const exportData = emptyExport()
  const aggregate = {
    ...createEmptyUsageHistoryAggregate(),
    totalTokens: 5,
    quotaConsumed: 2,
  }
  exportData.fused.byTokenByModel = {
    a: { model: aggregate },
    b: { model: aggregate },
    excluded: { other: aggregate },
  }
  expect(
    getModelTotalsRows({
      exportData,
      tokenIds: ["a", "missing", "b"],
      topN: 10,
    }),
  ).toEqual([{ modelName: "model", totalTokens: 10, quotaConsumed: 4 }])
})

it("merges selected-token latency while preserving extended histogram buckets", () => {
  const exportData = emptyExport()
  const baseline = createEmptyUsageHistoryLatencyAggregate()
  const buckets = baseline.buckets.map(() => 1).concat([3])
  exportData.fused.latencyByToken = {
    a: { ...baseline, count: 2, slowCount: 1, sum: 6, max: 4, buckets },
    excluded: { ...baseline, count: 100 },
  }
  const result = resolveLatencyAggregateForSelection({
    exportData,
    tokenIds: ["a", "missing"],
  })
  expect(result).toMatchObject({
    count: 2,
    slowCount: 1,
    sum: 6,
    max: 4,
    buckets,
  })
  expect(exportData.fused.latencyByToken.a?.buckets).toEqual(buckets)
})

it("labels unknown and unnamed slow tokens and sorts equal account totals by label", () => {
  const exportData = emptyExport()
  const latency = {
    ...createEmptyUsageHistoryLatencyAggregate(),
    slowCount: 2,
    count: 3,
  }
  exportData.fused.latencyByToken = { unknown: latency, unnamed: latency }
  expect(
    getSlowTokenRows({
      exportData,
      tokenIds: [],
      topN: 10,
      unknownLabel: "Unknown",
    }).map((row) => row.label),
  ).toEqual(["Unknown", "#unnamed"])
  exportData.selection.accountIds = ["a", "b"]
  exportData.accounts = {
    a: createEmptyUsageHistoryAccountStore(),
    b: createEmptyUsageHistoryAccountStore(),
  }
  expect(
    getAccountTotalsRows({
      exportData,
      tokenIds: [],
      accountLabels: { a: "Zulu", b: "Alpha" },
    }).map((row) => row.accountId),
  ).toEqual(["b", "a"])
})
