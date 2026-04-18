import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useModelData } from "~/features/ModelList/hooks/useModelData"
import {
  createAccountSource,
  createAllAccountsSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import { InvalidTokenPayloadError } from "~/services/accounts/utils/apiServiceRequest"
import { getApiService } from "~/services/apiService"
import { modelPricingCache } from "~/services/models/modelPricingCache"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { testI18n } from "~~/tests/test-utils/i18n"

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

const {
  mockFetchDisplayAccountTokens,
  mockLoadAccountTokenFallbackPricingResponse,
} = vi.hoisted(() => ({
  mockFetchDisplayAccountTokens: vi.fn(),
  mockLoadAccountTokenFallbackPricingResponse: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
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
      fetchDisplayAccountTokens: (...args: unknown[]) =>
        mockFetchDisplayAccountTokens(...args),
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
      loadAccountTokenFallbackPricingResponse: (...args: unknown[]) =>
        mockLoadAccountTokenFallbackPricingResponse(...args),
    }
  },
)

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
  siteType: "default",
  baseUrl: "https://example.com",
  token: "token",
  userId: 1,
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

describe("useModelData all-accounts loading", () => {
  beforeEach(() => {
    mockFetchApiCredentialModelIds.mockReset()
    mockFetchDisplayAccountTokens.mockReset()
    mockLoadAccountTokenFallbackPricingResponse.mockReset()
    vi.mocked(getApiService).mockReset()
  })

  it("does not fetch all-account pricing until selectedAccount is 'all'", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    const fetchModelPricing = vi.fn().mockResolvedValue({
      data: [],
      group_ratio: {},
      success: true,
      usable_group: {},
    })
    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchModelPricing } as any)

    const accounts = [
      createDisplayAccount({
        id: "a",
        baseUrl: "https://a.example.com",
        userId: 1,
      }),
      createDisplayAccount({
        id: "b",
        baseUrl: "https://b.example.com",
        userId: 2,
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
    expect(fetchModelPricing).not.toHaveBeenCalled()
  })

  it("fetches all-account pricing when selectedAccount is 'all'", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    const fetchModelPricing = vi.fn().mockResolvedValue({
      data: [],
      group_ratio: {},
      success: true,
      usable_group: {},
    })
    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchModelPricing } as any)

    const accounts = [
      createDisplayAccount({
        id: "a",
        baseUrl: "https://a.example.com",
        userId: 1,
      }),
      createDisplayAccount({
        id: "b",
        baseUrl: "https://b.example.com",
        userId: 2,
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

    await waitFor(() => expect(fetchModelPricing).toHaveBeenCalledTimes(2))
    const calledAccountIds = fetchModelPricing.mock.calls.map(
      (call) => call[0]?.accountId,
    )
    expect(calledAccountIds).toEqual(expect.arrayContaining(["a", "b"]))
  })

  it("refetches single-account pricing when site or auth type changes", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchModelPricing = vi
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
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)

    const firstAccount = createDisplayAccount({
      id: "credential-change-account",
      baseUrl: "https://credential-change.example.com",
      userId: 61,
      siteType: "default",
      authType: AuthTypeEnum.AccessToken,
    })
    const secondAccount = createDisplayAccount({
      id: "credential-change-account",
      baseUrl: "https://credential-change.example.com",
      userId: 61,
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
      expect(fetchModelPricing).toHaveBeenCalledTimes(1)
      expect(result.current.pricingData?.data[0]?.model_name).toBe(
        "access-token-model",
      )
    })

    rerender({
      selectedSource: createAccountSource(secondAccount),
      accounts: [secondAccount],
    })

    await waitFor(() => {
      expect(fetchModelPricing).toHaveBeenCalledTimes(2)
      expect(fetchModelPricing).toHaveBeenLastCalledWith(
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

    const fetchModelPricing = vi.fn()
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)

    const account = createDisplayAccount({
      id: "cached-pricing-account",
      baseUrl: "https://cached-pricing.example.com",
      userId: 64,
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
      usable_group: { default: true },
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
    expect(fetchModelPricing).not.toHaveBeenCalled()

    await modelPricingCache.invalidate(cacheKey)
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
    const fetchModelPricing = vi.fn().mockImplementation(({ accountId }) => {
      return accountId === "a" ? firstDeferred.promise : secondDeferred.promise
    })
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)

    const accounts = [
      createDisplayAccount({
        id: "a",
        baseUrl: "https://a.example.com",
        userId: 1,
      }),
      createDisplayAccount({
        id: "b",
        baseUrl: "https://b.example.com",
        userId: 2,
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
    const fetchModelPricing = vi.fn()
    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchModelPricing } as any)
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
      expect(mockFetchApiCredentialModelIds).toHaveBeenCalledWith({
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://profile.example.com",
        apiKey: "sk-secret",
      }),
    )

    await waitFor(() =>
      expect(result.current.pricingData?.data).toHaveLength(2),
    )

    expect(
      result.current.pricingData?.data.map((item) => item.model_name),
    ).toEqual(["gpt-4o-mini", "claude-3-5-sonnet"])
    expect(fetchModelPricing).not.toHaveBeenCalled()
  })

  it("clears single-account errors when the query becomes idle", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchModelPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)

    const account = createDisplayAccount({
      id: "error-account",
      baseUrl: "https://error.example.com",
      userId: 9,
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

    const fetchModelPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)

    const account = createDisplayAccount({
      id: "fallback-account",
      baseUrl: "https://fallback.example.com",
      userId: 11,
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
    mockLoadAccountTokenFallbackPricingResponse.mockResolvedValueOnce({
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
      expect(fetchModelPricing).toHaveBeenCalledTimes(1)
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
      expect(result.current.accountFallback?.tokens).toHaveLength(2)
    })

    expect(result.current.accountFallback?.selectedTokenId).toBeNull()

    act(() => {
      result.current.accountFallback?.setSelectedTokenId(2)
    })
    await act(async () => {
      await result.current.accountFallback?.loadCatalog()
    })

    await waitFor(() => {
      expect(mockLoadAccountTokenFallbackPricingResponse).toHaveBeenCalledWith({
        account,
        token: fallbackTokens[1],
      })
    })

    await waitFor(() => {
      expect(result.current.accountFallback?.isActive).toBe(true)
    })

    expect(result.current.loadErrorMessage).toBeNull()
    expect(
      result.current.pricingData?.data.map((item) => item.model_name),
    ).toEqual(["gpt-4o-mini"])
  })

  it("clears fallback state after a successful direct-account retry", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchModelPricing = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        data: [
          {
            model_name: "account-model",
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
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)

    const account = createDisplayAccount({
      id: "fallback-reset-account",
      baseUrl: "https://fallback-reset.example.com",
      userId: 15,
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
    mockLoadAccountTokenFallbackPricingResponse.mockResolvedValueOnce({
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

    const { result } = renderHook(
      () =>
        useModelData({
          selectedSource: createAccountSource(account),
          accounts: [account],
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(fetchModelPricing).toHaveBeenCalledTimes(1)
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
      expect(result.current.accountFallback?.selectedTokenId).toBe(7)
    })

    await act(async () => {
      await result.current.accountFallback?.loadCatalog()
    })
    await waitFor(() => {
      expect(result.current.accountFallback?.isActive).toBe(true)
    })

    await act(async () => {
      await result.current.loadPricingData()
    })

    await waitFor(() => {
      expect(result.current.accountFallback?.isActive).toBe(false)
    })

    expect(result.current.loadErrorMessage).toBeNull()
    expect(
      result.current.pricingData?.data.map((item) => item.model_name),
    ).toEqual(["account-model"])
  })

  it("discards stale fallback token results after switching accounts", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const deferredTokens = createDeferred<any[]>()
    const fetchModelPricing = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
      })
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)
    mockFetchDisplayAccountTokens.mockReturnValueOnce(deferredTokens.promise)

    const firstAccount = createDisplayAccount({
      id: "first-account",
      baseUrl: "https://first.example.com",
      userId: 21,
    })
    const secondAccount = createDisplayAccount({
      id: "second-account",
      baseUrl: "https://second.example.com",
      userId: 22,
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
      expect(result.current.accountFallback?.tokens).toEqual([])
      expect(result.current.accountFallback?.selectedTokenId).toBeNull()
      expect(result.current.pricingData).toEqual({
        data: [],
        group_ratio: {},
        success: true,
        usable_group: {},
      })
    })
  })

  it("shows the fallback key-load error when token payload normalization fails", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchModelPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)
    mockFetchDisplayAccountTokens.mockRejectedValueOnce(
      new InvalidTokenPayloadError({
        accountId: "invalid-token-account",
        baseUrl: "https://invalid-token.example.com",
        siteType: "default",
        responseType: "object",
      }),
    )

    const account = createDisplayAccount({
      id: "invalid-token-account",
      baseUrl: "https://invalid-token.example.com",
      userId: 31,
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
        expect(result.current.accountFallback?.tokenLoadErrorMessage).toBe(
          "modelList:status.fallback.loadKeysFailedFallback",
        )
      },
      { timeout: 3000 },
    )
    expect(result.current.accountFallback?.tokens).toEqual([])
  })

  it("shows a generic fallback-model error when the fallback catalog load fails without details", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchModelPricing = vi.fn().mockRejectedValue(new Error("boom"))
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)

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
    mockLoadAccountTokenFallbackPricingResponse.mockRejectedValueOnce(
      new Error(""),
    )

    const account = createDisplayAccount({
      id: "catalog-error-account",
      baseUrl: "https://catalog-error.example.com",
      userId: 41,
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
        expect(result.current.accountFallback?.selectedTokenId).toBe(5)
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

  it("reports mixed invalid-format and load-failed states in all-accounts mode", async () => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()

    const fetchModelPricing = vi.fn().mockImplementation(({ accountId }) => {
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
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)

    const accounts = [
      createDisplayAccount({
        id: "bad-format",
        baseUrl: "https://bad-format.example.com",
        userId: 51,
      }),
      createDisplayAccount({
        id: "load-failed",
        baseUrl: "https://load-failed.example.com",
        userId: 52,
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
          "modelList:status.loadFailed",
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

    const fetchModelPricing = vi.fn().mockResolvedValue({
      data: null,
      group_ratio: {},
      success: true,
      usable_group: {},
    })
    vi.mocked(getApiService).mockReturnValue({ fetchModelPricing } as any)

    const account = createDisplayAccount({
      id: "single-invalid-format",
      baseUrl: "https://single-invalid-format.example.com",
      userId: 62,
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
