import { describe, expect, it } from "vitest"

import {
  transformModelPricing,
  transformUserGroup,
} from "~/services/apiService/oneHub/transform"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"

describe("OneHub data transformers", () => {
  describe("transformModelPricing", () => {
    it("should convert OneHubModelPricing into PricingResponse with default group when no groups", () => {
      const input = {
        "gpt-4": {
          groups: [],
          owned_by: "openai",
          price: {
            model: "gpt-4",
            type: "tokens",
            channel_type: 0,
            input: 10,
            output: 20,
            locked: false,
          },
        },
      }

      const result = transformModelPricing(input as any, {})

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      const item = result.data[0]
      expect(item.model_name).toBe("gpt-4")
      expect(item.quota_type).toBe(0)
      expect(item.model_ratio).toBe(10)
      expect(item.model_price).toEqual({ input: 10, output: 20 })
      expect(item.owner_by).toBe("openai")
      expect(item.vendorEvidence).toEqual({
        kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
        name: "openai",
      })
      expect(item.completion_ratio).toBe(2)
      expect(item.enable_groups).toEqual(["default"])
      expect(item.supported_endpoint_types).toEqual([])
      expect(result.group_ratio).toEqual({})
      expect(result.usable_group).toEqual({})
    })

    it("should preserve groups when provided and use fallback for missing owned_by", () => {
      const input = {
        "gpt-4": {
          groups: ["vip", "pro"],
          owned_by: "",
          price: {
            model: "gpt-4",
            type: "times",
            channel_type: 0,
            input: 5,
            output: 10,
            locked: false,
          },
        },
      }

      const result = transformModelPricing(input as any, {})

      const item = result.data[0]
      expect(item.enable_groups).toEqual(["vip", "pro"])
      expect(item.quota_type).toBe(1)
      expect(item.owner_by).toBe("")
      expect(item).not.toHaveProperty("vendorEvidence")
    })

    it("trims non-empty routing ownership evidence while preserving the legacy field", () => {
      const input = {
        "example-model": {
          groups: [],
          owned_by: " Example Router ",
          price: {
            model: "example-model",
            type: "tokens",
            channel_type: 7,
            input: 1,
            output: 2,
            locked: false,
          },
        },
      }

      const [item] = transformModelPricing(input as any).data

      expect(item.owner_by).toBe(" Example Router ")
      expect(item.vendorEvidence).toEqual({
        kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
        name: "Example Router",
      })
    })

    it("maps verified cache ratios and uses OneHub input as the model ratio", () => {
      const [item] = transformModelPricing({
        "example-model": {
          groups: ["default"],
          owned_by: "Example Router",
          price: {
            model: "example-model",
            type: "tokens",
            channel_type: 7,
            input: 3,
            output: 12,
            locked: false,
            extra_ratios: {
              cached_tokens: 0.5,
              cached_read_tokens: 0.25,
              cached_write_tokens: 1.25,
              cached_write_1h_tokens: 2,
            },
          },
        },
      }).data

      expect(item.model_ratio).toBe(3)
      expect(item.completion_ratio).toBe(4)
      expect(item.token_price_ratios_to_input).toEqual({
        cache_read: 0.25,
        cache_write: 1.25,
      })
    })

    it("uses the generic cached-token ratio as the cache-read fallback", () => {
      const [item] = transformModelPricing({
        "example-model": {
          groups: [],
          owned_by: "Example Router",
          price: {
            model: "example-model",
            type: "tokens",
            channel_type: 7,
            input: 2,
            output: 4,
            locked: false,
            extra_ratios: { cached_tokens: 0.5 },
          },
        },
      }).data

      expect(item.token_price_ratios_to_input).toEqual({ cache_read: 0.5 })
    })

    it("omits invalid optional cache ratios", () => {
      const [item] = transformModelPricing({
        "example-model": {
          groups: [],
          owned_by: "Example Router",
          price: {
            model: "example-model",
            type: "tokens",
            channel_type: 7,
            input: 2,
            output: 4,
            locked: false,
            extra_ratios: {
              cached_tokens: -1,
              cached_write_tokens: Number.POSITIVE_INFINITY,
            },
          },
        },
      }).data

      expect(item).not.toHaveProperty("token_price_ratios_to_input")
    })

    it.each([
      [0, 4],
      [-1, 4],
      [1, -4],
      [Number.POSITIVE_INFINITY, 4],
      [1, Number.POSITIVE_INFINITY],
    ])(
      "marks invalid token ratios unavailable for input %s and output %s",
      (inputRatio, outputRatio) => {
        const [item] = transformModelPricing({
          "example-model": {
            groups: [],
            owned_by: "Example Router",
            price: {
              model: "example-model",
              type: "tokens",
              channel_type: 7,
              input: inputRatio,
              output: outputRatio,
              locked: false,
            },
          },
        }).data

        expect(item.model_ratio).toBe(1)
        expect(item.completion_ratio).toBe(1)
        expect(item.price_metadata).toMatchObject({
          precision: "unavailable",
          unavailable_reason: "pricing-source-unavailable",
        })
      },
    )

    it("preserves a free token model when both input and output ratios are zero", () => {
      const [item] = transformModelPricing({
        "free-model": {
          groups: [],
          owned_by: "Example Router",
          price: {
            model: "free-model",
            type: "tokens",
            channel_type: 7,
            input: 0,
            output: 0,
            locked: false,
          },
        },
      }).data

      expect(item.model_ratio).toBe(0)
      expect(item.completion_ratio).toBe(1)
      expect(item).not.toHaveProperty("price_metadata")
    })

    it("should compute group_ratio and usable_group from userGroupMap with default ratio fallback", () => {
      const input = {}
      const userGroupMap = {
        group1: { id: 1, symbol: "G1", name: "Group 1", ratio: 2 },
        group2: { id: 2, symbol: "G2", name: "Group 2", ratio: 0 },
        group3: { id: 3, symbol: "G3", name: "Group 3" } as any,
      }

      const result = transformModelPricing(input as any, userGroupMap as any)

      expect(result.group_ratio).toEqual({
        group1: 2,
        group2: 0,
        group3: 1,
      })
      expect(result.usable_group).toEqual({
        group1: "Group 1",
        group2: "Group 2",
        group3: "Group 3",
      })
    })

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "uses the default group ratio for non-finite value %s",
      (ratio) => {
        const result = transformModelPricing(
          {},
          {
            invalid: {
              id: 1,
              symbol: "invalid",
              name: "Invalid group",
              ratio,
            },
          },
        )

        expect(result.group_ratio).toEqual({ invalid: 1 })
      },
    )
  })

  describe("transformUserGroup", () => {
    it("should map OneHubUserGroupInfo to simple object with desc and ratio", () => {
      const input = {
        group1: {
          id: 1,
          symbol: "G1",
          name: "Group 1",
          ratio: 2,
          api_rate: 1,
          public: true,
          promotion: false,
          min: 0,
          max: 100,
          enable: true,
        },
      }

      const result = transformUserGroup(input as any)

      expect(result).toEqual({
        group1: {
          desc: "Group 1",
          ratio: 2,
        },
      })
    })

    it("should handle empty input", () => {
      const result = transformUserGroup({} as any)
      expect(result).toEqual({})
    })
  })
})
