// Initialize provider registrations before measuring the shared snapshot queries.
import "~/services/checkin/autoCheckin/providers"

import { http, HttpResponse } from "msw"
import type { HttpHandler } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import { fetchAccountDataWithCheckInStatus } from "~/services/accounts/refresh/fetchAccountData"
import { fetchAccountData } from "~/services/apiService/daya"
import type { DayaKey } from "~/services/apiService/daya/keys"
import {
  createDayaKey,
  deleteDayaKey,
  fetchDayaDefaultKeyGroups,
  fetchDayaGroups,
  fetchDayaKey,
  fetchDayaKeys,
  updateDayaKey,
} from "~/services/apiService/daya/keys"
import {
  fetchDayaCheckInOverview,
  performDayaCheckIn,
} from "~/services/apiService/daya/rewards"
import { AuthTypeEnum } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import type { CheckInConfig } from "~/types/checkIn"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://api.dayaai.com"
const identity = {
  id: 615,
  username: "daya-test-user",
  balance: 3.5,
  status: "active",
}

const accountRequest = (): ApiServiceAccountRequest =>
  ({
    baseUrl: origin,
    auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
    includeTodayCashflow: true,
    checkIn: {
      automaticExecutionEnabled: false,
      selection: { mode: "automatic" },
      methodKnowledge: { methods: {} },
    },
  }) as unknown as ApiServiceAccountRequest

const keyRow = {
  id: 1303,
  user_id: 615,
  key: "sk-daya-plaintext",
  name: "默认密钥",
  group_id: 2,
  group_ids: [2, 21],
  status: "active",
  ip_whitelist: null,
  ip_blacklist: null,
  last_used_at: "2026-10-19T10:00:00+08:00",
  quota: 0,
  quota_used: 1.5,
  expires_at: null,
  created_at: "2026-10-19T01:19:56+08:00",
  updated_at: "2026-10-19T01:19:56+08:00",
  rate_limit_5h: 0,
  rate_limit_1d: 3,
  rate_limit_7d: 0,
  usage_5h: 0,
  usage_1d: 0,
  usage_7d: 0,
}

const envelope = (data: unknown) => ({ code: 0, message: "success", data })

function session() {
  return installCookieTransport("daya_sid", "api.dayaai.com")
}

async function mockIdentity(extra: HttpHandler[] = []) {
  server.use(
    http.get(`${origin}/api/v1/auth/me`, () =>
      HttpResponse.json(envelope(identity)),
    ),
    ...extra,
  )
}

describe("Daya API account data", () => {
  let transport: ReturnType<typeof session>
  it("fetches account data without querying or changing check-in status", async () => {
    const readStatus = vi.fn(() =>
      HttpResponse.json(envelope({ daily_check_in: { claimable: false } })),
    )
    await mockIdentity([
      http.get(`${origin}/api/v1/rewards/overview`, readStatus),
    ])
    const request = accountRequest()
    request.includeTodayCashflow = false
    request.checkIn.selection.methodId = "daya:daily-checkin"
    request.checkIn.methodKnowledge.methods["daya:daily-checkin"] = {
      detection: {
        outcome: "matched",
        evidence: { source: "probe", observedAt: Date.now() },
      },
    }
    const data = await fetchAccountData(request)
    expect(readStatus).not.toHaveBeenCalled()
    expect(data.checkIn).toBe(request.checkIn)
  })

  it.each([
    {
      automaticExecutionEnabled: false,
      claimable: false,
      includeTodayCashflow: false,
    },
    {
      automaticExecutionEnabled: false,
      claimable: true,
      includeTodayCashflow: true,
    },
    {
      automaticExecutionEnabled: true,
      claimable: false,
      includeTodayCashflow: true,
    },
    {
      automaticExecutionEnabled: true,
      claimable: true,
      includeTodayCashflow: false,
    },
  ])(
    "refreshes today's check-in status ($automaticExecutionEnabled, claimable: $claimable, statistics: $includeTodayCashflow)",
    async ({ automaticExecutionEnabled, claimable, includeTodayCashflow }) => {
      const now = Date.now()
      const checkIn: CheckInConfig = {
        automaticExecutionEnabled,
        selection: { mode: "automatic", methodId: "daya:daily-checkin" },
        methodKnowledge: {
          methods: {
            "daya:daily-checkin": {
              detection: {
                outcome: "matched",
                evidence: { source: "probe", observedAt: now - 86_400_000 },
              },
              status: {
                outcome: "known",
                availability: "enabled",
                today: "not_checked",
                evidence: { source: "probe", observedAt: now - 86_400_000 },
              },
            },
          },
        },
      }
      const claim = vi.fn(() => HttpResponse.json(envelope({})))
      await mockIdentity([
        http.get(`${origin}/api/v1/rewards/overview`, () =>
          HttpResponse.json(envelope({ daily_check_in: { claimable } })),
        ),
        http.get(`${origin}/api/v1/usage/dashboard/stats`, () =>
          HttpResponse.json(
            envelope({
              today_requests: 0,
              today_input_tokens: 0,
              today_output_tokens: 0,
              today_cache_creation_tokens: 0,
              today_cache_read_tokens: 0,
              today_cost: 0,
            }),
          ),
        ),
        http.post(`${origin}/api/v1/rewards/check-in`, claim),
      ])
      const data = await fetchAccountDataWithCheckInStatus(
        { fetchData: fetchAccountData },
        {
          siteType: SITE_TYPES.DAYA,
          ...accountRequest(),
          includeTodayCashflow,
          checkIn,
        },
      )
      const status =
        data.checkIn?.methodKnowledge.methods["daya:daily-checkin"]?.status
      expect(status).toMatchObject({
        outcome: "known",
        today: claimable ? "not_checked" : "checked",
      })
      expect(
        status?.outcome === "known" &&
          status.evidence.source === "probe" &&
          status.evidence.observedAt,
      ).toBeGreaterThanOrEqual(now)
      expect(data.checkIn?.automaticExecutionEnabled).toBe(
        automaticExecutionEnabled,
      )
      expect(claim).not.toHaveBeenCalled()
    },
  )
  it("keeps balance refresh successful when reading check-in status fails", async () => {
    await mockIdentity([
      http.get(`${origin}/api/v1/rewards/overview`, () =>
        HttpResponse.json({ message: "Unavailable" }, { status: 503 }),
      ),
    ])
    const data = await fetchAccountDataWithCheckInStatus(
      { fetchData: fetchAccountData },
      {
        siteType: SITE_TYPES.DAYA,
        ...accountRequest(),
        includeTodayCashflow: false,
        checkIn: {
          automaticExecutionEnabled: false,
          selection: { mode: "automatic", methodId: "daya:daily-checkin" },
          methodKnowledge: {
            methods: {
              "daya:daily-checkin": {
                detection: {
                  outcome: "matched",
                  evidence: { source: "probe", observedAt: Date.now() },
                },
              },
            },
          },
        },
      },
    )
    expect(data.quota).toBe(3.5 * QUOTA_PER_USD)
    expect(
      data.checkIn?.methodKnowledge.methods["daya:daily-checkin"]?.status,
    ).toMatchObject({
      outcome: "unknown",
      reason: "source_unavailable",
    })
    expect(data.checkIn?.automaticExecutionEnabled).toBe(false)
  })
  it("keeps the verified account's cookie when ambient login changes before stats", async () => {
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () => {
        transport.cookies.mockResolvedValue([
          {
            name: "daya_sid",
            value: "other-account",
            domain: "api.dayaai.com",
            path: "/",
            hostOnly: true,
            secure: true,
            httpOnly: true,
            session: true,
            sameSite: "lax",
            storeId: "0",
            firstPartyDomain: "",
          },
        ])
        return HttpResponse.json(envelope(identity))
      }),
      http.get(`${origin}/api/v1/usage/dashboard/stats`, ({ request }) =>
        HttpResponse.json(
          envelope({
            today_requests:
              request.headers.get("cookie") === "daya_sid=browser-account"
                ? 4
                : 99,
            today_input_tokens: 0,
            today_output_tokens: 0,
            today_cache_creation_tokens: 0,
            today_cache_read_tokens: 0,
            today_cost: 0,
          }),
        ),
      ),
    )
    expect(
      (await fetchAccountData(accountRequest())).today_requests_count,
    ).toBe(4)
  })
  beforeEach(async () => {
    transport = session()
  })
  afterEach(() => vi.restoreAllMocks())

  it("maps the USD balance and dashboard today statistics", async () => {
    await mockIdentity([
      http.get(`${origin}/api/v1/usage/dashboard/stats`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("timezone")).toBe(
          "Asia/Shanghai",
        )
        return HttpResponse.json(
          envelope({
            today_requests: 4,
            today_input_tokens: 100,
            today_output_tokens: 200,
            today_cache_creation_tokens: 10,
            today_cache_read_tokens: 20,
            today_cost: 0.25,
          }),
        )
      }),
    ])
    const data = await fetchAccountData(accountRequest())
    expect(data.quota).toBe(3.5 * QUOTA_PER_USD)
    expect(data.today_quota_consumption).toBe(0.25 * QUOTA_PER_USD)
    expect(data.today_requests_count).toBe(4)
    expect(data.today_prompt_tokens).toBe(130)
    expect(data.today_completion_tokens).toBe(200)
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable },
    })
  })

  it("keeps today statistics unavailable when the dashboard route fails", async () => {
    await mockIdentity([
      http.get(`${origin}/api/v1/usage/dashboard/stats`, () =>
        HttpResponse.error(),
      ),
    ])
    const data = await fetchAccountData(accountRequest())
    expect(data.quota).toBe(3.5 * QUOTA_PER_USD)
    expect(data.todayStatsAvailability?.consumption).toMatchObject({
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    })
  })

  it("rejects an identity that does not match the saved account", async () => {
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json(envelope({ ...identity, id: 999 })),
      ),
    )
    await expect(fetchAccountData(accountRequest())).rejects.toMatchObject({
      code: "ACCOUNT_IDENTITY_MISMATCH",
    })
  })
})

describe("Daya API keys", () => {
  beforeEach(async () => {
    await session()
  })
  afterEach(() => vi.restoreAllMocks())

  it.each(["0", "../1303", "9007199254740992"])(
    "rejects unsafe key locator %s",
    async (id) => {
      await mockIdentity()
      await expect(fetchDayaKey(accountRequest(), id)).rejects.toThrow(
        "Invalid Daya API response",
      )
    },
  )

  it.each([
    { group_ids: [0] },
    { ip_whitelist: [7] },
    { rate_limit_5h: -1 },
    { status: "unknown" },
  ])(
    "rejects malformed key records before projecting inventory (%j)",
    async (bad) => {
      await mockIdentity([
        http.get(`${origin}/api/v1/keys/1303`, () =>
          HttpResponse.json(envelope({ ...keyRow, ...bad })),
        ),
      ])
      await expect(fetchDayaKey(accountRequest(), "1303")).rejects.toThrow(
        "Invalid Daya API response",
      )
    },
  )

  it.each([null, { items: [], total: -1 }])(
    "rejects invalid inventory page %j",
    async (data) => {
      await mockIdentity([
        http.get(`${origin}/api/v1/keys`, () =>
          HttpResponse.json(envelope(data)),
        ),
      ])
      await expect(fetchDayaKeys(accountRequest())).rejects.toThrow(
        "Invalid Daya API response",
      )
    },
  )

  it("collects all inventory pages in server order", async () => {
    await mockIdentity([
      http.get(`${origin}/api/v1/keys`, ({ request }) =>
        HttpResponse.json(
          envelope({
            items: [
              new URL(request.url).searchParams.get("page") === "1"
                ? keyRow
                : { ...keyRow, id: 1304 },
            ],
            total: 101,
          }),
        ),
      ),
    ])
    expect(
      (await fetchDayaKeys(accountRequest())).map((key) => key.id),
    ).toEqual([1303, 1304])
  })

  it.each(["available", "default-api-key-groups"])(
    "rejects non-array and malformed %s routing catalogues",
    async (route) => {
      const fetch =
        route === "available" ? fetchDayaGroups : fetchDayaDefaultKeyGroups
      await mockIdentity([
        http.get(`${origin}/api/v1/groups/${route}`, () =>
          HttpResponse.json(envelope({})),
        ),
      ])
      await expect(fetch(accountRequest())).rejects.toThrow(
        "Invalid Daya API response",
      )
      server.use(
        http.get(`${origin}/api/v1/groups/${route}`, () =>
          HttpResponse.json(envelope([{ id: 0 }])),
        ),
      )
      await expect(fetch(accountRequest())).rejects.toThrow(
        "Invalid Daya API response",
      )
    },
  )

  it("sends day-based expiry and rejects a create response without its secret", async () => {
    await mockIdentity([
      http.post(`${origin}/api/v1/keys`, async ({ request }) => {
        expect(await request.json()).toMatchObject({ expires_in_days: 30 })
        return HttpResponse.json(envelope({ ...keyRow, key: " " }))
      }),
    ])
    await expect(
      createDayaKey(accountRequest(), {
        name: "",
        groupIds: [2],
        quotaUsd: null,
        expiresInDays: 30,
      }),
    ).rejects.toThrow("Invalid Daya API response")
  })

  it("rejects update with no routes before dispatch and accepts an acknowledgment without an echo", async () => {
    const put = vi.fn(() => HttpResponse.json(envelope(null)))
    await mockIdentity([
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(keyRow)),
      ),
      http.put(`${origin}/api/v1/keys/1303`, put),
    ])
    const baseline = await fetchDayaKey(accountRequest(), "1303")
    const next = {
      name: "",
      groupIds: [],
      quotaUsd: 0,
      status: "active" as const,
      expiresAt: null,
    }
    await expect(
      updateDayaKey(accountRequest(), baseline, next),
    ).rejects.toThrow("Invalid Daya API response")
    expect(put).not.toHaveBeenCalled()
    await expect(
      updateDayaKey(accountRequest(), baseline, { ...next, groupIds: [2] }),
    ).resolves.toEqual(baseline)
  })

  it("lists keys with recoverable plaintext across pages", async () => {
    const page = (items: unknown[]) =>
      HttpResponse.json(envelope({ items, total: items.length, pages: 1 }))
    await mockIdentity([
      http.get(`${origin}/api/v1/keys`, ({ request }) => {
        const params = new URL(request.url).searchParams
        expect(params.get("page_size")).toBe("100")
        return page(params.get("page") === "1" ? [keyRow] : [])
      }),
    ])
    const keys = await fetchDayaKeys({
      baseUrl: origin,
      auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
    })
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({
      id: 1303,
      key: "sk-daya-plaintext",
      quotaUsd: 0,
      quotaUsedUsd: 1.5,
      groupIds: [2, 21],
      rateLimits: { dayUsd: 3 },
    })
  })

  it("reads one key and reports unknown keys as not found", async () => {
    await mockIdentity([
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(keyRow)),
      ),
      http.get(`${origin}/api/v1/keys/999`, () =>
        HttpResponse.json(
          {
            code: 404,
            message: "api key not found",
            reason: "API_KEY_NOT_FOUND",
          },
          { status: 404 },
        ),
      ),
    ])
    const request = {
      baseUrl: origin,
      auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
    }
    await expect(fetchDayaKey(request, "1303")).resolves.toMatchObject({
      name: "默认密钥",
    })
    await expect(fetchDayaKey(request, "999")).rejects.toMatchObject({
      failure: { code: "not_found" },
    })
  })

  it("creates a key with group selection and reads back the plaintext", async () => {
    const created = {
      ...keyRow,
      id: 1400,
      key: "sk-daya-created",
      name: "test key",
      quota: 5,
    }
    await mockIdentity([
      http.post(`${origin}/api/v1/keys`, async ({ request }) => {
        expect(await request.json()).toEqual({
          allow_fast: true,
          name: "test key",
          group_ids: [2, 21],
          group_id: 2,
          quota: 5,
        })
        return HttpResponse.json(envelope(created))
      }),
    ])
    const result = await createDayaKey(
      {
        baseUrl: origin,
        auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
      },
      { name: "test key", groupIds: [2, 21], quotaUsd: 5, expiresInDays: null },
    )
    expect(result).toMatchObject({
      secret: "sk-daya-created",
      item: { id: 1400 },
    })
  })

  it("updates a key while preserving unexposed restrictions from the baseline", async () => {
    await mockIdentity([
      http.put(`${origin}/api/v1/keys/1303`, async ({ request }) => {
        expect(await request.json()).toEqual({
          name: "renamed",
          group_ids: [2],
          status: "active",
          ip_whitelist: [],
          ip_blacklist: [],
          quota: 2,
          expires_at: "",
          rate_limit_5h: 0,
          rate_limit_1d: 3,
          rate_limit_7d: 0,
        })
        return HttpResponse.json(
          envelope({ ...keyRow, name: "renamed", quota: 2 }),
        )
      }),
    ])
    const updated = await updateDayaKey(
      {
        baseUrl: origin,
        auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
      },
      {
        ...keyRow,
        ipWhitelist: null,
        ipBlacklist: null,
        rateLimits: { hours5Usd: 0, dayUsd: 3, days7Usd: 0 },
      } as unknown as DayaKey,
      {
        name: "renamed",
        groupIds: [2],
        quotaUsd: 2,
        status: "active",
        expiresAt: null,
      },
    )
    expect(updated).toMatchObject({ name: "renamed", quotaUsd: 2 })
  })

  it("deletes a key permanently", async () => {
    await mockIdentity([
      http.delete(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(null)),
      ),
    ])
    await expect(
      deleteDayaKey(
        {
          baseUrl: origin,
          auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
        },
        "1303",
      ),
    ).resolves.toBeUndefined()
  })

  it("lists the selectable groups", async () => {
    await mockIdentity([
      http.get(`${origin}/api/v1/groups/available`, () =>
        HttpResponse.json(
          envelope([
            {
              id: 2,
              name: "OpenAI",
              platform: "openai",
              rate_multiplier: 0.24,
              status: "active",
              description: "OpenAI route description",
            },
          ]),
        ),
      ),
    ])
    await expect(
      fetchDayaGroups({
        baseUrl: origin,
        auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
      }),
    ).resolves.toEqual([
      {
        id: 2,
        name: "OpenAI",
        platform: "openai",
        rateMultiplier: 0.24,
        description: "OpenAI route description",
      },
    ])
  })
})

describe("Daya API daily check-in", () => {
  beforeEach(async () => {
    await session()
  })
  afterEach(() => vi.restoreAllMocks())

  it("reports a claimable daily grant from the rewards overview", async () => {
    await mockIdentity([
      http.get(`${origin}/api/v1/rewards/overview`, () =>
        HttpResponse.json(
          envelope({
            site_timezone: "Asia/Shanghai",
            binding_tasks: [],
            daily_check_in: {
              code: "daily_check_in",
              display_currency: "USD",
              display_amount: 0.5,
              status: "claimable",
              claimable: true,
            },
          }),
        ),
      ),
    ])
    const overview = await fetchDayaCheckInOverview({
      baseUrl: origin,
      auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
    })
    expect(overview).toMatchObject({
      checkInClaimable: true,
      rewardUsd: 0.5,
      siteTimezone: "Asia/Shanghai",
    })
  })

  it("checks in once and reports an already-taken grant without a write", async () => {
    let identityReads = 0
    const claimable = http.get(`${origin}/api/v1/rewards/overview`, () =>
      HttpResponse.json(
        envelope({
          site_timezone: "Asia/Shanghai",
          daily_check_in: {
            code: "daily_check_in",
            display_currency: "USD",
            display_amount: 0.5,
            claimable: true,
          },
        }),
      ),
    )
    const claimed = http.get(`${origin}/api/v1/rewards/overview`, () =>
      HttpResponse.json(
        envelope({
          site_timezone: "Asia/Shanghai",
          daily_check_in: {
            code: "daily_check_in",
            display_currency: "USD",
            display_amount: 0.5,
            status: "claimed",
            claimable: false,
          },
        }),
      ),
    )
    let posted = 0
    await mockIdentity([
      claimable,
      http.post(`${origin}/api/v1/rewards/check-in`, () => {
        posted += 1
        return HttpResponse.json(envelope({ amount: 0.5, currency: "USD" }))
      }),
    ])
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () => {
        identityReads += 1
        return HttpResponse.json(envelope(identity))
      }),
    )
    const request = {
      baseUrl: origin,
      auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
    }
    await expect(performDayaCheckIn(request)).resolves.toMatchObject({
      alreadyChecked: false,
      rewardUsd: 0.5,
    })
    expect(posted).toBe(1)
    expect(identityReads).toBe(1)
    server.use(claimed)
    await expect(performDayaCheckIn(request)).resolves.toMatchObject({
      alreadyChecked: true,
    })
    expect(posted).toBe(1)
    expect(identityReads).toBe(2)
  })

  it("never claims binding tasks through the check-in flow", async () => {
    await mockIdentity([
      http.get(`${origin}/api/v1/rewards/overview`, () =>
        HttpResponse.json(
          envelope({
            site_timezone: "Asia/Shanghai",
            binding_tasks: [
              {
                code: "bind_email",
                title: "绑定邮箱",
                status: "claimable",
                claimable: true,
              },
            ],
            daily_check_in: {
              code: "daily_check_in",
              display_currency: "USD",
              display_amount: 0.5,
              claimable: false,
            },
          }),
        ),
      ),
      http.post(`${origin}/api/v1/rewards/tasks/bind_email/claim`, () =>
        HttpResponse.json(envelope({})),
      ),
    ])
    await expect(
      performDayaCheckIn({
        baseUrl: origin,
        auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
      }),
    ).resolves.toMatchObject({ alreadyChecked: true })
  })
})
