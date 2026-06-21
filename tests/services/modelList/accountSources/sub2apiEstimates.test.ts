import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/apiService/common/type"
import {
  applySub2ApiPriceEstimates,
  buildSub2ApiRuntimePricingResponse,
  resolveSub2ApiKeyGroupForPriceEstimation,
} from "~/services/modelList/accountSources/sub2apiEstimates"
import type { ApiToken } from "~/types"

const createToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  id: 10,
  user_id: 1,
  key: "stored-key",
  status: 1,
  name: "Fallback Key",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  models: "",
  ...overrides,
})

const groups = [
  { id: 1, name: "default", rate_multiplier: 1 },
  { id: 9, name: "vip", rate_multiplier: 1.5 },
  { id: 10, name: "duplicate", rate_multiplier: 2 },
  { id: 11, name: "duplicate", rate_multiplier: 3 },
]

const priceTable = {
  source: "synthetic-test",
  source_date: "2026-06-14",
  models: {
    "example-priced-model": {
      input: 2,
      output: 6,
    },
    "example-cache-model": {
      input: 1,
      output: 3,
      cache_read: 0.25,
      cache_write: 0.5,
    },
    "example-input-only-model": {
      input: 2,
    },
    "example-output-only-model": {
      output: 6,
    },
    "example-unpriced-model": {},
  },
}

describe("resolveSub2ApiKeyGroupForPriceEstimation", () => {
  it("resolves an exact unmasked backend key match to the backend key's stable group id", () => {
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        selectedToken: createToken({
          key: "masked********key",
          group: "vip",
        }),
        resolvedKey: "sub2api-full-secret",
        accountTokens: [
          createToken({
            id: 1,
            key: "sub2api-full-secret",
            group: "vip",
            sub2api_group_id: 9,
          }),
        ],
        groups,
      }),
    ).toEqual(expect.objectContaining({ groupId: "9", groupName: "vip" }))
  })

  it("prefers a stored stable group id over name matching", () => {
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        selectedToken: createToken({
          key: "stored-key",
          group: "duplicate",
          sub2api_group_id: 9,
        }),
        resolvedKey: "stored-key",
        accountTokens: [],
        groups,
      }),
    ).toEqual(expect.objectContaining({ groupId: "9", groupName: "vip" }))
  })

  it("resolves a stored group name only when exactly one available group has that name", () => {
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        selectedToken: createToken({
          group: "vip",
        }),
        resolvedKey: "stored-key",
        accountTokens: [],
        groups,
      }),
    ).toEqual(expect.objectContaining({ groupId: "9", groupName: "vip" }))
  })

  it("falls back to the selected key group name when account tokens do not reveal an exact key match", () => {
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        selectedToken: createToken({
          key: "masked********key",
          group: "vip",
        }),
        resolvedKey: "sub2api-full-secret",
        accountTokens: [
          createToken({
            id: 1,
            key: "different-sub2api-secret",
            group: "default",
            sub2api_group_id: 1,
          }),
        ],
        groups,
      }),
    ).toEqual(expect.objectContaining({ groupId: "9", groupName: "vip" }))
  })

  it("disables estimation for masked matches, no match, no stored group, or multiple same-name matches", () => {
    const baseParams = {
      resolvedKey: "stored-key",
      groups,
    }

    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        ...baseParams,
        selectedToken: createToken({ group: "" }),
        accountTokens: [
          createToken({
            key: "stored********key",
            group: "vip",
            sub2api_group_id: 9,
          }),
        ],
      }),
    ).toBeNull()
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        ...baseParams,
        selectedToken: createToken({ group: "" }),
        accountTokens: [createToken({ key: "other-key", group: "vip" })],
      }),
    ).toBeNull()
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        ...baseParams,
        selectedToken: createToken({ group: "" }),
        accountTokens: [],
      }),
    ).toBeNull()
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        ...baseParams,
        selectedToken: createToken({ group: "duplicate" }),
        accountTokens: [],
      }),
    ).toBeNull()
  })

  it("treats normalized ApiToken.group as a name-like value, not a stable group id", () => {
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        selectedToken: createToken({ group: "9" }),
        resolvedKey: "stored-key",
        accountTokens: [],
        groups,
      }),
    ).toBeNull()
  })
})

describe("buildSub2ApiRuntimePricingResponse", () => {
  it("builds Sub2API runtime-key source metadata without pricing", () => {
    const result = buildSub2ApiRuntimePricingResponse(["runtime-model"])

    expect(result.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    })
    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "runtime-model",
        price_metadata: expect.objectContaining({
          unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        }),
      }),
    ])
  })
})

describe("applySub2ApiPriceEstimates", () => {
  it("uses user-specific group rates before the default group rate", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-priced-model"],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: { "9": 2 },
      priceTable,
    })

    expect(result.data[0]).toMatchObject({
      model_name: "example-priced-model",
      token_price_usd_per_million: {
        input: 4,
        output: 12,
      },
      price_metadata: {
        source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
        precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
        source_date: "2026-06-14",
      },
    })
    expect(result.group_ratio).toEqual({ vip: 2 })
    expect(result.model_list_source?.supportsPricing).toBe(true)
  })

  it("normalizes invalid and zero group rates before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-priced-model", "example-cache-model"],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: { "9": "invalid", "10": 0 } as any,
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
    expect(result.data[1]?.token_price_usd_per_million).toEqual({
      input: 1,
      output: 3,
      cache_read: 0.25,
      cache_write: 0.5,
    })
  })

  it("normalizes negative user-specific group rates before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-priced-model"],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: { "9": -2 },
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
  })

  it("normalizes zero group rate multipliers before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-priced-model"],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 0 },
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
  })

  it("normalizes negative group rate multipliers before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-priced-model"],
      group: { groupId: "9", groupName: "vip", rate_multiplier: -1.5 },
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
  })

  it("normalizes invalid group rate multipliers before estimating prices", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-priced-model"],
      group: {
        groupId: "9",
        groupName: "vip",
        rate_multiplier: "invalid" as any,
      },
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 2,
      output: 6,
    })
  })

  it("keeps unmatched official prices visible as unavailable model rows", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-unpriced-model", "missing-from-table"],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: {},
      priceTable,
    })

    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "example-unpriced-model",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      }),
      expect.objectContaining({
        model_name: "missing-from-table",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      }),
    ])
  })

  it("treats partial official token price rows as unavailable", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-input-only-model", "example-output-only-model"],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: {},
      priceTable,
    })

    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "example-input-only-model",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      }),
      expect.objectContaining({
        model_name: "example-output-only-model",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      }),
    ])
    expect(result.data[0]?.token_price_usd_per_million).toBeUndefined()
    expect(result.data[1]?.token_price_usd_per_million).toBeUndefined()
  })

  it("applies cache read and cache write estimates when official prices include them", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-cache-model"],
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]?.token_price_usd_per_million).toEqual({
      input: 1.5,
      output: 4.5,
      cache_read: 0.375,
      cache_write: 0.75,
    })
  })

  it("disables estimation when the selected key group is unknown", () => {
    const result = applySub2ApiPriceEstimates({
      modelIds: ["example-priced-model"],
      group: null,
      groupRates: {},
      priceTable,
    })

    expect(result.data[0]).toMatchObject({
      model_name: "example-priced-model",
      price_metadata: {
        source: MODEL_PRICE_SOURCE_KINDS.NONE,
        precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
        unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.KEY_GROUP_UNKNOWN,
      },
    })
    expect(result.model_list_source?.supportsPricing).toBe(false)
  })
})
