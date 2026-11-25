import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  fetchChatflowsCheckInStatus,
  parseChatflowsCheckInMutationResponse,
  parseChatflowsCheckInStatusResponse,
  performChatflowsCheckIn,
} from "~/services/apiService/sub2api/checkin/chatflowsCheckIn"
import { getChatflowsCheckInPeriodStartAt } from "~/services/apiService/sub2api/checkin/chatflowsCheckInProtocol"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/sub2api/auth/browserAuth", async (original) => ({
  ...(await original<
    typeof import("~/services/apiService/sub2api/auth/browserAuth")
  >()),
  recoverSub2ApiBrowserAuth: vi.fn().mockResolvedValue(null),
}))
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: vi.fn().mockRejectedValue(new Error("unavailable")),
  }),
)
vi.mock("~/services/apiTransport/request", async (original) => ({
  ...(await original<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const response = (
  body: unknown,
  status = 200,
): ApiTransportResponse<unknown> => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})
const statusData = (overrides: Record<string, unknown> = {}) => ({
  can_checkin: true,
  period_key: "2026-11-23",
  next_reset_at: "2026-11-24T12:00:00+08:00",
  checked_in_at: null,
  balance: 0,
  ...overrides,
})
const success = (data: unknown) =>
  response({ code: 0, message: "success", data })
const request: ApiServiceRequest = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://relay.example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}

describe("ChatflowsAI public check-in contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-24T03:59:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it.each([true, false])(
    "reads the current noon period with can_checkin=%s",
    (canCheckin) => {
      expect(
        parseChatflowsCheckInStatusResponse(
          success(statusData({ can_checkin: canCheckin })),
        ),
      ).toMatchObject({
        enabled: true,
        checkedInToday: !canCheckin,
        periodKey: "2026-11-23",
      })
    },
  )

  it("parses the server check-in timestamp only when it has an explicit timezone", () => {
    expect(
      parseChatflowsCheckInStatusResponse(
        success(
          statusData({
            can_checkin: false,
            checked_in_at: "2026-11-24T11:59:59+08:00",
          }),
        ),
      ),
    ).toMatchObject({
      checkedInToday: true,
      checkedInAt: Date.parse("2026-11-24T03:59:59Z"),
    })
    expect(
      parseChatflowsCheckInStatusResponse(
        success(
          statusData({
            can_checkin: false,
            checked_in_at: "2026-11-24T03:59:59",
          }),
        ),
      ).checkedInAt,
    ).toBeUndefined()
  })

  it("does not invent a required message in a successful envelope", () => {
    expect(
      parseChatflowsCheckInStatusResponse(
        response({ code: 0, data: statusData() }),
      ),
    ).toMatchObject({ checkedInToday: false })
  })

  it("maps a validated period key to its noon opening time", () => {
    expect(getChatflowsCheckInPeriodStartAt("2026-11-23")).toBe(
      Date.parse("2026-11-23T04:00:00.000Z"),
    )
    expect(getChatflowsCheckInPeriodStartAt("2026-02-30")).toBeUndefined()
  })

  it.each([
    {},
    null,
    [],
    { can_checkin: "true" },
    { can_checkin: true, period_key: "2026-11-23" },
  ])("rejects incomplete status %j", (data) => {
    expect(() => parseChatflowsCheckInStatusResponse(success(data))).toThrow()
  })

  it("rejects a response that arrives after its noon reset", () => {
    vi.setSystemTime(new Date("2026-11-24T04:00:00Z"))
    expect(() =>
      parseChatflowsCheckInStatusResponse(success(statusData())),
    ).toThrow()
    expect(
      parseChatflowsCheckInStatusResponse(
        success(
          statusData({
            period_key: "2026-11-24",
            next_reset_at: "2026-11-25T12:00:00+08:00",
          }),
        ),
      ),
    ).toMatchObject({ checkedInToday: false })
  })

  it.each([
    { period_key: "yesterday" },
    { period_key: "2026-02-30" },
    { period_key: "2026-11-22" },
    { period_key: "2026-11-24" },
    { period_key: "2026-11-22", next_reset_at: "2027-01-01T12:00:00+08:00" },
    { next_reset_at: "2026-11-24T12:01:00+08:00" },
    { next_reset_at: "2026-11-25T12:00:00+08:00" },
  ])("rejects a mismatched period or noon reset %j", (fields) => {
    expect(() =>
      parseChatflowsCheckInStatusResponse(success(statusData(fields))),
    ).toThrow()
  })

  it.each([401, 403, 404, 405, 500])(
    "preserves HTTP %s even without JSON",
    (status) => {
      expect(() =>
        parseChatflowsCheckInStatusResponse(response("unavailable", status)),
      ).toThrow(expect.objectContaining({ statusCode: status }))
    },
  )

  it("recognizes numeric envelope authentication failure", () => {
    expect(() =>
      parseChatflowsCheckInStatusResponse(
        response({ code: 401, message: "Unauthorized" }),
      ),
    ).toThrow(expect.objectContaining({ statusCode: 401 }))
  })

  it.each([response({ code: 409 }, 401), response({ code: 401 }, 409)])(
    "handles authentication before duplicate conflicts",
    (reply) => {
      expect(() => parseChatflowsCheckInMutationResponse(reply)).toThrow()
    },
  )

  it.each([0, 50, "50.25"])("preserves returned credit amount %s", (amount) => {
    expect(parseChatflowsCheckInMutationResponse(success({ amount }))).toEqual({
      kind: "applied",
      amount,
    })
  })

  it.each([undefined, null, false, -1, "", "not an amount", Number.NaN])(
    "does not confirm malformed grant %s",
    (amount) => {
      expect(() =>
        parseChatflowsCheckInMutationResponse(success({ amount })),
      ).toThrow()
    },
  )

  it.each([
    response({ code: 409, message: "Already checked" }),
    response({ code: 409 }, 409),
    response("Conflict", 409),
  ])("recognizes conflicts without inventing a grant", (conflict) => {
    expect(parseChatflowsCheckInMutationResponse(conflict)).toEqual({
      kind: "already_checked",
    })
  })

  it("uses only the documented no-query GET and the saved credential", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(success(statusData()))
    await fetchChatflowsCheckInStatus(request)
    expect(fetchApiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "example-token" }),
      }),
      {
        endpoint: "/api/checkin/status",
        options: { method: "GET", cache: "no-store" },
      },
    )
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("does not recover missing credentials during discovery", async () => {
    await expect(
      fetchChatflowsCheckInStatus({
        ...request,
        auth: {
          ...request.auth,
          accessToken: "",
          refreshToken: "refresh-token",
        },
      }),
    ).rejects.toThrow()
    expect(fetchApiResponse).not.toHaveBeenCalled()
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("renews an expiring token before an authorized execution status GET", async () => {
    vi.mocked(refreshSub2ApiTokens).mockResolvedValueOnce({
      accessToken: "renewed-token",
      refreshToken: "rotated-token",
      tokenExpiresAt: Date.now() + 3600000,
    })
    vi.mocked(fetchApiResponse).mockResolvedValue(success(statusData()))
    await fetchChatflowsCheckInStatus(
      {
        ...request,
        auth: {
          ...request.auth,
          refreshToken: "refresh-token",
          tokenExpiresAt: Date.now() - 1000,
        },
      },
      { allowAuthenticationRecovery: true },
    )
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "renewed-token" }),
      }),
      {
        endpoint: "/api/checkin/status",
        options: { method: "GET", cache: "no-store" },
      },
    )
  })

  it("renews once after an unauthorized execution status GET", async () => {
    vi.mocked(refreshSub2ApiTokens).mockResolvedValueOnce({
      accessToken: "renewed-token",
      refreshToken: "rotated-token",
      tokenExpiresAt: Date.now() + 3600000,
    })
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response({ code: 401, message: "Unauthorized" }))
      .mockResolvedValueOnce(success(statusData()))
    await expect(
      fetchChatflowsCheckInStatus(
        {
          ...request,
          auth: { ...request.auth, refreshToken: "refresh-token" },
        },
        { allowAuthenticationRecovery: true },
      ),
    ).resolves.toMatchObject({ checkedInToday: false })
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    expect(fetchApiResponse).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "renewed-token" }),
      }),
      expect.anything(),
    )
  })

  it("submits once without a body or query", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(success({ amount: 50 }))
    await expect(performChatflowsCheckIn(request)).resolves.toEqual({
      kind: "applied",
      amount: 50,
    })
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {
        endpoint: "/api/checkin",
        options: { method: "POST", cache: "no-store" },
      },
    )
  })

  it("never retries a lost mutation response", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(performChatflowsCheckIn(request)).rejects.toThrow(
      "Failed to fetch",
    )
    expect(fetchApiResponse).toHaveBeenCalledOnce()
  })

  it("honors current account admission before submission", async () => {
    await expect(
      performChatflowsCheckIn(request, {
        beforeRecoveredMutation: async () => false,
      }),
    ).rejects.toMatchObject({ reason: "precondition_failed" })
    expect(fetchApiResponse).not.toHaveBeenCalled()
  })
})
