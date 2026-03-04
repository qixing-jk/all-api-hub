import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useAccountData } from "~/hooks/useAccountData"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const { mockGetAllAccounts, mockGetAccountStats, mockConvertToDisplayData } =
  vi.hoisted(() => ({
    mockGetAllAccounts: vi.fn(),
    mockGetAccountStats: vi.fn(),
    mockConvertToDisplayData: vi.fn(),
  }))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: mockGetAllAccounts,
    getAccountStats: mockGetAccountStats,
    convertToDisplayData: mockConvertToDisplayData,
    refreshAllAccounts: vi.fn(async () => ({ success: 0, failed: 0 })),
  },
}))

afterEach(() => {
  vi.clearAllMocks()
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
  siteType: "default",
  baseUrl: "https://example.com",
  token: "token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

describe("useAccountData enabled slices", () => {
  it("provides enabledAccounts and enabledDisplayData excluding disabled entries", async () => {
    mockGetAllAccounts.mockResolvedValue([
      { id: "enabled", last_sync_time: 0 },
      { id: "disabled", last_sync_time: 0, disabled: true },
    ])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })

    const enabledDisplay = createDisplayAccount({
      id: "enabled",
      name: "Enabled",
    })
    mockConvertToDisplayData.mockReturnValue([
      enabledDisplay,
      createDisplayAccount({
        id: "disabled",
        name: "Disabled",
        disabled: true,
      }),
    ])

    const { result } = renderHook(() => useAccountData())

    await waitFor(() => expect(result.current.displayData).toHaveLength(2))

    expect(result.current.enabledAccounts.map((account) => account.id)).toEqual(
      ["enabled"],
    )
    expect(
      result.current.enabledDisplayData.map((account) => account.id),
    ).toEqual(["enabled"])
  })
})
