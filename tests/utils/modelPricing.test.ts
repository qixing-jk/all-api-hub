import { describe, expect, it } from "vitest"

import type { ModelPricing } from "~/services/apiService/common/type"
import {
  calculateModelPrice,
  formatPrice,
  formatPriceCompact,
  formatPriceRange,
  getBillingModeStyle,
  getBillingModeText,
  getEndpointTypesText,
  isModelAvailableForGroup,
  isTokenBillingType,
} from "~/utils/modelPricing"

describe("modelPricing utils", () => {
  describe("isTokenBillingType", () => {
    it("should return true for quota_type 0 (token billing)", () => {
      expect(isTokenBillingType(0)).toBe(true)
    })

    it("should return false for quota_type 1 (per call billing)", () => {
      expect(isTokenBillingType(1)).toBe(false)
    })

    it("should return false for other quota types", () => {
      expect(isTokenBillingType(2)).toBe(false)
      expect(isTokenBillingType(-1)).toBe(false)
      expect(isTokenBillingType(99)).toBe(false)
    })
  })

  describe("calculateModelPrice", () => {
    const baseGroupRatio = { default: 1, vip: 2, premium: 3 }
    const exchangeRate = 7.0

    describe("Token-based billing (quota_type = 0)", () => {
      const tokenModel: ModelPricing = {
        model_name: "gpt-4",
        quota_type: 0,
        model_ratio: 15,
        completion_ratio: 2,
        model_price: 0,
        enable_groups: ["default", "vip"],
        supported_endpoint_types: ["chat"],
      }

      it("should calculate prices for default group", () => {
        const result = calculateModelPrice(
          tokenModel,
          baseGroupRatio,
          exchangeRate,
          "default",
        )

        // inputUSD = model_ratio × 2 × groupRatio = 15 × 2 × 1 = 30
        expect(result.inputUSD).toBe(30)
        // outputUSD = model_ratio × completion_ratio × 2 × groupRatio = 15 × 2 × 2 × 1 = 60
        expect(result.outputUSD).toBe(60)
        // inputCNY = inputUSD × exchangeRate = 30 × 7 = 210
        expect(result.inputCNY).toBe(210)
        // outputCNY = outputUSD × exchangeRate = 60 × 7 = 420
        expect(result.outputCNY).toBe(420)
        expect(result.perCallPrice).toBeUndefined()
      })

      it("should calculate prices for VIP group with 2x multiplier", () => {
        const result = calculateModelPrice(
          tokenModel,
          baseGroupRatio,
          exchangeRate,
          "vip",
        )

        // inputUSD = 15 × 2 × 2 = 60
        expect(result.inputUSD).toBe(60)
        // outputUSD = 15 × 2 × 2 × 2 = 120
        expect(result.outputUSD).toBe(120)
        expect(result.inputCNY).toBe(420)
        expect(result.outputCNY).toBe(840)
      })

      it("should calculate prices for premium group with 3x multiplier", () => {
        const result = calculateModelPrice(
          tokenModel,
          baseGroupRatio,
          exchangeRate,
          "premium",
        )

        // inputUSD = 15 × 2 × 3 = 90
        expect(result.inputUSD).toBe(90)
        // outputUSD = 15 × 2 × 2 × 3 = 180
        expect(result.outputUSD).toBe(180)
      })

      it("should use default multiplier (1) for unknown group", () => {
        const result = calculateModelPrice(
          tokenModel,
          baseGroupRatio,
          exchangeRate,
          "unknown",
        )

        expect(result.inputUSD).toBe(30)
        expect(result.outputUSD).toBe(60)
      })

      it("should handle model with completion_ratio = 1", () => {
        const equalRatioModel: ModelPricing = {
          ...tokenModel,
          completion_ratio: 1,
        }

        const result = calculateModelPrice(
          equalRatioModel,
          baseGroupRatio,
          exchangeRate,
          "default",
        )

        // outputUSD = 15 × 1 × 2 × 1 = 30
        expect(result.inputUSD).toBe(30)
        expect(result.outputUSD).toBe(30)
      })

      it("should handle zero model_ratio", () => {
        const zeroRatioModel: ModelPricing = {
          ...tokenModel,
          model_ratio: 0,
        }

        const result = calculateModelPrice(
          zeroRatioModel,
          baseGroupRatio,
          exchangeRate,
          "default",
        )

        expect(result.inputUSD).toBe(0)
        expect(result.outputUSD).toBe(0)
        expect(result.inputCNY).toBe(0)
        expect(result.outputCNY).toBe(0)
      })

      it("should handle different exchange rates", () => {
        const result = calculateModelPrice(
          tokenModel,
          baseGroupRatio,
          6.5,
          "default",
        )

        expect(result.inputCNY).toBe(195) // 30 × 6.5
        expect(result.outputCNY).toBe(390) // 60 × 6.5
      })
    })

    describe("Per-call billing (quota_type != 0)", () => {
      it("should calculate simple per-call price with number", () => {
        const perCallModel: ModelPricing = {
          model_name: "dalle-3",
          quota_type: 1,
          model_ratio: 0,
          completion_ratio: 1,
          model_price: 0.02,
          enable_groups: ["default"],
          supported_endpoint_types: ["image"],
        }

        const result = calculateModelPrice(
          perCallModel,
          baseGroupRatio,
          exchangeRate,
          "default",
        )

        expect(result.inputUSD).toBe(0)
        expect(result.outputUSD).toBe(0)
        expect(result.inputCNY).toBe(0)
        expect(result.outputCNY).toBe(0)
        expect(result.perCallPrice).toBe(0.02)
      })

      it("should apply group multiplier to per-call price", () => {
        const perCallModel: ModelPricing = {
          model_name: "dalle-3",
          quota_type: 1,
          model_ratio: 0,
          completion_ratio: 1,
          model_price: 0.02,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        }

        const result = calculateModelPrice(
          perCallModel,
          baseGroupRatio,
          exchangeRate,
          "vip",
        )

        // perCallPrice = 0.02 × 2 = 0.04
        expect(result.perCallPrice).toBe(0.04)
      })

      it("should handle complex per-call price with input/output", () => {
        const complexPerCallModel: ModelPricing = {
          model_name: "done-hub-model",
          quota_type: 1,
          model_ratio: 0,
          completion_ratio: 1,
          model_price: { input: 10, output: 20 },
          enable_groups: ["default"],
          supported_endpoint_types: ["chat"],
        }

        const result = calculateModelPrice(
          complexPerCallModel,
          baseGroupRatio,
          exchangeRate,
          "default",
        )

        // input: 10 × 1 × 0.002 = 0.02
        // output: 20 × 1 × 0.002 = 0.04
        expect(result.perCallPrice).toEqual({ input: 0.02, output: 0.04 })
      })

      it("should apply group multiplier to complex per-call price", () => {
        const complexPerCallModel: ModelPricing = {
          model_name: "done-hub-model",
          quota_type: 1,
          model_ratio: 0,
          completion_ratio: 1,
          model_price: { input: 10, output: 20 },
          enable_groups: ["default"],
          supported_endpoint_types: [],
        }

        const result = calculateModelPrice(
          complexPerCallModel,
          baseGroupRatio,
          exchangeRate,
          "vip",
        )

        // input: 10 × 2 × 0.002 = 0.04
        // output: 20 × 2 × 0.002 = 0.08
        expect(result.perCallPrice).toEqual({ input: 0.04, output: 0.08 })
      })

      it("should handle zero per-call price", () => {
        const freeModel: ModelPricing = {
          model_name: "free-model",
          quota_type: 1,
          model_ratio: 0,
          completion_ratio: 1,
          model_price: 0,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        }

        const result = calculateModelPrice(
          freeModel,
          baseGroupRatio,
          exchangeRate,
          "default",
        )

        expect(result.perCallPrice).toBe(0)
      })
    })
  })

  describe("formatPrice", () => {
    it("should format USD prices with $ symbol", () => {
      expect(formatPrice(1.2345, "USD", 4)).toBe("$1.2345")
    })

    it("should format CNY prices with ¥ symbol", () => {
      expect(formatPrice(10.5678, "CNY", 4)).toBe("¥10.5678")
    })

    it("should use default precision of 4", () => {
      expect(formatPrice(1.23456789, "USD")).toBe("$1.2346")
    })

    it("should handle zero price", () => {
      expect(formatPrice(0, "USD")).toBe("$0")
      expect(formatPrice(0, "CNY")).toBe("¥0")
    })

    it("should use exponential notation for very small prices", () => {
      expect(formatPrice(0.00001, "USD")).toBe("$1.00e-5")
      expect(formatPrice(0.000001, "CNY")).toBe("¥1.00e-6")
    })

    it("should format normally for prices >= 0.0001", () => {
      expect(formatPrice(0.0001, "USD", 4)).toBe("$0.0001")
      expect(formatPrice(0.001, "USD", 4)).toBe("$0.0010")
    })

    it("should respect custom precision", () => {
      expect(formatPrice(10.123456, "USD", 2)).toBe("$10.12")
      expect(formatPrice(10.123456, "USD", 6)).toBe("$10.123456")
    })

    it("should handle large prices", () => {
      expect(formatPrice(1000.5, "USD", 2)).toBe("$1000.50")
      expect(formatPrice(999999.99, "CNY", 2)).toBe("¥999999.99")
    })
  })

  describe("formatPriceCompact", () => {
    it("should format zero price", () => {
      expect(formatPriceCompact(0, "USD")).toBe("$0")
      expect(formatPriceCompact(0, "CNY")).toBe("¥0")
    })

    it("should use 6 decimals for prices < 0.01", () => {
      expect(formatPriceCompact(0.001234, "USD")).toBe("$0.001234")
      expect(formatPriceCompact(0.009999, "CNY")).toBe("¥0.009999")
    })

    it("should use 4 decimals for prices >= 0.01 and < 1", () => {
      expect(formatPriceCompact(0.1234, "USD")).toBe("$0.1234")
      expect(formatPriceCompact(0.5678, "CNY")).toBe("¥0.5678")
    })

    it("should use 2 decimals for prices >= 1", () => {
      expect(formatPriceCompact(1.23456, "USD")).toBe("$1.23")
      expect(formatPriceCompact(100.99, "CNY")).toBe("¥100.99")
    })

    it("should handle boundary values", () => {
      expect(formatPriceCompact(0.01, "USD")).toBe("$0.0100")
      expect(formatPriceCompact(1.0, "USD")).toBe("$1.00")
      // 0.99999 < 1, so uses toFixed(4), which rounds to 1.0000
      expect(formatPriceCompact(0.99999, "CNY")).toBe("¥1.0000")
    })

    it("should use USD by default", () => {
      expect(formatPriceCompact(5.5)).toBe("$5.50")
    })
  })

  describe("formatPriceRange", () => {
    it("should format price range when input != output", () => {
      expect(formatPriceRange(1.0, 2.0, "USD", 2)).toBe("$1.00 ~ $2.00")
    })

    it("should return single price when input = output", () => {
      expect(formatPriceRange(1.5, 1.5, "USD", 2)).toBe("$1.50")
    })

    it("should handle different currencies", () => {
      expect(formatPriceRange(10.0, 20.0, "CNY", 2)).toBe("¥10.00 ~ ¥20.00")
    })

    it("should use default precision of 4", () => {
      expect(formatPriceRange(0.1234, 0.5678, "USD")).toBe("$0.1234 ~ $0.5678")
    })

    it("should handle zero prices", () => {
      expect(formatPriceRange(0, 0, "USD", 2)).toBe("$0")
      expect(formatPriceRange(0, 1.5, "USD", 2)).toBe("$0 ~ $1.50")
    })

    it("should format very small prices with exponential notation", () => {
      const result = formatPriceRange(0.00001, 0.00002, "USD", 4)
      expect(result).toContain("e")
    })

    it("should respect custom precision", () => {
      expect(formatPriceRange(1.23456, 2.34567, "USD", 2)).toBe("$1.23 ~ $2.35")
    })
  })

  describe("getBillingModeText", () => {
    it("should return token-based text for quota_type 0", () => {
      expect(getBillingModeText(0)).toBe("ui:billing.tokenBased")
    })

    it("should return per-call text for quota_type 1", () => {
      expect(getBillingModeText(1)).toBe("ui:billing.perCall")
    })

    it("should return per-call text for other quota types", () => {
      expect(getBillingModeText(2)).toBe("ui:billing.perCall")
      expect(getBillingModeText(99)).toBe("ui:billing.perCall")
    })
  })

  describe("getBillingModeStyle", () => {
    it("should return blue style for token billing", () => {
      const style = getBillingModeStyle(0)
      expect(style.color).toBe("text-blue-600")
      expect(style.bgColor).toBe("bg-blue-50")
    })

    it("should return purple style for per-call billing", () => {
      const style = getBillingModeStyle(1)
      expect(style.color).toBe("text-purple-600")
      expect(style.bgColor).toBe("bg-purple-50")
    })

    it("should return purple style for other quota types", () => {
      const style = getBillingModeStyle(2)
      expect(style.color).toBe("text-purple-600")
      expect(style.bgColor).toBe("bg-purple-50")
    })
  })

  describe("isModelAvailableForGroup", () => {
    const model: ModelPricing = {
      model_name: "test-model",
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      model_price: 0,
      enable_groups: ["default", "vip", "premium"],
      supported_endpoint_types: ["chat"],
    }

    it("should return true for enabled group", () => {
      expect(isModelAvailableForGroup(model, "default")).toBe(true)
      expect(isModelAvailableForGroup(model, "vip")).toBe(true)
      expect(isModelAvailableForGroup(model, "premium")).toBe(true)
    })

    it("should return false for disabled group", () => {
      expect(isModelAvailableForGroup(model, "free")).toBe(false)
      expect(isModelAvailableForGroup(model, "enterprise")).toBe(false)
    })

    it("should handle empty enable_groups", () => {
      const restrictedModel: ModelPricing = {
        ...model,
        enable_groups: [],
      }
      expect(isModelAvailableForGroup(restrictedModel, "default")).toBe(false)
    })

    it("should be case-sensitive", () => {
      expect(isModelAvailableForGroup(model, "VIP")).toBe(false)
      expect(isModelAvailableForGroup(model, "Default")).toBe(false)
    })
  })

  describe("getEndpointTypesText", () => {
    it("should join multiple endpoint types with comma", () => {
      expect(getEndpointTypesText(["chat", "completion", "embedding"])).toBe(
        "chat, completion, embedding",
      )
    })

    it("should handle single endpoint type", () => {
      expect(getEndpointTypesText(["chat"])).toBe("chat")
    })

    it("should handle empty array", () => {
      expect(getEndpointTypesText([])).toBe("")
    })

    it("should return not provided text for undefined", () => {
      expect(getEndpointTypesText(undefined)).toBe("ui:billing.notProvided")
    })

    it("should return not provided text for non-array", () => {
      expect(getEndpointTypesText("chat" as any)).toBe("ui:billing.notProvided")
      expect(getEndpointTypesText(123 as any)).toBe("ui:billing.notProvided")
    })

    it("should preserve endpoint type order", () => {
      expect(getEndpointTypesText(["image", "audio", "video"])).toBe(
        "image, audio, video",
      )
    })
  })
})
