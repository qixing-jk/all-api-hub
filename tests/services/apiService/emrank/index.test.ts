import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { fetchEmRankPricing } from "~/services/apiAdapters/emrank/modelCatalog"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  createKey,
  deleteKey,
  fetchAccountData,
  fetchCheckInState,
  fetchEmRankUserInfo,
  fetchKeys,
  performCheckIn,
  revealKeySecrets,
  updateKey,
} from "~/services/apiService/emrank"
import {
  EMRANK_CHECK_IN_STATUSES,
  EMRANK_KEY_EXPIRATION_MODES,
  EMRANK_SESSION_COOKIE_NAME,
  EMRANK_TOKEN_ASSET,
} from "~/services/apiService/emrank/constants"
import { EMRANK_KEY_STATUS } from "~/services/apiService/emrank/keys"
import {
  fetchCheckInSupport,
  redeemCode,
} from "~/services/apiService/emrank/surfaces"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { emRankProvider } from "~/services/checkin/autoCheckin/providers/emrank"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"
import { createCheckInConfig } from "~~/tests/services/apiAdapters/checkInFixtures"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const origin = "https://emrank.tech"
const userId = "6088"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId },
} satisfies ApiServiceRequest
const session = {
  authenticated: true,
  user: { id: 6088, username: "ld_ko_c803", display_name: "Qi_xing_jk" },
}
const account = {
  quota: "22000000",
  tokens_per_m: "1000000",
  capabilities: { check_in_available: true },
}
const readyState = {
  available: true,
  month: "2026-10",
  month_reward: "0",
  next_open: 1792195200,
  records: [],
  reward_policy: { max_reward_m: 5, min_reward_m: 2, version: 1 },
  state: {
    can_claim: true,
    message: "今日可签到",
    status: EMRANK_CHECK_IN_STATUSES.Ready,
  },
  today: "2026-10-16",
  total_days: 0,
  total_reward: "0",
}
const claimedState = {
  ...readyState,
  state: {
    can_claim: false,
    message: "今日已领取",
    status: EMRANK_CHECK_IN_STATUSES.AlreadyClaimed,
    record: {
      calculation_version: "random_v1",
      created_at: 1792151025,
      day: "2026-10-16",
      id: "1120",
      reward: "2000000",
      reward_max_m: 5,
      reward_min_m: 2,
    },
  },
  records: [{ day: "2026-10-16", reward: "2000000" }],
  total_days: 1,
  total_reward: "2000000",
}
const keyRow = {
  can_copy: true,
  created_at: 1792156887,
  enabled: true,
  expires_at: 1792243287,
  id: 1791750033754549,
  migration_blocked: false,
  name: "native",
  owner_id: 6088,
  remaining_quota: "2500000",
  revoked_at: null,
  status: EMRANK_KEY_STATUS.Enabled,
  suffix: "_IvA",
  total_quota: "2500000",
  used_quota: "0",
}

const handlers = (
  overrides: Record<string, unknown> = {},
  modelratio: string | number = "3",
) => {
  server.use(
    http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
    http.get(`${origin}/api/account`, () =>
      HttpResponse.json({ ...account, ...overrides }),
    ),
    http.get(`${origin}/api/catalog/models`, () =>
      HttpResponse.json({
        data: [
          {
            available: true,
            catalog_updated_at: null,
            context_tokens: null,
            created_at: 1791998991,
            id: "Qwen/Qwen3-Embedding-8B",
            kind: "embedding",
            modelratio,
            modelratio_version: 1,
            owned_by: "xunfei-maas",
            released_on: null,
            supported_dimensions: [1024, 512],
            supports_images: false,
          },
        ],
      }),
    ),
  )
}

describe("EMRank console contract", () => {
  beforeEach(() => {
    installCookieTransport(EMRANK_SESSION_COOKIE_NAME, "emrank.tech")
  })
  afterEach(() => vi.restoreAllMocks())

  it("exposes the native onboarding routes without a token or access-token path", async () => {
    const bootstrap = getSiteTypeCapabilities(SITE_TYPES.EMRANK).account!
      .bootstrap!
    expect(await bootstrap.loadBootstrapFacts(request)).toMatchObject({
      displayName: "EMRank",
    })
    expect(
      await bootstrap.resolveRoutePath!(
        { siteType: SITE_TYPES.EMRANK, baseUrl: origin },
        "checkIn",
      ),
    ).toBe("/account")
    await expect(
      bootstrap.getOrCreateAccessToken(request),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  })

  it("rejects an unauthenticated console session before any account read", async () => {
    server.use(
      http.get(`${origin}/api/auth/session`, () =>
        HttpResponse.json({ authenticated: false, user: null }),
      ),
    )
    await expect(fetchEmRankUserInfo(request)).rejects.toMatchObject({
      statusCode: 401,
      code: "HTTP_401",
    })
  })

  it.each([
    [401, "HTTP_401"],
    [403, "HTTP_403"],
    [429, "HTTP_429"],
    [502, "HTTP_OTHER"],
  ])("preserves HTTP %s for a non-JSON console error", async (status, code) => {
    server.use(
      http.get(
        `${origin}/api/auth/session`,
        () => new HttpResponse("<html>Gateway error</html>", { status }),
      ),
    )
    await expect(fetchEmRankUserInfo(request)).rejects.toMatchObject({
      statusCode: status,
      code,
    })
  })

  it("reports the identity bound to another saved account as a mismatch", async () => {
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
    )
    await expect(
      fetchEmRankUserInfo({
        ...request,
        auth: { ...request.auth, userId: "1" },
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })

  it("keeps atomic Token balance separate from a dollar total", async () => {
    handlers()
    const data = await fetchAccountData({
      ...request,
      checkIn: createCheckInConfig(SITE_TYPES.EMRANK),
    })
    expect(data.quota).toBe(0)
    expect(data.nativeBalance).toEqual({
      unit: "quota",
      total: 22000000,
      asset: {
        id: `${origin}/token`,
        label: "Token",
        displayScale: 1000000,
        displayLabel: "M Token",
      },
    })
    expect(data.todayStatsAvailability!.consumption).toMatchObject({
      status: "unavailable",
    })
  })

  it("accepts a signed settlement balance without relaxing key quota counts", async () => {
    handlers()
    server.use(
      http.get(`${origin}/api/account`, () =>
        HttpResponse.json({ quota: "-1234567" }),
      ),
    )
    const data = await fetchAccountData({
      ...request,
      checkIn: createCheckInConfig(SITE_TYPES.EMRANK),
    })
    expect(data.nativeBalance?.total).toBe(-1234567)
  })

  it("reads the authoritative check-in state without performing a claim", async () => {
    const write = vi.fn(() => HttpResponse.json(readyState))
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.get(`${origin}/api/account/check-ins`, () =>
        HttpResponse.json(readyState),
      ),
      http.post(`${origin}/api/account/check-ins`, write),
    )
    await expect(fetchCheckInState(request)).resolves.toMatchObject({
      available: true,
      canClaim: true,
      status: "ready",
      today: "2026-10-16",
    })
    expect(write).not.toHaveBeenCalled()
  })

  it("claims once with the gateway CSRF marker and keeps the site's record", async () => {
    const write = vi.fn(async ({ request }: { request: Request }) => {
      expect(request.headers.get("X-Gateway-CSRF")).toBe("1")
      expect(await request.text()).toBe("{}")
      return HttpResponse.json({
        can_claim: false,
        message: "今日已领取",
        status: EMRANK_CHECK_IN_STATUSES.AlreadyClaimed,
        record: {
          created_at: 1792151025,
          day: "2026-10-16",
          id: "1120",
          reward: "2000000",
        },
      })
    })
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.get(`${origin}/api/account/check-ins`, () =>
        HttpResponse.json(readyState),
      ),
      http.post(`${origin}/api/account/check-ins`, write),
    )
    await expect(performCheckIn(request)).resolves.toMatchObject({
      alreadyChecked: false,
      record: { day: "2026-10-16", reward: 2000000 },
    })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("does not submit again once the state already reports today's claim", async () => {
    const write = vi.fn(() => HttpResponse.json(claimedState))
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.get(`${origin}/api/account/check-ins`, () =>
        HttpResponse.json(claimedState),
      ),
      http.post(`${origin}/api/account/check-ins`, write),
    )
    await expect(performCheckIn(request)).resolves.toMatchObject({
      alreadyChecked: true,
      message: "今日已领取",
      record: { day: "2026-10-16", reward: 2000000 },
    })
    expect(write).not.toHaveBeenCalled()
  })

  it("keeps the authoritative native award on an already claimed result without posting", async () => {
    const write = vi.fn(() => HttpResponse.json(claimedState))
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.get(`${origin}/api/account/check-ins`, () =>
        HttpResponse.json(claimedState),
      ),
      http.post(`${origin}/api/account/check-ins`, write),
    )
    const result = await emRankProvider.checkIn(
      buildSiteAccount({
        site_url: origin,
        site_type: SITE_TYPES.EMRANK,
        authType: AuthTypeEnum.Cookie,
        account_info: { ...buildSiteAccount().account_info, id: userId },
      }),
      {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      },
    )
    expect(result).toMatchObject({
      status: "already_checked",
      reward: { amount: 2_000_000, asset: EMRANK_TOKEN_ASSET },
    })
    expect(write).not.toHaveBeenCalled()
  })

  it("maps the console's ready/claimed state onto check-in status", async () => {
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.get(`${origin}/api/account/check-ins`, () =>
        HttpResponse.json(claimedState),
      ),
    )
    await expect(
      emRankProvider.getStatus!({ request, observedAt: 1 }),
    ).resolves.toMatchObject({
      outcome: "known",
      availability: "enabled",
      today: "checked",
    })
  })

  it("classifies an expired console session as an unknown probe, not a claim", async () => {
    server.use(
      http.get(`${origin}/api/auth/session`, () =>
        HttpResponse.json({ error: { message: "请先登录" } }, { status: 401 }),
      ),
    )
    const result = await emRankProvider.getStatus!({ request, observedAt: 1 })
    expect(result).toMatchObject({
      outcome: "unknown",
      reason: "authentication_required",
    })
  })

  it("does not mark the site's before-open state as already checked", async () => {
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.get(`${origin}/api/account/check-ins`, () =>
        HttpResponse.json({
          ...readyState,
          state: {
            can_claim: false,
            status: EMRANK_CHECK_IN_STATUSES.BeforeOpen,
            message: "每日北京时间 08:00 开放签到",
          },
        }),
      ),
    )
    await expect(
      emRankProvider.getStatus!({ request, observedAt: 1 }),
    ).resolves.toMatchObject({
      outcome: "known",
      availability: "enabled",
      today: "not_checked",
    })
  })

  it("creates a key with the CSRF marker and keeps the one-time secret", async () => {
    const write = vi.fn(async ({ request }: { request: Request }) => {
      expect(request.headers.get("X-Gateway-CSRF")).toBe("1")
      expect(await request.json()).toEqual({
        name: "AAH-test",
        expiration: { mode: "never" },
      })
      return HttpResponse.json(
        {
          key: { ...keyRow, id: 9, name: "AAH-test", total_quota: null },
          secret: "sk-emr-created-value",
        },
        { status: 201 },
      )
    })
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.post(`${origin}/api/access-keys`, write),
    )
    await expect(
      createKey(request, {
        name: "AAH-test",
        totalQuotaTokens: null,
        expiration: { mode: EMRANK_KEY_EXPIRATION_MODES.Never },
      }),
    ).resolves.toMatchObject({
      key: { id: "9", totalQuota: null },
      secret: "sk-emr-created-value",
    })
  })

  it("accepts the create payload that omits inventory-only status and suffix", async () => {
    // The console answers create with fewer fields than the inventory list.
    const { status: _status, suffix: _suffix, ...createShape } = keyRow
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.post(`${origin}/api/access-keys`, () =>
        HttpResponse.json(
          {
            key: { ...createShape, id: 9, name: "AAH-test", total_quota: null },
            secret: "sk-emr-created-value",
          },
          { status: 201 },
        ),
      ),
    )

    const created = await createKey(request, {
      name: "AAH-test",
      totalQuotaTokens: null,
      expiration: { mode: EMRANK_KEY_EXPIRATION_MODES.Never },
    })

    expect(created.key).toMatchObject({
      id: "9",
      enabled: true,
      status: "enabled",
      // The inventory suffix is the tail of the one-time secret.
      suffix: "alue",
    })
    expect(created.secret).toBe("sk-emr-created-value")
  })

  it("surfaces a console business rejection as a business error", async () => {
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.post(`${origin}/api/access-keys`, () =>
        HttpResponse.json(
          {
            error: {
              message: "已存在同名令牌",
              type: "invalid_request_error",
              param: null,
              code: "conflict",
            },
          },
          { status: 409 },
        ),
      ),
    )

    await expect(
      createKey(request, {
        name: "duplicate",
        totalQuotaTokens: null,
        expiration: { mode: EMRANK_KEY_EXPIRATION_MODES.Never },
      }),
    ).rejects.toMatchObject({
      message: "已存在同名令牌",
      statusCode: 409,
      code: API_ERROR_CODES.BUSINESS_ERROR,
      upstreamCode: "conflict",
    })
  })

  it("rejects a M-decimal quota the console refuses to accept", async () => {
    const write = vi.fn(() =>
      HttpResponse.json(
        {
          error: {
            message: "额度须为最多 38 位的非负整数 Token 字符串",
            code: "invalid_request",
          },
        },
        { status: 400 },
      ),
    )
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.post(`${origin}/api/account/check-ins`, () =>
        HttpResponse.json(readyState),
      ),
      http.post(`${origin}/api/access-keys`, write),
    )
    await expect(
      createKey(request, {
        name: "bad",
        totalQuotaTokens: 1.5,
        expiration: { mode: EMRANK_KEY_EXPIRATION_MODES.Never },
      }),
    ).rejects.toMatchObject({
      message: "额度须为最多 38 位的非负整数 Token 字符串",
      statusCode: 400,
    })
  })

  it("accepts the console's 204 merge answers and re-reads the written state", async () => {
    const put = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ name: "renamed" })
      return new HttpResponse(null, { status: 204 })
    })
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.get(`${origin}/api/access-keys`, () =>
        HttpResponse.json({
          can_manage_all: false,
          data: [{ ...keyRow, name: "renamed" }],
          total: 1,
        }),
      ),
      http.put(`${origin}/api/access-keys/:id`, put),
    )
    await updateKey(request, String(keyRow.id), { name: "renamed" })
    expect(put).toHaveBeenCalledTimes(1)
    const keys = await fetchKeys(request)
    expect(keys[0]).toMatchObject({ name: "renamed", canCopy: true })
  })

  it("never dispatches a write for a malformed locator", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(
      updateKey(request, "not-a-number", { name: "x" }),
    ).rejects.toMatchObject({ failure: { code: "not_found" } })
    await expect(deleteKey(request, "99/99")).rejects.toMatchObject({
      failure: { code: "not_found" },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("reveals plaintext on demand and never for a deleted key", async () => {
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.post(`${origin}/api/access-keys/secrets`, () =>
        HttpResponse.json({
          data: [{ id: keyRow.id, secret: "sk-emr-value" }],
        }),
      ),
    )
    await expect(
      revealKeySecrets(request, [String(keyRow.id)]),
    ).resolves.toEqual(new Map([[String(keyRow.id), "sk-emr-value"]]))

    server.use(
      http.post(`${origin}/api/access-keys/secrets`, () =>
        HttpResponse.json(
          { error: { message: "所选令牌不存在或已删除", code: "not_found" } },
          { status: 404 },
        ),
      ),
    )
    await expect(
      revealKeySecrets(request, [String(keyRow.id)]),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "所选令牌不存在或已删除",
    })
  })

  it("sends native integer ids to the console's id-list routes", async () => {
    const revealBodies: unknown[] = []
    const deleteBodies: unknown[] = []
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
      http.post(
        `${origin}/api/access-keys/secrets`,
        async ({ request: incoming }) => {
          revealBodies.push(await incoming.json())
          return HttpResponse.json({
            data: [{ id: keyRow.id, secret: "sk-emr-value" }],
          })
        },
      ),
      http.post(
        `${origin}/api/access-keys/batch-delete`,
        async ({ request: incoming }) => {
          deleteBodies.push(await incoming.json())
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    await revealKeySecrets(request, [String(keyRow.id)])
    await deleteKey(request, String(keyRow.id))

    // The console parses these lists as integer ids; string ids answer 400
    // with an unreadable-body error.
    expect(revealBodies).toEqual([{ ids: [keyRow.id] }])
    expect(deleteBodies).toEqual([{ ids: [keyRow.id] }])
  })

  it("preserves model purpose, availability and native specifications for selection", async () => {
    handlers()
    server.use(
      http.get(`${origin}/api/catalog/models`, () =>
        HttpResponse.json({
          data: [
            {
              id: "cloudflare/clef",
              kind: "decision",
              owned_by: "cloudflare",
              available: false,
              modelratio: "4",
              context_tokens: 65536,
              supported_dimensions: [],
              default_dimensions: null,
              supports_images: true,
              released_on: "2026-01-02",
            },
            {
              id: "example/embedding",
              kind: "embedding",
              owned_by: "example",
              available: true,
              modelratio: "1",
              context_tokens: 8192,
              supported_dimensions: [1, 2, 3, 4, 8],
              default_dimensions: 4,
              supports_images: false,
              released_on: null,
            },
          ],
        }),
      ),
    )
    const snapshot = await fetchEmRankPricing(request)
    expect(snapshot.data[0]).toMatchObject({
      supported_endpoint_types: ["/v1/decisions"],
      presentation: {
        summaryFacts: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            value: expect.objectContaining({ fallback: "Decision" }),
          }),
          expect.objectContaining({ type: "boolean", value: false }),
          expect.objectContaining({ type: "token-quantity", value: 65536 }),
        ]),
        sections: expect.arrayContaining([
          expect.objectContaining({
            facts: expect.arrayContaining([
              expect.objectContaining({ type: "boolean", value: true }),
              expect.objectContaining({ type: "date", value: "2026-01-02" }),
              expect.objectContaining({
                type: "link",
                href: "https://emrank.tech/models",
              }),
            ]),
          }),
        ]),
      },
    })
    expect(snapshot.data[1]?.presentation?.sections?.[0]?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", value: "1–4, 8" }),
        expect.objectContaining({ type: "number", value: 4 }),
      ]),
    )
  })

  it("reports the catalogue without inventing a dollar price", async () => {
    handlers()
    const snapshot = await fetchEmRankPricing(request)
    expect(snapshot.success).toBe(true)
    expect(snapshot.data).toHaveLength(1)
    expect(snapshot.data[0]).toMatchObject({
      model_name: "Qwen/Qwen3-Embedding-8B",
      quotaPricing: {
        unit: {
          id: "https://emrank.tech/token",
          label: "Token",
          displayScale: 1_000_000,
          displayLabel: "M Token",
        },
        rates: { input: { amount: 3, per: 1 }, output: { amount: 0, per: 1 } },
        comparisonScope: "source",
        rounding: "floor",
        adjustments: [
          {
            id: "account-level",
            label: { en: "Account level", zh: "用户等级" },
          },
          { id: "rpm", label: { en: "RPM", zh: "RPM" } },
        ],
      },
      price_metadata: {
        precision: "unavailable",
        unavailable_reason: "official-price-missing",
      },
    })
    expect(snapshot.data[0]?.supported_endpoint_types).toEqual([
      "/v1/embeddings",
    ])
    expect(snapshot.data[0]).not.toHaveProperty("token_price_usd_per_million")
    expect(snapshot.model_list_source).toMatchObject({
      supportsPricing: true,
      pricingKind: "quota",
      actionPolicy: {
        supportsCredentialVerification: false,
        supportsCliVerification: false,
      },
    })
  })

  it.each([
    ["0", 0],
    ["0.25", 0.25],
    [3, 3],
  ] as const)(
    "preserves published native multiplier %j without assigning a monetary price",
    async (published, expected) => {
      handlers({}, published)
      const snapshot = await fetchEmRankPricing(request)
      expect(snapshot.data[0]?.quotaPricing?.rates).toEqual({
        input: { amount: expected, per: 1 },
        output: { amount: 0, per: 1 },
      })
      expect(calculateModelPrice(snapshot.data[0]!, 1).kind).toBe("unavailable")
    },
  )

  it.each(["", " ", "invalid", "-1", "Infinity"])(
    "rejects invalid native model multipliers instead of displaying free input (%j)",
    async (modelratio) => {
      handlers()
      server.use(
        http.get(`${origin}/api/catalog/models`, () =>
          HttpResponse.json({
            data: [
              {
                id: "BAAI/bge-m3",
                kind: "embedding",
                owned_by: "BAAI",
                available: true,
                context_tokens: null,
                supported_dimensions: [],
                modelratio,
              },
            ],
          }),
        ),
      )
      await expect(fetchEmRankPricing(request)).rejects.toMatchObject({
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
      })
    },
  )

  it("refuses console writes when another origin or auth type is requested", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(
      fetchAccountData({
        ...request,
        baseUrl: "https://evil.example.com",
        checkIn: createCheckInConfig(SITE_TYPES.EMRANK),
      }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    await expect(
      fetchAccountData({
        ...request,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "sk-x" },
        checkIn: createCheckInConfig(SITE_TYPES.EMRANK),
      }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("completes Cookie onboarding with the verified identity and no invented token", async () => {
    handlers()
    const { createAccountCompletionHelpersMock } = await import(
      "~~/tests/services/apiAdapters/checkInFixtures"
    )
    const completion = getSiteTypeCapabilities(SITE_TYPES.EMRANK).account!
      .completion!
    const result = await completion.complete(
      {
        url: origin,
        requestedAuthType: AuthTypeEnum.Cookie,
        detected: { userId, user: {}, siteType: SITE_TYPES.EMRANK },
        context: {},
      },
      createAccountCompletionHelpersMock(SITE_TYPES.EMRANK, {
        automaticExecutionEnabled: true,
      }),
    )
    expect(result).toMatchObject({
      userId,
      username: "ld_ko_c803",
      authType: AuthTypeEnum.Cookie,
      accessToken: "",
      siteName: "EMRank",
    })
  })

  it("uses the account capability to report check-in support", async () => {
    handlers({ capabilities: { check_in_available: false } })
    const bootstrap = getSiteTypeCapabilities(SITE_TYPES.EMRANK).account!
      .bootstrap!
    await expect(bootstrap.fetchCheckInSupport(request, {})).resolves.toBe(
      false,
    )
  })

  it.each(["redemption", "support"])(
    "binds %s to the cookie whose account identity was verified",
    async (operation) => {
      const cookie = (await browser.cookies.getAll({}))[0]!
      const receivedCookies: (string | null)[] = []
      server.use(
        http.get(`${origin}/api/auth/session`, () => {
          vi.mocked(browser.cookies.getAll).mockResolvedValue([
            { ...cookie, value: "different-account" },
          ])
          return HttpResponse.json(session)
        }),
        http.post(`${origin}/api/user/topup`, ({ request }) => {
          receivedCookies.push(request.headers.get("cookie"))
          return HttpResponse.json({ delta: "2000000" })
        }),
        http.get(`${origin}/api/account`, ({ request }) => {
          receivedCookies.push(request.headers.get("cookie"))
          return HttpResponse.json(account)
        }),
      )
      if (operation === "redemption") await redeemCode(request, "test-code")
      else await fetchCheckInSupport(request)
      expect(receivedCookies).toEqual([
        "__Host-gateway_session=browser-account",
      ])
    },
  )
})
