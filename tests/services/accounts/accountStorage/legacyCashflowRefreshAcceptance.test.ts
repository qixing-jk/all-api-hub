import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  AccountUpdateUserTimestampMode,
  createDefaultAccountStorageConfig,
} from "~/services/accounts/editing/accountDefaults"
import {
  getDisplayConsumptionProjection,
  getReferenceCashflowTotal,
} from "~/services/accounts/metrics/consumptionProjection"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import { fetchAccountData as fetchCubenceAccountData } from "~/services/apiService/cubence"
import { fetchAccountData } from "~/services/apiService/newApiFamily/default/accountData"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  buildAccountShareSnapshotPayload,
  generateShareSnapshotCaption,
} from "~/services/sharing/shareSnapshots"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

afterEach(() => vi.restoreAllMocks())
beforeEach(() =>
  vi.mocked(browser.permissions.contains).mockResolvedValue(false),
)

it.each(["ordinary", "editor"] as const)(
  "%s keeps saved release cost alongside an unavailable native amount until a usable replacement",
  async (mode) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-19T06:00:00Z"))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    installCookieTransport()
    const origin = "https://cubence.com"
    let cost: number | undefined = undefined
    server.use(
      http.get(origin + "/api/v1/auth/me", () =>
        HttpResponse.json({
          user: {
            id: 7,
            username: "example",
            active: true,
            normal_balance: 12_500_000,
            charity_balance: 9_000_000,
          },
        }),
      ),
      http.get(origin + "/api/v1/analytics/apikeys/hourly-usage", () =>
        HttpResponse.json({
          code: 200,
          range: "today",
          window_start: "2026-11-19T00:00:00+08:00",
          as_of: "2026-11-19T14:00:00+08:00",
          summary: { cost, calls: 4, tokens: 400, output_tokens: 50 },
        }),
      ),
    )
    let account = buildSiteAccount({
      id: `cubence-legacy-${mode}`,
      site_type: SITE_TYPES.CUBENCE,
      site_url: origin,
      authType: AuthTypeEnum.Cookie,
      last_sync_time: Date.now(),
      account_info: {
        ...buildSiteAccount().account_info,
        id: "7",
        today_quota_consumption: 1_625_000,
        todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      },
    })
    const config = createDefaultAccountStorageConfig()
    config.accounts = [account]
    await new Storage({ area: "local" }).set(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      config,
    )
    const refresh = async () => {
      account = (await accountQueries.getAccountById(account.id))!
      const generation = (await accountMutations.beginBalanceRefresh(
        account.id,
        account,
      ))!
      const data = await fetchCubenceAccountData({
        baseUrl: origin,
        accountId: account.id,
        siteType: SITE_TYPES.CUBENCE,
        auth: { authType: AuthTypeEnum.Cookie, userId: "7" },
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        includeTodayCashflow: true,
        checkIn: account.checkIn,
      })
      if (mode === "ordinary") {
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
      } else {
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
      }
      account = (await accountQueries.getAccountById(account.id))!
      return accountPresentation.convertToDisplayData(account)
    }
    const displayed = await refresh()
    expect(displayed.settledConsumption?.[0]?.amount.status).toBe("unavailable")
    expect(displayed.todayStatsAvailability.requests.status).toBe("complete")
    expect(displayed.todayStatsAvailability.tokens.status).toBe("complete")
    expect(displayed.referenceConsumption).toMatchObject({
      amount: { USD: 3.25 },
      lastKnown: true,
    })
    const projection = getDisplayConsumptionProjection([displayed])
    expect(projection.references?.[0]).toMatchObject({
      amount: { USD: 3.25 },
      lastKnown: true,
    })
    expect(projection.groups).toEqual([])
    expect(getReferenceCashflowTotal(projection, "USD")).toBeUndefined()
    const payload = buildAccountShareSnapshotPayload({
      siteName: displayed.name,
      currencyType: CURRENCIES.USD,
      includeTodayCashflow: true,
      consumption: projection,
    })
    const caption = generateShareSnapshotCaption(payload)
    expect(caption).toContain("3.25")
    expect(caption).toContain("account:financial.lastKnown")
    expect(caption).toContain("account:financial.legacy")
    expect(payload.todayNetAmount).toBeUndefined()
    cost = 1_500_000
    const replaced = await refresh()
    expect(replaced.settledConsumption?.[0]?.amount).toMatchObject({
      status: "known",
      value: "1.5",
    })
    expect(replaced.referenceConsumption).toBeUndefined()
  },
)

it.each(["ordinary", "editor"] as const)(
  "%s preserves saved release cashflow after independent source failure",
  async (mode) => {
    const origin = "https://legacy-failed-cashflow.example"
    server.use(
      http.get(origin + "/api/user/self", () =>
        HttpResponse.json({ success: true, data: { id: 1, quota: 5_000_000 } }),
      ),
      http.get(origin + "/api/log/self", () =>
        HttpResponse.json({ message: "unavailable" }, { status: 503 }),
      ),
      http.get(origin + "/api/log/self/stat", () =>
        HttpResponse.json({ message: "unavailable" }, { status: 503 }),
      ),
    )
    const account = buildSiteAccount({
      id: `legacy-${mode}`,
      site_type: SITE_TYPES.NEW_API,
      site_url: origin,
      authType: AuthTypeEnum.AccessToken,
      last_sync_time: Date.now(),
      account_info: {
        ...buildSiteAccount().account_info,
        id: "1",
        today_quota_consumption: 1_625_000,
        today_income: 1_250_000,
        todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      },
    })
    const config = createDefaultAccountStorageConfig()
    config.accounts = [account]
    await new Storage({ area: "local" }).set(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      config,
    )
    const stored = (await accountQueries.getAccountById(account.id))!
    expect(
      accountPresentation.convertToDisplayData(stored).referenceConsumption
        ?.amount.USD,
    ).toBe(3.25)
    const generation = (await accountMutations.beginBalanceRefresh(
      stored.id,
      stored,
    ))!
    const data = await fetchAccountData({
      baseUrl: origin,
      accountId: account.id,
      siteType: SITE_TYPES.NEW_API,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "fixture",
        userId: "1",
      },
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      includeTodayCashflow: true,
      checkIn: account.checkIn,
    })
    expect(data.settledConsumption).toBeUndefined()
    if (mode === "ordinary") {
      const updates = buildAccountRefreshUpdate(
        stored,
        {
          success: true,
          data,
          healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
        },
        false,
      )
      expect(
        await accountMutations.updateAccountFromRefresh(
          stored.id,
          updates,
          undefined,
          stored,
          data,
          generation,
        ),
      ).not.toBeNull()
    } else {
      expect(
        await accountMutations.updateAccountWithCheckInDraft(
          stored.id,
          {},
          stored.checkIn,
          {
            userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
            balanceRefresh: { generation, requestSnapshot: stored, data },
          },
        ),
      ).toBe(true)
    }
    const after = (await accountQueries.getAccountById(stored.id))!
    expect(
      after.account_info.balance!.positions.some(
        (position) =>
          position.amount.status === "known" && position.amount.value === "10",
      ),
    ).toBe(true)
    expect(after.account_info.legacyFinancial?.cashflow?.consumption).toBe(
      1_625_000,
    )
    const displayed = accountPresentation.convertToDisplayData(after)
    expect(displayed.referenceConsumption).toMatchObject({
      amount: { USD: 3.25 },
      lastKnown: true,
    })
    expect(displayed.referenceIncome).toMatchObject({
      amount: { USD: 2.5 },
      lastKnown: true,
    })
  },
)
