import { http, HttpResponse, type HttpHandler } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_USD_TO_CNY_RATE, QUOTA_PER_USD } from "~/constants/money"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_TYPES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import type { AccountData } from "~/services/accounts/accountDataModel"
import { normalizeAccountTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import type { SiteBackendFamily } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { EMRANK_SESSION_COOKIE_NAME } from "~/services/apiService/emrank/constants"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
  SiteHealthStatus,
} from "~/types"
import type { AccountTodayStatsAvailability } from "~/types/accountTodayStats"
import { server } from "~~/tests/msw/server"
import { accountStorageTestSurface } from "~~/tests/test-utils/accountStorageTestSurface"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const complete = { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete } as const
const unavailable = (
  reason: (typeof ACCOUNT_TODAY_METRIC_REASONS)[keyof typeof ACCOUNT_TODAY_METRIC_REASONS],
) => ({ status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable, reason }) as const
const partial = (
  reason: (typeof ACCOUNT_TODAY_METRIC_REASONS)[keyof typeof ACCOUNT_TODAY_METRIC_REASONS],
) => ({ status: ACCOUNT_TODAY_METRIC_STATUSES.Partial, reason }) as const

const collectedRequests = {
  newApiStat: 0,
  newApiIncome: 0,
  sub2ApiUsage: 0,
  aihubmixAccount: 0,
  sharedChatUsage: 0,
  voApiV2Stats: 0,
  openRouterCredits: 0,
  rightCodeAccount: 0,
  rightCodeTodayStats: 0,
  rightCodeOverall: 0,
  kimiAccount: 0,
  grsaiAccount: 0,
  freeModelAccount: 0,
  cubenceAccount: 0,
  relayForAccount: 0,
}

const expectClassifiedAvailability = (data: AccountData) => {
  expect(data.todayStatsAvailability).toBeDefined()
  expect(data.todayStatsAvailability).toEqual(
    normalizeAccountTodayStatsAvailability(data.todayStatsAvailability),
  )

  for (const availability of Object.values(data.todayStatsAvailability!)) {
    expect(availability.reason).not.toBe(
      ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
    )
    expect(Object.values(ACCOUNT_TODAY_METRIC_STATUSES)).toContain(
      availability.status,
    )
  }
}

type ProducerFamily = Exclude<
  SiteBackendFamily,
  typeof ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported
>

type ProducerFixture = {
  baseUrl: string
  authType: AuthTypeEnum
  expectedAvailability: AccountTodayStatsAvailability
  handlers: readonly HttpHandler[]
  expectRequests: (snapshotCount: number) => void
}

/**
 * Kimi is one producer family with two consoles, and each site type answers
 * only on its own account domain, so the family fixture cannot serve both.
 */
const kimiConsoleOriginBySiteType: Partial<Record<AccountSiteType, string>> = {
  [SITE_TYPES.KIMI]: "https://platform.kimi.com",
  [SITE_TYPES.KIMI_GLOBAL]: "https://platform.kimi.ai",
}

const producerFixturesByFamily = {
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Xiaoen]: {
    baseUrl: "https://free.supxh.xin",
    authType: AuthTypeEnum.Cookie,
    expectedAvailability: {
      consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://free.supxh.xin/api/auth/me", () =>
        HttpResponse.json({
          success: true,
          data: {
            id: "user-1",
            username: "user",
            quota: 36000,
            permanentQuota: 36000,
            dailyQuota: 0,
            hasSignedInToday: true,
          },
        }),
      ),
    ],
    expectRequests: () => {},
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Emrank]: {
    baseUrl: "https://emrank.tech",
    authType: AuthTypeEnum.Cookie,
    expectedAvailability: {
      consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://emrank.tech/api/auth/session", () =>
        HttpResponse.json({
          authenticated: true,
          user: { id: 6088, username: "user", display_name: "User" },
        }),
      ),
      http.get("https://emrank.tech/api/account", () =>
        HttpResponse.json({ quota: "20000000", tokens_per_m: "1000000" }),
      ),
    ],
    expectRequests: () => {},
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Krill]: {
    baseUrl: "https://www.krill-code.com",
    authType: AuthTypeEnum.Cookie,
    expectedAvailability: {
      consumption: complete,
      requests: complete,
      tokens: complete,
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://www.krill-code.com/api/auth/me", () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: {
            id: 7,
            email: "user@example.com",
            credit_balance_usd: "0.000000",
            enterprise_memberships: [],
          },
        }),
      ),
      http.get("https://www.krill-code.com/api/subscription", () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: {
            subscriptions: [],
            summary: {
              total_daily_quota_usd: "0",
              total_used_usd: "0",
              total_remaining_usd: "0",
              total_forwarded_remaining_usd: "0",
              entry_route_keys: [],
              subscription_end_at: null,
            },
            credit_balance_usd: "0.000000",
            welfare_balance_usd: "0",
            request_count_quota: null,
            freeze_policy: {
              enabled: true,
              free_mode: false,
              can_freeze: false,
            },
          },
        }),
      ),
      http.post("https://www.krill-code.com/api/request-logs/stats", () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: {
            total_requests: 0,
            success_requests: 0,
            failed_requests: 0,
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            total_cost_usd: "0",
            rpm: 0,
            peak_rpm: 0,
            tpm: 0,
            range_start: "2026-10-14T16:00:00Z",
            range_end: "2026-10-14T23:59:59Z",
            bucket_seconds: 3600,
            trend: [],
          },
        }),
      ),
    ],
    expectRequests: () => {},
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Daya]: {
    baseUrl: "https://api.dayaai.com",
    authType: AuthTypeEnum.Cookie,
    expectedAvailability: {
      consumption: complete,
      requests: complete,
      tokens: complete,
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://api.dayaai.com/api/v1/auth/me", () =>
        HttpResponse.json({
          code: 0,
          message: "success",
          data: {
            id: 615,
            username: "daya-test-user",
            balance: 3.5,
            status: "active",
          },
        }),
      ),
      http.get("https://api.dayaai.com/api/v1/usage/dashboard/stats", () =>
        HttpResponse.json({
          code: 0,
          message: "success",
          data: {
            total_api_keys: 1,
            active_api_keys: 1,
            total_requests: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cache_creation_tokens: 0,
            total_cache_read_tokens: 0,
            total_tokens: 0,
            total_cost: 0,
            total_actual_cost: 0,
            today_requests: 0,
            today_input_tokens: 0,
            today_output_tokens: 0,
            today_cache_creation_tokens: 0,
            today_cache_read_tokens: 0,
            today_tokens: 0,
            today_cost: 0,
            today_actual_cost: 0,
            average_duration_ms: 0,
            rpm: 0,
            tpm: 0,
          },
        }),
      ),
    ],
    expectRequests: () => {},
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Pmapi]: {
    baseUrl: "https://pmcat.top",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: complete,
      requests: complete,
      tokens: complete,
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://pmcat.top/api/me", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 10171,
            username: "pm-test-user",
            quota: 0,
            used_quota: 0,
            checked_in_today: false,
          },
        }),
      ),
      http.get("https://pmcat.top/api/me/stats", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            models: [],
            rpm: 0,
            series: [],
            today: { latency: 0, quota: 0, requests: 0, tokens: 0 },
            token_count: 0,
          },
        }),
      ),
    ],
    expectRequests: () => {},
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.FoxCode]: {
    baseUrl: "https://foxcode.rjj.cc",
    authType: AuthTypeEnum.Cookie,
    expectedAvailability: {
      consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.NotCollected),
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.NotCollected),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.NotCollected),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.NotCollected),
    },
    handlers: [
      http.get("https://foxcode.rjj.cc/api/auth/me", () =>
        HttpResponse.json({
          success: true,
          data: { user: { id: "user-1", name: "Work" } },
        }),
      ),
      http.get("https://foxcode.rjj.cc/api/user/dashboard", () =>
        HttpResponse.json({
          success: true,
          data: {
            user: { id: "user-1", name: "Work" },
            subscription: { active: [] },
          },
        }),
      ),
      http.get("https://foxcode.rjj.cc/api/user/quota/usage", () =>
        HttpResponse.json({
          success: true,
          data: { records: [], pagination: { page: 1, pages: 1 } },
        }),
      ),
    ],
    expectRequests: () => {},
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Dahl]: {
    baseUrl: "https://inference.dahl.global",
    authType: AuthTypeEnum.Cookie,
    expectedAvailability: {
      consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://inference.dahl.global/v1/account", () =>
        HttpResponse.json({
          user: {
            user_id: "00000000-0000-4000-8000-000000000001",
            username: "sample",
          },
          token_balance: 100000000,
          tokens_on_keys: 0,
        }),
      ),
      http.get("https://inference.dahl.global/v1/account/usage", () =>
        HttpResponse.json({
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_requests: 0,
        }),
      ),
    ],
    expectRequests: () => {},
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Cubence]: {
    baseUrl: "https://cubence.com",
    authType: AuthTypeEnum.Cookie,
    expectedAvailability: {
      consumption: complete,
      requests: complete,
      tokens: complete,
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://cubence.com/api/v1/auth/me", ({ request }) => {
        expect(request.headers.get("cookie")).toBe("token=browser-account")
        collectedRequests.cubenceAccount += 1
        return HttpResponse.json({
          user: {
            id: 7,
            username: "Example",
            active: true,
            normal_balance: 1000000,
          },
        })
      }),
      http.get(
        "https://cubence.com/api/v1/analytics/apikeys/hourly-usage",
        () =>
          HttpResponse.json({
            code: 200,
            range: "today",
            window_start: `${new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00+08:00`,
            summary: {
              cost: 10,
              calls: 1,
              tokens: 5,
              input_tokens: 2,
              output_tokens: 3,
              cache_read_tokens: 0,
              cache_creation_tokens: 0,
            },
          }),
      ),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.cubenceAccount).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.FreeModel]: {
    baseUrl: "https://freemodel.dev",
    authType: AuthTypeEnum.Cookie,
    expectedAvailability: {
      consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://freemodel.dev/api/auth/me", () =>
        HttpResponse.json({ user: { id: 7, name: "Example" } }),
      ),
      http.get("https://freemodel.dev/api/billing", () => {
        collectedRequests.freeModelAccount += 1
        return HttpResponse.json({
          creditCents: 125,
          signupCreditCents: 0,
          subscription: { planId: "free", status: "canceled" },
        })
      }),
      http.get("https://freemodel.dev/api/usage", () =>
        HttpResponse.json({
          window5h: { usedCents: 0, limitCents: 0 },
          windowWeek: { usedCents: 0, limitCents: 0 },
        }),
      ),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.freeModelAccount).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily]: {
    baseUrl: "https://new-api-family.example.invalid",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: complete,
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: complete,
    },
    handlers: [
      http.get("https://new-api-family.example.invalid/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { quota: 100 },
        }),
      ),
      http.get(
        "https://new-api-family.example.invalid/api/log/self/stat",
        () => {
          collectedRequests.newApiStat += 1
          return HttpResponse.json({
            success: true,
            message: "",
            data: { quota: 25 },
          })
        },
      ),
      http.get(
        "https://new-api-family.example.invalid/api/log/self",
        ({ request }) => {
          collectedRequests.newApiIncome += 1
          const isDoneHub = new URL(request.url).searchParams.has("log_type")
          return HttpResponse.json({
            success: true,
            message: "",
            data: isDoneHub
              ? { data: [], total_count: 0 }
              : { items: [], total: 0 },
          })
        },
      ),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.newApiStat).toBe(snapshotCount)
      expect(collectedRequests.newApiIncome).toBe(snapshotCount * 2)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api]: {
    baseUrl: "https://sub2api.example.invalid",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: complete,
      requests: complete,
      tokens: complete,
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://sub2api.example.invalid/api/v1/auth/me", () =>
        HttpResponse.json({
          code: 0,
          message: "ok",
          data: { id: 1, username: "example-user", balance: 1 },
        }),
      ),
      http.get("https://sub2api.example.invalid/api/v1/usage/stats", () => {
        collectedRequests.sub2ApiUsage += 1
        return HttpResponse.json({
          code: 0,
          message: "ok",
          data: {
            total_requests: 2,
            total_input_tokens: 3,
            total_output_tokens: 4,
            total_actual_cost: 0.25,
          },
        })
      }),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.sub2ApiUsage).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2]: {
    baseUrl: "https://voapi-v2.example.invalid",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: complete,
      requests: complete,
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://voapi-v2.example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 0,
          data: { id: 1, basicBalance: 1, bindBalance: 0 },
        }),
      ),
      http.get("https://voapi-v2.example.invalid/api/dash/statistics", () => {
        collectedRequests.voApiV2Stats += 1
        return HttpResponse.json({
          code: 0,
          data: {
            d: {
              requests: 2,
              usedBasicBalance: 0.25,
              usedBindBalance: 0,
            },
          },
        })
      }),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.voApiV2Stats).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix]: {
    baseUrl: "https://aihubmix.com",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod),
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://aihubmix.com/api/user/self", () => {
        collectedRequests.aihubmixAccount += 1
        return HttpResponse.json({
          success: true,
          message: "",
          data: { username: "example-user", quota: 100 },
        })
      }),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.aihubmixAccount).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.SharedChat]: {
    baseUrl: "https://sharedchat.example.invalid",
    authType: AuthTypeEnum.Cookie,
    expectedAvailability: {
      consumption: complete,
      requests: complete,
      tokens: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get(
        "https://sharedchat.example.invalid/frontend-api/vibe-code/quota",
        () => {
          collectedRequests.sharedChatUsage += 1
          return HttpResponse.json({
            code: 1,
            msg: "success",
            data: {
              codex: {
                subscriptions: { remainingAmount: 1 },
                currentUsage: {
                  totalRequests: 2,
                  totalTokens: 3,
                  totalCost: 0.25,
                },
              },
            },
          })
        },
      ),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.sharedChatUsage).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.OpenRouter]: {
    baseUrl: "https://mirror.example.invalid",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://openrouter.ai/api/v1/credits", () => {
        collectedRequests.openRouterCredits += 1
        return HttpResponse.json({
          data: { total_credits: 10, total_usage: 2 },
        })
      }),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.openRouterCredits).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.RightCode]: {
    baseUrl: "https://right-code.example.invalid",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: complete,
      requests: complete,
      tokens: complete,
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://right-code.example.invalid/auth/me", () => {
        collectedRequests.rightCodeAccount += 1
        return HttpResponse.json({
          id: 1,
          username: "example-user",
          user_token: "account-token",
          balance: 1,
        })
      }),
      http.get("https://right-code.example.invalid/use-log/stats", () => {
        collectedRequests.rightCodeTodayStats += 1
        return HttpResponse.json({
          total_requests: 2,
          total_tokens: 3,
          total_cost: 0.5,
          start_date: "2026-09-24T00:00",
          end_date: "2026-09-24T00:00",
        })
      }),
      http.get(
        "https://right-code.example.invalid/use-log/stats/overall",
        () => {
          collectedRequests.rightCodeOverall += 1
          return HttpResponse.json({
            total_requests: 5,
            total_tokens: 6,
            total_cost: 0.25,
            period_days: 0,
            note: "统计范围为全部历史",
          })
        },
      ),
      http.get("https://right-code.example.invalid/subscriptions/list", () =>
        HttpResponse.json({ subscriptions: [], total: 0 }),
      ),
      http.get(
        "https://right-code.example.invalid/subscriptions/summary/total",
        () =>
          HttpResponse.json({
            total_quota: 0,
            used_quota: 0,
            remaining_quota: 0,
            active_subscription_count: 0,
          }),
      ),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.rightCodeAccount).toBe(snapshotCount)
      expect(collectedRequests.rightCodeTodayStats).toBe(snapshotCount)
      expect(collectedRequests.rightCodeOverall).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.KimiOpenPlatform]: {
    baseUrl: "https://platform.kimi.ai",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: complete,
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get(/^https:\/\/platform\.kimi\.(?:com|ai)\/api$/, ({ request }) => {
        collectedRequests.kimiAccount += 1
        const endpoint = new URL(request.url).searchParams.get("endpoint")
        if (endpoint !== "organizationAccountInfo") {
          return HttpResponse.json(
            { code: 404, message: "unexpected" },
            { status: 404 },
          )
        }
        return HttpResponse.json({
          code: 0,
          data: {
            cur: 1,
            voucher_cur: 0,
            acc: 0,
            voucher_acc: 0,
            voucher_expired: 0,
            recharge_bonus_percent: 0,
            use: 0,
            today_consume: 0.25,
          },
        })
      }),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.kimiAccount).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Grsai]: {
    // The console serves its frontend and its data API from different hosts, so
    // the account's own origin is not where the adapter reads from.
    baseUrl: "https://grsai.com",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: complete,
      // The deployment reports no request, token or income series at all.
      requests: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      tokens: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.post("https://eb.grsaiapi.com/client/common/getConfig", () =>
        HttpResponse.json({
          code: 0,
          msg: "success",
          data: {
            token: "grsai-session-token",
            kis: "kis-blob",
            ra1: "ra1",
            ra2: "ra2",
            random: "1234567890",
            isAuth: true,
          },
        }),
      ),
      http.post("https://eb.grsaiapi.com/client/grsai/getUserInfo", () =>
        HttpResponse.json({
          code: 0,
          msg: "success",
          data: {
            id: "user-1",
            mail: "example@example.invalid",
            credits: 5000,
          },
        }),
      ),
      http.post("https://eb.grsaiapi.com/client/grsai/getDashboardData", () => {
        collectedRequests.grsaiAccount += 1
        return HttpResponse.json({
          code: 0,
          msg: "success",
          data: { credits: 5000, todayConsumed: 1000, totalConsumed: 250000 },
        })
      }),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.grsaiAccount).toBe(snapshotCount)
    },
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.RelayFor]: {
    baseUrl: "https://relayfor.example.invalid",
    authType: AuthTypeEnum.AccessToken,
    expectedAvailability: {
      consumption: complete,
      requests: complete,
      tokens: complete,
      income: unavailable(ACCOUNT_TODAY_METRIC_REASONS.Unsupported),
    },
    handlers: [
      http.get("https://relayfor.example.invalid/api/user/overview", () => {
        collectedRequests.relayForAccount += 1
        return HttpResponse.json({
          user: {
            id: 1,
            username: "relay-user",
            quota: 500000,
            role: 1,
          },
          today: {
            requests: 5,
            tokens: 100,
            quota: 2500,
          },
          requests: 50,
          token_count: 1000,
          total_quota: 25000,
        })
      }),
    ],
    expectRequests: (snapshotCount: number) => {
      expect(collectedRequests.relayForAccount).toBe(snapshotCount)
    },
  },
} satisfies Record<ProducerFamily, ProducerFixture>

const getProducerFixture = (siteType: AccountSiteType): ProducerFixture => {
  const family = getSiteTypeCapabilities(siteType).family
  if (!family || family === ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported) {
    throw new Error(`Missing producer family metadata for ${siteType}`)
  }
  return producerFixturesByFamily[family]
}

const resolveConformanceBaseUrl = (siteType: AccountSiteType): string =>
  kimiConsoleOriginBySiteType[siteType] ?? getProducerFixture(siteType).baseUrl

const createRequest = (siteType: AccountSiteType) => {
  const fixture = getProducerFixture(siteType)
  return {
    baseUrl: resolveConformanceBaseUrl(siteType),
    accountId: `account-${siteType}`,
    auth: {
      authType: fixture.authType,
      userId:
        siteType === SITE_TYPES.DAHL
          ? "00000000-0000-4000-8000-000000000001"
          : siteType === SITE_TYPES.FREEMODEL ||
              siteType === SITE_TYPES.CUBENCE ||
              siteType === SITE_TYPES.KRILL
            ? "7"
            : siteType === SITE_TYPES.EMRANK
              ? "6088"
              : siteType === SITE_TYPES.DAYA
                ? "615"
                : siteType === SITE_TYPES.PMAPI
                  ? "10171"
                  : "user-1",
      accessToken: "account-token",
    },
    checkIn: buildCheckInConfig(),
    includeTodayCashflow: true,
    ...(getSiteTypeCapabilities(siteType).family ===
    ACCOUNT_SITE_ADAPTER_FAMILIES.KimiOpenPlatform
      ? {
          kimiOpenPlatformAuth: {
            accessToken: "account-token",
            refreshToken: "refresh-token",
            organizationId: "org-1",
          },
        }
      : {}),
  }
}

/**
 * Kimi reloads its saved console session by account id and rejects the request
 * when that account's site type, origin, identity, or session has moved on, so
 * that path needs the stored account its production callers always have.
 */
const createStoredKimiAccount = async (
  siteType: AccountSiteType,
  baseUrl: string,
) =>
  accountStorageTestSurface.addAccount({
    site_name: `Conformance ${siteType}`,
    site_url: baseUrl,
    site_type: siteType,
    health: { status: SiteHealthStatus.Healthy },
    authType: AuthTypeEnum.AccessToken,
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    exchange_rate: DEFAULT_USD_TO_CNY_RATE,
    notes: "",
    tagIds: [],
    checkIn: buildCheckInConfig(),
    last_sync_time: 0,
    account_info: {
      id: "user-1",
      access_token: "account-token",
      username: "user-1",
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    kimiOpenPlatformAuth: {
      refreshToken: "refresh-token",
      organizationId: "org-1",
    },
  })

const createAccountScopedRequest = async (siteType: AccountSiteType) => {
  const request = createRequest(siteType)
  if (
    getSiteTypeCapabilities(siteType).family !==
    ACCOUNT_SITE_ADAPTER_FAMILIES.KimiOpenPlatform
  ) {
    return request
  }
  const accountId = await createStoredKimiAccount(siteType, request.baseUrl)
  return { ...request, accountId }
}

describe("AccountData availability producer conformance", () => {
  afterEach(() => vi.restoreAllMocks())

  beforeEach(() => {
    vi.spyOn(browser.permissions, "contains").mockResolvedValue(false)
    server.resetHandlers()
    Object.assign(collectedRequests, {
      newApiStat: 0,
      newApiIncome: 0,
      sub2ApiUsage: 0,
      aihubmixAccount: 0,
      sharedChatUsage: 0,
      voApiV2Stats: 0,
      openRouterCredits: 0,
      rightCodeAccount: 0,
      rightCodeTodayStats: 0,
      rightCodeOverall: 0,
      kimiAccount: 0,
      grsaiAccount: 0,
      freeModelAccount: 0,
      cubenceAccount: 0,
      relayForAccount: 0,
    })
    server.use(
      ...Object.values(producerFixturesByFamily).flatMap(
        ({ handlers }) => handlers,
      ),
    )
  })

  it("rejects invalid status and reason coupling", () => {
    const invalidData: AccountData = {
      quota: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_income: 0,
      todayStatsAvailability: {
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        requests: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
      checkIn: buildCheckInConfig(),
    }

    expect(() => expectClassifiedAvailability(invalidData)).toThrow()
  })

  it("classifies malformed New API usage rows per metric through the real producer", async () => {
    server.use(
      http.get("https://new-api-family.example.invalid/api/log/self/stat", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { quota: "not-a-number" },
        }),
      ),
      http.get(
        "https://new-api-family.example.invalid/api/log/self",
        ({ request }) => {
          const params = new URL(request.url).searchParams
          const logType = params.get("type")
          if (logType === String(LogType.Consume)) {
            return HttpResponse.json({
              success: true,
              message: "",
              data: {
                items: [
                  null,
                  "not-a-row",
                  {
                    quota: Number.NaN,
                    prompt_tokens: Number.POSITIVE_INFINITY,
                    completion_tokens: "3",
                  },
                  { quota: 10, prompt_tokens: 2, completion_tokens: 4 },
                ],
                total: 4,
              },
            })
          }
          return HttpResponse.json({
            success: true,
            message: "",
            data: { items: [], total: 0 },
          })
        },
      ),
    )

    const capabilities = getSiteTypeCapabilities(SITE_TYPES.NEW_API)
    const data = await capabilities.account!.data!.fetchData(
      createRequest(SITE_TYPES.NEW_API),
    )

    expect(data.today_quota_consumption).toBe(10)
    expect(data.today_prompt_tokens).toBe(2)
    expect(data.today_completion_tokens).toBe(4)
    expect(data.today_requests_count).toBe(2)
    expect(data.todayStatsAvailability).toEqual({
      consumption: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
      requests: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
      tokens: partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
      income: complete,
    })
    expectClassifiedAvailability(data)
  })

  it("uses content for absent or zero quota, prefers nonzero quota, and classifies invalid rows as partial", async () => {
    server.use(
      http.get(
        "https://new-api-family.example.invalid/api/log/self",
        ({ request }) => {
          const logType = new URL(request.url).searchParams.get("type")
          return HttpResponse.json({
            success: true,
            message: "",
            data:
              logType === String(LogType.Topup)
                ? {
                    items: [
                      { quota: 0, content: "$50" },
                      { quota: 5, content: "$20" },
                      { quota: "5", content: "$20" },
                      { content: "$2" },
                    ],
                    total: 4,
                  }
                : { items: [], total: 0 },
          })
        },
      ),
    )

    const capabilities = getSiteTypeCapabilities(SITE_TYPES.NEW_API)
    const data = await capabilities.account!.data!.fetchData(
      createRequest(SITE_TYPES.NEW_API),
    )

    expect(data.today_income).toBe(QUOTA_PER_USD * 52 + 5)
    expect(data.todayStatsAvailability?.income).toEqual(
      partial(ACCOUNT_TODAY_METRIC_REASONS.SourcePartial),
    )
    expect(Number.isFinite(data.today_income)).toBe(true)
  })

  it("marks income unavailable when every covered row is invalid", async () => {
    server.use(
      http.get("https://new-api-family.example.invalid/api/log/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            items: [{ quota: "5", content: "$20" }],
            total: 1,
          },
        }),
      ),
    )

    const capabilities = getSiteTypeCapabilities(SITE_TYPES.NEW_API)
    const data = await capabilities.account!.data!.fetchData(
      createRequest(SITE_TYPES.NEW_API),
    )

    expect(data.today_income).toBe(0)
    expect(data.todayStatsAvailability?.income).toEqual(
      unavailable(ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload),
    )
  })

  it.each(ACCOUNT_SITE_TYPES)(
    "classifies both registered producer paths for %s",
    async (siteType) => {
      const capabilities = getSiteTypeCapabilities(siteType)
      if (capabilities.family === ACCOUNT_SITE_ADAPTER_FAMILIES.Xiaoen) {
        const boundary = installCookieTransport()
        const cookie = (await browser.cookies.getAll({}))[0]!
        boundary.cookies.mockResolvedValue([
          { ...cookie, domain: "free.supxh.xin", name: "auth_token" },
        ])
      }
      if (capabilities.family === ACCOUNT_SITE_ADAPTER_FAMILIES.FoxCode) {
        const boundary = installCookieTransport()
        const cookie = (await browser.cookies.getAll({}))[0]!
        boundary.cookies.mockResolvedValue([
          { ...cookie, domain: "foxcode.rjj.cc", name: "auth_token" },
        ])
      }
      if (capabilities.family === ACCOUNT_SITE_ADAPTER_FAMILIES.Cubence) {
        installCookieTransport()
      }
      if (capabilities.family === ACCOUNT_SITE_ADAPTER_FAMILIES.Krill) {
        const boundary = installCookieTransport()
        const cookie = (await browser.cookies.getAll({}))[0]!
        boundary.cookies.mockResolvedValue([
          { ...cookie, domain: "www.krill-code.com", name: "krill_jwt" },
        ])
      }
      if (capabilities.family === ACCOUNT_SITE_ADAPTER_FAMILIES.Emrank) {
        installCookieTransport(EMRANK_SESSION_COOKIE_NAME, "emrank.tech")
      }
      if (capabilities.family === ACCOUNT_SITE_ADAPTER_FAMILIES.Daya) {
        installCookieTransport("daya_sid", "api.dayaai.com")
      }
      if (capabilities.family === ACCOUNT_SITE_ADAPTER_FAMILIES.Dahl) {
        const boundary = installCookieTransport()
        const cookie = (await browser.cookies.getAll({}))[0]!
        boundary.cookies.mockResolvedValue([
          { ...cookie, domain: "inference.dahl.global", name: "dahl_session" },
        ])
      }
      const fixture = getProducerFixture(siteType)
      const request = await createAccountScopedRequest(siteType)
      const fetchData = capabilities.account?.data?.fetchData
      const refreshAccount = capabilities.account?.refresh?.refreshAccount

      expect(fetchData).toBeTypeOf("function")
      expect(refreshAccount).toBeTypeOf("function")

      const data = await fetchData!(request)
      expectClassifiedAvailability(data)
      expect(data.todayStatsAvailability).toEqual(fixture.expectedAvailability)
      fixture.expectRequests(1)

      const refreshResult = await refreshAccount!(request)
      expect(refreshResult.success).toBe(true)
      if (refreshResult.success) {
        expectClassifiedAvailability(refreshResult.data)
        expect(refreshResult.data.todayStatsAvailability).toEqual(
          fixture.expectedAvailability,
        )
        fixture.expectRequests(2)
      }
    },
  )
})
