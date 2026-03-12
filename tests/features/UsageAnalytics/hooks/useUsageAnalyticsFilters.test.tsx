import { describe, expect, it } from "vitest"

import { useUsageAnalyticsFilters } from "~/features/UsageAnalytics/hooks/useUsageAnalyticsFilters"
import type { SiteAccount } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

type HookProps = {
  enabledAccounts: SiteAccount[]
  isLoading: boolean
}

describe("useUsageAnalyticsFilters", () => {
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
})
