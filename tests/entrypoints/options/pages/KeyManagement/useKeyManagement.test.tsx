import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { useKeyManagement } from "~/features/KeyManagement/hooks/useKeyManagement"
import { buildTokenIdentityKey } from "~/features/KeyManagement/utils"
import { useAccountData } from "~/hooks/useAccountData"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { testI18n } from "~~/tests/test-utils/i18n"
import { createToken } from "~~/tests/utils/keyManagementFactories"

const {
  getManagedSiteTokenChannelStatusMock,
  managedSiteTokenChannelStatuses,
  mockedUseUserPreferencesContext,
} = vi.hoisted(() => ({
  getManagedSiteTokenChannelStatusMock: vi.fn(),
  managedSiteTokenChannelStatuses: {
    ADDED: "added",
    NOT_ADDED: "not-added",
    UNKNOWN: "unknown",
  },
  mockedUseUserPreferencesContext: vi.fn(),
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
  siteType: "default",
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

describe("useKeyManagement enabled account filtering", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
    getManagedSiteTokenChannelStatusMock.mockReset()
    getManagedSiteTokenChannelStatusMock.mockResolvedValue({
      status: managedSiteTokenChannelStatuses.NOT_ADDED,
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
      result.current.setAllAccountsFilterAccountId(accountA.id)
    })

    await waitFor(() => expect(result.current.tokens).toHaveLength(1))
    expect(result.current.tokens[0]?.accountId).toBe(accountA.id)

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

    await act(async () => {
      await result.current.toggleKeyVisibility(account, token)
    })
    expect(result.current.visibleKeys.has(tokenIdentityKey)).toBe(false)

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
})
