import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED,
  loadAccountTokenFallbackPricingResponse,
} from "~/services/modelList/accountSources/tokenScopedFallback"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type PricingResponse,
} from "~/services/modelList/pricingModel"
import { AuthTypeEnum } from "~/types"

const {
  fetchOpenAICompatibleModelIdsMock,
  fetchAccountTokensMock,
  fetchSub2ApiAvailableGroupsMock,
  fetchSub2ApiGroupRatesMock,
  fetchSub2ApiRuntimeModelsMock,
  getSiteTypeCapabilitiesMock,
  loadModelPriceTableMock,
  resolveDisplayAccountTokenForSecretMock,
} = vi.hoisted(() => ({
  fetchOpenAICompatibleModelIdsMock: vi.fn(),
  fetchAccountTokensMock: vi.fn(),
  fetchSub2ApiAvailableGroupsMock: vi.fn(),
  fetchSub2ApiGroupRatesMock: vi.fn(),
  fetchSub2ApiRuntimeModelsMock: vi.fn(),
  getSiteTypeCapabilitiesMock: vi.fn(),
  loadModelPriceTableMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
}))

vi.mock("~/services/modelPricing/modelPriceTable", () => ({
  loadModelPriceTable: (...args: unknown[]) => loadModelPriceTableMock(...args),
}))

vi.mock(
  "~/services/apiCredentialProfiles/modelCatalog",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiCredentialProfiles/modelCatalog")
      >()

    return {
      ...actual,
      fetchApiCredentialModelIds: (...args: unknown[]) =>
        fetchOpenAICompatibleModelIdsMock(...args),
    }
  },
)

vi.mock("~/services/apiAdapters/sub2api/dashboardEstimates", () => ({
  loadSub2ApiDashboardEstimateData: async (...args: unknown[]) => {
    const [request] = args
    const [groups, groupRates, accountTokens] = await Promise.all([
      fetchSub2ApiAvailableGroupsMock(request),
      fetchSub2ApiGroupRatesMock(request),
      fetchAccountTokensMock(request),
    ])

    return { groups, groupRates, accountTokens }
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
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
  account: {
    keyManagement: {
      resolveTokenKey: vi.fn(),
    },
    modelCatalog: {
      fetchModels,
    },
  },
})

const createModelCatalogAdapter = (
  siteType: typeof SITE_TYPES.SHAREDCHAT,
  fetchModels = fetchSub2ApiRuntimeModelsMock,
) => ({
  siteType,
  account: {
    modelCatalog: {
      fetchModels,
    },
  },
})

const mockSub2ApiModelCatalogAdapter = (
  fetchModels = fetchSub2ApiRuntimeModelsMock,
) => {
  getSiteTypeCapabilitiesMock.mockReturnValue(
    createSub2ApiModelCatalogAdapter(fetchModels),
  )
}

describe("loadAccountTokenFallbackPricingResponse", () => {
  beforeEach(() => {
    fetchOpenAICompatibleModelIdsMock.mockReset()
    fetchAccountTokensMock.mockReset()
    fetchSub2ApiAvailableGroupsMock.mockReset()
    fetchSub2ApiGroupRatesMock.mockReset()
    fetchSub2ApiRuntimeModelsMock.mockReset()
    getSiteTypeCapabilitiesMock.mockReset()
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

    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiType: "openai-compatible",
        baseUrl: "https://example.com",
        apiKey: "sk-real-secret",
      }),
    )
    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith("new-api")
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
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.NEW_API,
      account: {
        modelPricing: {
          fetchPricing: fetchPricingMock,
        },
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
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiType: "openai-compatible",
        baseUrl: "https://example.com",
        apiKey: "sk-selected-token-secret",
      }),
    )
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

  it("preserves caller aborts from upstream model lookup even when declared models exist", async () => {
    const abortController = new AbortController()
    const abortError = new DOMException("Aborted", "AbortError")
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
      models: "gpt-4o-mini",
    })
    fetchOpenAICompatibleModelIdsMock.mockImplementationOnce(() => {
      abortController.abort(abortError)
      return Promise.reject(abortError)
    })

    await expect(
      loadAccountTokenFallbackPricingResponse({
        account: ACCOUNT,
        token: {
          ...TOKEN,
          models: "gpt-4o-mini",
        },
        abortSignal: abortController.signal,
      }),
    ).rejects.toBe(abortError)
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
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
      account: {
        modelPricing: {
          fetchPricing: fetchPricingMock,
        },
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
    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith(
      SITE_TYPES.AIHUBMIX,
    )
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

  it("sanitizes a missing AIHubMix model pricing capability failure", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
    })

    await expect(
      loadAccountTokenFallbackPricingResponse({
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
      }),
    ).rejects.toThrow("modelPricing is not implemented for AIHubMix")

    expect(resolveDisplayAccountTokenForSecretMock).not.toHaveBeenCalled()
    expect(fetchOpenAICompatibleModelIdsMock).not.toHaveBeenCalled()
  })

  it("does not use the Sub2API runtime-key fallback for compatible accounts without direct pricing adapters", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
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
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiType: "openai-compatible",
        baseUrl: "https://compatible.example.invalid",
        apiKey: "sk-real-secret",
      }),
    )
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
    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith(SITE_TYPES.SUB2API)
    expect(fetchSub2ApiRuntimeModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2api.example.invalid",
        accountId: "account-1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          apiKey: "sk-real-sub2api-secret",
        },
      }),
    )
    expect(fetchOpenAICompatibleModelIdsMock).not.toHaveBeenCalled()
    expect(fetchSub2ApiAvailableGroupsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2api.example.invalid",
        accountId: "account-1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "account-token",
          cookie: undefined,
        },
      }),
    )
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

  it("loads SharedChat Codex runtime models without Sub2API price semantics", async () => {
    getSiteTypeCapabilitiesMock.mockReturnValueOnce(
      createModelCatalogAdapter(SITE_TYPES.SHAREDCHAT),
    )
    fetchSub2ApiRuntimeModelsMock.mockResolvedValueOnce([
      " gpt-5.5 ",
      "gpt-5.4-mini",
    ])

    const result = await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.SHAREDCHAT,
        baseUrl: "https://new.sharedchat.cc",
      },
      token: {
        ...TOKEN,
        id: -1,
        key: "sk-sharedchat-codex",
        name: "Codex",
      },
    })

    expect(resolveDisplayAccountTokenForSecretMock).not.toHaveBeenCalled()
    expect(fetchSub2ApiRuntimeModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://new.sharedchat.cc",
        accountId: "account-1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          apiKey: "sk-sharedchat-codex",
        },
      }),
    )
    expect(fetchSub2ApiAvailableGroupsMock).not.toHaveBeenCalled()
    expect(loadModelPriceTableMock).not.toHaveBeenCalled()
    expect(result.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
      provider: SITE_TYPES.SHAREDCHAT,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    })
    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "gpt-5.5",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        },
      }),
      expect.objectContaining({
        model_name: "gpt-5.4-mini",
      }),
    ])
  })

  it("passes abort signals through token-scoped catalog fallback requests", async () => {
    const abortController = new AbortController()
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-secret",
      models: "",
    })
    fetchOpenAICompatibleModelIdsMock.mockResolvedValueOnce(["gpt-compatible"])

    await loadAccountTokenFallbackPricingResponse({
      account: ACCOUNT,
      token: TOKEN,
      abortSignal: abortController.signal,
    })

    expect(resolveDisplayAccountTokenForSecretMock).toHaveBeenLastCalledWith(
      ACCOUNT,
      TOKEN,
      { abortSignal: abortController.signal },
    )
    expect(fetchOpenAICompatibleModelIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: abortController.signal }),
    )

    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-sub2api-secret",
    })
    fetchSub2ApiRuntimeModelsMock.mockResolvedValueOnce([
      "example-runtime-model",
    ])
    fetchSub2ApiAvailableGroupsMock.mockResolvedValueOnce([])
    fetchSub2ApiGroupRatesMock.mockResolvedValueOnce({})
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://sub2api.example.invalid",
      },
      token: TOKEN,
      abortSignal: abortController.signal,
    })

    expect(resolveDisplayAccountTokenForSecretMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://sub2api.example.invalid",
      }),
      TOKEN,
      { abortSignal: abortController.signal },
    )
    expect(fetchSub2ApiRuntimeModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: abortController.signal }),
    )
    expect(fetchSub2ApiAvailableGroupsMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: abortController.signal }),
    )
    expect(loadModelPriceTableMock).toHaveBeenCalledWith(abortController.signal)
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
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
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

  it("redacts account auth secrets when account-scoped pricing fails", async () => {
    const fetchPricingMock = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "401 for account-token and session=sensitive-cookie at https://example.com/api/pricing",
        ),
      )
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
      account: {
        modelPricing: {
          fetchPricing: fetchPricingMock,
        },
      },
    })

    let caughtError: unknown

    try {
      await loadAccountTokenFallbackPricingResponse({
        account: {
          ...ACCOUNT,
          siteType: SITE_TYPES.AIHUBMIX,
          cookieAuthSessionCookie: "session=sensitive-cookie",
        },
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
    expect(message).not.toContain("account-token")
    expect(message).not.toContain("session=sensitive-cookie")
    expect(message).not.toContain("https://example.com")
    expect(message.length).toBeGreaterThan(0)
  })

  it("passes abort signals through direct pricing fallback requests", async () => {
    const abortController = new AbortController()
    const fetchPricingMock = vi.fn().mockResolvedValue({
      data: [],
      group_ratio: {},
      success: true,
      usable_group: {},
    })
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
      account: {
        modelPricing: {
          fetchPricing: fetchPricingMock,
        },
      },
    })

    await loadAccountTokenFallbackPricingResponse({
      account: {
        ...ACCOUNT,
        siteType: SITE_TYPES.AIHUBMIX,
      },
      token: {
        ...TOKEN,
        models: "",
      },
      abortSignal: abortController.signal,
    })

    expect(fetchPricingMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: abortController.signal }),
    )
  })

  it("preserves caller aborts from direct pricing fallback requests", async () => {
    const abortController = new AbortController()
    abortController.abort(new DOMException("Aborted", "AbortError"))
    const abortError = new DOMException("Aborted", "AbortError")
    const fetchPricingMock = vi.fn().mockRejectedValueOnce(abortError)
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
      account: {
        modelPricing: {
          fetchPricing: fetchPricingMock,
        },
      },
    })

    await expect(
      loadAccountTokenFallbackPricingResponse({
        account: {
          ...ACCOUNT,
          siteType: SITE_TYPES.AIHUBMIX,
        },
        token: {
          ...TOKEN,
          models: "",
        },
        abortSignal: abortController.signal,
      }),
    ).rejects.toBe(abortError)
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

  it("preserves caller aborts during Sub2API dashboard price estimation", async () => {
    const abortController = new AbortController()
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      key: "sk-real-sub2api-secret",
    })
    fetchSub2ApiRuntimeModelsMock.mockResolvedValueOnce([
      "example-runtime-model",
    ])
    const abortError = new DOMException("Aborted", "AbortError")
    fetchSub2ApiAvailableGroupsMock.mockImplementationOnce(() => {
      abortController.abort(abortError)
      return Promise.reject(abortError)
    })
    loadModelPriceTableMock.mockRejectedValueOnce(abortError)

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
        abortSignal: abortController.signal,
      }),
    ).rejects.toBe(abortError)
  })
})
