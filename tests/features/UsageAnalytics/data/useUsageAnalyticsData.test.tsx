import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUsageAnalyticsData } from "~/features/UsageAnalytics/data/useUsageAnalyticsData"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { SiteAccount } from "~/types"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const { startProductAnalyticsActionMock, completeProductAnalyticsActionMock } =
  vi.hoisted(() => ({
    startProductAnalyticsActionMock: vi.fn(),
    completeProductAnalyticsActionMock: vi.fn(),
  }))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: vi.fn() },
}))

vi.mock("~/services/history/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
}))

describe("useUsageAnalyticsData", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("rejects an older complete snapshot after a newer refresh", async () => {
    const oldAccounts = createDeferred<SiteAccount[]>()
    vi.mocked(accountQueries.getAllAccounts)
      .mockReturnValueOnce(oldAccounts.promise)
      .mockResolvedValueOnce([buildSiteAccount({ id: "new" })])
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 1,
      accounts: {},
    })
    const { result } = renderHook(() => useUsageAnalyticsData())
    await act(async () => result.current.loadData())
    await act(async () =>
      oldAccounts.resolve([buildSiteAccount({ id: "old", disabled: true })]),
    )
    expect(result.current.accounts.map((a) => a.id)).toEqual(["new"])
    expect([...result.current.disabledAccountIdSet]).toEqual([])
  })

  it.each(["success", "failure"])(
    "does not let an older %s end newer loading",
    async (outcome) => {
      const oldAccounts = createDeferred<SiteAccount[]>()
      const newAccounts = createDeferred<SiteAccount[]>()
      vi.mocked(accountQueries.getAllAccounts)
        .mockReturnValueOnce(oldAccounts.promise)
        .mockReturnValueOnce(newAccounts.promise)
      vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: 1,
        accounts: {},
      })
      const { result } = renderHook(() => useUsageAnalyticsData())
      let next!: Promise<void>
      act(() => {
        next = result.current.loadData({ trackAnalytics: true })
      })
      await act(async () => {
        if (outcome === "success") oldAccounts.resolve([])
        else oldAccounts.reject(new Error("old"))
      })
      expect(result.current.isLoading).toBe(true)
      await act(async () => {
        newAccounts.resolve([buildSiteAccount({ id: "new" })])
        await next
      })
      expect(result.current.accounts.map((a) => a.id)).toEqual(["new"])
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        expect.anything(),
      )
    },
  )

  it("does not admit retained reloads after unmount", async () => {
    const pending = createDeferred<SiteAccount[]>()
    vi.mocked(accountQueries.getAllAccounts).mockReturnValueOnce(
      pending.promise,
    )
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 1,
      accounts: {},
    })
    const { result, unmount } = renderHook(() => useUsageAnalyticsData())
    const reload = result.current.loadData
    unmount()
    await act(async () => {
      pending.resolve([])
      await reload({ trackAnalytics: true })
    })
    expect(accountQueries.getAllAccounts).toHaveBeenCalledOnce()
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()
  })

  it("loads accounts, filters enabled accounts, and refreshes on demand", async () => {
    const enabledAccount = buildSiteAccount({
      id: "enabled-account",
      disabled: false,
    })
    const disabledAccount = buildSiteAccount({
      id: "disabled-account",
      disabled: true,
    })

    vi.mocked(accountQueries.getAllAccounts)
      .mockResolvedValueOnce([enabledAccount, disabledAccount] as any)
      .mockResolvedValueOnce([enabledAccount] as any)
    vi.mocked(usageHistoryStorage.getStore)
      .mockResolvedValueOnce({ schemaVersion: 2, accounts: {} } as any)
      .mockResolvedValueOnce({
        schemaVersion: 2,
        accounts: {
          "enabled-account": {
            daily: {
              "2026-01-01": {
                requests: 1,
                promptTokens: 1,
                completionTokens: 1,
                totalTokens: 2,
                quotaConsumed: 1,
              },
            },
          },
        },
      } as any)

    const { result } = renderHook(() => useUsageAnalyticsData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.accounts.map((account) => account.id)).toEqual([
        "enabled-account",
        "disabled-account",
      ])
      expect(
        result.current.enabledAccounts.map((account) => account.id),
      ).toEqual(["enabled-account"])
      expect(Array.from(result.current.disabledAccountIdSet)).toEqual([
        "disabled-account",
      ])
    })
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.loadData({ trackAnalytics: true })
    })

    await waitFor(() => {
      expect(accountQueries.getAllAccounts).toHaveBeenCalledTimes(2)
      expect(usageHistoryStorage.getStore).toHaveBeenCalledTimes(2)
      expect(result.current.accounts.map((account) => account.id)).toEqual([
        "enabled-account",
      ])
      expect(
        result.current.enabledAccounts.map((account) => account.id),
      ).toEqual(["enabled-account"])
      expect(Array.from(result.current.disabledAccountIdSet)).toEqual([])
      expect(result.current.store).toMatchObject({
        schemaVersion: 2,
      })
    })
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshUsageAnalyticsData,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsUsageAnalyticsHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
          usageDataPresent: true,
        },
      },
    )
  })

  it("keeps prior data and clears loading when a reload fails", async () => {
    const account = buildSiteAccount({
      id: "account-a",
      disabled: false,
    })
    const initialStore = { schemaVersion: 2, accounts: {} }

    vi.mocked(accountQueries.getAllAccounts)
      .mockResolvedValueOnce([account] as any)
      .mockRejectedValueOnce(new Error("accounts exploded"))
    vi.mocked(usageHistoryStorage.getStore)
      .mockResolvedValueOnce(initialStore as any)
      .mockResolvedValueOnce(initialStore as any)

    const { result } = renderHook(() => useUsageAnalyticsData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.accounts.map((current) => current.id)).toEqual([
        "account-a",
      ])
      expect(result.current.store).toEqual(initialStore)
    })

    await act(async () => {
      await result.current.loadData({ trackAnalytics: true })
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.accounts.map((current) => current.id)).toEqual([
        "account-a",
      ])
      expect(result.current.store).toEqual(initialStore)
      expect(
        result.current.enabledAccounts.map((current) => current.id),
      ).toEqual(["account-a"])
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })
})
