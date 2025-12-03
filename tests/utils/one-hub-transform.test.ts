import { describe, expect, it } from "vitest"

import {
  transformModelPricing,
  transformUserGroup,
} from "~/utils/dataTransform/one-hub"

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
      expect(item.model_ratio).toBe(1)
      expect(item.model_price).toEqual({ input: 10, output: 20 })
      expect(item.owner_by).toBe("openai")
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
    })

    it("should compute group_ratio and usable_group from userGroupMap with default ratio fallback", () => {
      const input = {}
      const userGroupMap = {
        group1: { id: 1, symbol: "G1", name: "Group 1", ratio: 2 },
        group2: { id: 2, symbol: "G2", name: "Group 2", ratio: 0 as any },
        group3: { id: 3, symbol: "G3", name: "Group 3" } as any,
      }

      const result = transformModelPricing(input as any, userGroupMap as any)

      expect(result.group_ratio).toEqual({
        group1: 2,
        group2: 1,
        group3: 1,
      })
      expect(result.usable_group).toEqual({
        group1: "Group 1",
        group2: "Group 2",
        group3: "Group 3",
      })
    })
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
