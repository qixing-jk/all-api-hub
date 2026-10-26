import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { vercelAiGatewayCapabilities } from "~/services/apiAdapters/vercelAiGateway"
import {
  fetchAccountData,
  fetchVercelCredits,
} from "~/services/apiService/vercelAiGateway"
import {
  fetchVercelKeyBudgets,
  updateVercelKeyBudget,
} from "~/services/apiService/vercelAiGateway/budgets"
import {
  fetchVercelTeams,
  fetchVercelUser,
  parseVercelTeams,
} from "~/services/apiService/vercelAiGateway/identity"
import {
  createVercelAiGatewayKey,
  deleteVercelAiGatewayKey,
  getVercelAiGatewayKey,
  listVercelAiGatewayKeys,
} from "~/services/apiService/vercelAiGateway/keys"
import { createVercelMeteredPricing } from "~/services/apiService/vercelAiGateway/meteredPricing"
import {
  createVercelCatalogSnapshot,
  fetchVercelModelCatalog,
  parseVercelCatalogModel,
} from "~/services/apiService/vercelAiGateway/models"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const request = {
  checkIn: buildCheckInConfig(),
  baseUrl: "https://vercel.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "pat",
    userId: "team_test",
  },
}
const budget = {
  scopeType: "api-key",
  scopeId: "key",
  limitAmount: 5,
  currentSpend: 1,
  refreshPeriod: "weekly",
  alertThresholds: [50],
}
afterEach(() => server.resetHandlers())

it("forwards credit-read cancellation without fetching after cancellation", async () => {
  const controller = new AbortController()
  controller.abort()
  const fetchSpy = vi.spyOn(globalThis, "fetch")
  try {
    await expect(
      fetchVercelCredits(request, "team_test", { signal: controller.signal }),
    ).rejects.toBeDefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})

it("rejects saving a team absent from the token's membership", async () => {
  server.use(
    http.get("https://api.vercel.com/v2/teams", () =>
      HttpResponse.json({ teams: [] }),
    ),
  )
  await expect(
    vercelAiGatewayCapabilities.account!.persistence!.prepareIdentity!({
      accessToken: "pat",
      userId: "team_missing",
    }),
  ).rejects.toThrow()
})
it("does not call a model catalog without a saved team", async () => {
  await expect(
    vercelAiGatewayCapabilities.account!.modelPricing!.fetchPricing({
      ...request,
      auth: { ...request.auth, userId: undefined },
    }),
  ).rejects.toThrow("missing its team")
})
it("publishes bootstrap facts without claiming check-in support", async () => {
  const bootstrap = vercelAiGatewayCapabilities.account!.bootstrap!
  expect(await bootstrap.loadBootstrapFacts(request)).toMatchObject({
    displayName: "Vercel AI Gateway",
    checkInSupported: false,
  })
  expect(await bootstrap.fetchCheckInSupport(request, {})).toBe(false)
})
it.each([
  { token: "", userId: "team_test" },
  { token: "pat", userId: undefined },
  { token: "pat", userId: "missing" },
])(
  "does not open a console for unverifiable team credentials %j",
  async (patch) => {
    server.use(
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({ teams: [] }),
      ),
    )
    const bootstrap = vercelAiGatewayCapabilities.account!.bootstrap!
    expect(
      await bootstrap.resolveRoutePath(
        {
          baseUrl: "https://vercel.com",
          siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
          ...patch,
        },
        "adminCredentials",
      ),
    ).toBeNull()
  },
)
it("uses the shared static login route", async () => {
  const bootstrap = vercelAiGatewayCapabilities.account!.bootstrap!
  expect(
    await bootstrap.resolveRoutePath(
      { baseUrl: "https://vercel.com", siteType: SITE_TYPES.VERCEL_AI_GATEWAY },
      "login",
    ),
  ).toBe("/login")
})
it.each([undefined, 42, " "])(
  "bootstraps a unique team when no team is selected (%s)",
  async (userId) => {
    server.use(
      http.get("https://api.vercel.com/v2/user", () =>
        HttpResponse.json({ user: { id: "u", username: "name" } }),
      ),
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({ teams: [{ id: "team_test", slug: "team" }] }),
      ),
    )
    expect(
      await vercelAiGatewayCapabilities.account!.bootstrap!.fetchUserInfo({
        ...request,
        auth: { ...request.auth, userId },
      }),
    ).toMatchObject({ id: "team_test", username: "team" })
  },
)

it.each([{}, { error: { message: " " } }, { error: { message: 42 } }])(
  "keeps HTTP failure semantics without a valid provider message %j",
  async (body) => {
    server.use(
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json(body, { status: 403 }),
      ),
    )
    await expect(fetchVercelTeams(request)).rejects.toMatchObject({
      statusCode: 403,
    })
  },
)

it("preserves a generic model restriction and unknown model type", () => {
  const model = parseVercelCatalogModel({
    id: "test/model",
    type: "new-type",
    model_eligibility: { status: "unknown" },
  })!
  const snapshot = createVercelCatalogSnapshot([
    { ...model, requestBlockReason: "plan_restricted" },
  ])
  expect(snapshot.data[0]?.availability).toEqual({
    available: false,
    reason: "plan_restricted",
  })
  expect(createVercelMeteredPricing("image", null)).toBeUndefined()
  expect(parseVercelCatalogModel(null)).toBeNull()
})

it.each([undefined, "", "   "])(
  "rejects a missing account credential (%s) before transport",
  async (accessToken) => {
    await expect(
      fetchVercelTeams({ ...request, auth: { ...request.auth, accessToken } }),
    ).rejects.toThrow("requires a Vercel access token")
  },
)

it.each([null, {}, { teams: null }])(
  "rejects an unverifiable team inventory %j",
  async (body) => {
    server.use(
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json(body),
      ),
    )
    await expect(fetchVercelTeams(request)).rejects.toThrow(
      "vercel_identity_unreadable",
    )
  },
)
it.each(["cursor", 42])(
  "rejects an invalid or repeated team cursor %s",
  async (next) => {
    server.use(
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({ teams: [], pagination: { next } }),
      ),
    )
    await expect(fetchVercelTeams(request)).rejects.toThrow(
      "vercel_identity_unreadable",
    )
  },
)
it("drops malformed teams while preserving validated billing roles", () => {
  expect(
    parseVercelTeams({
      teams: [
        null,
        {},
        { id: "bad" },
        {
          id: "team_test",
          slug: "test",
          membership: {
            role: "MEMBER",
            teamRoles: ["AI_GATEWAY_BUDGET_MANAGER", 2],
          },
        },
      ],
    }),
  ).toEqual([
    {
      id: "team_test",
      slug: "test",
      name: "test",
      role: "MEMBER",
      roles: ["AI_GATEWAY_BUDGET_MANAGER"],
    },
  ])
})
it.each([null, {}, { user: { id: "u" } }])(
  "rejects an unverifiable user %j",
  async (body) => {
    server.use(
      http.get("https://api.vercel.com/v2/user", () => HttpResponse.json(body)),
    )
    await expect(fetchVercelUser(request)).rejects.toThrow(
      "vercel_identity_unreadable",
    )
  },
)

it.each([
  null,
  {},
  { balance: " ", total_used: "0" },
  { balance: true, total_used: 0 },
  { balance: "Infinity", total_used: 0 },
])("rejects unreadable credits %j", async (body) => {
  server.use(
    http.get("https://ai-gateway.vercel.sh/v1/credits", () =>
      HttpResponse.json(body),
    ),
  )
  await expect(fetchVercelCredits(request, "team_test")).rejects.toThrow(
    "vercel_credits_unreadable",
  )
})
it("rejects balances that overflow the product quota without claiming a healthy refresh", async () => {
  server.use(
    http.get("https://ai-gateway.vercel.sh/v1/credits", () =>
      HttpResponse.json({ balance: 1e308, total_used: 0 }),
    ),
  )
  await expect(fetchAccountData(request)).rejects.toThrow(
    "vercel_credits_unreadable",
  )
  expect(
    await vercelAiGatewayCapabilities.account!.refresh!.refreshAccount(request),
  ).toMatchObject({
    success: false,
    healthStatus: {
      status: SiteHealthStatus.Unknown,
      message: t("account:healthStatus.unknownError"),
    },
  })
})
it.each([401, 403, 429, 500])(
  "retains HTTP %i when a key deletion fails",
  async (status) => {
    server.use(
      http.delete(
        "https://api.vercel.com/v1/api-keys/key",
        () => new HttpResponse("not json", { status }),
      ),
    )
    await expect(
      deleteVercelAiGatewayKey(request, "team_test", "key"),
    ).rejects.toMatchObject({ statusCode: status })
  },
)
it.each(["again", 42])(
  "rejects an invalid or repeated key cursor %s",
  async (next) => {
    server.use(
      http.get("https://api.vercel.com/v1/api-keys", () =>
        HttpResponse.json({ apiKeys: [], pagination: { next } }),
      ),
    )
    await expect(listVercelAiGatewayKeys(request, "team_test")).rejects.toThrow(
      "vercel_key_inventory_unreadable",
    )
  },
)
it.each([null, {}, { apiKey: null }])(
  "rejects an unreadable key detail %j",
  async (body) => {
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key", () =>
        HttpResponse.json(body),
      ),
    )
    await expect(
      getVercelAiGatewayKey(request, "team_test", "key", {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow()
  },
)
it.each([null, {}, { apiKeyString: "vck_secret", apiKey: {} }])(
  "does not invent a successful creation from %j",
  async (body) => {
    server.use(
      http.post("https://api.vercel.com/v1/api-keys", () =>
        HttpResponse.json(body),
      ),
    )
    await expect(
      createVercelAiGatewayKey(
        request,
        "team_test",
        {},
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow()
  },
)

it.each([null, {}, { budgets: null }])(
  "rejects unreadable budget collections %j",
  async (body) => {
    server.use(
      http.get("https://api.vercel.com/ai-gateway/budgets/list", () =>
        HttpResponse.json(body),
      ),
      http.get("https://api.vercel.com/ai-gateway/budgets/defaults/list", () =>
        HttpResponse.json({ defaults: [] }),
      ),
    )
    await expect(fetchVercelKeyBudgets(request, "team_test")).rejects.toThrow(
      "vercel_budgets_unreadable",
    )
  },
)
it.each([
  { limitAmount: "n/a" },
  { limitAmount: 0 },
  { currentSpend: undefined },
  { refreshPeriod: "yearly" },
  { alertThresholds: "50" },
  { alertThresholds: [30] },
  { scopeId: null },
])("does not erase an unreadable existing budget %j", async (patch) => {
  server.use(
    http.get("https://api.vercel.com/ai-gateway/budgets/list", () =>
      HttpResponse.json({ budgets: [{ ...budget, ...patch }] }),
    ),
    http.get("https://api.vercel.com/ai-gateway/budgets/defaults/list", () =>
      HttpResponse.json({ defaults: [] }),
    ),
  )
  await expect(fetchVercelKeyBudgets(request, "team_test")).rejects.toThrow(
    "vercel_budgets_unreadable",
  )
})
it("ignores unrelated and archived budgets and parses a string-valued default", async () => {
  server.use(
    http.get("https://api.vercel.com/ai-gateway/budgets/list", () =>
      HttpResponse.json({
        budgets: [
          null,
          { scopeType: "project" },
          { ...budget, archived: true },
        ],
      }),
    ),
    http.get("https://api.vercel.com/ai-gateway/budgets/defaults/list", () =>
      HttpResponse.json({
        defaults: [
          {
            ...budget,
            currentSpend: undefined,
            limitAmount: "10",
            alertThresholds: undefined,
            includeByokInQuota: true,
          },
        ],
      }),
    ),
  )
  const snapshot = await fetchVercelKeyBudgets(request, "team_test", {
    signal: new AbortController().signal,
  })
  expect(snapshot.budgets.size).toBe(0)
  expect(snapshot.defaultBudget).toMatchObject({
    limitAmount: 10,
    currentSpend: 0,
    alertThresholds: [],
    includeByokInQuota: true,
  })
})
it.each([false, true])(
  "rejects an unreadable default or ignores an archived default (%s)",
  async (archived) => {
    server.use(
      http.get("https://api.vercel.com/ai-gateway/budgets/list", () =>
        HttpResponse.json({ budgets: [] }),
      ),
      http.get("https://api.vercel.com/ai-gateway/budgets/defaults/list", () =>
        HttpResponse.json({
          defaults: [
            { ...budget, limitAmount: archived ? 5 : "bad", archived },
          ],
        }),
      ),
    )
    if (archived)
      expect(
        (await fetchVercelKeyBudgets(request, "team_test")).defaultBudget,
      ).toBeNull()
    else
      await expect(fetchVercelKeyBudgets(request, "team_test")).rejects.toThrow(
        "vercel_default_budget_unreadable",
      )
  },
)
it("rejects an unreadable budget mutation acknowledgment", async () => {
  server.use(
    http.patch("https://api.vercel.com/v1/api-keys/key/quota", () =>
      HttpResponse.json(null),
    ),
  )
  await expect(
    updateVercelKeyBudget(request, "team_test", "key", { archived: true }),
  ).rejects.toThrow("vercel_budget_update_unreadable")
})

it.each([null, {}, { data: null }])(
  "rejects malformed model catalogs %j",
  async (body) => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/models", () =>
        HttpResponse.json(body),
      ),
    )
    await expect(
      fetchVercelModelCatalog(request, "team_test", {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("vercel_catalog_unreadable")
  },
)
it("keeps unknown eligibility absent and retains partial token and release facts", () => {
  const model = parseVercelCatalogModel({
    id: "test/model",
    description: "Description",
    released: 1760000000,
    pricing: { output: 0.000002, input_cache_write: 0.000001 },
    model_eligibility: { status: "unexpected" },
  })!
  expect(model.eligibility).toBeUndefined()
  const snapshot = createVercelCatalogSnapshot([model])
  expect(snapshot).toBeDefined()
  expect(model.pricing).toEqual({ output: 0.000002, cacheWrite: 0.000001 })
})
it("retains a video's unconditional per-second fallback beside a resolution rule", () => {
  const plan = createVercelMeteredPricing("video", {
    video_duration_pricing: [
      { cost_per_second: "0.1" },
      { resolution: "1080p", cost_per_second: 0.2 },
    ],
  })
  expect(plan).toMatchObject({
    rates: { videoSeconds: { amount: 0.1, unit: "second" } },
    requiresRuleMatch: false,
  })
})
it.each([
  { size: "1024x1024", cost: 0.1 },
  { quality: "high", cost: 0.2 },
])("preserves single-axis image pricing %j", (rule) => {
  const plan = createVercelMeteredPricing("image", {
    image: 0.05,
    image_dimension_quality_pricing: [rule],
  })
  expect(plan?.rules[0]?.conditions).toHaveLength(1)
})
