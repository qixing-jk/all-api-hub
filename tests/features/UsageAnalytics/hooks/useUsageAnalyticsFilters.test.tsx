import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useUsageAnalyticsFilters } from "~/features/UsageAnalytics/hooks/useUsageAnalyticsFilters"
import * as usageAnalytics from "~/services/history/usageHistory/analytics"
import { createEmptyUsageHistoryAccountStore } from "~/services/history/usageHistory/core"
import type { SiteAccount } from "~/types"
import type { UsageHistoryStore } from "~/types/usageHistory"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

type HookProps = {
  enabledAccounts: SiteAccount[]
  isLoading: boolean
}

describe("useUsageAnalyticsFilters", () => {
  const createStore = (
    accounts: Record<
      string,
      ReturnType<typeof createEmptyUsageHistoryAccountStore>
    >,
  ): UsageHistoryStore => ({
    schemaVersion: 1,
    accounts,
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("preserves restored site selections until account loading finishes", async () => {
    const account = buildSiteAccount({
      id: "account-a",
      site_name: "Shared Site",
    })

    const { result, rerender } = renderHook(
      ({ enabledAccounts, isLoading }: HookProps) =>
        useUsageAnalyticsFilters({
          enabledAccounts,
          store: null,
          disabledAccountIdSet: new Set<string>(),
          isLoading,
        }),
      {
        initialProps: {
          enabledAccounts: [] as SiteAccount[],
          isLoading: true,
        },
      },
    )

    await waitFor(() => {
      expect(result.current).toBeTruthy()
    })

    act(() => {
      result.current!.setSelectedSiteAccountIds([account.id])
    })

    expect(result.current!.selectedSiteAccountIds).toEqual([account.id])

    rerender({
      enabledAccounts: [],
      isLoading: true,
    })

    expect(result.current!.selectedSiteAccountIds).toEqual([account.id])

    rerender({
      enabledAccounts: [account],
      isLoading: false,
    })

    await waitFor(() => {
      expect(result.current!.selectedSiteAccountIds).toEqual([account.id])
    })

    rerender({
      enabledAccounts: [],
      isLoading: false,
    })

    await waitFor(() => {
      expect(result.current!.selectedSiteAccountIds).toEqual([])
    })
  })

  it("cleans selected accounts and tokens when the selected site no longer includes them", async () => {
    const accountA = buildSiteAccount({
      id: "account-a",
      site_name: "Site A",
      account_info: { username: "alice" } as any,
    })
    const accountB = buildSiteAccount({
      id: "account-b",
      site_name: "Site B",
      account_info: { username: "bob" } as any,
    })

    const storeA = createEmptyUsageHistoryAccountStore()
    storeA.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5,
      quotaConsumed: 1,
    }
    storeA.dailyByToken["1"] = {
      "2026-01-01": { ...storeA.daily["2026-01-01"] },
    }
    storeA.tokenNamesById["1"] = "Token A"

    const storeB = createEmptyUsageHistoryAccountStore()
    storeB.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      quotaConsumed: 1,
    }
    storeB.dailyByToken["2"] = {
      "2026-01-01": { ...storeB.daily["2026-01-01"] },
    }
    storeB.tokenNamesById["2"] = "Token B"

    const { result } = renderHook(() =>
      useUsageAnalyticsFilters({
        enabledAccounts: [accountA, accountB],
        store: createStore({
          "account-a": storeA,
          "account-b": storeB,
        }),
        disabledAccountIdSet: new Set<string>(),
        isLoading: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.startDay).toBe("2026-01-01")
      expect(result.current.endDay).toBe("2026-01-01")
      expect(result.current.tokenOptions).toHaveLength(2)
    })

    act(() => {
      result.current.setSelectedAccountIds(["account-a"])
      result.current.setSelectedTokenIds(["1"])
      result.current.setSelectedSiteAccountIds(["account-b"])
    })

    await waitFor(() => {
      expect(result.current.selectedAccountIds).toEqual([])
      expect(result.current.selectedTokenIds).toEqual([])
      expect(result.current.resolvedAccountIds).toEqual(["account-b"])
      expect(
        result.current.accountsForSelectedSites.map((account) => account.id),
      ).toEqual(["account-b"])
    })
  })

  it("uses a __none__ export selection when all resolved accounts are disabled", async () => {
    const disabledStore = createEmptyUsageHistoryAccountStore()
    disabledStore.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5,
      quotaConsumed: 1,
    }

    const { result } = renderHook(() =>
      useUsageAnalyticsFilters({
        enabledAccounts: [],
        store: createStore({
          "disabled-account": disabledStore,
        }),
        disabledAccountIdSet: new Set(["disabled-account"]),
        isLoading: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.resolvedAccountIds).toEqual([])
      expect(result.current.availableDayKeys).toEqual([])
      expect(result.current.exportSelection).toBeNull()
    })

    act(() => {
      result.current.setStartDay("2026-01-01")
      result.current.setEndDay("2026-01-01")
    })

    await waitFor(() => {
      expect(result.current.exportSelection).toEqual({
        accountIds: ["__none__"],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      })
      expect(result.current.exportPreview).not.toBeNull()
    })
  })

  it("derives a rolling default range, ignores out-of-range token usage, and normalizes inverted dates", async () => {
    const account = buildSiteAccount({
      id: "account-a",
      site_name: "Range Site",
    })

    const accountStore = createEmptyUsageHistoryAccountStore()
    for (let day = 1; day <= 10; day += 1) {
      const dayKey = `2026-01-${String(day).padStart(2, "0")}`
      accountStore.daily[dayKey] = {
        requests: 1,
        promptTokens: 2,
        completionTokens: 3,
        totalTokens: 5,
        quotaConsumed: 1,
      }
    }
    accountStore.dailyByToken["fresh-token"] = {
      "2026-01-10": { ...accountStore.daily["2026-01-10"] },
    }
    accountStore.dailyByToken["stale-token"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }

    const { result } = renderHook(() =>
      useUsageAnalyticsFilters({
        enabledAccounts: [account],
        store: createStore({
          "account-a": accountStore,
        }),
        disabledAccountIdSet: new Set<string>(),
        isLoading: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.startDay).toBe("2026-01-04")
      expect(result.current.endDay).toBe("2026-01-10")
      expect(result.current.dayKeysInRange).toEqual([
        "2026-01-04",
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
        "2026-01-08",
        "2026-01-09",
        "2026-01-10",
      ])
      expect(result.current.accountOptions).toEqual([
        expect.objectContaining({
          value: "account-a",
          count: 1,
        }),
      ])
    })

    act(() => {
      result.current.setStartDay("2026-01-08")
      result.current.setEndDay("2026-01-05")
    })

    await waitFor(() => {
      expect(result.current.startDay).toBe("2026-01-08")
      expect(result.current.endDay).toBe("2026-01-08")
      expect(result.current.dayKeysInRange).toEqual(["2026-01-08"])
    })
  })

  it("falls back to a null preview when export computation throws", async () => {
    const account = buildSiteAccount({
      id: "account-a",
      site_name: "Broken Export",
    })

    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      quotaConsumed: 1,
    }

    vi.spyOn(usageAnalytics, "computeUsageHistoryExport").mockImplementation(
      () => {
        throw new Error("preview failed")
      },
    )

    const { result } = renderHook(() =>
      useUsageAnalyticsFilters({
        enabledAccounts: [account],
        store: createStore({
          "account-a": accountStore,
        }),
        disabledAccountIdSet: new Set<string>(),
        isLoading: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.exportSelection).toEqual({
        accountIds: ["account-a"],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      })
      expect(result.current.exportPreview).toBeNull()
      expect(result.current.tokenOptions).toEqual([])
    })
  })

  it("formats token labels and owner titles for unknown, unnamed, and named tokens", async () => {
    const account = buildSiteAccount({
      id: "account-a",
      site_name: "Token Site",
      site_url: "",
      site_type: SITE_TYPES.UNKNOWN,
      notes: "Needs review",
      account_info: undefined as any,
    })

    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = {
      requests: 3,
      promptTokens: 6,
      completionTokens: 9,
      totalTokens: 15,
      quotaConsumed: 2,
    }
    accountStore.dailyByToken.unknown = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }
    accountStore.dailyByToken["5"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }
    accountStore.dailyByToken["7"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }
    accountStore.tokenNamesById["7"] = "Named Token"

    const { result } = renderHook(() =>
      useUsageAnalyticsFilters({
        enabledAccounts: [account],
        store: createStore({
          "account-a": accountStore,
        }),
        disabledAccountIdSet: new Set<string>(),
        isLoading: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.siteOptions).toEqual([
        expect.objectContaining({
          value: "account-a",
        }),
      ])
      expect(result.current.accountOptions).toEqual([
        expect.objectContaining({
          value: "account-a",
        }),
      ])
      expect(result.current.tokenOptions.map((option) => option.label)).toEqual(
        ["#5", "Named Token (#7)", "usageAnalytics:filters.unknownToken"],
      )
    })

    const accountLabel = result.current.accountLabels["account-a"]
    const namedToken = result.current.tokenOptions.find(
      (option) => option.value === "7",
    )
    const unknownToken = result.current.tokenOptions.find(
      (option) => option.value === "unknown",
    )

    expect(result.current.siteOptions[0]?.title).not.toContain(
      "usageAnalytics:hover.url",
    )
    expect(result.current.siteOptions[0]?.title).toContain(
      `usageAnalytics:hover.type: ${SITE_TYPES.UNKNOWN}`,
    )
    expect(result.current.accountOptions[0]?.title).toContain(
      "usageAnalytics:hover.notes: Needs review",
    )
    expect(namedToken?.title).toContain(
      `usageAnalytics:hover.owners: ${accountLabel}`,
    )
    expect(namedToken?.title).not.toContain(`${accountLabel}, ${accountLabel}`)
    expect(unknownToken?.title).toContain(
      "usageAnalytics:hover.token: usageAnalytics:filters.unknownToken",
    )
  })
})
