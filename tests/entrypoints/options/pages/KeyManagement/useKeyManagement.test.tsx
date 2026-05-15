import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { useKeyManagement } from "~/features/KeyManagement/hooks/useKeyManagement"
import { buildTokenIdentityKey } from "~/features/KeyManagement/utils"
import { useAccountData } from "~/hooks/useAccountData"
import { getApiService } from "~/services/apiService"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { testI18n } from "~~/tests/test-utils/i18n"
import { createToken } from "~~/tests/utils/keyManagementFactories"

const {
  getManagedSiteTokenChannelStatusMock,
  managedSiteTokenChannelStatuses,
  mockedUseUserPreferencesContext,
  startProductAnalyticsActionMock,
  trackerCompleteMock,
} = vi.hoisted(() => ({
  getManagedSiteTokenChannelStatusMock: vi.fn(),
  managedSiteTokenChannelStatuses: {
    ADDED: "added",
    NOT_ADDED: "not-added",
    UNKNOWN: "unknown",
  },
  mockedUseUserPreferencesContext: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  trackerCompleteMock: vi.fn(),
}))

vi.mock("~/hooks/useAccountData", () => ({
  useAccountData: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
}))

vi.mock("~/services/managedSites/tokenChannelStatus", () => ({
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES: managedSiteTokenChannelStatuses,
  getManagedSiteTokenChannelStatus: (...args: unknown[]) =>
    getManagedSiteTokenChannelStatusMock(...args),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

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
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

const createWrapper = () => {
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>
  )
}

type ManagedSiteContextValue = {
  managedSiteType: string
  newApiBaseUrl: string
  newApiAdminToken: string
  newApiUserId: string
  newApiUsername: string
  newApiPassword: string
  newApiTotpSecret: string
  doneHubBaseUrl: string | undefined
  doneHubAdminToken: string | undefined
  doneHubUserId: string | undefined
  veloeraBaseUrl: string
  veloeraAdminToken: string
  veloeraUserId: string
  octopusBaseUrl: string | undefined
  octopusUsername: string | undefined
  octopusPassword: string | undefined
}

describe("useKeyManagement enabled account filtering", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
    getManagedSiteTokenChannelStatusMock.mockReset()
    getManagedSiteTokenChannelStatusMock.mockResolvedValue({
      status: managedSiteTokenChannelStatuses.NOT_ADDED,
    })
    startProductAnalyticsActionMock.mockReset()
    trackerCompleteMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackerCompleteMock,
    })
    mockedUseUserPreferencesContext.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: "new-api",
      newApiBaseUrl: "https://managed.example",
      newApiAdminToken: "managed-admin-token",
      newApiUserId: "1",
      newApiUsername: "",
      newApiPassword: "",
      newApiTotpSecret: "",
      doneHubBaseUrl: "",
      doneHubAdminToken: "",
      doneHubUserId: "",
      veloeraBaseUrl: "",
      veloeraAdminToken: "",
      veloeraUserId: "",
      octopusBaseUrl: "",
      octopusUsername: "",
      octopusPassword: "",
    })
  })

  it("uses enabledDisplayData from useAccountData for selectors", () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const enabledAccount = createDisplayAccount({
      id: "enabled",
      name: "Enabled",
    })
    mockedUseAccountData.mockReturnValue({
      displayData: [
        enabledAccount,
        createDisplayAccount({
          id: "disabled",
          name: "Disabled",
          disabled: true,
        }),
      ],
      enabledDisplayData: [enabledAccount],
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    expect(result.current.displayData.map((account) => account.id)).toEqual([
      "enabled",
    ])
  })

  it("clears selectedAccount when a disabled account id is set", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const enabledAccount = createDisplayAccount({
      id: "enabled",
      name: "Enabled",
    })
    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [enabledAccount],
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount("disabled")
    })
    await waitFor(() => expect(result.current.selectedAccount).toBe(""))
  })

  it("keeps selectedAccount when it is set to all", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [
        createDisplayAccount({
          id: "enabled",
          name: "Enabled",
        }),
      ],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([])
    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount("all")
    })

    await waitFor(() => expect(result.current.selectedAccount).toBe("all"))
  })

  it("starts token loads for all distinct origins without a global cap in all mode", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)

    const accountCount = 8
    const accounts = Array.from({ length: accountCount }, (_, index) => {
      const accountIndex = index + 1
      return createDisplayAccount({
        id: `acc-${accountIndex}`,
        name: `Account ${accountIndex}`,
        baseUrl: `https://${accountIndex}.example.com/v1`,
      })
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: accounts,
    } as any)

    const resolversByAccountId = new Map<string, (tokens: any[]) => void>()

    const fetchAccountTokens = vi.fn((request: any) => {
      return new Promise<any[]>((resolve) => {
        if (typeof request?.accountId === "string") {
          resolversByAccountId.set(request.accountId, resolve)
        }
      })
    })

    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount("all")
    })

    await waitFor(() =>
      expect(fetchAccountTokens).toHaveBeenCalledTimes(accountCount),
    )

    accounts.forEach((account, index) => {
      const resolver = resolversByAccountId.get(account.id)
      expect(resolver).toBeDefined()
      const tokenId = index + 1
      resolver?.([
        createToken({
          id: tokenId,
          key: `sk-${tokenId}`,
          name: `Token ${tokenId}`,
          expired_time: 0,
        }),
      ])
    })

    await waitFor(() =>
      expect(result.current.tokens).toHaveLength(accountCount),
    )
  })

  it("ignores routeParams.accountId when it points to a disabled account", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const enabledAccount = createDisplayAccount({
      id: "enabled",
      name: "Enabled",
    })
    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [enabledAccount],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([])
    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(
      () => useKeyManagement({ accountId: "disabled" }),
      {
        wrapper: createWrapper(),
      },
    )

    await waitFor(() => expect(result.current.selectedAccount).toBe(""))
  })

  it("loads tokens across accounts and isolates per-account failures in all mode", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)

    const accountA = createDisplayAccount({
      id: "acc-a",
      name: "Account A",
      baseUrl: "https://example.com/v1",
    })
    const accountB = createDisplayAccount({
      id: "acc-b",
      name: "Account B",
      baseUrl: "https://example.com/v1",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [accountA, accountB],
    } as any)

    const fetchAccountTokens = vi.fn(async (request: any) => {
      if (request?.accountId === accountA.id) {
        return [
          {
            id: 1,
            user_id: 1,
            key: "sk-a",
            status: 1,
            name: "Token A",
            created_time: 0,
            accessed_time: 0,
            expired_time: 0,
            remain_quota: 0,
            unlimited_quota: false,
            used_quota: 0,
          },
        ]
      }

      if (request?.accountId === accountB.id) {
        throw new Error("boom")
      }

      return []
    })

    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount("all")
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))
    expect(result.current.tokens[0]?.accountId).toBe(accountA.id)

    await waitFor(() => expect(result.current.failedAccounts).toHaveLength(1))
    expect(result.current.failedAccounts[0]).toMatchObject({
      accountId: accountB.id,
      accountName: accountB.name,
      errorMessage: "boom",
    })

    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
  })

  it("retries failed accounts in all mode", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)

    const accountA = createDisplayAccount({
      id: "acc-a",
      name: "Account A",
      baseUrl: "https://example.com/v1",
    })
    const accountB = createDisplayAccount({
      id: "acc-b",
      name: "Account B",
      baseUrl: "https://example.com/v1",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [accountA, accountB],
    } as any)

    let accountBCallCount = 0
    const fetchAccountTokens = vi.fn(async (request: any) => {
      if (request?.accountId === accountA.id) {
        return [
          {
            id: 1,
            user_id: 1,
            key: "sk-a",
            status: 1,
            name: "Token A",
            created_time: 0,
            accessed_time: 0,
            expired_time: 0,
            remain_quota: 0,
            unlimited_quota: false,
            used_quota: 0,
          },
        ]
      }

      if (request?.accountId === accountB.id) {
        accountBCallCount += 1
        if (accountBCallCount === 1) {
          throw new Error("boom")
        }

        return [
          {
            id: 2,
            user_id: 1,
            key: "sk-b",
            status: 1,
            name: "Token B",
            created_time: 0,
            accessed_time: 0,
            expired_time: 0,
            remain_quota: 0,
            unlimited_quota: false,
            used_quota: 0,
          },
        ]
      }

      return []
    })

    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount("all")
    })

    await waitFor(() => expect(result.current.failedAccounts).toHaveLength(1))

    await act(async () => {
      await result.current.retryFailedAccounts()
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(2))
    await waitFor(() => expect(result.current.failedAccounts).toHaveLength(0))

    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
  })

  it("tracks all-account token refresh with sanitized aggregate buckets", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)

    const accountA = createDisplayAccount({
      id: "analytics-refresh-a",
      name: "Secret Account A",
      baseUrl: "https://secret-a.example/v1",
    })
    const accountB = createDisplayAccount({
      id: "analytics-refresh-b",
      name: "Secret Account B",
      baseUrl: "https://secret-b.example/v1",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [accountA, accountB],
    } as any)

    const fetchAccountTokens = vi.fn(async (request: any) => {
      if (request?.accountId === accountA.id) {
        return [
          createToken({
            id: 301,
            key: "sk-raw-refresh-secret-a",
            name: "Sensitive Token A",
            expired_time: 0,
          }),
        ]
      }

      throw new Error(`raw failure for ${request?.accountId}`)
    })
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE)
    })

    await waitFor(() =>
      expect(trackerCompleteMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          insights: {
            mode: PRODUCT_ANALYTICS_MODE_IDS.All,
            itemCount: 2,
            successCount: 1,
            failureCount: 1,
          },
        },
      ),
    )

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "sk-raw-refresh-secret-a",
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "Secret Account",
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "raw failure",
    )
  })

  it("marks superseded all-account token refresh analytics as skipped", async () => {
    const account = createDisplayAccount({
      id: "superseded-refresh-acc",
      name: "Superseded Refresh Account",
      baseUrl: "https://superseded.example/v1",
    })

    vi.mocked(useAccountData).mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    let resolveInitialLoad!: (tokens: any[]) => void
    const fetchAccountTokens = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitialLoad = resolve
          }),
      )
      .mockResolvedValue([])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const allAccountsComplete = vi.fn().mockResolvedValue(undefined)
    const singleAccountComplete = vi.fn().mockResolvedValue(undefined)
    startProductAnalyticsActionMock
      .mockReturnValueOnce({ complete: allAccountsComplete })
      .mockReturnValueOnce({ complete: singleAccountComplete })

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE)
    })

    await waitFor(() => expect(fetchAccountTokens).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(startProductAnalyticsActionMock).toHaveBeenCalledTimes(2),
    )

    await act(async () => {
      resolveInitialLoad([
        createToken({
          id: 309,
          key: "sk-superseded",
          name: "Superseded Token",
          accountId: account.id,
          accountName: account.name,
          expired_time: 0,
        }),
      ])
    })

    await waitFor(() =>
      expect(allAccountsComplete).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        {
          insights: {
            mode: PRODUCT_ANALYTICS_MODE_IDS.All,
            itemCount: 1,
          },
        },
      ),
    )
    expect(allAccountsComplete).not.toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({
          successCount: expect.any(Number),
          failureCount: expect.any(Number),
        }),
      }),
    )
  })

  it("tracks retry-failed token refresh with retry_failed mode and aggregate counts", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)

    const accountA = createDisplayAccount({
      id: "analytics-retry-a",
      name: "Retry Account A",
      baseUrl: "https://retry-a.example/v1",
    })
    const accountB = createDisplayAccount({
      id: "analytics-retry-b",
      name: "Retry Account B",
      baseUrl: "https://retry-b.example/v1",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [accountA, accountB],
    } as any)

    let accountBCalls = 0
    const fetchAccountTokens = vi.fn(async (request: any) => {
      if (request?.accountId === accountA.id) return []
      if (request?.accountId === accountB.id) {
        accountBCalls += 1
        if (accountBCalls === 1) {
          throw new Error("first raw retry failure")
        }
        return []
      }
      return []
    })
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE)
    })

    await waitFor(() => expect(result.current.failedAccounts).toHaveLength(1))
    trackerCompleteMock.mockClear()
    startProductAnalyticsActionMock.mockClear()

    await act(async () => {
      await result.current.retryFailedAccounts()
    })

    await waitFor(() =>
      expect(trackerCompleteMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            mode: PRODUCT_ANALYTICS_MODE_IDS.RetryFailed,
            itemCount: 1,
            successCount: 1,
            failureCount: 0,
          },
        },
      ),
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "first raw retry failure",
    )
  })

  it("keeps retry-failed refresh successful when analytics completion rejects", async () => {
    const accountA = createDisplayAccount({
      id: "best-effort-retry-a",
      name: "Best Effort Retry A",
      baseUrl: "https://retry-a.example/v1",
    })
    const accountB = createDisplayAccount({
      id: "best-effort-retry-b",
      name: "Best Effort Retry B",
      baseUrl: "https://retry-b.example/v1",
    })

    vi.mocked(useAccountData).mockReturnValue({
      enabledDisplayData: [accountA, accountB],
    } as any)

    let accountBCalls = 0
    const fetchAccountTokens = vi.fn(async (request: any) => {
      if (request?.accountId === accountB.id) {
        accountBCalls += 1
        if (accountBCalls === 1) {
          throw new Error("initial retry target failure")
        }
      }

      return []
    })
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const initialRefreshComplete = vi.fn().mockResolvedValue(undefined)
    const retryComplete = vi.fn().mockRejectedValue(new Error("analytics down"))
    startProductAnalyticsActionMock
      .mockReturnValueOnce({ complete: initialRefreshComplete })
      .mockReturnValueOnce({ complete: retryComplete })

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE)
    })

    await waitFor(() => expect(result.current.failedAccounts).toHaveLength(1))

    await expect(
      act(async () => {
        await result.current.retryFailedAccounts()
      }),
    ).resolves.toBeUndefined()

    await waitFor(() => expect(result.current.failedAccounts).toHaveLength(0))
    expect(retryComplete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          mode: PRODUCT_ANALYTICS_MODE_IDS.RetryFailed,
          itemCount: 1,
          successCount: 1,
          failureCount: 0,
        },
      },
    )
  })

  it("supports account filtering in all mode while keeping per-account summary counts", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)

    const accountA = createDisplayAccount({
      id: "acc-a",
      name: "Account A",
      baseUrl: "https://example.com/v1",
    })
    const accountB = createDisplayAccount({
      id: "acc-b",
      name: "Account B",
      baseUrl: "https://example.com/v1",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [accountA, accountB],
    } as any)

    const fetchAccountTokens = vi.fn(async (request: any) => {
      if (request?.accountId === accountA.id) {
        return [
          {
            id: 1,
            user_id: 1,
            key: "sk-a",
            status: 1,
            name: "Token A",
            created_time: 0,
            accessed_time: 0,
            expired_time: 0,
            remain_quota: 0,
            unlimited_quota: false,
            used_quota: 0,
          },
        ]
      }

      if (request?.accountId === accountB.id) {
        return [
          {
            id: 1,
            user_id: 1,
            key: "sk-b",
            status: 1,
            name: "Token B",
            created_time: 0,
            accessed_time: 0,
            expired_time: 0,
            remain_quota: 0,
            unlimited_quota: false,
            used_quota: 0,
          },
        ]
      }

      return []
    })

    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount("all")
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(2))

    expect(result.current.accountSummaryItems).toEqual([
      {
        accountId: accountA.id,
        name: accountA.name,
        count: 1,
        errorType: undefined,
      },
      {
        accountId: accountB.id,
        name: accountB.name,
        count: 1,
        errorType: undefined,
      },
    ])

    act(() => {
      result.current.setAllAccountsFilterAccountIds([accountA.id])
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))
    expect(result.current.tokens[0]?.accountId).toBe(accountA.id)

    act(() => {
      result.current.setAllAccountsFilterAccountIds([accountA.id, accountB.id])
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(2))
    expect(result.current.tokens.map((token) => token.accountId)).toEqual([
      accountA.id,
      accountB.id,
    ])

    expect(result.current.accountSummaryItems).toEqual([
      {
        accountId: accountA.id,
        name: accountA.name,
        count: 1,
        errorType: undefined,
      },
      {
        accountId: accountB.id,
        name: accountB.name,
        count: 1,
        errorType: undefined,
      },
    ])
  })

  it("starts managed-site status checks after tokens load and reuses cached results across rerenders", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "managed-acc",
      name: "Managed Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 101,
        key: "token-101",
        name: "Token 101",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )

    expect(
      result.current.managedSiteTokenStatuses["managed-acc:101"]?.result,
    ).toEqual({
      status: managedSiteTokenChannelStatuses.NOT_ADDED,
    })

    act(() => {
      result.current.setSearchTerm("token")
    })

    await waitFor(() => expect(result.current.filteredTokens).toHaveLength(1))
    expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1)
  })

  it("reveals the resolved full key when the inventory value is masked", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "reveal-acc",
      name: "Reveal Account",
    })

    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: "Veloera",
      newApiBaseUrl: "",
      newApiAdminToken: "",
      newApiUserId: "",
      newApiUsername: "",
      newApiPassword: "",
      newApiTotpSecret: "",
      doneHubBaseUrl: "",
      doneHubAdminToken: "",
      doneHubUserId: "",
      veloeraBaseUrl: "https://veloera.example",
      veloeraAdminToken: "veloera-admin-token",
      veloeraUserId: "1",
      octopusBaseUrl: "",
      octopusUsername: "",
      octopusPassword: "",
    })
    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const maskedKey = "sk-maske****************7890"
    const resolvedKey = "sk-resolved-12345678901234567890"
    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 505,
        key: maskedKey,
        name: "Reveal Token",
        expired_time: 0,
      }),
    ])
    const resolveApiTokenKey = vi.fn().mockResolvedValue(resolvedKey)
    vi.mocked(getApiService).mockReturnValue({
      fetchAccountTokens,
      resolveApiTokenKey,
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))
    const token = result.current.tokens[0]!
    const tokenIdentityKey = buildTokenIdentityKey(token.accountId, token.id)

    expect(result.current.getVisibleTokenKey(token)).toBe(maskedKey)

    await act(async () => {
      await result.current.toggleKeyVisibility(account, token)
    })

    await waitFor(() =>
      expect(result.current.visibleKeys.has(tokenIdentityKey)).toBe(true),
    )
    expect(resolveApiTokenKey).toHaveBeenCalledTimes(1)
    expect(result.current.getVisibleTokenKey(token)).toBe(resolvedKey)
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RevealAccountTokenKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      resolvedKey,
    )

    trackerCompleteMock.mockClear()
    await act(async () => {
      await result.current.toggleKeyVisibility(account, token)
    })
    expect(result.current.visibleKeys.has(tokenIdentityKey)).toBe(false)
    expect(trackerCompleteMock).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.toggleKeyVisibility(account, token)
    })

    await waitFor(() =>
      expect(result.current.visibleKeys.has(tokenIdentityKey)).toBe(true),
    )
    expect(resolveApiTokenKey).toHaveBeenCalledTimes(1)
  })

  it("reruns managed-site status checks on manual refresh and replaces the prior result", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "refresh-acc",
      name: "Refresh Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    getManagedSiteTokenChannelStatusMock
      .mockResolvedValueOnce({
        status: managedSiteTokenChannelStatuses.NOT_ADDED,
      })
      .mockResolvedValueOnce({
        status: managedSiteTokenChannelStatuses.ADDED,
        matchedChannel: {
          id: 55,
          name: "Managed Channel 55",
        },
      })

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 202,
        key: "token-202",
        name: "Token 202",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )

    await act(async () => {
      await result.current.refreshManagedSiteTokenStatuses()
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(2),
    )

    expect(
      result.current.managedSiteTokenStatuses["refresh-acc:202"]?.result,
    ).toEqual({
      status: managedSiteTokenChannelStatuses.ADDED,
      matchedChannel: {
        id: 55,
        name: "Managed Channel 55",
      },
    })
  })

  it("tracks manual managed-site status refresh with sanitized aggregate counts", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "manual-status-analytics-acc",
      name: "Manual Status Analytics Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    getManagedSiteTokenChannelStatusMock
      .mockResolvedValueOnce({
        status: managedSiteTokenChannelStatuses.NOT_ADDED,
      })
      .mockResolvedValueOnce({
        status: managedSiteTokenChannelStatuses.ADDED,
        matchedChannel: {
          id: 77,
          name: "Private Managed Channel",
        },
      })

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 204,
        key: "sk-manual-refresh-secret",
        name: "Manual Refresh Secret Token",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )
    startProductAnalyticsActionMock.mockClear()
    trackerCompleteMock.mockClear()

    await act(async () => {
      await result.current.refreshManagedSiteTokenStatuses()
    })

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteTokenStatus,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
          successCount: 1,
          failureCount: 0,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
        },
      },
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "sk-manual-refresh-secret",
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "Manual Refresh Secret Token",
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "Private Managed Channel",
    )
  })

  it("keeps manual managed-site status refresh successful when analytics completion rejects", async () => {
    const account = createDisplayAccount({
      id: "manual-status-best-effort-acc",
      name: "Manual Status Best Effort Account",
    })

    vi.mocked(useAccountData).mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    getManagedSiteTokenChannelStatusMock
      .mockResolvedValueOnce({
        status: managedSiteTokenChannelStatuses.NOT_ADDED,
      })
      .mockResolvedValueOnce({
        status: managedSiteTokenChannelStatuses.ADDED,
      })

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 206,
        key: "token-206",
        name: "Token 206",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const initialLoadComplete = vi.fn().mockResolvedValue(undefined)
    const manualRefreshComplete = vi
      .fn()
      .mockRejectedValue(new Error("analytics down"))
    startProductAnalyticsActionMock
      .mockReturnValueOnce({ complete: initialLoadComplete })
      .mockReturnValueOnce({ complete: manualRefreshComplete })

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )

    await expect(
      act(async () => {
        await result.current.refreshManagedSiteTokenStatuses()
      }),
    ).resolves.toBeUndefined()

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(2),
    )
    expect(manualRefreshComplete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
          successCount: 1,
          failureCount: 0,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
        },
      },
    )
    expect(result.current.isManagedSiteStatusRefreshing).toBe(false)
  })

  it("does not track automatic managed-site status checks as manual refresh", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "auto-status-analytics-acc",
      name: "Auto Status Analytics Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 205,
        key: "token-205",
        name: "Token 205",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )

    expect(result.current.managedSiteTokenStatuses).toMatchObject({
      "auto-status-analytics-acc:205": {
        result: {
          status: managedSiteTokenChannelStatuses.NOT_ADDED,
        },
      },
    })
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteTokenStatus,
      }),
    )
  })

  it("skips automatic and manual managed-site status checks when Veloera is selected", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "veloera-acc",
      name: "Veloera Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: "Veloera",
      newApiBaseUrl: "",
      newApiAdminToken: "",
      newApiUserId: "",
      newApiUsername: "",
      newApiPassword: "",
      newApiTotpSecret: "",
      doneHubBaseUrl: "",
      doneHubAdminToken: "",
      doneHubUserId: "",
      veloeraBaseUrl: "https://veloera.example",
      veloeraAdminToken: "veloera-admin-token",
      veloeraUserId: "1",
      octopusBaseUrl: "",
      octopusUsername: "",
      octopusPassword: "",
    })

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 303,
        key: "token-303",
        name: "Token 303",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))

    expect(result.current.isManagedSiteChannelStatusSupported).toBe(false)
    expect(getManagedSiteTokenChannelStatusMock).not.toHaveBeenCalled()
    expect(result.current.managedSiteTokenStatuses).toEqual({})

    await act(async () => {
      await result.current.refreshManagedSiteTokenStatuses()
      await result.current.refreshManagedSiteTokenStatusForToken(
        result.current.tokens[0]!,
      )
    })

    expect(getManagedSiteTokenChannelStatusMock).not.toHaveBeenCalled()
    expect(result.current.managedSiteTokenStatuses).toEqual({})
  })

  it("reuses in-flight managed-site status checks while all-accounts loading adds new tokens", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const firstAccount = createDisplayAccount({
      id: "reuse-a",
      name: "Reuse Account A",
      baseUrl: "https://example.com/a",
    })
    const secondAccount = createDisplayAccount({
      id: "reuse-b",
      name: "Reuse Account B",
      baseUrl: "https://example.com/b",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [firstAccount, secondAccount],
    } as any)

    let resolveStatus: (
      value: Awaited<ReturnType<typeof getManagedSiteTokenChannelStatusMock>>,
    ) => void = () => {}
    const pendingStatus = new Promise<
      Awaited<ReturnType<typeof getManagedSiteTokenChannelStatusMock>>
    >((resolve) => {
      resolveStatus = resolve
    })

    let resolveSecondAccountTokens: (
      value: ReturnType<typeof createToken>[],
    ) => void = () => {}
    const secondAccountTokens = new Promise<ReturnType<typeof createToken>[]>(
      (resolve) => {
        resolveSecondAccountTokens = resolve
      },
    )

    getManagedSiteTokenChannelStatusMock.mockImplementation(({ token }) => {
      if (token.id === 505) {
        return pendingStatus
      }

      return Promise.resolve({
        status: managedSiteTokenChannelStatuses.NOT_ADDED,
      })
    })

    const fetchAccountTokens = vi.fn().mockImplementation((request) => {
      if (request.baseUrl === firstAccount.baseUrl) {
        return Promise.resolve([
          createToken({
            id: 505,
            key: "token-505",
            name: "Token 505",
            expired_time: 0,
          }),
        ])
      }

      return secondAccountTokens
    })
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )
    await waitFor(() =>
      expect(
        result.current.managedSiteTokenStatuses["reuse-a:505"]?.isChecking,
      ).toBe(true),
    )

    await act(async () => {
      resolveSecondAccountTokens([
        createToken({
          id: 506,
          key: "token-506",
          name: "Token 506",
          expired_time: 0,
        }),
      ])
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(2),
    )
    expect(
      getManagedSiteTokenChannelStatusMock.mock.calls.filter(
        ([params]) => params.token.id === 505,
      ),
    ).toHaveLength(1)

    await act(async () => {
      resolveStatus({
        status: managedSiteTokenChannelStatuses.ADDED,
        matchedChannel: {
          id: 77,
          name: "Managed Channel 77",
        },
      })
      await pendingStatus
    })

    await waitFor(() =>
      expect(
        result.current.managedSiteTokenStatuses["reuse-a:505"]?.result,
      ).toEqual({
        status: managedSiteTokenChannelStatuses.ADDED,
        matchedChannel: {
          id: 77,
          name: "Managed Channel 77",
        },
      }),
    )
    expect(
      result.current.managedSiteTokenStatuses["reuse-b:506"]?.result,
    ).toEqual({
      status: managedSiteTokenChannelStatuses.NOT_ADDED,
    })
  })

  it("keeps unrelated in-flight status checks alive during single-token forced refreshes", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "force-acc",
      name: "Force Refresh Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    let resolveFirstTokenStatus: (
      value: Awaited<ReturnType<typeof getManagedSiteTokenChannelStatusMock>>,
    ) => void = () => {}
    const firstTokenStatus = new Promise<
      Awaited<ReturnType<typeof getManagedSiteTokenChannelStatusMock>>
    >((resolve) => {
      resolveFirstTokenStatus = resolve
    })

    let secondTokenCheckCount = 0
    getManagedSiteTokenChannelStatusMock.mockImplementation(({ token }) => {
      if (token.id === 601) {
        return firstTokenStatus
      }

      secondTokenCheckCount += 1

      return Promise.resolve(
        secondTokenCheckCount === 1
          ? {
              status: managedSiteTokenChannelStatuses.NOT_ADDED,
            }
          : {
              status: managedSiteTokenChannelStatuses.ADDED,
              matchedChannel: {
                id: 88,
                name: "Managed Channel 88",
              },
            },
      )
    })

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 601,
        key: "token-601",
        name: "Token 601",
        expired_time: 0,
      }),
      createToken({
        id: 602,
        key: "token-602",
        name: "Token 602",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(2),
    )
    await waitFor(() =>
      expect(
        result.current.managedSiteTokenStatuses["force-acc:602"]?.result,
      ).toEqual({
        status: managedSiteTokenChannelStatuses.NOT_ADDED,
      }),
    )

    await act(async () => {
      await result.current.refreshManagedSiteTokenStatusForToken(
        result.current.tokens.find((token) => token.id === 602)!,
      )
    })

    await waitFor(() =>
      expect(
        result.current.managedSiteTokenStatuses["force-acc:602"]?.result,
      ).toEqual({
        status: managedSiteTokenChannelStatuses.ADDED,
        matchedChannel: {
          id: 88,
          name: "Managed Channel 88",
        },
      }),
    )

    await act(async () => {
      resolveFirstTokenStatus({
        status: managedSiteTokenChannelStatuses.ADDED,
        matchedChannel: {
          id: 77,
          name: "Managed Channel 77",
        },
      })
      await firstTokenStatus
    })

    await waitFor(() =>
      expect(
        result.current.managedSiteTokenStatuses["force-acc:601"]?.result,
      ).toEqual({
        status: managedSiteTokenChannelStatuses.ADDED,
        matchedChannel: {
          id: 77,
          name: "Managed Channel 77",
        },
      }),
    )
    expect(
      result.current.managedSiteTokenStatuses["force-acc:601"]?.isChecking,
    ).toBe(false)
  })

  it("passes resolved channel keys through single-token managed-site refreshes", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "resolved-refresh-acc",
      name: "Resolved Refresh Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 603,
        key: "token-603",
        name: "Token 603",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )

    await act(async () => {
      await result.current.refreshManagedSiteTokenStatusForToken(
        result.current.tokens[0]!,
        {
          resolvedChannelKeysById: {
            55: "resolved-channel-key",
          },
        },
      )
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(2),
    )
    expect(getManagedSiteTokenChannelStatusMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resolvedChannelKeysById: {
          55: "resolved-channel-key",
        },
      }),
    )
  })

  it("invalidates managed-site status when a token is deleted", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "delete-acc",
      name: "Delete Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi
      .fn()
      .mockResolvedValueOnce([
        createToken({
          id: 303,
          key: "token-303",
          name: "Token 303",
          expired_time: 0,
        }),
      ])
      .mockResolvedValueOnce([])
    const deleteApiToken = vi.fn().mockResolvedValue(true)
    vi.mocked(getApiService).mockReturnValue({
      fetchAccountTokens,
      deleteApiToken,
    } as any)

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))
    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )

    await act(async () => {
      await result.current.handleDeleteToken(result.current.tokens[0]!)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(0))
    expect(deleteApiToken).toHaveBeenCalledWith(expect.anything(), 303)
    expect(
      result.current.managedSiteTokenStatuses["delete-acc:303"],
    ).toBeUndefined()

    confirmSpy.mockRestore()
  })

  it("invalidates cached managed-site status when managed-site preferences change", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "prefs-acc",
      name: "Preferences Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const managedSiteContextValue = {
      managedSiteType: "new-api",
      newApiBaseUrl: "https://managed.example",
      newApiAdminToken: "managed-admin-token",
      newApiUserId: "1",
      newApiUsername: "",
      newApiPassword: "",
      newApiTotpSecret: "",
      doneHubBaseUrl: "",
      doneHubAdminToken: "",
      doneHubUserId: "",
      veloeraBaseUrl: "",
      veloeraAdminToken: "",
      veloeraUserId: "",
      octopusBaseUrl: "",
      octopusUsername: "",
      octopusPassword: "",
    }
    mockedUseUserPreferencesContext.mockImplementation(
      () => managedSiteContextValue,
    )

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 404,
        key: "token-404",
        name: "Token 404",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result, rerender } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )

    managedSiteContextValue.newApiBaseUrl = "https://managed-2.example"
    rerender()

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(2),
    )
  })

  it("invalidates cached managed-site status when DoneHub credentials change", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "done-hub-acc",
      name: "DoneHub Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const managedSiteContextValue: ManagedSiteContextValue = {
      managedSiteType: "done-hub",
      newApiBaseUrl: "",
      newApiAdminToken: "",
      newApiUserId: "",
      newApiUsername: "",
      newApiPassword: "",
      newApiTotpSecret: "",
      doneHubBaseUrl: undefined,
      doneHubAdminToken: undefined,
      doneHubUserId: undefined,
      veloeraBaseUrl: "",
      veloeraAdminToken: "",
      veloeraUserId: "",
      octopusBaseUrl: "",
      octopusUsername: "",
      octopusPassword: "",
    }
    mockedUseUserPreferencesContext.mockImplementation(
      () => managedSiteContextValue,
    )

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 408,
        key: "token-408",
        name: "Token 408",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result, rerender } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )

    managedSiteContextValue.doneHubBaseUrl = "https://done-hub.example"
    managedSiteContextValue.doneHubAdminToken = "done-hub-admin-token"
    managedSiteContextValue.doneHubUserId = "7"
    rerender()

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(2),
    )
  })

  it("invalidates cached managed-site status when Octopus credentials change", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "octopus-acc",
      name: "Octopus Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const managedSiteContextValue: ManagedSiteContextValue = {
      managedSiteType: "octopus",
      newApiBaseUrl: "",
      newApiAdminToken: "",
      newApiUserId: "",
      newApiUsername: "",
      newApiPassword: "",
      newApiTotpSecret: "",
      doneHubBaseUrl: "",
      doneHubAdminToken: "",
      doneHubUserId: "",
      veloeraBaseUrl: "",
      veloeraAdminToken: "",
      veloeraUserId: "",
      octopusBaseUrl: undefined,
      octopusUsername: undefined,
      octopusPassword: undefined,
    }
    mockedUseUserPreferencesContext.mockImplementation(
      () => managedSiteContextValue,
    )

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 409,
        key: "token-409",
        name: "Token 409",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result, rerender } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )

    managedSiteContextValue.octopusBaseUrl = "https://octopus.example"
    managedSiteContextValue.octopusUsername = "octopus-user"
    managedSiteContextValue.octopusPassword = "octopus-password"
    rerender()

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(2),
    )
  })

  it("clears cached managed-site status when preferences switch to Veloera", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "veloera-switch-acc",
      name: "Switch Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const managedSiteContextValue = {
      managedSiteType: "new-api",
      newApiBaseUrl: "https://managed.example",
      newApiAdminToken: "managed-admin-token",
      newApiUserId: "1",
      newApiUsername: "",
      newApiPassword: "",
      newApiTotpSecret: "",
      doneHubBaseUrl: "",
      doneHubAdminToken: "",
      doneHubUserId: "",
      veloeraBaseUrl: "",
      veloeraAdminToken: "",
      veloeraUserId: "",
      octopusBaseUrl: "",
      octopusUsername: "",
      octopusPassword: "",
    }
    mockedUseUserPreferencesContext.mockImplementation(
      () => managedSiteContextValue,
    )

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 404,
        key: "token-404",
        name: "Token 404",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result, rerender } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1),
    )
    expect(
      result.current.managedSiteTokenStatuses["veloera-switch-acc:404"]?.result,
    ).toEqual({
      status: managedSiteTokenChannelStatuses.NOT_ADDED,
    })

    managedSiteContextValue.managedSiteType = "Veloera"
    managedSiteContextValue.newApiBaseUrl = ""
    managedSiteContextValue.newApiAdminToken = ""
    managedSiteContextValue.newApiUserId = ""
    managedSiteContextValue.newApiUsername = ""
    managedSiteContextValue.newApiPassword = ""
    managedSiteContextValue.newApiTotpSecret = ""
    managedSiteContextValue.veloeraBaseUrl = "https://veloera.example"
    managedSiteContextValue.veloeraAdminToken = "veloera-admin-token"
    managedSiteContextValue.veloeraUserId = "1"
    rerender()

    await waitFor(() =>
      expect(result.current.isManagedSiteChannelStatusSupported).toBe(false),
    )
    await waitFor(() =>
      expect(result.current.managedSiteTokenStatuses).toEqual({}),
    )
    expect(getManagedSiteTokenChannelStatusMock).toHaveBeenCalledTimes(1)
  })

  it("selects routeParams.accountId when it points to an enabled account", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "route-acc",
      name: "Route Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(
      () => useKeyManagement({ accountId: account.id }),
      {
        wrapper: createWrapper(),
      },
    )

    await waitFor(() => expect(result.current.selectedAccount).toBe(account.id))
    await waitFor(() => expect(fetchAccountTokens).toHaveBeenCalledTimes(1))
  })

  it("clears all-accounts selection when enabled accounts disappear", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "vanish-acc",
      name: "Vanishing Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result, rerender } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE)
    })

    await waitFor(() =>
      expect(result.current.selectedAccount).toBe(
        KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      ),
    )

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [],
    } as any)
    rerender()

    await waitFor(() => expect(result.current.selectedAccount).toBe(""))
  })

  it("clears the all-accounts filter when switching back to a single account", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "filter-acc",
      name: "Filter Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 901,
        key: "token-901",
        name: "Token 901",
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))

    act(() => {
      result.current.setAllAccountsFilterAccountIds([account.id])
    })

    await waitFor(() =>
      expect(result.current.allAccountsFilterAccountIds).toEqual([account.id]),
    )

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() =>
      expect(result.current.allAccountsFilterAccountIds).toEqual([]),
    )
  })

  it("clears the all-accounts filter when the filtered account disappears", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const accountA = createDisplayAccount({
      id: "filter-a",
      name: "Filter Account A",
    })
    const accountB = createDisplayAccount({
      id: "filter-b",
      name: "Filter Account B",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [accountA, accountB],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result, rerender } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE)
    })

    await waitFor(() =>
      expect(result.current.selectedAccount).toBe(
        KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      ),
    )

    act(() => {
      result.current.setAllAccountsFilterAccountIds([accountA.id, accountB.id])
    })

    await waitFor(() =>
      expect(result.current.allAccountsFilterAccountIds).toEqual([
        accountA.id,
        accountB.id,
      ]),
    )

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [accountB],
    } as any)
    rerender()

    await waitFor(() =>
      expect(result.current.allAccountsFilterAccountIds).toEqual([accountB.id]),
    )
    expect(result.current.selectedAccount).toBe(
      KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
    )
  })

  it("treats non-array token payloads as a load failure with the fallback toast", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "invalid-payload-acc",
      name: "Invalid Payload Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue({
      items: [],
    })
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "keyManagement:messages.loadFailed",
      )
    })
    expect(result.current.tokens).toEqual([])
  })

  it("copies a resolved token secret to the clipboard and shows success feedback", async () => {
    const account = createDisplayAccount({
      id: "copy-acc",
      name: "Copy Account",
    })
    const token = createToken({
      id: 902,
      accountId: account.id,
      accountName: account.name,
      key: "masked-token",
      name: "Copy Token",
    })

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    vi.mocked(getApiService).mockReturnValue({
      resolveApiTokenKey: vi.fn().mockResolvedValue("resolved-token-secret"),
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.copyKey(account, token)
    })

    expect(writeText).toHaveBeenCalledWith("resolved-token-secret")
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      "keyManagement:messages.keyCopied",
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "resolved-token-secret",
    )
  })

  it("shows the clipboard error message when writing to the clipboard fails", async () => {
    const account = createDisplayAccount({
      id: "copy-fail-acc",
      name: "Copy Fail Account",
    })
    const token = createToken({
      id: 903,
      accountId: account.id,
      accountName: account.name,
      key: "masked-token",
      name: "Copy Fail Token",
    })

    const writeText = vi.fn().mockRejectedValue(new Error("denied"))
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    vi.mocked(getApiService).mockReturnValue({
      resolveApiTokenKey: vi.fn().mockResolvedValue("resolved-token-secret"),
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.copyKey(account, token)
    })

    expect(writeText).toHaveBeenCalledWith("resolved-token-secret")
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("denied")
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
      },
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "resolved-token-secret",
    )
  })

  it("shows the resolver error message when a saved masked key cannot be copied", async () => {
    const account = createDisplayAccount({
      id: "copy-unavailable-acc",
      name: "Copy Unavailable Account",
    })
    const token = createToken({
      id: 913,
      accountId: account.id,
      accountName: account.name,
      key: "sk-abcd************wxyz",
      name: "Copy Unavailable Token",
    })

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    vi.mocked(getApiService).mockReturnValue({
      resolveApiTokenKey: vi
        .fn()
        .mockRejectedValue(
          new ApiError(
            "messages:errors.tokenSecretUnavailable",
            undefined,
            undefined,
            API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
          ),
        ),
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.copyKey(account, token)
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "messages:errors.tokenSecretUnavailable",
    )
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })

  it("deduplicates reveal requests while a key is already resolving", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "resolve-acc",
      name: "Resolve Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    let resolveApiTokenKeyPromise: (value: string) => void = () => {}
    const resolveApiTokenKey = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveApiTokenKeyPromise = resolve
        }),
    )
    const fetchAccountTokens = vi.fn().mockResolvedValue([
      createToken({
        id: 904,
        key: "masked-token",
        name: "Resolve Token",
        accountId: account.id,
        accountName: account.name,
        expired_time: 0,
      }),
    ])
    vi.mocked(getApiService).mockReturnValue({
      fetchAccountTokens,
      resolveApiTokenKey,
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))
    const token = result.current.tokens[0]!
    const tokenIdentityKey = buildTokenIdentityKey(token.accountId, token.id)

    let firstReveal!: Promise<void>
    act(() => {
      firstReveal = result.current.toggleKeyVisibility(account, token)
    })
    await waitFor(() =>
      expect(result.current.resolvingVisibleKeys.has(tokenIdentityKey)).toBe(
        true,
      ),
    )

    await act(async () => {
      await result.current.toggleKeyVisibility(account, token)
    })

    expect(resolveApiTokenKey).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveApiTokenKeyPromise("resolved-token-secret")
      await firstReveal
    })

    await waitFor(() =>
      expect(result.current.visibleKeys.has(tokenIdentityKey)).toBe(true),
    )
    expect(result.current.getVisibleTokenKey(token)).toBe(
      "resolved-token-secret",
    )
  })

  it("shows the resolver error message when revealing a saved masked key fails", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "reveal-unavailable-acc",
      name: "Reveal Unavailable Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const token = createToken({
      id: 914,
      key: "sk-abcd************wxyz",
      name: "Reveal Unavailable Token",
      accountId: account.id,
      accountName: account.name,
      expired_time: 0,
    })
    const resolveApiTokenKey = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          "messages:errors.tokenSecretUnavailable",
          undefined,
          undefined,
          API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
        ),
      )
    vi.mocked(getApiService).mockReturnValue({
      fetchAccountTokens: vi.fn().mockResolvedValue([token]),
      resolveApiTokenKey,
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))

    await act(async () => {
      await result.current.toggleKeyVisibility(
        account,
        result.current.tokens[0]!,
      )
    })

    expect(resolveApiTokenKey).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "messages:errors.tokenSecretUnavailable",
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RevealAccountTokenKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })

  it("does not show reveal failure feedback when analytics completion rejects after a successful reveal", async () => {
    const account = createDisplayAccount({
      id: "reveal-analytics-fail-acc",
      name: "Reveal Analytics Failure Account",
    })
    const token = createToken({
      id: 915,
      key: "sk-reveal************mask",
      name: "Reveal Analytics Failure Token",
      accountId: account.id,
      accountName: account.name,
      expired_time: 0,
    })

    vi.mocked(useAccountData).mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const resolveApiTokenKey = vi.fn().mockResolvedValue("resolved-token-key")
    vi.mocked(getApiService).mockReturnValue({
      fetchAccountTokens: vi.fn().mockResolvedValue([token]),
      resolveApiTokenKey,
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))
    trackerCompleteMock.mockRejectedValueOnce(new Error("analytics down"))

    await act(async () => {
      await result.current.toggleKeyVisibility(account, token)
    })

    expect(resolveApiTokenKey).toHaveBeenCalledTimes(1)
    expect(result.current.getVisibleTokenKey(token)).toBe("resolved-token-key")
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("opens add-token state, edits a token, and reloads the current inventory on close", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "dialog-acc",
      name: "Dialog Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const token = createToken({
      id: 905,
      key: "token-905",
      name: "Dialog Token",
      accountId: account.id,
      accountName: account.name,
      expired_time: 0,
    })
    const fetchAccountTokens = vi
      .fn()
      .mockResolvedValueOnce([token])
      .mockResolvedValueOnce([token])
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))

    act(() => {
      result.current.handleAddToken()
    })

    expect(result.current.isAddTokenOpen).toBe(true)
    expect(result.current.editingToken).toBeNull()

    act(() => {
      result.current.handleEditToken(token)
    })

    expect(result.current.isAddTokenOpen).toBe(true)
    expect(result.current.editingToken).toEqual(token)

    act(() => {
      result.current.handleCloseAddToken()
    })

    await waitFor(() => expect(result.current.isAddTokenOpen).toBe(false))
    expect(result.current.editingToken).toBeNull()
    await waitFor(() => expect(fetchAccountTokens).toHaveBeenCalledTimes(2))
  })

  it("closes add-token state without reloading when no account is selected", () => {
    vi.mocked(useAccountData).mockReturnValue({
      enabledDisplayData: [],
    } as any)

    const fetchAccountTokens = vi.fn()
    vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.handleAddToken()
    })

    expect(result.current.isAddTokenOpen).toBe(true)

    act(() => {
      result.current.handleCloseAddToken()
    })

    expect(result.current.isAddTokenOpen).toBe(false)
    expect(result.current.editingToken).toBeNull()
    expect(fetchAccountTokens).not.toHaveBeenCalled()
  })

  it("shows an account-not-found error when deleting a token for a missing account", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [],
    } as any)

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.handleDeleteToken(
        createToken({
          id: 906,
          name: "Missing Account Token",
          accountId: "missing-acc",
          accountName: "Missing Account",
        }),
      )
    })

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "keyManagement:messages.accountNotFound",
    )

    confirmSpy.mockRestore()
  })

  it("does not delete a token when the confirmation dialog is cancelled", async () => {
    const account = createDisplayAccount({
      id: "cancel-delete-acc",
      name: "Cancel Delete Account",
    })
    const token = createToken({
      id: 908,
      key: "token-908",
      name: "Cancel Delete Token",
      accountId: account.id,
      accountName: account.name,
      expired_time: 0,
    })

    vi.mocked(useAccountData).mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([token])
    const deleteApiToken = vi.fn()
    vi.mocked(getApiService).mockReturnValue({
      fetchAccountTokens,
      deleteApiToken,
    } as any)

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))

    await act(async () => {
      await result.current.handleDeleteToken(token)
    })

    expect(deleteApiToken).not.toHaveBeenCalled()
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  it("shows the delete error when token deletion fails", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const account = createDisplayAccount({
      id: "delete-fail-acc",
      name: "Delete Fail Account",
    })

    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const token = createToken({
      id: 907,
      key: "token-907",
      name: "Delete Fail Token",
      accountId: account.id,
      accountName: account.name,
      expired_time: 0,
    })
    const fetchAccountTokens = vi.fn().mockResolvedValue([token])
    const deleteApiToken = vi.fn().mockRejectedValue(new Error("delete boom"))
    vi.mocked(getApiService).mockReturnValue({
      fetchAccountTokens,
      deleteApiToken,
    } as any)

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))

    await act(async () => {
      await result.current.handleDeleteToken(token)
    })

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("delete boom")
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccountToken,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )

    confirmSpy.mockRestore()
  })

  it("tracks confirmed token deletion without raw token metadata", async () => {
    const account = createDisplayAccount({
      id: "delete-analytics-acc",
      name: "Raw Delete Account",
    })
    const token = createToken({
      id: 909,
      key: "sk-delete-secret",
      name: "Raw Delete Token",
      accountId: account.id,
      accountName: account.name,
      expired_time: 0,
    })

    vi.mocked(useAccountData).mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([token])
    const deleteApiToken = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getApiService).mockReturnValue({
      fetchAccountTokens,
      deleteApiToken,
    } as any)

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))
    trackerCompleteMock.mockClear()
    startProductAnalyticsActionMock.mockClear()

    await act(async () => {
      await result.current.handleDeleteToken(token)
    })

    expect(deleteApiToken).toHaveBeenCalledWith(expect.anything(), token.id)
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccountToken,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "sk-delete-secret",
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "Raw Delete",
    )

    confirmSpy.mockRestore()
  })

  it("does not show delete failure feedback when analytics completion rejects after a successful delete", async () => {
    const account = createDisplayAccount({
      id: "delete-analytics-fail-acc",
      name: "Delete Analytics Failure Account",
    })
    const token = createToken({
      id: 910,
      key: "sk-delete-analytics-failure",
      name: "Delete Analytics Failure Token",
      accountId: account.id,
      accountName: account.name,
      expired_time: 0,
    })

    vi.mocked(useAccountData).mockReturnValue({
      enabledDisplayData: [account],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([token])
    const deleteApiToken = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getApiService).mockReturnValue({
      fetchAccountTokens,
      deleteApiToken,
    } as any)

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount(account.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))
    trackerCompleteMock.mockRejectedValueOnce(new Error("analytics down"))

    await act(async () => {
      await result.current.handleDeleteToken(token)
    })

    expect(deleteApiToken).toHaveBeenCalledWith(expect.anything(), token.id)
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      "keyManagement:messages.deleteSuccess",
    )
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )

    confirmSpy.mockRestore()
  })
})
