import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useAccountData } from "~/hooks/useAccountData"
import type { AccountOverviewSnapshot } from "~/services/accounts/accountStorage/accountReadModels"
import type {
  ProtectionBypassSurface,
  ProtectionBypassUserCommand,
} from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildAccountStats } from "~~/tests/test-utils/accountTodayStats"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const {
  mockGetAccountOverviewSnapshot,
  mockRefreshAllAccounts,
  mockWithProtectionBypassUserCommand,
} = vi.hoisted(() => ({
  mockGetAccountOverviewSnapshot: vi.fn(),
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

vi.mock("~/services/accounts/accountStorage/accountReadModels", () => ({
  accountReadModels: {
    getAccountOverviewSnapshot: mockGetAccountOverviewSnapshot,
  },
}))
vi.mock("~/services/accounts/accountStorage/accountRefresh", () => ({
  accountRefresh: { refreshAllAccounts: mockRefreshAllAccounts },
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

const createOverviewSnapshot = (
  overrides: Partial<AccountOverviewSnapshot> = {},
): AccountOverviewSnapshot => ({
  accounts: [],
  displayAccounts: [],
  stats: buildAccountStats(),
  ...overrides,
})

describe("useAccountData enabled slices", () => {
  it("finishes the initial load state when the account snapshot read fails", async () => {
    mockGetAccountOverviewSnapshot.mockRejectedValueOnce(
      new Error("read failed"),
    )

    const { result } = renderHook(() => useAccountData())

    await waitFor(() => expect(result.current.isInitialLoad).toBe(false))
    expect(result.current.accounts).toEqual([])
    expect(result.current.displayData).toEqual([])
  })

  it("retains the previous successful snapshot for animation across reload and refresh", async () => {
    const first = createOverviewSnapshot({
      displayAccounts: [
        createDisplayAccount({
          id: "first",
          balance: { USD: 12, CNY: 84 },
          todayConsumption: { USD: 2, CNY: 14 },
        }),
      ],
    })
    const second = createOverviewSnapshot({
      displayAccounts: [
        createDisplayAccount({
          id: "second",
          balance: { USD: 9, CNY: 63 },
          todayConsumption: { USD: 3, CNY: 21 },
        }),
      ],
    })
    mockGetAccountOverviewSnapshot.mockResolvedValueOnce(first)
    const { result } = renderHook(() => useAccountData())
    await waitFor(() => expect(result.current.isInitialLoad).toBe(false))
    const load = result.current.loadAccountData
    expect(result.current.prevBalances).toEqual({})
    expect(result.current.prevTotalConsumption).toEqual({ USD: 0, CNY: 0 })

    mockGetAccountOverviewSnapshot.mockResolvedValueOnce(second)
    await act(async () => {
      await load()
    })
    expect(result.current.prevBalances).toEqual({ first: { USD: 12, CNY: 84 } })
    expect(result.current.prevTotalConsumption).toEqual({ USD: 2, CNY: 14 })

    mockGetAccountOverviewSnapshot.mockRejectedValueOnce(
      new Error("read failed"),
    )
    await act(async () => {
      await load()
    })
    expect(result.current.displayData).toEqual(second.displayAccounts)
    expect(result.current.prevBalances).toEqual({ first: { USD: 12, CNY: 84 } })

    mockGetAccountOverviewSnapshot.mockResolvedValueOnce(
      createOverviewSnapshot(),
    )
    mockRefreshAllAccounts.mockResolvedValue({ success: 0, failed: 0 })
    await act(async () => {
      await result.current.handleRefresh()
    })
    expect(result.current.prevBalances).toEqual({ second: { USD: 9, CNY: 63 } })
    expect(result.current.prevTotalConsumption).toEqual({ USD: 3, CNY: 21 })
    expect(result.current.loadAccountData).toBe(load)
    expect(mockGetAccountOverviewSnapshot).toHaveBeenCalledTimes(4)
  })

  it("loads one snapshot on mount without repeating the full account read when loading completes", async () => {
    mockGetAccountOverviewSnapshot.mockResolvedValue(createOverviewSnapshot())
    const { result, rerender } = renderHook(() => useAccountData())
    await waitFor(() => expect(result.current.isInitialLoad).toBe(false))
    rerender()
    expect(mockGetAccountOverviewSnapshot).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.loadAccountData()
    })
    expect(mockGetAccountOverviewSnapshot).toHaveBeenCalledTimes(2)
  })
  it("wraps handleRefresh in one refresh-all intent and forwards its execution", async () => {
    mockGetAccountOverviewSnapshot.mockResolvedValue(createOverviewSnapshot())
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
    mockGetAccountOverviewSnapshot.mockResolvedValue(createOverviewSnapshot())
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
    mockGetAccountOverviewSnapshot.mockReturnValue(new Promise(() => undefined))

    const { result } = renderHook(() => useAccountData())

    expect(result.current.stats.todayStatsCoverage.consumption.status).toBe(
      ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    )
  })

  it("provides enabledAccounts and enabledDisplayData excluding disabled entries", async () => {
    const enabledDisplay = createDisplayAccount({
      id: "enabled",
      name: "Enabled",
    })
    mockGetAccountOverviewSnapshot.mockResolvedValue(
      createOverviewSnapshot({
        accounts: [
          buildSiteAccount({ id: "enabled", last_sync_time: 0 }),
          buildSiteAccount({
            id: "disabled",
            last_sync_time: 0,
            disabled: true,
          }),
        ],
        displayAccounts: [
          enabledDisplay,
          createDisplayAccount({
            id: "disabled",
            name: "Disabled",
            disabled: true,
          }),
        ],
      }),
    )

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
