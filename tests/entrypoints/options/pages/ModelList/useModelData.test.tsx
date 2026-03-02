import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { useModelData } from "~/features/ModelList/hooks/useModelData"
import { getApiService } from "~/services/apiService"
import testI18n from "~/tests/test-utils/i18n"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
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
  it("does not fetch all-account pricing until selectedAccount is 'all'", async () => {
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
          selectedAccount: "",
          accounts,
          selectedGroup: "default",
        }),
      { wrapper: createWrapper() },
    )

    // Yield at least one tick; with the pre-fix behaviour this would start queries immediately.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchModelPricing).not.toHaveBeenCalled()
  })

  it("fetches all-account pricing when selectedAccount is 'all'", async () => {
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
          selectedAccount: "all",
          accounts,
          selectedGroup: "default",
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(fetchModelPricing).toHaveBeenCalledTimes(2))
    const calledAccountIds = fetchModelPricing.mock.calls.map(
      (call) => call[0]?.accountId,
    )
    expect(calledAccountIds).toEqual(expect.arrayContaining(["a", "b"]))
  })
})
