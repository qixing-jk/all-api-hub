import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiModelPricing } from "~/services/apiAdapters/newApi/modelPricing"
import {
  fetchRixApiModelPricing,
  normalizeRixApiModelPricingResponse,
} from "~/services/apiAdapters/newApi/rixApiModelPricing"
import { clearRixApiDialectChoicesForTests } from "~/services/apiService/newApiFamily/variants/rixApiDialects"
import { ApiError } from "~/services/apiTransport/errors"
import { extractDataFromApiResponseBody } from "~/services/apiTransport/response"
import {
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
} from "~/services/modelList/pricingModel"
import {
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { AuthTypeEnum } from "~/types"

const TOKENS_PER_MILLION = 1_000_000

const { mockFetchModelPricing } = vi.hoisted(() => ({
  mockFetchModelPricing: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/modelPricing", () => ({
  defaultModelPricingImplementation: {
    fetchModelPricing: mockFetchModelPricing,
  },
}))

const accountRequest = {
  baseUrl: "https://rix.example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "admin-key",
    userId: "white-label-owner",
  },
}

/**
 * Body observed on 2026-09-26 at https://platform.ephone.ai/api/pricing: `data`
 * is an object carrying model rows, the vendor registry, group definitions and
 * the caller's level.
 */
const buildBody = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  message: "",
  data: {
    global_rate_limit: { groups: {} },
    group_info: {
      openai: { DisplayName: "OpenAI", GroupRatio: 1, Official: true },
      "openai-official-cheap": {
        DisplayName: "OpenAI-cheap",
        GroupRatio: 0.53,
        Official: false,
      },
    },
    level_info: {},
    model_info: [],
    user_info: null,
    vendor_info: [{ id: 1, name: "OpenAI", priority: 110 }],
    ...overrides,
  },
})

/**
 * What the normalizer receives: the shared transport unwraps
 * `{ success, message, data }` before the response reaches the adapter, so the
 * fixture is derived through the real helper instead of hand-written.
 */
const buildEnvelope = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> =>
  extractDataFromApiResponseBody<Record<string, unknown>>(buildBody(overrides))

/** Token row: prices are USD per one million tokens. */
const usdTokenRow = {
  id: 867,
  model_name: "gpt-6-luna",
  display_name: "GPT-6 Luna",
  description: "效率型模型",
  description_en: "Efficient model",
  vendor_id: 1,
  model_kind: "chat",
  billing_kind: "token",
  status: 1,
  enable_groups: ["openai", "openai-official-cheap"],
  price_config: {
    original_price: {
      conditions: [
        {
          name: "标准档",
          rule: "",
          price: {
            quota_type: "token",
            currency: "USD",
            input_token_price: 0.1,
            output_token_price: 0.5,
            cache_read_token_price: 0.01,
            cache_create_token_price: 0.125,
          },
        },
      ],
    },
  },
}

/** Per-call row priced in CNY that also publishes token meters. */
const cnyCallRow = {
  id: 900,
  model_name: "gpt-image-2.5-dev",
  vendor_id: 1,
  model_kind: "image_generation",
  billing_kind: "call",
  enable_groups: ["openai"],
  price_config: {
    original_price: {
      conditions: [
        {
          price: {
            quota_type: "call",
            currency: "CNY",
            model_price: 0.7,
            input_token_price: 5,
            output_token_price: 30,
            image_token_price: 8,
            image_output_token_price: 30,
          },
        },
      ],
    },
  },
}

/** Rix 5.x token row: prices in price_info with ratio dialect. */
const v5RatioTokenRow = {
  model_name: "claude-fable-5",
  display_name: "Claude Fable 5",
  vendor_id: 1,
  enable_groups: ["default", "vip"],
  price_info: {
    default: {
      default: {
        quota_type: 1,
        model_price: 0,
        model_ratio: 2.5,
        model_completion_ratio: 4,
        model_cache_ratio: 0.1,
        model_create_cache_ratio: 1.25,
      },
    },
  },
}

/** Rix 5.x per-call row in price_info. */
const v5CallRow = {
  model_name: "claude-by-call",
  vendor_id: 1,
  price_info: {
    Claude按次: {
      default: {
        quota_type: 0,
        model_price: 0.1,
        model_ratio: 0,
      },
    },
  },
}

/** Per-second row with three published conditions. */
const cnyTimeRow = {
  id: 901,
  model_name: "wan3.0-video-prime",
  vendor_id: 2,
  model_kind: "video_generation",
  billing_kind: "time",
  enable_groups: ["openai"],
  price_config: {
    original_price: {
      conditions: [
        {
          price: {
            quota_type: "time",
            currency: "CNY",
            per_second_price: 1.8,
          },
        },
        { price: { quota_type: "time", currency: "CNY", per_second_price: 2 } },
        { price: { quota_type: "time", currency: "CNY", per_second_price: 3 } },
      ],
    },
  },
}

/** Row carrying meters this product has no equivalent for. */
const partlyUnmappedRow = {
  id: 902,
  model_name: "claude-opus-5",
  vendor_id: 1,
  model_kind: "chat",
  billing_kind: "token",
  enable_groups: ["openai"],
  price_config: {
    original_price: {
      conditions: [
        {
          price: {
            quota_type: "token",
            currency: "USD",
            input_token_price: 5,
            output_token_price: 25,
            cache_create_5m_token_price: 6.25,
            image_cache_read_token_price: 0.5,
            reasoning_token_price: 25,
          },
        },
      ],
    },
  },
}

describe("Rix API model pricing", () => {
  beforeEach(() => {
    mockFetchModelPricing.mockReset()
    clearRixApiDialectChoicesForTests()
  })

  it("maps USD token prices onto the shared meters", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({ model_info: [usdTokenRow] }),
    )

    expect(snapshot.success).toBe(true)
    const [model] = snapshot.data
    expect(model?.model_name).toBe("gpt-6-luna")
    expect(model?.display_name).toBe("GPT-6 Luna")
    expect(model?.model_descriptions).toEqual({
      zh: "效率型模型",
      en: "Efficient model",
    })
    expect(model?.quota_type).toBe(0)
    expect(model?.model_ratio).toBe(0)
    expect(model?.completion_ratio).toBeCloseTo(5)
    expect(model?.enable_groups).toEqual(["openai", "openai-official-cheap"])
    expect(model?.token_price_usd_per_million).toEqual({
      input: 0.1,
      output: 0.5,
      cache_read: 0.01,
      cache_write: 0.125,
    })
    expect(model?.price_metadata).toEqual({
      source: MODEL_PRICE_SOURCE_KINDS.CHANNEL_PRICING,
      precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
    })
    expect(model?.vendorEvidence).toEqual({
      kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
      name: "OpenAI",
      externalId: "1",
    })

    const perMillion = (amount: number) => ({
      amount,
      currency: "USD",
      unit: PRICE_RATE_UNITS.TOKEN,
      per: TOKENS_PER_MILLION,
    })
    expect(model?.pricingPlan?.rates).toEqual({
      input: perMillion(0.1),
      output: perMillion(0.5),
      cacheRead: perMillion(0.01),
      cacheWrite: perMillion(0.125),
    })
    expect(model?.pricingPlan?.groupMultiplier).toBe(
      PRICING_GROUP_MULTIPLIERS.PENDING,
    )
    expect(model?.pricingPlan?.issues).toEqual([])
  })

  it("keeps per-call prices on the request meter and their own currency", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({ model_info: [cnyCallRow] }),
    )

    const [model] = snapshot.data
    expect(model?.quota_type).toBe(1)
    expect(model?.model_price).toBe(0.7)
    expect(model?.token_price_usd_per_million).toBeUndefined()
    expect(model?.pricingPlan?.rates.request).toEqual({
      amount: 0.7,
      currency: "CNY",
      unit: PRICE_RATE_UNITS.REQUEST,
      per: 1,
    })
    expect(model?.pricingPlan?.rates.imageInput).toEqual({
      amount: 8,
      currency: "CNY",
      unit: PRICE_RATE_UNITS.TOKEN,
      per: TOKENS_PER_MILLION,
    })
    expect(model?.pricingPlan?.rates.imageOutput).toEqual({
      amount: 30,
      currency: "CNY",
      unit: PRICE_RATE_UNITS.TOKEN,
      per: TOKENS_PER_MILLION,
    })
    expect(model?.pricingPlan?.usageMode).toBe(PRICING_USAGE_MODES.REQUEST)
  })

  it("maps per-second prices onto the video meter and marks tiers estimated", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({ model_info: [cnyTimeRow] }),
    )

    const [model] = snapshot.data
    expect(model?.model_price).toBe(1.8)
    expect(model?.price_metadata?.precision).toBe(
      MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
    )
    expect(model?.pricingPlan?.rates[PRICING_METERS.VIDEO_SECONDS]).toEqual({
      amount: 1.8,
      currency: "CNY",
      unit: PRICE_RATE_UNITS.SECOND,
      per: 1,
    })
    expect(model?.pricingPlan?.comparison).toEqual({
      meter: PRICING_METERS.VIDEO_SECONDS,
    })
    expect(model?.pricingPlan?.usageMode).toBe(PRICING_USAGE_MODES.VIDEO)
  })

  it("reports published meters this product cannot express", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({ model_info: [partlyUnmappedRow] }),
    )

    const [model] = snapshot.data
    expect(model?.pricingPlan?.rates.input?.amount).toBe(5)
    expect(model?.pricingPlan?.rates.output?.amount).toBe(25)
    expect(model?.token_price_usd_per_million).toEqual({
      input: 5,
      output: 25,
    })
    expect(model?.pricingPlan?.issues).toEqual([
      { code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE },
    ])
  })

  it("carries group ratios as priced fallback evidence", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({ model_info: [usdTokenRow] }),
    )

    expect(snapshot.groupRatios).toEqual({
      openai: 1,
      "openai-official-cheap": 0.53,
    })
    expect(snapshot.groupAccess).toEqual({
      kind: "compatible-priced-fallback",
      candidateGroups: ["openai", "openai-official-cheap"],
    })
  })

  it("uses the account level as authoritative group access", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({
        model_info: [usdTokenRow],
        user_info: { level: "Tier 1" },
        level_info: {
          "Tier 1": { AllowedGroups: ["openai", "azure"] },
        },
      }),
    )

    expect(snapshot.groupAccess).toEqual({
      kind: "authoritative",
      usableGroups: ["openai", "azure"],
    })
  })

  it("skips rows without a usable model name", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({ model_info: [{ id: 1 }, usdTokenRow] }),
    )

    expect(snapshot.data.map((model) => model.model_name)).toEqual([
      "gpt-6-luna",
    ])
  })

  it("marks a row that publishes no amount as unavailable", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({
        model_info: [
          {
            id: 903,
            model_name: "omni-moderation-latest",
            model_kind: "chat",
            billing_kind: "call",
            enable_groups: ["openai"],
            price_config: {
              original_price: {
                conditions: [
                  { price: { quota_type: "call", currency: "USD" } },
                ],
              },
            },
          },
        ],
      }),
    )

    const [model] = snapshot.data
    expect(model?.pricingPlan?.rates).toEqual({})
    expect(model?.price_metadata).toEqual({
      source: MODEL_PRICE_SOURCE_KINDS.CHANNEL_PRICING,
      precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
    })
  })

  it("delegates a New API-shaped payload to the shared normalizer", () => {
    const snapshot = normalizeRixApiModelPricingResponse({
      success: true,
      data: [
        {
          model_name: "legacy-model",
          quota_type: 0,
          model_ratio: 2,
          completion_ratio: 5,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: { default: 1 },
      usable_group: { default: {} },
    })

    const [model] = snapshot.data
    expect(model?.model_name).toBe("legacy-model")
    expect(model?.pricingPlan?.rates.input?.amount).toBe(4)
  })

  it("accepts a payload that still carries the transport envelope", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildBody({ model_info: [usdTokenRow] }),
    )

    expect(snapshot.data.map((model) => model.model_name)).toEqual([
      "gpt-6-luna",
    ])
  })

  it("rejects a payload that is neither dialect", () => {
    expect(() => normalizeRixApiModelPricingResponse({ data: "nope" })).toThrow(
      "Invalid Rix API model pricing response",
    )
  })

  it("keeps the authenticated pricing read when the credential is accepted", async () => {
    mockFetchModelPricing.mockResolvedValue(
      buildEnvelope({ model_info: [usdTokenRow] }),
    )

    await fetchRixApiModelPricing(accountRequest)

    expect(mockFetchModelPricing).toHaveBeenCalledTimes(1)
    expect(mockFetchModelPricing).toHaveBeenCalledWith(accountRequest)
  })

  it("retries the public pricing read anonymously when the credential is refused", async () => {
    mockFetchModelPricing
      .mockRejectedValueOnce(
        new ApiError("admin_key_scope_forbidden", 403, "/api/pricing"),
      )
      .mockResolvedValueOnce(buildEnvelope({ model_info: [usdTokenRow] }))

    await fetchRixApiModelPricing(accountRequest)

    expect(mockFetchModelPricing).toHaveBeenCalledTimes(2)
    expect(mockFetchModelPricing.mock.calls[1]?.[0]).toMatchObject({
      auth: { authType: AuthTypeEnum.None },
    })
  })

  it("does not retry a read that was already anonymous", async () => {
    const failure = new ApiError("boom", 500, "/api/pricing")
    mockFetchModelPricing.mockRejectedValue(failure)

    await expect(
      fetchRixApiModelPricing({
        ...accountRequest,
        auth: { authType: AuthTypeEnum.None },
      }),
    ).rejects.toBe(failure)
    expect(mockFetchModelPricing).toHaveBeenCalledTimes(1)
  })

  it("starts from the remembered auth mode on the next catalog load", async () => {
    mockFetchModelPricing
      .mockRejectedValueOnce(
        new ApiError("admin_key_scope_forbidden", 403, "/api/pricing"),
      )
      .mockResolvedValue(buildEnvelope({ model_info: [usdTokenRow] }))

    await fetchRixApiModelPricing(accountRequest)
    await fetchRixApiModelPricing(accountRequest)

    // Probe with the credential once, then read anonymously for both loads.
    expect(mockFetchModelPricing).toHaveBeenCalledTimes(3)
    expect(mockFetchModelPricing.mock.calls[2]?.[0]).toMatchObject({
      auth: { authType: AuthTypeEnum.None },
    })
  })

  it("serves the Rix envelope through the pricing capability", async () => {
    mockFetchModelPricing.mockResolvedValue(
      buildEnvelope({ model_info: [usdTokenRow] }),
    )

    const snapshot = await createNewApiModelPricing(
      SITE_TYPES.RIX_API,
    ).fetchPricing(accountRequest)

    expect(snapshot.data.map((model) => model.model_name)).toEqual([
      "gpt-6-luna",
    ])
  })

  it("normalizes Rix 5.x ratio-based token rows from price_info", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({ model_info: [v5RatioTokenRow] }),
    )

    expect(snapshot.data).toHaveLength(1)
    const model = snapshot.data[0]
    expect(model?.model_name).toBe("claude-fable-5")
    expect(model?.quota_type).toBe(0)
    expect(model?.model_ratio).toBe(2.5)
    expect(model?.completion_ratio).toBe(4)
    expect(model?.token_price_usd_per_million).toEqual({
      input: 5,
      output: 20,
      cache_read: 0.5,
      cache_write: 6.25,
    })
    expect(model?.pricingPlan?.rates[PRICING_METERS.INPUT]).toMatchObject({
      amount: 5,
      currency: "USD",
      unit: PRICE_RATE_UNITS.TOKEN,
    })
  })

  it("normalizes Rix 5.x per-call rows from price_info", () => {
    const snapshot = normalizeRixApiModelPricingResponse(
      buildEnvelope({ model_info: [v5CallRow] }),
    )

    expect(snapshot.data).toHaveLength(1)
    const model = snapshot.data[0]
    expect(model?.model_name).toBe("claude-by-call")
    expect(model?.quota_type).toBe(1)
    expect(model?.model_price).toBe(0.1)
    expect(model?.enable_groups).toEqual(["Claude按次"])
    expect(model?.pricingPlan?.rates[PRICING_METERS.REQUEST]).toMatchObject({
      amount: 0.1,
      currency: "USD",
      unit: PRICE_RATE_UNITS.REQUEST,
    })
  })
})
