import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { validateAndUpdateAccount } from "~/services/accounts/editing/accountUpdate"
import { refreshStoredAccount } from "~/services/accounts/refresh/refreshStoredAccount"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { createCheckInConfig } from "~~/tests/services/apiAdapters/checkInFixtures"

const deps = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  login: vi.fn(),
  browser: vi.fn(),
  identity: vi.fn(),
}))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      return structuredClone(deps.storage.get(key))
    }
    async set(key: string, value: unknown) {
      deps.storage.set(key, structuredClone(value))
    }
    async remove(key: string) {
      deps.storage.delete(key)
    }
  },
}))
vi.mock("~/services/accountLogin", () => ({ loginAccount: deps.login }))
vi.mock("~/services/apiService/sub2api/auth/browserAuth", async (original) => ({
  ...(await original<
    typeof import("~/services/apiService/sub2api/auth/browserAuth")
  >()),
  recoverSub2ApiBrowserAuth: deps.browser,
}))
vi.mock("~/services/apiService/sub2api/auth/authIdentity", () => ({
  fetchSub2ApiAuthIdentity: deps.identity,
}))
vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: async () => DEFAULT_PREFERENCES },
}))
vi.mock("~/services/history/usageHistory/scheduler", () => ({
  usageHistoryScheduler: {
    runAfterRefreshSync: vi.fn().mockResolvedValue(null),
  },
}))
vi.mock("~/services/history/dailyBalanceHistory/capture", () => ({
  maybeCaptureDailyBalanceSnapshot: vi.fn(),
}))

describe("stored Sub2API account login recovery", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    deps.storage.clear()
    await accountConfigStore.mutate((config) => {
      config.accounts = [
        {
          id: "saved",
          site_type: SITE_TYPES.SUB2API,
          site_url: "https://sub2api.example",
          site_name: "Sub2API",
          authType: AuthTypeEnum.AccessToken,
          account_info: {
            id: "17",
            access_token: "expired",
            username: "member",
          },
          checkIn: createCheckInConfig(SITE_TYPES.SUB2API, {
            automaticExecutionEnabled: false,
          }),
          login: {
            methodId: ACCOUNT_LOGIN_METHODS.Password,
            credentials: {
              username: "member@example.com",
              password: "fixture",
            },
            automaticRecovery: true,
          },
        } as SiteAccount,
      ]
      return { changed: true, result: undefined }
    })
    deps.browser.mockResolvedValue({
      accessToken: "rejected-browser-token",
      userId: "17",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    deps.login.mockResolvedValue({
      status: BROWSER_LOGIN_STATUS.Authenticated,
      identity: "17",
      credential: {
        accessToken: "login-access",
        sub2apiAuth: {
          refreshToken: "login-refresh",
          tokenExpiresAt: 2000000000000,
        },
      },
    })
    deps.identity.mockImplementation(async (request: ApiServiceRequest) => {
      if (request.auth.accessToken !== "login-access") {
        throw new ApiError(
          "expired",
          401,
          "/api/v1/auth/me",
          API_ERROR_CODES.HTTP_401,
        )
      }
      return {
        identity: {
          userId: "17",
          username: "member",
          quota: 1250000,
          balanceUsd: 2.5,
        },
      }
    })
  })

  it("logs in after the recovered browser token is rejected, then retains the new pair through refresh persistence", async () => {
    const loaded = (await accountQueries.getAccountById("saved"))!
    const result = await refreshStoredAccount("saved", true, {
      includeTodayCashflow: false,
    })

    expect(deps.login).toHaveBeenCalledTimes(1)
    expect(result?.account?.health.status).toBe(SiteHealthStatus.Healthy)
    expect(await accountQueries.getAccountById("saved")).toMatchObject({
      account_info: { access_token: "login-access", quota: 1250000 },
      sub2apiAuth: {
        refreshToken: "login-refresh",
        tokenExpiresAt: 2000000000000,
      },
    })

    const saved = await validateAndUpdateAccount({
      accountId: loaded.id,
      url: loaded.site_url,
      siteName: "Sub2API",
      username: "member",
      userId: "17",
      accessToken: "expired",
      exchangeRate: "7",
      notes: "unrelated edit",
      tagIds: [],
      checkInConfig: loaded.checkIn,
      siteType: SITE_TYPES.SUB2API,
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
      options: {
        deferDataRefresh: true,
        loadedSub2ApiAuth: {
          siteUrl: loaded.site_url,
          userId: "17",
          accessToken: "expired",
        },
      },
    })
    expect(saved.success).toBe(true)
    expect(await accountQueries.getAccountById("saved")).toMatchObject({
      notes: "unrelated edit",
      account_info: { access_token: "login-access" },
      sub2apiAuth: {
        refreshToken: "login-refresh",
        tokenExpiresAt: 2000000000000,
      },
    })
  })
})
