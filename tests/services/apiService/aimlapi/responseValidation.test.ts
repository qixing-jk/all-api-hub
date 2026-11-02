import { http, HttpResponse } from "msw"
import { expect, it, vi } from "vitest"

import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  fetchAimlApiAccountData,
  fetchAimlApiBillingDetail,
  fetchAimlApiTodayUsage,
} from "~/services/apiService/aimlapi/accountData"
import {
  createAimlApiKey,
  deleteAimlApiKey,
  fetchAimlApiKeys,
  fetchAimlApiLatestKey,
  updateAimlApiKey,
} from "~/services/apiService/aimlapi/keys"
import {
  fetchAimlApiModelCatalog,
  fetchAimlApiModels,
} from "~/services/apiService/aimlapi/models"
import { fetchAimlApiTools } from "~/services/apiService/aimlapi/tools"
import {
  AimlApiCredentialScopeError,
  ensureAimlApiKey,
  fetchAimlApiJson,
} from "~/services/apiService/aimlapi/transport"
import { fetchAimlApiKeyUsagePage } from "~/services/apiService/aimlapi/usage"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const origin = "https://api.aimlapi.com"
const request = {
  baseUrl: "https://aimlapi.com",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "management" },
  aimlApiKey: "regular",
  checkIn: buildCheckInConfig(),
}
const key = {
  prefix: "abcdefgh",
  disabled: false,
  name: null,
  created_at: "2026-10-01",
  updated_at: "2026-10-01",
  total_usage_usd: 0,
  monthly_usage_usd: 0,
  expires_at: null,
}
const query = { page: 1, pageSize: 50, startTimestamp: 0, endTimestamp: 1 }
const invalid = { code: "JSON_PARSE_ERROR" }

it("rejects a missing primary credential before sending an authenticated request", async () => {
  await expect(
    fetchAimlApiJson(
      {
        ...request,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "" },
      },
      "/v1/key",
    ),
  ).rejects.toBeInstanceOf(AimlApiCredentialScopeError)
})

it.each([
  null,
  {},
  { data: null },
  { data: {} },
  ...[
    { prefix: "short" },
    { created_at: null },
    { updated_at: null },
    { disabled: 0 },
    { total_usage_usd: -1 },
    { monthly_usage_usd: "1" },
    { expires_at: 12 },
    { scopes: {} },
    { scopes: [1] },
    { scopes: ["unknown"] },
    { allowed_models: {} },
    { allowed_models: [1] },
    { allowed_tools: [false] },
    { limit: "9" },
    { limit: { threshold: -1 } },
    { limit: { threshold: 9, retention: "unknown", window_start: null } },
    { limit: { threshold: 9, retention: "never", window_start: 12 } },
  ].map((patch) => ({ data: { ...key, ...patch } })),
])(
  "rejects malformed key metadata instead of inventing restrictions %#",
  async (body) => {
    server.use(http.get(`${origin}/v1/key`, () => HttpResponse.json(body)))
    await expect(fetchAimlApiLatestKey(request)).rejects.toMatchObject(invalid)
  },
)

it("rejects a non-list key inventory and an unconfirmed deletion", async () => {
  server.use(
    http.get(`${origin}/v1/keys`, () => HttpResponse.json({ data: {} })),
    http.delete(`${origin}/v1/keys/abcdefgh`, () =>
      HttpResponse.json({ data: { deleted: false } }),
    ),
  )
  await expect(fetchAimlApiKeys(request)).rejects.toMatchObject(invalid)
  await expect(deleteAimlApiKey(request, "abcdefgh")).rejects.toMatchObject(
    invalid,
  )
})

it("rejects creation without a returned plaintext credential", async () => {
  server.use(
    http.post(`${origin}/v1/keys`, () => HttpResponse.json({ data: key })),
  )
  await expect(
    createAimlApiKey(request, { name: "test", scopes: null }),
  ).rejects.toMatchObject(invalid)
})

it("keeps null reset periods and unknown counters distinct from zero", async () => {
  server.use(
    http.get(`${origin}/v1/key`, () =>
      HttpResponse.json({
        data: {
          ...key,
          limit: { threshold: 5, retention: null, window_start: null },
        },
      }),
    ),
  )
  const result = await fetchAimlApiLatestKey(request)
  expect(result.limit).toEqual({
    thresholdUsd: 5,
    retention: null,
    windowStart: null,
  })
})

it.each([
  null,
  {},
  { data: null },
  { data: [null] },
  { data: [{ id: " " }] },
  { data: [{ id: "model", info: { name: 1, developer: "test" } }] },
])("rejects invalid public model membership %#", async (body) => {
  server.use(http.get(`${origin}/v1/models`, () => HttpResponse.json(body)))
  await expect(fetchAimlApiModelCatalog(request)).rejects.toMatchObject(invalid)
})

it("normalizes optional model facts without inventing vendor evidence", async () => {
  server.use(
    http.get(`${origin}/v1/models`, () =>
      HttpResponse.json({
        data: [
          {
            id: "model",
            info: {
              name: "Model",
              developer: "",
              contextLength: -1,
              outputMax: 1.5,
            },
            aliases: ["alias", 2],
            tags: [false, "tag"],
          },
        ],
      }),
    ),
  )
  expect(await fetchAimlApiModelCatalog(request)).toMatchObject([
    {
      id: "model",
      aliases: ["alias"],
      tags: ["tag"],
      type: "",
      info: { contextLength: undefined, outputMax: undefined },
    },
  ])
  expect(await fetchAimlApiModels(request)).toHaveLength(1)
})

it.each([
  null,
  {},
  { data: [null] },
  { data: [{ id: " ", name: "Name" }] },
  { data: [{ id: "id", name: 1 }] },
])("rejects an invalid public tool catalogue %#", async (body) => {
  server.use(
    http.get("https://tools.aimlapi.com/v1/tools", () =>
      HttpResponse.json(body),
    ),
  )
  await expect(fetchAimlApiTools()).rejects.toMatchObject(invalid)
})

it("labels namespaced tools and retains a usable fallback for empty titles", async () => {
  server.use(
    http.get("https://tools.aimlapi.com/v1/tools", () =>
      HttpResponse.json({
        data: [
          { id: "web/search", name: "web__search_web" },
          { id: "plain", name: "Plain" },
          { id: "empty", name: "" },
        ],
      }),
    ),
  )
  expect(await fetchAimlApiTools()).toMatchObject([
    { displayLabel: "Search web" },
    { displayLabel: "Plain" },
    { displayLabel: "empty" },
  ])
})

it("reports tool catalogue HTTP failures", async () => {
  server.use(
    http.get("https://tools.aimlapi.com/v1/tools", () =>
      HttpResponse.json({}, { status: 503 }),
    ),
  )
  await expect(fetchAimlApiTools()).rejects.toMatchObject({ statusCode: 503 })
})

it.each([
  null,
  {},
  { data: [null] },
  { data: [{ created: "invalid", cost: { usd: 0 } }] },
  { data: [{ created: null, cost: { usd: 0 } }] },
  { data: [{ created: "2026-10-01", cost: null }] },
  { data: [{ created: "2026-10-01", cost: { usd: -1 } }] },
  { data: [], pagination: {} },
  { data: [], pagination: null },
])("rejects malformed logs or unknown totals %#", async (body) => {
  server.use(http.get(`${origin}/v2/logs`, () => HttpResponse.json(body)))
  await expect(fetchAimlApiKeyUsagePage(request, query)).rejects.toMatchObject(
    invalid,
  )
})

it.each([
  null,
  { currency: "EUR" },
  { currency: "USD", user_id: 1.5 },
  { currency: "USD", user_id: 1, email: {} },
  { currency: "USD", user_id: 1, email: null, current_balance: -1 },
])("rejects invalid billing identity and balances %#", async (body) => {
  server.use(
    http.get(`${origin}/v2/billing/detail`, () => HttpResponse.json(body)),
  )
  await expect(fetchAimlApiBillingDetail(request)).rejects.toMatchObject(
    invalid,
  )
})

it.each([
  null,
  { currency: "EUR", current_balance: 1 },
  { currency: "USD", current_balance: "1" },
  { currency: "USD", current_balance: -1 },
])("rejects invalid account balances %#", async (body) => {
  server.use(
    http.get(`${origin}/v2/billing`, () => HttpResponse.json(body)),
    http.get(`${origin}/v2/usage/detail`, () =>
      HttpResponse.json({ spend: 0, requests: 0, groups: [] }),
    ),
  )
  await expect(fetchAimlApiAccountData(request)).rejects.toMatchObject(invalid)
})

it.each([
  null,
  { spend: -1, requests: 0, groups: [] },
  { spend: 0, requests: 0, groups: null },
])("rejects invalid today usage %#", async (body) => {
  server.use(
    http.get(`${origin}/v2/usage/detail`, () => HttpResponse.json(body)),
  )
  await expect(fetchAimlApiTodayUsage(request)).rejects.toMatchObject(invalid)
})

it("skips malformed day groups and retains valid token counts", async () => {
  server.use(
    http.get(`${origin}/v2/usage/detail`, () =>
      HttpResponse.json({
        spend: 0,
        requests: 0,
        groups: [null, {}, { tokens: { input: 3, output: 4 } }],
      }),
    ),
  )
  expect(await fetchAimlApiTodayUsage(request)).toEqual({
    spendUsd: 0,
    requests: 0,
    inputTokens: 3,
    outputTokens: 4,
  })
})

it.each([401, 403, 429, 500])(
  "classifies HTTP %s without losing the status",
  async (status) => {
    server.use(
      http.get(`${origin}/v1/key`, () =>
        HttpResponse.json({ error: { message: "nested problem" } }, { status }),
      ),
    )
    await expect(fetchAimlApiLatestKey(request)).rejects.toMatchObject({
      statusCode: status,
      code: status === 500 ? "HTTP_OTHER" : `HTTP_${status}`,
    })
  },
)

it("builds query parameters without serializing absent values", async () => {
  let received: URL | undefined
  server.use(
    http.get(`${origin}/v1/example`, ({ request }) => {
      received = new URL(request.url)
      return HttpResponse.json({ ok: true })
    }),
  )
  await fetchAimlApiJson(request, "/v1/example", {
    query: { absent: undefined, empty: null, enabled: false, count: 0 },
  })
  expect(received?.search).toBe("?enabled=false&count=0")
})

it("classifies an HTTP failure even when its problem body is null", async () => {
  server.use(
    http.get(`${origin}/v1/key`, () =>
      HttpResponse.json(null, { status: 500 }),
    ),
  )
  await expect(fetchAimlApiLatestKey(request)).rejects.toMatchObject({
    statusCode: 500,
    code: "HTTP_OTHER",
  })
})

it("resolves a saved supplemental credential once per request and does not invent a missing one", async () => {
  const lookup = vi
    .spyOn(accountQueries, "getAccountById")
    .mockResolvedValueOnce({
      site_type: "aimlapi",
      aimlApiAuth: { apiKey: " saved-key " },
    } as never)
    .mockResolvedValueOnce(null)
  const savedRequest = { ...request, aimlApiKey: " ", accountId: "account" }
  expect(await ensureAimlApiKey(savedRequest)).toBe("saved-key")
  expect(await ensureAimlApiKey(savedRequest)).toBe("saved-key")
  expect(lookup).toHaveBeenCalledTimes(1)
  expect(await ensureAimlApiKey({ ...savedRequest })).toBeUndefined()
  const withoutAccount = { ...request, aimlApiKey: undefined }
  expect(await ensureAimlApiKey(withoutAccount)).toBeUndefined()
  expect(await ensureAimlApiKey(withoutAccount)).toBeUndefined()
  expect(new AimlApiCredentialScopeError("management-key").message).toBe(
    "aimlapi_management_key_required",
  )
  lookup.mockRestore()
})

it.each([undefined, {}, { apiKey: " " }])(
  "rejects billing with an absent saved regular key before dispatch: %j",
  async (aimlApiAuth) => {
    const lookup = vi
      .spyOn(accountQueries, "getAccountById")
      .mockResolvedValue({
        site_type: "aimlapi",
        aimlApiAuth,
      } as never)
    const dispatch = vi.fn(() => HttpResponse.json({ unexpected: true }))
    server.use(http.get(`${origin}/v2/billing/detail`, dispatch))
    try {
      await expect(
        fetchAimlApiBillingDetail({
          ...request,
          aimlApiKey: undefined,
          accountId: "missing-regular",
        }),
      ).rejects.toMatchObject({
        scope: "regular-api-key",
        message: "aimlapi_api_key_required",
      })
      expect(dispatch).not.toHaveBeenCalled()
    } finally {
      lookup.mockRestore()
    }
  },
)

it("retains only the requested key patch and preserves an explicit false status", async () => {
  const bodies: unknown[] = []
  server.use(
    http.patch(`${origin}/v1/keys/abcdefgh`, async ({ request: incoming }) => {
      bodies.push(await incoming.json())
      return HttpResponse.json({ data: key })
    }),
  )
  await updateAimlApiKey(request, "abcdefgh", { disabled: false })
  await updateAimlApiKey(request, "abcdefgh", { name: "renamed" })
  expect(bodies).toEqual([{ disabled: false }, { name: "renamed" }])
})
