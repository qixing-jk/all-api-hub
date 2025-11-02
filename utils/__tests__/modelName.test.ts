import { describe, expect, it } from "vitest"

import {
  buildModelComparisonWeight,
  calculateModelSimilarity,
  compareModels,
  extractModelTokens,
  extractProviderName,
  extractVersionSegments,
  isModelMatch,
  normalizeModelName,
  parseDateFromModelName
} from "../modelName"

describe("modelName utilities", () => {
  describe("normalizeModelName", () => {
    it("should convert to lowercase and remove special characters", () => {
      expect(normalizeModelName("GPT-4-Turbo")).toBe("gpt-4-turbo")
      expect(normalizeModelName("Claude-2.1")).toBe("claude-21")
      expect(normalizeModelName("gpt_3.5_turbo")).toBe("gpt_35_turbo")
    })

    it("should keep hyphens and underscores", () => {
      expect(normalizeModelName("gpt-4-turbo")).toBe("gpt-4-turbo")
      expect(normalizeModelName("gpt_3_5")).toBe("gpt_3_5")
    })

    it("should handle empty strings", () => {
      expect(normalizeModelName("")).toBe("")
      expect(normalizeModelName("   ")).toBe("")
    })
  })

  describe("extractModelTokens", () => {
    it("should split by hyphens and underscores", () => {
      expect(extractModelTokens("gpt-4-turbo")).toEqual(["gpt", "4", "turbo"])
      expect(extractModelTokens("claude_2_1")).toEqual(["claude", "2", "1"])
    })

    it("should split by dots", () => {
      expect(extractModelTokens("gpt.4.turbo")).toEqual(["gpt", "4", "turbo"])
    })

    it("should handle mixed delimiters", () => {
      expect(extractModelTokens("gpt-4.turbo_2024")).toEqual([
        "gpt",
        "4",
        "turbo",
        "2024"
      ])
    })

    it("should filter empty tokens", () => {
      expect(extractModelTokens("gpt--4")).toEqual(["gpt", "4"])
      expect(extractModelTokens("gpt..4")).toEqual(["gpt", "4"])
    })
  })

  describe("parseDateFromModelName", () => {
    it("should parse YYYY-MM-DD format", () => {
      expect(parseDateFromModelName("gpt-4-turbo-2024-04-09")).toBe(
        "2024-04-09"
      )
      expect(parseDateFromModelName("claude-2-2023-12-25")).toBe("2023-12-25")
    })

    it("should parse YYYYMMDD format", () => {
      expect(parseDateFromModelName("gpt-4-20240409")).toBe("2024-04-09")
      expect(parseDateFromModelName("model-20231225")).toBe("2023-12-25")
    })

    it("should parse YYYY.MM.DD format", () => {
      expect(parseDateFromModelName("gpt-4-turbo-2024.04.09")).toBe(
        "2024-04-09"
      )
    })

    it("should parse YYYY_MM_DD format", () => {
      expect(parseDateFromModelName("gpt-4-turbo-2024_04_09")).toBe(
        "2024-04-09"
      )
    })

    it("should return undefined for invalid dates", () => {
      expect(parseDateFromModelName("gpt-4-turbo")).toBeUndefined()
      expect(parseDateFromModelName("2024-13-01")).toBeUndefined() // invalid month
      expect(parseDateFromModelName("2019-01-01")).toBeUndefined() // year too old
      expect(parseDateFromModelName("2100-01-01")).toBeUndefined() // year too new
    })

    it("should return undefined when no date present", () => {
      expect(parseDateFromModelName("gpt-4")).toBeUndefined()
      expect(parseDateFromModelName("claude-2-1")).toBeUndefined()
    })
  })

  describe("extractVersionSegments", () => {
    it("should extract numeric tokens", () => {
      expect(extractVersionSegments("gpt-4-turbo")).toEqual(["4"])
      expect(extractVersionSegments("claude-2-1")).toEqual(["2", "1"])
    })

    it("should extract version with v prefix", () => {
      expect(extractVersionSegments("model-v3")).toEqual(["3"])
      expect(extractVersionSegments("api-v2-1")).toEqual(["2", "1"])
    })

    it("should handle mixed versions", () => {
      expect(extractVersionSegments("gpt-4-v2")).toEqual(["4", "2"])
    })

    it("should return empty array when no versions", () => {
      expect(extractVersionSegments("gpt-turbo")).toEqual([])
      expect(extractVersionSegments("claude")).toEqual([])
    })
  })

  describe("extractProviderName", () => {
    it("should extract known provider names", () => {
      expect(extractProviderName("gpt-4-turbo")).toBe("gpt")
      expect(extractProviderName("claude-2-1")).toBe("claude")
      expect(extractProviderName("gemini-pro")).toBe("gemini")
      expect(extractProviderName("llama-2-70b")).toBe("llama")
    })

    it("should return undefined for unknown providers", () => {
      expect(extractProviderName("unknown-model")).toBeUndefined()
      expect(extractProviderName("custom-123")).toBeUndefined()
    })

    it("should handle case insensitivity", () => {
      expect(extractProviderName("GPT-4")).toBe("gpt")
      expect(extractProviderName("Claude-2")).toBe("claude")
    })
  })

  describe("calculateModelSimilarity", () => {
    it("should return 1 for identical models", () => {
      expect(calculateModelSimilarity("gpt-4-turbo", "gpt-4-turbo")).toBe(1)
    })

    it("should return high similarity for similar models", () => {
      const similarity = calculateModelSimilarity(
        "gpt-4-turbo",
        "gpt-4-turbo-preview"
      )
      expect(similarity).toBeGreaterThan(0.5)
    })

    it("should return low similarity for different models", () => {
      const similarity = calculateModelSimilarity("gpt-4", "claude-2")
      expect(similarity).toBeLessThan(0.5)
    })

    it("should return 0 for completely different models", () => {
      const similarity = calculateModelSimilarity("gpt-4", "llama-2-70b")
      expect(similarity).toBe(0)
    })

    it("should handle empty strings", () => {
      expect(calculateModelSimilarity("", "gpt-4")).toBe(0)
      expect(calculateModelSimilarity("gpt-4", "")).toBe(0)
    })
  })

  describe("isModelMatch", () => {
    it("should match exact models", () => {
      expect(isModelMatch("gpt-4-turbo", "gpt-4-turbo")).toBe(true)
    })

    it("should match case-insensitive", () => {
      expect(isModelMatch("GPT-4-Turbo", "gpt-4-turbo")).toBe(true)
    })

    it("should match similar models above threshold", () => {
      expect(isModelMatch("gpt-4-turbo", "gpt-4-turbo-preview", 0.5)).toBe(
        true
      )
    })

    it("should not match different models", () => {
      expect(isModelMatch("gpt-4", "claude-2")).toBe(false)
    })

    it("should respect similarity threshold", () => {
      expect(isModelMatch("gpt-4-turbo", "gpt-4-turbo-preview", 0.9)).toBe(
        false
      )
      expect(isModelMatch("gpt-4-turbo", "gpt-4-turbo-preview", 0.6)).toBe(
        true
      )
    })
  })

  describe("buildModelComparisonWeight", () => {
    it("should extract date, version, and lexicographic info", () => {
      const weight = buildModelComparisonWeight("gpt-4-turbo-2024-04-09")
      expect(weight.date).toBe("2024-04-09")
      expect(weight.version).toEqual(["4", "2024", "04", "09"])
      expect(weight.lexicographic).toBe("gpt-4-turbo-2024-04-09")
    })

    it("should handle models without dates", () => {
      const weight = buildModelComparisonWeight("gpt-4-turbo")
      expect(weight.date).toBeUndefined()
      expect(weight.version).toEqual(["4"])
      expect(weight.lexicographic).toBe("gpt-4-turbo")
    })

    it("should handle models without versions", () => {
      const weight = buildModelComparisonWeight("turbo-model")
      expect(weight.date).toBeUndefined()
      expect(weight.version).toEqual([])
      expect(weight.lexicographic).toBe("turbo-model")
    })
  })

  describe("compareModels", () => {
    it("should prefer models with dates over those without", () => {
      expect(compareModels("gpt-4-2024-04-09", "gpt-4-turbo")).toBeLessThan(0)
      expect(compareModels("gpt-4-turbo", "gpt-4-2024-04-09")).toBeGreaterThan(
        0
      )
    })

    it("should prefer latest date", () => {
      expect(
        compareModels("gpt-4-2024-04-09", "gpt-4-2024-03-01")
      ).toBeLessThan(0)
      expect(
        compareModels("gpt-4-2024-03-01", "gpt-4-2024-04-09")
      ).toBeGreaterThan(0)
    })

    it("should compare by version when dates equal", () => {
      expect(compareModels("gpt-4-v2", "gpt-4-v1")).toBeLessThan(0)
      expect(compareModels("gpt-3", "gpt-4")).toBeGreaterThan(0)
    })

    it("should prefer longer version arrays", () => {
      expect(compareModels("gpt-4-1-2", "gpt-4-1")).toBeLessThan(0)
    })

    it("should use lexicographic comparison as final tiebreaker", () => {
      expect(compareModels("gpt-4-turbo", "gpt-4-preview")).toBeGreaterThan(0)
      expect(compareModels("gpt-4-preview", "gpt-4-turbo")).toBeLessThan(0)
    })

    it("should return 0 for identical models", () => {
      expect(compareModels("gpt-4-turbo", "gpt-4-turbo")).toBe(0)
    })

    it("should handle mixed date and version scenarios", () => {
      // Model with date should win over model without date
      expect(
        compareModels("model-2024-01-01", "model-v2")
      ).toBeLessThan(0)

      // Between models with same date, compare versions
      const model1 = "gpt-4-2024-04-09"
      const model2 = "gpt-3-2024-04-09"
      expect(compareModels(model1, model2)).toBeLessThan(0) // gpt-4 > gpt-3
    })
  })
})
