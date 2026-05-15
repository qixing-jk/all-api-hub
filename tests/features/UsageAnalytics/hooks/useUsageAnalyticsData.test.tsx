import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUsageAnalyticsData } from "~/features/UsageAnalytics/hooks/useUsageAnalyticsData"
import { accountStorage } from "~/services/accounts/accountStorage"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { startProductAnalyticsActionMock, completeProductAnalyticsActionMock } =
  vi.hoisted(() => ({
    startProductAnalyticsActionMock: vi.fn(),
    completeProductAnalyticsActionMock: vi.fn(),
  }))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn() },
}))

vi.mock("~/services/history/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
}))

describe("useUsageAnalyticsData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
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

    vi.mocked(accountStorage.getAllAccounts)
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
      expect(accountStorage.getAllAccounts).toHaveBeenCalledTimes(2)
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

    vi.mocked(accountStorage.getAllAccounts)
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
