import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useModelData } from "~/features/ModelList/hooks/useModelData"
import {
  createAccountSource,
  createAllAccountsSource,
  createProfileSource,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import { InvalidTokenPayloadError } from "~/services/accounts/utils/apiServiceRequest"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import { modelPricingCache } from "~/services/models/modelPricingCache"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsResult,
  type ProductAnalyticsSourceKind,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { testI18n } from "~~/tests/test-utils/i18n"

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

const { mockTrackProductAnalyticsActionCompleted } = vi.hoisted(() => ({
  mockTrackProductAnalyticsActionCompleted: vi.fn(),
}))

const {
  mockFetchDisplayAccountRuntimeKeys,
  mockFetchDisplayAccountTokens,
  mockLoadAccountRuntimeKeyFallbackPricingResponse,
} = vi.hoisted(() => ({
  mockFetchDisplayAccountRuntimeKeys: vi.fn(),
  mockFetchDisplayAccountTokens: vi.fn(),
  mockLoadAccountRuntimeKeyFallbackPricingResponse: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    trackProductAnalyticsActionCompleted: (...args: unknown[]) =>
      mockTrackProductAnalyticsActionCompleted(...args),
  }
})

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    const { buildAccountTokenRuntimeKey } = await import(
      "~/services/accounts/accountRuntimeKeys"
    )

    return {
      ...actual,
      fetchDisplayAccountTokens: (...args: unknown[]) =>
        mockFetchDisplayAccountTokens(...args),
      fetchDisplayAccountRuntimeKeyTokens: (...args: unknown[]) =>
        mockFetchDisplayAccountTokens(...args),
      fetchDisplayAccountRuntimeKeys: async (...args: unknown[]) => {
        const [account] = args as [DisplaySiteData]
        const runtimeKeys = await mockFetchDisplayAccountRuntimeKeys(account)
        return runtimeKeys.map((runtimeKey: any) =>
          runtimeKey?.source && runtimeKey?.accountId
            ? runtimeKey
            : buildAccountTokenRuntimeKey(account, {
                ...runtimeKey,
                accountId: account.id,
                accountName: account.name,
              }),
        )
      },
    }
  },
)

const mockFetchApiCredentialModelIds = vi.fn()

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
        mockFetchApiCredentialModelIds(...args),
    }
  },
)

vi.mock("~/services/modelList/accountSources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/modelList/accountSources")>()

  return {
    ...actual,
    ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED: "ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED",
    loadAccountRuntimeKeyFallbackPricingResponse: (...args: unknown[]) =>
      mockLoadAccountRuntimeKeyFallbackPricingResponse(...args),
  }
})

const createDisplayAccount = (
  overrides: Partial<DisplaySiteData>,
): DisplaySiteData => ({
  id: "account",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.UNKNOWN,
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const createMockSiteTypeCapabilities = (
  fetchPricing: ReturnType<typeof vi.fn>,
  overrides: {
    siteType?: DisplaySiteData["siteType"]
    modelPricing?: false
    modelCatalog?: false
    keyManagement?: false
    serviceCredential?: false
  } = {},
) => {
  const shouldIncludeKeyManagement =
    overrides.keyManagement !== false &&
    (!overrides.siteType ||
      overrides.siteType === SITE_TYPES.NEW_API ||
      overrides.siteType === SITE_TYPES.SUB2API)

  return {
    siteType: overrides.siteType ?? SITE_TYPES.NEW_API,
    account: {
      ...(overrides.modelPricing === false
        ? {}
        : {
            modelPricing: {
              fetchPricing,
            },
          }),
      ...(overrides.siteType === SITE_TYPES.SUB2API &&
      overrides.modelPricing === false &&
      overrides.modelCatalog !== false
        ? {
            modelCatalog: {
              fetchModels: vi.fn(),
            },
          }
        : {}),
      ...(shouldIncludeKeyManagement
        ? {
            keyManagement: {},
          }
        : {}),
      ...(overrides.siteType === SITE_TYPES.SHAREDCHAT &&
      overrides.serviceCredential !== false
        ? {
            serviceCredential: {
              fetch: vi.fn(),
            },
          }
        : {}),
    },
  } as any
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={testI18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  )
}

const expectLastModelDataAnalyticsCompletion = (expected: {
  result: ProductAnalyticsResult
  sourceKind: ProductAnalyticsSourceKind
  modelCount?: number
  successCount?: number
  failureCount?: number
  errorCategory?: string
  failureStage?: string
  failureReason?: string
  siteType?: string
  requestedAuthMode?: string
  apiType?: string
  cacheHit?: boolean
  fallbackAvailable?: boolean
  fallbackUsed?: boolean
}) => {
  const lastCall = mockTrackProductAnalyticsActionCompleted.mock.lastCall?.[0]

  expect(lastCall).toEqual({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelPricingData,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    result: expected.result,
    ...(expected.errorCategory
      ? { errorCategory: expected.errorCategory }
      : {}),
    diagnostics: {
      context: {
        sourceKind: expected.sourceKind,
        ...(expected.siteType ? { siteType: expected.siteType } : {}),
        ...(expected.requestedAuthMode
          ? { requestedAuthMode: expected.requestedAuthMode }
          : {}),
        ...(expected.apiType ? { apiType: expected.apiType } : {}),
      },
      ...(typeof expected.cacheHit === "boolean" ||
      typeof expected.fallbackAvailable === "boolean" ||
      typeof expected.fallbackUsed === "boolean"
        ? {
            execution: {
              ...(typeof expected.cacheHit === "boolean"
                ? { cacheHit: expected.cacheHit }
                : {}),
              ...(typeof expected.fallbackAvailable === "boolean"
                ? { fallbackAvailable: expected.fallbackAvailable }
                : {}),
              ...(typeof expected.fallbackUsed === "boolean"
                ? { fallbackUsed: expected.fallbackUsed }
                : {}),
            },
          }
        : {}),
      ...(typeof expected.modelCount === "number" ||
      typeof expected.successCount === "number" ||
      typeof expected.failureCount === "number"
        ? {
            outcome: {
              ...(typeof expected.modelCount === "number"
                ? { modelCount: expected.modelCount }
                : {}),
              ...(typeof expected.successCount === "number"
                ? { successCount: expected.successCount }
                : {}),
              ...(typeof expected.failureCount === "number"
                ? { failureCount: expected.failureCount }
                : {}),
            },
          }
        : {}),
      ...(expected.errorCategory ||
      expected.failureStage ||
      expected.failureReason
        ? {
            failure: {
              ...(expected.errorCategory
                ? { category: expected.errorCategory }
                : {}),
              ...(expected.failureStage
                ? { stage: expected.failureStage }
                : {}),
              ...(expected.failureReason
                ? { reason: expected.failureReason }
                : {}),
            },
          }
        : {}),
    },
  })
  expect(lastCall).not.toHaveProperty("error")
  expect(lastCall).not.toHaveProperty("message")
  expect(lastCall).not.toHaveProperty("accountId")
  expect(lastCall).not.toHaveProperty("accountName")
  expect(lastCall).not.toHaveProperty("profileName")
  expect(lastCall).not.toHaveProperty("baseUrl")
  expect(lastCall).not.toHaveProperty("modelId")
}

describe("useModelData all-accounts loading", () => {
  beforeEach(() => {
    mockFetchApiCredentialModelIds.mockReset()
    mockFetchDisplayAccountRuntimeKeys.mockReset()
    mockFetchDisplayAccountRuntimeKeys.mockImplementation((...args) =>
      mockFetchDisplayAccountTokens(...args),
    )
    mockFetchDisplayAccountTokens.mockReset()
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockReset()
    mockTrackProductAnalyticsActionCompleted.mockReset()
    vi.mocked(getSiteTypeCapabilities).mockReset()
  })

  it("does not fetch all-account pricing until selectedAccount is 'all'", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    const fetchPricing = vi.fn().mockResolvedValue({
      data: [],
      group_ratio: {},
      success: true,
      usable_group: {},
    })
    const mockedgetSiteTypeCapabilities = vi.mocked(getSiteTypeCapabilities)
    mockedgetSiteTypeCapabilities.mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const accounts = [
      createDisplayAccount({
        id: "a",
        baseUrl: "https://a.example.com",
        userId: "1",
      }),
      createDisplayAccount({
        id: "b",
        baseUrl: "https://b.example.com",
        userId: "2",
      }),
    ]

    renderHook(
      () =>
        useModelData({
          selectedSource: null,
          accounts,
        }),
      { wrapper: createWrapper() },
    )

    // Yield at least one tick; with the pre-fix behaviour this would start queries immediately.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchPricing).not.toHaveBeenCalled()
  })

  it("fetches all-account pricing when selectedAccount is 'all'", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    const fetchPricing = vi.fn().mockResolvedValue({
      data: [],
      group_ratio: {},
      success: true,
      usable_group: {},
    })
    const mockedgetSiteTypeCapabilities = vi.mocked(getSiteTypeCapabilities)
    mockedgetSiteTypeCapabilities.mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const accounts = [
      createDisplayAccount({
        id: "a",
        baseUrl: "https://a.example.com",
        userId: "1",
      }),
      createDisplayAccount({
        id: "b",
        baseUrl: "https://b.example.com",
        userId: "2",
      }),
    ]

    renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(fetchPricing).toHaveBeenCalledTimes(2))
    const calledAccountIds = fetchPricing.mock.calls.map(
      (call) => call[0]?.accountId,
    )
    expect(calledAccountIds).toEqual(expect.arrayContaining(["a", "b"]))
  })

  it("does not invoke model pricing for unsupported Sub2API accounts", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("fetch should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "unsupported-sub2api",
      baseUrl: "https://sub2api.example.com",
      siteType: SITE_TYPES.SUB2API,
      userId: "sub2api-user",
    })
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([])

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockFetchDisplayAccountTokens).toHaveBeenCalledWith(account)
      },
      { timeout: 3000 },
    )
    expect(result.current.loadErrorMessage).toBeNull()
    expect(fetchPricing).not.toHaveBeenCalled()
  })

  it("reports unsupported non-Sub2API accounts as direct pricing failures", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("fetch should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.UNKNOWN,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "unsupported-unknown",
      baseUrl: "https://unsupported-unknown.example.invalid",
      siteType: SITE_TYPES.UNKNOWN,
      userId: "unsupported-unknown-user",
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailed",
        )
      },
      { timeout: 3000 },
    )
    expect(fetchPricing).not.toHaveBeenCalled()
    expect(mockFetchDisplayAccountTokens).not.toHaveBeenCalled()
  })

  it("does not invoke all-account pricing when Sub2API has no fallback key", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("fetch should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )
    mockFetchDisplayAccountTokens.mockResolvedValue([])

    const accounts = [
      createDisplayAccount({
        id: "unsupported-all-a",
        baseUrl: "https://unsupported-a.example.com",
        siteType: SITE_TYPES.SUB2API,
        userId: "unsupported-a-user",
      }),
      createDisplayAccount({
        id: "unsupported-all-b",
        baseUrl: "https://unsupported-b.example.com",
        siteType: SITE_TYPES.SUB2API,
        userId: "unsupported-b-user",
      }),
    ]

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailedWithReason",
        )
      },
      { timeout: 3000 },
    )
    expect(fetchPricing).not.toHaveBeenCalled()
    expect(mockFetchDisplayAccountTokens).toHaveBeenCalledTimes(2)
    expect(mockFetchDisplayAccountTokens).toHaveBeenCalledWith(accounts[0])
    expect(mockFetchDisplayAccountTokens).toHaveBeenCalledWith(accounts[1])
  })

  it("loads every Sub2API fallback key in all-accounts mode so each key can be compared", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("common pricing should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-all-accounts",
      name: "Sub2API Account",
      baseUrl: "https://sub2api-all.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      userId: "sub2api-all-user",
    })
    const fallbackTokens = [
      {
        id: 21,
        user_id: 21,
        key: "sk-sub2api-all-masked-a",
        status: 1,
        name: "Default runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 22,
        user_id: 21,
        key: "sk-sub2api-all-masked-b",
        status: 1,
        name: "VIP runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]
    const defaultPricing = {
      data: [
        {
          model_name: "example-runtime-priced-model",
          quota_type: 0,
          model_ratio: 2,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
            precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
          },
        },
      ],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: "default" },
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
        provider: SITE_TYPES.SUB2API,
        supportsRuntimeModelList: true,
        supportsPricing: true,
      },
    }
    const vipPricing = {
      ...defaultPricing,
      data: [
        {
          ...defaultPricing.data[0],
          model_name: "example-runtime-vip-model",
          enable_groups: ["vip"],
        },
      ],
      group_ratio: { vip: 0.5 },
      usable_group: { vip: "vip" },
    }

    mockFetchDisplayAccountTokens.mockResolvedValueOnce(fallbackTokens)
    mockLoadAccountRuntimeKeyFallbackPricingResponse
      .mockResolvedValueOnce(defaultPricing)
      .mockResolvedValueOnce(vipPricing)

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(
          mockLoadAccountRuntimeKeyFallbackPricingResponse,
        ).toHaveBeenCalledTimes(2)
      },
      { timeout: 3000 },
    )

    expect(fetchPricing).not.toHaveBeenCalled()
    expect(result.current.loadErrorMessage).toBeNull()
    expect(result.current.pricingContexts).toEqual([
      {
        account,
        pricing: defaultPricing,
        sourceIdentity: {
          kind: "account-runtime-key",
          id: "sub2api-all-accounts:runtime-key:account_token:sub2api-all-accounts:21",
          runtimeKeyId: "account_token:sub2api-all-accounts:21",
          runtimeKeyName: "Default runtime key",
        },
      },
      {
        account,
        pricing: vipPricing,
        sourceIdentity: {
          kind: "account-runtime-key",
          id: "sub2api-all-accounts:runtime-key:account_token:sub2api-all-accounts:22",
          runtimeKeyId: "account_token:sub2api-all-accounts:22",
          runtimeKeyName: "VIP runtime key",
        },
      },
    ])
  })

  it("loads only active Sub2API fallback keys in all-accounts mode", async () => {
    const fetchPricing = vi.fn()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-active-only",
      name: "Sub2API Active Only",
      baseUrl: "https://sub2api-active-only.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })
    const tokens = [
      {
        id: 21,
        user_id: 21,
        key: "sk-active",
        status: 1,
        name: "Active runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 22,
        user_id: 21,
        key: "sk-disabled",
        status: 0,
        name: "Disabled runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]
    const pricing = {
      data: [
        {
          model_name: "active-model",
          quota_type: 0,
          model_ratio: 1,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: true },
    }

    mockFetchDisplayAccountTokens.mockResolvedValueOnce(tokens)
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockResolvedValueOnce(
      pricing,
    )

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(
          mockLoadAccountRuntimeKeyFallbackPricingResponse,
        ).toHaveBeenCalledTimes(1)
      },
      { timeout: 3000 },
    )

    expect(
      mockLoadAccountRuntimeKeyFallbackPricingResponse,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        runtimeKey: expect.objectContaining({
          id: "account_token:sub2api-active-only:21",
          label: "Active runtime key",
          token: expect.objectContaining({ id: tokens[0].id }),
        }),
        abortSignal: expect.anything(),
      }),
    )
    expect(fetchPricing).not.toHaveBeenCalled()
    expect(result.current.loadErrorMessage).toBeNull()
    expect(result.current.pricingContexts).toEqual([
      {
        account,
        pricing,
        sourceIdentity: {
          kind: "account-runtime-key",
          id: "sub2api-active-only:runtime-key:account_token:sub2api-active-only:21",
          runtimeKeyId: "account_token:sub2api-active-only:21",
          runtimeKeyName: "Active runtime key",
        },
      },
    ])
  })

  it("keeps successful Sub2API token contexts as partial instead of load failed when another token fails", async () => {
    mockTrackProductAnalyticsActionCompleted.mockReset()
    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("fetch should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-partial",
      name: "Sub2API Partial",
      baseUrl: "https://sub2api-partial.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })
    const tokens = [
      {
        id: 31,
        user_id: 31,
        key: "sk-success",
        status: 1,
        name: "Success key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 32,
        user_id: 31,
        key: "sk-failure",
        status: 1,
        name: "Failure key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]
    const pricing = {
      data: [
        {
          model_name: "surviving-model",
          quota_type: 0,
          model_ratio: 1,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: "default" },
    }

    mockFetchDisplayAccountTokens.mockResolvedValue(tokens)
    mockLoadAccountRuntimeKeyFallbackPricingResponse
      .mockResolvedValueOnce(pricing)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.pricingContexts).toHaveLength(1)
      },
      { timeout: 3000 },
    )

    expect(result.current.loadErrorMessage).toBeNull()
    expect(result.current.accountQueryStates).toEqual([
      expect.objectContaining({
        account,
        isLoading: false,
        hasData: true,
        hasError: true,
        errorType: "partial-load-failed",
        errorMessage: "modelList:accountSummary.partialLoadFailedReason",
      }),
    ])
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
      modelCount: 1,
      successCount: 1,
      failureCount: 1,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable,
    })
  })

  it("marks a Sub2API account failed when every fallback key fails", async () => {
    const fetchPricing = vi.fn()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-all-failed",
      name: "Sub2API Failed",
      baseUrl: "https://sub2api-failed.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })
    const tokens = [
      {
        id: 41,
        user_id: 41,
        key: "sk-failed",
        status: 1,
        name: "Failed key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]

    mockFetchDisplayAccountTokens.mockResolvedValue(tokens)
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockRejectedValue(
      new Error("token failed"),
    )

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailedWithReason",
        )
      },
      { timeout: 3000 },
    )

    expect(result.current.pricingContexts).toEqual([])
    expect(result.current.accountQueryStates).toEqual([
      expect.objectContaining({
        account,
        isLoading: false,
        hasData: false,
        hasError: true,
        errorType: "load-failed",
        errorMessage: "token failed",
      }),
    ])
  })

  it("marks mixed Sub2API all-token failures as load failed instead of invalid format", async () => {
    const fetchPricing = vi.fn()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-mixed-failed",
      name: "Sub2API Mixed Failed",
      baseUrl: "https://sub2api-mixed-failed.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })
    const tokens = [
      {
        id: 51,
        user_id: 51,
        key: "sk-invalid",
        status: 1,
        name: "Invalid key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 52,
        user_id: 51,
        key: "sk-generic",
        status: 1,
        name: "Generic failure key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]

    mockFetchDisplayAccountTokens.mockResolvedValue(tokens)
    mockLoadAccountRuntimeKeyFallbackPricingResponse
      .mockResolvedValueOnce({
        data: null,
        group_ratio: {},
        success: true,
        usable_group: {},
      })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        data: null,
        group_ratio: {},
        success: true,
        usable_group: {},
      })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailedWithReason",
        )
      },
      { timeout: 3000 },
    )

    expect(result.current.dataFormatError).toBe(false)
    expect(result.current.accountQueryStates).toEqual([
      expect.objectContaining({
        account,
        isLoading: false,
        hasData: false,
        hasError: true,
        errorType: "load-failed",
        errorMessage: "Failed to fetch",
      }),
    ])
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
      modelCount: 0,
      successCount: 0,
      failureCount: 1,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable,
    })
  })

  it("refetches all-accounts pricing after single-account query cache was populated", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            model_name: "single-account-cached-model",
            quota_type: 0,
            model_ratio: 1,
            model_price: 1,
            completion_ratio: 1,
            enable_groups: ["default"],
            supported_endpoint_types: [],
          },
        ],
        group_ratio: { default: 1 },
        success: true,
        usable_group: { default: true },
      })
      .mockResolvedValueOnce({
        data: [
          {
            model_name: "all-accounts-refetched-model",
            quota_type: 0,
            model_ratio: 1,
            model_price: 1,
            completion_ratio: 1,
            enable_groups: ["default"],
            supported_endpoint_types: [],
          },
        ],
        group_ratio: { default: 1 },
        success: true,
        usable_group: { default: true },
      })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const account = createDisplayAccount({
      id: "query-key-scope-account",
      name: "Query Key Scope Account",
      baseUrl: "https://query-key-scope.example.invalid",
      userId: "query-key-user",
    })
    const cacheKey = [
      account.id,
      account.baseUrl,
      account.userId,
      account.siteType,
      account.authType,
    ].join("|")
    type HookProps = {
      selectedSource: ModelManagementSource
      accounts: DisplaySiteData[]
    }
    const initialProps: HookProps = {
      selectedSource: createAccountSource(account),
      accounts: [account],
    }

    const { result, rerender } = renderHook(
      ({ selectedSource, accounts }: HookProps) =>
        useModelData({
          selectedSource,
          accounts,
        }),
      {
        initialProps,
        wrapper: createWrapper(),
      },
    )

    await waitFor(
      () => {
        expect(result.current.pricingData?.data[0]?.model_name).toBe(
          "single-account-cached-model",
        )
      },
      { timeout: 3000 },
    )
    await modelPricingCache.invalidate(cacheKey)

    rerender({
      selectedSource: createAllAccountsSource(),
      accounts: [account],
    })

    await waitFor(
      () => {
        expect(result.current.pricingContexts).toEqual([
          {
            account,
            pricing: expect.objectContaining({
              data: [
                expect.objectContaining({
                  model_name: "all-accounts-refetched-model",
                }),
              ],
            }),
            sourceIdentity: {
              kind: "account",
              id: "query-key-scope-account",
            },
          },
        ])
      },
      { timeout: 3000 },
    )

    expect(fetchPricing).toHaveBeenCalledTimes(2)
    expect(result.current.loadErrorMessage).toBeNull()
  })

  it("tracks single-account pricing load success with model-count insight once", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockResolvedValue({
      data: [
        {
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 1,
          model_price: 1,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        },
        {
          model_name: "claude-sonnet",
          quota_type: 0,
          model_ratio: 1,
          model_price: 1,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: true },
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const account = createDisplayAccount({
      id: "analytics-single-success",
      name: "Private Account",
      baseUrl: "https://private.example.com",
      token: "sk-secret",
      userId: "71",
    })

    const { rerender } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(
          1,
        )
      },
      { timeout: 3000 },
    )
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
      modelCount: 2,
      siteType: SITE_TYPES.UNKNOWN,
      requestedAuthMode: AuthTypeEnum.AccessToken,
      cacheHit: false,
    })

    rerender()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(1)
  })

  it("tracks single-account invalid-format load as validation failure", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockResolvedValue({
      data: null,
      group_ratio: {},
      success: true,
      usable_group: {},
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const account = createDisplayAccount({
      id: "analytics-invalid-format",
      baseUrl: "https://invalid-format.example.com",
      userId: "72",
    })

    renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(
          1,
        )
      },
      { timeout: 3000 },
    )
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
      failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
      siteType: SITE_TYPES.UNKNOWN,
      requestedAuthMode: AuthTypeEnum.AccessToken,
    })
  })

  it("tracks all-account aggregate load as failure when any account fails", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockImplementation(({ accountId }) => {
      if (accountId === "analytics-all-success") {
        return Promise.resolve({
          data: [
            {
              model_name: "gpt-4o-mini",
              quota_type: 0,
              model_ratio: 1,
              model_price: 1,
              completion_ratio: 1,
              enable_groups: ["default"],
              supported_endpoint_types: [],
            },
          ],
          group_ratio: { default: 1 },
          success: true,
          usable_group: { default: true },
        })
      }

      return Promise.reject(new Error("private backend failure"))
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const accounts = [
      createDisplayAccount({
        id: "analytics-all-success",
        baseUrl: "https://all-success.example.com",
        userId: "73",
      }),
      createDisplayAccount({
        id: "analytics-all-failure",
        baseUrl: "https://all-failure.example.com",
        userId: "74",
      }),
    ]

    renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(
          1,
        )
      },
      { timeout: 3000 },
    )
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
      modelCount: 1,
      successCount: 1,
      failureCount: 1,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
    })
  })

  it("classifies all-account browser fetch exceptions as network failures", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockImplementation(({ accountId }) => {
      if (accountId === "analytics-all-success") {
        return Promise.resolve({
          data: [
            {
              model_name: "gpt-4o-mini",
              quota_type: 0,
              model_ratio: 1,
              model_price: 1,
              completion_ratio: 1,
              enable_groups: ["default"],
              supported_endpoint_types: [],
            },
          ],
          group_ratio: { default: 1 },
          success: true,
          usable_group: { default: true },
        })
      }

      return Promise.reject(new TypeError("Failed to fetch"))
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const accounts = [
      createDisplayAccount({
        id: "analytics-all-success",
        baseUrl: "https://all-success.example.com",
        userId: "75",
      }),
      createDisplayAccount({
        id: "analytics-all-network-failure",
        baseUrl: "https://all-network-failure.example.com",
        userId: "76",
      }),
    ]

    renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(
          1,
        )
      },
      { timeout: 3000 },
    )
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
      modelCount: 1,
      successCount: 1,
      failureCount: 1,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.NetworkUnreachable,
    })
  })

  it("tracks all-account invalid-format aggregate load as validation parse failure", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockImplementation(({ accountId }) => {
      if (accountId === "analytics-all-valid") {
        return Promise.resolve({
          data: [
            {
              model_name: "gpt-4o-mini",
              quota_type: 0,
              model_ratio: 1,
              model_price: 1,
              completion_ratio: 1,
              enable_groups: ["default"],
              supported_endpoint_types: [],
            },
          ],
          group_ratio: { default: 1 },
          success: true,
          usable_group: { default: true },
        })
      }

      return Promise.resolve({
        data: null,
        group_ratio: {},
        success: true,
        usable_group: {},
      })
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const accounts = [
      createDisplayAccount({
        id: "analytics-all-valid",
        baseUrl: "https://all-valid.example.com",
        userId: "81",
      }),
      createDisplayAccount({
        id: "analytics-all-invalid-format",
        baseUrl: "https://all-invalid-format.example.com",
        userId: "82",
      }),
    ]

    renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(
          1,
        )
      },
      { timeout: 3000 },
    )
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
      modelCount: 1,
      successCount: 1,
      failureCount: 1,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
      failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
    })
  })

  it("tracks all-account aggregate diagnostics from the same parse failure", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockImplementation(({ accountId }) => {
      if (accountId === "analytics-all-auth-failure") {
        return Promise.reject(
          new ApiError(
            "private auth failure",
            401,
            "https://private.example.com/api/pricing",
            API_ERROR_CODES.HTTP_401,
          ),
        )
      }

      return Promise.resolve({
        data: null,
        group_ratio: {},
        success: true,
        usable_group: {},
      })
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const accounts = [
      createDisplayAccount({
        id: "analytics-all-auth-failure",
        baseUrl: "https://all-auth-failure.example.com",
        userId: "91",
      }),
      createDisplayAccount({
        id: "analytics-all-invalid-format",
        baseUrl: "https://all-invalid-format.example.com",
        userId: "92",
      }),
    ]

    renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(
          1,
        )
      },
      { timeout: 3000 },
    )
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
      modelCount: 0,
      successCount: 0,
      failureCount: 2,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
      failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
    })
  })

  it("tracks profile catalog load success and failure without profile details", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    mockFetchApiCredentialModelIds
      .mockResolvedValueOnce(["gpt-4o-mini", "claude-sonnet"])
      .mockRejectedValueOnce(new Error("private profile error"))

    const profileSource = createProfileSource({
      id: "profile-analytics",
      name: "Private Profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    const { rerender } = renderHook(
      ({ source }) =>
        useModelData({
          selectedSource: source,
          accounts: [],
        }),
      {
        initialProps: { source: profileSource },
        wrapper: createWrapper(),
      },
    )

    await waitFor(() => {
      expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(1)
    })
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelProfile,
      modelCount: 2,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
    })

    rerender({
      source: createProfileSource({
        ...profileSource.profile,
        updatedAt: 3,
      }),
    })

    await waitFor(
      () => {
        expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(
          2,
        )
      },
      { timeout: 3000 },
    )
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelProfile,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
    })
  })

  it("passes React Query abort signals to profile catalog model fetches", async () => {
    let receivedSignal: AbortSignal | undefined
    mockFetchApiCredentialModelIds.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise<string[]>((resolve) => {
          abortSignal?.addEventListener("abort", () => resolve([]), {
            once: true,
          })
        })
      },
    )

    const profileSource = createProfileSource({
      id: "profile-cancel",
      name: "Cancelable Profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    const initialProps: { source: ModelManagementSource | null } = {
      source: profileSource,
    }
    const { rerender } = renderHook(
      ({ source }: { source: ModelManagementSource | null }) =>
        useModelData({
          selectedSource: source,
          accounts: [],
        }),
      {
        initialProps,
        wrapper: createWrapper(),
      },
    )

    await waitFor(() => expect(receivedSignal).toBeDefined())

    rerender({ source: null })

    expect(receivedSignal?.aborted).toBe(true)
  })

  it("tracks fallback catalog success and failure with sanitized source kind", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const fallbackToken = {
      id: 8,
      user_id: 75,
      key: "sk-only",
      status: 1,
      name: "Private token",
      created_time: 0,
      accessed_time: 0,
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    }

    mockFetchDisplayAccountTokens.mockResolvedValue([fallbackToken])
    mockLoadAccountRuntimeKeyFallbackPricingResponse
      .mockResolvedValueOnce({
        data: [
          {
            model_name: "fallback-model",
            quota_type: 0,
            model_ratio: 0,
            model_price: 0,
            completion_ratio: 1,
            enable_groups: [],
            supported_endpoint_types: [],
          },
        ],
        group_ratio: {},
        success: true,
        usable_group: {},
      })
      .mockRejectedValueOnce(new Error("private fallback error"))

    const account = createDisplayAccount({
      id: "analytics-fallback-account",
      baseUrl: "https://fallback-analytics.example.com",
      token: "access-token",
      userId: "75",
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.accountFallback?.selectedRuntimeKeyId).toBe(
          "account_token:analytics-fallback-account:8",
        )
      },
      { timeout: 3000 },
    )

    mockTrackProductAnalyticsActionCompleted.mockClear()
    await act(async () => {
      await result.current.accountFallback?.loadCatalog()
    })

    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelFallbackCatalog,
      modelCount: 1,
      fallbackAvailable: true,
      fallbackUsed: true,
    })

    await act(async () => {
      await result.current.accountFallback?.loadCatalog()
    })

    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelFallbackCatalog,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
      fallbackAvailable: true,
      fallbackUsed: true,
    })
  })

  it("refetches single-account pricing when site or auth type changes", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            model_name: "access-token-model",
            quota_type: 0,
            model_ratio: 1,
            model_price: 1,
            completion_ratio: 1,
            enable_groups: ["default"],
            supported_endpoint_types: [],
          },
        ],
        group_ratio: { default: 1 },
        success: true,
        usable_group: { default: true },
      })
      .mockResolvedValueOnce({
        data: [
          {
            model_name: "cookie-model",
            quota_type: 0,
            model_ratio: 1,
            model_price: 1,
            completion_ratio: 1,
            enable_groups: ["default"],
            supported_endpoint_types: [],
          },
        ],
        group_ratio: { default: 1 },
        success: true,
        usable_group: { default: true },
      })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const firstAccount = createDisplayAccount({
      id: "credential-change-account",
      baseUrl: "https://credential-change.example.com",
      userId: "61",
      siteType: SITE_TYPES.UNKNOWN,
      authType: AuthTypeEnum.AccessToken,
    })
    const secondAccount = createDisplayAccount({
      id: "credential-change-account",
      baseUrl: "https://credential-change.example.com",
      userId: "61",
      siteType: "new-api",
      authType: AuthTypeEnum.Cookie,
      cookieAuthSessionCookie: "session=updated",
    })

    type HookProps = {
      selectedSource: ReturnType<typeof createAccountSource>
      accounts: DisplaySiteData[]
    }

    const { result, rerender } = renderHook(
      ({ selectedSource, accounts }: HookProps) =>
        useModelData({
          selectedSource,
          accounts,
        }),
      {
        initialProps: {
          selectedSource: createAccountSource(firstAccount),
          accounts: [firstAccount],
        },
        wrapper: createWrapper(),
      },
    )

    await waitFor(() => {
      expect(fetchPricing).toHaveBeenCalledTimes(1)
      expect(result.current.pricingData?.data[0]?.model_name).toBe(
        "access-token-model",
      )
    })

    rerender({
      selectedSource: createAccountSource(secondAccount),
      accounts: [secondAccount],
    })

    await waitFor(() => {
      expect(fetchPricing).toHaveBeenCalledTimes(2)
      expect(fetchPricing).toHaveBeenLastCalledWith(
        expect.objectContaining({
          accountId: "credential-change-account",
          auth: expect.objectContaining({
            authType: AuthTypeEnum.Cookie,
            cookie: "session=updated",
          }),
        }),
      )
      expect(result.current.pricingData?.data[0]?.model_name).toBe(
        "cookie-model",
      )
    })
  })

  it("uses cached single-account pricing scoped by site and auth type", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const account = createDisplayAccount({
      id: "cached-pricing-account",
      baseUrl: "https://cached-pricing.example.com",
      userId: "64",
      siteType: "new-api",
      authType: AuthTypeEnum.Cookie,
      cookieAuthSessionCookie: "session=cached",
    })
    const cacheKey = [
      account.id,
      account.baseUrl,
      account.userId,
      account.siteType,
      account.authType,
    ].join("|")
    const cachedPricing = {
      data: [
        {
          model_name: "cached-model",
          quota_type: 0,
          model_ratio: 1,
          model_price: 1,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: "default" },
    }

    await modelPricingCache.invalidate(cacheKey)
    await modelPricingCache.set(cacheKey, cachedPricing)

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.pricingData?.data[0]?.model_name).toBe(
        "cached-model",
      )
    })
    expect(fetchPricing).not.toHaveBeenCalled()
    expectLastModelDataAnalyticsCompletion({
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
      modelCount: 1,
      siteType: "new-api",
      requestedAuthMode: AuthTypeEnum.Cookie,
      cacheHit: true,
    })

    await modelPricingCache.invalidate(cacheKey)
  })

  it("does not return cached pricing before account-source readiness allows direct pricing", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("fetch should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
    } as any)

    const account = createDisplayAccount({
      id: "cached-unsupported-sub2api",
      baseUrl: "https://cached-sub2api.example.com",
      siteType: SITE_TYPES.SUB2API,
      userId: "cached-sub2api-user",
    })
    const cacheKey = [
      account.id,
      account.baseUrl,
      account.userId,
      account.siteType,
      account.authType,
    ].join("|")

    await modelPricingCache.invalidate(cacheKey)
    await modelPricingCache.set(cacheKey, {
      data: [
        {
          model_name: "stale-sub2api-model",
          quota_type: 0,
          model_ratio: 1,
          model_price: 1,
          completion_ratio: 1,
          enable_groups: ["default"],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: "default" },
    })

    try {
      const { result } = renderHook(
        () =>
          useModelData({
            selectedSource: createAccountSource(account),
            accounts: [account],
          }),
        { wrapper: createWrapper() },
      )

      await waitFor(() => {
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailed",
        )
      })
      expect(fetchPricing).not.toHaveBeenCalled()
      expect(mockFetchDisplayAccountTokens).not.toHaveBeenCalled()
      expect(result.current.pricingData).toBeNull()
    } finally {
      await modelPricingCache.invalidate(cacheKey)
    }
  })

  it("uses token-scoped runtime catalog readiness in all-accounts mode", async () => {
    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("common pricing should not be called"))
    const runtimePricing = {
      data: [
        {
          model_name: "runtime-model",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: {},
      success: true,
      usable_group: {},
    }

    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
      account: {
        modelCatalog: {
          fetchModels: vi.fn().mockResolvedValue(["runtime-model"]),
        },
      },
    } as any)
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([
      {
        id: 10,
        user_id: 10,
        key: "sk-runtime-masked",
        status: 1,
        name: "Runtime Key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockResolvedValueOnce(
      runtimePricing,
    )

    const account = createDisplayAccount({
      id: "sub2api-readiness-all-accounts",
      name: "Sub2API Readiness",
      baseUrl: "https://sub2api-readiness.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      userId: "sub2api-readiness-user",
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(
        result.current.pricingContexts[0]?.pricing.data[0]?.model_name,
      ).toBe("runtime-model")
    })
    expect(fetchPricing).not.toHaveBeenCalled()
    expect(
      mockLoadAccountRuntimeKeyFallbackPricingResponse,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        runtimeKey: expect.objectContaining({
          id: "account_token:sub2api-readiness-all-accounts:10",
          label: "Runtime Key",
          token: expect.objectContaining({ id: 10 }),
        }),
        abortSignal: expect.anything(),
      }),
    )
  })

  it("loads all-accounts service-credential runtime keys without legacy token fallback", async () => {
    const runtimePricing = {
      data: [
        {
          model_name: "codex-runtime-model",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: {},
      success: true,
      usable_group: {},
    }
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        modelCatalog: {
          fetchModels: vi.fn().mockResolvedValue(["codex-runtime-model"]),
        },
        serviceCredential: {
          fetch: vi.fn(),
        },
      },
    } as any)

    const account = createDisplayAccount({
      id: "sharedchat-all-accounts-runtime",
      name: "SharedChat",
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://sharedchat.example.invalid",
      authType: AuthTypeEnum.Cookie,
      token: "",
      cookieAuthSessionCookie: "connect.sid=redacted",
      userId: "12672",
    })
    const runtimeKey = {
      id: "service_credential:sharedchat-all-accounts-runtime:codex",
      source: "service_credential",
      account,
      accountId: account.id,
      accountName: account.name,
      siteType: account.siteType,
      label: "Codex",
      secret: "sk-sharedchat-codex",
      baseUrl: "https://sharedchat.example.invalid",
      status: "active",
      capabilities: {
        copy: true,
        export: true,
        verify: true,
        fetchRuntimeModels: true,
        rotate: false,
        updateToken: false,
        deleteToken: false,
      },
      service: "codex",
      credential: {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "sk-sharedchat-codex",
        isAuthenticated: true,
        baseUrl: "https://sharedchat.example.invalid",
      },
    }
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValueOnce([runtimeKey])
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockResolvedValueOnce(
      runtimePricing,
    )

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.pricingContexts).toHaveLength(1)
    })

    expect(mockFetchDisplayAccountRuntimeKeys).toHaveBeenCalledWith(account)
    expect(mockFetchDisplayAccountTokens).not.toHaveBeenCalled()
    expect(
      mockLoadAccountRuntimeKeyFallbackPricingResponse,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        runtimeKey,
        abortSignal: expect.anything(),
      }),
    )
    expect(result.current.pricingContexts[0]).toEqual({
      account,
      pricing: runtimePricing,
      sourceIdentity: {
        kind: "account-runtime-key",
        id: "sharedchat-all-accounts-runtime:runtime-key:service_credential:sharedchat-all-accounts-runtime:codex",
        runtimeKeyId:
          "service_credential:sharedchat-all-accounts-runtime:codex",
        runtimeKeyName: "Codex",
      },
    })
  })

  it("loads Sub2API selected-key fallback runtime models without enabling common pricing", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("common pricing should not be called"))
    const sub2apiAdapter = createMockSiteTypeCapabilities(fetchPricing, {
      siteType: SITE_TYPES.SUB2API,
      modelPricing: false,
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(sub2apiAdapter)

    const account = createDisplayAccount({
      id: "sub2api-runtime-fallback-account",
      baseUrl: "https://sub2api.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      userId: "sub2api-runtime-user",
    })
    const fallbackTokens = [
      {
        id: 17,
        user_id: 17,
        key: "sk-sub2api-other-masked",
        status: 1,
        name: "Other runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 18,
        user_id: 18,
        key: "sk-sub2api-masked",
        status: 1,
        name: "Runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]

    mockFetchDisplayAccountTokens.mockResolvedValue(fallbackTokens)
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockResolvedValueOnce({
      data: [
        {
          model_name: "example-runtime-model",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.NONE,
            precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
          },
        },
      ],
      group_ratio: {},
      success: true,
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
        provider: SITE_TYPES.SUB2API,
        supportsRuntimeModelList: true,
        supportsPricing: false,
      },
    })

    const selectedSource = createAccountSource(account)
    expect(sub2apiAdapter.modelPricing).toBeUndefined()
    expect(selectedSource.capabilities.supportsPricing).toBe(true)

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource,
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockFetchDisplayAccountTokens).toHaveBeenCalledWith(account)
      },
      { timeout: 3000 },
    )
    expect(result.current.loadErrorMessage).toBeNull()
    expect(fetchPricing).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(result.current.accountFallback?.selectedRuntimeKeyId).toBeNull()
      expect(result.current.accountFallback?.statusScope).toBe("runtime-key")
      expect(result.current.accountFallback?.runtimeKeys).toEqual([
        expect.objectContaining({
          id: "account_token:sub2api-runtime-fallback-account:17",
          token: expect.objectContaining({ id: fallbackTokens[0].id }),
        }),
        expect.objectContaining({
          id: "account_token:sub2api-runtime-fallback-account:18",
          token: expect.objectContaining({ id: fallbackTokens[1].id }),
        }),
      ])
    })

    expect(
      mockLoadAccountRuntimeKeyFallbackPricingResponse,
    ).not.toHaveBeenCalled()

    act(() => {
      result.current.accountFallback?.setSelectedRuntimeKeyId(
        "account_token:sub2api-runtime-fallback-account:18",
      )
    })

    await waitFor(() => {
      expect(result.current.accountFallback?.selectedRuntimeKeyId).toBe(
        "account_token:sub2api-runtime-fallback-account:18",
      )
    })

    await act(async () => {
      await result.current.accountFallback?.loadCatalog()
    })

    await waitFor(() => {
      expect(
        mockLoadAccountRuntimeKeyFallbackPricingResponse,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          account,
          runtimeKey: expect.objectContaining({
            id: "account_token:sub2api-runtime-fallback-account:18",
            token: expect.objectContaining({ id: fallbackTokens[1].id }),
          }),
          abortSignal: expect.anything(),
        }),
      )
      expect(result.current.accountFallback?.isActive).toBe(true)
    })
    expect(result.current.pricingData).toEqual(
      expect.objectContaining({
        model_list_source: {
          kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
          provider: SITE_TYPES.SUB2API,
          supportsRuntimeModelList: true,
          supportsPricing: false,
        },
        data: [
          expect.objectContaining({
            model_name: "example-runtime-model",
            price_metadata: {
              source: MODEL_PRICE_SOURCE_KINDS.NONE,
              precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
              unavailable_reason:
                MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
            },
          }),
        ],
      }),
    )
    expect(result.current.pricingContexts).toEqual([
      {
        account,
        pricing: expect.objectContaining({
          data: [
            expect.objectContaining({
              model_name: "example-runtime-model",
            }),
          ],
        }),
        sourceIdentity: {
          kind: "account-runtime-key",
          id: "sub2api-runtime-fallback-account:runtime-key:account_token:sub2api-runtime-fallback-account:18",
          runtimeKeyId: "account_token:sub2api-runtime-fallback-account:18",
          runtimeKeyName: "Runtime key",
        },
      },
    ])
  })

  it("loads SharedChat Codex service credentials as token-scoped fallback keys", async () => {
    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("account pricing should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        modelCatalog: {
          fetchModels: vi.fn(),
        },
        serviceCredential: {
          fetch: vi.fn(),
        },
      },
    } as any)
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([
      {
        id: -1,
        name: "Codex",
        key: "sk-sharedchat-codex",
        status: 1,
        user_id: 12672,
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: false,
        used_quota: 0,
      },
    ])

    const account = createDisplayAccount({
      id: "sharedchat-runtime-fallback-account",
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://new.sharedchat.cc",
      authType: AuthTypeEnum.Cookie,
      token: "",
      cookieAuthSessionCookie: "connect.sid=redacted",
      userId: "12672",
    })
    const selectedSource = createAccountSource(account)
    expect(selectedSource.capabilities.supportsPricing).toBe(true)

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource,
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.accountFallback?.runtimeKeys).toEqual([
        expect.objectContaining({
          id: "account_token:sharedchat-runtime-fallback-account:-1",
          label: "Codex",
          secret: "sk-sharedchat-codex",
          status: "active",
        }),
      ])
    })

    expect(result.current.accountFallback?.isAvailable).toBe(true)
    expect(result.current.accountFallback?.selectedRuntimeKeyId).toBe(
      "account_token:sharedchat-runtime-fallback-account:-1",
    )
    expect(fetchPricing).not.toHaveBeenCalled()
    expect(mockFetchDisplayAccountTokens).toHaveBeenCalledWith(account)
  })

  it("keeps New API direct-pricing failures account-scoped instead of token fallback-scoped", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("direct pricing failed"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )
    const account = createDisplayAccount({
      id: "new-api-direct-failure",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://new-api-direct-failure.example.invalid",
      userId: "new-api-user",
    })
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([])

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailed",
        )
      },
      { timeout: 3000 },
    )
    await waitFor(() => {
      expect(result.current.accountFallback?.statusScope).toBe("account")
    })
    expect(fetchPricing).toHaveBeenCalled()
    expect(mockFetchDisplayAccountTokens).toHaveBeenCalledWith(account)
  })

  it("excludes inactive runtime keys from single-account fallback loading", async () => {
    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("account pricing should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-single-active-only",
      name: "Sub2API Single Active Only",
      baseUrl: "https://sub2api-single-active-only.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([
      {
        id: 31,
        user_id: 31,
        key: "sk-inactive",
        status: 2,
        name: "Inactive runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 32,
        user_id: 32,
        key: "sk-active",
        status: 1,
        name: "Active runtime key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.accountFallback?.runtimeKeys).toEqual([
        expect.objectContaining({
          id: "account_token:sub2api-single-active-only:32",
          label: "Active runtime key",
        }),
      ])
    })
    expect(result.current.accountFallback?.selectedRuntimeKeyId).toBe(
      "account_token:sub2api-single-active-only:32",
    )
  })

  it("auto-loads Sub2API runtime models when a single fallback key is available", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("common pricing should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-auto-runtime-account",
      baseUrl: "https://sub2api-auto.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      userId: "sub2api-auto-user",
    })
    const fallbackToken = {
      id: 19,
      user_id: 19,
      key: "sk-sub2api-auto-masked",
      status: 1,
      name: "Only runtime key",
      created_time: 0,
      accessed_time: 0,
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    }
    const fallbackPricing = {
      data: [
        {
          model_name: "example-runtime-auto-model",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.NONE,
            precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
          },
        },
      ],
      group_ratio: {},
      success: true,
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
        provider: SITE_TYPES.SUB2API,
        supportsRuntimeModelList: true,
        supportsPricing: false,
      },
    }

    mockFetchDisplayAccountTokens.mockResolvedValue([fallbackToken])
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockResolvedValueOnce(
      fallbackPricing,
    )

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockFetchDisplayAccountTokens).toHaveBeenCalledWith(account)
      },
      { timeout: 3000 },
    )

    await waitFor(
      () => {
        expect(
          mockLoadAccountRuntimeKeyFallbackPricingResponse,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            account,
            runtimeKey: expect.objectContaining({
              id: "account_token:sub2api-auto-runtime-account:19",
              token: expect.objectContaining({ id: fallbackToken.id }),
            }),
            abortSignal: expect.anything(),
          }),
        )
      },
      { timeout: 3000 },
    )

    await waitFor(() => {
      expect(result.current.accountFallback?.isActive).toBe(true)
      expect(result.current.accountFallback?.statusScope).toBe("runtime-key")
      expect(result.current.pricingData).toEqual(fallbackPricing)
    })
    expect(fetchPricing).not.toHaveBeenCalled()
    expect(result.current.loadErrorMessage).toBeNull()
  })

  it("refreshes an active Sub2API runtime fallback catalog with the selected key", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("common pricing should not be called"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )

    const account = createDisplayAccount({
      id: "sub2api-refresh-runtime-account",
      baseUrl: "https://sub2api-refresh.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      userId: "sub2api-refresh-user",
    })
    const fallbackToken = {
      id: 20,
      user_id: 20,
      key: "sk-sub2api-refresh-masked",
      status: 1,
      name: "Runtime refresh key",
      created_time: 0,
      accessed_time: 0,
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    }
    const createFallbackPricing = (modelName: string) => ({
      data: [
        {
          model_name: modelName,
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: {},
      success: true,
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
        provider: SITE_TYPES.SUB2API,
        supportsRuntimeModelList: true,
        supportsPricing: false,
      },
    })

    mockFetchDisplayAccountTokens.mockResolvedValue([fallbackToken])
    mockLoadAccountRuntimeKeyFallbackPricingResponse
      .mockResolvedValueOnce(createFallbackPricing("stale-runtime-model"))
      .mockResolvedValueOnce(createFallbackPricing("fresh-runtime-model"))

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(
          mockLoadAccountRuntimeKeyFallbackPricingResponse,
        ).toHaveBeenCalledTimes(1)
        expect(result.current.pricingData?.data[0]?.model_name).toBe(
          "stale-runtime-model",
        )
      },
      { timeout: 3000 },
    )

    await act(async () => {
      await result.current.loadPricingData()
    })

    await waitFor(() => {
      expect(
        mockLoadAccountRuntimeKeyFallbackPricingResponse,
      ).toHaveBeenCalledTimes(2)
      expect(result.current.pricingData?.data[0]?.model_name).toBe(
        "fresh-runtime-model",
      )
    })
    expect(
      mockLoadAccountRuntimeKeyFallbackPricingResponse,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        account,
        runtimeKey: expect.objectContaining({
          id: "account_token:sub2api-refresh-runtime-account:20",
          token: expect.objectContaining({ id: fallbackToken.id }),
        }),
        abortSignal: expect.anything(),
      }),
    )
    expect(fetchPricing).not.toHaveBeenCalled()
  })

  it("marks all-account queries as loading before each account returns data", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const firstDeferred = createDeferred<{
      data: never[]
      group_ratio: Record<string, never>
      success: true
      usable_group: Record<string, never>
    }>()
    const secondDeferred = createDeferred<{
      data: never[]
      group_ratio: Record<string, never>
      success: true
      usable_group: Record<string, never>
    }>()
    const fetchPricing = vi.fn().mockImplementation(({ accountId }) => {
      return accountId === "a" ? firstDeferred.promise : secondDeferred.promise
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const accounts = [
      createDisplayAccount({
        id: "a",
        baseUrl: "https://a.example.com",
        userId: "1",
      }),
      createDisplayAccount({
        id: "b",
        baseUrl: "https://b.example.com",
        userId: "2",
      }),
    ]

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.accountQueryStates).toEqual([
        expect.objectContaining({
          account: expect.objectContaining({ id: "a" }),
          isLoading: true,
          hasData: false,
          hasError: false,
          errorType: undefined,
        }),
        expect.objectContaining({
          account: expect.objectContaining({ id: "b" }),
          isLoading: true,
          hasData: false,
          hasError: false,
          errorType: undefined,
        }),
      ])
    })

    await act(async () => {
      firstDeferred.resolve({
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
      })
      secondDeferred.resolve({
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
      })
      await Promise.all([firstDeferred.promise, secondDeferred.promise])
    })

    await waitFor(() => {
      expect(result.current.accountQueryStates).toEqual([
        expect.objectContaining({
          account: expect.objectContaining({ id: "a" }),
          isLoading: false,
          hasData: true,
          hasError: false,
          errorType: undefined,
        }),
        expect.objectContaining({
          account: expect.objectContaining({ id: "b" }),
          isLoading: false,
          hasData: true,
          hasError: false,
          errorType: undefined,
        }),
      ])
    })
  })

  it("loads a profile-backed model catalog without a SiteAccount", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    const fetchPricing = vi.fn()
    const mockedgetSiteTypeCapabilities = vi.mocked(getSiteTypeCapabilities)
    mockedgetSiteTypeCapabilities.mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )
    mockFetchApiCredentialModelIds.mockResolvedValueOnce([
      "gpt-4o-mini",
      "claude-3-5-sonnet",
    ])

    const profileSource = createProfileSource({
      id: "profile-1",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: profileSource,
          accounts: [],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(mockFetchApiCredentialModelIds).toHaveBeenCalledWith(
        expect.objectContaining({
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://profile.example.com",
          apiKey: "sk-secret",
          abortSignal: expect.anything(),
        }),
      ),
    )

    await waitFor(() =>
      expect(result.current.pricingData?.data).toHaveLength(2),
    )

    expect(
      result.current.pricingData?.data.map((item) => item.model_name),
    ).toEqual(["gpt-4o-mini", "claude-3-5-sonnet"])
    expect(fetchPricing).not.toHaveBeenCalled()
  })

  it("clears single-account errors when the query becomes idle", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const account = createDisplayAccount({
      id: "error-account",
      baseUrl: "https://error.example.com",
      userId: "9",
    })
    type HookProps = {
      selectedSource: ReturnType<typeof createAccountSource> | null
    }
    const initialProps: HookProps = {
      selectedSource: createAccountSource(account),
    }

    const { result, rerender } = renderHook(
      ({ selectedSource }: HookProps) =>
        useModelData({
          selectedSource,
          accounts: [account],
        }),
      {
        initialProps,
        wrapper: createWrapper(),
      },
    )

    await waitFor(
      () => {
        expect(result.current.loadErrorMessage).not.toBeNull()
      },
      { timeout: 3000 },
    )

    rerender({ selectedSource: null })

    await waitFor(() => {
      expect(result.current.loadErrorMessage).toBeNull()
      expect(result.current.dataFormatError).toBe(false)
    })
  })

  it("loads an account-key fallback catalog after a single-account failure", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const account = createDisplayAccount({
      id: "fallback-account",
      baseUrl: "https://fallback.example.com",
      userId: "11",
    })

    const fallbackTokens = [
      {
        id: 1,
        user_id: 11,
        key: "sk-first",
        status: 1,
        name: "First key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 2,
        user_id: 11,
        key: "sk-second",
        status: 1,
        name: "Second key",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ]

    mockFetchDisplayAccountTokens.mockResolvedValueOnce(fallbackTokens)
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockResolvedValueOnce({
      data: [
        {
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: {},
      success: true,
      usable_group: {},
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(fetchPricing).toHaveBeenCalledTimes(1)
    })
    await waitFor(
      () => {
        expect(toastErrorMock).toHaveBeenCalledWith(
          "modelList:status.loadFailed",
        )
      },
      { timeout: 3000 },
    )

    await waitFor(() => {
      expect(mockFetchDisplayAccountTokens).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(result.current.accountFallback?.runtimeKeys).toHaveLength(2)
    })

    expect(result.current.accountFallback?.selectedRuntimeKeyId).toBeNull()

    act(() => {
      result.current.accountFallback?.setSelectedRuntimeKeyId(
        "account_token:fallback-account:2",
      )
    })
    await act(async () => {
      await result.current.accountFallback?.loadCatalog()
    })

    await waitFor(() => {
      expect(
        mockLoadAccountRuntimeKeyFallbackPricingResponse,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          account,
          runtimeKey: expect.objectContaining({
            id: "account_token:fallback-account:2",
            token: expect.objectContaining({ id: fallbackTokens[1].id }),
          }),
          abortSignal: expect.anything(),
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.accountFallback?.isActive).toBe(true)
    })

    expect(result.current.loadErrorMessage).toBeNull()
    expect(
      result.current.pricingData?.data.map((item) => item.model_name),
    ).toEqual(["gpt-4o-mini"])
  })

  it("refreshes an active account-key fallback catalog instead of retrying direct pricing", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const account = createDisplayAccount({
      id: "fallback-reset-account",
      baseUrl: "https://fallback-reset.example.com",
      userId: "15",
    })

    const fallbackToken = {
      id: 7,
      user_id: 15,
      key: "sk-only",
      status: 1,
      name: "Only key",
      created_time: 0,
      accessed_time: 0,
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    }

    mockFetchDisplayAccountTokens.mockResolvedValueOnce([fallbackToken])
    const createFallbackPricing = (modelName: string) => ({
      data: [
        {
          model_name: modelName,
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        },
      ],
      group_ratio: {},
      success: true,
      usable_group: {},
    })
    mockLoadAccountRuntimeKeyFallbackPricingResponse
      .mockResolvedValueOnce(createFallbackPricing("stale-fallback-model"))
      .mockResolvedValueOnce(createFallbackPricing("fresh-fallback-model"))

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(fetchPricing).toHaveBeenCalledTimes(1)
    })
    await waitFor(
      () => {
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailed",
        )
      },
      { timeout: 3000 },
    )
    await waitFor(
      () => {
        expect(mockFetchDisplayAccountTokens).toHaveBeenCalledTimes(1)
      },
      { timeout: 3000 },
    )
    await waitFor(() => {
      expect(result.current.accountFallback?.selectedRuntimeKeyId).toBe(
        "account_token:fallback-reset-account:7",
      )
    })

    await act(async () => {
      await result.current.accountFallback?.loadCatalog()
    })
    await waitFor(() => {
      expect(result.current.accountFallback?.isActive).toBe(true)
    })
    expect(result.current.pricingData?.data[0]?.model_name).toBe(
      "stale-fallback-model",
    )
    const pricingCallCountBeforeRefresh = fetchPricing.mock.calls.length

    await act(async () => {
      await result.current.loadPricingData()
    })

    await waitFor(() => {
      expect(
        mockLoadAccountRuntimeKeyFallbackPricingResponse,
      ).toHaveBeenCalledTimes(2)
    })

    expect(result.current.loadErrorMessage).toBeNull()
    expect(result.current.accountFallback?.isActive).toBe(true)
    expect(
      result.current.pricingData?.data.map((item) => item.model_name),
    ).toEqual(["fresh-fallback-model"])
    expect(fetchPricing).toHaveBeenCalledTimes(pricingCallCountBeforeRefresh)
  })

  it("discards stale fallback token results after switching accounts", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const deferredTokens = createDeferred<any[]>()
    const fetchPricing = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
      })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )
    mockFetchDisplayAccountTokens.mockReturnValueOnce(deferredTokens.promise)

    const firstAccount = createDisplayAccount({
      id: "first-account",
      baseUrl: "https://first.example.com",
      userId: "21",
    })
    const secondAccount = createDisplayAccount({
      id: "second-account",
      baseUrl: "https://second.example.com",
      userId: "22",
    })

    type HookProps = {
      selectedSource: ReturnType<typeof createAccountSource> | null
      accounts: DisplaySiteData[]
    }

    const { result, rerender } = renderHook(
      ({ selectedSource, accounts }: HookProps) =>
        useModelData({
          selectedSource,
          accounts,
        }),
      {
        initialProps: {
          selectedSource: createAccountSource(firstAccount),
          accounts: [firstAccount, secondAccount],
        },
        wrapper: createWrapper(),
      },
    )

    await waitFor(
      () => {
        expect(mockFetchDisplayAccountTokens).toHaveBeenCalledTimes(1)
      },
      { timeout: 3000 },
    )

    rerender({
      selectedSource: createAccountSource(secondAccount),
      accounts: [firstAccount, secondAccount],
    })

    await act(async () => {
      deferredTokens.resolve([
        {
          id: 9,
          user_id: 21,
          key: "sk-stale",
          status: 1,
          name: "Stale key",
          created_time: 0,
          accessed_time: 0,
          expired_time: -1,
          remain_quota: 0,
          unlimited_quota: true,
          used_quota: 0,
        },
      ])
      await deferredTokens.promise
    })

    await waitFor(() => {
      expect(result.current.accountFallback?.runtimeKeys).toEqual([])
      expect(result.current.accountFallback?.selectedRuntimeKeyId).toBeNull()
      expect(result.current.pricingData).toEqual({
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
      })
    })
  })

  it("aborts manual fallback catalog loading when the hook unmounts", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const fallbackToken = {
      id: 42,
      user_id: 31,
      key: "sk-fallback",
      status: 1,
      name: "Fallback key",
      created_time: 0,
      accessed_time: 0,
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    }
    let receivedSignal: AbortSignal | undefined
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([fallbackToken])
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise(() => {})
      },
    )

    const account = createDisplayAccount({
      id: "unmount-fallback-account",
      baseUrl: "https://unmount-fallback.example.com",
      userId: "31",
    })

    const { result, unmount } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.accountFallback?.isAvailable).toBe(true)
    })

    await act(async () => {
      await result.current.accountFallback?.loadRuntimeKeys()
    })

    await waitFor(() => {
      expect(result.current.accountFallback?.runtimeKeys).toHaveLength(1)
    })

    act(() => {
      void result.current.accountFallback?.loadCatalog()
    })

    await waitFor(() => expect(receivedSignal).toBeDefined())
    unmount()

    expect(receivedSignal?.aborted).toBe(true)
  })

  it("shows the fallback key-load error when token payload normalization fails", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )
    mockFetchDisplayAccountTokens.mockRejectedValueOnce(
      new InvalidTokenPayloadError({
        accountId: "invalid-token-account",
        baseUrl: "https://invalid-token.example.com",
        siteType: SITE_TYPES.UNKNOWN,
        responseType: "object",
      }),
    )

    const account = createDisplayAccount({
      id: "invalid-token-account",
      baseUrl: "https://invalid-token.example.com",
      userId: "31",
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockFetchDisplayAccountTokens).toHaveBeenCalledTimes(1)
      },
      { timeout: 3000 },
    )
    await waitFor(
      () => {
        expect(result.current.accountFallback?.runtimeKeyLoadErrorMessage).toBe(
          "modelList:status.fallback.loadKeysFailedFallback",
        )
      },
      { timeout: 3000 },
    )
    expect(result.current.accountFallback?.runtimeKeys).toEqual([])
  })

  it("shows a generic fallback-model error when the fallback catalog load fails without details", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const fallbackToken = {
      id: 5,
      user_id: 41,
      key: "sk-only",
      status: 1,
      name: "Only key",
      created_time: 0,
      accessed_time: 0,
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    }

    mockFetchDisplayAccountTokens.mockResolvedValueOnce([fallbackToken])
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockRejectedValueOnce(
      new Error(""),
    )

    const account = createDisplayAccount({
      id: "catalog-error-account",
      baseUrl: "https://catalog-error.example.com",
      userId: "41",
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockFetchDisplayAccountTokens).toHaveBeenCalledTimes(1)
      },
      { timeout: 3000 },
    )
    await waitFor(
      () => {
        expect(result.current.accountFallback?.selectedRuntimeKeyId).toBe(
          "account_token:catalog-error-account:5",
        )
      },
      { timeout: 3000 },
    )

    await act(async () => {
      await result.current.accountFallback?.loadCatalog()
    })

    await waitFor(
      () => {
        expect(result.current.accountFallback?.catalogLoadErrorMessage).toBe(
          "modelList:status.fallback.loadModelsFailedFallback",
        )
      },
      { timeout: 3000 },
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "modelList:status.fallback.loadModelsFailedFallback",
    )
  })

  it("classifies fallback catalog structured failures without leaking details", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const fallbackToken = {
      id: 6,
      user_id: 42,
      key: "sk-only",
      status: 1,
      name: "Only key",
      created_time: 0,
      accessed_time: 0,
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: 0,
    }

    mockFetchDisplayAccountTokens.mockResolvedValueOnce([fallbackToken])
    mockLoadAccountRuntimeKeyFallbackPricingResponse.mockRejectedValueOnce(
      new Error("sanitized fallback failure", {
        cause: new ApiError(
          "private auth failure for sk-only",
          401,
          "/v1/models",
          API_ERROR_CODES.HTTP_401,
        ),
      }),
    )

    const account = createDisplayAccount({
      id: "catalog-auth-error-account",
      baseUrl: "https://catalog-auth-error.example.com",
      userId: "42",
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(mockFetchDisplayAccountTokens).toHaveBeenCalledTimes(1)
      },
      { timeout: 3000 },
    )
    await waitFor(
      () => {
        expect(result.current.accountFallback?.selectedRuntimeKeyId).toBe(
          "account_token:catalog-auth-error-account:6",
        )
      },
      { timeout: 3000 },
    )
    mockTrackProductAnalyticsActionCompleted.mockClear()

    await act(async () => {
      await result.current.accountFallback?.loadCatalog()
    })

    await waitFor(() => {
      expectLastModelDataAnalyticsCompletion({
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelFallbackCatalog,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.AuthInvalid,
        fallbackAvailable: true,
        fallbackUsed: true,
      })
    })
    expect(
      JSON.stringify(mockTrackProductAnalyticsActionCompleted.mock.calls),
    ).not.toContain("sk-only")
  })

  it("reports mixed invalid-format and load-failed states in all-accounts mode", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockImplementation(({ accountId }) => {
      if (accountId === "bad-format") {
        return Promise.resolve({
          data: null,
          group_ratio: {},
          success: true,
          usable_group: {},
        })
      }

      return Promise.reject(new Error("boom"))
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const accounts = [
      createDisplayAccount({
        id: "bad-format",
        baseUrl: "https://bad-format.example.com",
        userId: "51",
      }),
      createDisplayAccount({
        id: "load-failed",
        baseUrl: "https://load-failed.example.com",
        userId: "52",
      }),
    ]

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAllAccountsSource(),
          accounts,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.dataFormatError).toBe(true)
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailedWithReason",
        )
        expect(result.current.accountQueryStates).toEqual([
          expect.objectContaining({
            account: expect.objectContaining({ id: "bad-format" }),
            isLoading: false,
            hasData: false,
            hasError: true,
            errorType: "invalid-format",
          }),
          expect.objectContaining({
            account: expect.objectContaining({ id: "load-failed" }),
            isLoading: false,
            hasData: false,
            hasError: true,
            errorType: "load-failed",
          }),
        ])
      },
      { timeout: 3000 },
    )
  })

  it("does not load fallback tokens for single-account invalid-format responses", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchPricing = vi.fn().mockResolvedValue({
      data: null,
      group_ratio: {},
      success: true,
      usable_group: {},
    })
    vi.mocked(getSiteTypeCapabilities).mockReturnValue(
      createMockSiteTypeCapabilities(fetchPricing),
    )

    const account = createDisplayAccount({
      id: "single-invalid-format",
      baseUrl: "https://single-invalid-format.example.com",
      userId: "62",
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.dataFormatError).toBe(true)
        expect(result.current.loadErrorMessage).toBeNull()
      },
      { timeout: 3000 },
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "modelList:status.formatNotStandard",
    )
    expect(mockFetchDisplayAccountTokens).not.toHaveBeenCalled()
  })

  it("sanitizes profile load failures into a user-visible profile error", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    mockFetchApiCredentialModelIds.mockRejectedValue(new Error(""))

    const profileSource = createProfileSource({
      id: "profile-error",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: profileSource,
          accounts: [],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(
      () => {
        expect(result.current.loadErrorMessage).toBe(
          "modelList:status.loadFailed",
        )
      },
      { timeout: 3000 },
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "modelList:status.profileLoadFailed",
    )
  })
})
