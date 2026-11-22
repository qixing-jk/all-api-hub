import i18n from "i18next"
import { http, HttpResponse } from "msw"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import {
  BALANCE_PURPOSES,
  projectBalance,
} from "~/services/accounts/metrics/balanceProjection"
import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { OBSERVATION_STATUSES } from "~/services/amounts/financialConstants"
import {
  createOpenRouterManagementRequest,
  fetchAccountData,
  refreshAccountData,
  validateManagementKey,
} from "~/services/apiService/openrouter"
import { OpenRouterManagementKeyRequiredError } from "~/services/apiService/openrouter/errors"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { accountShareBalanceSummary } from "~/services/sharing/shareSnapshots/balanceSummary"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  AuthTypeEnum,
  SiteHealthStatus,
} from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const baseRequest = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://mirror.example.invalid",
  managementApiBaseUrl: "https://openrouter.ai",
  accountId: "openrouter-account",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "  management-key-placeholder  ",
    userId: "should-not-be-sent",
  },
  checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
}

describe("apiService OpenRouter", () => {
  it("includes official remaining credits in the available balance total", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({
          data: { total_credits: 100.5, total_usage: 25.75 },
        }),
      ),
    )
    const result = await fetchAccountData(baseRequest)
    expect(accountShareBalanceSummary(result.balance).entries).toHaveLength(1)
    expect(
      projectBalance(result.balance!, BALANCE_PURPOSES.Available),
    ).toMatchObject({
      amounts: [{ asset: { kind: "currency", code: "USD" }, value: "74.75" }],
    })
  })
  it("preserves both reported operands when their derived ledger exceeds decimal bounds", async () => {
    const credits = "9".repeat(256)
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({
          data: { total_credits: credits, total_usage: "-1" },
        }),
      ),
    )
    const result = await fetchAccountData(baseRequest)
    expect(result.balance?.positions[0]?.amount).toMatchObject({
      status: "unavailable",
      source: { amountInputs: { total_credits: credits, total_usage: "-1" } },
    })
  })
  it("preserves exact credits strings and an unavailable ledger when one operand is absent", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({
          data: { total_credits: "100.000000000000000017", total_usage: "30" },
        }),
      ),
    )
    const exact = await fetchAccountData(baseRequest)
    expect(exact.balance?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "70.000000000000000017",
    })
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: "100" } }),
      ),
    )
    const partial = await fetchAccountData(baseRequest)
    expect(partial.balance?.positions[0]?.amount).toMatchObject({
      status: "unavailable",
      source: { amountInputs: { total_credits: "100" } },
    })
  })
  beforeAll(() => {
    i18n.addResourceBundle(
      "en",
      "account",
      {
        healthStatus: {
          apiError: "API error",
          httpError: "HTTP {{statusCode}}: {{message}}",
          unknownError: "Unknown error",
        },
      },
      true,
      true,
    )
  })
  beforeEach(() => server.resetHandlers())
  afterEach(() => vi.restoreAllMocks())

  it("builds canonical management requests without user-id headers", () => {
    expect(createOpenRouterManagementRequest(baseRequest)).toMatchObject({
      baseUrl: OPENROUTER_API_BASE_URL,
      managementApiBaseUrl: OPENROUTER_API_BASE_URL,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "management-key-placeholder",
        userId: undefined,
      },
    })
  })

  it("validates management keys against the canonical key endpoint", async () => {
    let capturedRequest: Request | undefined
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, ({ request }) => {
        capturedRequest = request
        return HttpResponse.json({
          data: { is_management_key: true, creator_user_id: null },
        })
      }),
    )

    await expect(
      validateManagementKey({ accessToken: "  management-key-placeholder  " }),
    ).resolves.toEqual({})
    expect(capturedRequest?.url).toBe(`${OPENROUTER_API_BASE_URL}/key`)
    expect(capturedRequest?.headers.get("authorization")).toBe(
      "Bearer management-key-placeholder",
    )
    expect(capturedRequest?.headers.has("new-api-user")).toBe(false)
    expect(capturedRequest?.headers.has("user-id")).toBe(false)
  })

  it("uses a non-empty creator_user_id as the OpenRouter userId", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, () =>
        HttpResponse.json({
          data: {
            is_management_key: true,
            creator_user_id: "  user-placeholder  ",
          },
        }),
      ),
    )

    await expect(
      validateManagementKey({
        accessToken: "management-key-placeholder",
      }),
    ).resolves.toEqual({ userId: "user-placeholder" })
  })

  it.each([null, undefined, "   "])(
    "leaves absent creator identity for the onboarding fallback: %s",
    async (creatorUserId) => {
      server.use(
        http.get(`${OPENROUTER_API_BASE_URL}/key`, () =>
          HttpResponse.json({
            data: {
              is_management_key: true,
              ...(creatorUserId !== undefined
                ? { creator_user_id: creatorUserId }
                : {}),
            },
          }),
        ),
      )

      await expect(
        validateManagementKey({
          accessToken: "management-key-placeholder",
        }),
      ).resolves.toEqual({})
    },
  )

  it("rejects whitespace-only management keys before making a request", async () => {
    let requestCount = 0
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, () => {
        requestCount += 1
        return HttpResponse.json({ data: { is_management_key: true } })
      }),
    )

    await expect(
      validateManagementKey({ accessToken: "   " }),
    ).rejects.toBeInstanceOf(OpenRouterManagementKeyRequiredError)
    expect(requestCount).toBe(0)
  })

  it("propagates AbortSignal to the management-key request", async () => {
    const controller = new AbortController()
    let observedSignal: AbortSignal | undefined
    let releaseRequest!: () => void
    const requestBlocked = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, async ({ request }) => {
        observedSignal = request.signal
        await requestBlocked
        return HttpResponse.json({ data: { is_management_key: true } })
      }),
    )

    const validation = validateManagementKey({
      accessToken: "management-key",
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(observedSignal).toBeDefined())
    controller.abort()
    releaseRequest()

    await expect(validation).rejects.toThrow()
    expect(observedSignal?.aborted).toBe(true)
  })

  it("rejects structurally valid ordinary keys with a typed management-key error", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/key`, () =>
        HttpResponse.json({ data: { is_management_key: false } }),
      ),
    )

    await expect(
      validateManagementKey({ accessToken: "ordinary-key" }),
    ).rejects.toBeInstanceOf(OpenRouterManagementKeyRequiredError)
  })

  it.each([
    [401, API_ERROR_CODES.HTTP_401],
    [403, API_ERROR_CODES.HTTP_403],
    [429, API_ERROR_CODES.HTTP_429],
  ] as const)(
    "preserves shared HTTP %i mapping for management-key validation",
    async (status, code) => {
      server.use(
        http.get(`${OPENROUTER_API_BASE_URL}/key`, () =>
          HttpResponse.json({ error: "denied" }, { status }),
        ),
      )

      await expect(
        validateManagementKey({ accessToken: "management-key" }),
      ).rejects.toMatchObject({ statusCode: status, code })
    },
  )

  it("preserves the documented provider message for a credits 403", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json(
          {
            error: {
              code: 403,
              message: "Only management keys can perform this operation",
            },
          },
          { status: 403 },
        ),
      ),
    )

    await expect(fetchAccountData(baseRequest)).rejects.toMatchObject({
      message: "Only management keys can perform this operation",
      statusCode: 403,
      code: API_ERROR_CODES.HTTP_403,
      upstreamCode: "403",
    })
  })

  it.each([
    { data: null },
    { data: {} },
    { data: { is_management_key: "true" } },
    { data: { is_management_key: null } },
    { data: { is_management_key: true, creator_user_id: 42 } },
  ])(
    "rejects malformed key payloads as invalid responses: %j",
    async (body) => {
      server.use(
        http.get(`${OPENROUTER_API_BASE_URL}/key`, () =>
          HttpResponse.json(body),
        ),
      )

      await expect(
        validateManagementKey({ accessToken: "management-key" }),
      ).rejects.toBeInstanceOf(ApiError)
      await expect(
        validateManagementKey({ accessToken: "management-key" }),
      ).rejects.not.toBeInstanceOf(OpenRouterManagementKeyRequiredError)
    },
  )

  it("retains signed native ledger balance and its cumulative source operands", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: 0.1, total_usage: 0.3 } }),
      ),
    )

    const data = await fetchAccountData(baseRequest)
    expect(data).not.toHaveProperty("quota")
    expect(data).not.toHaveProperty("nativeBalance")
    expect(data.balance?.positions.slice(0, 1)).toEqual([
      expect.objectContaining({
        role: "ledger",
        asset: { kind: "currency", code: "USD" },
        nature: "prepaid",
        cashClassification: "unknown",
        scope: expect.objectContaining({ authority: "https://openrouter.ai" }),
        amount: expect.objectContaining({
          status: "known",
          value: "-0.2",
          source: expect.objectContaining({
            operation: "/credits",
            kind: "derived",
            inputs: ["total_credits", "total_usage"],
            amountInputs: { total_credits: "0.1", total_usage: "0.3" },
          }),
        }),
      }),
    ])
    expect(data).toMatchObject({
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: {
        consumption: {
          status: "unavailable",
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        requests: {
          status: "unavailable",
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        tokens: {
          status: "unavailable",
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        income: {
          status: "unavailable",
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
      checkIn: baseRequest.checkIn,
    })
  })

  it.each([
    {
      body: { data: { total_credits: "10", total_usage: 1 } },
      amount: { status: OBSERVATION_STATUSES.Known, value: "9" },
    },
    {
      body: { data: { total_credits: 10, total_usage: Number.NaN } },
      amount: { status: "unavailable" },
    },
    {
      body: { data: { total_credits: 10 } },
      amount: { status: "unavailable" },
    },
    {
      body: { data: { total_credits: Number.MAX_VALUE, total_usage: 0 } },
      amount: { status: "unavailable" },
    },
    {
      body: {
        data: {
          total_credits: Number.MAX_VALUE,
          total_usage: -Number.MAX_VALUE,
        },
      },
      amount: { status: "unavailable" },
    },
  ])(
    "preserves exact strings and refuses unsafe or absent ledger operands: $body",
    async ({ body, amount }) => {
      server.use(
        http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
          HttpResponse.json(body),
        ),
      )
      const data = await fetchAccountData(baseRequest)
      expect(data.balance?.positions[0]?.amount).toMatchObject(amount)
    },
  )

  it.each([401, 403, 429])("preserves HTTP %i errors", async (status) => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ error: "denied" }, { status }),
      ),
    )

    await expect(fetchAccountData(baseRequest)).rejects.toMatchObject({
      statusCode: status,
    })
  })

  it("refreshes healthy data and maps failures through shared health status", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ data: { total_credits: 10, total_usage: 2 } }),
      ),
    )

    const healthy = await refreshAccountData(baseRequest)
    expect(healthy.success).toBe(true)
    expect(healthy.healthStatus.status).toBe(SiteHealthStatus.Healthy)

    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
        HttpResponse.json({ error: "denied" }, { status: 401 }),
      ),
    )
    const failed = await refreshAccountData(baseRequest)
    expect(failed).toMatchObject({
      success: false,
      healthStatus: { status: SiteHealthStatus.Warning },
    })
  })

  it("classifies a blank refresh credential as an authentication warning", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const result = await refreshAccountData({
      ...baseRequest,
      auth: { ...baseRequest.auth, accessToken: "   " },
    })

    expect(result).toMatchObject({
      success: false,
      healthStatus: { status: SiteHealthStatus.Warning },
    })
    expect(result.healthStatus.message).toContain("401")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([401, 403, 429])(
    "sanitizes sensitive backend messages for refresh HTTP %i failures",
    async (status) => {
      const sensitiveMessage = "management-key-secret-backend-message"
      server.use(
        http.get(`${OPENROUTER_API_BASE_URL}/credits`, () =>
          HttpResponse.json({ message: sensitiveMessage }, { status }),
        ),
      )

      const result = await refreshAccountData(baseRequest)

      expect(result.success).toBe(false)
      expect(result.healthStatus.status).toBe(SiteHealthStatus.Warning)
      expect(result.healthStatus.message).not.toContain(sensitiveMessage)
    },
  )

  it("sanitizes fetch failure details while preserving network health", async () => {
    const privateDiagnostic = "private-fetch-diagnostic"
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError(`fetch failed: ${privateDiagnostic}`),
    )

    const result = await refreshAccountData(baseRequest)

    expect(result).toMatchObject({
      success: false,
      healthStatus: { status: SiteHealthStatus.Error },
    })
    expect(result.healthStatus.message).not.toContain(privateDiagnostic)
  })

  it("replaces unknown refresh failures with controlled local copy", async () => {
    const privateDiagnostic = "private-unknown-diagnostic"
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error(privateDiagnostic),
    )

    const result = await refreshAccountData(baseRequest)

    expect(result).toMatchObject({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Unknown,
        message: "Unknown error",
      },
    })
    expect(result.healthStatus.message).not.toContain(privateDiagnostic)
  })

  it("pins account requests to the OpenRouter API origin", async () => {
    let seenUrl = ""
    let capturedRequest: Request | undefined
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/credits`, ({ request }) => {
        seenUrl = request.url
        capturedRequest = request
        return HttpResponse.json({ data: { total_credits: 1, total_usage: 0 } })
      }),
    )

    await fetchAccountData(baseRequest)
    expect(seenUrl).toBe(`${OPENROUTER_API_BASE_URL}/credits`)
    expect(capturedRequest?.headers.get("authorization")).toBe(
      "Bearer management-key-placeholder",
    )
    expect(capturedRequest?.headers.has("new-api-user")).toBe(false)
    expect(capturedRequest?.headers.has("user-id")).toBe(false)
  })
})
