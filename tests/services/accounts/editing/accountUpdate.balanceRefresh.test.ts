import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type { AccountData } from "~/services/accounts/accountDataModel"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { validateAndUpdateAccount } from "~/services/accounts/editing/accountUpdate"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import * as adapterRegistry from "~/services/apiAdapters/registry"
import { SiteHealthStatus, type SiteAccount } from "~/types"
import { accountStorageTestSurface as accounts } from "~~/tests/test-utils/accountStorageTestSurface"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

/** Both public refresh paths report the same wallet with independent request order. */
function dataFor(account: SiteAccount, value: string): AccountData {
  const scope = accountBalanceScope({
    baseUrl: account.site_url,
    accountId: account.id,
    auth: { authType: account.authType },
  })
  return {
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
    checkIn: account.checkIn,
    balance: accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "wallet",
          scope,
          value,
          observedAt: 100,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
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
  }
}

describe("editor and background financial refresh ordering", () => {
  beforeEach(async () => {
    await accounts.clearAllData()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it("keeps the previous wallet invalidated when fetching the edited identity fails", async () => {
    const original = buildSiteAccount({ site_type: SITE_TYPES.NEW_API })
    original.account_info.balance = dataFor(original, "20").balance
    const id = await accounts.addAccount(original)
    const account = (await accounts.getAccountById(id))!
    const getCapabilities = adapterRegistry.getSiteTypeCapabilities
    vi.spyOn(adapterRegistry, "getSiteTypeCapabilities").mockImplementation(
      (siteType) => {
        const capabilities = getCapabilities(siteType)
        return {
          ...capabilities,
          account: {
            ...capabilities.account,
            data: {
              fetchData: vi.fn().mockRejectedValue(new Error("offline")),
            },
          },
        }
      },
    )

    const result = await validateAndUpdateAccount({
      accountId: id,
      url: account.site_url,
      siteName: account.site_name,
      username: account.account_info.username,
      accessToken: account.account_info.access_token,
      userId: "other-user",
      exchangeRate: "7",
      notes: "",
      tagIds: [],
      checkInConfig: account.checkIn,
      siteType: account.site_type,
      authType: account.authType,
      cookieAuthSessionCookie: "",
    })

    expect(result.success).toBe(true)
    const saved = (await accounts.getAccountById(id))!
    expect(saved.account_info.id).toBe("other-user")
    expect(saved.account_info.balance?.positions[0]?.amount).toMatchObject({
      status: "stale",
      reason: "account-identity-changed",
      value: "20",
    })
  })
  it("keeps a saved-session balance stale when the editor selects another Kimi organization", async () => {
    const original = buildSiteAccount({
      site_type: SITE_TYPES.KIMI_GLOBAL,
      site_url: "https://platform.kimi.ai",
      kimiOpenPlatformAuth: {
        organizationId: "org-a",
        refreshToken: "refresh",
      },
    })
    original.account_info.balance = dataFor(original, "10").balance
    const id = await accounts.addAccount(original)
    const account = (await accounts.getAccountById(id))!
    const getCapabilities = adapterRegistry.getSiteTypeCapabilities
    vi.spyOn(adapterRegistry, "getSiteTypeCapabilities").mockImplementation(
      (siteType) => {
        const capabilities = getCapabilities(siteType)
        return {
          ...capabilities,
          account: {
            ...capabilities.account,
            data: { fetchData: async () => dataFor(account, "20") },
          },
        }
      },
    )
    const saved = await validateAndUpdateAccount({
      accountId: id,
      url: account.site_url,
      siteName: account.site_name,
      username: account.account_info.username,
      accessToken: account.account_info.access_token,
      userId: account.account_info.id,
      exchangeRate: "7",
      notes: "new organization",
      tagIds: [],
      checkInConfig: account.checkIn,
      siteType: account.site_type,
      authType: account.authType,
      cookieAuthSessionCookie: "",
      options: {
        kimiOpenPlatformAuth: {
          organizationId: "org-b",
          refreshToken: "refresh",
        },
      },
    })
    expect(saved.success).toBe(true)
    const latest = (await accounts.getAccountById(id))!
    expect(latest.kimiOpenPlatformAuth?.organizationId).toBe("org-b")
    expect(latest.account_info.balance?.positions[0]?.amount).toMatchObject({
      status: "stale",
      value: "10",
      observedAt: 100,
    })
  })

  it.each([
    { first: "editor", failed: false, early: false },
    { first: "background", failed: false, early: false },
    { first: "editor", failed: true, early: false },
    { first: "background", failed: true, early: false },
    { first: "background", failed: false, early: true },
    { first: "background", failed: true, early: true },
  ])(
    "keeps newer financial facts when $first starts first, editor failure $failed and first finishes early $early",
    async ({ first, failed, early }) => {
      const original = buildSiteAccount({ site_type: SITE_TYPES.NEW_API })
      original.account_info.balance = dataFor(original, "10").balance
      const id = await accounts.addAccount(original)
      const account = (await accounts.getAccountById(id))!
      const editorData = createDeferred<AccountData>()
      const backgroundData = createDeferred<AccountData>()
      const fetchData = vi.fn(() => editorData.promise)
      const refreshAccount = vi.fn(async () => ({
        success: true as const,
        data: await backgroundData.promise,
        healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
      }))
      const getCapabilities = adapterRegistry.getSiteTypeCapabilities
      vi.spyOn(adapterRegistry, "getSiteTypeCapabilities").mockImplementation(
        (siteType) => {
          const capabilities = getCapabilities(siteType)
          return {
            ...capabilities,
            account: {
              ...capabilities.account,
              data: { fetchData },
              refresh: { ...capabilities.account?.refresh, refreshAccount },
            },
          }
        },
      )
      const edit = () =>
        validateAndUpdateAccount({
          accountId: id,
          url: account.site_url,
          siteName: account.site_name,
          username: account.account_info.username,
          accessToken: account.account_info.access_token,
          userId: account.account_info.id,
          exchangeRate: "7",
          notes: "saved editor note",
          tagIds: [],
          manualBalanceUsd: ".5",
          checkInConfig: account.checkIn,
          siteType: account.site_type,
          authType: account.authType,
          cookieAuthSessionCookie: "",
        })
      let editing: ReturnType<typeof edit>
      let refreshing: ReturnType<typeof accounts.refreshAccount>
      if (first === "editor") {
        editing = edit()
        await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(1))
        refreshing = accounts.refreshAccount(id, true)
        await vi.waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
        backgroundData.resolve(dataFor(account, "30"))
        await refreshing
      } else {
        refreshing = accounts.refreshAccount(id, true)
        await vi.waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
        editing = edit()
        await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(1))
      }
      if (early) {
        backgroundData.resolve(dataFor(account, "30"))
        await refreshing
        const pending = await accounts.getAccountById(id)
        expect(
          pending?.account_info.balance?.positions[0]?.amount,
        ).toMatchObject({
          status: "known",
          value: "10",
        })
      }
      if (failed) editorData.reject(new Error("editor fetch failed"))
      else editorData.resolve(dataFor(account, "20"))
      expect((await editing).success).toBe(true)
      if (first === "background" && !early) {
        backgroundData.resolve(dataFor(account, "30"))
        await refreshing
      }
      const saved = (await accounts.getAccountById(id))!
      expect(saved.notes).toBe("saved editor note")
      expect(saved.manualBalanceUsd).toBe(".5")
      expect(saved.account_info.balance?.positions[0]?.amount).toMatchObject({
        value: first === "editor" ? "30" : failed ? "10" : "20",
        status: first === "background" && failed ? "stale" : "known",
      })
    },
  )
})
