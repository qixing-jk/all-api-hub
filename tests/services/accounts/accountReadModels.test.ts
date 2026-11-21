import { beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  accountReadModels,
  type AccountManagementSnapshot,
  type AccountOverviewSnapshot,
} from "~/services/accounts/accountStorage/accountReadModels"
import { accountBalanceSnapshot } from "~/services/accounts/balanceSnapshot"
import { createDefaultAccountStorageConfig } from "~/services/accounts/editing/accountDefaults"
import {
  BALANCE_EXCLUSION_REASONS,
  BALANCE_PURPOSES,
  projectBalance,
} from "~/services/accounts/metrics/balanceProjection"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { SiteAccount, SiteBookmark } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const buildNamedAccount = (
  id: string,
  username: string,
  quota = 1_000,
): SiteAccount => {
  const account = buildSiteAccount({ id, site_name: "Shared" })
  const scope = {
    subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: id },
    authority: account.site_url,
    walletId: id,
    projects: { kind: SCOPE_SELECTION_KINDS.All },
    keys: { kind: SCOPE_SELECTION_KINDS.All },
    models: { kind: SCOPE_SELECTION_KINDS.All },
    groups: { kind: SCOPE_SELECTION_KINDS.All },
  }
  return {
    ...account,
    account_info: {
      ...account.account_info,
      username,
      balance: accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "wallet",
            scope,
            value: String(quota / 500000),
            observedAt: 100,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            nature: BALANCE_NATURES.Prepaid,
            validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
            source: {
              adapter: "fixture",
              operation: "wallet",
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Reported,
            },
          }),
        ],
        100,
        FINANCIAL_COVERAGE.Complete,
      ),
    },
  }
}

describe("accountReadModels", () => {
  it("preserves independent XNO while counting only USD in overview totals", async () => {
    const account = buildNamedAccount("nano", "nano", 500000)
    const usd = account.account_info.balance!.positions[0]!
    const xno = balancePosition({
      id: "nano",
      scope: usd.scope,
      asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
      value: "26.71801147",
      observedAt: 100,
      nature: BALANCE_NATURES.Prepaid,
      validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
      source: usd.amount.source,
    })
    account.account_info.balance!.positions.push(xno)
    vi.spyOn(accountQueries, "getAllAccounts").mockResolvedValue([account])
    const snapshot = await accountReadModels.getAccountOverviewSnapshot()
    expect(snapshot.stats.total_quota).toBe(500000)
    expect(snapshot.displayAccounts[0]).toMatchObject({
      balanceSnapshot: account.account_info.balance,
      excludeFromTotalBalance: false,
    })
    expect(snapshot.stats.balancePortfolio?.amounts).toEqual(
      expect.arrayContaining([
        { asset: { kind: "currency", code: "USD" }, value: "1" },
        { asset: { kind: "crypto", id: "XNO" }, value: "26.71801147" },
      ]),
    )
  })
  it.each([
    BALANCE_EXCLUSION_REASONS.Restricted,
    BALANCE_EXCLUSION_REASONS.ScopeUnknown,
    BALANCE_EXCLUSION_REASONS.Nature,
  ] as const)(
    "uses reported available balances while preserving strict prepaid exclusions for %s",
    async (reason) => {
      const ordinary = buildNamedAccount("ordinary", "ordinary", 500000)
      const scoped = buildNamedAccount("scoped", "scoped", 1000000)
      const position = scoped.account_info.balance!.positions[0]!
      if (reason === BALANCE_EXCLUSION_REASONS.Restricted)
        position.scope.models = {
          kind: SCOPE_SELECTION_KINDS.Restricted,
          ids: ["model-a"],
        }
      else if (reason === BALANCE_EXCLUSION_REASONS.ScopeUnknown)
        position.scope.models = { kind: "unknown" }
      else position.nature = BALANCE_NATURES.Subscription
      vi.spyOn(accountQueries, "getAllAccounts").mockResolvedValue([
        ordinary,
        scoped,
      ])
      const snapshot = await accountReadModels.getAccountOverviewSnapshot()
      expect(snapshot.stats.total_quota).toBe(
        reason === BALANCE_EXCLUSION_REASONS.Restricted ? 500000 : 1500000,
      )
      expect(
        snapshot.displayAccounts.find((item) => item.id === "scoped"),
      ).toMatchObject({
        balanceSnapshot: scoped.account_info.balance,
        excludeFromTotalBalance: false,
      })
      expect(
        projectBalance(scoped.account_info.balance!, BALANCE_PURPOSES.Prepaid)
          .excluded,
      ).toEqual([{ position, reason }])
      expect(scoped.excludeFromTotalBalance).not.toBe(true)
    },
  )

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
