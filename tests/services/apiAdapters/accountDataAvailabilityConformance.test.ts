import { http, HttpResponse, type HttpHandler } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_TYPES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import type { AccountData } from "~/services/accounts/accountDataModel"
import { normalizeAccountTodayStatsAvailability } from "~/services/accounts/accountTodayStats"
import type { SiteBackendFamily } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
} from "~/types"
import type { AccountTodayStatsAvailability } from "~/types/accountTodayStats"
import { server } from "~~/tests/msw/server"

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

const producerFixturesByFamily = {
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
} satisfies Record<ProducerFamily, ProducerFixture>

const getProducerFixture = (siteType: AccountSiteType): ProducerFixture => {
  const family = getSiteTypeCapabilities(siteType).family
  if (!family || family === ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported) {
    throw new Error(`Missing producer family metadata for ${siteType}`)
  }
  return producerFixturesByFamily[family]
}

const createRequest = (siteType: AccountSiteType) => {
  const fixture = getProducerFixture(siteType)
  return {
    baseUrl: fixture.baseUrl,
    accountId: `account-${siteType}`,
    auth: {
      authType: fixture.authType,
      userId: "user-1",
      accessToken: "account-token",
    },
    checkIn: { enableDetection: false },
    includeTodayCashflow: true,
  }
}

describe("AccountData availability producer conformance", () => {
  beforeEach(() => {
    server.resetHandlers()
    Object.assign(collectedRequests, {
      newApiStat: 0,
      newApiIncome: 0,
      sub2ApiUsage: 0,
      aihubmixAccount: 0,
      sharedChatUsage: 0,
      voApiV2Stats: 0,
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
      checkIn: { enableDetection: false },
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

  it("uses income content only for absent quota and classifies invalid rows as partial", async () => {
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
                      { quota: "5", content: "$20" },
                      { content: "$2" },
                    ],
                    total: 3,
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

    expect(data.today_income).toBe(
      UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR * 2,
    )
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
      const fixture = getProducerFixture(siteType)
      const request = createRequest(siteType)
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
