import { describe, expect, it } from "vitest"

import type { CurrencyType } from "~/types"

import {
  createSortComparator,
  formatTokenCount,
  generateId,
  getCurrencySymbol,
  getOppositeCurrency,
  normalizeToDate,
  normalizeToMs
} from "../formatters"

describe("formatters utilities", () => {
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

  describe("generateId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateId()
      const id2 = generateId()
      expect(id1).not.toBe(id2)
    })

    it("should use custom prefix", () => {
      const id = generateId("test")
      expect(id).toMatch(/^test-/)
    })

    it("should use default prefix", () => {
      const id = generateId()
      expect(id).toMatch(/^id-/)
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
      { name: "Charlie", age: 35 }
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
})
