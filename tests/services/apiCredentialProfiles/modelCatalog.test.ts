import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED,
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
  loadAccountTokenFallbackPricingResponse,
  normalizeApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type PricingResponse,
} from "~/services/apiService/common/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"

const {
  fetchAnthropicModelIdsMock,
  fetchGoogleModelIdsMock,
  fetchOpenAICompatibleModelIdsMock,
  fetchAccountTokensMock,
  fetchSub2ApiAvailableGroupsMock,
  fetchSub2ApiGroupRatesMock,
  fetchSub2ApiRuntimeModelsMock,
  getSiteAdapterMock,
  loadModelPriceTableMock,
  resolveDisplayAccountTokenForSecretMock,
} = vi.hoisted(() => ({
  fetchAnthropicModelIdsMock: vi.fn(),
  fetchGoogleModelIdsMock: vi.fn(),
  fetchOpenAICompatibleModelIdsMock: vi.fn(),
  fetchAccountTokensMock: vi.fn(),
  fetchSub2ApiAvailableGroupsMock: vi.fn(),
  fetchSub2ApiGroupRatesMock: vi.fn(),
  fetchSub2ApiRuntimeModelsMock: vi.fn(),
  getSiteAdapterMock: vi.fn(),
  loadModelPriceTableMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
}))

vi.mock("~/services/aiApi/anthropic", () => ({
  fetchAnthropicModelIds: (...args: unknown[]) =>
    fetchAnthropicModelIdsMock(...args),
}))

vi.mock("~/services/aiApi/google", () => ({
  fetchGoogleModelIds: (...args: unknown[]) => fetchGoogleModelIdsMock(...args),
}))

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    fetchOpenAICompatibleModelIdsMock(...args),
}))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchAccountTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
  fetchSub2ApiAvailableGroups: (...args: unknown[]) =>
    fetchSub2ApiAvailableGroupsMock(...args),
  fetchSub2ApiGroupRates: (...args: unknown[]) =>
    fetchSub2ApiGroupRatesMock(...args),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: getSiteAdapterMock,
}))

vi.mock("~/services/apiCredentialProfiles/modelPriceTable", () => ({
  loadModelPriceTable: (...args: unknown[]) => loadModelPriceTableMock(...args),
}))

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()

    return {
      ...actual,
      resolveDisplayAccountTokenForSecret: (...args: unknown[]) =>
        resolveDisplayAccountTokenForSecretMock(...args),
    }
  },
)

const ACCOUNT = {
  id: "account-1",
  name: "Example Account",
  username: "tester",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: 1 },
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "account-token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
} as const

const TOKEN = {
  id: 10,
  user_id: 1,
  key: "sk-masked",
  status: 1,
  name: "Fallback Key",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  models: "",
} as const

const createSub2ApiModelCatalogAdapter = (
  fetchModels = fetchSub2ApiRuntimeModelsMock,
) => ({
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api" as const,
  modelCatalog: {
    fetchModels,
  },
})

const mockSub2ApiModelCatalogAdapter = (
  fetchModels = fetchSub2ApiRuntimeModelsMock,
) => {
  getSiteAdapterMock.mockReturnValue(
    createSub2ApiModelCatalogAdapter(fetchModels),
  )
}

describe("loadAccountTokenFallbackPricingResponse", () => {
  beforeEach(() => {
    fetchAnthropicModelIdsMock.mockReset()
    fetchGoogleModelIdsMock.mockReset()
    fetchOpenAICompatibleModelIdsMock.mockReset()
    fetchAccountTokensMock.mockReset()
    fetchSub2ApiAvailableGroupsMock.mockReset()
    fetchSub2ApiGroupRatesMock.mockReset()
    fetchSub2ApiRuntimeModelsMock.mockReset()
    getSiteAdapterMock.mockReset()
    loadModelPriceTableMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockReset()
    mockSub2ApiModelCatalogAdapter()
    resolveDisplayAccountTokenForSecretMock.mockImplementation(
      async (_account, token) => token,
    )
    fetchSub2ApiAvailableGroupsMock.mockRejectedValue(
      new Error("dashboard auth unavailable"),
    )
    fetchSub2ApiGroupRatesMock.mockResolvedValue({})
    fetchAccountTokensMock.mockResolvedValue([])
    loadModelPriceTableMock.mockResolvedValue({
      source: "synthetic-test",
      models: {},
    })
  })

  it("routes profile model-id lookups to the provider-specific fetcher", async () => {
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(["gpt-4.1"])
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(["gpt-4o"])
    fetchAnthropicModelIdsMock.mockResolvedValueOnce(["claude-3-7-sonnet"])
    fetchGoogleModelIdsMock.mockResolvedValueOnce(["gemini-2.5-pro"])

    await expect(
      fetchApiCredentialModelIds({
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://openai.example.com",
        apiKey: "openai-key",
      }),
    ).resolves.toEqual(["gpt-4.1"])
    await expect(
      fetchApiCredentialModelIds({
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://proxy.example.com",
        apiKey: "proxy-key",
      }),
    ).resolves.toEqual(["gpt-4o"])
    await expect(
      fetchApiCredentialModelIds({
        apiType: API_TYPES.ANTHROPIC,
        baseUrl: "https://anthropic.example.com",
        apiKey: "anthropic-key",
      }),
    ).resolves.toEqual(["claude-3-7-sonnet"])
    await expect(
      fetchApiCredentialModelIds({
        apiType: API_TYPES.GOOGLE,
        baseUrl: "https://google.example.com",
        apiKey: "google-key",
      }),
    ).resolves.toEqual(["gemini-2.5-pro"])
  })

  it("throws for unsupported profile api types", async () => {
    await expect(
      fetchApiCredentialModelIds({
        apiType: "unsupported" as any,
        baseUrl: "https://example.com",
        apiKey: "key",
      }),
    ).rejects.toThrow("Unsupported apiType")
  })

  it("merges token-declared and upstream model ids into a normalized catalog", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
      models: "gpt-4o-mini, claude-3-haiku",
    })
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce([
      "gpt-4o",
      " gpt-4o-mini ",
      "gpt-4o",
    ])

    const result = await loadAccountTokenFallbackPricingResponse({
      account: ACCOUNT,
      token: {
        ...TOKEN,
        models: "gpt-4o-mini, claude-3-haiku",
      },
    })

    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith({
      baseUrl: "https://example.com",
      apiKey: "sk-real-secret",
    })
    expect(getSiteAdapterMock).not.toHaveBeenCalled()
    expect(result.data.map((item) => item.model_name)).toEqual([
      "gpt-4o-mini",
      "claude-3-haiku",
      "gpt-4o",
    ])
  })

  it("uses the selected token key for compatible account-token fallback even when the adapter exposes model pricing", async () => {
    const fetchPricingMock = vi
      .fn()
      .mockRejectedValue(new Error("account-scoped pricing should not run"))
    getSiteAdapterMock.mockReturnValueOnce({
      siteType: SITE_TYPES.NEW_API,
      modelPricing: {
        fetchPricing: fetchPricingMock,
      },
    })
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-selected-token-secret",
      models: "",
    })
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce([
      "selected-token-model",
    ])

    const result = await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.NEW_API,
      },
      token: {
        ...TOKEN,
        key: "sk-compatible-masked",
      },
    })

    expect(fetchPricingMock).not.toHaveBeenCalled()
    expect(resolveDisplayAccountTokenForSecretMock).toHaveBeenCalledWith(
      expect.objectContaining({ siteType: SITE_TYPES.NEW_API }),
      expect.objectContaining({ key: "sk-compatible-masked" }),
    )
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith({
      baseUrl: "https://example.com",
      apiKey: "sk-selected-token-secret",
    })
    expect(result.data.map((item) => item.model_name)).toEqual([
      "selected-token-model",
    ])
  })

  it("falls back to token-declared models when the upstream key lookup fails", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
      models: "gpt-4o-mini",
    })
    fetchOpenAICompatibleModelIdsMock.mockRejectedValueOnce(
      new Error("temporary upstream failure"),
    )

    const result = await loadAccountTokenFallbackPricingResponse({
      account: ACCOUNT,
      token: {
        ...TOKEN,
        models: "gpt-4o-mini",
      },
    })

    expect(result.data.map((item) => item.model_name)).toEqual(["gpt-4o-mini"])
  })

  it("loads AIHubMix account-key fallback models without revealing masked keys", async () => {
    const aihubmixPricing: PricingResponse = {
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        provider: SITE_TYPES.AIHUBMIX,
      },
      data: [
        {
          model_name: "gpt-aihubmix-catalog",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        },
      ],
    }
    const fetchPricingMock = vi.fn().mockResolvedValueOnce(aihubmixPricing)
    getSiteAdapterMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
      modelPricing: {
        fetchPricing: fetchPricingMock,
      },
    })
    resolveDisplayAccountTokenForSecretMock.mockRejectedValueOnce(
      new Error("AIHubMix cannot reveal masked keys"),
    )

    const result = await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.AIHUBMIX,
        baseUrl: "https://aihubmix.com",
      },
      token: {
        ...TOKEN,
        key: "sk-****masked",
        models: "",
      },
    })

    expect(result).toBe(aihubmixPricing)
    expect(getSiteAdapterMock).toHaveBeenCalledWith(SITE_TYPES.AIHUBMIX)
    expect(fetchPricingMock).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "account-token",
        cookie: undefined,
      },
    })
    expect(resolveDisplayAccountTokenForSecretMock).not.toHaveBeenCalled()
    expect(fetchOpenAICompatibleModelIdsMock).not.toHaveBeenCalled()
  })

  it("falls back to token lookup when a profile-priced site has no pricing adapter", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
    })
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
    })
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(["profile-model"])

    const result = await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.AIHUBMIX,
        baseUrl: "https://aihubmix.com",
      },
      token: {
        ...TOKEN,
        key: "sk-masked",
      },
    })

    expect(getSiteAdapterMock).toHaveBeenCalledWith(SITE_TYPES.AIHUBMIX)
    expect(resolveDisplayAccountTokenForSecretMock).toHaveBeenCalled()
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      apiKey: "sk-real-secret",
    })
    expect(result.data.map((item) => item.model_name)).toEqual([
      "profile-model",
    ])
  })

  it("does not use the Sub2API runtime-key fallback for compatible accounts without direct pricing adapters", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      siteType: SITE_TYPES.NEW_API,
    })
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
    })
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(["gpt-compatible"])

    const result = await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://compatible.example.invalid",
      },
      token: {
        ...TOKEN,
        key: "sk-compatible-masked",
        models: "",
      },
    })

    expect(resolveDisplayAccountTokenForSecretMock).toHaveBeenCalled()
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith({
      baseUrl: "https://compatible.example.invalid",
      apiKey: "sk-real-secret",
    })
    expect(fetchSub2ApiRuntimeModelsMock).not.toHaveBeenCalled()
    expect(result.data.map((item) => item.model_name)).toEqual([
      "gpt-compatible",
    ])
    expect(result.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
      supportsPricing: false,
    })
  })

  it("loads Sub2API selected-key runtime models as model-list-only rows", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-sub2api-secret",
    })
    fetchSub2ApiRuntimeModelsMock.mockResolvedValueOnce([
      "example-runtime-model",
    ])

    const result = await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://sub2api.example.invalid",
      },
      token: {
        ...TOKEN,
        key: "sk-masked-sub2api",
      },
    })

    expect(resolveDisplayAccountTokenForSecretMock).toHaveBeenCalledWith(
      expect.objectContaining({
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://sub2api.example.invalid",
      }),
      expect.objectContaining({
        key: "sk-masked-sub2api",
      }),
    )
    expect(getSiteAdapterMock).toHaveBeenCalledWith(SITE_TYPES.SUB2API)
    expect(fetchSub2ApiRuntimeModelsMock).toHaveBeenCalledWith({
      baseUrl: "https://sub2api.example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        apiKey: "sk-real-sub2api-secret",
      },
    })
    expect(fetchOpenAICompatibleModelIdsMock).not.toHaveBeenCalled()
    expect(fetchSub2ApiAvailableGroupsMock).toHaveBeenCalledWith({
      baseUrl: "https://sub2api.example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "account-token",
        cookie: undefined,
      },
    })
    expect(result.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    })
    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "example-runtime-model",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
        },
      }),
    ])
  })

  it("adds estimated Sub2API prices when dashboard group and price-table data are available", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-sub2api-secret",
    })
    fetchSub2ApiRuntimeModelsMock.mockResolvedValueOnce([
      "example-priced-model",
      "example-unpriced-model",
    ])
    fetchSub2ApiAvailableGroupsMock.mockResolvedValueOnce([
      { id: 9, name: "vip", rate_multiplier: 1.5 },
    ])
    fetchSub2ApiGroupRatesMock.mockResolvedValueOnce({ "9": 2 })
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        id: 99,
        key: "sk-real-sub2api-secret",
        group: "vip",
        sub2api_group_id: 9,
      },
    ])
    loadModelPriceTableMock.mockResolvedValueOnce({
      source: "synthetic-test",
      source_date: "2026-06-14",
      models: {
        "example-priced-model": {
          input: 2,
          output: 6,
        },
        "example-unpriced-model": {},
      },
    })

    const result = await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://sub2api.example.invalid",
      },
      token: {
        ...TOKEN,
        key: "sk-masked-sub2api",
      },
    })

    expect(result.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: true,
    })
    expect(result.data).toEqual([
      expect.objectContaining({
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
      }),
      expect.objectContaining({
        model_name: "example-unpriced-model",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      }),
    ])
  })

  it("keeps Sub2API runtime rows without pricing when dashboard auth is unavailable", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-sub2api-secret",
    })
    fetchSub2ApiRuntimeModelsMock.mockResolvedValueOnce([
      "example-runtime-model",
    ])

    const result = await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://sub2api.example.invalid",
        token: "",
      },
      token: {
        ...TOKEN,
        key: "sk-masked-sub2api",
      },
    })

    expect(fetchSub2ApiAvailableGroupsMock).not.toHaveBeenCalled()
    expect(loadModelPriceTableMock).not.toHaveBeenCalled()
    expect(result.model_list_source).toMatchObject({
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsPricing: false,
    })
    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "example-runtime-model",
        price_metadata: expect.objectContaining({
          unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        }),
      }),
    ])
  })

  it("sanitizes a missing Sub2API model catalog capability failure", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      siteType: SITE_TYPES.SUB2API,
      family: "sub2api",
    })

    await expect(
      loadAccountTokenFallbackPricingResponse({
        account: {
          ...ACCOUNT,
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://sub2api.example.invalid",
        },
        token: {
          ...TOKEN,
          key: "sk-masked-sub2api",
        },
      }),
    ).rejects.toThrow("modelCatalog is not implemented for sub2api")

    expect(fetchSub2ApiRuntimeModelsMock).not.toHaveBeenCalled()
  })

  it("redacts the resolved key and base URL when fallback loading fails", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
    })
    fetchOpenAICompatibleModelIdsMock.mockRejectedValueOnce(
      new Error("401 for sk-real-secret at https://example.com/v1/models"),
    )

    let caughtError: unknown

    try {
      await loadAccountTokenFallbackPricingResponse({
        account: ACCOUNT,
        token: {
          ...TOKEN,
          models: "",
        },
      })
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(Error)

    const message = caughtError instanceof Error ? caughtError.message : ""
    expect(message).not.toContain("sk-real-secret")
    expect(message).not.toContain("https://example.com")
    expect(message.length).toBeGreaterThan(0)
    expect(message).not.toBe(ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED)
  })

  it("preserves structured fallback load failure metadata for analytics", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
    })
    const authError = new ApiError(
      "401 for sk-real-secret at https://example.com/v1/models",
      401,
      "https://example.com/v1/models",
      API_ERROR_CODES.HTTP_401,
    )
    fetchOpenAICompatibleModelIdsMock.mockRejectedValueOnce(authError)

    let caughtError: unknown

    try {
      await loadAccountTokenFallbackPricingResponse({
        account: ACCOUNT,
        token: {
          ...TOKEN,
          models: "",
        },
      })
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(Error)
    expect((caughtError as Error & { cause?: unknown }).cause).toBe(authError)
    expect(
      caughtError instanceof Error ? caughtError.message : "",
    ).not.toContain("sk-real-secret")
  })

  it("surfaces Sub2API runtime key business errors for fallback catalog loading", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-sub2api-secret",
    })
    const groupDeletedError = new ApiError(
      "API Key 所属分组已删除",
      undefined,
      "/v1/models",
      API_ERROR_CODES.BUSINESS_ERROR,
    )
    fetchSub2ApiRuntimeModelsMock.mockRejectedValueOnce(groupDeletedError)

    await expect(
      loadAccountTokenFallbackPricingResponse({
        account: {
          ...ACCOUNT,
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://sub2api.example.invalid",
        },
        token: {
          ...TOKEN,
          key: "sk-masked-sub2api",
        },
      }),
    ).rejects.toMatchObject({
      message: "API Key 所属分组已删除",
      cause: groupDeletedError,
    })
  })

  it("normalizes, filters, and de-duplicates raw model ids when building profile catalogs", () => {
    expect(
      normalizeApiCredentialModelIds([
        " gpt-4o ",
        "",
        "gpt-4o",
        "claude-3-haiku",
        123,
      ] as any),
    ).toEqual(["gpt-4o", "claude-3-haiku"])

    expect(
      buildApiCredentialProfilePricingResponse([
        " gpt-4o ",
        "gpt-4o",
        "claude-3-haiku",
      ]).data,
    ).toEqual([
      expect.objectContaining({ model_name: "gpt-4o" }),
      expect.objectContaining({ model_name: "claude-3-haiku" }),
    ])
  })
})
