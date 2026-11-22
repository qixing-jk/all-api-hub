import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import { getSiteDayUsages } from "~/services/accounts/metrics/accountTodayStats"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import { AIMLAPI_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import {
  aimlApiAccountData,
  fetchAimlApiTodayUsage,
} from "~/services/apiService/aimlapi/accountData"
import {
  AIMLAPI_BILLING_DETAIL_ENDPOINT,
  AIMLAPI_BILLING_ENDPOINT,
  AIMLAPI_LOGS_ENDPOINT,
  AIMLAPI_USAGE_DETAIL_ENDPOINT,
} from "~/services/apiService/aimlapi/constants"
import { AIMLAPI_KEY_PREFIX } from "~/services/apiService/aimlapi/keys"
import { fetchAimlApiModels } from "~/services/apiService/aimlapi/models"
import { fetchAimlApiKeyUsagePage } from "~/services/apiService/aimlapi/usage"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const managementKey = "management-key-value"
const apiKey = "regular-api-key-value"

/** The account's primary credential is a management key; billing needs the API key. */
const createRequest = (
  overrides: Partial<ApiServiceAccountRequest> & {
    aimlApiKey?: string
  } = {},
): ApiServiceAccountRequest => {
  const { aimlApiKey: regularKey, ...rest } = overrides
  return bindApiTransportRequest(
    {
      baseUrl: "https://aimlapi.com",
      accountId: "acc-aimlapi",
      checkIn: buildCheckInConfig(),
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: managementKey,
        userId: "test-user-id",
      },
      ...(regularKey ? { aimlApiKey: regularKey } : {}),
      ...rest,
    },
    rest.directRequestReason ?? API_DIRECT_REQUEST_REASONS.Passive,
  )
}

const apiOrigin = AIMLAPI_API_BASE_URL

it.each([undefined, null, -1, "4"])(
  "retains known cost and token counts independently of unavailable requests: %s",
  async (requests) => {
    server.use(
      http.get(`${apiOrigin}${AIMLAPI_BILLING_ENDPOINT}`, () =>
        HttpResponse.json({
          currency: CURRENCIES.USD,
          current_balance: "12.5",
        }),
      ),
      http.get(`${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`, () =>
        HttpResponse.json({
          spend: "2.5",
          requests,
          groups: [{ tokens: { input: 100, output: 50 } }],
        }),
      ),
    )
    const data = await aimlApiAccountData.fetchData(
      createRequest({ aimlApiKey: apiKey }),
    )
    expect(data.settledConsumption?.[0]?.amount).toMatchObject({
      status: "known",
      value: "2.5",
    })
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: { status: "complete" },
      requests: { status: "unavailable", reason: "invalid_payload" },
      tokens: { status: "complete" },
    })
    expect(data.today_prompt_tokens).toBe(100)
    expect(data.today_completion_tokens).toBe(50)
  },
)

it.each([undefined, null, -1, "invalid"])(
  "retains valid daily counters independently of unavailable billed cost: %s",
  async (spend) => {
    server.use(
      http.get(`${apiOrigin}${AIMLAPI_BILLING_ENDPOINT}`, () =>
        HttpResponse.json({
          currency: CURRENCIES.USD,
          current_balance: "12.5",
        }),
      ),
      http.get(`${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`, () =>
        HttpResponse.json({
          spend,
          requests: 4,
          groups: [{ tokens: { input: 100, output: 50 } }],
        }),
      ),
    )
    const data = await aimlApiAccountData.fetchData(
      createRequest({ aimlApiKey: apiKey }),
    )
    expect(data.settledConsumption?.[0]?.amount.status).toBe("unavailable")
    expect(data.today_requests_count).toBe(4)
    expect(data.today_prompt_tokens).toBe(100)
    expect(data.today_completion_tokens).toBe(50)
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: { status: "unavailable", reason: "invalid_payload" },
      requests: { status: "complete" },
      tokens: { status: "complete" },
    })
  },
)

it.each([
  {
    body: { spend: "2.5", groups: [] },
    requests: "unavailable",
    tokens: "complete",
  },
  {
    body: { spend: "2.5", requests: 4, groups: [{ tokens: { input: 100 } }] },
    requests: "complete",
    tokens: "unavailable",
  },
  {
    body: { spend: "2.5", requests: 4 },
    requests: "complete",
    tokens: "unavailable",
  },
])(
  "retains known billed costs independently of missing daily counters: %j",
  async ({ body, requests, tokens }) => {
    server.use(
      http.get(`${apiOrigin}${AIMLAPI_BILLING_ENDPOINT}`, () =>
        HttpResponse.json({
          currency: CURRENCIES.USD,
          current_balance: "12.5",
        }),
      ),
      http.get(`${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`, () =>
        HttpResponse.json(body),
      ),
    )
    const data = await aimlApiAccountData.fetchData(
      createRequest({ aimlApiKey: apiKey }),
    )
    expect(data.settledConsumption?.[0]?.amount).toMatchObject({
      status: "known",
      value: "2.5",
    })
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: { status: "complete" },
      requests: { status: requests },
      tokens: { status: tokens },
    })
    expect(data.today_requests_count).toBe(requests === "complete" ? 4 : 0)
  },
)

it("includes unfiltered UTC billed costs in financial reporting without broadening wallet restrictions", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-19T06:00:00Z"))
  server.use(
    http.get(`${apiOrigin}${AIMLAPI_BILLING_ENDPOINT}`, () =>
      HttpResponse.json({ currency: CURRENCIES.USD, current_balance: "12.5" }),
    ),
    http.get(`${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`, () =>
      HttpResponse.json({ spend: "2.5", requests: 4, groups: [] }),
    ),
  )
  const data = await aimlApiAccountData.fetchData(
    createRequest({ aimlApiKey: apiKey }),
  )
  const projection = getDisplayConsumptionProjection([
    { id: "acc-aimlapi", settledConsumption: data.settledConsumption },
  ])
  const matchesViewerDay =
    new Date(2026, 10, 19).getTime() === Date.parse("2026-11-19T00:00:00Z")
  expect(projection.groups.map(({ amount }) => amount.value)).toEqual(
    matchesViewerDay ? ["2.5"] : [],
  )
  if (!matchesViewerDay)
    expect(getSiteDayUsages(data)[0]?.cost?.amount).toMatchObject({
      status: "known",
      value: "2.5",
    })
  expect(data.settledConsumption?.[0]).toMatchObject({
    cumulative: true,
    scope: {
      projects: { kind: "all" },
      keys: { kind: "all" },
      models: { kind: "all" },
      groups: { kind: "all" },
    },
    window: {
      start: Date.parse("2026-11-19T00:00:00Z"),
      end: Date.parse("2026-11-20T00:00:00Z"),
      timeZone: "UTC",
    },
  })
  expect(data.balance?.positions[0]?.scope.keys).toEqual({ kind: "unknown" })
})

afterEach(() => {
  vi.useRealTimers()
})

it("keeps a missing billed cost unavailable while retaining known request counts", async () => {
  server.use(
    http.get(`${apiOrigin}${AIMLAPI_BILLING_ENDPOINT}`, () =>
      HttpResponse.json({ currency: CURRENCIES.USD, current_balance: "12.5" }),
    ),
    http.get(`${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`, () =>
      HttpResponse.json({ spend: null, requests: 4, groups: [] }),
    ),
  )
  const data = await aimlApiAccountData.fetchData(
    createRequest({ aimlApiKey: apiKey }),
  )
  expect(data.settledConsumption?.[0]?.amount.status).toBe("unavailable")
  expect(
    getDisplayConsumptionProjection([
      { id: "acc-aimlapi", settledConsumption: data.settledConsumption },
    ]).groups,
  ).toEqual([])
  expect(data.todayStatsAvailability?.consumption).toMatchObject({
    status: "unavailable",
    reason: "invalid_payload",
  })
  expect(data.today_requests_count).toBe(4)
})

it("preserves exact wallet and UTC billed spend without scaling through product quota", async () => {
  server.use(
    http.get(`${apiOrigin}${AIMLAPI_BILLING_ENDPOINT}`, () =>
      HttpResponse.json({
        currency: CURRENCIES.USD,
        current_balance: "12.000000000000000017",
      }),
    ),
    http.get(`${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`, () =>
      HttpResponse.json({
        spend: "0.000000000000000017",
        requests: 1,
        groups: [],
      }),
    ),
  )
  const data = await aimlApiAccountData.fetchData(
    createRequest({ aimlApiKey: apiKey }),
  )
  expect(data.balance?.positions[0]?.amount).toMatchObject({
    value: "12.000000000000000017",
  })
  expect(data.settledConsumption?.[0]).toMatchObject({
    asset: { kind: "currency", code: "USD" },
    amount: { value: "0.000000000000000017" },
    window: { timeZone: "UTC" },
  })
})

it("keeps public model discovery anonymous even with saved account credentials", async () => {
  let authorization: string | null | undefined
  server.use(
    http.get(`${apiOrigin}/v1/models`, ({ request }) => {
      authorization = request.headers.get("authorization")
      return HttpResponse.json({
        data: [
          {
            id: "public-model",
            type: "openai/chat-completions",
            info: { name: "Public model", developer: "Provider" },
          },
        ],
      })
    }),
  )
  await fetchAimlApiModels(createRequest({ aimlApiKey: apiKey }))
  expect(authorization).toBeNull()
})

describe("AI/ML API account data", () => {
  it("does not redate a balance when the following usage request crosses midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(1740787200000)
    server.use(
      http.get(`${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`, () => {
        vi.setSystemTime(1740873600000)
        return HttpResponse.json({ spend: 0, requests: 0, groups: [] })
      }),
    )
    try {
      const data = await aimlApiAccountData.fetchData(
        createRequest({ aimlApiKey: apiKey }),
      )
      expect(data.balance?.capturedAt).toBe(1740787200000)
      expect(data.balance?.positions[0]?.amount).toMatchObject({
        observedAt: 1740787200000,
      })
    } finally {
      vi.useRealTimers()
    }
  })
  it("preserves native USD and known asset identity when regular credentials are missing", async () => {
    const known = await aimlApiAccountData.fetchData(
      createRequest({ aimlApiKey: apiKey }),
    )
    expect(known).not.toHaveProperty("quota")
    expect(known).not.toHaveProperty("nativeBalance")
    expect(known.balance?.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      nature: "prepaid",
      amount: { status: "known", value: "12.5" },
    })
    const unavailable = await aimlApiAccountData.fetchData(createRequest())
    expect(known.balanceRefreshParts).toEqual([
      expect.objectContaining({
        enumeration: "complete",
        positions: known.balance?.positions,
      }),
    ])
    expect(unavailable.balanceRefreshParts).toEqual([
      expect.objectContaining({
        enumeration: "complete",
        positions: unavailable.balance?.positions,
      }),
    ])
    expect(unavailable.balance?.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { status: "unavailable" },
    })
  })
  beforeEach(() => {
    server.use(
      http.get(`${apiOrigin}${AIMLAPI_BILLING_ENDPOINT}`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe(`Bearer ${apiKey}`)
        return HttpResponse.json({
          current_balance: 12.5,
          currency: CURRENCIES.USD,
        })
      }),
      http.get(
        `${apiOrigin}${AIMLAPI_BILLING_DETAIL_ENDPOINT}`,
        ({ request }) => {
          expect(request.headers.get("authorization")).toBe(`Bearer ${apiKey}`)
          return HttpResponse.json({
            user_id: 123,
            email: "user@example.com",
            current_balance: 12.5,
            currency: CURRENCIES.USD,
            autotopup_settings: {
              is_enabled: false,
              threshold: 10,
              amount: 20,
              currency: CURRENCIES.USD,
            },
          })
        },
      ),
      http.get(
        `${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`,
        ({ request }) => {
          expect(request.headers.get("authorization")).toBe(`Bearer ${apiKey}`)
          const url = new URL(request.url)
          expect(url.searchParams.get("group_by")).toBe("day")
          expect(url.searchParams.get("tz")).toBe("UTC")
          return HttpResponse.json({
            api_key_prefix: null,
            start: "2026-10-24T00:00:00.000Z",
            end: "2026-10-25T00:00:00.000Z",
            spend: 1.25,
            currency: CURRENCIES.USD,
            requests: 7,
            models: [],
            groups: [
              {
                day: "2026-10-24",
                spend: 1.25,
                tokens: { input: 1000, output: 500, total: 1500 },
                requests: { total: 9, charged: 7, succeeded: 7, failed: 2 },
              },
            ],
          })
        },
      ),
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  it("reads balance from the regular API key and reports today's usage", async () => {
    const data = await aimlApiAccountData.fetchData(
      createRequest({ aimlApiKey: apiKey }),
    )

    expect(data.balance?.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "12.5" },
    })
    expect(data.today_quota_consumption).toBe(625_000)
    expect(data.today_prompt_tokens).toBe(1000)
    expect(data.today_completion_tokens).toBe(500)
    expect(data.today_requests_count).toBe(7)
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: { status: "complete" },
      requests: { status: "complete" },
      tokens: { status: "complete" },
      income: { status: "unavailable" },
    })
  })

  it("reports balance as unavailable rather than zero without a regular API key", async () => {
    const data = await aimlApiAccountData.fetchData(createRequest())

    // The management key is rejected by the billing route, so no balance is known.
    expect(data.balance?.positions[0]?.amount.status).toBe("unavailable")
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: { status: "unavailable", reason: "unsupported" },
      requests: { status: "unavailable", reason: "unsupported" },
      tokens: { status: "unavailable", reason: "unsupported" },
    })
    expect(data.todayStatsAvailability?.income).toMatchObject({
      status: "unavailable",
    })
  })

  it("does not turn a failing billing read into a zero balance", async () => {
    server.use(
      http.get(`${apiOrigin}${AIMLAPI_BILLING_ENDPOINT}`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
      http.get(`${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    )

    await expect(
      aimlApiAccountData.fetchData(createRequest({ aimlApiKey: apiKey })),
    ).rejects.toThrow()
  })

  it("keeps balance when only today's usage fails", async () => {
    server.use(
      http.get(`${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`, () =>
        HttpResponse.json({ message: "boom" }, { status: 503 }),
      ),
    )

    const data = await aimlApiAccountData.fetchData(
      createRequest({ aimlApiKey: apiKey }),
    )

    expect(data.balance?.positions[0]?.asset).toEqual({
      kind: "currency",
      code: "USD",
    })
    expect(data.todayStatsAvailability?.consumption).toMatchObject({
      status: "unavailable",
      reason: "request_failed",
    })
  })
})

describe("AI/ML API usage and logs", () => {
  it.each([200, 0])(
    "keeps capped page size %s contiguous across pages",
    async (pageSize) => {
      const requests: URL[] = []
      server.use(
        http.get(`${apiOrigin}${AIMLAPI_LOGS_ENDPOINT}`, ({ request }) => {
          requests.push(new URL(request.url))
          return HttpResponse.json({
            data: [{ created: "2026-10-24T10:00:00.000Z", cost: { usd: 0 } }],
            pagination: { total: 500 },
          })
        }),
      )
      const page = await fetchAimlApiKeyUsagePage(
        createRequest({ aimlApiKey: apiKey }),
        {
          page: 2,
          pageSize,
          startTimestamp: 0,
          endTimestamp: Math.floor(Date.now() / 1000),
        },
      )
      const expectedOffset = pageSize === 200 ? 100 : 1
      expect(requests[0]!.searchParams.get("limit")).toBe(
        String(expectedOffset),
      )
      expect(requests[0]!.searchParams.get("offset")).toBe(
        String(expectedOffset),
      )
      expect(page.items[0]!.id).toBe(expectedOffset)
    },
  )

  it("pages request logs into the shared usage history shape", async () => {
    const endTimestamp = Date.parse("2026-10-25T00:00:00.000Z") / 1000
    server.use(
      http.get(`${apiOrigin}${AIMLAPI_LOGS_ENDPOINT}`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("limit")).toBe("50")
        expect(url.searchParams.get("offset")).toBe("0")
        expect(url.searchParams.get("end")).toBe("2026-10-25T00:00:00.000Z")
        return HttpResponse.json({
          data: [
            {
              created: "2026-10-24T10:00:00.000Z",
              status: "succeeded",
              origin: "api",
              model: "openai/gpt-5",
              cost: { usd: 0.002, credits: 2 },
              tokens: { input: 12, output: 34, total: 46 },
              request_id: "req-1",
              inference_id: "inf-1",
              client_request_id: null,
            },
            {
              created: "2026-10-24T10:01:00.000Z",
              status: "failed",
              origin: "playground",
              model: "openai/gpt-5",
              cost: { usd: 0, credits: 0 },
              tokens: { input: 0, output: 0, total: 0 },
              request_id: "req-2",
              inference_id: "inf-2",
              client_request_id: "client-2",
            },
          ],
          pagination: { limit: 50, offset: 0, total: 2, has_more: false },
        })
      }),
    )

    const page = await fetchAimlApiKeyUsagePage(
      createRequest({ aimlApiKey: apiKey }),
      { page: 1, pageSize: 50, startTimestamp: 0, endTimestamp },
    )

    expect(page.total).toBe(2)
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).toMatchObject({
      model_name: "openai/gpt-5",
      quota: 0.002 * 500_000,
      consumption: {
        asset: { kind: "currency", code: "USD" },
        amount: { status: "known", value: "0.002" },
      },
      prompt_tokens: 12,
      completion_tokens: 34,
    })
    expect(page.items[1]).toMatchObject({ quota: 0, content: "failed" })
  })

  it("bounds the today window to one UTC calendar day", async () => {
    const seen: URL[] = []
    server.use(
      http.get(
        `${apiOrigin}${AIMLAPI_USAGE_DETAIL_ENDPOINT}`,
        ({ request }) => {
          seen.push(new URL(request.url))
          return HttpResponse.json({
            api_key_prefix: null,
            start: "2026-10-24T00:00:00.000Z",
            end: "2026-10-25T00:00:00.000Z",
            spend: 0,
            currency: CURRENCIES.USD,
            requests: 0,
            models: [],
            groups: [],
          })
        },
      ),
    )

    await fetchAimlApiTodayUsage(
      createRequest({ aimlApiKey: apiKey }),
      new Date("2026-10-24T12:00:00.000Z"),
    )

    const url = seen.at(-1)!
    expect(url.searchParams.get("start")).toBe("2026-10-24T00:00:00.000Z")
    expect(url.searchParams.get("end")).toBe("2026-10-25T00:00:00.000Z")
    expect(url.searchParams.get("group_by")).toBe("day")
    expect(url.searchParams.get("tz")).toBe("UTC")
  })
})

describe("AI/ML API model catalogue", () => {
  it("maps the public catalogue without inventing prices", async () => {
    server.use(
      http.get(`${apiOrigin}/v1/models`, () =>
        HttpResponse.json({
          object: "list",
          data: [
            {
              id: "openai/gpt-5",
              info: {
                name: "GPT-5",
                developer: "OpenAI",
                description: "A model.",
                contextLength: 400000,
                outputMax: 128000,
              },
              type: "openai/chat-completions",
              aliases: ["openai/gpt-5-latest"],
              tags: ["playground:chat"],
            },
          ],
        }),
      ),
    )

    const models = await fetchAimlApiModels(createRequest())

    expect(models).toEqual([
      {
        id: "openai/gpt-5",
        vendorEvidence: { kind: "publisher", name: "OpenAI" },
      },
    ])
  })
})

describe("AI/ML API key prefix helper", () => {
  it("uses the documented eight-character prefix", () => {
    expect(AIMLAPI_KEY_PREFIX).toBe(8)
  })
})
