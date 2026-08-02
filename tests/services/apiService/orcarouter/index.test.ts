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

import { UI_CONSTANTS } from "~/constants/ui"
import { ORCAROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import {
  fetchAccountData,
  refreshAccountData,
} from "~/services/apiService/orcarouter"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  AuthTypeEnum,
  SiteHealthStatus,
} from "~/types"
import { server } from "~~/tests/msw/server"

const baseRequest = {
  baseUrl: "https://mirror.example.invalid",
  accountId: "orcarouter-account",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "  sk-orca-placeholder  ",
    userId: "should-not-be-sent",
  },
  checkIn: { enableDetection: true },
}

describe("apiService OrcaRouter", () => {
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
    i18n.addResourceBundle(
      "en",
      "messages",
      {
        errors: {
          api: {
            invalidResponseFormat: "Invalid response format",
          },
        },
      },
      true,
      true,
    )
  })
  beforeEach(() => server.resetHandlers())
  afterEach(() => vi.restoreAllMocks())

  it("fetches billing balance from the canonical OpenAI-compatible endpoints", async () => {
    const captured: Request[] = []
    server.use(
      http.get(
        `${ORCAROUTER_API_BASE_URL}/dashboard/billing/subscription`,
        (info) => {
          captured.push(info.request)
          return HttpResponse.json({ hard_limit_usd: 10 })
        },
      ),
      http.get(`${ORCAROUTER_API_BASE_URL}/dashboard/billing/usage`, (info) => {
        captured.push(info.request)
        return HttpResponse.json({ total_usage: 2 })
      }),
    )

    const data = await fetchAccountData(baseRequest)

    expect(captured).toHaveLength(2)
    const [subscription, usage] = captured
    expect(subscription.url).toBe(
      `${ORCAROUTER_API_BASE_URL}/dashboard/billing/subscription`,
    )
    expect(subscription.headers.get("authorization")).toBe(
      "Bearer sk-orca-placeholder",
    )
    expect(usage.url).toContain(
      `${ORCAROUTER_API_BASE_URL}/dashboard/billing/usage?start_date=`,
    )
    // Guard against query strings being duplicated by transport layers.
    expect(usage.url.split("start_date=")).toHaveLength(2)
    expect(data.quota).toBe(
      Math.round(8 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
    )
    expect(data.today_quota_consumption).toBe(0)
    expect(data.today_prompt_tokens).toBe(0)
    expect(data.today_completion_tokens).toBe(0)
    expect(data.today_requests_count).toBe(0)
    expect(data.today_income).toBe(0)
    expect(data.checkIn.enableDetection).toBe(false)
  })

  it("trims the access token before sending", async () => {
    let captured: Request | undefined
    server.use(
      http.get(
        `${ORCAROUTER_API_BASE_URL}/dashboard/billing/subscription`,
        (info) => {
          captured = info.request
          return HttpResponse.json({ hard_limit_usd: 10 })
        },
      ),
      http.get(`${ORCAROUTER_API_BASE_URL}/dashboard/billing/usage`, () =>
        HttpResponse.json({ total_usage: 2 }),
      ),
    )

    await fetchAccountData(baseRequest)

    expect(captured?.headers.get("authorization")).toBe(
      "Bearer sk-orca-placeholder",
    )
  })

  it("throws when the access token is missing", async () => {
    await expect(
      fetchAccountData({
        ...baseRequest,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "  " },
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.HTTP_401 })
  })

  it("throws invalid response format on non-numeric billing fields", async () => {
    server.use(
      http.get(
        `${ORCAROUTER_API_BASE_URL}/dashboard/billing/subscription`,
        () => HttpResponse.json({ hard_limit_usd: "not-a-number" }),
      ),
      http.get(`${ORCAROUTER_API_BASE_URL}/dashboard/billing/usage`, () =>
        HttpResponse.json({ total_usage: 2 }),
      ),
    )

    await expect(fetchAccountData(baseRequest)).rejects.toBeInstanceOf(ApiError)
  })

  it("refresh maps success to healthy account data", async () => {
    server.use(
      http.get(
        `${ORCAROUTER_API_BASE_URL}/dashboard/billing/subscription`,
        () => HttpResponse.json({ hard_limit_usd: 10 }),
      ),
      http.get(`${ORCAROUTER_API_BASE_URL}/dashboard/billing/usage`, () =>
        HttpResponse.json({ total_usage: 2 }),
      ),
    )

    const result = await refreshAccountData(baseRequest)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.healthStatus.status).toBe(SiteHealthStatus.Healthy)
      expect(result.data.todayStatsAvailability).toEqual({
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
      })
    }
  })

  it("refresh maps failures to account health", async () => {
    server.use(
      http.get(
        `${ORCAROUTER_API_BASE_URL}/dashboard/billing/subscription`,
        () => HttpResponse.json({ error: "boom" }, { status: 401 }),
      ),
      http.get(`${ORCAROUTER_API_BASE_URL}/dashboard/billing/usage`, () =>
        HttpResponse.json({ error: "boom" }, { status: 401 }),
      ),
    )

    const result = await refreshAccountData(baseRequest)

    expect(result.success).toBe(false)
    expect(result.healthStatus.status).not.toBe(SiteHealthStatus.Healthy)
  })
})
