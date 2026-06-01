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
  type PricingResponse,
} from "~/services/apiService/common/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"

const {
  fetchAnthropicModelIdsMock,
  fetchGoogleModelIdsMock,
  fetchOpenAICompatibleModelIdsMock,
  getApiServiceMock,
  resolveDisplayAccountTokenForSecretMock,
} = vi.hoisted(() => ({
  fetchAnthropicModelIdsMock: vi.fn(),
  fetchGoogleModelIdsMock: vi.fn(),
  fetchOpenAICompatibleModelIdsMock: vi.fn(),
  getApiServiceMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: (...args: unknown[]) => getApiServiceMock(...args),
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

describe("loadAccountTokenFallbackPricingResponse", () => {
  beforeEach(() => {
    fetchAnthropicModelIdsMock.mockReset()
    fetchGoogleModelIdsMock.mockReset()
    fetchOpenAICompatibleModelIdsMock.mockReset()
    getApiServiceMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockImplementation(
      async (_account, token) => token,
    )
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
    expect(result.data.map((item) => item.model_name)).toEqual([
      "gpt-4o-mini",
      "claude-3-haiku",
      "gpt-4o",
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
    const fetchModelPricingMock = vi.fn().mockResolvedValueOnce(aihubmixPricing)
    getApiServiceMock.mockReturnValueOnce({
      fetchModelPricing: fetchModelPricingMock,
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
    expect(getApiServiceMock).toHaveBeenCalledWith(SITE_TYPES.AIHUBMIX)
    expect(fetchModelPricingMock).toHaveBeenCalledWith({
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
