import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AI_ROUTER_DAILY_CHECK_IN_ENDPOINT,
  AI_ROUTER_DAILY_CHECK_IN_ERROR_REASONS,
  AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS,
  AI_ROUTER_STATUS_OUTCOMES,
  performAiRouterDailyCheckIn,
  probeAiRouterDailyCheckInStatus,
} from "~/services/apiService/sub2api/checkin/aiRouterCheckIn"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const request: ApiServiceRequest = {
  baseUrl: "https://ai-router.dev",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "3725",
  },
}

const textResponse = (body: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  headers: {},
  status,
  body,
})

const INVALID_RESPONSE_MESSAGE = "Invalid AI-ROUTER daily check-in response"

/** Captured from GET /api/v1/user/daily-checkin on 2026-09-27. */
const statusEnvelope = (
  overrides: Partial<{
    enabled: boolean
    checked_today: boolean
    eligible: boolean
    reward_amount: number | string
  }> = {},
) =>
  JSON.stringify({
    code: 0,
    message: "success",
    data: {
      enabled: true,
      reward_amount: 1,
      base_reward_amount: 1,
      yesterday_actual_cost: 0,
      yesterday_usage_reward_percent: 2,
      yesterday_usage_reward_amount: 0,
      max_reward_amount: 10,
      checked_today: false,
      next_reset_at: "2026-09-28T00:00:00Z",
      checkin_date: "2026-09-27",
      eligible: true,
      ...overrides,
    },
  })

describe("AI-ROUTER daily check-in status probe", () => {
  beforeEach(() => {
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("reads the deployment's status envelope from the fixed endpoint", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(statusEnvelope()),
    )

    await expect(probeAiRouterDailyCheckInStatus(request)).resolves.toEqual({
      outcome: AI_ROUTER_STATUS_OUTCOMES.Matched,
      status: { enabled: true, checkedInToday: false },
    })
    const call = vi.mocked(fetchApiResponse).mock.calls.at(0)
    // The deployment scopes a check-in to a calendar day, so its own dashboard
    // sends the browser timezone on the status read.
    const endpoint = call?.[1]?.endpoint ?? ""
    expect(endpoint.startsWith(`${AI_ROUTER_DAILY_CHECK_IN_ENDPOINT}?`)).toBe(
      true,
    )
    expect(
      new URLSearchParams(endpoint.split("?")[1] ?? "").get("timezone"),
    ).toBeTruthy()
    expect(call?.[1]?.options).toEqual({ method: "GET", cache: "no-store" })
    expect(call?.[1]?.responseType).toBe("text")
  })

  it.each([
    [{ enabled: true, checked_today: true }, true],
    [{ enabled: true, checked_today: false }, false],
    [{ enabled: false, checked_today: false }, false],
    [{ enabled: false, checked_today: true }, true],
  ])(
    "reads the deployment's enabled/checked pair (%j)",
    async (overrides, checkedInToday) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        textResponse(statusEnvelope(overrides)),
      )

      await expect(probeAiRouterDailyCheckInStatus(request)).resolves.toEqual({
        outcome: AI_ROUTER_STATUS_OUTCOMES.Matched,
        status: {
          enabled: overrides.enabled,
          checkedInToday,
        },
      })
    },
  )

  // The deployment gates the reward behind an account-age check and its own
  // dashboard refuses to submit while the account is not eligible, so the status
  // has to report the account as unable to claim today.
  it("reports an ineligible account as unavailable for today", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(statusEnvelope({ eligible: false })),
    )

    await expect(probeAiRouterDailyCheckInStatus(request)).resolves.toEqual({
      outcome: AI_ROUTER_STATUS_OUTCOMES.Matched,
      status: { enabled: false, checkedInToday: false },
    })
  })

  it("keeps a deployment without the route absent", async () => {
    for (const status of [404, 405]) {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        textResponse("404 page not found", status),
      )
      await expect(probeAiRouterDailyCheckInStatus(request)).resolves.toEqual({
        outcome: AI_ROUTER_STATUS_OUTCOMES.Absent,
      })
    }
  })

  it("treats a non-JSON success body as a fallback page", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse("<!doctype html><html><body>app shell</body></html>"),
    )

    await expect(probeAiRouterDailyCheckInStatus(request)).resolves.toEqual({
      outcome: AI_ROUTER_STATUS_OUTCOMES.Absent,
    })
  })

  it.each([
    [401, "authentication_required"],
    [403, "permission_denied"],
    [500, "invalid_response"],
    [502, "invalid_response"],
  ])("keeps HTTP %s unknown (%s)", async (status, reason) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(JSON.stringify({ code: status, message: "nope" }), status),
    )

    await expect(probeAiRouterDailyCheckInStatus(request)).resolves.toEqual({
      outcome: AI_ROUTER_STATUS_OUTCOMES.Unknown,
      reason,
    })
  })

  it.each([
    {},
    { code: 0, message: "success" },
    { code: 0, message: "success", data: {} },
    { code: 0, message: "success", data: { enabled: true } },
    {
      code: 0,
      message: "success",
      data: { enabled: "true", checked_today: false },
    },
    { code: 0, message: "success", data: { enabled: true, checked_today: 0 } },
    {
      code: "0",
      message: "success",
      data: { enabled: true, checked_today: false },
    },
    { code: 0, data: { enabled: true, checked_today: false } },
  ])(
    "keeps a JSON answer with an unexpected shape unknown %j",
    async (body) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        textResponse(JSON.stringify(body)),
      )

      await expect(probeAiRouterDailyCheckInStatus(request)).resolves.toEqual({
        outcome: AI_ROUTER_STATUS_OUTCOMES.Unknown,
        reason: "invalid_response",
      })
    },
  )

  it("surfaces a transport failure to the caller", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )

    await expect(
      probeAiRouterDailyCheckInStatus(request),
    ).rejects.toMatchObject({ message: "Failed to fetch" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })
})

describe("AI-ROUTER daily check-in", () => {
  beforeEach(() => {
    vi.mocked(fetchApiResponse).mockReset()
  })

  it.each([1, "1", 1.75])("reads a new award of %s", async (rewardAmount) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(
        statusEnvelope({ checked_today: true, reward_amount: rewardAmount }),
      ),
    )

    await expect(performAiRouterDailyCheckIn(request)).resolves.toEqual({
      kind: AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.Applied,
      data: { rewardAmount: Number(rewardAmount) },
    })
  })

  // The deployment's own dashboard omits the fingerprint header whenever its
  // fingerprint lookup misses, so the extension submits without one.
  it("submits once without a body and without a client fingerprint", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(statusEnvelope({ checked_today: true })),
    )

    await performAiRouterDailyCheckIn(request)

    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    const call = vi.mocked(fetchApiResponse).mock.calls.at(0)
    expect(call?.[0]).toMatchObject({
      baseUrl: "https://ai-router.dev",
      auth: { accessToken: "example-token" },
    })
    expect(call?.[1]?.endpoint).toBe(AI_ROUTER_DAILY_CHECK_IN_ENDPOINT)
    const options = call?.[1]?.options as RequestInit | undefined
    expect(options?.method).toBe("POST")
    expect(options?.cache).toBe("no-store")
    expect(options?.body).toBeUndefined()
    const headers = new Headers(options?.headers ?? {})
    expect(headers.get("X-AI-Router-Client-Fingerprint")).toBeNull()
  })

  // Captured duplicate submission from the same deployment on 2026-09-27.
  it("recognizes the deployment's duplicate-day refusal", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(
        JSON.stringify({
          code: 409,
          message: "daily check-in reward already claimed today",
          reason: AI_ROUTER_DAILY_CHECK_IN_ERROR_REASONS.AlreadyClaimed,
        }),
        409,
      ),
    )

    await expect(performAiRouterDailyCheckIn(request)).resolves.toEqual({
      kind: AI_ROUTER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
    })
  })

  it("keeps the deployment's restriction refusal an error", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(
        JSON.stringify({
          code: 403,
          message: "daily check-in restricted",
          reason: AI_ROUTER_DAILY_CHECK_IN_ERROR_REASONS.Restricted,
        }),
        403,
      ),
    )

    await expect(performAiRouterDailyCheckIn(request)).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it.each([
    [409, "DAILY_CHECKIN_OTHER"],
    [429, undefined],
    [500, undefined],
  ])("keeps an unmapped failure an error (%s)", async (status, reason) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      textResponse(
        JSON.stringify({
          code: status,
          message: "unexpected",
          ...(reason ? { reason } : {}),
        }),
        status,
      ),
    )

    await expect(performAiRouterDailyCheckIn(request)).rejects.toMatchObject({
      statusCode: status,
    })
  })

  it.each([
    JSON.stringify({ code: 0, message: "success" }),
    JSON.stringify({ code: 0, message: "success", data: {} }),
    statusEnvelope({ checked_today: false }),
    statusEnvelope({ checked_today: true, reward_amount: -1 }),
    statusEnvelope({ checked_today: true, reward_amount: "not-a-number" }),
    "<!doctype html><html><body>app shell</body></html>",
  ])("does not report an unreadable award as applied %s", async (body) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(textResponse(body))

    await expect(performAiRouterDailyCheckIn(request)).rejects.toMatchObject({
      message: INVALID_RESPONSE_MESSAGE,
    })
  })
})
