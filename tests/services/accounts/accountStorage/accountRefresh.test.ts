import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { RefreshAccountResult } from "~/services/accounts/accountDataModel"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { usageHistoryScheduler } from "~/services/history/usageHistory/scheduler"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: {
    getAccountById: vi.fn(),
    getEnabledAccounts: vi.fn(),
    getAllAccounts: vi.fn(),
  },
}))
vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: vi.fn() },
}))
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))
vi.mock("~/services/history/usageHistory/scheduler", () => ({
  usageHistoryScheduler: { runAfterRefreshSync: vi.fn() },
}))
vi.mock("~/services/history/dailyBalanceHistory/capture", () => ({
  maybeCaptureDailyBalanceSnapshot: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("~/services/accounts/accountStorage/accountMutations", () => ({
  accountMutations: {
    updateAccountFromRefresh: vi.fn(),
    updateAccount: vi.fn().mockResolvedValue(true),
  },
}))

const refreshFromSite = vi.fn<() => Promise<RefreshAccountResult>>()
const createAccount = (id: string): SiteAccount =>
  ({
    id,
    site_type: SITE_TYPES.NEW_API,
    site_url: "https://example.com",
    site_name: "Example",
    authType: AuthTypeEnum.AccessToken,
    account_info: { id: "1", access_token: "test-token" },
  }) as SiteAccount

describe("accountRefresh usage-history coordination", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(accountQueries.getAccountById).mockImplementation(async (id) =>
      createAccount(id),
    )
    vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
      createAccount("acc-1"),
      createAccount("acc-2"),
    ])
    vi.mocked(userPreferences.getPreferences).mockResolvedValue(
      DEFAULT_PREFERENCES,
    )
    vi.mocked(accountMutations.updateAccountFromRefresh).mockResolvedValue(true)
    vi.mocked(usageHistoryScheduler.runAfterRefreshSync).mockResolvedValue(null)
    refreshFromSite.mockResolvedValue({
      success: true,
      healthStatus: { status: SiteHealthStatus.Healthy, message: "OK" },
      data: { quota: 100 },
    } as RefreshAccountResult)
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      account: { refresh: { refreshAccount: refreshFromSite } },
    } as unknown as ReturnType<typeof getSiteTypeCapabilities>)
  })

  it("syncs only the refreshed account after its data is persisted", async () => {
    const persistence = createDeferred<boolean>()
    vi.mocked(accountMutations.updateAccountFromRefresh).mockReturnValueOnce(
      persistence.promise,
    )
    const refresh = accountRefresh.refreshAccount("acc-1", true)
    await vi.waitFor(() =>
      expect(accountMutations.updateAccountFromRefresh).toHaveBeenCalled(),
    )
    expect(usageHistoryScheduler.runAfterRefreshSync).not.toHaveBeenCalled()

    persistence.resolve(true)
    const result = await refresh
    expect(result?.refreshed).toBe(true)
    expect(
      usageHistoryScheduler.runAfterRefreshSync,
    ).toHaveBeenCalledExactlyOnceWith(["acc-1"])
  })

  it("syncs each refreshed account once during a batch, without a second global sync", async () => {
    const result = await accountRefresh.refreshAllAccounts(true)

    expect(result.refreshedCount).toBe(2)
    expect(
      vi.mocked(usageHistoryScheduler.runAfterRefreshSync).mock.calls,
    ).toEqual([[["acc-1"]], [["acc-2"]]])
  })

  it.each(["disabled", "minimum-interval"])(
    "does not sync accounts skipped for %s",
    async (reason) => {
      vi.mocked(accountQueries.getAccountById).mockResolvedValue({
        ...createAccount("acc-1"),
        ...(reason === "disabled"
          ? { disabled: true }
          : { last_sync_time: Date.now() }),
      })

      const result = await accountRefresh.refreshAccount("acc-1")
      expect(result?.refreshed).toBe(false)
      expect(usageHistoryScheduler.runAfterRefreshSync).not.toHaveBeenCalled()
    },
  )

  it("does not sync after an unsuccessful site response", async () => {
    refreshFromSite.mockResolvedValueOnce({
      success: false,
      healthStatus: { status: SiteHealthStatus.Error, message: "Unauthorized" },
    })

    await accountRefresh.refreshAccount("acc-1", true)
    expect(usageHistoryScheduler.runAfterRefreshSync).not.toHaveBeenCalled()
  })

  it("does not sync if the refreshed data was not persisted", async () => {
    vi.mocked(accountMutations.updateAccountFromRefresh).mockResolvedValueOnce(
      false,
    )

    await accountRefresh.refreshAccount("acc-1", true)
    expect(usageHistoryScheduler.runAfterRefreshSync).not.toHaveBeenCalled()
  })

  it("syncs an account successfully re-enabled by the disabled-account refresh", async () => {
    const disabled = { ...createAccount("acc-1"), disabled: true }
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValueOnce([disabled])
    vi.mocked(accountQueries.getAccountById)
      .mockResolvedValueOnce(disabled)
      .mockResolvedValueOnce(disabled)
      .mockResolvedValueOnce({ ...disabled, disabled: false })

    const result = await accountRefresh.refreshDisabledAccounts(true)
    expect(result.reEnabledCount).toBe(1)
    expect(
      usageHistoryScheduler.runAfterRefreshSync,
    ).toHaveBeenCalledExactlyOnceWith(["acc-1"])
  })

  it("syncs only successful accounts in a partially failed batch", async () => {
    refreshFromSite.mockRejectedValueOnce(new Error("Network error"))

    const result = await accountRefresh.refreshAllAccounts(true)
    expect(result.failed).toBe(1)
    expect(
      usageHistoryScheduler.runAfterRefreshSync,
    ).toHaveBeenCalledExactlyOnceWith(["acc-2"])
  })

  it("does not wait for history sync or let its failure fail the refresh", async () => {
    const sync = createDeferred<null>()
    vi.mocked(usageHistoryScheduler.runAfterRefreshSync).mockReturnValueOnce(
      sync.promise,
    )

    const result = await accountRefresh.refreshAccount("acc-1", true)
    expect(result?.refreshed).toBe(true)
    expect(
      usageHistoryScheduler.runAfterRefreshSync,
    ).toHaveBeenCalledExactlyOnceWith(["acc-1"])
    sync.reject(new Error("Log endpoint unavailable"))
    await Promise.resolve()
  })
})
