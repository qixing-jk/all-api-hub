import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  fetchDaiguaDailyCheckInStatus,
  performDaiguaDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/daiguaCheckIn"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))
vi.mock(
  "~/services/apiService/sub2api/auth/browserAuth",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/browserAuth")
    >()),
    recoverSub2ApiBrowserAuth: vi.fn(),
  }),
)
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: vi.fn(),
  }),
)

const request = {
  baseUrl: "https://api.daigua.icu",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}
const status = {
  enabled: true,
  luck_enabled: true,
  can_checkin: true,
  min_reward: 0.1,
  max_reward: 0.6,
  streak_days: 1,
  balance: 1.27,
}
const response = (data: unknown) => ({
  ok: true,
  status: 200,
  headers: {},
  body: { code: 0, message: "success", data },
})

describe("DaiGua ordinary daily check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("reads the native timezone status without submitting a claim", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(status))
    await expect(fetchDaiguaDailyCheckInStatus(request)).resolves.toEqual({
      enabled: true,
      checkedInToday: false,
    })
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {
        endpoint: `/api/v1/checkin/status?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
        options: { method: "GET", cache: "no-store" },
      },
    )
  })

  it.each([
    [
      { can_checkin: false, today_reward: 0.25, today_checkin_type: "normal" },
      true,
      true,
    ],
    [
      { can_checkin: false, today_reward: -0.1, today_checkin_type: "luck" },
      true,
      true,
    ],
    [
      { can_checkin: false, unavailable_reason: "admin_disabled" },
      false,
      false,
    ],
    [{ enabled: false, can_checkin: true }, false, false],
    [{ enabled: false, luck_enabled: false, can_checkin: false }, false, false],
  ])(
    "keeps ordinary enablement, completion and administrator blocking distinct (%j)",
    async (fields, enabled, checkedInToday) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        response({ ...status, ...fields }),
      )
      await expect(fetchDaiguaDailyCheckInStatus(request)).resolves.toEqual({
        enabled,
        checkedInToday,
      })
    },
  )

  it("rejects an unknown eligibility restriction instead of reporting completion", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({
        ...status,
        can_checkin: false,
        unavailable_reason: "other_restriction",
      }),
    )
    await expect(fetchDaiguaDailyCheckInStatus(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })

  it("submits only an ordinary claim and reads its authoritative USD reward", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({ reward_amount: 0.25, checkin_type: "normal", streak_days: 2 }),
    )
    await expect(performDaiguaDailyCheckIn(request)).resolves.toEqual({
      rewardAmount: 0.25,
    })
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {
        endpoint: "/api/v1/checkin",
        options: { method: "POST", cache: "no-store", body: "{}" },
      },
    )
  })

  it.each([
    { reward_amount: -0.1, checkin_type: "normal" },
    { reward_amount: Number.NaN, checkin_type: "normal" },
    { reward_amount: Number.POSITIVE_INFINITY, checkin_type: "normal" },
    { reward_amount: "0.29", checkin_type: "normal" },
    { reward_amount: 0.29, checkin_type: "luck" },
    { checkin_type: "normal" },
  ])(
    "does not invent a reward from an invalid ordinary grant (%j)",
    async (data) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(response(data))
      await expect(performDaiguaDailyCheckIn(request)).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    },
  )

  it.each([401, 403, 429, 500])(
    "preserves HTTP %s and submits only once",
    async (httpStatus) => {
      vi.mocked(fetchApiResponse).mockResolvedValue({
        ...response(null),
        ok: false,
        status: httpStatus,
      })
      await expect(performDaiguaDailyCheckIn(request)).rejects.toMatchObject({
        statusCode: httpStatus,
      })
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    {},
    { ...status, can_checkin: "false" },
    { enabled: true, checked_in_today: false },
    { ...status, enabled: 1 },
  ])("rejects malformed or foreign status (%j)", async (data) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(data))
    await expect(fetchDaiguaDailyCheckInStatus(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })

  it("rejects a malformed envelope instead of treating it as a business rejection", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ...response(status),
      body: { code: "0", message: "success", data: status },
    })
    await expect(fetchDaiguaDailyCheckInStatus(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })

  it("does not recover or refresh credentials during passive discovery", async () => {
    await expect(
      fetchDaiguaDailyCheckInStatus({
        ...request,
        auth: { ...request.auth, accessToken: "" },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(fetchApiResponse).not.toHaveBeenCalled()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ...response(null),
      ok: false,
      status: 401,
    })
    await expect(fetchDaiguaDailyCheckInStatus(request)).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
  })
})
