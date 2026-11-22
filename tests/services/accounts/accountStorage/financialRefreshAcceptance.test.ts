import { http, HttpResponse } from "msw"
import { beforeEach, expect, it, onTestFinished, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type { AccountData } from "~/services/accounts/accountDataModel"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  accountBalanceObservation,
  accountReportingScope,
} from "~/services/accounts/balanceSnapshot"
import {
  AccountUpdateUserTimestampMode,
  createDefaultAccountStorageConfig,
} from "~/services/accounts/editing/accountDefaults"
import {
  BALANCE_PURPOSES,
  getDisplayBalancePortfolio,
} from "~/services/accounts/metrics/balanceProjection"
import { getDisplayIncomeProjection } from "~/services/accounts/metrics/consumptionProjection"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_FUNDING,
  BALANCE_NATURES,
  BALANCE_VALIDITY_KINDS,
  OBSERVATION_STATUSES,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import { fetchAccountData } from "~/services/apiService/daya"
import { fetchAccountData as fetchGrsaiAccountData } from "~/services/apiService/grsai"
import { GRSAI_ENDPOINTS } from "~/services/apiService/grsai/constants"
import { fetchAccountData as fetchNewApiAccountData } from "~/services/apiService/newApiFamily/default/accountData"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type { SiteAccount } from "~/types"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { server } from "~~/tests/msw/server"
import { GRSAI_SIGNATURE_MATERIAL } from "~~/tests/services/apiService/grsai/signatureFixture"
import {
  buildFinancialIncomeFact,
  buildFinancialPeriodFact,
} from "~~/tests/test-utils/accountTodayStats"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

type RefreshMode = "ordinary" | "editor"

beforeEach(() => {
  vi.mocked(browser.permissions.contains).mockResolvedValue(false)
})

async function periodAccount() {
  const account = buildSiteAccount({
    id: "period",
    site_url: "https://period.example",
  })
  const cost = {
    ...buildFinancialPeriodFact({ accountId: account.id, value: "3.5" }),
    cumulative: true as const,
    window: { start: 100, end: 200, timeZone: "UTC" },
  }
  const income = {
    ...buildFinancialIncomeFact({ accountId: account.id, value: "1.5" }),
    cumulative: true as const,
    window: cost.window,
  }
  cost.amount = observeAmount("3.5", cost.amount.source, 200)
  income.amount = observeAmount("1.5", income.amount.source, 200)
  account.account_info.settledConsumption = [cost]
  account.account_info.reportedIncome = [income]
  const config = createDefaultAccountStorageConfig()
  config.accounts = [account]
  await new Storage({ area: "local" }).set(
    ACCOUNT_STORAGE_KEYS.ACCOUNTS,
    config,
  )
  return { account, cost, income }
}

async function refreshPeriod(
  mode: RefreshMode,
  account: SiteAccount,
  facts: Partial<
    Pick<
      AccountData,
      | "settledConsumption"
      | "reportedIncome"
      | "balance"
      | "balanceRefreshParts"
    >
  >,
) {
  const generation = (await accountMutations.beginBalanceRefresh(
    account.id,
    account,
  ))!
  const data = {
    ...account.account_info,
    ...facts,
    today_requests_count: 8,
    checkIn: account.checkIn,
  }
  if (mode === "editor") {
    expect(
      await accountMutations.updateAccountWithCheckInDraft(
        account.id,
        {},
        account.checkIn,
        {
          userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
          balanceRefresh: { generation, requestSnapshot: account, data },
        },
      ),
    ).toBe(true)
  } else {
    const update = buildAccountRefreshUpdate(
      account,
      {
        success: true,
        data,
        healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
      },
      false,
    )
    await accountMutations.updateAccountFromRefresh(
      account.id,
      update,
      undefined,
      account,
      data,
      generation,
    )
  }
  return (await accountQueries.getAccountById(account.id))!
}

it("Daya valid wallet plus missing cost must retain the last observed cost through acceptance and row projection", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-19T06:00:00Z"))
  onTestFinished(() => {
    vi.useRealTimers()
  })
  installCookieTransport("daya_sid", "api.dayaai.com")
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
  const origin = "https://api.dayaai.com"
  let cost: string | undefined = "3.5"
  server.use(
    http.get(origin + "/api/v1/auth/me", () =>
      HttpResponse.json({
        code: 0,
        message: "success",
        data: { id: 615, username: "test", balance: "20", status: "active" },
      }),
    ),
    http.get(origin + "/api/v1/usage/dashboard/stats", () =>
      HttpResponse.json({
        code: 0,
        message: "success",
        data: {
          ...(cost === undefined ? {} : { today_cost: cost }),
          today_requests: 8,
        },
      }),
    ),
  )
  let account = buildSiteAccount({
    id: "daya",
    site_type: SITE_TYPES.DAYA,
    site_url: origin,
    authType: AuthTypeEnum.Cookie,
  })
  account.account_info.id = "615"
  const storage = new Storage({ area: "local" })
  const config = createDefaultAccountStorageConfig()
  config.accounts = [account]
  await storage.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, config)
  const accept = async () => {
    const generation = (await accountMutations.beginBalanceRefresh(
      "daya",
      account,
    ))!
    const data = await fetchAccountData({
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      baseUrl: origin,
      accountId: "daya",
      auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
      includeTodayCashflow: true,
      checkIn: account.checkIn,
    })
    const updates = buildAccountRefreshUpdate(
      account,
      {
        success: true,
        data,
        healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
      },
      false,
    )
    account = (await accountMutations.updateAccountFromRefresh(
      "daya",
      updates,
      undefined,
      account,
      data,
      generation,
    ))!
    return accountPresentation.convertToDisplayData(account)
  }
  const first = await accept()
  expect(first.settledConsumption?.[0]?.amount).toMatchObject({
    status: "known",
    value: "3.5",
  })
  const oldFact = account.account_info.settledConsumption![0]!
  const oldAmount = oldFact.amount
  if (oldAmount.status !== OBSERVATION_STATUSES.Known)
    throw new Error("Expected collected amount")
  const oldTime = oldAmount.observedAt
  cost = undefined
  vi.setSystemTime(new Date("2026-11-19T06:01:00Z"))
  const second = await accept()
  expect(account.account_info.balance?.positions[0]?.amount).toMatchObject({
    status: "known",
    value: "20",
  })
  expect(account.account_info.today_requests_count).toBe(8)
  expect(second.settledConsumption?.[0]?.amount).toMatchObject({
    status: "stale",
    value: "3.5",
    observedAt: oldTime,
  })
  expect(second.settledConsumption?.[0]?.window).toEqual(oldFact.window)
})

it.each(["usage", "usageObservations"] as const)(
  "accepted editor refresh captures %s costs with the same accepted balance",
  async (field) => {
    const account = buildSiteAccount({
      id: "editor",
      balanceRefreshGeneration: 5,
    })
    const fact = buildFinancialPeriodFact({ accountId: "editor", value: "3.5" })
    const at = Date.now()
    const cost = {
      asset: fact.asset,
      scope: fact.scope,
      amount: observeAmount("3.5", fact.amount.source, at),
    }
    const balance = accountBalanceObservation(
      fact.scope,
      [
        balancePosition({
          id: "balance",
          scope: fact.scope,
          asset: fact.asset,
          value: "20",
          source: fact.amount.source,
          observedAt: at,
        }),
      ],
      at,
      "complete",
    )
    const config = createDefaultAccountStorageConfig()
    config.accounts = [account]
    await new Storage({ area: "local" }).set(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      config,
    )
    expect(
      await accountMutations.updateAccountWithCheckInDraft(
        "editor",
        {},
        account.checkIn,
        {
          userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
          balanceRefresh: {
            generation: 5,
            requestSnapshot: account,
            data: {
              ...balance,
              today_quota_consumption: 0,
              today_income: 0,
              today_requests_count: 8,
              today_prompt_tokens: 0,
              today_completion_tokens: 0,
              ...(field === "usage"
                ? {
                    usage: {
                      scope: "site_today" as const,
                      reportedDay: formatLocalDayKey(),
                      cost,
                    },
                  }
                : {
                    usageObservations: [
                      {
                        scope: "site_today" as const,
                        reportedDay: formatLocalDayKey(),
                        cost,
                      },
                    ],
                  }),
              checkIn: account.checkIn,
            },
          },
        },
      ),
    ).toBe(true)
    const stored = (await accountQueries.getAccountById("editor"))!
    expect(stored.account_info.balance?.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: expect.objectContaining({ status: "known", value: "20" }),
        }),
      ]),
    )
    expect(
      (field === "usage"
        ? stored.account_info.usage
        : stored.account_info.usageObservations?.[0]
      )?.cost?.amount,
    ).toMatchObject({ status: "known", value: "3.5" })
    const record = (await dailyBalanceHistoryStorage.getStore())
      .financialSnapshotsByAccountId?.editor?.[0]
    expect(record?.balance).toEqual(stored.account_info.balance)
    expect(
      record?.balance?.positions.find(({ id }) => id === "balance")?.amount,
    ).toMatchObject({
      status: "known",
      value: "20",
    })
    expect(record?.reportedDayCosts?.[0]?.amount).toMatchObject({
      status: "known",
      value: "3.5",
    })
  },
)

it.each(["ordinary", "editor"] as const)(
  "%s refresh retains an omitted income asset when another HTTP source is partial",
  async (mode) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-19T06:00:00Z"))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const origin = "https://income-collection.example"
    let partial = false
    server.use(
      http.get(origin + "/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data: { quota: partial ? 10_500_000 : 10_000_000 },
        }),
      ),
      http.get(origin + "/api/log/self/stat", () =>
        HttpResponse.json({ success: true, data: { quota: 500_000 } }),
      ),
      http.get(origin + "/api/log/self", ({ request }) => {
        const type = new URL(request.url).searchParams.get("type")
        if (type === "4" && partial)
          return HttpResponse.json({ message: "unavailable" }, { status: 503 })
        const items =
          type === "1"
            ? [{ quota: partial ? 1_500_000 : 1_000_000 }]
            : [{ quota: 0, content: "充值 ¥7.00 额度" }]
        return HttpResponse.json({ success: true, data: { items, total: 1 } })
      }),
    )
    let account = buildSiteAccount({
      id: "income",
      site_type: SITE_TYPES.NEW_API,
      site_url: origin,
    })
    account.account_info.id = "1"
    const config = createDefaultAccountStorageConfig()
    config.accounts = [account]
    await new Storage({ area: "local" }).set(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      config,
    )
    const refresh = async () => {
      const data = await fetchNewApiAccountData({
        baseUrl: origin,
        accountId: account.id,
        siteType: SITE_TYPES.NEW_API,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "test",
        },
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        includeTodayCashflow: true,
        checkIn: account.checkIn,
      })
      account = await refreshPeriod(mode, account, data)
    }
    await refresh()
    const originalCny = account.account_info.reportedIncome!.find(
      ({ asset }) =>
        asset.kind === ASSET_KINDS.Currency && asset.code === CURRENCIES.CNY,
    )!
    expect(originalCny.amount).toMatchObject({ status: "known", value: "7" })
    partial = true
    vi.setSystemTime(new Date("2026-11-19T06:01:00Z"))
    await refresh()
    expect(account.account_info.balance?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "21",
    })
    expect(account.account_info.reportedIncome).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          asset: { kind: "currency", code: "USD" },
          coverage: "partial",
          amount: expect.objectContaining({ status: "known", value: "3" }),
        }),
        {
          ...originalCny,
          amount: {
            ...originalCny.amount,
            status: "stale",
            reason: "refresh-unavailable",
          },
        },
      ]),
    )
    const income = getDisplayIncomeProjection([
      accountPresentation.convertToDisplayData(account),
    ])
    expect(income.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: { asset: { kind: "currency", code: "USD" }, value: "3" },
        }),
      ]),
    )
  },
)

it.each([
  ["ordinary", "user-to-dashboard"],
  ["ordinary", "dashboard-to-user"],
  ["editor", "user-to-dashboard"],
  ["editor", "dashboard-to-user"],
] as const)(
  "%s refresh keeps one usable Grsai wallet when its balance source switches %s",
  async (mode, direction) => {
    const origin = "https://eb.grsaiapi.com"
    let fallback = direction === "dashboard-to-user"
    let unavailable = false
    server.use(
      http.post(origin + GRSAI_ENDPOINTS.userInfo, () =>
        HttpResponse.json({
          code: 0,
          data: {
            id: "user-1",
            ...(fallback || unavailable ? {} : { credits: "100" }),
          },
          msg: "",
        }),
      ),
      http.post(origin + GRSAI_ENDPOINTS.dashboard, () =>
        HttpResponse.json({
          code: 0,
          data: {
            ...(unavailable ? {} : { credits: "80" }),
            totalConsumed: "20",
          },
          msg: "",
        }),
      ),
    )
    let account = buildSiteAccount({
      id: "grsai",
      site_type: SITE_TYPES.GRSAI,
      site_url: "https://grsai.com",
    })
    account.account_info.id = "user-1"
    const config = createDefaultAccountStorageConfig()
    config.accounts = [account]
    await new Storage({ area: "local" }).set(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      config,
    )
    const refresh = async () => {
      const data = await fetchGrsaiAccountData(
        {
          baseUrl: account.site_url,
          accountId: account.id,
          siteType: SITE_TYPES.GRSAI,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            userId: "user-1",
            accessToken: "test",
          },
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          includeTodayCashflow: true,
          checkIn: account.checkIn,
        },
        { token: "test", isAuth: true, material: GRSAI_SIGNATURE_MATERIAL },
      )
      account = await refreshPeriod(mode, account, data)
      return getDisplayBalancePortfolio([
        accountPresentation.convertToDisplayData(account),
      ])
    }
    expect((await refresh()).amounts[0]?.value).toBe(fallback ? "80" : "100")
    fallback = !fallback
    const second = await refresh()
    const value = fallback ? "80" : "100"
    expect(second.amounts[0]?.value).toBe(value)
    expect(second.includedCount).toBe(1)
    expect(second.conflicts).toEqual([])
    const nativePositions = account.account_info.balance?.positions.filter(
      (position) => position.asset.kind === ASSET_KINDS.Quota,
    )
    expect(nativePositions).toHaveLength(1)
    const lastAmount = nativePositions![0]!.amount
    unavailable = true
    const missing = await refresh()
    expect(missing.amounts[0]?.value).toBe(value)
    expect(account.account_info.balance?.positions).toContainEqual(
      expect.objectContaining({
        amount: { ...lastAmount, status: "stale", reason: expect.any(String) },
      }),
    )
  },
)

it.each(
  (["ordinary", "editor"] as const).flatMap((mode) =>
    (["reset", "expiry", "interval", "same window", "meaning"] as const).map(
      (change) => ({ mode, change }),
    ),
  ),
)(
  "$mode refresh preserves a failed balance's original $change facts until a known replacement",
  async ({ mode, change }) => {
    const account = buildSiteAccount({
      id: "balance-window",
      site_url: "https://balance-window.example",
    })
    const now = Date.now()
    const scope = accountReportingScope({
      baseUrl: account.site_url,
      accountId: account.id,
    })
    const source = {
      adapter: "fixture",
      operation: "/wallet",
      contractVersion: "1",
      kind: "reported" as const,
    }
    const old = balancePosition({
      id: "daily",
      collectionKey: WALLET_BALANCE_COLLECTION_KEY,
      scope,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      value: "8",
      source,
      observedAt: now - 1000,
      nature: BALANCE_NATURES.Prepaid,
      funding: BALANCE_FUNDING.Purchased,
      validity:
        change === "expiry"
          ? { kind: BALANCE_VALIDITY_KINDS.Expires, at: now - 500 }
          : { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
      window: {
        start: now - 2000,
        end: change === "interval" ? now - 500 : now + 60000,
        ...(change === "reset" ? { resetsAt: now - 500 } : {}),
        timeZone: "UTC",
      },
    })
    account.account_info.balance = accountBalanceObservation(
      scope,
      [old],
      now - 1000,
      "complete",
    ).balance
    const config = createDefaultAccountStorageConfig()
    config.accounts = [account]
    await new Storage({ area: "local" }).set(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      config,
    )
    const independent = balancePosition({
      id: "independent",
      collectionKey: WALLET_BALANCE_COLLECTION_KEY,
      scope,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      value: "2",
      source,
      observedAt: now,
    })
    const failed = balancePosition({
      ...old,
      value: undefined,
      source,
      observedAt: now,
      nature: BALANCE_NATURES.Mixed,
      funding: BALANCE_FUNDING.Granted,
      cashClassification: BALANCE_CASH_CLASSIFICATIONS.NotCash,
      validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
      window:
        change === "reset" || change === "interval"
          ? {
              start: now - 500,
              end: now + 60000,
              resetsAt: now + 60000,
              timeZone: "UTC",
            }
          : old.window,
    })
    const incoming = accountBalanceObservation(
      scope,
      [failed, independent],
      now,
      "complete",
    )
    const saved = await refreshPeriod(mode, account, incoming)
    expect(saved.account_info.balance?.positions).toEqual([
      {
        ...old,
        amount: {
          ...old.amount,
          status: "stale",
          reason: "refresh-unavailable",
        },
      },
      independent,
    ])
    expect(
      getDisplayBalancePortfolio(
        [accountPresentation.convertToDisplayData(saved)],
        BALANCE_PURPOSES.Available,
        now + 10,
      ).amounts,
    ).toEqual([
      ...(change === "same window" || change === "meaning"
        ? [{ asset: { kind: "currency", code: "USD" }, value: "8" }]
        : []),
      { asset: { kind: "currency", code: "CNY" }, value: "2" },
    ])
    let latest = saved
    for (const value of ["0", "11"]) {
      const known = balancePosition({
        ...failed,
        value,
        source,
        observedAt: now + 1,
      })
      latest = await refreshPeriod(
        mode,
        latest,
        accountBalanceObservation(
          scope,
          [known, independent],
          now + 1,
          "complete",
        ),
      )
      expect(latest.account_info.balance?.positions).toEqual([
        known,
        independent,
      ])
      expect(
        getDisplayBalancePortfolio(
          [accountPresentation.convertToDisplayData(latest)],
          BALANCE_PURPOSES.Available,
          now + 10,
        ).amounts,
      ).toEqual([
        { asset: { kind: "currency", code: "USD" }, value },
        { asset: { kind: "currency", code: "CNY" }, value: "2" },
      ])
    }
  },
)

it.each(["ordinary", "editor"] as const)(
  "%s refresh does not borrow a balance amount from another source or scope",
  async (mode) => {
    const { account, cost } = await periodAccount()
    const now = Date.now()
    const position = balancePosition({
      id: "wallet",
      scope: cost.scope,
      asset: cost.asset,
      value: "8",
      source: cost.amount.source,
      observedAt: now,
    })
    const previous = await refreshPeriod(
      mode,
      account,
      accountBalanceObservation(cost.scope, [position], now, "complete"),
    )
    for (const difference of ["source", "scope"] as const) {
      const source = {
        ...cost.amount.source,
        ...(difference === "source" ? { operation: "other endpoint" } : {}),
      }
      const incoming = balancePosition({
        ...position,
        scope:
          difference === "scope"
            ? { ...cost.scope, walletId: "other wallet" }
            : cost.scope,
        value: undefined,
        source,
        observedAt: now,
      })
      const saved = await refreshPeriod(
        mode,
        previous,
        accountBalanceObservation(cost.scope, [incoming], now, "complete"),
      )
      expect(saved.account_info.balance?.positions).toContainEqual(incoming)
    }
  },
)

it.each(["ordinary", "editor"] as const)(
  "%s refresh retains omitted same-period consumption as stale alongside a partial asset",
  async (mode) => {
    const { account, cost } = await periodAccount()
    const incoming = {
      ...cost,
      asset: { kind: "currency" as const, code: CURRENCIES.CNY },
      amount: observeAmount("7", cost.amount.source, 300),
      window: { ...cost.window, end: 300 },
      coverage: "partial" as const,
    }
    const saved = await refreshPeriod(mode, account, {
      settledConsumption: [incoming],
    })
    expect(saved.account_info.settledConsumption).toEqual([
      incoming,
      {
        ...cost,
        amount: {
          ...cost.amount,
          status: "stale",
          reason: "refresh-unavailable",
        },
      },
    ])
  },
)

it.each([
  "complete",
  "empty",
  "day",
  "source",
  "scope",
  "earlier interval",
] as const)(
  "does not retain an omitted consumption asset for a %s replacement",
  async (difference) => {
    const { account, cost } = await periodAccount()
    const incoming = {
      ...cost,
      asset: { kind: "currency" as const, code: CURRENCIES.CNY },
      amount: observeAmount("7", cost.amount.source, 300),
      window: { ...cost.window, end: 300 },
      coverage:
        difference === "complete"
          ? ("complete" as const)
          : ("partial" as const),
    }
    if (difference === "day") {
      incoming.window = {
        ...incoming.window,
        start: 86_400_000,
        end: 86_400_500,
      }
      incoming.amount = observeAmount("7", cost.amount.source, 86_400_300)
    }
    if (difference === "source")
      incoming.amount.source = {
        ...cost.amount.source,
        operation: "other source",
      }
    if (difference === "scope")
      incoming.scope = { ...cost.scope, walletId: "another wallet" }
    if (difference === "earlier interval")
      incoming.window = { ...cost.window, end: 150 }
    const facts = difference === "empty" ? [] : [incoming]
    const saved = await refreshPeriod("ordinary", account, {
      settledConsumption: facts,
      reportedIncome: [],
    })
    expect(saved.account_info.settledConsumption).toEqual(facts)
    expect(saved.account_info.reportedIncome).toEqual([])
  },
)

it.each(["ordinary", "editor"] as const)(
  "%s refresh retains failed consumption and income with their original intervals",
  async (mode) => {
    const { account, cost, income } = await periodAccount()
    const failedCost = {
      ...cost,
      window: { ...cost.window, end: 300 },
      amount: {
        status: "unavailable" as const,
        reason: "missing",
        source: cost.amount.source,
      },
    }
    const failedIncome = {
      ...income,
      window: failedCost.window,
      amount: {
        status: "unavailable" as const,
        reason: "missing",
        source: income.amount.source,
      },
    }
    const saved = await refreshPeriod(mode, account, {
      settledConsumption: [failedCost],
      reportedIncome: [failedIncome],
    })
    expect(saved.account_info.today_requests_count).toBe(8)
    expect(saved.account_info.settledConsumption?.[0]).toMatchObject({
      window: cost.window,
      amount: {
        status: "stale",
        value: "3.5",
        observedAt: 200,
        source: cost.amount.source,
      },
    })
    expect(saved.account_info.reportedIncome?.[0]).toMatchObject({
      window: income.window,
      amount: {
        status: "stale",
        value: "1.5",
        observedAt: 200,
        source: income.amount.source,
      },
    })
  },
)

it.each(["ordinary", "editor"] as const)(
  "%s refresh accepts known zero consumption and income instead of retaining old amounts",
  async (mode) => {
    const { account, cost, income } = await periodAccount()
    const saved = await refreshPeriod(mode, account, {
      settledConsumption: [
        {
          ...cost,
          amount: observeAmount("0", cost.amount.source, 300),
          window: { ...cost.window, end: 300 },
        },
      ],
      reportedIncome: [
        {
          ...income,
          amount: observeAmount("0", income.amount.source, 300),
          window: { ...income.window, end: 300 },
        },
      ],
    })
    expect(saved.account_info.settledConsumption?.[0]?.amount).toMatchObject({
      status: "known",
      value: "0",
      observedAt: 300,
    })
    expect(saved.account_info.reportedIncome?.[0]?.amount).toMatchObject({
      status: "known",
      value: "0",
      observedAt: 300,
    })
  },
)

it.each(["day", "source", "asset", "scope", "noncumulative"] as const)(
  "does not reuse another %s's amount when a reading fails",
  async (difference) => {
    const { account, cost } = await periodAccount()
    const failed = {
      ...cost,
      amount: {
        status: "unavailable" as const,
        reason: "missing",
        source: cost.amount.source,
      },
    }
    if (difference === "day")
      failed.window = { ...cost.window, start: 86_400_000, end: 86_400_500 }
    if (difference === "source")
      failed.amount.source = {
        ...cost.amount.source,
        operation: "different endpoint",
      }
    if (difference === "asset")
      failed.asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY }
    if (difference === "scope")
      failed.scope = { ...cost.scope, walletId: "different wallet" }
    if (difference === "noncumulative") {
      delete (failed as { cumulative?: boolean }).cumulative
      failed.window = { ...cost.window, end: 300 }
    }
    const saved = await refreshPeriod("ordinary", account, {
      settledConsumption: [failed],
    })
    expect(saved.account_info.settledConsumption?.[0]?.amount).toEqual(
      failed.amount,
    )
    expect(saved.account_info.settledConsumption?.[0]?.window).toEqual(
      failed.window,
    )
  },
)

it("keeps the later reading when the same cumulative source fails for a shorter interval", async () => {
  const { account, cost } = await periodAccount()
  const saved = await refreshPeriod("ordinary", account, {
    settledConsumption: [
      {
        ...cost,
        window: { ...cost.window, end: 150 },
        amount: {
          status: "unavailable",
          reason: "missing",
          source: cost.amount.source,
        },
      },
    ],
  })
  expect(saved.account_info.settledConsumption).toEqual([
    expect.objectContaining({
      window: cost.window,
      amount: expect.objectContaining({
        status: "stale",
        value: cost.amount.status === "known" ? cost.amount.value : undefined,
      }),
    }),
  ])
})
