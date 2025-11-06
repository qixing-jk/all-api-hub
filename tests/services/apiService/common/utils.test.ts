import { beforeEach, describe, expect, it, vi } from "vitest"

import type { LogItem } from "~/services/apiService/common/type"
import {
  aggregateUsageData,
  extractAmount,
  getTodayTimestampRange
} from "~/services/apiService/common/utils"

describe("API Service Common Utils", () => {
  describe("getTodayTimestampRange", () => {
    beforeEach(() => {
      vi.useRealTimers()
    })

    it("should return start and end timestamps for today", () => {
      const result = getTodayTimestampRange()

      expect(result).toHaveProperty("start")
      expect(result).toHaveProperty("end")
      expect(result.start).toBeLessThan(result.end)
      expect(typeof result.start).toBe("number")
      expect(typeof result.end).toBe("number")
    })

    it("should return timestamps in seconds (not milliseconds)", () => {
      const result = getTodayTimestampRange()

      // Unix timestamps in seconds should be around 10 digits
      expect(result.start.toString().length).toBe(10)
      expect(result.end.toString().length).toBe(10)
    })

    it("should have start at 00:00:00", () => {
      const result = getTodayTimestampRange()
      const startDate = new Date(result.start * 1000)

      expect(startDate.getHours()).toBe(0)
      expect(startDate.getMinutes()).toBe(0)
      expect(startDate.getSeconds()).toBe(0)
    })

    it("should have end at 23:59:59", () => {
      const result = getTodayTimestampRange()
      const endDate = new Date(result.end * 1000)

      expect(endDate.getHours()).toBe(23)
      expect(endDate.getMinutes()).toBe(59)
      expect(endDate.getSeconds()).toBe(59)
    })

    it("should return same day for both timestamps", () => {
      const result = getTodayTimestampRange()
      const startDate = new Date(result.start * 1000)
      const endDate = new Date(result.end * 1000)

      expect(startDate.getFullYear()).toBe(endDate.getFullYear())
      expect(startDate.getMonth()).toBe(endDate.getMonth())
      expect(startDate.getDate()).toBe(endDate.getDate())
    })

    it("should return consistent results when called multiple times", () => {
      const result1 = getTodayTimestampRange()
      const result2 = getTodayTimestampRange()

      expect(result1.start).toBe(result2.start)
      expect(result1.end).toBe(result2.end)
    })
  })

  describe("aggregateUsageData", () => {
    it("should aggregate empty array", () => {
      const result = aggregateUsageData([])

      expect(result).toEqual({
        today_quota_consumption: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0
      })
    })

    it("should aggregate single log item", () => {
      const items: LogItem[] = [
        {
          quota: 100,
          prompt_tokens: 50,
          completion_tokens: 30
        } as LogItem
      ]

      const result = aggregateUsageData(items)

      expect(result.today_quota_consumption).toBe(100)
      expect(result.today_prompt_tokens).toBe(50)
      expect(result.today_completion_tokens).toBe(30)
    })

    it("should aggregate multiple log items", () => {
      const items: LogItem[] = [
        { quota: 100, prompt_tokens: 50, completion_tokens: 30 },
        { quota: 200, prompt_tokens: 100, completion_tokens: 60 },
        { quota: 150, prompt_tokens: 75, completion_tokens: 45 }
      ] as LogItem[]

      const result = aggregateUsageData(items)

      expect(result.today_quota_consumption).toBe(450)
      expect(result.today_prompt_tokens).toBe(225)
      expect(result.today_completion_tokens).toBe(135)
    })

    it("should handle missing quota field", () => {
      const items: LogItem[] = [
        { prompt_tokens: 50, completion_tokens: 30 },
        { quota: 100, prompt_tokens: 40, completion_tokens: 20 }
      ] as LogItem[]

      const result = aggregateUsageData(items)

      expect(result.today_quota_consumption).toBe(100)
      expect(result.today_prompt_tokens).toBe(90)
      expect(result.today_completion_tokens).toBe(50)
    })

    it("should handle missing token fields", () => {
      const items: LogItem[] = [
        { quota: 100 },
        { quota: 200, prompt_tokens: 50 },
        { quota: 150, completion_tokens: 40 }
      ] as unknown as LogItem[]

      const result = aggregateUsageData(items)

      expect(result.today_quota_consumption).toBe(450)
      expect(result.today_prompt_tokens).toBe(50)
      expect(result.today_completion_tokens).toBe(40)
    })

    it("should handle zero values", () => {
      const items: LogItem[] = [
        { quota: 0, prompt_tokens: 0, completion_tokens: 0 },
        { quota: 100, prompt_tokens: 50, completion_tokens: 30 }
      ] as LogItem[]

      const result = aggregateUsageData(items)

      expect(result.today_quota_consumption).toBe(100)
      expect(result.today_prompt_tokens).toBe(50)
      expect(result.today_completion_tokens).toBe(30)
    })

    it("should handle large numbers", () => {
      const items: LogItem[] = [
        { quota: 1000000, prompt_tokens: 500000, completion_tokens: 300000 },
        { quota: 2000000, prompt_tokens: 1000000, completion_tokens: 600000 }
      ] as LogItem[]

      const result = aggregateUsageData(items)

      expect(result.today_quota_consumption).toBe(3000000)
      expect(result.today_prompt_tokens).toBe(1500000)
      expect(result.today_completion_tokens).toBe(900000)
    })
  })

  describe("extractAmount", () => {
    const DEFAULT_EXCHANGE_RATE = 7.0

    describe("USD amounts", () => {
      it("should extract USD amount with $ symbol", () => {
        const result = extractAmount("$100", DEFAULT_EXCHANGE_RATE)

        expect(result).not.toBeNull()
        expect(result?.currencySymbol).toBe("$")
        expect(result?.amount).toBe(100)
      })

      it("should extract USD with decimal", () => {
        const result = extractAmount("$12.50", DEFAULT_EXCHANGE_RATE)

        expect(result?.currencySymbol).toBe("$")
        expect(result?.amount).toBe(12.5)
      })

      it("should extract USD with comma separators", () => {
        const result = extractAmount("$1,234.56", DEFAULT_EXCHANGE_RATE)

        expect(result?.currencySymbol).toBe("$")
        expect(result?.amount).toBe(1234.56)
      })

      it("should handle USD with spaces", () => {
        const result = extractAmount("$ 100", DEFAULT_EXCHANGE_RATE)

        expect(result?.currencySymbol).toBe("$")
        expect(result?.amount).toBe(100)
      })
    })

    describe("CNY amounts", () => {
      it("should extract CNY amount and convert to USD", () => {
        const result = extractAmount("¥700", DEFAULT_EXCHANGE_RATE)

        expect(result?.currencySymbol).toBe("¥")
        expect(result?.amount).toBe(100) // 700 / 7 = 100
      })

      it("should convert CNY with decimal", () => {
        const result = extractAmount("¥87.5", DEFAULT_EXCHANGE_RATE)

        expect(result?.currencySymbol).toBe("¥")
        expect(result?.amount).toBe(12.5) // 87.5 / 7 = 12.5
      })

      it("should convert CNY with comma separators", () => {
        const result = extractAmount("¥8,645.92", DEFAULT_EXCHANGE_RATE)

        expect(result?.currencySymbol).toBe("¥")
        expect(result?.amount).toBeCloseTo(1235.13, 2) // 8645.92 / 7 ≈ 1235.13
      })
    })

    describe("Other currencies", () => {
      it("should extract EUR amount without conversion", () => {
        const result = extractAmount("€100", DEFAULT_EXCHANGE_RATE)

        expect(result?.currencySymbol).toBe("€")
        expect(result?.amount).toBe(100)
      })

      it("should extract GBP amount without conversion", () => {
        const result = extractAmount("£50.25", DEFAULT_EXCHANGE_RATE)

        expect(result?.currencySymbol).toBe("£")
        expect(result?.amount).toBe(50.25)
      })
    })

    describe("Edge cases", () => {
      it("should return null for text without currency", () => {
        const result = extractAmount("100", DEFAULT_EXCHANGE_RATE)

        expect(result).toBeNull()
      })

      it("should return null for empty string", () => {
        const result = extractAmount("", DEFAULT_EXCHANGE_RATE)

        expect(result).toBeNull()
      })

      it("should return null for currency symbol only", () => {
        const result = extractAmount("$", DEFAULT_EXCHANGE_RATE)

        expect(result).toBeNull()
      })

      it("should handle zero amount", () => {
        const result = extractAmount("$0", DEFAULT_EXCHANGE_RATE)

        expect(result?.amount).toBe(0)
      })

      it("should extract first currency match in text", () => {
        const result = extractAmount(
          "Price: $100 or €85",
          DEFAULT_EXCHANGE_RATE
        )

        expect(result?.currencySymbol).toBe("$")
        expect(result?.amount).toBe(100)
      })
    })

    describe("Different exchange rates", () => {
      it("should handle different exchange rate for CNY", () => {
        const result = extractAmount("¥650", 6.5)

        expect(result?.amount).toBe(100) // 650 / 6.5 = 100
      })

      it("should not affect USD with different exchange rate", () => {
        const result = extractAmount("$100", 6.5)

        expect(result?.amount).toBe(100) // USD not affected by exchange rate
      })

      it("should handle high exchange rates", () => {
        const result = extractAmount("¥1000", 10.0)

        expect(result?.amount).toBe(100) // 1000 / 10 = 100
      })
    })

    describe("Complex formatting", () => {
      it("should handle large numbers with commas", () => {
        const result = extractAmount("$1,234,567.89", DEFAULT_EXCHANGE_RATE)

        expect(result?.amount).toBe(1234567.89)
      })

      it("should handle integer amounts", () => {
        const result = extractAmount("$100", DEFAULT_EXCHANGE_RATE)

        expect(result?.amount).toBe(100)
        expect(Number.isInteger(result!.amount)).toBe(true)
      })

      it("should handle very small decimals", () => {
        const result = extractAmount("$0.01", DEFAULT_EXCHANGE_RATE)

        expect(result?.amount).toBe(0.01)
      })
    })
  })
})
