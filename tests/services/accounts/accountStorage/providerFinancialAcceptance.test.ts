import { http, HttpResponse } from "msw"
import { beforeEach, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type { AccountData } from "~/services/accounts/accountDataModel"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  AccountUpdateUserTimestampMode,
  createDefaultAccountStorageConfig,
} from "~/services/accounts/editing/accountDefaults"
import { getDisplayBalancePortfolio } from "~/services/accounts/metrics/balanceProjection"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import { relayForAccountData } from "~/services/apiAdapters/relayfor/accountData"
import { fetchAccountData as fetchNanoGptAccountData } from "~/services/apiService/nanogpt"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import { newApiQuotaAsset } from "~/services/apiService/newApiFamily/quotaAsset"
import { fetchAccountBalance as fetchRixBalance } from "~/services/apiService/newApiFamily/variants/rixApi"
import { fetchAccountData as fetchNovitaAccountData } from "~/services/apiService/novita/accountData"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

type RefreshMode = "ordinary" | "editor"

beforeEach(() => {
  vi.mocked(browser.permissions.contains).mockResolvedValue(false)
})

async function saveAccount(account: SiteAccount) {
  const config = createDefaultAccountStorageConfig()
  config.accounts = [account]
  await new Storage({ area: "local" }).set(
    ACCOUNT_STORAGE_KEYS.ACCOUNTS,
    config,
  )
}

async function refreshAccount(
  mode: RefreshMode,
  account: SiteAccount,
  collect: () => Promise<AccountData>,
) {
  const generation = await accountMutations.beginBalanceRefresh(
    account.id,
    account,
  )
  expect(generation).not.toBeNull()
  const data = await collect()
  if (mode === "ordinary") {
    const patch = buildAccountRefreshUpdate(
      account,
      {
        success: true,
        data,
        healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
      },
      false,
    )
    expect(
      await accountMutations.updateAccountFromRefresh(
        account.id,
        patch,
        undefined,
        account,
        data,
        generation!,
      ),
    ).not.toBeNull()
  } else {
    expect(
      await accountMutations.updateAccountWithCheckInDraft(
        account.id,
        {},
        account.checkIn,
        {
          userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
          balanceRefresh: {
            generation: generation!,
            requestSnapshot: account,
            data,
          },
        },
      ),
    ).toBe(true)
  }
  const stored = await accountQueries.getAccountById(account.id)
  expect(stored).not.toBeNull()
  return stored!
}

it.each<RefreshMode>(["ordinary", "editor"])(
  "%s refresh replaces equivalent Rix wallet dialects and retains failed readings",
  async (mode) => {
    const origin = "https://rix-dialect.example"
    let payload: Record<string, unknown> = { quota: 5_000_000 }
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: payload }),
      ),
    )
    let account = buildSiteAccount({
      id: `rix-${mode}`,
      site_type: SITE_TYPES.RIX_API,
      site_url: origin,
      authType: AuthTypeEnum.AccessToken,
    })
    await saveAccount(account)
    const accept = async () => {
      account = await refreshAccount(mode, account, async () => ({
        ...account.account_info,
        ...(await fetchRixBalance({
          baseUrl: origin,
          accountId: account.id,
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "fixture-token",
            userId: account.account_info.id,
          },
        })),
        checkIn: account.checkIn,
      }))
      return getDisplayBalancePortfolio([
        accountPresentation.resolveDisplayData(account),
      ])
    }
    const usd = (value: string) => [
      { asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD }, value },
    ]
    expect((await accept()).amounts).toEqual(usd("10"))
    payload = { balance: "9" }
    expect((await accept()).amounts).toEqual(usd("9"))
    const lastDollar = account.account_info.balance!.positions.find(
      (position) => position.id === "balance",
    )!
    payload = { id: account.account_info.id, username: "test-user" }
    const missing = await accept()
    expect(missing.amounts).toEqual(usd("9"))
    expect(missing.lastKnownCount).toBe(1)
    expect(account.account_info.balance?.positions).toContainEqual({
      ...lastDollar,
      amount: {
        ...lastDollar.amount,
        status: "stale",
        reason: "refresh-unavailable",
      },
    })
    payload = { quota: 4_000_000 }
    expect((await accept()).amounts).toEqual(usd("8"))
    payload = { balance: "0" }
    expect((await accept()).amounts).toEqual(usd("0"))
    payload = {}
    expect((await accept()).amounts).toEqual(usd("0"))
    payload = { balance: "invalid" }
    expect((await accept()).amounts).toEqual(usd("0"))
    payload = { quota: "invalid" }
    const failed = await accept()
    expect(failed.amounts).toEqual(usd("0"))
    expect(failed.lastKnownCount).toBe(1)
    expect(account.account_info.balance?.positions).toContainEqual(
      expect.objectContaining({
        id: "balance",
        amount: expect.objectContaining({ status: "stale", value: "0" }),
      }),
    )
  },
)

it.each<RefreshMode>(["ordinary", "editor"])(
  "%s refresh retires the preceding raw Rix quota only after a usable dollar reading",
  async (mode) => {
    const origin = "https://rix-raw-quota.example"
    let value: string = "invalid"
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { balance: value } }),
      ),
    )
    let account = buildSiteAccount({
      id: `rix-raw-${mode}`,
      site_type: SITE_TYPES.RIX_API,
      site_url: origin,
      authType: AuthTypeEnum.AccessToken,
    })
    const scope = accountBalanceScope({
      baseUrl: origin,
      accountId: account.id,
    })
    account.account_info.balance = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "quota",
          collectionKey: WALLET_BALANCE_COLLECTION_KEY,
          scope,
          value: "5000000",
          asset: { kind: ASSET_KINDS.Quota, ...newApiQuotaAsset(origin) },
          source: {
            adapter: SITE_TYPES.RIX_API,
            operation: "/api/user/self:quota",
            contractVersion: NEW_API_FINANCIAL_CONTRACT_VERSIONS.NativeQuota,
            kind: EVIDENCE_KINDS.Reported,
          },
          observedAt: Date.now(),
        }),
      ],
      Date.now(),
      "complete",
    )
    await saveAccount(account)
    const accept = async () => {
      account = await refreshAccount(mode, account, async () => ({
        ...account.account_info,
        ...(await fetchRixBalance({
          baseUrl: origin,
          accountId: account.id,
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "fixture-token",
          },
        })),
        checkIn: account.checkIn,
      }))
      return getDisplayBalancePortfolio([
        accountPresentation.resolveDisplayData(account),
      ])
    }
    expect((await accept()).amounts).toEqual([
      {
        asset: {
          kind: "quota",
          ...newApiQuotaAsset(origin),
          id: JSON.stringify([origin, newApiQuotaAsset(origin).id]),
        },
        value: "5000000",
      },
    ])
    value = "9"
    expect((await accept()).amounts).toEqual([
      { asset: { kind: "currency", code: "USD" }, value: "9" },
    ])
    expect(account.account_info.balance?.positions).toHaveLength(1)
  },
)

const partialUsageCases = (["ordinary", "editor"] as const).flatMap((mode) =>
  (["requests", "totalTokens", "costUsd"] as const).map((missing) => ({
    mode,
    missing,
  })),
)

it.each<RefreshMode>(["ordinary", "editor"])(
  "%s refresh replaces only observed NanoGPT legacy assets and preserves missing amounts and clocks",
  async (mode) => {
    const originalTime = 1700000000000
    let balance: Record<string, unknown> = {
      usd_balance: "12",
      nanoDepositAddress: "nano_test_owner",
    }
    server.use(
      http.post("https://api.nano-gpt.com/api/check-balance", () =>
        HttpResponse.json(balance),
      ),
      http.get("https://api.nano-gpt.com/api/v1/usage", () =>
        HttpResponse.json({
          totals: { requests: 1, totalTokens: 1, costUsd: "1" },
        }),
      ),
      http.get("https://api.nano-gpt.com/api/subscription/v1/usage", () =>
        HttpResponse.json({ active: false }),
      ),
    )
    let account = buildSiteAccount({
      id: `nano-legacy-${mode}`,
      site_type: SITE_TYPES.NANOGPT,
      site_url: "https://nano-gpt.com",
      last_sync_time: originalTime,
    })
    account.account_info.nativeBalance = {
      unit: "USD_XNO",
      total: 10,
      nanoBalance: 26.71801147,
    }
    await saveAccount(account)
    account = (await accountQueries.getAccountById(account.id))!
    const originalXno = account.account_info.balance!.positions.find(
      (position) => position.id === "legacy-xno",
    )!
    const accept = async () => {
      account = await refreshAccount(mode, account, () =>
        fetchNanoGptAccountData({
          baseUrl: account.site_url,
          siteType: account.site_type,
          accountId: account.id,
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          auth: { authType: account.authType, accessToken: "fixture-token" },
          checkIn: account.checkIn,
        }),
      )
      return accountPresentation.resolveDisplayData(account)
    }
    const partial = await accept()
    expect(partial.balanceSnapshot?.positions).toContainEqual(originalXno)
    expect(partial.balanceSnapshot?.positions).not.toContainEqual(
      expect.objectContaining({ id: "legacy" }),
    )
    expect(getDisplayBalancePortfolio([partial]).amounts).toEqual([
      { asset: { kind: "currency", code: "USD" }, value: "12" },
    ])
    expect(originalXno.amount).toMatchObject({
      status: "stale",
      value: "26.71801147",
      observedAt: originalTime,
    })

    balance = { ...balance, usd_balance: "0", nano_balance: "0" }
    const zero = await accept()
    expect(zero.balanceSnapshot?.positions).not.toContainEqual(
      expect.objectContaining({ id: "legacy-xno" }),
    )
    const zeroXno = zero.balanceSnapshot!.positions.find(
      (position) => position.id === "nano_balance",
    )!
    expect(zeroXno.amount).toMatchObject({ status: "known", value: "0" })
    balance = { ...balance, nano_balance: "invalid" }
    const invalid = await accept()
    expect(invalid.balanceSnapshot?.positions).toContainEqual({
      ...zeroXno,
      amount: {
        ...zeroXno.amount,
        status: "stale",
        reason: "refresh-unavailable",
      },
    })
  },
)

it.each<RefreshMode>(["ordinary", "editor"])(
  "%s refresh keeps a legacy wallet and its missing cash component when only a credit limit is reported",
  async (mode) => {
    let payload: Record<string, unknown> = { creditLimit: "0" }
    server.use(
      http.get("https://api.novita.ai/openapi/v1/billing/balance/detail", () =>
        HttpResponse.json(payload),
      ),
    )
    let account = buildSiteAccount({
      id: `novita-legacy-${mode}`,
      site_type: SITE_TYPES.NOVITA,
      site_url: "https://novita.ai",
      last_sync_time: 1700000000000,
    })
    account.account_info.nativeBalance = {
      unit: CURRENCIES.USD,
      total: 10,
      permanent: 3,
      daily: 0,
      components: [
        { kind: "permanent", amount: 3 },
        { kind: "permanent", name: "Credit limit", amount: 2 },
      ],
    }
    await saveAccount(account)
    account = (await accountQueries.getAccountById(account.id))!
    const original = account.account_info.balance!.positions
    const accept = async () => {
      account = await refreshAccount(mode, account, () =>
        fetchNovitaAccountData({
          baseUrl: account.site_url,
          siteType: account.site_type,
          accountId: account.id,
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          auth: { authType: account.authType, accessToken: "sk_test-key" },
          checkIn: account.checkIn,
        }),
      )
      return accountPresentation.resolveDisplayData(account)
    }
    const creditOnly = await accept()
    for (const id of ["legacy", "legacy-cash"])
      expect(creditOnly.balanceSnapshot?.positions).toContainEqual(
        original.find((position) => position.id === id),
      )
    expect(getDisplayBalancePortfolio([creditOnly])).toMatchObject({
      amounts: [],
      referenceUsd: { USD: "10", CNY: "70" },
    })

    payload = { creditLimit: "0", availableBalance: "120000" }
    const wallet = await accept()
    expect(wallet.balanceSnapshot?.positions).toContainEqual(
      original.find((position) => position.id === "legacy-cash"),
    )
    const portfolio = getDisplayBalancePortfolio([wallet])
    expect(portfolio.amounts).toEqual([
      { asset: { kind: "currency", code: "USD" }, value: "12" },
    ])
    expect(portfolio.referenceUsd).toBeUndefined()
  },
)

it.each<RefreshMode>(["ordinary", "editor"])(
  "%s refresh preserves unmatched legacy components without adding their parent beside a current zero wallet",
  async (mode) => {
    let quota = 500000
    let timed: number | undefined = undefined
    server.use(
      http.get("https://relayfor.xyz/api/user/overview", () =>
        HttpResponse.json({
          user: { id: 1, username: "test-user", quota },
          ...(timed === undefined ? {} : { timed_quota: timed }),
          group_quotas: [],
          active_subscriptions: [],
        }),
      ),
      http.get("https://relayfor.xyz/api/user/timed-quotas", () =>
        HttpResponse.json([]),
      ),
    )
    let account = buildSiteAccount({
      id: `relay-legacy-${mode}`,
      site_type: SITE_TYPES.RELAYFOR,
      site_url: "https://relayfor.xyz",
      last_sync_time: 1700000000000,
    })
    account.account_info.nativeBalance = {
      unit: CURRENCIES.USD,
      total: 6,
      permanent: 1,
      daily: 2,
      components: [
        { kind: "permanent", amount: 1 },
        { kind: "timed", amount: 2 },
        { kind: "subscription", name: "Gold", amount: 3 },
      ],
    }
    await saveAccount(account)
    account = (await accountQueries.getAccountById(account.id))!
    const accept = async () => {
      account = await refreshAccount(mode, account, () =>
        relayForAccountData.fetchData({
          baseUrl: account.site_url,
          accountId: account.id,
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          auth: { authType: account.authType, accessToken: "fixture-token" },
          checkIn: account.checkIn,
        }),
      )
      return accountPresentation.resolveDisplayData(account)
    }
    const partial = await accept()
    expect(partial.balanceSnapshot?.positions).toContainEqual(
      expect.objectContaining({
        id: "legacy",
        amount: expect.objectContaining({
          value: "6",
          observedAt: 1700000000000,
        }),
      }),
    )
    quota = 0
    timed = 0
    const current = await accept()
    expect(current.balanceSnapshot?.positions).toContainEqual(
      expect.objectContaining({
        label: "Gold",
        parentId: "legacy",
        amount: expect.objectContaining({
          value: "3",
          observedAt: 1700000000000,
        }),
      }),
    )
    const portfolio = getDisplayBalancePortfolio([current])
    expect(portfolio.amounts).toEqual([
      { asset: { kind: "currency", code: "USD" }, value: "0" },
    ])
    expect(portfolio.referenceUsd).toBeUndefined()
  },
)

it.each(partialUsageCases)(
  "$mode refresh preserves NanoGPT's independent usage fields when $missing is missing",
  async ({ mode, missing }) => {
    const totals: Record<string, unknown> = {
      requests: 4,
      totalTokens: 120,
      costUsd: "3.5",
    }
    delete totals[missing]
    server.use(
      http.post("https://api.nano-gpt.com/api/check-balance", () =>
        HttpResponse.json({
          usd_balance: "20",
          nano_balance: "1",
          nanoDepositAddress: "nano_test_owner",
        }),
      ),
      http.get("https://api.nano-gpt.com/api/v1/usage", () =>
        HttpResponse.json({ totals }),
      ),
      http.get("https://api.nano-gpt.com/api/subscription/v1/usage", () =>
        HttpResponse.json({ active: false }),
      ),
    )
    const account = buildSiteAccount({
      id: `nano-${mode}-${missing}`,
      site_type: SITE_TYPES.NANOGPT,
      site_url: "https://nano-gpt.com",
      authType: AuthTypeEnum.AccessToken,
    })
    await saveAccount(account)
    const collect = () =>
      fetchNanoGptAccountData({
        baseUrl: account.site_url,
        siteType: account.site_type,
        accountId: account.id,
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "sk-nano-fixture",
        },
        checkIn: account.checkIn,
      })
    const stored = await refreshAccount(mode, account, collect)
    const display = accountPresentation.resolveDisplayData(stored)
    const usage = display.usage!
    expect(usage.totalRequests).toBe(missing === "requests" ? undefined : 4)
    expect(usage.totalTokens).toBe(missing === "totalTokens" ? undefined : 120)
    expect(usage.cost?.amount).toMatchObject(
      missing === "costUsd"
        ? { status: "unavailable" }
        : { status: "known", value: "3.5" },
    )
    Object.assign(totals, { requests: 0, totalTokens: 0, costUsd: "0" })
    const zero = accountPresentation.resolveDisplayData(
      await refreshAccount(mode, stored, collect),
    ).usage!
    expect(zero.totalRequests).toBe(0)
    expect(zero.totalTokens).toBe(0)
    expect(zero.cost?.amount).toMatchObject({ status: "known", value: "0" })
  },
)
