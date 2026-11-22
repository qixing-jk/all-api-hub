import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type { AccountData } from "~/services/accounts/accountDataModel"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import {
  AccountUpdateUserTimestampMode,
  createDefaultAccountStorageConfig,
} from "~/services/accounts/editing/accountDefaults"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import {
  BALANCE_IDENTITY_CHANGED_REASON,
  LEGACY_BALANCE_SUPERSEDED_REASON,
} from "~/services/accounts/refresh/balanceAcceptance"
import { AIMLAPI_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { financialCollectionKey } from "~/services/amounts/balance"
import { fetchAimlApiAccountData } from "~/services/apiService/aimlapi/accountData"
import { AIMLAPI_ENDPOINTS } from "~/services/apiService/aimlapi/constants"
import { fetchAccountData as fetchDayaAccountData } from "~/services/apiService/daya"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import { fetchAccountData as fetchRixAccountData } from "~/services/apiService/newApiFamily/variants/rixApi"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { maybeCaptureDailyBalanceSnapshot } from "~/services/history/dailyBalanceHistory/capture"
import { buildFinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { estimateTodayIncomeForAccount } from "~/services/history/dailyBalanceHistory/todayIncomeEstimate"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.mocked(browser.permissions.contains).mockResolvedValue(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function seed(account: SiteAccount) {
  const config = createDefaultAccountStorageConfig()
  config.accounts = [account]
  await new Storage({ area: "local" }).set(
    ACCOUNT_STORAGE_KEYS.ACCOUNTS,
    config,
  )
}

async function collectAndAccept(
  account: SiteAccount,
  collect: () => Promise<AccountData>,
) {
  const generation = (await accountMutations.beginBalanceRefresh(
    account.id,
    account,
  ))!
  const data = await collect()
  const updates = buildAccountRefreshUpdate(
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
      updates,
      undefined,
      account,
      data,
      generation,
    ),
  ).not.toBeNull()
  const accepted = (await accountQueries.getAccountById(account.id))!
  expect(
    await maybeCaptureDailyBalanceSnapshot({
      config: { ...DEFAULT_BALANCE_HISTORY_PREFERENCES, enabled: true },
      accountId: account.id,
      generation,
      balance: accepted.account_info.balance,
      settledConsumption: accepted.account_info.settledConsumption,
      source: "refresh",
    }),
  ).toBe(true)
  return accepted
}

async function expectEstimate(
  account: SiteAccount,
  day: string,
  zone: string,
  value: string,
) {
  const store = await dailyBalanceHistoryStorage.getStore()
  expect(
    estimateTodayIncomeForAccount({
      enabled: true,
      store,
      account,
      currentDayKey: day,
      timeZone: zone,
    }),
  ).toMatchObject({
    status: "available",
    estimates: [
      {
        netInflow: {
          status: "available",
          amount: { asset: { kind: "currency", code: "USD" }, value },
        },
      },
    ],
  })
  const history = buildFinancialHistorySeries({
    store,
    accountIds: [account.id],
    startDayKey: day,
    endDayKey: day,
    asOf: Date.now(),
  })
  expect(
    history.series
      .flatMap((series) => series.observations)
      .some(
        (observation) =>
          observation.netInflow?.status === "available" &&
          observation.netInflow.amount.value === value,
      ),
  ).toBe(true)
}

it("Daya accepted wallet and day charges support estimates, refresh recovery and unchanged wallet identity", async () => {
  installCookieTransport("daya_sid", "api.dayaai.com")
  const origin = "https://api.dayaai.com"
  let wallet = "20"
  let cost: string | undefined = "1.25"
  server.use(
    http.get(origin + "/api/v1/auth/me", () =>
      HttpResponse.json({
        code: 0,
        message: "success",
        data: { id: 615, username: "test", balance: wallet, status: "active" },
      }),
    ),
    http.get(origin + "/api/v1/usage/dashboard/stats", () =>
      HttpResponse.json({
        code: 0,
        message: "success",
        data: {
          today_cost: cost,
          today_requests: 8,
          today_input_tokens: 100,
          today_cache_creation_tokens: 0,
          today_cache_read_tokens: 0,
          today_output_tokens: 10,
        },
      }),
    ),
  )
  let account = buildSiteAccount({
    id: "daya-estimate",
    site_type: SITE_TYPES.DAYA,
    site_url: origin,
    authType: AuthTypeEnum.Cookie,
  })
  account.account_info.id = "615"
  await seed(account)
  const collect = () =>
    fetchDayaAccountData({
      directRequestReason: "passive",
      baseUrl: origin,
      accountId: account.id,
      auth: { authType: account.authType, userId: "615" },
      includeTodayCashflow: true,
      checkIn: account.checkIn,
    })
  vi.setSystemTime(new Date("2026-11-19T00:01:00+08:00"))
  account = await collectAndAccept(account, async () => {
    const data = await collect()
    // f3afa67cc7 stored only the daily usage cost with the balance scope.
    delete data.settledConsumption
    const cost = data.usage!.cost!
    cost.amount.source.contractVersion = "today-usd/v1"
    cost.scope = accountBalanceScope({ baseUrl: origin, accountId: account.id })
    return data
  })
  const originalWallet =
    account.account_info.balance!.positions[0]!.amount.source
  expect(account.account_info.settledConsumption).toBeUndefined()
  const savedPreRepairCharge = account.account_info.usage!.cost!
  if (!("observedAt" in savedPreRepairCharge.amount))
    throw new Error("Expected a recorded cost")
  cost = undefined
  vi.setSystemTime(new Date("2026-11-19T03:00:00+08:00"))
  account = await collectAndAccept(account, collect)
  expect(account.account_info.usage!.cost!.amount.status).toBe("unavailable")
  expect(account.account_info.usageObservations).toContainEqual(
    expect.objectContaining({
      cost: expect.objectContaining({
        window: savedPreRepairCharge.window,
        amount: expect.objectContaining({
          value: "1.25",
          observedAt: savedPreRepairCharge.amount.observedAt,
          status: "stale",
        }),
      }),
    }),
  )
  expect(account.account_info.usage!.totalRequests).toBe(8)
  expect(account.account_info.settledConsumption![0]!.amount.status).toBe(
    "unavailable",
  )
  wallet = "22"
  cost = "3.5"
  vi.setSystemTime(new Date("2026-11-19T06:00:00+08:00"))
  account = await collectAndAccept(account, collect)
  await expectEstimate(account, "2026-11-19", "Asia/Shanghai", "5.5")
  expect(account.account_info.balance!.positions).toHaveLength(1)
  expect(
    financialCollectionKey(
      "wallet",
      account.account_info.balance!.positions[0]!.amount.source,
    ),
  ).toEqual(financialCollectionKey("wallet", originalWallet))
  const observed = account.account_info.settledConsumption![0]!
  cost = undefined
  vi.setSystemTime(new Date("2026-11-19T06:01:00+08:00"))
  account = await collectAndAccept(account, collect)
  expect(account.account_info.settledConsumption![0]).toMatchObject({
    window: observed.window,
    amount: { ...observed.amount, status: "stale" },
  })
  const failed = estimateTodayIncomeForAccount({
    enabled: true,
    store: await dailyBalanceHistoryStorage.getStore(),
    account,
    currentDayKey: "2026-11-19",
    timeZone: "Asia/Shanghai",
  })
  expect(failed.status).not.toBe("available")
  wallet = "23"
  cost = "4"
  vi.setSystemTime(new Date("2026-11-19T07:00:00+08:00"))
  account = await collectAndAccept(account, collect)
  await expectEstimate(account, "2026-11-19", "Asia/Shanghai", "7")
  expect(account.account_info.settledConsumption).toHaveLength(1)
  const previousHistory = await dailyBalanceHistoryStorage.getStore()
  const previousCharge = account.account_info.settledConsumption![0]!
  expect(
    await accountMutations.updateAccount(
      account.id,
      {
        account_info: { id: "616" },
      },
      { userTimestampMode: AccountUpdateUserTimestampMode.Touch },
    ),
  ).toBe(true)
  account = (await accountQueries.getAccountById(account.id))!
  expect(account.account_info.settledConsumption![0]).toMatchObject({
    window: previousCharge.window,
    amount: { ...previousCharge.amount, status: "stale" },
  })
  expect(
    accountPresentation.convertToDisplayData(account).consumptionProjection
      ?.groups,
  ).toEqual([])
  expect(await dailyBalanceHistoryStorage.getStore()).toEqual(previousHistory)
})

it("AIMLAPI accepted UTC wallet and charges support estimates and retain failed readings", async () => {
  let wallet = "20"
  let spend: string | undefined = "1.25"
  server.use(
    http.get(AIMLAPI_API_BASE_URL + AIMLAPI_ENDPOINTS.Billing, () =>
      HttpResponse.json({ currency: CURRENCIES.USD, current_balance: wallet }),
    ),
    http.get(AIMLAPI_API_BASE_URL + AIMLAPI_ENDPOINTS.UsageDetail, () =>
      HttpResponse.json({
        spend,
        requests: 8,
        groups: [{ tokens: { input: 100, output: 10 } }],
      }),
    ),
  )
  let account = buildSiteAccount({
    id: "aimlapi-estimate",
    site_type: SITE_TYPES.AIMLAPI,
    site_url: "https://aimlapi.com",
  })
  await seed(account)
  const collect = () =>
    fetchAimlApiAccountData({
      directRequestReason: "passive",
      baseUrl: account.site_url,
      accountId: account.id,
      auth: {
        authType: account.authType,
        userId: account.account_info.id,
        accessToken: "management-test",
      },
      aimlApiKey: "regular-test",
      includeTodayCashflow: true,
      checkIn: account.checkIn,
    })
  vi.setSystemTime(new Date("2026-11-19T00:01:00Z"))
  account = await collectAndAccept(account, async () => {
    const data = await collect()
    for (const fact of data.settledConsumption ?? []) {
      fact.amount.source.contractVersion = "utc-day/v1"
      delete fact.cumulative
      fact.scope = accountBalanceScope({
        baseUrl: account.site_url,
        accountId: account.id,
      })
    }
    return data
  })
  const originalWallet =
    account.account_info.balance!.positions[0]!.amount.source
  const savedPreRepairCharge = account.account_info.settledConsumption![0]!
  spend = undefined
  vi.setSystemTime(new Date("2026-11-19T03:00:00Z"))
  account = await collectAndAccept(account, collect)
  expect(account.account_info.settledConsumption![0]).toMatchObject({
    window: savedPreRepairCharge.window,
    amount: { ...savedPreRepairCharge.amount, status: "stale" },
  })
  wallet = "22"
  spend = "3.5"
  vi.setSystemTime(new Date("2026-11-19T06:00:00Z"))
  account = await collectAndAccept(account, collect)
  await expectEstimate(account, "2026-11-19", "UTC", "5.5")
  expect(account.account_info.balance!.positions).toHaveLength(1)
  expect(
    financialCollectionKey(
      "wallet",
      account.account_info.balance!.positions[0]!.amount.source,
    ),
  ).toEqual(financialCollectionKey("wallet", originalWallet))
  const observed = account.account_info.settledConsumption![0]!
  spend = undefined
  vi.setSystemTime(new Date("2026-11-19T06:01:00Z"))
  account = await collectAndAccept(account, collect)
  expect(account.account_info.settledConsumption![0]).toMatchObject({
    window: observed.window,
    amount: { ...observed.amount, status: "stale" },
  })
  wallet = "23"
  spend = "4"
  vi.setSystemTime(new Date("2026-11-19T07:00:00Z"))
  account = await collectAndAccept(account, collect)
  await expectEstimate(account, "2026-11-19", "UTC", "7")
  expect(account.account_info.settledConsumption).toHaveLength(1)
})

it.each(["unchanged", "changed"] as const)(
  "AIMLAPI v4.10.1 native USD components remain readable without blocking accepted day estimates after %s identity",
  async (identity) => {
    let wallet = "20"
    let spend = "1.25"
    server.use(
      http.get(AIMLAPI_API_BASE_URL + AIMLAPI_ENDPOINTS.Billing, () =>
        HttpResponse.json({
          currency: CURRENCIES.USD,
          current_balance: wallet,
        }),
      ),
      http.get(AIMLAPI_API_BASE_URL + AIMLAPI_ENDPOINTS.UsageDetail, () =>
        HttpResponse.json({
          spend,
          requests: 8,
          groups: [{ tokens: { input: 100, output: 10 } }],
        }),
      ),
    )
    vi.setSystemTime(new Date("2026-11-19T00:01:00Z"))
    const releaseAt = Date.parse("2026-11-18T23:59:00Z")
    let account = buildSiteAccount({
      id: "aimlapi-v4-upgrade-estimate",
      site_type: SITE_TYPES.AIMLAPI,
      site_url: "https://aimlapi.com",
      last_sync_time: releaseAt,
    })
    account.account_info.quota = 19 * 500_000
    // The released adapter stored its USD total and its permanent component.
    account.account_info.nativeBalance = {
      unit: CURRENCIES.USD,
      total: 19,
      permanent: 19,
      daily: 0,
      components: [{ kind: "permanent", amount: 19 }],
    }
    await new Storage({ area: "local" }).set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [account],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      deletedEntryRecords: {},
      last_updated: releaseAt,
    })
    account = (await accountQueries.getAccountById(account.id))!
    if (identity === "changed") {
      expect(
        await accountMutations.updateAccount(
          account.id,
          { account_info: { id: "different-upstream-user" } },
          { userTimestampMode: AccountUpdateUserTimestampMode.Touch },
        ),
      ).toBe(true)
      account = (await accountQueries.getAccountById(account.id))!
      expect(account.account_info.balance!.positions[0]!.amount).toMatchObject({
        status: "stale",
        reason: BALANCE_IDENTITY_CHANGED_REASON,
        observedAt: releaseAt,
        value: "19",
      })
    }
    const savedLegacy = account.account_info.legacyFinancial!
    const collect = () =>
      fetchAimlApiAccountData({
        directRequestReason: "passive",
        baseUrl: account.site_url,
        accountId: account.id,
        auth: {
          authType: account.authType,
          userId: account.account_info.id,
          accessToken: "management-test",
        },
        aimlApiKey: "regular-test",
        includeTodayCashflow: true,
        checkIn: account.checkIn,
      })
    account = await collectAndAccept(account, collect)
    wallet = "22"
    spend = "3.5"
    vi.setSystemTime(new Date("2026-11-19T06:00:00Z"))
    account = await collectAndAccept(account, collect)
    expect(account.account_info.legacyFinancial).toEqual(savedLegacy)
    expect(account.account_info.balance!.positions).toMatchObject([
      {
        id: "legacy",
        amount: {
          status: "stale",
          value: "19",
          observedAt: releaseAt,
          reason: LEGACY_BALANCE_SUPERSEDED_REASON,
        },
      },
      {
        id: "legacy-component:0",
        parentId: "legacy",
        amount: { status: "stale", value: "19", observedAt: releaseAt },
      },
      { id: "balance", amount: { status: "known", value: "22" } },
    ])
    await expectEstimate(account, "2026-11-19", "UTC", "5.5")
    const history = buildFinancialHistorySeries({
      store: await dailyBalanceHistoryStorage.getStore(),
      accountIds: [account.id],
      startDayKey: "2026-11-19",
      endDayKey: "2026-11-19",
      asOf: Date.now(),
    })
    expect(
      history.series.find(
        ({ position }) => position.id === "legacy-component:0",
      )?.observations,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "19" })]),
    )
  },
)

it.each(["quota", "balance"] as const)(
  "Rix %s wallet keeps its denomination through accepted charge refreshes and failures",
  async (dialect) => {
    const origin = "https://rix-estimate.example"
    let wallet = "20"
    let cost: number | undefined = 625_000
    server.use(
      http.get(origin + "/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data:
            dialect === "quota"
              ? { quota: Number(wallet) * 500_000 }
              : { balance: wallet },
        }),
      ),
      http.get(origin + "/api/log/self/stat", () =>
        HttpResponse.json({ success: true, data: { quota: cost } }),
      ),
      http.get(origin + "/api/log/self", ({ request }) =>
        cost === undefined &&
        new URL(request.url).searchParams.get("type") === "2"
          ? HttpResponse.json({ message: "unavailable" }, { status: 503 })
          : HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
    )
    let account = buildSiteAccount({
      id: `rix-${dialect}-estimate`,
      site_type: SITE_TYPES.RIX_API,
      site_url: origin,
    })
    await seed(account)
    const collect = () =>
      fetchRixAccountData({
        directRequestReason: "passive",
        baseUrl: origin,
        accountId: account.id,
        siteType: SITE_TYPES.RIX_API,
        auth: {
          authType: account.authType,
          userId: account.account_info.id,
          accessToken: "rix-test",
        },
        includeTodayCashflow: true,
        checkIn: account.checkIn,
      })
    vi.setSystemTime(new Date(2026, 10, 19, 0, 1))
    account = await collectAndAccept(account, async () => {
      const data = await collect()
      // Earlier native-USD dialect observations used the common log contract.
      for (const fact of data.settledConsumption ?? [])
        fact.amount.source.contractVersion =
          NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd
      return data
    })
    const originalWallet =
      account.account_info.balance!.positions[0]!.amount.source
    const savedPreRepairCharge = account.account_info.settledConsumption![0]!
    cost = undefined
    vi.setSystemTime(new Date(2026, 10, 19, 3))
    account = await collectAndAccept(account, collect)
    expect(account.account_info.settledConsumption![0]).toMatchObject({
      window: savedPreRepairCharge.window,
      amount: { ...savedPreRepairCharge.amount, status: "stale" },
    })
    wallet = "22"
    cost = 1_750_000
    vi.setSystemTime(new Date(2026, 10, 19, 6))
    account = await collectAndAccept(account, collect)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    await expectEstimate(account, "2026-11-19", zone, "5.5")
    expect(account.account_info.balance!.positions).toHaveLength(1)
    expect(
      financialCollectionKey(
        "wallet",
        account.account_info.balance!.positions[0]!.amount.source,
      ),
    ).toEqual(financialCollectionKey("wallet", originalWallet))
    const observed = account.account_info.settledConsumption![0]!
    expect(observed.amount.source.amountInputs).toEqual({ quota: "1750000" })
    cost = undefined
    vi.setSystemTime(new Date(2026, 10, 19, 6, 1))
    account = await collectAndAccept(account, collect)
    expect(account.account_info.settledConsumption).toHaveLength(1)
    expect(account.account_info.settledConsumption![0]).toMatchObject({
      window: observed.window,
      amount: { ...observed.amount, status: "stale" },
    })
    cost = 2_000_000
    wallet = "23"
    vi.setSystemTime(new Date(2026, 10, 19, 7))
    account = await collectAndAccept(account, collect)
    await expectEstimate(account, "2026-11-19", zone, "7")
    expect(account.account_info.settledConsumption).toHaveLength(1)
  },
)
