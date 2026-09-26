import { beforeEach, describe, expect, it, vi } from "vitest"

import { rightCodeAccountRefresh } from "~/services/apiAdapters/rightcode/accountRefresh"
import { RIGHTCODE_ENDPOINTS } from "~/services/apiService/rightcode/constants"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const { mockResyncRightCodeAuthToken } = vi.hoisted(() => ({
  mockResyncRightCodeAuthToken: vi.fn(),
}))

vi.mock("~/services/apiService/rightcode/tokenResync", () => ({
  resyncRightCodeAuthToken: mockResyncRightCodeAuthToken,
}))

const baseUrl = "https://right-code.example.invalid"

const createRequest = (
  accessToken = "stale-token",
  userId: string | number = "7",
) => ({
  baseUrl,
  accountId: "account-example",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken, userId },
  checkIn: buildCheckInConfig(),
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const today = formatLocalDayKey()

/** Serves every endpoint one successful refresh reads. */
const stubDeployment = (
  fetchImpl: (url: string, init?: RequestInit) => Response,
) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      fetchImpl(String(input), init),
    ),
  )
}

const accountPayload = {
  id: 7,
  username: "example-user",
  user_token: "fresh-token",
  balance: 1,
}

describe("rightCodeAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("reports no check-in support without probing the network", async () => {
    await expect(
      rightCodeAccountRefresh.fetchCheckInSupport?.(createRequest()),
    ).resolves.toBe(false)
  })

  it("recovers a rotated token from the browser session and persists it", async () => {
    let servedToken: string | null = null
    stubDeployment((url, init) => {
      const authorization = new Headers(init?.headers).get("Authorization")
      servedToken = authorization
      if (authorization === "Bearer stale-token") {
        return jsonResponse(
          {
            error: "Unauthorized",
            message: "Invalid userToken",
            path: RIGHTCODE_ENDPOINTS.me,
            status: 401,
          },
          401,
        )
      }
      if (url.endsWith(RIGHTCODE_ENDPOINTS.me))
        return jsonResponse(accountPayload)
      if (url.endsWith(RIGHTCODE_ENDPOINTS.usageStatsOverall)) {
        return jsonResponse({
          total_requests: 0,
          total_tokens: 0,
          total_cost: 0,
        })
      }
      if (url.includes(RIGHTCODE_ENDPOINTS.usageStats)) {
        return jsonResponse({
          total_requests: 0,
          total_tokens: 0,
          total_cost: 0,
        })
      }
      if (url.endsWith(RIGHTCODE_ENDPOINTS.subscriptions)) {
        return jsonResponse({ subscriptions: [], total: 0 })
      }
      if (url.endsWith(RIGHTCODE_ENDPOINTS.subscriptionSummary)) {
        return jsonResponse({
          total_quota: 0,
          used_quota: 0,
          remaining_quota: 0,
        })
      }
      return jsonResponse({ message: "unexpected" }, 404)
    })

    mockResyncRightCodeAuthToken.mockResolvedValueOnce({
      accessToken: "fresh-token",
      userId: "7",
      username: "example-user",
      source: "existing_tab",
    })

    const result = await rightCodeAccountRefresh.refreshAccount(
      createRequest("stale-token"),
    )

    expect(mockResyncRightCodeAuthToken).toHaveBeenCalledWith(
      baseUrl,
      "7",
      undefined,
      undefined,
    )
    expect(result.success).toBe(true)
    expect(result.authUpdate).toEqual({
      accessToken: "fresh-token",
      userId: "7",
      username: "example-user",
    })
    // The refreshed read used the recovered token, not the stale one.
    expect(servedToken).toBe("Bearer fresh-token")
  })

  it("rejects token resync when the recovered session belongs to a different user", async () => {
    stubDeployment((_url, init) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization
      if (auth === "Bearer stale-token") {
        return jsonResponse(
          { error: "Unauthorized", message: "Invalid userToken" },
          401,
        )
      }
      return jsonResponse(accountPayload)
    })

    mockResyncRightCodeAuthToken.mockResolvedValueOnce({
      accessToken: "other-user-token",
      userId: "99",
      username: "other-user",
      source: "existing_tab",
    })

    const result = await rightCodeAccountRefresh.refreshAccount(
      createRequest("stale-token", "7"),
    )

    expect(result.success).toBe(false)
    expect(result.authUpdate).toBeUndefined()
  })

  it("rejects retry when the retry auth/me returns a different user than expected", async () => {
    stubDeployment((url, init) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization
      if (auth === "Bearer stale-token") {
        return jsonResponse(
          { error: "Unauthorized", message: "Invalid userToken" },
          401,
        )
      }
      if (url.endsWith(RIGHTCODE_ENDPOINTS.me)) {
        return jsonResponse({ ...accountPayload, id: 99 })
      }
      return jsonResponse(accountPayload)
    })

    mockResyncRightCodeAuthToken.mockResolvedValueOnce({
      accessToken: "spoofed-token",
      userId: "7",
      username: "spoofed-user",
      source: "existing_tab",
    })

    const result = await rightCodeAccountRefresh.refreshAccount(
      createRequest("stale-token", "7"),
    )

    expect(result.success).toBe(false)
    expect(result.authUpdate).toBeUndefined()
  })

  it("does not overwrite the stored token when the browser session has nothing new", async () => {
    stubDeployment(() =>
      jsonResponse(
        { error: "Unauthorized", message: "Invalid userToken" },
        401,
      ),
    )
    mockResyncRightCodeAuthToken.mockResolvedValueOnce({
      accessToken: "stale-token",
      userId: "7",
      source: "existing_tab",
    })

    const result = await rightCodeAccountRefresh.refreshAccount(
      createRequest("stale-token"),
    )

    expect(result.success).toBe(false)
    expect(result.authUpdate).toBeUndefined()
    expect(result.healthStatus.status).not.toBe(SiteHealthStatus.Healthy)
  })

  it("keeps the account healthy without re-syncing when the token still works", async () => {
    stubDeployment((url) => {
      if (url.endsWith(RIGHTCODE_ENDPOINTS.me))
        return jsonResponse(accountPayload)
      if (url.endsWith(RIGHTCODE_ENDPOINTS.usageStatsOverall)) {
        return jsonResponse({
          total_requests: 0,
          total_tokens: 0,
          total_cost: 0,
        })
      }
      if (url.includes(RIGHTCODE_ENDPOINTS.usageStats)) {
        return jsonResponse({
          total_requests: 0,
          total_tokens: 0,
          total_cost: 0,
          start_date: today,
          end_date: today,
        })
      }
      if (url.endsWith(RIGHTCODE_ENDPOINTS.subscriptions)) {
        return jsonResponse({ subscriptions: [], total: 0 })
      }
      if (url.endsWith(RIGHTCODE_ENDPOINTS.subscriptionSummary)) {
        return jsonResponse({
          total_quota: 0,
          used_quota: 0,
          remaining_quota: 0,
        })
      }
      return jsonResponse({ message: "unexpected" }, 404)
    })

    const result = await rightCodeAccountRefresh.refreshAccount(createRequest())

    expect(result.success).toBe(true)
    expect(result.authUpdate).toBeUndefined()
    expect(mockResyncRightCodeAuthToken).not.toHaveBeenCalled()
  })
})
