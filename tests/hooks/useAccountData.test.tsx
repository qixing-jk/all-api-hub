import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useAccountData } from "~/hooks/useAccountData"
import type {
  ProtectionBypassSurface,
  ProtectionBypassUserCommand,
} from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildAccountStats } from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const {
  mockGetAllAccounts,
  mockGetAccountStats,
  mockConvertToDisplayData,
  mockRefreshAllAccounts,
  mockWithProtectionBypassUserCommand,
} = vi.hoisted(() => ({
  mockGetAllAccounts: vi.fn(),
  mockGetAccountStats: vi.fn(),
  mockConvertToDisplayData: vi.fn(),
  mockRefreshAllAccounts: vi.fn(),
  mockWithProtectionBypassUserCommand: vi.fn(),
}))

vi.mock("~/services/protectionBypass/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/protectionBypass/client")>()
  return {
    ...actual,
    withProtectionBypassUserCommand: mockWithProtectionBypassUserCommand,
  }
})

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: mockGetAllAccounts,
    getAccountStats: mockGetAccountStats,
    convertToDisplayData: mockConvertToDisplayData,
    refreshAllAccounts: mockRefreshAllAccounts,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockWithProtectionBypassUserCommand.mockImplementation(
    async (
      command: ProtectionBypassUserCommand,
      surface: ProtectionBypassSurface,
      work: (execution: unknown) => Promise<unknown>,
    ) => work(userCommandExecution(command, surface)),
  )
})

const createDisplayAccount = (
  overrides: Partial<DisplaySiteData>,
): DisplaySiteData => ({
  ...buildDisplaySiteData({ siteType: SITE_TYPES.UNKNOWN, ...overrides }),
})

describe("useAccountData enabled slices", () => {
  it("wraps handleRefresh in one refresh-all intent and forwards its execution", async () => {
    mockGetAllAccounts.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue(buildAccountStats())
    mockConvertToDisplayData.mockReturnValue([])
    mockRefreshAllAccounts.mockResolvedValue({ success: 0, failed: 0 })

    const { result } = renderHook(() => useAccountData())
    await waitFor(() => expect(result.current.isInitialLoad).toBe(false))

    await act(async () => {
      await result.current.handleRefresh()
    })

    expect(mockRefreshAllAccounts).toHaveBeenCalledWith(
      false,
      expect.objectContaining({
        protectionBypassExecution: expect.objectContaining(
          userCommandExecution("refresh_all_accounts", "background"),
        ),
      }),
    )
  })

  it("blocks duplicate refreshes while intent creation is pending", async () => {
    let releaseIntent!: () => void
    const intentReady = new Promise<void>((resolve) => {
      releaseIntent = resolve
    })
    mockWithProtectionBypassUserCommand.mockImplementationOnce(
      async (
        command: ProtectionBypassUserCommand,
        surface: ProtectionBypassSurface,
        work: (execution: unknown) => Promise<unknown>,
      ) => {
        await intentReady
        return work(userCommandExecution(command, surface))
      },
    )
    mockGetAllAccounts.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue(buildAccountStats())
    mockConvertToDisplayData.mockReturnValue([])
    mockRefreshAllAccounts.mockResolvedValue({ success: 0, failed: 0 })

    const { result } = renderHook(() => useAccountData())
    await waitFor(() => expect(result.current.isInitialLoad).toBe(false))

    let firstRefresh!: Promise<unknown>
    act(() => {
      firstRefresh = result.current.handleRefresh()
      void result.current.handleRefresh()
    })

    expect(mockWithProtectionBypassUserCommand).toHaveBeenCalledTimes(1)
    expect(mockRefreshAllAccounts).not.toHaveBeenCalled()

    await act(async () => {
      releaseIntent()
      await firstRefresh
    })

    expect(mockRefreshAllAccounts).toHaveBeenCalledTimes(1)
  })

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
