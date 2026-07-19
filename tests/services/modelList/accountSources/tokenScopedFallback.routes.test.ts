import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
} from "~/services/accounts/accountSiteProfile"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import { AuthTypeEnum } from "~/types"

import { loadAccountRuntimeKeyFallbackPricingResponseFromToken } from "./runtimeKeyFallbackTestUtils"

const {
  fetchRuntimeModelsMock,
  getAccountSiteModelListProfileMock,
  getSiteTypeCapabilitiesMock,
  resolveDisplayAccountTokenForSecretMock,
} = vi.hoisted(() => ({
  fetchRuntimeModelsMock: vi.fn(),
  getAccountSiteModelListProfileMock: vi.fn(),
  getSiteTypeCapabilitiesMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
}))

vi.mock("~/services/accounts/accountSiteProfile", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/accountSiteProfile")
    >()

  return {
    ...actual,
    getAccountSiteModelListProfile: (...args: unknown[]) =>
      getAccountSiteModelListProfileMock(...args),
  }
})

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountRuntimeKeySecret: async (...args: unknown[]) => {
    const [account, runtimeKey] = args as [
      { id: string; name?: string },
      { token?: unknown; source: string },
    ]
    if (runtimeKey.source === "account_token") {
      const token = await resolveDisplayAccountTokenForSecretMock(
        account,
        runtimeKey.token,
      )
      return {
        ...runtimeKey,
        token,
        secret: (token as { key: string }).key,
      }
    }
    return runtimeKey
  },
}))

describe("loadAccountRuntimeKeyFallbackPricingResponseFromToken routing", () => {
  beforeEach(() => {
    fetchRuntimeModelsMock.mockReset()
    getAccountSiteModelListProfileMock.mockReset()
    getSiteTypeCapabilitiesMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockReset()

    getAccountSiteModelListProfileMock.mockReturnValue({
      directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Unsupported,
      tokenScopedCatalogFallback:
        ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey,
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
      account: {
        modelCatalog: {
          fetchModels: fetchRuntimeModelsMock,
        },
      },
    })
    resolveDisplayAccountTokenForSecretMock.mockImplementation(
      async (_account, token) => token,
    )
  })

  it("returns runtime model-only rows when a token-scoped route has no dashboard estimate loader", async () => {
    fetchRuntimeModelsMock.mockResolvedValueOnce([{ id: "runtime-only-model" }])

    const result = await loadAccountRuntimeKeyFallbackPricingResponseFromToken({
      account: {
        id: "account-1",
        name: "Account",
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://sub2api.example.invalid",
        userId: "1",
        token: "account-token",
        authType: AuthTypeEnum.AccessToken,
        tagIds: [],
      },
      token: {
        id: 10,
        user_id: 1,
        key: "sk-runtime-secret",
        status: 1,
        name: "Runtime Key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
        models: "",
      },
    })

    expect(fetchRuntimeModelsMock).toHaveBeenCalledWith({
      baseUrl: "https://sub2api.example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        apiKey: "sk-runtime-secret",
      },
    })
    expect(result.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    })
    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "runtime-only-model",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        },
      }),
    ])
  })

  it("accepts the legacy minimal account shape for token fallback callers", async () => {
    fetchRuntimeModelsMock.mockResolvedValueOnce([
      { id: "legacy-minimal-model" },
    ])

    const result = await loadAccountRuntimeKeyFallbackPricingResponseFromToken({
      account: {
        id: "minimal-account",
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://minimal.example.invalid",
        userId: "1",
        token: "account-token",
        authType: AuthTypeEnum.AccessToken,
      },
      token: {
        id: 11,
        user_id: 1,
        key: "sk-minimal-secret",
        status: 1,
        name: "Minimal Key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
        models: "",
      },
    })

    expect(fetchRuntimeModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "minimal-account",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          apiKey: "sk-minimal-secret",
        },
      }),
    )
    expect(result.data.map((model) => model.model_name)).toEqual([
      "legacy-minimal-model",
    ])
  })
})
