import { describe, expect, it, vi } from "vitest"

import {
  getBalanceHistoryMetricLabel,
  getBalanceHistoryQuickRangeLabel,
  getBalanceHistoryTrendScopeLabel,
} from "~/features/BalanceHistory/presentation"

describe("BalanceHistory presentation", () => {
  const t = vi.fn((key: string) => key) as any

  describe("getBalanceHistoryMetricLabel", () => {
    it.each([
      ["balance", "balanceHistory:metrics.balance"],
      ["income", "balanceHistory:metrics.income"],
      ["estimatedIncome", "balanceHistory:metrics.estimatedIncome"],
      ["outcome", "balanceHistory:metrics.outcome"],
      ["net", "balanceHistory:metrics.net"],
    ] as const)("maps metric %s to %s", (metric, expectedKey) => {
      expect(getBalanceHistoryMetricLabel(t, metric)).toBe(expectedKey)
    })

    it("throws on unknown metric", () => {
      expect(() =>
        getBalanceHistoryMetricLabel(t, "unknown" as any),
      ).toThrowError(/Unexpected balance history metric/)
    })
  })

  describe("getBalanceHistoryTrendScopeLabel", () => {
    it.each([
      ["accounts", "balanceHistory:trend.scopes.accounts"],
      ["total", "balanceHistory:trend.scopes.total"],
    ] as const)("maps scope %s to %s", (scope, expectedKey) => {
      expect(getBalanceHistoryTrendScopeLabel(t, scope)).toBe(expectedKey)
    })

    it("throws on unknown scope", () => {
      expect(() =>
        getBalanceHistoryTrendScopeLabel(t, "unknown" as any),
      ).toThrowError(/Unexpected trend scope/)
    })
  })

  describe("getBalanceHistoryQuickRangeLabel", () => {
    it.each([
      ["7d", "balanceHistory:filters.quickRanges.7d"],
      ["30d", "balanceHistory:filters.quickRanges.30d"],
      ["90d", "balanceHistory:filters.quickRanges.90d"],
      ["180d", "balanceHistory:filters.quickRanges.180d"],
      ["365d", "balanceHistory:filters.quickRanges.365d"],
    ] as const)("maps range %s to %s", (rangeId, expectedKey) => {
      expect(getBalanceHistoryQuickRangeLabel(t, rangeId)).toBe(expectedKey)
    })

    it("throws on unknown range id", () => {
      expect(() =>
        getBalanceHistoryQuickRangeLabel(t, "unknown" as any),
      ).toThrowError(/Unexpected quick range id/)
    })
  })
})
