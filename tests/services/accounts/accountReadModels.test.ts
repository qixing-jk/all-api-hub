import { beforeEach, describe, expect, it, vi } from "vitest"

import { createDefaultAccountStorageConfig } from "~/services/accounts/accountDefaults"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  accountReadModels,
  type AccountManagementSnapshot,
  type AccountOverviewSnapshot,
} from "~/services/accounts/accountStorage/accountReadModels"
import type { SiteAccount, SiteBookmark } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const buildNamedAccount = (
  id: string,
  username: string,
  quota = 1_000,
): SiteAccount => {
  const account = buildSiteAccount({ id, site_name: "Shared" })
  return {
    ...account,
    account_info: { ...account.account_info, username, quota },
  }
}

describe("accountReadModels", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("projects overview display data and statistics from one account snapshot", async () => {
    const accounts = [
      buildNamedAccount("account-a", "alpha", 1_000),
      buildNamedAccount("account-b", "beta", 2_000),
    ]
    vi.spyOn(accountQueries, "getAllAccounts").mockResolvedValue(accounts)

    const snapshot: AccountOverviewSnapshot =
      await accountReadModels.getAccountOverviewSnapshot()

    expect(snapshot.accounts).toBe(accounts)
    expect(
      snapshot.displayAccounts.map(({ id, name }) => ({ id, name })),
    ).toEqual([
      { id: "account-a", name: "Shared · alpha" },
      { id: "account-b", name: "Shared · beta" },
    ])
    expect(snapshot.stats.total_quota).toBe(3_000)
  })

  it("projects the management envelope and keeps display data consistent", async () => {
    const accounts = [buildNamedAccount("account-a", "alpha")]
    const bookmarks: SiteBookmark[] = [
      {
        id: "bookmark-a",
        name: "Example",
        url: "https://example.invalid",
        notes: "",
        tagIds: [],
        created_at: 1,
        updated_at: 1,
      },
    ]
    vi.spyOn(accountConfigStore, "readMigratedEnvelope").mockResolvedValue({
      ...createDefaultAccountStorageConfig(),
      accounts,
      bookmarks,
      pinnedAccountIds: ["account-a"],
      orderedAccountIds: ["bookmark-a", "account-a"],
    })

    const snapshot: AccountManagementSnapshot =
      await accountReadModels.getAccountManagementSnapshot()

    expect(snapshot.accounts).toBe(accounts)
    expect(snapshot.bookmarks).toBe(bookmarks)
    expect(snapshot.pinnedIds).toEqual(["account-a"])
    expect(snapshot.orderedIds).toEqual(["bookmark-a", "account-a"])
    expect(snapshot.displayAccounts[0]?.name).toBe("Shared")
    expect(snapshot.stats.total_quota).toBe(1_000)
  })

  it("returns one coherent safe fallback when management storage fails", async () => {
    vi.spyOn(accountConfigStore, "readMigratedEnvelope").mockRejectedValue(
      new Error("storage unavailable"),
    )

    const snapshot = await accountReadModels.getAccountManagementSnapshot()

    expect(snapshot.accounts).toEqual([])
    expect(snapshot.displayAccounts).toEqual([])
    expect(snapshot.bookmarks).toEqual([])
    expect(snapshot.pinnedIds).toEqual([])
    expect(snapshot.orderedIds).toEqual([])
    expect(snapshot.stats.total_quota).toBe(0)
  })

  it("uses the full account context for one display account and returns null when absent", async () => {
    const accounts = [
      buildNamedAccount("account-a", "alpha"),
      buildNamedAccount("account-b", "beta"),
    ]
    vi.spyOn(accountQueries, "getAllAccounts").mockResolvedValue(accounts)

    await expect(
      accountReadModels.getDisplayDataById("account-a"),
    ).resolves.toMatchObject({
      id: "account-a",
      name: "Shared · alpha",
    })
    await expect(
      accountReadModels.getDisplayDataById("missing"),
    ).resolves.toBeNull()
  })
})
