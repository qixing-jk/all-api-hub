import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useAccountData } from "~/hooks/useAccountData"
import type { DisplaySiteData } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { buildAccountStats } from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

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
  ...buildDisplaySiteData({ siteType: SITE_TYPES.UNKNOWN, ...overrides }),
})

describe("useAccountData enabled slices", () => {
  it("starts with unavailable empty statistics coverage", () => {
    mockGetAllAccounts.mockReturnValue(new Promise(() => undefined))

    const { result } = renderHook(() => useAccountData())

    expect(result.current.stats.todayStatsCoverage.consumption.status).toBe(
      ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    )
  })

  it("provides enabledAccounts and enabledDisplayData excluding disabled entries", async () => {
    mockGetAllAccounts.mockResolvedValue([
      { id: "enabled", last_sync_time: 0 },
      { id: "disabled", last_sync_time: 0, disabled: true },
    ])
    mockGetAccountStats.mockResolvedValue(buildAccountStats())

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
