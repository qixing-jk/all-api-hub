import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useKeyManagement } from "~/entrypoints/options/pages/KeyManagement/hooks/useKeyManagement"
import { useAccountData } from "~/hooks/useAccountData"
import { getApiService } from "~/services/apiService"
import testI18n from "~/tests/test-utils/i18n"
import { createToken } from "~/tests/utils/keyManagementFactories"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

vi.mock("~/hooks/useAccountData", () => ({
  useAccountData: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
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
})
