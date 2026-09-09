import { describe, expect, it } from "vitest"

import {
  transformModelPricing,
  transformUserGroup,
} from "~/services/apiService/oneHub/transform"
import {
  PRICING_PURPOSES,
  PRICING_RESPONSE_FORMATS,
} from "~/services/modelPricing/pricingConstants"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"

describe("OneHub data transformers", () => {
  describe("transformModelPricing", () => {
    it.each(["unknown_input", "reasoning_tokens", "unknown_output"])(
      "keeps unknown DoneHub multiplier %s out of affected-meter quotes",
      (meter) => {
        const [model] = transformModelPricing(
          {
            example: {
              groups: [],
              owned_by: "",
              price: {
                model: "example",
                type: "tokens",
                input: 5,
                output: 25,
                channel_type: 0,
                locked: false,
                extra_ratios: { [meter]: 2 },
              },
            },
          },
          {},
          true,
        ).data
        expect(
          quoteCanonicalModelPrice(
            model,
            {
              purpose: "token-index",
              usage: { input: 1, output: 1 },
            },
            { groupMultiplier: 1 },
          ).status,
        ).toBe("partial")
      },
    )

    it("keeps format-specific cache-write prices through valid long-context tiers", () => {
      const [model] = transformModelPricing(
        {
          example: {
            groups: [],
            owned_by: "",
            price: {
              model: "example",
              type: "tokens",
              input: 5,
              output: 25,
              channel_type: 0,
              locked: false,
              extra_ratios: {
                openai_cache_write_tokens: 2,
                cached_write_tokens: 1.25,
                ignored_factor: 1,
              },
              long_context: { threshold: 100, input_ratio: 2, output_ratio: 2 },
            },
          },
        },
        {},
        true,
      ).data
      const quote = (responseFormat: "openai" | "anthropic") =>
        quoteCanonicalModelPrice(
          model,
          {
            purpose: "token-index",
            responseFormat,
            inputTokens: 101,
            usage: { cacheWrite: 1 },
          },
          { groupMultiplier: 1 },
        )
      expect(quote("openai").amount).toBe(40)
      expect(quote("anthropic").amount).toBe(25)
    })
    it("does not browse legacy ratios when a DoneHub plan cannot preserve its rates", () => {
      const [model] = transformModelPricing(
        {
          example: {
            groups: [],
            owned_by: "",
            price: {
              model: "example",
              type: "tokens",
              input: 5,
              output: 25,
              channel_type: 0,
              locked: false,
              extra_ratios: { cached_read_tokens: NaN },
            },
          },
        },
        {},
        true,
      ).data
      expect(model.pricingPlan?.rates).toEqual({})
      expect(calculateModelPrice(model, 1)).toMatchObject({
        kind: "unavailable",
      })
    })

    it.each([Number.MAX_SAFE_INTEGER, 10.5, Infinity])(
      "preserves base cache rates while rejecting invalid long-context threshold %s",
      (threshold) => {
        const [model] = transformModelPricing(
          {
            example: {
              groups: [],
              owned_by: "",
              price: {
                model: "example",
                type: "tokens",
                input: 5,
                output: 25,
                channel_type: 0,
                locked: false,
                long_context: { threshold, input_ratio: 2, output_ratio: 2 },
              },
            },
          },
          {},
          true,
        ).data
        expect(model.pricingPlan?.rules.map((rule) => rule.id)).toEqual([
          "openai-cache",
          "anthropic-cache",
        ])
        expect(model.pricingPlan?.rates.input?.amount).toBe(10)
        expect(
          quoteCanonicalModelPrice(
            model,
            {
              purpose: PRICING_PURPOSES.TOKEN_INDEX,
              responseFormat: PRICING_RESPONSE_FORMATS.OPENAI,
              usage: { cacheRead: 1 },
            },
            { groupMultiplier: 1 },
          ).amount,
        ).toBeNull()
      },
    )
    it("quotes independent DoneHub output prices when input is free and normalizes nonpositive tier multipliers", () => {
      const price = {
        model: "example",
        type: "tokens" as const,
        input: 0,
        output: 25,
        channel_type: 0,
        locked: false,
        long_context: { threshold: 10, input_ratio: 0, output_ratio: -1 },
      }
      const [done] = transformModelPricing(
        { example: { groups: [], owned_by: "", price } },
        {},
        true,
      ).data
      const [one] = transformModelPricing({
        example: { groups: [], owned_by: "", price },
      }).data
      expect(one.pricingPlan).toBeUndefined()
      expect(
        quoteCanonicalModelPrice(
          done,
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            inputTokens: 11,
            usage: { input: 1, output: 1 },
          },
          { groupMultiplier: 1 },
        ),
      ).toMatchObject({ status: "complete", amount: 25 })
    })

    it("does not invent a common cache price when OpenAI and Anthropic cache meters disagree", () => {
      const [model] = transformModelPricing(
        {
          example: {
            groups: [],
            owned_by: "",
            price: {
              model: "example",
              type: "tokens",
              input: 5,
              output: 25,
              channel_type: 0,
              locked: false,
              extra_ratios: { cached_tokens: 0.5, cached_read_tokens: 0.1 },
            },
          },
        },
        {},
        true,
      ).data
      const quote = quoteCanonicalModelPrice(
        model,
        { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { cacheRead: 1 } },
        { groupMultiplier: 1 },
      )
      expect(quote.status).toBe("unavailable")
      expect(quote.amount).toBeNull()
      expect(
        quoteCanonicalModelPrice(
          model,
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            responseFormat: PRICING_RESPONSE_FORMATS.OPENAI,
            usage: { cacheRead: 1 },
          },
          { groupMultiplier: 0.5 },
        ).amount,
      ).toBe(2.5)
      expect(
        quoteCanonicalModelPrice(
          model,
          {
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            responseFormat: PRICING_RESPONSE_FORMATS.ANTHROPIC,
            usage: { cacheRead: 1 },
          },
          { groupMultiplier: 0.5 },
        ).amount,
      ).toBe(0.5)
    })

    it("keeps DoneHub per-request charges independent of text lengths", () => {
      const [model] = transformModelPricing(
        {
          example: {
            groups: [],
            owned_by: "",
            price: {
              model: "example",
              type: "times",
              input: 20,
              output: 20,
              channel_type: 0,
              locked: false,
              long_context: { threshold: 1, input_ratio: 2, output_ratio: 2 },
            },
          },
        },
        {},
        true,
      ).data
      expect(
        quoteCanonicalModelPrice(
          model,
          {
            purpose: PRICING_PURPOSES.REQUEST,
            inputTokens: 300000,
            outputTokens: 10000,
            usage: { input: 300000, output: 10000, request: 1 },
          },
          { groupMultiplier: 0.5 },
        ),
      ).toMatchObject({ status: "complete", amount: 0.02 })
    })

    it("quotes DoneHub whole-request tiers using raw input including cache and one group multiplier", () => {
      const [model] = transformModelPricing(
        {
          example: {
            groups: ["vip"],
            owned_by: "",
            price: {
              model: "example",
              type: "tokens",
              channel_type: 0,
              locked: false,
              input: 5,
              output: 25,
              extra_ratios: {
                cached_tokens: 0.1,
                cached_read_tokens: 0.1,
                cached_write_tokens: 1.25,
                cached_write_1h_tokens: 2,
              },
              long_context: {
                threshold: 272000,
                input_ratio: 2,
                output_ratio: 1.5,
              },
            },
          },
        },
        {},
        true,
      ).data
      expect(model.pricingPlan).toBeDefined()
      const quote = (inputTokens: number) =>
        quoteModelPrice(
          model.pricingPlan!,
          {
            purpose: PRICING_PURPOSES.REQUEST,
            inputTokens,
            outputTokens: 20000,
            usage: {
              input: inputTokens - 100000,
              cacheRead: 100000,
              cacheWrite: 0,
              cacheWrite1h: 0,
              output: 20000,
              request: 1,
            },
          },
          { groupMultiplier: 0.5 },
        )
      expect(quote(272000).amount).toBeCloseTo(1.41)
      expect(quote(300000)).toMatchObject({ status: "complete", amount: 2.85 })
      expect(quote(272001).matchedRules).toHaveLength(1)
    })

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

    it("preserves an explicit zero cache-read ratio over the generic fallback", () => {
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
              cached_tokens: 0.5,
              cached_read_tokens: 0,
            },
          },
        },
      }).data

      expect(item.token_price_ratios_to_input).toEqual({ cache_read: 0 })
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

    it("preserves valid cache meters when another optional ratio is invalid", () => {
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
              cached_read_tokens: -1,
              cached_write_tokens: 1.25,
            },
          },
        },
      }).data

      expect(item.token_price_ratios_to_input).toEqual({ cache_write: 1.25 })
    })

    it.each([
      [0, 4],
      [-1, 4],
      [1, -4],
      [Number.POSITIVE_INFINITY, 4],
      [1, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, 4],
      [1, Number.NEGATIVE_INFINITY],
      [Number.NaN, 4],
      [1, Number.NaN],
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
