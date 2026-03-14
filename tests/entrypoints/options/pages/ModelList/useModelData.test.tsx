import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useModelData } from "~/features/ModelList/hooks/useModelData"
import {
  createAllAccountsSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import { getApiService } from "~/services/apiService"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { testI18n } from "~~/tests/test-utils/i18n"

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
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
  beforeEach(() => {
    mockFetchApiCredentialModelIds.mockReset()
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
})
