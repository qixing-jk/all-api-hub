import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  fetchToolcodeDailyCheckInStatus,
  performToolcodeDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/toolcodeCheckIn"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock(
  "~/services/apiService/sub2api/auth/browserAuth",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/browserAuth")
    >()),
    recoverSub2ApiBrowserAuth: vi.fn().mockResolvedValue(null),
  }),
)
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: vi
      .fn()
      .mockRejectedValue(new Error("refresh unavailable")),
  }),
)

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const request: ApiServiceRequest = {
  baseUrl: "https://toolcode.top",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body,
})
const envelope = (data: unknown) => ({ code: 0, message: "success", data })
const statusData = (
  checked = false,
  enabled = true,
  canCheckIn = !checked,
) => ({
  checkin_enabled: enabled,
  checked_in_today: checked,
  can_checkin: canCheckIn,
  points: { balance: 20 },
  reward_rules: [{ points_reward: 10, reward_amount: 0 }],
})

describe("ToolCode growth-center check-in protocol", () => {
  beforeEach(() => {
    vi.mocked(fetchApiResponse).mockReset()
    vi.mocked(recoverSub2ApiBrowserAuth).mockClear()
    vi.mocked(refreshSub2ApiTokens).mockClear()
  })

  it.each([undefined, "saved-refresh-token"])(
    "does not recover or persist credentials during a missing-token status probe (refresh=%s)",
    async (refreshToken) => {
      await expect(
        fetchToolcodeDailyCheckInStatus({
          ...request,
          auth: { ...request.auth!, accessToken: "", refreshToken },
        }),
      ).rejects.toMatchObject({ statusCode: 401 })
      expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
      expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
      expect(fetchApiResponse).not.toHaveBeenCalled()
    },
  )

  it.each([
    [false, true, true],
    [true, true, false],
    [false, false, false],
    [false, true, false],
  ])(
    "reads availability and today's state (%s, %s, %s) without retaining points/history",
    async (checked, enabled, canCheckIn) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        response(envelope(statusData(checked, enabled, canCheckIn))),
      )
      await expect(fetchToolcodeDailyCheckInStatus(request)).resolves.toEqual({
        enabled: enabled && (checked || canCheckIn),
        checkedInToday: checked,
      })
      expect(fetchApiResponse).toHaveBeenCalledWith(
        expect.objectContaining({ auth: request.auth }),
        {
          endpoint: `/api/v1/engagement/checkin/status?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
          options: { method: "GET", cache: "no-store" },
        },
      )
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    null,
    {},
    { enabled: true, checked_in_today: false },
    { checkin_enabled: "true", checked_in_today: false, can_checkin: true },
    { checkin_enabled: true, checked_in_today: 0, can_checkin: true },
    { checkin_enabled: true, checked_in_today: false },
  ])("rejects malformed/sibling status %j", async (data) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(envelope(data)))
    await expect(fetchToolcodeDailyCheckInStatus(request)).rejects.toThrow()
  })

  it.each([401, 403, 404, 405, 429, 500])(
    "preserves HTTP %s",
    async (status) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        response("not-json", status),
      )
      await expect(
        fetchToolcodeDailyCheckInStatus(request),
      ).rejects.toMatchObject({ statusCode: status })
    },
  )

  it.each([
    "<html>SPA</html>",
    {},
    { code: "0", message: "success" },
    { code: 1, message: "failed", data: statusData() },
  ])("rejects a non-authoritative envelope %j", async (body) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(body))
    await expect(fetchToolcodeDailyCheckInStatus(request)).rejects.toThrow()
  })

  it("submits one bodyless POST and projects the actual point/bonus award", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response(
        envelope({
          ...statusData(true),
          points_reward: 10,
          reward_amount: 0,
          expires_at: "0001-01-01T00:00:00Z",
        }),
      ),
    )
    await expect(performToolcodeDailyCheckIn(request)).resolves.toEqual({
      kind: "applied",
      data: { pointsReward: 10, bonusAmount: 0 },
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    expect(fetchApiResponse).toHaveBeenCalledWith(expect.anything(), {
      endpoint: "/api/v1/engagement/checkin",
      options: { method: "POST", cache: "no-store" },
    })
  })

  it("recognizes only the observed duplicate reason", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response(
        {
          code: 409,
          message: "今日已签到，请勿重复签到",
          reason: "CHECKIN_ALREADY_COMPLETED",
        },
        409,
      ),
    )
    await expect(performToolcodeDailyCheckIn(request)).resolves.toEqual({
      kind: "already_checked",
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })

  it.each([
    response({ code: 409, message: "conflict", reason: "OTHER_CONFLICT" }, 409),
    response(
      { code: 409, message: "conflict", reason: "CHECKIN_ALREADY_COMPLETED" },
      500,
    ),
    response(
      envelope({ ...statusData(false), points_reward: 10, reward_amount: 0 }),
    ),
    response(
      envelope({ ...statusData(true), points_reward: -1, reward_amount: 0 }),
    ),
    response(
      envelope({ ...statusData(true), points_reward: 10.5, reward_amount: 0 }),
    ),
    response(
      envelope({ ...statusData(true), points_reward: 10, reward_amount: "0" }),
    ),
    response(envelope(statusData(true))),
  ])("does not claim an award from an invalid response %j", async (value) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(value)
    await expect(performToolcodeDailyCheckIn(request)).rejects.toThrow()
  })

  it.each([401, 403, 429, 500])(
    "does not replay an HTTP %s mutation",
    async (status) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(response({}, status))
      await expect(performToolcodeDailyCheckIn(request)).rejects.toMatchObject({
        statusCode: status,
      })
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    },
  )

  it("does not replay a lost write response", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(performToolcodeDailyCheckIn(request)).rejects.toMatchObject({
      message: "Failed to fetch",
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })
})
