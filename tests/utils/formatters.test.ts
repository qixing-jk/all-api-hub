import { describe, expect, it, vi } from "vitest"

import type { CurrencyType } from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import {
  calculateTotalBalance,
  calculateTotalConsumption,
  calculateTotalIncomeForSites,
  createSortComparator,
  formatFullTime,
  formatKeyTime,
  formatQuota,
  formatRelativeTime,
  formatTimestamp,
  formatTokenCount,
  formatUsedQuota,
  getCurrencyDisplayName,
  getCurrencySymbol,
  getGroupBadgeStyle,
  getOppositeCurrency,
  getStatusBadgeStyle,
  getTodayMetricPresentation,
  normalizeToDate,
  normalizeToMs,
} from "~/utils/core/formatters"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

describe("formatters utilities", () => {
  describe("getTodayMetricPresentation", () => {
    it("requires refresh for legacy-unclassified account availability", () => {
      expect(
        getTodayMetricPresentation(999, {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
        }),
      ).toEqual({
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        value: null,
        requiresRefresh: true,
      })
    })

    it("does not require refresh for unsupported account availability", () => {
      expect(
        getTodayMetricPresentation(999, {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        }),
      ).toEqual({
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        value: null,
        requiresRefresh: false,
      })
    })

    it("requires refresh for aggregate coverage containing legacy metrics", () => {
      expect(
        getTodayMetricPresentation(30, {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          completeCount: 1,
          partialCount: 1,
          eligibleCount: 3,
          legacyUnclassifiedCount: 1,
        }),
      ).toEqual({
        status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
        value: 30,
        requiresRefresh: true,
      })
    })

    it("does not require refresh for ordinary aggregate coverage", () => {
      expect(
        getTodayMetricPresentation(30, {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
          completeCount: 2,
          partialCount: 0,
          eligibleCount: 2,
          legacyUnclassifiedCount: 0,
        }),
      ).toEqual({
        status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
        value: 30,
        requiresRefresh: false,
      })
    })
  })

  describe("formatTokenCount", () => {
    it("should format large numbers with M suffix", () => {
      expect(formatTokenCount(1500000)).toBe("1.5M")
      expect(formatTokenCount(2000000)).toBe("2.0M")
    })

    it("should format medium numbers with K suffix", () => {
      expect(formatTokenCount(1500)).toBe("1.5K")
      expect(formatTokenCount(2000)).toBe("2.0K")
    })

    it("should return string for small numbers", () => {
      expect(formatTokenCount(500)).toBe("500")
      expect(formatTokenCount(99)).toBe("99")
    })

    it("should handle zero", () => {
      expect(formatTokenCount(0)).toBe("0")
    })
  })

  describe("normalizeToMs", () => {
    it("should convert seconds to milliseconds", () => {
      const seconds = 1640000000 // Unix timestamp in seconds
      const result = normalizeToMs(seconds)
      expect(result).toBe(seconds * 1000)
    })

    it("should keep milliseconds as is", () => {
      const milliseconds = 1640000000000 // Unix timestamp in ms
      const result = normalizeToMs(milliseconds)
      expect(result).toBe(milliseconds)
    })

    it("should handle Date objects", () => {
      const date = new Date("2024-01-01T00:00:00.000Z")
      const result = normalizeToMs(date)
      expect(result).toBe(date.getTime())
    })

    it("should handle null and undefined", () => {
      expect(normalizeToMs(null)).toBeNull()
      expect(normalizeToMs(undefined)).toBeNull()
    })

    it("should handle invalid inputs", () => {
      expect(normalizeToMs("invalid" as any)).toBeNull()
    })
  })

  describe("normalizeToDate", () => {
    it("should convert timestamp to Date", () => {
      const timestamp = 1640000000000
      const result = normalizeToDate(timestamp)
      expect(result).toBeInstanceOf(Date)
      expect(result?.getTime()).toBe(timestamp)
    })

    it("should handle null and undefined", () => {
      expect(normalizeToDate(null)).toBeNull()
      expect(normalizeToDate(undefined)).toBeNull()
    })

    it("should handle Date objects", () => {
      const date = new Date("2024-01-01T00:00:00.000Z")
      const result = normalizeToDate(date)
      expect(result).toBeInstanceOf(Date)
      expect(result?.getTime()).toBe(date.getTime())
    })
  })

  describe("getCurrencySymbol", () => {
    it("should return correct symbol for USD", () => {
      expect(getCurrencySymbol("USD" as CurrencyType)).toBe("$")
    })

    it("should return correct symbol for CNY", () => {
      expect(getCurrencySymbol("CNY" as CurrencyType)).toBe("¥")
    })
  })

  describe("getOppositeCurrency", () => {
    it("should return CNY for USD", () => {
      expect(getOppositeCurrency("USD" as CurrencyType)).toBe("CNY")
    })

    it("should return USD for CNY", () => {
      expect(getOppositeCurrency("CNY" as CurrencyType)).toBe("USD")
    })
  })

  describe("createSortComparator", () => {
    const items = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
      { name: "Charlie", age: 35 },
    ]

    it("should sort in ascending order", () => {
      const comparator = createSortComparator<(typeof items)[0]>("age", "asc")
      const sorted = [...items].sort(comparator)
      expect(sorted[0].name).toBe("Bob")
      expect(sorted[2].name).toBe("Charlie")
    })

    it("should sort in descending order", () => {
      const comparator = createSortComparator<(typeof items)[0]>("age", "desc")
      const sorted = [...items].sort(comparator)
      expect(sorted[0].name).toBe("Charlie")
      expect(sorted[2].name).toBe("Bob")
    })

    it("should handle string fields", () => {
      const comparator = createSortComparator<(typeof items)[0]>("name", "asc")
      const sorted = [...items].sort(comparator)
      expect(sorted[0].name).toBe("Alice")
      expect(sorted[2].name).toBe("Charlie")
    })
  })

  describe("formatKeyTime", () => {
    it("should return translation string when timestamp is non-positive", () => {
      const result = formatKeyTime(0)
      expect(result).toBe("keyManagement:keyDetails.neverExpires")
    })

    it("should format timestamp using the runtime locale when positive", () => {
      const timestamp = new Date(2024, 0, 1).getTime()
      const localeSpy = vi
        .spyOn(Date.prototype, "toLocaleDateString")
        .mockReturnValue("2024-01-01")

      const result = formatKeyTime(timestamp)

      expect(result).toBe("2024-01-01")
      expect(localeSpy).toHaveBeenCalledWith()

      localeSpy.mockRestore()
    })
  })

  describe("formatRelativeTime", () => {
    it("should return empty string when date is undefined", () => {
      expect(formatRelativeTime(undefined)).toBe("")
    })

    it("should format human-readable relative strings", () => {
      vi.useFakeTimers()
      const now = new Date(2024, 0, 1, 12, 0, 0)
      vi.setSystemTime(now)
      const anHourAgo = new Date(2024, 0, 1, 11, 0, 0)

      expect(formatRelativeTime(anHourAgo)).toBe("an hour ago")

      vi.useRealTimers()
    })
  })

  describe("formatFullTime", () => {
    it("should return empty string when date is undefined", () => {
      expect(formatFullTime(undefined)).toBe("")
    })

    it("should format date into YYYY/MM/DD HH:mm:ss", () => {
      const date = new Date(2024, 0, 3, 9, 5, 7)
      expect(formatFullTime(date)).toBe("2024/01/03 09:05:07")
    })
  })

  describe("calculateTotalConsumption", () => {
    it("uses the same available contributors for USD and CNY totals", () => {
      const result = calculateTotalConsumption([
        buildDisplaySiteData({
          todayConsumption: { USD: 10, CNY: 70 },
        }),
        buildDisplaySiteData({
          id: "partial",
          todayConsumption: { USD: 20, CNY: 140 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability({
            consumption: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
              reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
            },
          }),
        }),
        buildDisplaySiteData({
          id: "unavailable",
          todayConsumption: { USD: 999, CNY: 6993 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability({
            consumption: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
            },
          }),
        }),
      ])

      expect(result).toEqual({
        amount: { USD: 30, CNY: 210 },
        coverage: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          completeCount: 1,
          partialCount: 1,
          eligibleCount: 3,
          legacyUnclassifiedCount: 0,
        },
      })
    })

    it("recalculates coverage for a filtered subset and excludes unavailable compatibility values", () => {
      const partial = buildDisplaySiteData({
        id: "partial",
        todayConsumption: { USD: 20, CNY: 140 },
        todayStatsAvailability: buildCompleteTodayStatsAvailability({
          consumption: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason: ACCOUNT_TODAY_METRIC_REASONS.PageLimit,
          },
        }),
      })
      const unavailable = buildDisplaySiteData({
        id: "unavailable",
        todayConsumption: { USD: 999, CNY: 6993 },
        todayStatsAvailability: buildCompleteTodayStatsAvailability({
          consumption: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
          },
        }),
      })

      expect(calculateTotalConsumption([partial, unavailable])).toEqual({
        amount: { USD: 20, CNY: 140 },
        coverage: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          completeCount: 0,
          partialCount: 1,
          eligibleCount: 2,
          legacyUnclassifiedCount: 0,
        },
      })
      expect(calculateTotalConsumption([]).coverage.status).toBe(
        ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      )
    })
  })

  describe("calculateTotalBalance", () => {
    it("should sum balances across sites and round to 2 decimals", () => {
      const data = [
        { balance: { USD: 1.234, CNY: 7.89 } },
        { balance: { USD: 2.345, CNY: 8.11 } },
      ] as any

      const result = calculateTotalBalance(data)

      expect(result.USD).toBeCloseTo(3.58, 2)
      expect(result.CNY).toBeCloseTo(16.0, 1)
    })

    it("should exclude disabled and explicitly excluded accounts", () => {
      const data = [
        { balance: { USD: 10, CNY: 20 }, disabled: false },
        { balance: { USD: 1, CNY: 2 }, excludeFromTotalBalance: true },
        { balance: { USD: 5, CNY: 10 }, disabled: true },
      ] as any

      const result = calculateTotalBalance(data)

      expect(result.USD).toBe(10)
      expect(result.CNY).toBe(20)
    })
  })

  describe("calculateTotalIncomeForSites", () => {
    it("excludes disabled accounts and accounts opted out of today income totals", () => {
      const data = [
        buildDisplaySiteData({ todayIncome: { USD: 10, CNY: 70 } }),
        buildDisplaySiteData({
          id: "excluded",
          todayIncome: { USD: 1, CNY: 7 },
          excludeFromTodayIncome: true,
        }),
        buildDisplaySiteData({
          id: "disabled",
          todayIncome: { USD: 5, CNY: 35 },
          disabled: true,
        }),
      ]

      const result = calculateTotalIncomeForSites(data)

      expect(result.amount).toEqual({ USD: 10, CNY: 70 })
      expect(result.coverage).toEqual({
        status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
        completeCount: 1,
        partialCount: 0,
        eligibleCount: 1,
        legacyUnclassifiedCount: 0,
      })
    })

    it("reports an empty eligible subset as unavailable", () => {
      expect(calculateTotalIncomeForSites([])).toEqual({
        amount: { USD: 0, CNY: 0 },
        coverage: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          completeCount: 0,
          partialCount: 0,
          eligibleCount: 0,
          legacyUnclassifiedCount: 0,
        },
      })
    })
  })

  describe("getCurrencyDisplayName", () => {
    it("should use correct translation keys for USD and CNY", () => {
      expect(getCurrencyDisplayName("USD")).toBe("common:currency.usd")
      expect(getCurrencyDisplayName("CNY")).toBe("common:currency.cny")
    })
  })

  describe("formatTimestamp", () => {
    it("should return translation when timestamp is non-positive", () => {
      const result = formatTimestamp(0)
      expect(result).toBe("common:time.neverExpires")
    })

    it("should format timestamp using the runtime locale when positive", () => {
      const timestamp = new Date(2024, 0, 1).getTime()
      const localeSpy = vi
        .spyOn(Date.prototype, "toLocaleDateString")
        .mockReturnValue("2024-01-01")

      const result = formatTimestamp(timestamp)

      expect(result).toBe("2024-01-01")
      expect(localeSpy).toHaveBeenCalledWith()

      localeSpy.mockRestore()
    })
  })

  describe("formatQuota and formatUsedQuota", () => {
    it("should return unlimited label when quota is unlimited or negative", () => {
      const tokenUnlimited = {
        unlimited_quota: true,
        remain_quota: 1000,
      } as any
      const tokenNegative = {
        unlimited_quota: false,
        remain_quota: -1,
      } as any

      expect(formatQuota(tokenUnlimited)).toBe("common:quota.unlimited")
      expect(formatQuota(tokenNegative)).toBe("common:quota.unlimited")
    })

    it("should format remaining and used quota with $ and 2 decimals", () => {
      const token = {
        unlimited_quota: false,
        remain_quota: 12345,
        used_quota: 6789,
      } as any

      const quota = formatQuota(token)
      const used = formatUsedQuota(token)

      expect(quota.startsWith("$")).toBe(true)
      expect(used.startsWith("$")).toBe(true)
      expect(quota).toMatch(/\$\d+\.\d{2}/)
      expect(used).toMatch(/\$\d+\.\d{2}/)
    })
  })

  describe("getGroupBadgeStyle", () => {
    it("should return a non-empty class string for given group", () => {
      const style = getGroupBadgeStyle("vip")
      expect(typeof style).toBe("string")
      expect(style.length).toBeGreaterThan(0)
    })

    it("should fall back to default group for empty string", () => {
      const style = getGroupBadgeStyle("")
      const defaultStyle = getGroupBadgeStyle("default")
      expect(style).toBe(defaultStyle)
    })
  })

  describe("getStatusBadgeStyle", () => {
    it("should return green style for status 1", () => {
      expect(getStatusBadgeStyle(1)).toBe(
        "bg-green-100 text-green-800 border-green-200",
      )
    })

    it("should return red style for non-1 status", () => {
      expect(getStatusBadgeStyle(0)).toBe(
        "bg-red-100 text-red-800 border-red-200",
      )
      expect(getStatusBadgeStyle(2)).toBe(
        "bg-red-100 text-red-800 border-red-200",
      )
    })
  })
})
